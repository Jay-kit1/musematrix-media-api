const http = require("http");
const https = require("https");
const fs = require("fs");
const path = require("path");
const dns = require("dns").promises;
const net = require("net");
const { execFile } = require("child_process");


const publicDir = path.join(__dirname, "public");
const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || "127.0.0.1";
const maxJsonBodySize = 1024 * 32;
const maxMetadataBytes = 1024 * 256;
const maxRemoteJsonBytes = 1024 * 1024 * 2;
const maxDownloadBytes = 1024 * 1024 * 250;
const extractorTimeoutMs = Number(process.env.EXTRACTOR_TIMEOUT_MS || 45000);
const downloadTimeoutMs = Number(process.env.DOWNLOAD_TIMEOUT_MS || 30000);
const corsOrigin = process.env.CORS_ORIGIN || "*";
const browserUserAgent = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36";

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon"
};

function sendJson(res, status, payload) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  res.end(JSON.stringify(payload));
}

function sendText(res, status, message) {
  res.writeHead(status, {
    "Content-Type": "text/plain; charset=utf-8",
    "Cache-Control": "no-store"
  });
  res.end(message);
}

function applyCors(req, res) {
  const origin = req.headers.origin || "";
  const allowedOrigins = corsOrigin.split(",").map((value) => value.trim()).filter(Boolean);
  const allowOrigin = corsOrigin === "*"
    ? "*"
    : (allowedOrigins.includes(origin) ? origin : allowedOrigins[0] || "");

  if (allowOrigin) {
    res.setHeader("Access-Control-Allow-Origin", allowOrigin);
  }
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Expose-Headers", "Content-Disposition,Content-Type");
  res.setHeader("Vary", "Origin");
}

function parseHttpUrl(rawUrl) {
  if (typeof rawUrl !== "string") {
    throw new Error("URL 必须是字符串");
  }

  const urlMatch = rawUrl.match(/https?:\/\/[^\s，。"'<>]+/i);
  const trimmed = (urlMatch ? urlMatch[0] : rawUrl)
    .trim()
    .replace(/[),，。；;！!？?]+$/u, "");
  if (!trimmed || trimmed.length > 2048) {
    throw new Error("URL 为空或过长");
  }

  const parsed = new URL(trimmed);
  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error("仅支持 http 或 https 链接");
  }

  parsed.hash = "";
  return parsed;
}

