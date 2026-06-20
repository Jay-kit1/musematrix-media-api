const form = document.querySelector("#parser");
const input = document.querySelector("#mediaUrl");
const resultPanel = document.querySelector("#resultPanel");
const pasteButton = document.querySelector("#pasteButton");
const clearHistoryButton = document.querySelector("#clearHistory");
const historyList = document.querySelector("#historyList");
const themeToggle = document.querySelector("#themeToggle");

const historyKey = "muse-matrix-history";
const directMediaPattern = /\.(mp4|webm|mov|m4v|mp3|m4a|wav|ogg|aac|jpg|jpeg|png|webp|gif|avif)(\?.*)?$/i;
const videoPattern = /\.(mp4|webm|mov|m4v)(\?.*)?$/i;
const audioPattern = /\.(mp3|m4a|wav|ogg|aac)(\?.*)?$/i;
const imagePattern = /\.(jpg|jpeg|png|webp|gif|avif)(\?.*)?$/i;
let backendDownloadAvailable = false;
const hostedApiBase = "https://musematrix-media-api.onrender.com";
const shouldUseHostedApi = location.hostname.endsWith("netlify.app");
const apiBase = String(window.MUSEMATRIX_API_BASE || (shouldUseHostedApi ? hostedApiBase : "")).replace(/\/+$/, "");

function apiUrl(path) {
  return `${apiBase}${path}`;
}

// Custom premium SVGs for results
const platformSvgs = {
  "抖音 / TikTok": `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.17-2.89-.74-3.94-1.78-.22-.22-.41-.47-.59-.73v7.02c0 3.73-2.07 6.84-5.59 7.42-3.15.51-6.48-.96-7.8-3.9C3.12 14.54 4.04 10.3 7.44 8.78c.85-.38 1.8-.57 2.73-.55v4.09c-.65-.06-1.34.14-1.84.58-.92.82-.93 2.39-.02 3.21.82.74 2.18.66 2.87-.24.31-.41.44-.92.42-1.43V.02z"/></svg>`,
  "YouTube": `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M23.498 6.163a3.003 3.003 0 0 0-2.11-2.11C19.517 3.545 12 3.545 12 3.545s-7.517 0-9.388.508a3.003 3.003 0 0 0-2.11 2.11C0 8.033 0 12 0 12s0 3.967.502 5.837a3.003 3.003 0 0 0 2.11 2.11c1.871.508 9.388.508 9.388.508s7.517 0 9.388-.508a3.003 3.003 0 0 0 2.11-2.11C24 15.967 24 12 24 12s0-3.967-.502-5.837zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>`,
  "哔哩哔哩": `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M17.87 2.33a.75.75 0 0 1 1.05.14l2.13 2.79a.75.75 0 1 1-1.18.91l-2.13-2.79a.75.75 0 0 1 .13-1.05zm-11.74 0a.75.75 0 0 1 .13 1.05L4.13 6.17a.75.75 0 1 1-1.18-.91l2.13-2.79a.75.75 0 0 1 1.05-.14zM20 7.5a3 3 0 0 1 3 3v8a3 3 0 0 1-3 3H4a3 3 0 0 1-3-3v-8a3 3 0 0 1 3-3h16zm-12 5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3zm8 0a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3z"/></svg>`,
  "X / Twitter": `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>`,
  "Pinterest": `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12.017 0C5.396 0 .029 5.367.029 11.987c0 5.079 3.158 9.417 7.618 11.162-.105-.949-.199-2.403.041-3.439.219-.937 1.406-5.966 1.406-5.966s-.359-.72-.359-1.781c0-1.668.967-2.914 2.171-2.914 1.023 0 1.518.769 1.518 1.69 0 1.029-.655 2.568-.994 3.995-.283 1.194.599 2.169 1.777 2.169 2.133 0 3.772-2.249 3.772-5.495 0-2.873-2.064-4.882-5.012-4.882-3.414 0-5.418 2.561-5.418 5.207 0 1.031.397 2.138.893 2.738.098.119.112.224.083.345l-.333 1.36c-.053.22-.174.267-.402.161-1.499-.698-2.436-2.889-2.436-4.649 0-3.785 2.75-7.262 7.929-7.262 4.163 0 7.398 2.967 7.398 6.931 0 4.136-2.607 7.464-6.227 7.464-1.216 0-2.359-.631-2.75-1.378l-.748 2.853c-.271 1.043-1.002 2.35-1.492 3.146 1.124.347 2.317.535 3.554.535 6.621 0 11.985-5.367 11.985-11.988C24.005 5.367 18.638 0 12.017 0z"/></svg>`,
  "Facebook": `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>`,
  "Instagram": `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204 0.13-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.051.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 1 0 0 12.324 6.162 6.162 0 0 0 0-12.324zM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm6.406-11.845a1.44 1.44 0 1 0 0 2.881 1.44 1.44 0 0 0 0-2.881z"/></svg>`,
  "Reddit": `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M24 11.5c0-1.65-1.35-3-3-3-.96 0-1.86.48-2.42 1.24-1.64-1-3.85-1.64-6.23-1.72l1.09-3.43 3.57.77c.05.98.87 1.74 1.86 1.74 1.02 0 1.85-.83 1.85-1.85S19.02 3.5 18 3.5c-.83 0-1.54.55-1.77 1.29l-3.98-.86c-.25-.06-.5.08-.58.32l-1.32 4.17C7.96 8.5 5.75 9.14 4.1 10.15c-.55-.73-1.43-1.15-2.35-1.15-1.65 0-3 1.35-3 3 0 1.12.63 2.12 1.56 2.62C.21 15.35.15 16.03.15 16.65c0 3.97 4.7 7.2 10.5 7.2s10.5-3.23 10.5-7.2c0-.62-.06-1.3-.16-1.53.93-.5 1.56-1.5 1.56-2.62zM7.5 15c-.83 0-1.5-.67-1.5-1.5S6.67 12 7.5 12s1.5.67 1.5 1.5S8.33 15 7.5 15zm9.46 3.92c-.83.83-2.4 1.08-3.46 1.08s-2.63-.25-3.46-1.08c-.2-.2-.2-.5 0-.7.2-.2.5-.2.7 0 .6.6 1.76.88 2.76.88s2.16-.28 2.76-.88c.2-.2.5-.2.7 0 .2.2.2.5 0 .7zm-.46-3.92c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5z"/></svg>`,
  "直接媒体链接": `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg>`,
  "通用网页": `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>`,
  "未知平台": `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`
};

