import fs from "node:fs";

const path = new URL("../server.js", import.meta.url);
let source = fs.readFileSync(path, "utf8");

if (source.includes("douyin-share-html")) {
  console.log("Douyin fallback already present.");
  process.exit(0);
}

const fallbackBlock = String.raw`
function extractAssignedJson(html, assignmentName) {
  const marker = `${assignmentName} = `;
  const start = html.indexOf(marker);
  if (start < 0) return null;

  const jsonStart = html.indexOf("{", start + marker.length);
  if (jsonStart < 0) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = jsonStart; index < html.length; index += 1) {
    const char = html[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') inString = false;
      continue;
    }

    if (char === '"') inString = true;
    else if (char === "{") depth += 1;
    else if (char === "}") {
      depth -= 1;
      if (depth === 0) return JSON.parse(html.slice(jsonStart, index + 1));
    }
  }

  return null;
}

function getDouyinShareItemFromHtml(html) {
  const routerData = extractAssignedJson(html, "window._ROUTER_DATA");
  const loaderData = routerData && routerData.loaderData ? routerData.loaderData : {};
  const pageData = loaderData["video_(id)/page"] || loaderData["video_(id)\\u002Fpage"] || {};
  const itemList = pageData.videoInfoRes && Array.isArray(pageData.videoInfoRes.item_list)
    ? pageData.videoInfoRes.item_list
    : [];
  return itemList[0] || null;
}

function isDouyinLikeUrl(cleanUrl) {
  try {
    const host = parseHttpUrl(cleanUrl).hostname.toLowerCase();
    return host.includes("douyin.com") || host.includes("iesdouyin.com") || host.includes("amemv.com");
  } catch {
    return false;
  }
}

function buildDouyinShareResult(item, cleanUrl, finalUrl, platform, sourceDetail) {
  if (!item || !item.video) return null;

  const playUrl = firstUrlFromUrlList(item.video.play_addr);
  if (!playUrl) return null;

  const coverUrl = firstUrlFromUrlList(item.video.cover);
  const music = item.music || {};
  const musicUrl = firstUrlFromUrlList(music.play_url || music.play_url_64 || music.play_url_hq);
  const items = [];

  if (coverUrl) {
    items.push({
      label: "封面图片",
      quality: "Cover",
      type: "图片",
      action: "open",
      url: coverUrl,
      ext: coverUrl.includes(".webp") ? "webp" : "jpg"
    });
  }

  items.push({
    label: `MP4 视频 ${item.video.width || ""}x${item.video.height || ""}`.trim(),
    quality: item.video.height ? `${item.video.height}p` : "MP4",
    type: "视频",
    action: "open",
    url: playUrl,
    ext: "mp4",
    size: 0,
    formatId: item.video.play_addr && item.video.play_addr.uri ? item.video.play_addr.uri : "",
    codec: "mp4",
    headers: {
      "User-Agent": browserUserAgent,
      "Referer": finalUrl || "https://www.douyin.com/",
      "Origin": "https://www.douyin.com"
    }
  });

  if (musicUrl) {
    items.push({
      label: `MP3 音频 ${music.title || "抖音原声"}`.trim(),
      quality: "Original Sound",
      type: "音频",
      action: "open",
      url: musicUrl,
      ext: "mp3",
      size: 0,
      formatId: music.mid || "",
      codec: "mp3",
      headers: {
        "User-Agent": browserUserAgent,
        "Referer": finalUrl || "https://www.douyin.com/",
        "Origin": "https://www.douyin.com"
      }
    });
  }

  return {
    url: cleanUrl,
    platform,
    title: `${item.desc || platform.name} · 媒体已提取`,
    note: musicUrl
      ? "已通过抖音分享页数据提取视频和原声音频。请只处理你有权使用或平台允许保存的内容。"
      : "已通过抖音分享页数据提取 MP4 视频；原声音频未在公开分享页单独提供，音频已内嵌在视频中。",
    sourceDetail: {
      ...sourceDetail,
      extractor: "douyin-share-html",
      title: item.desc || "",
      author: item.author && item.author.nickname ? item.author.nickname : "",
      duration: item.video.duration || (music.duration ? music.duration * 1000 : 0),
      thumbnail: coverUrl,
      awemeId: item.aweme_id || item.group_id_str || "",
      finalUrl,
      cookieConfigured: Boolean(getCookieFilePath() || process.env.YTDLP_COOKIES_FROM_BROWSER)
    },
    items
  };
}

async function extractDouyinShareHtml(cleanUrl, platform, sourceDetail) {
  if (!isDouyinLikeUrl(cleanUrl)) return null;

  const response = await requestUrl(cleanUrl, {
    limit: maxRemoteJsonBytes,
    timeout: 15000,
    headers: {
      "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Referer": "https://www.douyin.com/"
    }
  });
  const item = getDouyinShareItemFromHtml(response.body || "");
  return buildDouyinShareResult(item, cleanUrl, response.finalUrl || cleanUrl, platform, sourceDetail);
}
`;

source = source.replace(
  "function buildDouyinMusicItem(detail, referer) {",
  `${fallbackBlock}\nfunction buildDouyinMusicItem(detail, referer) {`
);

source = source.replace(
  "  const extractorInfo = await runYtDlp(cleanUrl);",
  `  if (platform.name === "抖音 / TikTok" && isDouyinLikeUrl(cleanUrl)) {\n    const douyinShareResult = await extractDouyinShareHtml(cleanUrl, platform, sourceDetail).catch(() => null);\n    if (douyinShareResult) {\n      return douyinShareResult;\n    }\n  }\n\n  const extractorInfo = await runYtDlp(cleanUrl);`
);

fs.writeFileSync(path, source);
console.log("Applied Douyin share-page fallback to server.js.");