function isPrivateIp(address) {
  if (!address) return true;
  if (net.isIP(address) === 4) {
    const parts = address.split(".").map(Number);
    return (
      parts[0] === 10 ||
      parts[0] === 127 ||
      (parts[0] === 169 && parts[1] === 254) ||
      (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
      (parts[0] === 192 && parts[1] === 168) ||
      parts[0] === 0
    );
  }

  if (net.isIP(address) === 6) {
    const normalized = address.toLowerCase();
    return normalized === "::1" || normalized.startsWith("fc") || normalized.startsWith("fd") || normalized.startsWith("fe80:");
  }

  return true;
}

async function assertPublicUrl(parsed) {
  const hostname = parsed.hostname.toLowerCase();
  if (hostname === "localhost" || hostname.endsWith(".localhost")) {
    throw new Error("不允许代理本机地址");
  }

  if (net.isIP(hostname)) {
    if (isPrivateIp(hostname)) throw new Error("不允许代理内网地址");
    return;
  }

  const records = await dns.lookup(hostname, { all: true });
  if (!records.length || records.some((record) => isPrivateIp(record.address))) {
    throw new Error("不允许代理内网地址");
  }
}

function isSameOrSubdomain(host, domain) {
  return host === domain || host.endsWith(`.${domain}`);
}

function getExtension(pathname) {
  const ext = path.extname(pathname || "").replace(".", "").toLowerCase();
  return ext;
}

function getMediaKind(ext) {
  const image = new Set(["jpg", "jpeg", "png", "webp", "gif", "avif"]);
  const audio = new Set(["mp3", "m4a", "wav", "aac", "ogg", "flac"]);
  const video = new Set(["mp4", "webm", "mov", "m4v", "mkv"]);

  if (image.has(ext)) return "图片";
  if (audio.has(ext)) return "音频";
  if (video.has(ext)) return "视频";
  return "网页";
}

function findExecutable(name, extraPath) {
  const candidates = [];
  if (extraPath) candidates.push(extraPath);
  candidates.push(path.join(__dirname, ".venv", "bin", name));
  if (process.env.HOME) candidates.push(path.join(process.env.HOME, ".local", "bin", name));
  candidates.push(path.join("/opt", "render", ".local", "bin", name));
  const pathParts = (process.env.PATH || "").split(path.delimiter);
  for (const part of pathParts) {
    if (part) candidates.push(path.join(part, name));
  }

  return candidates.find((candidate) => {
    try {
      fs.accessSync(candidate, fs.constants.X_OK);
      return true;
    } catch {
      return false;
    }
  }) || "";
}

function getYtDlpPath() {
  return findExecutable("yt-dlp", process.env.YTDLP_PATH);
}

function getCookieFilePath() {
  const candidates = [
    process.env.YTDLP_COOKIES,
    path.join(__dirname, ".cookies.txt"),
    path.join(__dirname, "cookies.txt")
  ].filter(Boolean);

  return candidates.find((candidate) => {
    try {
      fs.accessSync(candidate, fs.constants.R_OK);
      return true;
    } catch {
      return false;
    }
  }) || "";
}

function getProxyHeadersForHost(hostname) {
  const host = hostname.toLowerCase();
  const headers = {
    "User-Agent": browserUserAgent,
    "Accept": "*/*"
  };

  if (host.includes("bilivideo.com") || host.includes("hdslb.com")) {
    headers["Referer"] = "https://www.bilibili.com/";
    headers["Origin"] = "https://www.bilibili.com";
  } else if (host.includes("tiktok") || host.includes("muscdn.com")) {
    headers["Referer"] = "https://www.tiktok.com/";
    headers["Origin"] = "https://www.tiktok.com";
  } else if (
    host.includes("douyin") ||
    host.includes("amemv.com") ||
    host.includes("365yg.com") ||
    host.includes("douyinvod.com") ||
    host.includes("pstatp.com") ||
    host.includes("byteoversea.com") ||
    host.includes("bytedance") ||
    host.includes("bytecdn") ||
    host.includes("snssdk.com") ||
    host.includes("ixigua.com") ||
    host.includes("zjcdn.com") ||
    host.includes("idouyinvod.com") ||
    host.includes("volcsirius") ||
    host.includes("dyvideotape.com")
  ) {
    headers["Referer"] = "https://www.douyin.com/";
    headers["Origin"] = "https://www.douyin.com";
  } else if (host.includes("googlevideo.com") || host.includes("ytimg.com")) {
    headers["Referer"] = "https://www.youtube.com/";
    headers["Origin"] = "https://www.youtube.com";
  }

  return headers;
}

function explainExtractorError(errorText) {
  const text = String(errorText || "");
  if (!text) return "";
  if (/Fresh cookies|cookies are needed|login|sign in|not logged in/i.test(text)) {
    return "该链接需要 Cookie 或登录态。可在项目根目录放置 .cookies.txt 后重试。";
  }
  if (/Video unavailable|deleted|geo-restricted|region|not available/i.test(text)) {
    return "该视频不可用、已删除或存在地区限制。";
  }
  if (/HTTP Error 412|Precondition Failed|forbidden|403/i.test(text)) {
    return "目标平台触发风控或请求条件限制。可以尝试 Cookie、换网络或稍后再试。";
  }
  if (/timeout|timed out|ETIMEDOUT|ECONNRESET|ENOTFOUND/i.test(text)) {
    return "目标站请求超时或网络连接不稳定。";
  }
  return "提取器没有拿到可用媒体，可能是平台风控、私密内容或链接已失效。";
}

function requestUrl(targetUrl, options = {}) {
  const parsed = parseHttpUrl(targetUrl);
  const limit = options.limit || maxMetadataBytes;
  const timeout = options.timeout || 10000;
  const method = options.method || "GET";
  const redirectCount = options.redirectCount || 0;
  const headers = {
    "User-Agent": browserUserAgent,
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    ...(options.headers || {})
  };

  return new Promise((resolve, reject) => {
    const client = parsed.protocol === "https:" ? https : http;
    const req = client.request(parsed, {
      method,
      timeout,
      headers
    }, (remoteRes) => {
      const location = remoteRes.headers.location;
      if ([301, 302, 303, 307, 308].includes(remoteRes.statusCode) && location && redirectCount < 4) {
        remoteRes.resume();
        const nextUrl = new URL(location, parsed).toString();
        requestUrl(nextUrl, { ...options, redirectCount: redirectCount + 1 }).then(resolve, reject);
        return;
      }

      if (method === "HEAD") {
        remoteRes.resume();
        resolve({
          finalUrl: parsed.toString(),
          statusCode: remoteRes.statusCode,
          headers: remoteRes.headers,
          body: ""
        });
        return;
      }

      const chunks = [];
      let received = 0;
      remoteRes.on("data", (chunk) => {
        received += chunk.length;
        if (received <= limit) {
          chunks.push(chunk);
        } else {
          remoteRes.destroy();
        }
      });
      remoteRes.on("end", () => {
        resolve({
          finalUrl: parsed.toString(),
          statusCode: remoteRes.statusCode,
          headers: remoteRes.headers,
          body: Buffer.concat(chunks).toString("utf8")
        });
      });
      remoteRes.on("error", reject);
    });

    req.on("timeout", () => req.destroy(new Error("请求目标网站超时")));
    req.on("error", reject);
    req.end();
  });
}

function pickMeta(html, patterns) {
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match && match[1]) {
      return decodeHtml(match[1].trim());
    }
  }
  return "";
}

