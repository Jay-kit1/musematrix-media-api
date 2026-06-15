# Inspiration Link Studio

一个本地部署的链接解析与媒体提取工作台。后端会优先使用平台专用逻辑和 `yt-dlp` 提取可用资源，失败时返回明确原因。

## 启动

```bash
node server.js
```

打开浏览器访问：

```text
http://localhost:3000
```

## 当前能力

- 支持粘贴链接并识别常见平台来源。
- 支持整段分享文案，会自动抽取里面的第一个 `http/https` 链接。
- 支持 B 站公开视频的专用提取，返回视频轨、音频轨和封面。
- 支持 YouTube、TikTok、抖音等 `yt-dlp` 支持的平台。
- 支持直接媒体文件链接，例如 `.mp4`、`.webm`、`.jpg`、`.png`、`.m4a`。
- 后端解析入口集中在 `server.js` 的 `/api/parse`，资源代理入口为 `/api/download`。

## 说明

部分平台会要求 Cookie、登录态、地区网络或更严格的请求条件。若链接提示需要 Cookie，可在项目根目录放置 `.cookies.txt` 或设置 `YTDLP_COOKIES=/path/to/cookies.txt` 后重试。Cookie 文件不会被提交到 Git。

## 检查

```bash
npm run audit
```

## 线上部署

推荐把前端继续放在 Netlify，把后端 `server.js` 部署到 Render、Railway 或 VPS。

Render Web Service 可使用：

```text
Build Command: python3 -m pip install --user yt-dlp
Start Command: node server.js
```

环境变量：

```text
HOST=0.0.0.0
CORS_ORIGIN=https://jade-cuchufli-10ac4a.netlify.app
EXTRACTOR_TIMEOUT_MS=45000
DOWNLOAD_TIMEOUT_MS=30000
```

后端上线后，在前端 `app.js` 之前设置：

```html
<script>
  window.MUSEMATRIX_API_BASE = "https://你的后端域名";
</script>
```
