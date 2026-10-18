// Public Douyin share-page data only; never executes page scripts.
const browserUserAgent = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1";
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

function extractAssignedJson(html, assignmentName) {
  const marker = new RegExp(assignmentName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")+"\\s*=\\s*");
  const match = marker.exec(html);
  if (!match) return null;
  const jsonStart = html.indexOf("{", match.index + match[0].length);
  if (jsonStart < 0) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = jsonStart; index < html.length; index += 1) {
    const char = html[index];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
    } else if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return JSON.parse(html.slice(jsonStart, index + 1));
      }
    }
  }

  return null;
}

function getDouyinShareItemFromHtml(html) {
  const routerData = extractAssignedJson(html, "window._ROUTER_DATA");
  const loaderData = routerData && routerData.loaderData ? routerData.loaderData : {};
  const pageData = Object.values(loaderData).find((entry) =>
    entry && typeof entry === "object" && entry.videoInfoRes
  ) || {};
  const itemList = pageData.videoInfoRes && Array.isArray(pageData.videoInfoRes.item_list)
    ? pageData.videoInfoRes.item_list
    : [];
  return itemList[0] || null;
}

function buildDouyinShareResult(item, cleanUrl, finalUrl, platform, sourceDetail) {
  if (!item || !item.video) return null;

  const playAddress = item.video.play_addr_h264 || item.video.play_addr;
  const playUrl = firstUrlFromUrlList(playAddress);
  if (!playUrl) return null;

  const coverUrl = firstUrlFromUrlList(item.video.origin_cover || item.video.cover);
  const width = playAddress.width || item.video.width;
  const height = playAddress.height || item.video.height;
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
    label: `MP4 视频 ${width || ""}x${height || ""}（含声音）`.trim(),
    quality: width && height ? `${Math.min(width,height)}p` : "MP4",
    type: "视频",
    action: "open",
    url: playUrl,
    ext: "mp4",
    size: Number(playAddress.data_size) || 0,
    formatId: playAddress.uri || "",
    codec: "mp4",
    mediaMode: "combined",
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
      duration: Number(item.video.duration || (music.duration ? music.duration * 1000 : 0))/1000,
      thumbnail: coverUrl,
      awemeId: item.aweme_id || item.group_id_str || "",
      finalUrl,
      cookieConfigured: Boolean(sourceDetail.cookieConfigured)
    },
    items
  };
}

module.exports={getDouyinShareItemFromHtml,buildDouyinShareResult};
