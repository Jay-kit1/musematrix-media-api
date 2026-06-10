const form = document.querySelector("#parser");
const input = document.querySelector("#mediaUrl");
const resultPanel = document.querySelector("#resultPanel");
const pasteButton = document.querySelector("#pasteButton");
const clearHistoryButton = document.querySelector("#clearHistory");
const historyList = document.querySelector("#historyList");
const themeToggle = document.querySelector("#themeToggle");

const historyKey = "snapany-history";

// Custom premium SVGs for results
const platformSvgs = {
  "抖音 / TikTok": `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.17-2.89-.74-3.94-1.78-.22-.22-.41-.47-.59-.73v7.02c0 3.73-2.07 6.84-5.59 7.42-3.15.51-6.48-.96-7.8-3.9C3.12 14.54 4.04 10.3 7.44 8.78c.85-.38 1.8-.57 2.73-.55v4.09c-.65-.06-1.34.14-1.84.58-.92.82-.93 2.39-.02 3.21.82.74 2.18.66 2.87-.24.31-.41.44-.92.42-1.43V.02z"/></svg>`,
  "YouTube": `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M23.498 6.163a3.003 3.003 0 0 0-2.11-2.11C19.517 3.545 12 3.545 12 3.545s-7.517 0-9.388.508a3.003 3.003 0 0 0-2.11 2.11C0 8.033 0 12 0 12s0 3.967.502 5.837a3.003 3.003 0 0 0 2.11 2.11c1.871.508 9.388.508 9.388.508s7.517 0 9.388-.508a3.003 3.003 0 0 0 2.11-2.11C24 15.967 24 12 24 12s0-3.967-.502-5.837zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>`,
  "哔哩哔哩": `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M17.87 2.33a.75.75 0 0 1 1.05.14l2.13 2.79a.75.75 0 1 1-1.18.91l-2.13-2.79a.75.75 0 0 1 .13-1.05zm-11.74 0a.75.75 0 0 1 .13 1.05L4.13 6.17a.75.75 0 1 1-1.18-.91l2.13-2.79a.75.75 0 0 1 1.05-.14zM20 7.5a3 3 0 0 1 3 3v8a3 3 0 0 1-3 3H4a3 3 0 0 1-3-3v-8a3 3 0 0 1 3-3h16zm-12 5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3zm8 0a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3z"/></svg>`,
  "X / Twitter": `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>`,
  "Pinterest": `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12.017 0C5.396 0 .029 5.367.029 11.987c0 5.079 3.158 9.417 7.618 11.162-.105-.949-.199-2.403.041-3.439.219-.937 1.406-5.966 1.406-5.966s-.359-.72-.359-1.781c0-1.668.967-2.914 2.171-2.914 1.023 0 1.518.769 1.518 1.69 0 1.029-.655 2.568-.994 3.995-.283 1.194.599 2.169 1.777 2.169 2.133 0 3.772-2.249 3.772-5.495 0-2.873-2.064-4.882-5.012-4.882-3.414 0-5.418 2.561-5.418 5.207 0 1.031.397 2.138.893 2.738.098.119.112.224.083.345l-.333 1.36c-.053.22-.174.267-.402.161-1.499-.698-2.436-2.889-2.436-4.649 0-3.785 2.75-7.262 7.929-7.262 4.163 0 7.398 2.967 7.398 6.931 0 4.136-2.607 7.464-6.227 7.464-1.216 0-2.359-.631-2.75-1.378l-.748 2.853c-.271 1.043-1.002 2.35-1.492 3.146 1.124.347 2.317.535 3.554.535 6.621 0 11.985-5.367 11.985-11.988C24.005 5.367 18.638 0 12.017 0z"/></svg>`,
  "Facebook": `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>`,
  "Instagram": `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.051.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 1 0 0 12.324 6.162 6.162 0 0 0 0-12.324zM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm6.406-11.845a1.44 1.44 0 1 0 0 2.881 1.44 1.44 0 0 0 0-2.881z"/></svg>`,
  "Reddit": `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M24 11.5c0-1.65-1.35-3-3-3-.96 0-1.86.48-2.42 1.24-1.64-1-3.85-1.64-6.23-1.72l1.09-3.43 3.57.77c.05.98.87 1.74 1.86 1.74 1.02 0 1.85-.83 1.85-1.85S19.02 3.5 18 3.5c-.83 0-1.54.55-1.77 1.29l-3.98-.86c-.25-.06-.5.08-.58.32l-1.32 4.17C7.96 8.5 5.75 9.14 4.1 10.15c-.55-.73-1.43-1.15-2.35-1.15-1.65 0-3 1.35-3 3 0 1.12.63 2.12 1.56 2.62C.21 15.35.15 16.03.15 16.65c0 3.97 4.7 7.2 10.5 7.2s10.5-3.23 10.5-7.2c0-.62-.06-1.3-.16-1.53.93-.5 1.56-1.5 1.56-2.62zM7.5 15c-.83 0-1.5-.67-1.5-1.5S6.67 12 7.5 12s1.5.67 1.5 1.5S8.33 15 7.5 15zm9.46 3.92c-.83.83-2.4 1.08-3.46 1.08s-2.63-.25-3.46-1.08c-.2-.2-.2-.5 0-.7.2-.2.5-.2.7 0 .6.6 1.76.88 2.76.88s2.16-.28 2.76-.88c.2-.2.5-.2.7 0 .2.2.2.5 0 .7zm-.46-3.92c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5z"/></svg>`,
  "Vimeo": `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M23.977 6.416c-.105 2.338-1.739 5.543-4.894 9.609-3.268 4.247-6.026 6.37-8.282 6.37-1.403 0-2.584-1.294-3.541-3.881L5.113 10.58c-.648-2.39-1.348-3.585-2.107-3.585-.152 0-.683.315-1.589.949L0 6.643c1.018-.891 2.019-1.772 3.002-2.64 1.352-1.18 2.353-1.786 3.002-1.817 1.536-.073 2.484.978 2.846 3.156.402 2.39.683 3.866.837 4.426.463 1.95.957 2.926 1.48 2.926.392 0 .991-.63 1.786-1.892.793-1.264 1.218-2.223 1.272-2.88.103-1.053-.299-1.58-1.21-1.58-.443 0-.897.102-1.363.308 1.93-6.33 6.61-6.197 7.151-.249z"/></svg>`,
  "直接媒体链接": `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg>`,
  "通用网页": `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2 2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>`,
  "未知平台": `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`
};

