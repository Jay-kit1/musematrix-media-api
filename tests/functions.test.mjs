import assert from "node:assert/strict";
import test from "node:test";

import { handler as downloadHandler } from "../netlify/functions/download.mjs";
import { toHealthPayload } from "../netlify/functions/health.mjs";
import {
  buildSnapAnyGatewayHeaders,
  buildSnapAnyGatewayResult,
  cacheResult,
  extractPublicHttpUrl,
  firstMediaAttempt,
  getCachedResult,
  selectBestAttempt,
  handler as parseHandler,
} from "../netlify/functions/parse.mjs";

test("health gateway exposes only the stable public fields", () => {
  assert.deepEqual(toHealthPayload({ status: "ok", extractor: "yt-dlp", revision: "abc123", node: "secret" }), {
    status: "ok",
    extractor: "yt-dlp",
    revision: "abc123",
  });
});

test("health gateway reports a cold backend as warming instead of unavailable", () => {
  assert.deepEqual(toHealthPayload(), {
    status: "warming",
    extractor: "starting",
    revision: "gateway",
  });
});

test("parse gateway prefers a richer full-backend result", () => {
  const best = selectBestAttempt([
    {
      name: "sites-edge",
      data: { success: false, items: [], sourceDetail: { extractor: "sites-edge-parser" } },
    },
    {
      name: "render",
      data: {
        items: [
          { type: "视频", url: "https://cdn.example/video.mp4" },
          { type: "音频", url: "https://cdn.example/audio.m4a" },
        ],
        sourceDetail: { extractor: "yt-dlp" },
      },
    },
  ]);
  assert.equal(best.name, "render");
});

test("parse gateway extracts a Douyin URL from a full share message", () => {
  assert.equal(
    extractPublicHttpUrl("3.82 复制打开抖音 https://v.douyin.com/zL7XV5TIvP8/ caa:/"),
    "https://v.douyin.com/zL7XV5TIvP8/",
  );
});

test("parse gateway returns the first real media result without waiting for a slow origin", async () => {
  const slow = new Promise((resolve) => setTimeout(() => resolve({
    name: "render",
    data: { items: [] },
  }), 80));
  const fast = Promise.resolve({
    name: "netlify-fallback",
    data: { items: [{ type: "视频", url: "https://cdn.example/video.mp4" }] },
  });
  const best = await firstMediaAttempt([slow, fast]);
  assert.equal(best.name, "netlify-fallback");
});

test("parse gateway reuses a short-lived successful result", () => {
  const url = "https://v.douyin.com/cache-test/";
  const result = { items: [{ type: "视频", url: "https://cdn.example/video.mp4" }] };
  cacheResult(url, result, 1000);
  assert.deepEqual(getCachedResult(url, 2000), result);
  assert.equal(getCachedResult(url, 1000 + 4 * 60 * 1000 + 1), null);
});

test("Netlify Douyin fallback matches the public client signature and media schema", () => {
  assert.equal(
    buildSnapAnyGatewayHeaders("https://v.douyin.com/K8ebVWVxWiU/", "en", 1786683496000)["G-Footer"],
    "d3211ab24a7179b288f82cce08d7d4bd2974e3e65cbebd12a4fa27f3105ac926",
  );
  const result = buildSnapAnyGatewayResult({
    id: "7583570020098886949",
    text: "藤条编织包包教程",
    medias: [
      { media_type: "video", resource_url: "https://v.douyinvod.com/demo.mp4", preview_url: "https://p3.douyinpic.com/demo.jpg" },
      { media_type: "audio", resource_url: "https://sf11.douyinstatic.com/demo.mp3" },
    ],
  }, "https://v.douyin.com/zL7XV5TIvP8/");
  assert.equal(result.sourceDetail.extractor, "snapany-netlify-fallback");
  assert.equal(result.sourceDetail.awemeId, "7583570020098886949");
  assert.equal(result.items.some((item) => item.type === "视频"), true);
  assert.equal(result.items.some((item) => item.type === "音频"), true);
  assert.equal(result.items.find((item) => item.type === "音频").ext, "m4a");
});

test("download gateway redirects through the header-aware backend", async () => {
  const response = await downloadHandler({
    httpMethod: "GET",
    queryStringParameters: {
      url: "https://upos.example/video.m4s?token=abc",
      filename: "track.mp4",
    },
  });
  assert.equal(response.statusCode, 302);
  const location = new URL(response.headers.Location);
  assert.equal(location.hostname, "musematrix-media-api.onrender.com");
  assert.equal(location.pathname, "/api/download");
  assert.equal(location.searchParams.get("url"), "https://upos.example/video.m4s?token=abc");
});


test("gateway cache expires exactly at the media freshness boundary and returns isolated copies", () => {
  const url = "https://example.com/freshness.mp4";
  cacheResult(url, { items: [{ type: "video", url }] }, 1000);
  const copy = getCachedResult(url, 2000);
  copy.items.length = 0;
  assert.equal(getCachedResult(url, 2000).items.length, 1);
  assert.equal(getCachedResult(url, 91000), null);
});

test("gateway rejects credentials, malformed payloads and oversized bodies", async () => {
  assert.equal(extractPublicHttpUrl("https://user:secret@example.com"), "");
  assert.equal((await downloadHandler({httpMethod:"GET", queryStringParameters:{url:"javascript:alert(1)"}})).statusCode, 400);
  assert.equal((await parseHandler({httpMethod:"POST",body:"null"})).statusCode, 400);
  assert.equal((await parseHandler({httpMethod:"POST",body:"x".repeat(32769)})).statusCode, 413);
});

test("explicit refresh bypasses gateway cache and sends only normalized parser fields", async () => {
  const url = "https://example.com/refresh.mp4";
  cacheResult(url, {items:[{type:"video",url:"https://example.com/old.mp4"}]});
  const originalFetch = globalThis.fetch;
  const bodies = [];
  globalThis.fetch = async (_url, options) => {
    bodies.push(JSON.parse(options.body));
    return {status:200, text:async()=>JSON.stringify({items:[{type:"video",url}], platform:{name:"直接媒体链接"},title:"Fresh"})};
  };
  try {
    const result = await parseHandler({httpMethod:"POST",body:JSON.stringify({url,refresh:true,ignored:"drop"})});
    assert.equal(result.statusCode,200);
    assert.equal(JSON.parse(result.body).items[0].url,url);
    assert.deepEqual(bodies[0],{url,refresh:true});
  } finally { globalThis.fetch = originalFetch; }
});