const platformPalettes = {
  "抖音 / TikTok": ["#010101", "#25f4ee", "#fe0979", "#f3f4f6", "#161e2e"],
  "YouTube": ["#ff0000", "#282828", "#ffffff", "#e6e6e6", "#0f172a"],
  "哔哩哔哩": ["#00aeec", "#fb7299", "#f4f5f7", "#23ade5", "#162a3c"],
  "X / Twitter": ["#000000", "#1da1f2", "#e1e8ed", "#f5f8fa", "#1c2536"],
  "Pinterest": ["#bd081c", "#efefef", "#333333", "#e60023", "#f3f4f6"],
  "直接媒体链接": ["#00a878", "#059669", "#d1fae5", "#10b981", "#064e3b"],
  "通用网页": ["#2563eb", "#8b5cf6", "#10b981", "#cbd5e1", "#0f172a"]
};

function escapeHtml(value) {
  if (!value) return "";
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[char]);
}

function extractUrl(value) {
  const match = String(value || "").match(/https?:\/\/[^\s"'<>，。]+/i);
  return match ? match[0].replace(/[),.，。]+$/g, "") : "";
}

function classifyPlatform(url) {
  let host = "";
  try {
    host = new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "未知平台";
  }

  if (host.includes("douyin") || host.includes("tiktok")) return "抖音 / TikTok";
  if (host.includes("youtube") || host.includes("youtu.be")) return "YouTube";
  if (host.includes("bilibili") || host.includes("b23.tv")) return "哔哩哔哩";
  if (host.includes("twitter") || host.includes("x.com")) return "X / Twitter";
  if (host.includes("pinterest")) return "Pinterest";
  if (host.includes("facebook") || host.includes("fb.watch")) return "Facebook";
  if (host.includes("instagram")) return "Instagram";
  if (host.includes("reddit")) return "Reddit";
  if (directMediaPattern.test(url)) return "直接媒体链接";
  return "通用网页";
}

function getUrlName(url) {
  try {
    const parsed = new URL(url);
    const last = decodeURIComponent(parsed.pathname.split("/").filter(Boolean).pop() || parsed.hostname);
    return last.replace(/\.[a-z0-9]+$/i, "") || parsed.hostname;
  } catch {
    return "灵感链接";
  }
}

function getExt(url, fallback = "link") {
  try {
    const path = new URL(url).pathname;
    return (path.split(".").pop() || fallback).toLowerCase().replace(/[^\w-]/g, "") || fallback;
  } catch {
    return fallback;
  }
}

function buildStaticItems(url, platformName) {
  if (videoPattern.test(url)) {
    return [{
      label: "视频文件",
      type: "video",
      quality: "DIRECT MP4/WEBM",
      ext: getExt(url, "mp4"),
      url
    }];
  }

  if (audioPattern.test(url)) {
    return [{
      label: "音频文件",
      type: "audio",
      quality: "DIRECT AUDIO",
      ext: getExt(url, "mp3"),
      url
    }];
  }

  if (imagePattern.test(url)) {
    return [{
      label: "图片文件",
      type: "image",
      quality: "DIRECT IMAGE",
      ext: getExt(url, "jpg"),
      url
    }];
  }

  return [{
    label: platformName === "通用网页" ? "原始网页链接" : "平台原始链接",
    type: "link",
    quality: "OPEN SOURCE",
    ext: "url",
    url
  }];
}

function staticParse(inputValue, apiMessage = "") {
  const url = extractUrl(inputValue);
  if (!url) {
    throw new Error("没有识别到有效链接，请粘贴包含 http 或 https 的地址。");
  }

  const platformName = classifyPlatform(url);
  const isDirect = directMediaPattern.test(url);
  const platformNeedsBackend = !isDirect && platformName !== "通用网页";
  const title = isDirect ? `${getUrlName(url)} · 已识别直接媒体` : `${platformName} · 已建立灵感卡片`;
  const note = platformNeedsBackend
    ? "上线静态版已完成链接识别、记录、复制和导出。要像专业解析站一样拿到真实 MP4/MP3，需要接入后端解析服务；当前不会让页面报错或打不开。"
    : "这个链接可在纯前端模式下直接保存、打开、记录笔记和导出。";

  return {
    url,
    title,
    platform: { name: platformName },
    note,
    items: buildStaticItems(url, platformName),
    sourceDetail: {
      extractorHint: apiMessage ? `后端解析暂未可用：${apiMessage}` : note,
      mode: "static"
    }
  };
}

async function parseWithOptionalBackend(rawValue) {
  const url = extractUrl(rawValue);
  if (!url) throw new Error("没有识别到有效链接，请粘贴包含 http 或 https 的地址。");

  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), 85000);

  try {
    const response = await fetch(apiUrl("/api/parse"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
      signal: controller.signal
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "解析服务暂时不可用");
    backendDownloadAvailable = true;
    return { ...data, url: data.url || url };
  } catch (error) {
    backendDownloadAvailable = false;
    const message = error.name === "AbortError" ? "请求超时，已切换到静态识别模式" : error.message;
    return staticParse(rawValue, message);
  } finally {
    window.clearTimeout(timeoutId);
  }
}

