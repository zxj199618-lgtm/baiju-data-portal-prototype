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
  const tag = kind === "style"
    ? `<link rel="stylesheet" href="${assetPath}" />`
    : `<script src="${assetPath}"></script>`;
  if (!fs.existsSync(absolutePath)) throw new Error(`Missing standalone asset: ${assetPath}`);
  const source = fs.readFileSync(absolutePath, "utf8");
  const inlineTag = kind === "style"
    ? `<style data-inline-source="${assetPath}">${source.replace(/<\/style/gi, "<\\/style")}</style>`
    : `<script data-inline-source="${assetPath}">${source.replace(/<\/script/gi, "<\\/script")}</script>`;
  html = html.replace(tag, () => inlineTag);
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
