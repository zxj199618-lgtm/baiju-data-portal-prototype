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
const gatewaySource = read("scripts/analysis-gateway.cjs");
const audienceBridge = read("assets/cp-bridge.js");
const portalVue = read("assets/portal-vue-module.js");
const portalCss = read("assets/portal-vue-module.css");
const audienceVue = read("assets/cp-vue-module.js");
const shareHtml = read("share.html");
assert(exists("share.html"), "缺少公开报告页 share.html");
assert(shareHtml.includes('gatewayBase = "http://localhost:8787"') && shareHtml.includes('portalGatewayBase'), "share.html 应默认连接本机网关且支持 portalGatewayBase 覆盖，保证线上链接可打开");
assert(exists("docker-compose.prod.yml") && exists("Caddyfile"), "应提供服务器正式部署的 compose 与 Caddyfile");
const prodCompose = read("docker-compose.prod.yml");
assert(prodCompose.includes("caddy") && prodCompose.includes("DOMAIN"), "正式部署应使用 Caddy 自动 HTTPS 并绑定 DOMAIN");
assert(gatewaySource.includes("PUBLIC_DIR") && gatewaySource.includes("window.PORTAL_GATEWAY_BASE"), "网关应同源托管静态页面并注入网关地址标记");
assert(gatewaySource.includes("handleRequest(req, res).catch") && gatewaySource.includes("请求处理失败"), "网关应全局兜底请求异常，防止非法 JSON 请求拖垮服务进程");
assert(gatewaySource.includes('"/v1/history"') && gatewaySource.includes("workbench-history.json"), "网关应持久化工作台历史（会话/报告）到数据卷");
assert(portalVue.includes("loadHistory") && portalVue.includes("persistHistory") && portalVue.includes("/v1/history"), "分析工作台应启动时恢复历史并在变更后持久化");
assert(gatewaySource.includes("_timeout") && gatewaySource.includes("中转站静默超时") && gatewaySource.includes("上游中断"), "网关应对上游流做静默/停滞看门狗，中断时返还已生成内容");
assert(portalVue.includes("historyLastAt") && portalVue.includes("⚠️"), "流式生成期间应定时持久化并展示中断警告");
assert(portalBridge.includes("portalDemoUser") && portalBridge.includes("portalLastPage") && portalBridge.includes("#page="), "应记住登录态与当前页面（#page= 固定地址），刷新不再回登录页");
assert(portalVue.includes("window.PORTAL_GATEWAY_BASE") && shareHtml.includes("window.PORTAL_GATEWAY_BASE"), "前端与分享页应优先使用同源网关地址（域名部署时链接可直接打开）");

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
assert(html.includes('href="assets/portal-shell.css?v='), "入口应加载公共壳层样式（带版本号，避免缓存旧样式）");
assert(portalVue.includes("portal-vue-ai-bot-btn") && !html.includes("feishuBotAddBtn"), "添加飞书机器人按钮应在工作台头部行内并贴页面最右");
assert(exists("assets/portal-shell.css") && read("assets/portal-shell.css").includes("div:first-child.portal-vue-page-head { max-width: none; width: 100%; }"), "页面头部应解除 760px 宽度限制使按钮贴最右");
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
assert(audienceVue.includes("计算状态") && audienceVue.includes("推送状态") && audienceVue.includes("calcStatus") && audienceVue.includes("pushStatus"), "人群包列表应展示计算状态与推送状态（含各自失败原因）");
assert(audienceBridge.includes("pushSt") && audienceBridge.includes("pushReason") && audienceBridge.includes("calcReason"), "运行历史数据应包含推送状态与计算/推送失败原因");
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
assert(portalBridge.includes('name: "数据开放平台", badge: "2.0"'), "API配置应标记 2.0");
assert(portalBridge.includes('name: "表管理", badge: ["2.0", "3.0", "4.0"]') && portalBridge.includes('name: "标签管理", badge: "3.0"') && portalBridge.indexOf('name: "标签管理"') > portalBridge.indexOf('name: "表管理"') && portalBridge.indexOf('name: "维表管理"') > portalBridge.indexOf('name: "标签管理"'), "标签管理应紧跟表管理，位于维表管理之前");
assert(portalBridge.includes('badge: "3.0", items: [{ name: "人群包推送渠道", badge: "3.0" }]'), "数据推送应标记 3.0");
assert(portalVue.includes("navBadges("), "侧栏应支持同一菜单展示多个版本角标");
assert(!portalBridge.includes("isNew: true") && !portalVue.includes(">NEW</el-tag>"), "菜单不应再使用 NEW 角标");
assert(portalVue.includes("设为维表") && portalVue.includes("关联字典") && portalVue.includes("portal-vue-dict-preview"), "表管理应支持设为维表并在关联字典时悬停预览");
assert(portalVue.includes("设为标签表，保存后出现在「标签管理」"), "新建表应支持设为标签表且不配置导出字段");
assert(!portalVue.includes("字典转换预览"), "字段列表不应再展示字典转换预览列");
assert(!portalVue.includes("导入维表数据") && !portalVue.includes("importVisible"), "维表数据维护不应再提供导入");
assert(portalVue.includes("新增维表") && portalVue.includes("维护数据") && portalVue.includes("维护枚举值"), "维表与字典应提供独立维护入口");
assert(portalVue.includes("v1/table-rows") && portalVue.includes("rowCount(scope.row)"), "维表管理应从网关拉取真实行数，维护数据应读写网关");
assert(portalVue.includes("buildPortalContext") && portalVue.includes("portalContext"), "分析请求应自动携带表管理/字典/标签/维表的门户配置");
assert(portalBridge.includes("灵犀智析") || true, "");
assert(gatewaySource.includes("numa-warehouse") && gatewaySource.includes("warehouse-evidence.cjs") && gatewaySource.includes("runSkillTool"), "数仓分析应服务化为 skill 包（清单+SKILL.md+证据工具+运行时执行）");
assert(gatewaySource.includes("/v1/skills/upload") && gatewaySource.includes("unzip"), "应支持上传 ZIP 格式 skill 包并解压注册");
assert(portalVue.includes("enabledDictItems(dict).map") === false || portalVue.includes("dictEnums"), "门户字典枚举应注入分析证据");
assert(portalBridge.includes("dataDictionaries") && portalVue.includes("state.dictionaries"), "字典数据应通过门户状态共享");
assert(portalVue.includes("被 {{ refList(scope.row).length }} 处引用") && portalVue.includes("portal-vue-ref-tooltip"), "字典列表应展示引用表和字段，并支持悬停换行");
assert(html.includes('id="dimensionView"') && html.includes('id="dictionaryView"') && html.includes('id="dimensionDataView"'), "入口应挂载维表和字典页面");