window.MuseMatrix = {
  classifyPlatform,
  extractUrl,
  staticParse
};

function getHistory() {
  try {
    return JSON.parse(localStorage.getItem(historyKey) || "[]");
  } catch {
    return [];
  }
}

function saveHistory(entry) {
  const history = getHistory();
  const filtered = history.filter((item) => item.url !== entry.url);
  const next = [entry, ...filtered].slice(0, 6);
  localStorage.setItem(historyKey, JSON.stringify(next));
  renderHistory();
  updateStats();
}

function updateHistoryNotesAndTags(url, note, tagsStr) {
  const history = getHistory();
  const index = history.findIndex((item) => item.url === url);
  if (index >= 0) {
    history[index].note = note;
    history[index].tags = tagsStr
      .split(/[,，;；\s]+/)
      .map(t => t.trim().replace(/^#/, ''))
      .filter(Boolean);
    localStorage.setItem(historyKey, JSON.stringify(history));
    renderHistory();
    updateStats();
  }
}

function renderHistory() {
  const items = getHistory();
  if (!items.length) {
    historyList.innerHTML = '<p class="empty">矩阵记录为空，输入链接并建立第一个灵感节点。</p>';
    return;
  }

  historyList.innerHTML = items.map((item) => {
    const tagsHtml = item.tags && item.tags.length 
      ? `<div class="history-item-tags">${item.tags.map(t => `<span class="tag-badge">#${escapeHtml(t)}</span>`).join("")}</div>`
      : "";
    const notePreview = item.note 
      ? `<p class="history-item-note">${escapeHtml(item.note)}</p>` 
      : '<p class="history-item-note empty-note">无关联笔记...</p>';
    const iconSvg = platformSvgs[item.platform] || platformSvgs["通用网页"];
    
    return `
      <div class="history-card" data-url="${escapeHtml(item.url)}">
        <div class="cyber-corner top-left"></div>
        <div class="cyber-corner top-right"></div>
        
        <div class="history-card-header">
          <div class="platform-info-row">
            <span class="platform-mini-icon">${iconSvg}</span>
            <strong>${escapeHtml(item.platform)}</strong>
          </div>
          <span class="history-date">${new Date(item.timestamp || Date.now()).toLocaleDateString('zh-CN')}</span>
        </div>
        <h4 class="history-card-title">${escapeHtml(item.title.replace(/已识别/, "已提取"))}</h4>
        ${notePreview}
        ${tagsHtml}
        <div class="history-card-actions">
          <button class="ghost-button view-card-btn" type="button">观察节点</button>
          <button class="ghost-button copy-link-btn" type="button" onclick="event.stopPropagation(); copyToClipboard('${escapeHtml(item.url)}', this)">复制原链</button>
        </div>
      </div>
    `;
  }).join("");
}

// Copy helper function (exposed to window for onclick handlers)
window.copyToClipboard = async (text, button) => {
  try {
    await navigator.clipboard.writeText(text);
    const originalText = button.textContent;
    button.textContent = "已复制";
    button.classList.add("copied-active");
    setTimeout(() => {
      button.textContent = originalText;
      button.classList.remove("copied-active");
    }, 1500);
  } catch {
    alert("复制失败，请手动选择复制。");
  }
};

window.downloadTrack = (url, label, ext = "") => {
  const a = document.createElement("a");
  const parsedExt = (() => {
    try {
      return new URL(url).pathname.split(".").pop() || "";
    } catch {
      return "";
    }
  })();
  const extension = (ext || parsedExt || "bin").replace(/[^\w-]/g, "");
  const filename = `${label || 'download'}.${extension}`;
  const shouldProxy = backendDownloadAvailable && /^https?:\/\//i.test(url);
  a.href = shouldProxy
    ? apiUrl(`/api/download?url=${encodeURIComponent(url)}&filename=${encodeURIComponent(filename)}`)
    : url;
  a.download = filename;
  a.target = "_blank";
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
};

function renderResult(data) {
  resultPanel.hidden = false;
  const iconSvg = platformSvgs[data.platform.name] || platformSvgs["通用网页"];
  
  // Prepare title and note
  const displayTitle = data.title.replace(/已识别/, "已提取");
  const displayNote = data.note || data.sourceDetail?.extractorHint || "";
  const items = Array.isArray(data.items) ? data.items : [];
  const extractorHint = data.sourceDetail?.extractorHint || "";

  // Load saved tags & notes if this url is cached
  const history = getHistory();
  const cached = history.find(item => item.url === data.url);
  const savedNote = cached ? cached.note : "";
  const savedTags = cached ? cached.tags : [];

  // Holographic palette rendering
  const palette = platformPalettes[data.platform.name] || platformPalettes["通用网页"];
  const paletteHtml = `
    <div class="palette-container">
      <h4 class="palette-title">🎨 全息色彩矩阵分析 (PALETTE MATRIX)</h4>
      <div class="palette-grid-row">
        ${palette.map(color => `
          <div class="palette-chip" style="background-color: ${color};" onclick="copyToClipboard('${color}', this)" title="点击复制 Hex 代码">
            <span class="color-hex">${color}</span>
          </div>
        `).join("")}
      </div>
    </div>
  `;

  resultPanel.innerHTML = `
    <div class="inspiration-card">
      <div class="cyber-corner top-left"></div>
      <div class="cyber-corner top-right"></div>
      <div class="cyber-corner bottom-left"></div>
      <div class="cyber-corner bottom-right"></div>
      
      <div class="card-decorations">
        <span class="digital-tag">[ MATRIX NODE ]</span>
      </div>
      <div class="result-head">
        <span class="platform-icon">${iconSvg}</span>
        <div>
          <h2>${escapeHtml(displayTitle)}</h2>
          <p class="source-info">
            来源: <strong>${escapeHtml(data.platform.name)}</strong> · 
            <a class="original-link-btn" href="${escapeHtml(data.url)}" target="_blank" rel="noopener">打开原链接 ↗</a>
          </p>
        </div>
      </div>
      ${displayNote ? `<p class="result-note">${escapeHtml(displayNote)}</p>` : ""}
      ${extractorHint && extractorHint !== displayNote ? `<p class="result-note warning">${escapeHtml(extractorHint)}</p>` : ""}
      
      <div class="resource-block">
        <h3 class="resource-title">提取的媒体轨道 / 资源下载</h3>
        <div class="download-options">
          ${items.length ? items.map((item) => `
            <div class="download-item">
              <div>
                <strong>${escapeHtml(item.label)}</strong>
                <small> · ${escapeHtml(item.type)}</small>
              </div>
              <span class="pill">${escapeHtml(item.quality)}</span>
              <div class="item-actions">
                ${item.url ? `<button class="download-link view-btn" type="button" data-action="download" data-url="${escapeHtml(item.url)}" data-label="${escapeHtml(item.label)}" data-ext="${escapeHtml(item.ext || "")}">下载</button>` : ""}
                ${item.url ? `<button class="ghost-button copy-btn" type="button" data-action="copy" data-url="${escapeHtml(item.url)}">复制</button>` : ""}
              </div>
            </div>
          `).join("") : `<p class="empty">没有拿到可用媒体资源。${escapeHtml(extractorHint || "这个链接可能需要 Cookie、登录态或稍后再试。")}</p>`}
        </div>
      </div>

      ${paletteHtml}

      <div class="card-notes-section">
        <label for="cardNote">✍️ 灵感备忘笔记 (自动记录)</label>
        <textarea id="cardNote" placeholder="在此写下你对该素材的想法，如: 配色极其舒服、转场过渡非常巧妙，打算用在下期设计中。">${escapeHtml(savedNote)}</textarea>
      </div>

      <div class="card-tags-section">
        <label for="cardTags">🏷️ 灵感标签 (自动记录)</label>
        <input type="text" id="cardTags" placeholder="设计, 调色, 动效参考" value="${escapeHtml(savedTags.join(", "))}">
      </div>

      <div class="card-footer-info">
        <span>此素材节点已保存至当前浏览器。本页面可静态上线，真实平台音视频提取需要后端服务配合。</span>
      </div>
    </div>
  `;

  // Dynamic Auto-Saving listeners
  const noteArea = resultPanel.querySelector("#cardNote");
  const tagsInput = resultPanel.querySelector("#cardTags");
  
  const autoSave = () => {
    updateHistoryNotesAndTags(data.url, noteArea.value, tagsInput.value);
  };
  
  noteArea.addEventListener("input", autoSave);
  tagsInput.addEventListener("input", autoSave);
}

function renderError(message) {
  const iconSvg = platformSvgs["未知平台"];
  resultPanel.hidden = false;
  resultPanel.innerHTML = `
    <div class="result-head">
      <span class="platform-icon" style="color: #ef4444;">${iconSvg}</span>
      <div>
        <h2>解析失败</h2>
        <p>${escapeHtml(message)}</p>
      </div>
    </div>
  `;
}

resultPanel.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-action]");
  if (!button) return;
  const action = button.dataset.action;
  const itemUrl = button.dataset.url;
  if (!itemUrl) return;

  if (action === "download") {
    downloadTrack(itemUrl, button.dataset.label || "resource", button.dataset.ext || "");
    return;
  }

  if (action === "copy") {
    copyToClipboard(itemUrl, button);
  }
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const url = input.value.trim();
  if (!url) return;

  resultPanel.hidden = false;
  resultPanel.innerHTML = `
    <div class="result-loading">
      <div class="spinner"></div>
      <div>
        <h3>正在提取多维矩阵...</h3>
        <p>正在识别来源并构建可关联的多媒体素材节点</p>
      </div>
    </div>
  `;

  if (window.innerWidth <= 768) {
    resultPanel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  try {
    const data = await parseWithOptionalBackend(url);
    
    const history = getHistory();
    const cached = history.find(item => item.url === data.url);

    const newEntry = {
      url: data.url,
      platform: data.platform.name,
      title: data.title,
      note: cached ? cached.note : "",
      tags: cached ? cached.tags : [],
      items: data.items,
      timestamp: Date.now()
    };

    saveHistory(newEntry);
    renderResult({
      url: newEntry.url,
      platform: { name: newEntry.platform },
      title: newEntry.title,
      note: newEntry.note,
      items: newEntry.items,
      sourceDetail: data.sourceDetail
    });
  } catch (error) {
    renderError(error.message);
  }
});