function decodeHtml(value) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&#39;/g, "'");
}

function absoluteUrl(value, baseUrl) {
  if (!value) return "";
  try {
    const resolved = new URL(value, baseUrl);
    return ["http:", "https:"].includes(resolved.protocol) ? resolved.toString() : "";
  } catch {
    return "";
  }
}

async function fetchPageDetails(cleanUrl) {
  try {
    const response = await requestUrl(cleanUrl);
    const contentType = String(response.headers["content-type"] || "");
    const html = response.body || "";

    if (!contentType.includes("html") || !html) {
      return { contentType };
    }

    const title = pickMeta(html, [
      /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["'][^>]*>/i,
      /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:title["'][^>]*>/i,
      /<title[^>]*>([\s\S]*?)<\/title>/i
    ]);
    const description = pickMeta(html, [
      /<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["'][^>]*>/i,
      /<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["'][^>]*>/i,
      /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']description["'][^>]*>/i
    ]);
    const image = pickMeta(html, [
      /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["'][^>]*>/i,
      /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["'][^>]*>/i
    ]);
    const favicon = pickMeta(html, [
      /<link[^>]+rel=["'][^"']*icon[^"']*["'][^>]+href=["']([^"']+)["'][^>]*>/i,
      /<link[^>]+href=["']([^"']+)["'][^>]+rel=["'][^"']*icon[^"']*["'][^>]*>/i
    ]);

    return {
      contentType,
      title,
      description,
      thumbnail: absoluteUrl(image, response.finalUrl || cleanUrl),
      favicon: absoluteUrl(favicon, response.finalUrl || cleanUrl)
    };
  } catch (err) {
    return { error: err.message };
  }
}

function runYtDlp(cleanUrl) {
  const ytdlp = getYtDlpPath();
  if (!ytdlp) {
    return Promise.resolve(null);
  }

  const cookieFile = getCookieFilePath();
  const args = [
    "--dump-single-json",
    "--no-playlist",
    "--no-warnings",
    "--skip-download",
    "--retries", "2",
    "--extractor-retries", "2",
    "--socket-timeout", "20",
    "--user-agent", browserUserAgent,
    cleanUrl
  ];
  if (cookieFile) {
    args.splice(args.length - 1, 0, "--cookies", cookieFile);
  }
  if (process.env.YTDLP_COOKIES_FROM_BROWSER) {
    args.splice(args.length - 1, 0, "--cookies-from-browser", process.env.YTDLP_COOKIES_FROM_BROWSER);
  }

  return new Promise((resolve) => {
    execFile(ytdlp, args, {
      timeout: extractorTimeoutMs,
      maxBuffer: 1024 * 1024 * 12
    }, (err, stdout) => {
      if (err || !stdout) {
        resolve({
          error: err ? err.message : "提取器没有返回内容",
          extractor: "yt-dlp"
        });
        return;
      }

      try {
        resolve(JSON.parse(stdout));
      } catch (parseErr) {
        resolve({
          error: parseErr.message,
          extractor: "yt-dlp"
        });
      }
    });
  });
}

function extractBilibiliId(cleanUrl) {
  const parsed = parseHttpUrl(cleanUrl);
  const bvidMatch = parsed.pathname.match(/\/video\/(BV[a-zA-Z0-9]+)/);
  if (bvidMatch) return { bvid: bvidMatch[1] };
  const aidMatch = parsed.pathname.match(/\/video\/av(\d+)/i);
  if (aidMatch) return { aid: aidMatch[1] };
  return null;
}

function extractDouyinAwemeId(cleanUrl, extractorInfo = {}) {
  if (extractorInfo && /^\d{10,}$/.test(String(extractorInfo.id || ""))) {
    return String(extractorInfo.id);
  }

  const candidates = [cleanUrl, extractorInfo && extractorInfo.webpage_url].filter(Boolean);
  for (const candidate of candidates) {
    try {
      const parsed = parseHttpUrl(candidate);
      const match = parsed.pathname.match(/\/(?:video|note|share\/video)\/(\d{10,})/);
      if (match) return match[1];
    } catch {
      // Ignore non-URL values and continue with the next candidate.
    }
  }

  return "";
}

async function fetchJson(targetUrl, headers = {}) {
  const response = await requestUrl(targetUrl, {
    limit: maxRemoteJsonBytes,
    headers: {
      "Accept": "application/json,text/plain,*/*",
      ...headers
    }
  });
  return JSON.parse(response.body || "{}");
}

function firstUrlFromUrlList(resource) {
  if (!resource) return "";
  if (typeof resource === "string") {
    return /^https?:\/\//.test(resource) ? resource : "";
  }
  if (Array.isArray(resource.url_list)) {
    const url = resource.url_list.find((value) => typeof value === "string" && /^https?:\/\//.test(value));
    if (url) return url;
  }
  if (typeof resource.uri === "string" && /^https?:\/\//.test(resource.uri)) {
    return resource.uri;
  }
  return "";
}

function buildDouyinMusicItem(detail, referer) {
  const music = detail && detail.aweme_detail && detail.aweme_detail.music;
  const audioUrl = firstUrlFromUrlList(music && music.play_url);
  if (!audioUrl) return null;

  const title = music.title || music.author || "抖音原声音频";
  return {
    label: `MP3 音频 ${title}`.trim(),
    quality: "Original Sound",
    type: "音频",
    action: "open",
    url: audioUrl,
    ext: "mp3",
    size: 0,
    formatId: music.mid || music.id_str || "",
    codec: "mp3",
    headers: {
      "User-Agent": browserUserAgent,
      "Referer": referer || "https://www.douyin.com/",
      "Origin": "https://www.douyin.com"
    }
  };
}

async function extractDouyinMusic(cleanUrl, extractorInfo = {}) {
  const awemeId = extractDouyinAwemeId(cleanUrl, extractorInfo);
  if (!awemeId) return null;

  const referer = `https://www.douyin.com/video/${awemeId}`;
  const detailUrl = `https://www.douyin.com/aweme/v1/web/aweme/detail/?aweme_id=${encodeURIComponent(awemeId)}&aid=6383&device_platform=webapp&channel=channel_pc_web`;
  const detail = await fetchJson(detailUrl, {
    "User-Agent": browserUserAgent,
    "Referer": referer,
    "Accept": "application/json,text/plain,*/*"
  });

  if (detail.status_code !== 0 || !detail.aweme_detail) {
    return null;
  }

  return buildDouyinMusicItem(detail, referer);
}

async function addPlatformExtraItems(result, cleanUrl, platform, extractorInfo = {}) {
  if (!result || !Array.isArray(result.items)) return result;

  if (platform.name === "抖音 / TikTok" && !result.items.some((item) => item.type === "音频")) {
    const musicItem = await extractDouyinMusic(cleanUrl, extractorInfo).catch(() => null);
    if (musicItem) {
      const items = [...result.items];
      const insertIndex = items[0] && items[0].type === "图片" ? 1 : 0;
      items.splice(insertIndex, 0, musicItem);
      return {
        ...result,
        note: "已提取视频资源，并补充了抖音原声音频 MP3。请只处理你有权使用或平台允许保存的内容。",
        sourceDetail: {
          ...result.sourceDetail,
          douyinAudioExtractor: "douyin-web-detail"
        },
        items
      };
    }
  }

  return result;
}

async function extractBilibili(cleanUrl, platform, sourceDetail) {
  const ids = extractBilibiliId(cleanUrl);
  if (!ids) return null;

  const idQuery = ids.bvid ? `bvid=${encodeURIComponent(ids.bvid)}` : `aid=${encodeURIComponent(ids.aid)}`;
  const referer = ids.bvid
    ? `https://www.bilibili.com/video/${ids.bvid}`
    : "https://www.bilibili.com/";
  const commonHeaders = {
    "User-Agent": browserUserAgent,
    "Referer": referer
  };

  const view = await fetchJson(`https://api.bilibili.com/x/web-interface/view?${idQuery}`, commonHeaders);
  if (view.code !== 0 || !view.data || !view.data.cid) {
    return {
      error: view.message || "无法读取 B 站视频详情",
      extractor: "bilibili-api"
    };
  }

  const cid = view.data.cid;
  const playUrl = `https://api.bilibili.com/x/player/playurl?${idQuery}&cid=${encodeURIComponent(cid)}&qn=80&fnval=4048&fourk=1`;
  const play = await fetchJson(playUrl, commonHeaders);
  if (play.code !== 0 || !play.data) {
    return {
      error: play.message || "无法读取 B 站播放地址",
      extractor: "bilibili-api"
    };
  }

  const dash = play.data.dash || {};
  const seen = new Set();
  const pickUrl = (entry) => entry.baseUrl || entry.base_url || (Array.isArray(entry.backupUrl) ? entry.backupUrl[0] : "") || "";
  const videoItems = Array.isArray(dash.video) ? dash.video : [];
  const audioItems = Array.isArray(dash.audio) ? dash.audio : [];
  const items = [];
  const pushMedia = (entry, label, type) => {
    const mediaUrl = pickUrl(entry);
    if (!mediaUrl || seen.has(mediaUrl)) return;
    seen.add(mediaUrl);
    const height = entry.height ? `${entry.height}p` : "";
    const quality = height || String(entry.id || entry.bandwidth || "media");
    items.push({
      label,
      quality,
      type,
      action: "open",
      url: mediaUrl,
      ext: entry.mimeType && entry.mimeType.includes("mp4") ? "mp4" : "",
      size: Number(entry.bandwidth || 0),
      formatId: String(entry.id || ""),
      codec: entry.codecs || "",
      headers: commonHeaders
    });
  };

  const bestMp4Video = videoItems
    .filter((entry) => String(entry.mimeType || "").includes("mp4"))
    .sort((a, b) => (b.height || 0) - (a.height || 0) || (b.bandwidth || 0) - (a.bandwidth || 0))[0];
  const bestAudio = audioItems
    .sort((a, b) => (b.bandwidth || 0) - (a.bandwidth || 0))[0];

  pushMedia(bestMp4Video, bestMp4Video ? `仅视频 MP4 ${bestMp4Video.height || ""}p` : "仅视频 MP4", "视频");
  pushMedia(bestAudio, "仅音频 M4A", "音频");

  videoItems
    .filter((entry) => entry !== bestMp4Video)
    .sort((a, b) => (b.height || 0) - (a.height || 0) || (b.bandwidth || 0) - (a.bandwidth || 0))
    .slice(0, 5)
    .forEach((entry) => pushMedia(entry, `仅视频 ${entry.height || ""}p`, "视频"));
  audioItems
    .filter((entry) => entry !== bestAudio)
    .sort((a, b) => (b.bandwidth || 0) - (a.bandwidth || 0))
    .slice(0, 3)
    .forEach((entry) => pushMedia(entry, "仅音频 M4A", "音频"));

  if (view.data.pic) {
    items.unshift({
      label: "封面图片",
      quality: "Cover",
      type: "图片",
      action: "open",
      url: view.data.pic.replace(/^http:\/\//, "https://")
    });
  }

  if (!items.some((item) => item.type === "视频") || !items.some((item) => item.type === "音频")) {
    return {
      error: "B 站接口未返回可用音频或视频轨",
      extractor: "bilibili-api"
    };
  }

  return {
    url: cleanUrl,
    platform,
    title: `${view.data.title || platform.name} · 媒体已提取`,
    note: "已通过 B 站公开播放信息提取视频轨和音频轨。DASH 资源通常是音视频分离的，前端可分别保存或后续用 ffmpeg 合并。",
    sourceDetail: {
      ...sourceDetail,
      extractor: "bilibili-api",
      title: view.data.title || "",
      author: view.data.owner && view.data.owner.name ? view.data.owner.name : "",
      duration: view.data.duration || 0,
      thumbnail: view.data.pic ? view.data.pic.replace(/^http:\/\//, "https://") : "",
      cid,
      bvid: view.data.bvid || ids.bvid || "",
      aid: view.data.aid || ids.aid || ""
    },
    items
  };
}

async function proxyRemoteFile(targetUrl, filename, res, redirectCount = 0) {
  const parsed = parseHttpUrl(targetUrl);
  await assertPublicUrl(parsed);

  const client = parsed.protocol === "https:" ? https : http;
  let completed = false;
  const finishWithError = (status, message) => {
    if (completed) return;
    completed = true;
    if (!res.headersSent) {
      sendText(res, status, message);
    } else {
      res.end();
    }
  };
  const requestHeaders = getProxyHeadersForHost(parsed.hostname);

  const req = client.get(parsed, {
    timeout: downloadTimeoutMs,
    headers: requestHeaders
  }, async (remoteRes) => {
    const location = remoteRes.headers.location;
    if ([301, 302, 303, 307, 308].includes(remoteRes.statusCode) && location && redirectCount < 4) {
      remoteRes.resume();
      try {
        await proxyRemoteFile(new URL(location, parsed).toString(), filename, res, redirectCount + 1);
      } catch (err) {
        finishWithError(400, err.message);
      }
      return;
    }

    if (remoteRes.statusCode < 200 || remoteRes.statusCode >= 300) {
      remoteRes.resume();
      finishWithError(502, `目标资源响应异常：${remoteRes.statusCode}`);
      return;
    }

    const contentLength = Number(remoteRes.headers["content-length"] || 0);
    if (contentLength > maxDownloadBytes) {
      remoteRes.resume();
      finishWithError(413, "目标资源过大，已停止代理。");
      return;
    }

    const safeName = String(filename || path.basename(parsed.pathname) || "resource")
      .replace(/[^\w.\-\u4e00-\u9fa5]+/g, "_")
      .slice(0, 120) || "resource";
    const contentType = remoteRes.headers["content-type"] || "application/octet-stream";
    let streamed = 0;

    res.writeHead(200, {
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(safeName)}`,
      "Content-Type": contentType,
      "Cache-Control": "no-store"
    });

    remoteRes.on("data", (chunk) => {
      if (completed) return;
      streamed += chunk.length;
      if (streamed > maxDownloadBytes) {
        remoteRes.destroy();
        finishWithError(413, "目标资源过大，已停止代理。");
        return;
      }
      res.write(chunk);
    });
    remoteRes.on("end", () => {
      if (completed) return;
      completed = true;
      res.end();
    });
    remoteRes.on("error", (err) => finishWithError(502, `目标资源读取失败：${err.message}`));
  });

  req.on("timeout", () => req.destroy(new Error("目标资源请求超时")));
  req.on("error", (err) => {
    finishWithError(502, `目标资源请求失败：${err.message}`);
  });
}

function normalizeExtractorResults(info, cleanUrl, platform, sourceDetail) {
  if (!info || info.error) {
    return null;
  }

  const formats = [
    ...(Array.isArray(info.formats) ? info.formats : []),
    ...(Array.isArray(info.requested_downloads) ? info.requested_downloads : [])
  ];
  if (info.url && /^https?:\/\//.test(info.url)) {
    formats.push({
      format_id: info.format_id || "selected",
      url: info.url,
      ext: info.ext || "",
      vcodec: info.vcodec || "",
      acodec: info.acodec || "",
      format_note: info.format_note || info.resolution || "selected",
      resolution: info.resolution || "",
      height: info.height || 0,
      filesize: info.filesize || info.filesize_approx || 0
    });
  }
  const seen = new Set();
  const usableFormats = formats
    .filter((format) => format && typeof format.url === "string" && /^https?:\/\//.test(format.url))
    .filter((format) => {
      const key = `${format.url}|${format.format_id || ""}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

  const hasVideo = (format) => format.vcodec && format.vcodec !== "none";
  const hasAudio = (format) => format.acodec && format.acodec !== "none";
  const scoreFormat = (format) => {
    const sizeScore = Math.min(Number(format.filesize || format.filesize_approx || 0) / 1000000, 200);
    return (format.height || 0) * 10 + (format.tbr || format.vbr || format.abr || 0) + sizeScore;
  };
  const sortBest = (list) => list.sort((a, b) => scoreFormat(b) - scoreFormat(a));
  const selected = [];
  const pushFormat = (format, labelPrefix, type) => {
    if (!format || selected.some((item) => item.url === format.url)) return;
    const quality = format.format_note || format.resolution || (format.height ? `${format.height}p` : format.ext || "media");
    selected.push({
      label: `${labelPrefix} ${quality}`.trim(),
      quality,
      type,
      action: "open",
      url: format.url,
      ext: format.ext || "",
      size: format.filesize || format.filesize_approx || 0,
      formatId: format.format_id || "",
      codec: [format.vcodec, format.acodec].filter(Boolean).join(" / "),
      headers: format.http_headers || undefined
    });
  };

  const muxedMp4 = sortBest(usableFormats.filter((format) => format.ext === "mp4" && hasVideo(format) && hasAudio(format)))[0];
  const videoOnlyMp4 = sortBest(usableFormats.filter((format) => format.ext === "mp4" && hasVideo(format) && !hasAudio(format)))[0];
  const audioOnly = sortBest(usableFormats.filter((format) => hasAudio(format) && !hasVideo(format)))[0];
  const audioOnlyPreferred = sortBest(usableFormats.filter((format) => ["mp3", "m4a", "aac"].includes(format.ext) && hasAudio(format) && !hasVideo(format)))[0] || audioOnly;
  const fallbackVideos = sortBest(usableFormats.filter((format) => hasVideo(format))).slice(0, 6);
  const fallbackAudio = sortBest(usableFormats.filter((format) => hasAudio(format) && !hasVideo(format))).slice(0, 4);

  pushFormat(muxedMp4, "MP4 视频", "视频");
  pushFormat(videoOnlyMp4, "仅视频 MP4", "视频");
  pushFormat(audioOnlyPreferred, audioOnlyPreferred && audioOnlyPreferred.ext === "mp3" ? "MP3 音频" : "仅音频", "音频");
  fallbackVideos.forEach((format) => pushFormat(format, hasAudio(format) ? "视频" : "仅视频", "视频"));
  fallbackAudio.forEach((format) => pushFormat(format, format.ext === "mp3" ? "MP3 音频" : "仅音频", "音频"));

  const items = selected.slice(0, 12);

  if (info.thumbnail && /^https?:\/\//.test(info.thumbnail)) {
    items.unshift({
      label: "封面图片",
      quality: "Thumbnail",
      type: "图片",
      action: "open",
      url: info.thumbnail
    });
  }

  if (!items.length && info.url && /^https?:\/\//.test(info.url)) {
    const kind = getMediaKind(info.ext || "");
    items.push({
      label: kind === "网页" ? "提取到的媒体资源" : `${kind}资源`,
      quality: info.ext || "media",
      type: kind === "网页" ? "资源" : kind,
      action: "open",
      url: info.url,
      ext: info.ext || ""
    });
  }

  if (!items.length) {
    return null;
  }

  return {
    url: cleanUrl,
    platform,
    title: info.title ? `${info.title} · 媒体已提取` : `${platform.name} 媒体已提取`,
    note: "已通过本机提取器生成媒体资源列表。请只处理你有权使用或平台允许保存的内容。",
    sourceDetail: {
      ...sourceDetail,
      extractor: "yt-dlp",
      title: info.title || "",
      author: info.uploader || info.channel || "",
      duration: info.duration || 0,
      thumbnail: info.thumbnail || "",
      cookieConfigured: Boolean(getCookieFilePath() || process.env.YTDLP_COOKIES_FROM_BROWSER)
    },
    items
  };
}

function detectPlatform(rawUrl) {
  let parsed;
  try {
    parsed = parseHttpUrl(rawUrl);
  } catch {
    return { name: "未知平台", host: "", icon: "?" };
  }

  const host = parsed.hostname.replace(/^www\./, "");
  const platforms = [
    ["抖音 / TikTok", ["douyin.com", "tiktok.com"], "♪"],
    ["YouTube", ["youtube.com", "youtu.be"], "▶"],
    ["哔哩哔哩", ["bilibili.com", "b23.tv"], "B"],
    ["X / Twitter", ["x.com", "twitter.com"], "X"],
    ["Pinterest", ["pinterest.com", "pin.it"], "P"],
    ["Facebook", ["facebook.com", "fb.watch"], "f"],
    ["Instagram", ["instagram.com"], "◎"],
    ["Reddit", ["reddit.com"], "R"],
    ["Vimeo", ["vimeo.com"], "V"],
    ["直接媒体链接", ["mp4", "webm", "mov", "m4v", "mkv", "mp3", "m4a", "wav", "aac", "ogg", "flac", "jpg", "jpeg", "png", "webp", "gif", "avif"], "↗"]
  ];

  const pathname = parsed.pathname.toLowerCase();
  const direct = platforms.at(-1);
  const extension = getExtension(pathname);
  if (direct[1].includes(extension)) {
    return {
      name: direct[0],
      host,
      icon: direct[2],
      direct: true,
      kind: getMediaKind(extension),
      extension
    };
  }

  const match = platforms.find(([, domains]) => domains.some((domain) => isSameOrSubdomain(host, domain)));
  return match ? { name: match[0], host, icon: match[2] } : { name: "通用网页", host, icon: "↗" };
}

async function buildResults(rawUrl) {
  const parsed = parseHttpUrl(rawUrl);
  const platform = detectPlatform(rawUrl);
  const ext = platform.extension || getExtension(parsed.pathname);
  const directKind = platform.kind || getMediaKind(ext);
  const cleanUrl = parsed.toString();
  const hostLabel = platform.host || parsed.hostname.replace(/^www\./, "");
  const sourceDetail = {
    url: cleanUrl,
    host: hostLabel,
    protocol: parsed.protocol.replace(":", ""),
    pathname: parsed.pathname || "/",
    mediaKind: directKind,
    extension: ext || "",
    isDirectMedia: Boolean(platform.direct),
    detectedAt: new Date().toISOString()
  };

  if (platform.direct) {
    const head = await requestUrl(cleanUrl, { method: "HEAD" }).catch(() => null);
    const contentType = head ? String(head.headers["content-type"] || "") : "";
    const contentLength = head ? Number(head.headers["content-length"] || 0) : 0;
    return {
      url: cleanUrl,
      platform,
      title: `${directKind}资源已整理`,
      note: "这是一个直接资源链接，后端已完成来源、类型和格式识别。",
      sourceDetail: {
        ...sourceDetail,
        contentType,
        contentLength
      },
      items: [
        {
          label: `${directKind}原始资源`,
          quality: "Original",
          type: directKind,
          action: "open",
          url: cleanUrl
        }
      ]
    };
  }

  let platformExtractorError = "";
  if (platform.name === "哔哩哔哩") {
    const bilibiliResult = await extractBilibili(cleanUrl, platform, sourceDetail).catch((err) => ({
      error: err.message,
      extractor: "bilibili-api"
    }));
    if (bilibiliResult && !bilibiliResult.error) {
      return bilibiliResult;
    }
    platformExtractorError = bilibiliResult && bilibiliResult.error ? bilibiliResult.error : "";
  }

  const extractorInfo = await runYtDlp(cleanUrl);
  const extracted = normalizeExtractorResults(extractorInfo, cleanUrl, platform, sourceDetail);
  if (extracted) {
    return addPlatformExtraItems(extracted, cleanUrl, platform, extractorInfo || {});
  }

  const pageDetails = await fetchPageDetails(cleanUrl);
  const detailItems = [
    {
      label: "原始链接",
      quality: "Source",
      type: "链接",
      action: "open",
      url: cleanUrl
    },
    {
      label: "来源域名",
      quality: hostLabel,
      type: "来源详情",
      action: "inspect",
      url: cleanUrl
    }
  ];

  if (pageDetails.thumbnail) {
    detailItems.push({
      label: "页面封面",
      quality: "OpenGraph",
      type: "图片",
      action: "open",
      url: pageDetails.thumbnail
    });
  }

  const rawExtractorError = platformExtractorError || (extractorInfo && extractorInfo.error ? extractorInfo.error : "");
  const friendlyExtractorError = explainExtractorError(rawExtractorError);

  return {
    url: cleanUrl,
    platform,
    title: pageDetails.title || `${platform.name} 链接详情已识别`,
    note: pageDetails.description || friendlyExtractorError || (getYtDlpPath()
      ? "已完成来源识别和网页详情读取，但当前链接没有返回可用媒体格式。"
      : "已完成来源识别和网页详情读取。若要提取多平台真实媒体，请在服务器安装 yt-dlp 或设置 YTDLP_PATH。"),
    sourceDetail: {
      ...sourceDetail,
      extractor: getYtDlpPath() ? "yt-dlp-failed-or-empty" : "not-configured",
      extractorError: rawExtractorError,
      extractorHint: friendlyExtractorError,
      cookieConfigured: Boolean(getCookieFilePath() || process.env.YTDLP_COOKIES_FROM_BROWSER),
      contentType: pageDetails.contentType || "",
      title: pageDetails.title || "",
      description: pageDetails.description || "",
      thumbnail: pageDetails.thumbnail || "",
      favicon: pageDetails.favicon || "",
      metadataError: pageDetails.error || ""
    },
    items: detailItems
  };
}

const server = http.createServer((req, res) => {
  let parsedReqUrl;
  try {
    parsedReqUrl = new URL(req.url || "/", `http://${host}:${port}`);
  } catch {
    sendText(res, 400, "Bad request");
    return;
  }

  if (parsedReqUrl.pathname.startsWith("/api/")) {
    applyCors(req, res);
    if (req.method === "OPTIONS") {
      res.writeHead(204, { "Cache-Control": "no-store" });
      res.end();
      return;
    }
  }

  if (req.method === "GET" && parsedReqUrl.pathname === "/api/download") {
    const targetUrl = parsedReqUrl.searchParams.get("url");
    const filename = parsedReqUrl.searchParams.get("filename") || "resource";
    if (!targetUrl) {
      sendText(res, 400, "缺少资源 URL 参数");
      return;
    }

    proxyRemoteFile(targetUrl, filename, res).catch((err) => {
      if (!res.headersSent) {
        sendText(res, 400, err.message || "资源代理失败");
      }
    });
    return;
  }

  if (req.method === "POST" && parsedReqUrl.pathname === "/api/parse") {

    let body = "";
    let bodyTooLarge = false;
    req.on("data", (chunk) => {
      if (bodyTooLarge) return;
      body += chunk;
      if (body.length > maxJsonBodySize) {
        bodyTooLarge = true;
        if (!res.headersSent) {
          sendJson(res, 413, { error: "链接请求内容过大，请只提交一个 URL。" });
        }
        req.destroy();
      }
    });
    req.on("error", () => {});
    req.on("end", async () => {
      if (bodyTooLarge) {
        return;
      }
      try {
        const payload = JSON.parse(body || "{}");
        if (!payload || typeof payload.url !== "string") {
          sendJson(res, 400, { error: "请先粘贴一个媒体链接。" });
          return;
        }
        const result = await buildResults(payload.url);
        sendJson(res, 200, result);
      } catch (err) {
        sendJson(res, 400, { error: "链接格式不正确，请粘贴完整的 http/https URL，例如 https://example.com/video.mp4" });
      }
    });
    return;
  }

  if (req.method !== "GET" && req.method !== "HEAD") {
    sendText(res, 405, "Method not allowed");
    return;
  }

  let safePath;
  try {
    safePath = parsedReqUrl.pathname === "/" ? "/index.html" : decodeURIComponent(parsedReqUrl.pathname);
  } catch {
    sendText(res, 400, "Bad request");
    return;
  }
  const filePath = path.normalize(path.join(publicDir, safePath));
  if (!filePath.startsWith(`${publicDir}${path.sep}`) && filePath !== publicDir) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  fs.readFile(filePath, (err, content) => {
    if (err) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Not found");
      return;
    }
    res.writeHead(200, {
      "Content-Type": mimeTypes[path.extname(filePath)] || "application/octet-stream",
      "Cache-Control": "no-cache"
    });
    if (req.method === "HEAD") {
      res.end();
      return;
    }
    res.end(content);
  });
});

if (require.main === module) {
  server.listen(port, host, () => {
    console.log(`Inspiration Link Studio is running at http://${host}:${port}`);
  });
}

module.exports = {
  parseHttpUrl,
  detectPlatform,
  getMediaKind,
  isPrivateIp,
  extractBilibiliId,
  extractDouyinAwemeId,
  buildDouyinMusicItem,
  getProxyHeadersForHost,
  explainExtractorError,
  normalizeExtractorResults,
  buildResults
};
