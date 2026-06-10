const http = require("http");
const fs = require("fs");
const path = require("path");

const publicDir = path.join(__dirname, "public");
const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || "127.0.0.1";

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

function detectPlatform(rawUrl) {
  let parsed;
  try {
    parsed = new URL(rawUrl);
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
    ["直接媒体链接", ["mp4", "webm", "mov", "m4v", "mp3", "m4a", "wav", "jpg", "jpeg", "png", "webp", "gif"], "↓"]
  ];

  const pathname = parsed.pathname.toLowerCase();
  const direct = platforms.at(-1);
  if (direct[1].some((ext) => pathname.endsWith(`.${ext}`))) {
    return { name: direct[0], host, icon: direct[2], direct: true };
  }

  const match = platforms.find(([, domains]) => domains.some((domain) => host.includes(domain)));
  return match ? { name: match[0], host, icon: match[2] } : { name: "通用网页", host, icon: "↗" };
}

function buildResults(rawUrl) {
  const platform = detectPlatform(rawUrl);
  const directKind = /\.(jpg|jpeg|png|webp|gif)$/i.test(new URL(rawUrl).pathname)
    ? "图片"
    : /\.(mp3|m4a|wav)$/i.test(new URL(rawUrl).pathname)
      ? "音频"
      : "视频";

  if (platform.direct) {
    return {
      platform,
      title: `${directKind}文件已识别`,
      note: "这是直接媒体链接，本地版可以直接提供打开和下载入口。",
      items: [
        {
          label: `${directKind}原始文件`,
          quality: "Original",
          type: directKind,
          url: rawUrl
        }
      ]
    };
  }

  return {
    platform,
    title: `${platform.name} 链接已识别`,
    note: "本地演示版完成了平台识别和结果呈现。接入官方 API、授权账号或你自己的解析服务后，可在这里返回真实媒体地址。",
    items: [
      {
        label: "高清视频",
        quality: "1080p",
        type: "视频",
        url: rawUrl
      },
      {
        label: "封面图片",
        quality: "Cover",
        type: "图片",
        url: rawUrl
      },
      {
        label: "音频轨道",
        quality: "Audio",
        type: "音频",
        url: rawUrl
      }
    ]
  };
}

const server = http.createServer((req, res) => {
  if (req.method === "POST" && req.url === "/api/parse") {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1024 * 64) req.destroy();
    });
    req.on("end", () => {
      try {
        const { url } = JSON.parse(body || "{}");
        if (!url || typeof url !== "string") {
          sendJson(res, 400, { error: "请先粘贴一个媒体链接。" });
          return;
        }
        new URL(url);
        sendJson(res, 200, buildResults(url));
      } catch {
        sendJson(res, 400, { error: "链接格式不正确，请粘贴完整 URL，例如 https://example.com/video.mp4" });
      }
    });
    return;
  }

  const safePath = req.url === "/" ? "/index.html" : decodeURIComponent(req.url.split("?")[0]);
  const filePath = path.normalize(path.join(publicDir, safePath));
  if (!filePath.startsWith(publicDir)) {
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
    res.end(content);
  });
});

server.listen(port, host, () => {
  console.log(`Local Media Saver is running at http://${host}:${port}`);
});
