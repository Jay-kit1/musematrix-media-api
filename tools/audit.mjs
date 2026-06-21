import fs from "node:fs";
import path from "node:path";

const root = path.resolve(new URL("..", import.meta.url).pathname);
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

const files = {
  html: read("public/index.html"),
  css: read("public/styles.css"),
  js: read("public/app.js"),
  readme: read("README.md")
};

const checks = [];

function check(name, passed, detail = "") {
  checks.push({ name, passed, detail });
}

check("Has parser form", files.html.includes('id="parser"'));
check("Has media URL input", files.html.includes('id="mediaUrl"'));
check("Has result panel", files.html.includes('id="resultPanel"'));
check("Has history list", files.html.includes('id="historyList"'));
check(
  "Keeps API call",
  files.js.includes('fetch("/api/parse"') || files.js.includes('fetch(apiUrl("/api/parse")')
);
check("Keeps clipboard paste", files.js.includes("navigator.clipboard.readText"));
check("Keeps theme toggle", files.js.includes("themeToggle"));

const publicCopy = files.html.replace(/<script[\s\S]*?<\/script>/g, "");
const snapAnyMatches = publicCopy.match(/SnapAny/g) || [];
check(
  "SnapAny is not product branding",
  snapAnyMatches.length <= 2,
  `${snapAnyMatches.length} public SnapAny mentions`
);

const downloadWords = publicCopy.match(/解析下载|万能下载|下载所有|下载平台/g) || [];
check(
  "No download-site wording",
  downloadWords.length === 0,
  downloadWords.length ? `Found: ${[...new Set(downloadWords)].join(", ")}` : ""
);

const preferredActions = ["整理链接", "生成素材卡片", "查看资源", "打开原链接", "保存到灵感板"];
check(
  "Uses inspiration-workspace action language",
  preferredActions.some((word) => publicCopy.includes(word)),
  `Expected one of: ${preferredActions.join(" / ")}`
);

check(
  "Has responsive CSS",
  /@media\s*\(\s*max-width/.test(files.css),
  "Expected at least one max-width media query"
);

const failed = checks.filter((item) => !item.passed);

for (const item of checks) {
  const mark = item.passed ? "PASS" : "FAIL";
  console.log(`${mark} ${item.name}${item.detail ? ` - ${item.detail}` : ""}`);
}

if (failed.length) {
  console.error(`\n${failed.length} audit check(s) failed.`);
  process.exit(1);
}

console.log("\nAll audit checks passed.");
