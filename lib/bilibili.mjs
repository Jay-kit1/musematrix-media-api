// Shared Bilibili parser used by Node and the edge failover. Keep the two deployment copies identical.
function parseHttpUrl(raw) {const url=new URL(raw);if(!['http:','https:'].includes(url.protocol)||url.username||url.password||url.href.length>2048)throw new Error('Invalid URL');return url;}
function isSameOrSubdomain(host,domain){return host===domain||host.endsWith('.'+domain)}
function isDirectResourceUrl(raw){try{return !/\.(m3u8|mpd)(?:[?#]|$)/i.test(parseHttpUrl(raw).href)}catch{return false}}
const browserUserAgent='Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1';
function extractBilibiliId(raw){const path=parseHttpUrl(raw).pathname;const bv=path.match(/\/video\/(BV[a-zA-Z0-9]+)/);if(bv)return {bvid:bv[1]};const av=path.match(/\/video\/av(\d+)/i);return av?{aid:av[1]}:null;}
export async function extractBilibili(cleanUrl, platform, sourceDetail, io) {
  let resolvedUrl = cleanUrl;
  if (isSameOrSubdomain(parseHttpUrl(cleanUrl).hostname, 'b23.tv')) {
    const resolved = await io.requestUrl(cleanUrl, {method:'HEAD', timeout:12000});
    resolvedUrl = resolved.finalUrl;
    if (!isSameOrSubdomain(parseHttpUrl(resolvedUrl).hostname, 'bilibili.com')) return null;
  }
  const ids = extractBilibiliId(resolvedUrl);
  if (!ids) return null;

  const idQuery = ids.bvid ? `bvid=${encodeURIComponent(ids.bvid)}` : `aid=${encodeURIComponent(ids.aid)}`;
  const referer = ids.bvid
    ? `https://www.bilibili.com/video/${ids.bvid}`
    : "https://www.bilibili.com/";
  const commonHeaders = {
    "User-Agent": browserUserAgent,
    "Referer": referer
  };

  const view = await io.fetchJson(`https://api.bilibili.com/x/web-interface/view?${idQuery}`, commonHeaders);
  if (view.code !== 0 || !view.data || !view.data.cid) {
    return {
      error: view.message || "无法读取 B 站视频详情",
      extractor: "bilibili-api"
    };
  }

  const page = Math.max(1, Number(new URL(resolvedUrl).searchParams.get('p')) || 1);
  const cid = view.data.pages?.find(entry => entry.page === page)?.cid || view.data.cid;
  // HTML5 progressive MP4 contains sound and can be saved without a merge step.
  const progressive = await io.fetchJson(`https://api.bilibili.com/x/player/playurl?${idQuery}&cid=${cid}&qn=64&fnval=0&platform=html5&high_quality=1`, commonHeaders).catch(() => null);
  const playUrl = `https://api.bilibili.com/x/player/playurl?${idQuery}&cid=${encodeURIComponent(cid)}&qn=80&fnval=4048&fourk=1`;
  const play = await io.fetchJson(playUrl, commonHeaders);
  if ((play.code !== 0 || !play.data) && !progressive?.data?.durl?.length) {
    return {
      error: play.message || "无法读取 B 站播放地址",
      extractor: "bilibili-api"
    };
  }

  const dash = play.data?.dash || {};
  const seen = new Set();
  const pickUrl = (entry) => entry.baseUrl || entry.base_url || (Array.isArray(entry.backupUrl) ? entry.backupUrl[0] : "") || "";
  const videoItems = Array.isArray(dash.video) ? dash.video : [];
  const audioItems = Array.isArray(dash.audio) ? dash.audio : [];
  const items = [];
  const fullFiles = progressive?.code === 0 && Array.isArray(progressive.data?.durl) ? progressive.data.durl : [];
  // Multi-segment legacy FLV is not a standalone complete MP4.
  if (fullFiles.length === 1 && isDirectResourceUrl(fullFiles[0].url) && !/\.flv(?:[?]|$)/i.test(fullFiles[0].url)) {
    items.push({label:'完整视频 MP4（含声音）',quality:`${progressive.data.quality || 'HTML5'}`,type:'视频',action:'open',url:fullFiles[0].url,ext:'mp4',size:Number(fullFiles[0].size || 0),mediaMode:'combined',headers:commonHeaders});
  }
  const pushMedia = (entry, label, type) => {
    if (!entry) return;
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
      ext: type === "音频" ? "m4a" : "mp4",
      mediaMode: type === "音频" ? "audio-only" : "video-only",
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

  if (!items.some((item) => item.type === "视频")) {
    return {
      error: "B 站接口未返回可用音频或视频轨",
      extractor: "bilibili-api"
    };
  }

  return {
    url: cleanUrl,
    platform,
    title: `${view.data.title || platform.name} · 媒体已提取`,
    note: items.some(item => item.mediaMode === "combined") ? "优先保存完整视频（含声音）。高清仅视频轨和音频轨可分别保存。" : "本次仅返回分离的视频和音频轨，已分别标注。",
    sourceDetail: {
      ...sourceDetail,
      extractor: "bilibili-api",
      finalUrl: resolvedUrl,
      page,
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

