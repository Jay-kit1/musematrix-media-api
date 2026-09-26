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
- 支持 YouTube、TikTok、抖音等 `yt-dlp` 支持的平台，并启用 Node EJS 挑战解析。
- 支持直接媒体文件链接，例如 `.mp4`、`.webm`、`.jpg`、`.png`、`.m4a`。
- 后端解析入口集中在 `server.js` 的 `/api/parse`，资源代理入口为 `/api/download`。

## 说明

部分平台会要求 Cookie、登录态、地区网络或更严格的请求条件。若链接提示需要 Cookie，可在项目根目录放置 `.cookies.txt` 或设置 `YTDLP_COOKIES=/path/to/cookies.txt` 后重试。Cookie 文件不会被提交到 Git。

## 检查

```bash
npm run audit
npm test
```

## 线上部署

推荐把前端继续放在 Netlify，把后端 `server.js` 部署到 Render、Railway 或 VPS。

Render Web Service 可使用：

```text
Build Command: python3 -m pip install --upgrade "yt-dlp[default,curl-cffi]"
Start Command: node server.js
```

环境变量：

```text
HOST=0.0.0.0
CORS_ORIGIN=*
EXTRACTOR_TIMEOUT_MS=20000
DOWNLOAD_TIMEOUT_MS=30000
PARSE_CACHE_TTL_MS=90000
```

后端上线后，在前端 `app.js` 之前设置：

```html
<script>
  window.MUSEMATRIX_API_BASE = "https://你的后端域名";
</script>
```

## 本地记录与媒体有效期

浏览器仅保留最近 6 张卡片；重要笔记请导出 Markdown。存储不可用时，页面仍能工作，但会明确提示记录仅在本次页面有效。重新打开超过 90 秒的历史卡片会重新提取媒体；“重新提取”按钮会绕过解析缓存。保存按钮的短时防重复机制只代表请求已发出，不能确认浏览器下载已完成。

## 网关与发布

`netlify/functions/` 和 `tests/functions.test.mjs` 是 Netlify 网关的版本化源码。部署副本在 `../../musematrix-netlify/`：同步 `public/{index.html,app.js,styles.css}` 到其 `musematrix/`，同步 functions 与 tests，并保留副本自身的路径配置。不要同步 ZIP、虚拟环境或用户的 Sites 项目。

Netlify `/api/download` 只返回 302 到 Render；大媒体不经过 Function 响应体。Render 使用带背压的流式管道，保留 Range、If-Range、ETag 和 416 语义；默认大小上限为 2 GiB。公网验收需检查实际 302 → 206、Content-Range、字节数和 MP4 文件头，不能只检查健康接口。

普通网页仅由带 DNS 校验的元数据读取器处理，不交给 yt-dlp 的通用提取器。已识别平台仍依赖平台专用提取器及外部服务，其登录、地区和限流约束无法由本项目消除。内存解析缓存最多 100 条，同时执行的不同解析请求最多 4 个；相同链接复用在途请求。
