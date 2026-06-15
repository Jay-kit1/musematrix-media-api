import assert from "node:assert/strict";
import backend from "../server.js";

const {
  parseHttpUrl,
  detectPlatform,
  isPrivateIp,
  extractBilibiliId,
  extractDouyinAwemeId,
  buildDouyinMusicItem,
  getProxyHeadersForHost,
  explainExtractorError,
  normalizeExtractorResults
} = backend;

const douyinShare = "5.10 复制打开抖音，看看【Yangruikee的作品】 https://v.douyin.com/UhUIZ7Ahvbs/ BTy:/ T@y.gB";
assert.equal(parseHttpUrl(douyinShare).toString(), "https://v.douyin.com/UhUIZ7Ahvbs/");

assert.equal(detectPlatform("https://youtube.com.evil.example/watch?v=abc").name, "通用网页");
assert.equal(detectPlatform("https://www.youtube.com/watch?v=abc").name, "YouTube");
assert.equal(detectPlatform("https://www.bilibili.com/video/BV1TnEt6MEHn").name, "哔哩哔哩");
assert.equal(detectPlatform(douyinShare).name, "抖音 / TikTok");

assert.deepEqual(extractBilibiliId("https://www.bilibili.com/video/BV1TnEt6MEHn"), { bvid: "BV1TnEt6MEHn" });
assert.deepEqual(extractBilibiliId("https://www.bilibili.com/video/av12345"), { aid: "12345" });
assert.equal(extractDouyinAwemeId("https://www.douyin.com/video/7649964138193753454"), "7649964138193753454");
assert.equal(extractDouyinAwemeId("https://v.douyin.com/UhUIZ7Ahvbs/", { id: "7649964138193753454" }), "7649964138193753454");

const douyinMusic = buildDouyinMusicItem({
  aweme_detail: {
    music: {
      title: "测试原声",
      mid: "music-1",
      play_url: {
        url_list: ["https://sf6-cdn-tos.douyinstatic.com/obj/ies-music/demo.mp3"]
      }
    }
  }
}, "https://www.douyin.com/video/7649964138193753454");
assert.equal(douyinMusic.type, "音频");
assert.equal(douyinMusic.ext, "mp3");
assert.equal(douyinMusic.url, "https://sf6-cdn-tos.douyinstatic.com/obj/ies-music/demo.mp3");

assert.equal(isPrivateIp("127.0.0.1"), true);
assert.equal(isPrivateIp("192.168.1.8"), true);
assert.equal(isPrivateIp("8.8.8.8"), false);

const normalized = normalizeExtractorResults({
  title: "fixture",
  thumbnail: "https://example.com/thumb.jpg",
  formats: [
    {
      format_id: "v1",
      url: "https://cdn.example.com/video.mp4",
      ext: "mp4",
      vcodec: "h264",
      acodec: "aac",
      resolution: "720x1280",
      filesize: 123
    },
    {
      format_id: "a1",
      url: "https://cdn.example.com/audio.m4a",
      ext: "m4a",
      vcodec: "none",
      acodec: "aac",
      format_note: "medium",
      filesize: 45
    }
  ]
}, "https://www.tiktok.com/@u/video/1", { name: "抖音 / TikTok" }, {});

assert.equal(normalized.sourceDetail.extractor, "yt-dlp");
assert.equal(normalized.items.some((item) => item.type === "视频" && item.ext === "mp4"), true);
assert.equal(normalized.items.some((item) => item.type === "音频" && item.ext === "m4a"), true);

const topLevelOnly = normalizeExtractorResults({
  title: "top-level media",
  url: "https://cdn.example.com/video.mp4",
  ext: "mp4",
  vcodec: "h265",
  acodec: "aac",
  resolution: "720x1280"
}, "https://v.douyin.com/demo/", { name: "抖音 / TikTok" }, {});
assert.equal(topLevelOnly.items.some((item) => item.type === "视频" && item.ext === "mp4"), true);

assert.equal(getProxyHeadersForHost("upos-sz-mirrorcos.bilivideo.com").Referer, "https://www.bilibili.com/");
assert.equal(getProxyHeadersForHost("v16-webapp-prime.tiktokcdn-us.com").Referer, "https://www.tiktok.com/");
assert.equal(getProxyHeadersForHost("v3-dy-o.zjcdn.com").Referer, "https://www.douyin.com/");
assert.equal(getProxyHeadersForHost("rr1---sn.googlevideo.com").Referer, "https://www.youtube.com/");

assert.match(explainExtractorError("Fresh cookies are needed"), /Cookie/);
assert.match(explainExtractorError("HTTP Error 412: Precondition Failed"), /风控/);

console.log("Backend audit passed.");
