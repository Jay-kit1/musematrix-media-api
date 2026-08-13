import assert from "node:assert/strict";
import backend from "../server.js";

const {
  parseHttpUrl,
  detectPlatform,
  isPrivateIp,
  createPinnedLookup,
  extractBilibiliId,
  extractDouyinAwemeId,
  buildDouyinMusicItem,
  isDouyinLikeUrl,
  isTikTokLikeUrl,
  buildTikwmResult,
  mergeTikTokFallback,
  getDouyinShareItemFromHtml,
  buildDouyinShareResult,
  getProxyHeadersForHost,
  explainExtractorError,
  normalizeExtractorResults,
  buildYtDlpArgs,
  runJsonCommand,
  buildResults
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
assert.equal(extractDouyinAwemeId("https://v.douyin.com/UhUIZ7Ahvbs/", {
  error: "ERROR: [Douyin] 7649964138193753454: Fresh cookies are needed"
}), "7649964138193753454");
assert.equal(isDouyinLikeUrl("https://v.douyin.com/UhUIZ7Ahvbs/"), true);
assert.equal(isDouyinLikeUrl("https://www.tiktok.com/@user/video/7253412088251534594"), false);
assert.equal(isTikTokLikeUrl("https://www.tiktok.com/@user/video/7253412088251534594"), true);
assert.equal(isTikTokLikeUrl("https://v.douyin.com/UhUIZ7Ahvbs/"), false);

const tikwmFixture = buildTikwmResult({
  code: 0,
  data: {
    title: "TikTok fixture",
    hdplay: "https://v16m.tiktokcdn-us.com/demo.mp4",
    music: "https://v16-ies-music.tiktokcdn-us.com/demo.mp3",
    cover: "https://p16.tiktokcdn-us.com/demo.jpg",
    author: { nickname: "Fixture Author" }
  }
}, "https://www.tiktok.com/@fixture/video/1", { name: "抖音 / TikTok" }, {});
assert.equal(tikwmFixture.sourceDetail.extractor, "tikwm-fallback");
assert.equal(tikwmFixture.items.some((item) => item.type === "视频" && item.ext === "mp4"), true);
assert.equal(tikwmFixture.items.some((item) => item.type === "音频" && item.ext === "mp3"), true);
const mergedTikTok = mergeTikTokFallback({
  note: "primary",
  sourceDetail: { extractor: "yt-dlp" },
  items: [{ type: "视频", url: "https://cdn.example.com/primary.mp4" }]
}, tikwmFixture);
assert.equal(mergedTikTok.items.some((item) => item.type === "音频"), true);
assert.equal(mergedTikTok.sourceDetail.tiktokFallback, "tikwm");
assert.equal(mergedTikTok.items[0].label, "TikTok HD MP4 视频");

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

const douyinRouterHtml = `<script>window._ROUTER_DATA = {"loaderData":{"video_(id)/page":{"videoInfoRes":{"item_list":[{"aweme_id":"7649964138193753454","desc":"测试抖音视频","author":{"nickname":"测试作者"},"video":{"play_addr":{"uri":"video-1","url_list":["https://aweme.snssdk.com/aweme/v1/playwm/?video_id=video-1"]},"cover":{"url_list":["https://p11-sign.douyinpic.com/demo.webp"]},"height":1920,"width":1080,"duration":43000},"music":{"mid":"music-1","title":"测试原声","play_url":{"url_list":["https://sf6-cdn-tos.douyinstatic.com/obj/ies-music/demo.mp3"]}}}]}}}}}</script>`;
const douyinShareItem = getDouyinShareItemFromHtml(douyinRouterHtml);
assert.equal(douyinShareItem.aweme_id, "7649964138193753454");
const douyinShareResult = buildDouyinShareResult(
  douyinShareItem,
  "https://v.douyin.com/UhUIZ7Ahvbs/",
  "https://www.iesdouyin.com/share/video/7649964138193753454/",
  { name: "抖音 / TikTok" },
  {}
);
assert.equal(douyinShareResult.sourceDetail.extractor, "douyin-share-html");
assert.equal(douyinShareResult.items.some((item) => item.type === "视频" && item.ext === "mp4"), true);
assert.equal(douyinShareResult.items.some((item) => item.type === "音频" && item.ext === "mp3"), true);

assert.equal(isPrivateIp("127.0.0.1"), true);
assert.equal(isPrivateIp("192.168.1.8"), true);
assert.equal(isPrivateIp("100.64.0.1"), true);
assert.equal(isPrivateIp("198.18.0.1"), true);
assert.equal(isPrivateIp("::1"), true);
assert.equal(isPrivateIp("::ffff:127.0.0.1"), true);
assert.equal(isPrivateIp("fe80::1"), true);
assert.equal(isPrivateIp("fd00::1"), true);
assert.equal(isPrivateIp("2001:db8::1"), true);
assert.equal(isPrivateIp("8.8.8.8"), false);
assert.equal(isPrivateIp("2606:4700:4700::1111"), false);

const pinnedLookup = createPinnedLookup({ address: "8.8.8.8", family: 4 });
await new Promise((resolve, reject) => {
  pinnedLookup("example.com", { all: true }, (error, records) => {
    try {
      assert.ifError(error);
      assert.deepEqual(records, [{ address: "8.8.8.8", family: 4 }]);
      resolve();
    } catch (auditError) {
      reject(auditError);
    }
  });
});
await new Promise((resolve, reject) => {
  pinnedLookup("example.com", {}, (error, address, family) => {
    try {
      assert.ifError(error);
      assert.equal(address, "8.8.8.8");
      assert.equal(family, 4);
      resolve();
    } catch (auditError) {
      reject(auditError);
    }
  });
});
await assert.rejects(
  buildResults("http://127.0.0.1/private"),
  /本机、内网或保留地址/
);

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

const ytdlpArgs = buildYtDlpArgs("https://www.youtube.com/watch?v=BaW_jenozKc");
assert.equal(ytdlpArgs.includes("--ignore-config"), true);
assert.equal(ytdlpArgs.includes("--js-runtimes"), true);
assert.equal(ytdlpArgs.some((arg) => arg.startsWith("node:")), true);

const hardTimeoutStartedAt = Date.now();
const hardTimeoutResult = await runJsonCommand(
  process.execPath,
  ["-e", "setInterval(() => {}, 1000)"],
  80
);
assert.equal(hardTimeoutResult.errorCode, "extractor_timeout");
assert.equal(Date.now() - hardTimeoutStartedAt < 1000, true);

console.log("Backend audit passed.");