function escapeHtml(value) {
  return value.replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[char]);
}

function getHistory() {
  try {
    return JSON.parse(localStorage.getItem(historyKey) || "[]");
  } catch {
    return [];
  }
}

function saveHistory(entry) {
  const next = [entry, ...getHistory().filter((item) => item.url !== entry.url)].slice(0, 6);
  localStorage.setItem(historyKey, JSON.stringify(next));
  renderHistory();
}

function renderHistory() {
  const items = getHistory();
  if (!items.length) {
    historyList.innerHTML = '<p class="empty">还没有解析记录。</p>';
    return;
  }

  historyList.innerHTML = items.map((item) => `
    <button class="history-item" type="button" data-url="${escapeHtml(item.url)}">
      <strong>${escapeHtml(item.platform)}</strong>
      <small>${escapeHtml(item.url)}</small>
    </button>
  `).join("");
}

function renderResult(data) {
  const iconSvg = platformSvgs[data.platform.name] || platformSvgs["通用网页"];
  resultPanel.hidden = false;
  resultPanel.innerHTML = `
    <div class="result-head">
      <span class="platform-icon">${iconSvg}</span>
      <div>
        <h2>${escapeHtml(data.title)}</h2>
        <p>${escapeHtml(data.note)}</p>
      </div>
    </div>
    <div class="download-options">
      ${data.items.map((item) => `
        <div class="download-item">
          <div>
            <strong>${escapeHtml(item.label)}</strong>
            <small> · ${escapeHtml(item.type)}</small>
          </div>
          <span class="pill">${escapeHtml(item.quality)}</span>
          <a class="download-link" href="${escapeHtml(item.url)}" target="_blank" rel="noopener" download>下载</a>
        </div>
      `).join("")}
    </div>
  `;
}

function renderError(message) {
  const iconSvg = platformSvgs["未知平台"];
  resultPanel.hidden = false;
  resultPanel.innerHTML = `
    <div class="result-head">
      <span class="platform-icon" style="color: var(--warning);">${iconSvg}</span>
      <div>
        <h2>解析失败</h2>
        <p>${escapeHtml(message)}</p>
      </div>
    </div>
  `;
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const url = input.value.trim();
  if (!url) return;

  resultPanel.hidden = false;
  resultPanel.innerHTML = `
    <div class="result-loading">
      <div class="spinner"></div>
      <div>
        <h3>正在智能解析链接...</h3>
        <p>正在识别来源并提取可用的视频、图片和音频文件</p>
      </div>
    </div>
  `;

  // Smooth scroll to results on mobile/tablets
  if (window.innerWidth <= 768) {
    resultPanel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  try {
    const response = await fetch("/api/parse", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "解析服务暂时不可用。");
    renderResult(data);
    saveHistory({ url, platform: data.platform.name });
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

historyList.addEventListener("click", (event) => {
  const button = event.target.closest("[data-url]");
  if (!button) return;
  input.value = button.dataset.url;
  form.requestSubmit();
});

clearHistoryButton.addEventListener("click", () => {
  localStorage.removeItem(historyKey);
  renderHistory();
});

// Setup Initial Theme
if (localStorage.getItem("theme") === "dark" || 
    (!localStorage.getItem("theme") && window.matchMedia("(prefers-color-scheme: dark)").matches)) {
  document.body.classList.add("dark");
  themeToggle.textContent = "浅色";
} else {
  document.body.classList.remove("dark");
  themeToggle.textContent = "深色";
}

themeToggle.addEventListener("click", () => {
  document.body.classList.toggle("dark");
  const isDark = document.body.classList.contains("dark");
  themeToggle.textContent = isDark ? "浅色" : "深色";
  localStorage.setItem("theme", isDark ? "dark" : "light");
});

renderHistory();
