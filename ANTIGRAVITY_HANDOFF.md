# Antigravity IDE Handoff

## Current Request

Change the current SnapAny-style downloader page into a more personal inspiration-link workspace.

The user specifically asked:

- Use Antigravity IDE for the next stage.
- Do not make it a download-focused product.
- Do not fully imitate SnapAny.
- Add a stronger personal visual style.
- Keep collaboration practical and review-oriented.

## Implementation Brief

Rework the UI and copy into:

```text
Inspiration Studio / 灵感工作台
```

Suggested hero copy:

```text
把散落的链接整理成灵感素材
```

Suggested subtitle:

```text
粘贴公开视频、图片或网页链接，识别来源并整理成可回看的素材卡片。
```

Suggested primary button:

```text
生成素材卡片
```

## Sections To Reframe

- Header: personal studio/tool identity, not platform download service.
- Hero: link organization and inspiration capture.
- Quick platforms: `可识别来源`.
- Former desktop/plugin sections: convert to `素材板预览`, `整理流程`, or `灵感库`.
- Result panel: resource card language, not download language.
- FAQ: explain this is a local demo/workspace; do not imply bypassing platform restrictions.
- Footer: local personal inspiration studio.

## Keep

- Existing Node server and `/api/parse` API.
- History.
- Paste button.
- Theme toggle.
- Platform detection.
- Responsive layout.

## Finish Criteria

- No user-facing `SnapAny` branding except reference/doc wording such as `SnapAny 风格`.
- No prominent `下载` wording.
- Primary action is about organizing/generating cards.
- The first screen still feels immediately usable.
- Preview works at `http://127.0.0.1:5179/`.

