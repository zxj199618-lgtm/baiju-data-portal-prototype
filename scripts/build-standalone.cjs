const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const sourcePath = path.join(root, "index.html");
const outputPath = path.join(root, "baiju-data-portal-feishu-standalone.html");

const imagePaths = [
  "assets/momentx-observatory-logo.jpg",
  "assets/momentx-observatory-favicon-32.png",
  "assets/momentx-observatory-icon.png",
  "assets/nav-dashboard-default.png",
  "assets/nav-dashboard-active.png",
  "assets/nav-service-default.png",
  "assets/nav-service-active.png",
  "assets/nav-asset-default.png",
  "assets/nav-asset-active.png",
  "assets/nav-permission-default.png",
  "assets/nav-permission-active.png",
  "assets/nav-push-default.svg",
  "assets/nav-push-active.svg",
  // 侧栏图标按「默认/选中」成对列举：漏一个就会让单文件版在别人电脑上缺图标
  "assets/nav-analysis-default.svg",
  "assets/nav-analysis-active.svg",
  "assets/nav-alert-default.svg",
  "assets/nav-alert-active.svg",
  "assets/nav-system-default.svg",
  "assets/nav-system-active.svg",
  "assets/nav-ai-default.svg",
  "assets/nav-ai-active.svg",
  // 大数据工具箱：一级图标 + 每个工具卡片/页签用的区分图标
  "assets/nav-toolbox-default.svg",
  "assets/nav-toolbox-active.svg",
  "assets/tool-backfill.svg",
  "assets/tool-compare.svg",
  "assets/tool-env.svg",
  "assets/nav-toolbox-biz-default.svg",
  "assets/nav-toolbox-biz-active.svg",
  "assets/tool-audience.svg",
  "assets/tool-drama-account.svg",
  "assets/home-hero.png"
];

const textAssets = [
  { assetPath: "assets/vendor/element-plus.css", kind: "style" },
  { assetPath: "assets/cp-vue-module.css", kind: "style" },
  { assetPath: "assets/portal-vue-module.css", kind: "style" },
  { assetPath: "assets/portal-shell.css", kind: "style" },
  { assetPath: "assets/portal-bridge.js", kind: "script" },
  { assetPath: "assets/cp-bridge.js", kind: "script" },
  { assetPath: "assets/vendor/vue.global.prod.js", kind: "script" },
  { assetPath: "assets/vendor/element-plus.full.min.js", kind: "script" },
  { assetPath: "assets/vendor/element-plus.zh-cn.min.js", kind: "script" },
  { assetPath: "assets/cp-vue-module.js", kind: "script" },
  { assetPath: "assets/portal-vue-module.js", kind: "script" }
];

let html = fs.readFileSync(sourcePath, "utf8");

for (const { assetPath, kind } of textAssets) {
  const absolutePath = path.join(root, assetPath);
  // index.html 给静态资源加了 ?v= 版本号（强制刷新缓存），这里必须容忍版本查询串，
  // 否则单文件版会漏掉页面 JS/CSS，只剩相对路径引用。
  const escaped = assetPath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const tagPattern = kind === "style"
    ? new RegExp(`<link rel="stylesheet" href="${escaped}(\\?v=[^"]*)?"\\s*/?>`)
    : new RegExp(`<script src="${escaped}(\\?v=[^"]*)?"><\\/script>`);
  if (!fs.existsSync(absolutePath)) throw new Error(`Missing standalone asset: ${assetPath}`);
  const source = fs.readFileSync(absolutePath, "utf8");
  const inlineTag = kind === "style"
    ? `<style data-inline-source="${assetPath}">${source.replace(/<\/style/gi, "<\\/style")}</style>`
    : `<script data-inline-source="${assetPath}">${source.replace(/<\/script/gi, "<\\/script")}</script>`;
  if (!tagPattern.test(html)) throw new Error(`Standalone asset tag not found in index.html: ${assetPath}`);
  html = html.replace(tagPattern, () => inlineTag);
}

for (const imagePath of imagePaths) {
  const imageBuffer = fs.readFileSync(path.join(root, imagePath));
  const mimeType = imagePath.endsWith(".svg")
    ? "image/svg+xml"
    : imagePath.endsWith(".jpg")
      ? "image/jpeg"
      : "image/png";
  const dataUri = `data:${mimeType};base64,${imageBuffer.toString("base64")}`;
  html = html.split(imagePath).join(dataUri);
}

fs.writeFileSync(outputPath, html);
console.log(`Standalone prototype generated: ${outputPath}`);