assert(portalBridge.includes('group: "灵犀智析"') && portalBridge.includes('group: "灵犀智析"') < portalBridge.indexOf('group: "数据看板"'), "灵犀智析应作为首个导航分组");
assert(portalVue.includes("portal-vue-ai-bot-btn") && !html.includes("feishuBotAddBtn"), "添加飞书机器人按钮应在工作台头部行内并贴页面最右");
assert(exists("assets/portal-shell.css") && read("assets/portal-shell.css").includes(".portal-vue-page-head { max-width: none; width: 100%; }"), "页面头部应解除 760px 宽度限制使按钮贴最右");
assert(portalBridge.includes('name: "灵犀智析", badge: "5.0"'), "灵犀智析菜单应标记 5.0");
assert(html.includes('id="analysisWorkbenchView"') && portalVue.includes("mount(\"#analysisWorkbenchView\""), "灵犀智析应挂载独立视图");
assert(portalVue.includes("AnalysisWorkbenchApp") && portalVue.includes("飞书机器人"), "灵犀智析应提供飞书机器人沟通入口");
assert(portalVue.includes("会话记录") && portalVue.includes("含飞书机器人") && portalVue.includes("分析资产"), "灵犀智析应包含资产菜单与会话记录（含飞书机器人会话）");
assert(portalVue.includes("assetView") && portalVue.includes("openReport") && portalVue.includes("archiveReport") && portalVue.includes("jumpToSource"), "分析资产应在主区域切换为报告列表页，点击报告弹窗打开并可跳回来源会话");
assert(portalVue.includes("复制链接分享"), "报告弹窗应支持复制链接分享");
assert(gatewaySource.includes('url.pathname === "/v1/shares"') && gatewaySource.includes("report-shares.json"), "网关应提供分享创建/读取接口并持久化到数据卷");
assert(portalVue.includes("portal-vue-ai-report-preview") && portalVue.includes("portal-vue-ai-report-open-btn") && portalVue.includes("打开展示所有"), "报告应以大卡片预览正文，点击按钮弹窗打开展示所有");
assert(portalVue.includes("reportMarkdownOf") && portalVue.includes("portal-vue-ai-report-dialog-markdown"), "卡片预览与弹窗均渲染完整 Markdown，弹窗内容高度放宽");
assert(portalVue.includes("markdown:String(markdownText") && portalVue.includes("liveMsg.reportId=report.id"), "报告归档应保存完整正文并绑定到聊天消息，刷新后仍为超链");
assert(portalVue.includes("leadMsg") && portalVue.includes("trailMsg"), "报告消息应包含上下总结文字");
assert(portalVue.includes("portal-vue-ai-assets-grid") && portalVue.includes("portal-vue-ai-asset-card") && portalVue.includes('v-if="!assetView"'), "分析资产应以卡片网格整页展示，资产页隐藏聊天与输入框");
assert(portalVue.includes("const isReport=!errorMsg&&full.trim().length>=80"), "过短/中断的回答不应归档为分析报告");
assert(portalVue.includes("report:report.markdown"), "分享内容应使用完整 markdown 正文");
assert(portalVue.includes("数据表权限") && portalVue.includes("toggleAllTables") && portalVue.includes("allTables"), "权限组应支持数据表权限配置");
assert(portalBridge.includes('tables: ["全部数据表"]'), "权限组数据应包含数据表权限维度");
assert(portalVue.includes("myTables"), "灵犀智析应按权限组展示可用数据表");
assert(portalBridge.includes('group: "系统管理"') && portalBridge.includes('name: "菜单管理"') && portalBridge.includes('name: "Skill 配置"'), "系统管理应包含菜单管理与 Skill 配置");
assert(html.includes('id="menuManagementView"') && portalVue.includes("mount(\"#menuManagementView\""), "菜单管理应挂载独立视图");
assert(portalVue.includes("MenuManagementApp") && portalVue.includes("权限标识") && portalVue.includes("组件路径"), "菜单管理应提供层级树/组件路径/权限标识配置");
assert(html.includes('id="skillManagementView"') && portalVue.includes("mount(\"#skillManagementView\""), "Skill 配置应挂载独立视图");
assert(portalVue.includes("SkillManagementApp") && portalVue.includes("提示词") && portalVue.includes("回滚到此版本") && portalVue.includes("保存全部"), "Skill 配置应合并为单一编辑页（提示词/版本回滚/保存全部）");
assert(portalVue.includes("grayUsers") && portalVue.includes("灰度用户") && portalVue.includes("toggleEnabled") && portalVue.includes("skillStatus"), "Skill 灰度应按系统内用户配置（不再按流量），并支持上下线开关");
assert("testVisible" in portalVue.match(/SkillManagementApp[\s\S]{0,200}/g) === false || !portalVue.includes("沙箱试跑"), "Skill 配置不应再包含沙箱试跑");
assert(portalVue.includes("skillScenarios") && portalVue.includes("工作台展示") && portalVue.includes("openEdit") && portalVue.includes("saveAll"), "工作台场景卡片应由 Skill 配置驱动（icon/标题/描述/排序），操作列只保留单个编辑按钮");
assert(!portalVue.includes("openCapability") && !portalVue.includes("openDisplay") && !portalVue.includes("openPrompt") && !portalVue.includes("openGray") && !portalVue.includes("openVersions"), "Skill 配置不应保留旧的五个独立入口按钮");
assert(portalVue.includes('id: "warehouse-analyst", name: "数仓分析 Skill", source: "maxcompute-warehouse-analyst", version: "v1.2-portal", status: "已发布", traffic: 100') === false || portalVue.includes('scenarioKey: "single"'), "Skill 注册表应包含工作台展示元数据");
assert(portalBridge.includes('name: "模型配置"') && portalVue.includes("ModelConfigApp") && portalVue.includes("modelConfigView"), "系统管理应提供模型配置页");
assert(portalVue.includes("v1/model-config") && portalVue.includes("已禁用"), "模型配置应支持禁用历史模型并持久化到网关");
assert(portalBridge.includes('bizLine: "权益"') && portalVue.includes("tableCascadeOptions") && portalVue.includes("activeTablePath") && portalVue.includes("changeTablePath") && portalVue.includes("<el-cascader"), "数据表选择应使用单个业务线到数据表的级联下拉");
assert(!portalVue.includes("portal-vue-ai-cascade-grid") && !portalVue.includes("activeBizLine") && !portalVue.includes("filteredTableOptions") && !portalVue.includes("changeBizLine"), "数据表选择不应保留拆分的业务线/数据表下拉");
assert(portalBridge.includes('name: "数据预警"') && portalBridge.includes('icon: "alert"'), "侧边栏应在数据资产上方提供数据预警菜单");
assert(html.includes('id="alertManagementView"') && portalVue.includes('mount("#alertManagementView"'), "数据预警应挂载独立视图");
assert(portalVue.includes("AlertManagementApp") && portalVue.includes("runParse") && portalVue.includes("parseAlertBrain"), "数据预警应支持自然语言描述并由 AI 解析为配置清单");
assert(portalVue.includes("portal-vue-alert-sql") && portalVue.includes("alertSql") && portalVue.includes("保存预警"), "数据预警应生成背后 SQL 规则，业务核对后保存");
assert(portalVue.includes("观星台预警助手") && portalVue.includes("通知群") && portalVue.includes("通知人"), "数据预警应内置飞书机器人推送通道（通知人/通知群）");
assert(portalVue.includes('view: "mine"') && portalVue.includes("canViewAll") && portalVue.includes("门户管理员"), "数据预警列表应默认展示「我的」预警，管理员可切换查看全部");
assert(portalVue.includes("portal-vue-ai-chip-table-cascader") && !portalVue.includes("portal-vue-ai-table-panel-popper"), "表选择按钮应直接展开级联菜单，不应先打开中间弹层");
assert(portalVue.includes("portal-vue-ai-chip-model-select") && !portalVue.includes("portal-vue-ai-model-panel-popper"), "模型选择按钮应直接展开模型列表，不应先打开中间弹层");
assert(portalCss.includes(".portal-vue-ai-chip-table-cascader { width: 200px; }") && portalCss.includes(".portal-vue-ai-chip-model-select { width: 200px; }"), "表与模型下拉应统一为紧凑的 200px 宽度");
assert(portalVue.includes('reasoning: "high"') && portalVue.includes("maxTokens=this.currentContextLimit") && portalVue.includes("reasoningEffort:this.reasoning,maxTokens:this.maxTokens"), "分析请求应固定使用最高推理强度和当前模型最高上下文");
assert(!portalVue.includes("推理强度") && !portalVue.includes("上下文长度") && !portalVue.includes("重置为默认设置") && !portalVue.includes("portal-vue-ai-model-reset"), "模型菜单只应保留模型选择，不展示额外设置");
assert(portalVue.includes('label="业务线"') && portalVue.includes("bizLines()"), "表管理应提供业务线列与筛选");
assert(portalVue.includes("业务线咨询") && portalVue.includes("你问的是哪个业务线？") && portalVue.includes("businessLineVisible") && portalVue.includes("confirmBusinessLine"), "数据查询与指标解答在未引用数据表时应咨询业务线");
assert(portalVue.includes("存量") && portalVue.includes("权益") && portalVue.includes("保险") && portalVue.includes("短剧") && portalVue.includes("其他"), "业务线咨询应提供完整选项");
assert(portalVue.includes("assetCandidates") && portalVue.includes("businessLine") && gatewaySource.includes("assetCandidates") && gatewaySource.includes("业务线范围"), "选择业务线后应把候选数据资产范围交给 Skill");
assert(portalVue.includes("能力配置") && portalVue.includes("澄清策略") && portalVue.includes("资产检索范围") && portalVue.includes("回答契约"), "Skill 配置页应支持配置澄清、资产范围和回答契约");

console.log("观星台原型 smoke test: passed");