pasteButton.addEventListener("click", async () => {
  try {
    const text = await navigator.clipboard.readText();
    input.value = text.trim();
    input.focus();
  } catch {
    renderError("浏览器未允许读取剪贴板，请手动粘贴链接。");
  }
});

// View from History click
historyList.addEventListener("click", (event) => {
  const card = event.target.closest(".history-card");
  if (!card) return;

  const url = card.dataset.url;
  const items = getHistory();
  const match = items.find(item => item.url === url);
  if (match) {
    input.value = url;
    renderResult({
      url: match.url,
      platform: { name: match.platform },
      title: match.title,
      note: "从您的历史灵感矩阵调取了该素材。",
      items: match.items
    });
    resultPanel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
});

clearHistoryButton.addEventListener("click", () => {
  localStorage.removeItem(historyKey);
  renderHistory();
  updateStats();
});

// --- prefers-color-scheme media listener & toggle mapping ---
const colorSchemeQuery = window.matchMedia("(prefers-color-scheme: dark)");

function applySystemTheme(e) {
  if (!localStorage.getItem("theme")) {
    if (e.matches) {
      document.body.classList.add("dark");
      themeToggle.textContent = "浅色";
    } else {
      document.body.classList.remove("dark");
      themeToggle.textContent = "深色";
    }
  }
}
colorSchemeQuery.addEventListener("change", applySystemTheme);

// Setup Initial Theme
const storedTheme = localStorage.getItem("theme");
if (storedTheme === "dark" || (!storedTheme && colorSchemeQuery.matches)) {
  document.body.classList.add("dark");
  themeToggle.textContent = "浅色";
} else {
  document.body.classList.remove("dark");
  themeToggle.textContent = "深色";
}

themeToggle.addEventListener("click", () => {
  const hasDark = document.body.classList.contains("dark");
  if (hasDark) {
    document.body.classList.remove("dark");
    document.body.classList.add("light");
    themeToggle.textContent = "深色";
    localStorage.setItem("theme", "light");
  } else {
    document.body.classList.remove("light");
    document.body.classList.add("dark");
    themeToggle.textContent = "浅色";
    localStorage.setItem("theme", "dark");
  }
});

// Exporters & Cognitive Labs Panel Actions
const exportBtn = document.getElementById("exportMarkdown");
const exportPreviewBox = document.getElementById("exportPreviewBox");
const exportTextarea = document.getElementById("exportTextarea");
const copyExportBtn = document.getElementById("copyExport");
const statTags = document.getElementById("statTags");
const statCards = document.getElementById("statCards");

function updateStats() {
  const history = getHistory();
  if (statCards) statCards.textContent = history.length;
  
  const allTags = new Set();
  history.forEach(item => {
    if (item.tags) {
      item.tags.forEach(t => allTags.add(t));
    }
  });
  if (statTags) statTags.textContent = allTags.size;
}

if (exportBtn) {
  exportBtn.addEventListener("click", () => {
    const history = getHistory();
    if (!history.length) {
      alert("当前矩阵中暂无灵感记录。");
      return;
    }
    
    let md = `# MuseMatrix 灵感引证矩阵日志\n\n导出时间: ${new Date().toLocaleString()}\n\n`;
    md += `| 来源平台 | 灵感标题 | 原始链接 | 关联备注笔记 | 分类标签 |\n`;
    md += `| :--- | :--- | :--- | :--- | :--- |\n`;
    
    history.forEach(item => {
      const title = item.title.replace(/\|/g, "\\|");
      const note = (item.note || "").replace(/\|/g, "\\|").replace(/\n/g, " ");
      const tags = item.tags ? item.tags.map(t => `#${t}`).join(" ") : "无";
      md += `| ${item.platform} | ${title} | [查看原链接](${item.url}) | ${note} | ${tags} |\n`;
    });
    
    exportTextarea.value = md;
    exportPreviewBox.hidden = false;
    exportPreviewBox.scrollIntoView({ behavior: "smooth", block: "nearest" });
  });
}

if (copyExportBtn) {
  copyExportBtn.addEventListener("click", () => {
    copyToClipboard(exportTextarea.value, copyExportBtn);
  });
}

renderHistory();
updateStats();

// --- Interactive Particle Node connections simulator & Cursor Sparks ---
const canvas = document.getElementById("matrixParticles");
if (canvas) {
  const ctx = canvas.getContext("2d");
  let particles = [];
  let ambientOrbs = [];
  let sparks = [];
  const particleCount = 210; // Significantly denser network nodes
  const orbCount = 28;       // Background blurry ambient nebula orbs
  let mouse = { x: null, y: null, radius: 170 }; // Magnetic influence zone

  // Sparks node class for mouse trails (Elegant theme-synchronized single tone)
  class Spark {
    constructor(x, y) {
      this.x = x;
      this.y = y;
      const angle = Math.random() * Math.PI * 2;
      const speed = Math.random() * 1.2 + 0.3;
      this.vx = Math.cos(angle) * speed;
      this.vy = Math.sin(angle) * speed;
      this.life = 1.0;
      this.decay = Math.random() * 0.02 + 0.016; // Smooth fade out
      this.radius = Math.random() * 3.0 + 1.8;   // Subtle size
    }
    update() {
      this.x += this.vx;
      this.y += this.vy;
      this.vx *= 0.96; // Air resistance
      this.vy *= 0.96;
      this.life -= this.decay;
      this.radius *= 0.93; // Organic tapering decay
    }
    draw() {
      const isDark = document.body.classList.contains("dark");
      // Cohesive glowing stardust matching active theme (cyan-blue for dark, cobalt blue for light)
      const fillStr = isDark 
        ? `rgba(96, 165, 250, ${Math.max(0, this.life * 0.65)})` 
        : `rgba(37, 99, 235, ${Math.max(0, this.life * 0.5)})`;
      
      ctx.beginPath();
      ctx.arc(this.x, this.y, Math.max(0.1, this.radius), 0, Math.PI * 2);
      ctx.fillStyle = fillStr;
      ctx.fill();
    }
  }

  window.addEventListener("mousemove", (e) => {
    mouse.x = e.clientX;
    mouse.y = e.clientY;
    
    // Spawn subtle single-tone trail sparks
    for (let i = 0; i < 2; i++) {
      if (sparks.length < 150) {
        sparks.push(new Spark(e.clientX, e.clientY));
      }
    }
  });

  window.addEventListener("mouseout", () => {
    mouse.x = null;
    mouse.y = null;
  });

  function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }
  window.addEventListener("resize", resizeCanvas);
  resizeCanvas();

  // Layer 1: Ambient blurry slow-drifting background nebula orbs
  class AmbientOrb {
    constructor() {
      this.x = Math.random() * canvas.width;
      this.y = Math.random() * canvas.height;
      this.vx = (Math.random() - 0.5) * 0.14;
      this.vy = (Math.random() - 0.5) * 0.14;
      this.radius = Math.random() * 40 + 40; // Expanded to 40px - 80px blur orb for nebula feel
      
      // Select an ambient soft accent tone (mint green, cyber blue, neon purple)
      const hues = [140, 215, 270]; 
      this.hue = hues[Math.floor(Math.random() * hues.length)];
    }
    update() {
      this.x += this.vx;
      this.y += this.vy;

      if (this.x < -100) this.x = canvas.width + 100;
      if (this.x > canvas.width + 100) this.x = -100;
      if (this.y < -100) this.y = canvas.height + 100;
      if (this.y > canvas.height + 100) this.y = -100;
    }
    draw() {
      ctx.save();
      ctx.globalCompositeOperation = "screen";
      const grad = ctx.createRadialGradient(this.x, this.y, 0, this.x, this.y, this.radius);
      
      const isDark = document.body.classList.contains("dark");
      const baseOpacity = isDark ? 0.045 : 0.03; // slightly more visible for stunning contrast

      grad.addColorStop(0, `hsla(${this.hue}, 80%, 60%, ${baseOpacity})`);
      grad.addColorStop(0.5, `hsla(${this.hue}, 80%, 60%, ${baseOpacity * 0.4})`);
      grad.addColorStop(1, "rgba(0, 0, 0, 0)");
      
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
      ctx.fillStyle = grad;
      ctx.fill();
      ctx.restore();
    }
  }

  // Layer 2: Interactive Foreground constellation network (with gravity vortex)
  class NetworkNode {
    constructor() {
      this.x = Math.random() * canvas.width;
      this.y = Math.random() * canvas.height;
      // Store baseline drift velocity
      this.baseVx = (Math.random() - 0.5) * 0.45;
      this.baseVy = (Math.random() - 0.5) * 0.45;
      this.vx = this.baseVx;
      this.vy = this.baseVy;
      this.radius = Math.random() * 1.8 + 0.8;

      // Assign a specific premium color category per node (blue, mint, purple)
      const colorPresets = [
        { h: 217, s: 95, l: 68 }, // Cyber Blue
        { h: 150, s: 80, l: 58 }, // Mint Green
        { h: 265, s: 90, l: 72 }  // Neon Purple
      ];
      const selected = colorPresets[Math.floor(Math.random() * colorPresets.length)];
      this.hue = selected.h;
      this.sat = selected.s;
      this.light = selected.l;
    }
    update() {
      this.x += this.vx;
      this.y += this.vy;

      // Bounce on screen edges
      if (this.x < 0 || this.x > canvas.width) this.vx *= -1;
      if (this.y < 0 || this.y > canvas.height) this.vy *= -1;

      // Magnetic field physics
      if (mouse.x !== null && mouse.y !== null) {
        const dx = mouse.x - this.x;
        const dy = mouse.y - this.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        
        if (dist < mouse.radius) {
          // Force is stronger near the center of the cursor
          const force = (mouse.radius - dist) / mouse.radius;
          
          // 1. Attraction: pull towards the cursor coordinates
          const pullStrength = force * 0.18;
          this.vx += (dx / dist) * pullStrength;
          this.vy += (dy / dist) * pullStrength;
          
          // 2. Swirling vortex: orbit around the cursor to create beautiful gather visual depth
          // Perpendicular vector is (-dy, dx)
          const orbitStrength = force * 0.28;
          this.vx += (-dy / dist) * orbitStrength;
          this.vy += (dx / dist) * orbitStrength;
          
          // 3. Fluid drag: slow down nodes in magnetic range to gather them cleanly
          this.vx *= 0.94;
          this.vy *= 0.94;
        } else {
          // Restore organic baseline drifting speeds
          this.vx += (this.baseVx - this.vx) * 0.04;
          this.vy += (this.baseVy - this.vy) * 0.04;
        }
      } else {
        // Restore organic baseline drifting speeds
        this.vx += (this.baseVx - this.vx) * 0.04;
        this.vy += (this.baseVy - this.vy) * 0.04;
      }

      // Limit speed to maintain visual elegance
      const speed = Math.sqrt(this.vx * this.vx + this.vy * this.vy);
      const maxSpeed = 3.5;
      if (speed > maxSpeed) {
        this.vx = (this.vx / speed) * maxSpeed;
        this.vy = (this.vy / speed) * maxSpeed;
      }
    }
    draw(isDark) {
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
      const opacity = isDark ? 0.65 : 0.45;
      ctx.fillStyle = `hsla(${this.hue}, ${this.sat}%, ${this.light}%, ${opacity})`;
      ctx.fill();
    }
  }

  function initParticles() {
    particles = [];
    ambientOrbs = [];
    
    for (let i = 0; i < orbCount; i++) {
      ambientOrbs.push(new AmbientOrb());
    }
    for (let i = 0; i < particleCount; i++) {
      particles.push(new NetworkNode());
    }
  }
  initParticles();

  function animate() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const isDark = document.body.classList.contains("dark");
    
    // Draw Layer 1: Atmospheric Blurry Nebula Orbs
    for (let i = 0; i < ambientOrbs.length; i++) {
      ambientOrbs[i].update();
      ambientOrbs[i].draw();
    }

    // Draw Layer 2: main network nodes & connected web lines with linear gradients
    for (let i = 0; i < particles.length; i++) {
      particles[i].update();
      particles[i].draw(isDark);

      for (let j = i + 1; j < particles.length; j++) {
        const dx = particles[i].x - particles[j].x;
        const dy = particles[i].y - particles[j].y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 130) { 
          ctx.beginPath();
          // Dynamic linear gradient connecting node i and j based on their coordinate vector
          const grad = ctx.createLinearGradient(particles[i].x, particles[i].y, particles[j].x, particles[j].y);
          const fade = 1 - dist / 130;
          const baseLineOpacity = isDark ? 0.16 : 0.08;
          const finalOpacity = fade * baseLineOpacity;
          
          grad.addColorStop(0, `hsla(${particles[i].hue}, ${particles[i].sat}%, ${particles[i].light}%, ${finalOpacity})`);
          grad.addColorStop(1, `hsla(${particles[j].hue}, ${particles[j].sat}%, ${particles[j].light}%, ${finalOpacity})`);
          
          ctx.strokeStyle = grad;
          ctx.lineWidth = fade * 0.9;
          ctx.moveTo(particles[i].x, particles[i].y);
          ctx.lineTo(particles[j].x, particles[j].y);
          ctx.stroke();
        }
      }
    }

    // Draw and prune Layer 3: theme-synchronized stardust mouse trail
    sparks = sparks.filter(spark => {
      spark.update();
      spark.draw();
      return spark.life > 0;
    });

    requestAnimationFrame(animate);
  }
  animate();
}
