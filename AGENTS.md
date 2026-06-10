# Agent Instructions

This project is a small local Node static app. Work directly in the existing files and keep changes focused.

## Product Direction

The app should become a personal link and inspiration workspace, not a downloader clone.

Use this positioning:

- Brand: `Inspiration Studio` or `灵感工作台`.
- Purpose: paste public media or webpage links, identify the source, and organize them into reusable inspiration/resource cards.
- Tone: calm, personal, useful, and design-forward.
- Visual style: clean tool page with a personal studio feeling. White and soft blue can remain, but add a distinct voice through mint, ink, notebook, canvas, or material-board details.

Avoid:

- Do not present the app as the real SnapAny.
- Do not overuse `下载`, `解析下载`, `万能下载`, or similar download-site language.
- Do not copy SnapAny too literally.
- Do not install dependencies or migrate frameworks.

## Editable Surface

Prefer editing:

- `public/index.html`
- `public/styles.css`
- `public/app.js`
- `README.md` only when docs need to match the product direction

Avoid changing `server.js` unless the API contract truly needs to change.

## Functional Contract

Keep these working:

- The form submits to `POST /api/parse`.
- The paste button still reads the clipboard when permitted.
- Recent history still works.
- Theme toggle still works.
- The app remains responsive on mobile.

Wording changes are expected:

- Primary button: use `整理链接` or `生成素材卡片`.
- Result actions: use `查看资源`, `打开原链接`, or `保存到灵感板`; avoid `下载`.
- Platform section: use `可识别来源`; avoid `支持下载平台`.

## Design Review Checklist

Before finishing, review:

- First viewport shows the actual tool, not a marketing splash.
- No horizontal overflow at mobile width.
- Buttons do not wrap awkwardly or clip.
- Cards use radius 12px or less.
- Copy is consistent with the inspiration-workspace direction.
- SnapAny appears only as an inspiration/reference in docs, not as the product brand.
- Result panel and history list match the new visual style.

## Verification

Use the local preview task in `.vscode/tasks.json`, or run:

```bash
PORT=5179 /Users/kukudejie/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node server.js
```

Then open:

```text
http://127.0.0.1:5179/
```

Smoke test:

1. Paste `https://example.com/video.mp4`.
2. Submit the form.
3. Confirm the result card appears.
4. Confirm history records the URL.
5. Toggle dark mode.
6. Check desktop and mobile layouts.

