import { createHmac } from "node:crypto";

const ORIGINS = [
  {
    name: "render",
    url: "https://musematrix-media-api.onrender.com/api/parse",
    timeoutMs: 24000,
  },
  {
    name: "sites-edge",
    url: "https://musematrix-jesper.jasper-zeng.chatgpt.site/api/parse",
    timeoutMs: 14000,
  },
];

const SNAPANY_ENDPOINT = "https://api.snapany.com/v1/extract/post";
const SNAPANY_CLIENT_SIGNING_KEY = process.env.SNAPANY_CLIENT_SIGNING_KEY ||
  "a5wU-SVyy5gXIyMbPQIfIz7UP7rCBp76U8Z8i-FtDMU";
const BROWSER_USER_AGENT = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) " +
  "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36";
const RESULT_CACHE_TTL_MS = 90000;
const resultCache = new Map();

const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Cache-Control": "no-store",
};

function hasMedia(data) {
  return data?.success !== false && Array.isArray(data?.items) && data.items.some((item) =>
    item && typeof item.url === "string" && /^https?:\/\//i.test(item.url) &&
    ["视频", "音频", "图片", "video", "audio", "image"].includes(item.type)
  );
}

function cloneResult(value) {
  return JSON.parse(JSON.stringify(value));
}

export function getCachedResult(cleanUrl, now = Date.now()) {
  const cached = resultCache.get(cleanUrl);
  if (!cached || now - cached.storedAt >= RESULT_CACHE_TTL_MS) {
    resultCache.delete(cleanUrl);
    return null;
  }
  return cloneResult(cached.data);
}

export function cacheResult(cleanUrl, data, now = Date.now()) {
  if (!hasMedia(data)) return;
  resultCache.set(cleanUrl, { storedAt: now, data: cloneResult(data) });
  if (resultCache.size > 50) resultCache.delete(resultCache.keys().next().value);
}

export async function firstMediaAttempt(tasks) {
  return Promise.any(tasks.map((task) => Promise.resolve(task).then((attempt) => {
    if (!hasMedia(attempt?.data)) throw new Error(attempt?.error || `${attempt?.name || "origin"} returned no media`);
    return attempt;
  })));
}

export function extractPublicHttpUrl(rawValue) {
  const match = String(rawValue || "").match(/https?:\/\/[^\s，。\"'<>]+/i);
  if (!match) return "";
  try {
    const parsed = new URL(match[0].replace(/[),，。；;！！？?]+$/u, ""));
    if (parsed.username || parsed.password || parsed.href.length > 2048) return "";
    parsed.hash = "";
    return ["http:", "https:"].includes(parsed.protocol) ? parsed.toString() : "";
  } catch {
    return "";
  }
}

function isDouyinUrl(url) {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host === "douyin.com" || host.endsWith(".douyin.com") ||
      host === "iesdouyin.com" || host.endsWith(".iesdouyin.com") ||
      host === "amemv.com" || host.endsWith(".amemv.com");
  } catch {
    return false;
  }
}

export function buildSnapAnyGatewayHeaders(url, locale = "en", timestamp = Date.now()) {
  const timestampText = String(timestamp);
  return {
    "Accept": "application/json",
    "Accept-Language": locale,
    "Content-Type": "application/json",
    "G-Timestamp": timestampText,
    "G-Footer": createHmac("sha256", SNAPANY_CLIENT_SIGNING_KEY)
      .update(`${url}${locale}${timestampText}`)
      .digest("hex"),
    "Origin": "https://snapany.com",
    "Referer": "https://snapany.com/",
    "User-Agent": BROWSER_USER_AGENT,
    "X-No-Error-Toast": "1",
  };
}

export function buildSnapAnyGatewayResult(apiResponse, cleanUrl) {
  const medias = Array.isArray(apiResponse?.medias) ? apiResponse.medias : [];
  const usable = medias.filter((media) => media &&
    ["video", "audio", "image"].includes(media.media_type) &&
    /^https?:\/\//i.test(media.resource_url || ""));
  if (!usable.length) return null;

  const items = [];
  const previewUrl = usable.find((media) => /^https?:\/\//i.test(media.preview_url || ""))?.preview_url || "";
  if (previewUrl) {
    items.push({ label: "封面图片", quality: "Cover", type: "图片", action: "open", url: previewUrl, ext: "jpg" });
  }
  for (const media of usable) {
    const type = media.media_type === "video" ? "视频" : media.media_type === "audio" ? "音频" : "图片";
    items.push({
      label: type === "视频" ? "MP4 视频" : type === "音频" ? "M4A 原声音频" : "图片资源",
      quality: type === "视频" ? "MP4" : type === "音频" ? "Original Sound" : "Image",
      type,
      action: "open",
      url: media.resource_url,
      ext: type === "视频" ? "mp4" : type === "音频" ? "m4a" : "jpg",
      size: Number(media.resource_size || media.size || 0),
    });
  }

  const parsed = new URL(cleanUrl);
  return {
    url: cleanUrl,
    platform: { name: "抖音 / TikTok", host: parsed.hostname, icon: "♪" },
    title: `${apiResponse.text || apiResponse.title || "抖音作品"} · 媒体已提取`,
    note: "已取得公开媒体。请只处理你有权使用或平台允许保存的内容。",
    sourceDetail: {
      url: cleanUrl,
      host: parsed.hostname,
      protocol: parsed.protocol.replace(":", ""),
      pathname: parsed.pathname,
      mediaKind: "网页",
      isDirectMedia: false,
      extractor: "snapany-netlify-fallback",
      title: apiResponse.title || apiResponse.text || "",
      awemeId: apiResponse.id || "",
      thumbnail: previewUrl,
    },
    items: items.slice(0, 12),
  };
}

async function callSnapAnyFallback(cleanUrl) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 18000);
  try {
    const response = await fetch(SNAPANY_ENDPOINT, {
      method: "POST",
      headers: buildSnapAnyGatewayHeaders(cleanUrl),
      body: JSON.stringify({ link: cleanUrl }),
      signal: controller.signal,
    });
    const data = await response.json().catch(() => null);
    const result = response.ok ? buildSnapAnyGatewayResult(data, cleanUrl) : null;
    return {
      name: "netlify-fallback",
      status: response.status,
      data: result,
      error: result ? "" : String(data?.code || data?.message || `HTTP ${response.status}`).slice(0, 120),
    };
  } catch (error) {
    return {
      name: "netlify-fallback",
      status: 0,
      error: error?.name === "AbortError" ? "timeout" : String(error?.message || "network error"),
    };
  } finally {
    clearTimeout(timeout);
  }
}

