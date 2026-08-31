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
  const index = html.indexOf(`src="${source}"`) !== -1 ? html.indexOf(`src="${source}"`) : html.indexOf(`src="${source}?`);
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

assert(portalBridge.includes('name: "维表管理"') && portalBridge.includes('name: "字典管理"'), "数据资产应包含维表管理与字典管理菜单");
assert(portalBridge.includes('name: "API配置", badge: "2.0"'), "API配置应标记 2.0");
assert(portalBridge.includes('name: "表管理", badge: ["2.0", "3.0", "4.0"]') && portalBridge.includes('name: "标签管理", badge: "3.0"') && portalBridge.indexOf('name: "标签管理"') > portalBridge.indexOf('name: "表管理"') && portalBridge.indexOf('name: "维表管理"') > portalBridge.indexOf('name: "标签管理"'), "标签管理应紧跟表管理，位于维表管理之前");
assert(portalBridge.includes('badge: "3.0", items: [{ name: "人群包推送渠道", badge: "3.0" }]'), "数据推送应标记 3.0");
assert(portalVue.includes("navBadges("), "侧栏应支持同一菜单展示多个版本角标");
assert(!portalBridge.includes("isNew: true") && !portalVue.includes(">NEW</el-tag>"), "菜单不应再使用 NEW 角标");
assert(portalVue.includes("设为维表") && portalVue.includes("关联字典") && portalVue.includes("portal-vue-dict-preview"), "表管理应支持设为维表并在关联字典时悬停预览");
assert(portalVue.includes("设为标签表，保存后出现在「标签管理」"), "新建表应支持设为标签表且不配置导出字段");
assert(!portalVue.includes("字典转换预览"), "字段列表不应再展示字典转换预览列");
assert(!portalVue.includes("导入维表数据") && !portalVue.includes("importVisible"), "维表数据维护不应再提供导入");
assert(portalVue.includes("新增维表") && portalVue.includes("维护数据") && portalVue.includes("维护枚举值"), "维表与字典应提供独立维护入口");
assert(portalBridge.includes("dataDictionaries") && portalVue.includes("state.dictionaries"), "字典数据应通过门户状态共享");
assert(portalVue.includes("被 {{ refList(scope.row).length }} 处引用") && portalVue.includes("portal-vue-ref-tooltip"), "字典列表应展示引用表和字段，并支持悬停换行");
assert(html.includes('id="dimensionView"') && html.includes('id="dictionaryView"') && html.includes('id="dimensionDataView"'), "入口应挂载维表和字典页面");

assert(portalBridge.indexOf('group: "分析工作台"') !== -1 && portalBridge.indexOf('group: "分析工作台"') < portalBridge.indexOf('group: "数据看板"'), "分析工作台应作为首个导航分组");
assert(portalBridge.includes('name: "分析工作台", badge: "5.0"'), "分析工作台菜单应标记 5.0");
assert(html.includes('id="analysisWorkbenchView"') && portalVue.includes("mount(\"#analysisWorkbenchView\""), "分析工作台应挂载独立视图");
assert(portalVue.includes("AnalysisWorkbenchApp") && portalVue.includes("飞书机器人"), "分析工作台应提供飞书机器人沟通入口");
assert(portalVue.includes("会话记录") && portalVue.includes("含飞书机器人") && portalVue.includes("分析资产"), "分析工作台应包含资产菜单与会话记录（含飞书机器人会话）");
assert(portalVue.includes("assetDrawer") && portalVue.includes("jumpToSource") && portalVue.includes("archiveReport"), "完成的会话应归档为分析资产报告，抽屉先展示内容并可跳回来源会话");
assert(portalVue.includes("数据表权限") && portalVue.includes("toggleAllTables") && portalVue.includes("allTables"), "权限组应支持数据表权限配置");
assert(portalBridge.includes('tables: ["全部数据表"]'), "权限组数据应包含数据表权限维度");
assert(portalVue.includes("myTables"), "分析工作台应按权限组展示可用数据表");
assert(portalBridge.includes('group: "系统管理"') && portalBridge.includes('name: "菜单管理"') && portalBridge.includes('name: "Skill 配置"'), "系统管理应包含菜单管理与 Skill 配置");
assert(html.includes('id="menuManagementView"') && portalVue.includes("mount(\"#menuManagementView\""), "菜单管理应挂载独立视图");
assert(portalVue.includes("MenuManagementApp") && portalVue.includes("权限标识") && portalVue.includes("组件路径"), "菜单管理应提供层级树/组件路径/权限标识配置");
assert(html.includes('id="skillManagementView"') && portalVue.includes("mount(\"#skillManagementView\""), "Skill 配置应挂载独立视图");
assert(portalVue.includes("SkillManagementApp") && portalVue.includes("提示词") && portalVue.includes("沙箱试跑") && portalVue.includes("回滚到此版本"), "Skill 配置应支持提示词编辑/版本回滚/沙箱试跑");
assert(portalVue.includes("skillScenarios") && portalVue.includes("工作台展示") && portalVue.includes("openDisplay"), "工作台场景卡片应由 Skill 配置驱动（icon/标题/描述/排序/展示开关）");
assert(portalVue.includes('id: "warehouse-analyst", name: "数仓分析 Skill", source: "maxcompute-warehouse-analyst", version: "v1.2-portal", status: "已发布", traffic: 100') === false || portalVue.includes('scenarioKey: "single"'), "Skill 注册表应包含工作台展示元数据");
assert(portalBridge.includes('name: "模型配置"') && portalVue.includes("ModelConfigApp") && portalVue.includes("modelConfigView"), "系统管理应提供模型配置页");
assert(portalVue.includes("v1/model-config") && portalVue.includes("已禁用"), "模型配置应支持禁用历史模型并持久化到网关");
assert(portalBridge.includes('bizLine: "权益"') && portalVue.includes("bizLineOptions") && portalVue.includes("activeBizLine"), "数据表应支持业务线维度，分析工作台应支持先选业务线再选表");
assert(portalVue.includes('label="业务线"') && portalVue.includes("bizLines()"), "表管理应提供业务线列与筛选");

console.log("观星台原型 smoke test: passed");
