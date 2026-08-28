const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.join(__dirname, "..");
const read = relative => fs.readFileSync(path.join(root, relative), "utf8");
const exists = relative => fs.existsSync(path.join(root, relative));
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const html = read("index.html");
const portalBridge = read("assets/portal-bridge.js");
const audienceBridge = read("assets/cp-bridge.js");
const portalVue = read("assets/portal-vue-module.js");
const audienceVue = read("assets/cp-vue-module.js");

[
  "assets/portal-bridge.js",
  "assets/cp-bridge.js",
  "assets/portal-vue-module.js",
  "assets/cp-vue-module.js",
  "assets/portal-vue-module.css",
  "assets/cp-vue-module.css",
  "assets/portal-shell.css",
  "assets/vendor/vue.global.prod.js",
  "assets/vendor/element-plus.full.min.js",
  "assets/vendor/element-plus.zh-cn.min.js",
  "assets/vendor/element-plus.css"
].forEach(file => assert(exists(file), `缺少运行资源: ${file}`));

assert(!/<style[\s>]/.test(html), "入口不应再内联样式");
assert(!/<script>([\s\S]*?)<\/script>/.test(html), "入口不应再内联脚本");
assert(html.includes('href="assets/portal-shell.css"'), "入口应加载公共壳层样式");
[
  "assets/portal-bridge.js",
  "assets/cp-bridge.js",
  "assets/vendor/vue.global.prod.js",
  "assets/vendor/element-plus.full.min.js",
  "assets/vendor/element-plus.zh-cn.min.js",
  "assets/cp-vue-module.js",
  "assets/portal-vue-module.js"
].reduce((lastIndex, source) => {
  const index = html.indexOf(`src="${source}"`);
  assert(index > lastIndex, `脚本加载顺序错误或缺失: ${source}`);
  return index;
}, -1);

[
  ["assets/portal-bridge.js", portalBridge],
  ["assets/cp-bridge.js", audienceBridge],
  ["assets/portal-vue-module.js", portalVue],
  ["assets/cp-vue-module.js", audienceVue]
].forEach(([file, source]) => new vm.Script(source, { filename: file }));

const expected = [
  "校验并保存",
  "确认保存",
  "返回修改",
  "pendingValidation",
  "管理需求分类",
  "SQL 格式校验",
  "结果列校验",
  "单库查询校验",
  "数据条数校验",
  "2,000 万条",
  "AUDIENCE_LIMIT = 20000000",
  "超过 2,000 万条上限，不能创建人群包",
  "validationDelay(900)"
];
for (const token of expected) {
  assert(audienceVue.includes(token), `缺少校验能力：${token}`);
}

[
  "DMP 数据类型",
  "dmpDataType",
  "IDFA_MD5",
  "IMEI_MD5",
  "MOBILE_HASH_SHA256",
  "OAID_MD5",
  "请选择 DMP 数据类型"
].forEach(token => assert(audienceVue.includes(token), `DMP 文件缺少数据类型配置：${token}`));

assert(
  html.includes("audiencePackageId") || portalVue.includes("audiencePackageId") || audienceVue.includes("audiencePackageId") || portalBridge.includes("audiencePackageId") || audienceBridge.includes("audiencePackageId"),
  "缺少人群包回调 ID 规则：audiencePackageId"
);

assert(!audienceVue.includes("audienceIdPreview"), "新增或编辑人群包表单仍展示 ID 预览");
["手动同步", "保存并同步", "校验 &amp; 预估人数", "estimateAudience"].forEach(token => {
  assert(!audienceVue.includes(token), `人群包模块仍保留旧能力：${token}`);
});

const tagExpected = [
  "tag-enum-drawer",
  "enumValues",
  "enumMode",
  "手动添加",
  "上传枚举值",
  "downloadEnumTemplate",
  "每行一个枚举值"
];
for (const token of tagExpected) {
  assert(portalVue.includes(token) || audienceVue.includes(token), `标签管理缺少枚举编辑能力：${token}`);
}

const drawerTags = [...portalVue.matchAll(/<el-drawer\b[^>]*>/g), ...audienceVue.matchAll(/<el-drawer\b[^>]*>/g)].map(match => match[0]);
assert(drawerTags.length > 0, "应存在右侧抽屉");
assert(drawerTags.every(tag => tag.includes(':close-on-click-modal="true"')), "右侧抽屉必须支持点击遮罩区域关闭");

[
  "momentx-observatory-logo.jpg",
  "momentx-observatory-icon.png",
  "momentx-observatory-favicon-32.png",
  "home-hero.png",
  "nav-dashboard-default.png",
  "nav-dashboard-active.png",
  "nav-service-default.png",
  "nav-service-active.png",
  "nav-asset-default.png",
  "nav-asset-active.png",
  "nav-permission-default.png",
  "nav-permission-active.png",
  "nav-push-default.svg",
  "nav-push-active.svg"
].forEach(file => assert(exists(`assets/${file}`), `缺少品牌资产: ${file}`));

assert(html.includes('href="assets/momentx-observatory-favicon-32.png"'), "入口应使用站点 favicon");
assert(portalBridge.includes('default: "assets/nav-push-default.svg"'), "推送导航图标应引用独立 SVG");
assert(!portalBridge.includes("data:image/"), "门户桥接脚本不应再内嵌 data URL 图片");
assert(!portalVue.includes("data:image/png;base64") && !portalVue.includes("data:image/jpeg;base64"), "门户 Vue 模块不应再内嵌品牌图");

console.log("观星台原型 smoke test: passed");