function scoreAttempt(attempt) {
  if (!attempt?.data || !hasMedia(attempt.data)) return -1;
  const items = attempt.data.items;
  const types = new Set(items.map((item) => item.type));
  const mediaScore = (types.has("视频") ? 30 : 0) + (types.has("音频") ? 30 : 0) +
    (types.has("图片") ? 5 : 0) + Math.min(items.length, 12);
  const extractor = String(attempt.data.sourceDetail?.extractor || "");
  const extractorScore = /yt-dlp|bilibili-api/.test(extractor) ? 10 : 0;
  return mediaScore + extractorScore;
}

export function selectBestAttempt(attempts) {
  const successful = attempts
    .filter((attempt) => hasMedia(attempt.data))
    .sort((a, b) => scoreAttempt(b) - scoreAttempt(a));
  if (successful.length) return successful[0];

  return attempts.find((attempt) => attempt.name === "render" && attempt.data) ||
    attempts.find((attempt) => attempt.data) || null;
}

async function callOrigin(origin, body) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), origin.timeoutMs);
  try {
    const response = await fetch(origin.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "MuseMatrix-Netlify-Gateway/2.0",
      },
      body,
      signal: controller.signal,
    });
    const text = await response.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error(`upstream returned non-JSON (${response.status})`);
    }
    return { name: origin.name, status: response.status, data };
  } catch (error) {
    return {
      name: origin.name,
      status: 0,
      error: error?.name === "AbortError" ? "timeout" : String(error?.message || "network error"),
    };
  } finally {
    clearTimeout(timeout);
  }
}

export async function handler(event) {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers, body: "" };
  }
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers, body: "Method not allowed" };
  }

  if (Buffer.byteLength(event.body || "", "utf8") > 32768) {
    return { statusCode: 413, headers: { ...headers, "Content-Type": "application/json" }, body: JSON.stringify({ error: "链接请求内容过大。" }) };
  }

  let payload;
  let cleanUrl;
  try {
    payload = JSON.parse(event.body || "{}");
    cleanUrl = typeof payload?.url === "string" ? extractPublicHttpUrl(payload.url) : "";
    if (!cleanUrl) {
      throw new Error("invalid url");
    }
  } catch {
    return {
      statusCode: 400,
      headers: { ...headers, "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({ error: "请粘贴完整的 http/https 链接。" }),
    };
  }

  const body = JSON.stringify({ url: cleanUrl, refresh: payload.refresh === true });
  if (payload.refresh === true) resultCache.delete(cleanUrl);
  const cached = getCachedResult(cleanUrl);
  if (cached) {
    cached.sourceDetail = {
      ...(cached.sourceDetail || {}),
      gatewayOrigin: "netlify-cache",
      gatewayAttempts: [{ name: "netlify-cache", status: 200, success: true, error: "" }],
    };
    return {
      statusCode: 200,
      headers: { ...headers, "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify(cached),
    };
  }

  const tasks = ORIGINS.map((origin) => callOrigin(origin, body));
  if (isDouyinUrl(cleanUrl)) tasks.push(callSnapAnyFallback(cleanUrl));

  let attempts;
  let best;
  try {
    best = await firstMediaAttempt(tasks);
    attempts = [best];
  } catch {
    attempts = await Promise.all(tasks);
    best = selectBestAttempt(attempts);
  }
  if (!best?.data) {
    return {
      statusCode: 502,
      headers: { ...headers, "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({
        error: "解析服务暂时不可用，请稍后重试。",
        sourceDetail: {
          gatewayAttempts: attempts.map(({ name, error }) => ({ name, error: error || "failed" })),
        },
      }),
    };
  }

  best.data.sourceDetail = {
    ...(best.data.sourceDetail || {}),
    gatewayOrigin: best.name,
    gatewayAttempts: attempts.map(({ name, status, error, data }) => ({
      name,
      status,
      success: hasMedia(data),
      error: error || "",
    })),
  };
  cacheResult(cleanUrl, best.data);

  return {
    statusCode: best.status >= 400 ? best.status : 200,
    headers: { ...headers, "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify(best.data),
  };
}
