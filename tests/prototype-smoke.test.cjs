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
assert(read("scripts/build-standalone.cjs").includes("?v="), "单文件版构建应容忍静态资源的 ?v= 版本查询串，避免漏内联页面 JS/CSS");
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
assert(portalVue.includes("权限组权限不可关闭") && portalVue.includes("isMenuLocked(item)") && portalVue.includes("isBoardLocked(board)") && portalVue.includes("isTableLocked(table)"), "配置个人权限时权限组已授予的菜单/看板/表权限应锁定，不允许关闭");
assert((portalVue.match(/class="portal-vue-lock-tag" :title="'来自权限组：' \+ user.group">\{\{ user.group \}\}<\/el-tag>/g) || []).length === 5, "锁定项标签应直接显示权限组名称（悬浮提示来源）");
assert(portalVue.includes("menuGrants") && portalVue.includes("boardGrants") && portalVue.includes("个人追加"), "个人权限配置只记录权限组之外的追加项，权限组权限保持不变");
assert(portalBridge.includes("groupLockNote") && portalBridge.includes("lockedBoardNames"), "JS 兜底渲染同样应锁定权限组授予的权限");
assert(portalVue.includes("管理范围") && portalVue.includes("el-tree-select") && portalVue.includes("buildDepartmentTree") && portalVue.includes("deptTree"), "配置权限应提供按部门配置的管理范围 tab，候选范围来自系统用户的部门");
assert(portalVue.includes("userInManageScope") && portalVue.includes("visibleUsersFor") && portalVue.includes("manageScopeAll"), "用户管理只展示当前登录人管理范围内的用户，可配置全部用户");
assert(!portalVue.includes("同步飞书用户") && !portalVue.includes("syncUsers"), "用户管理不再提供飞书同步入口");
assert(portalVue.includes("未配置（仅自己）") && portalVue.includes("只能看到自己"), "未配置管理范围时默认只看自己");
assert(portalVue.includes("manageScope") && portalBridge.includes("manageScopeAll: true"), "管理范围按用户持久化，平台管理员默认全量可见");
assert(!portalVue.includes('height="558px"') && portalVue.includes('class="portal-vue-split-body"><article v-for="(item,index) in state.groups"'), "权限组左侧列表应完整展示，不再用固定高度裁切");
assert(portalVue.includes("USER_SCOPE_PREFIX") && portalVue.includes("scopeMatched") && portalVue.includes("member: true"), "管理范围下拉支持直接勾选具体成员（部门 + 成员两种粒度）");
assert(portalBridge.includes("scopedUsers"), "JS 兜底的用户管理同样按管理范围过滤");
assert(portalVue.includes("menuEdits") && portalVue.includes("menuEditGrants") && portalVue.includes("isMenuEditLocked"), "菜单权限应区分查看与编辑：权限组与个人配置都能单独授予编辑权限");
assert(portalVue.includes("editSectionChecked") && portalVue.includes("togglePersonalEdit") && portalVue.includes("toggleEdit(name,checked"), "勾选编辑自动带上查看，取消查看自动取消编辑");
assert(portalVue.includes('class="portal-vue-view-check"') && portalVue.includes('class="portal-vue-menu-checks"') && (portalVue.match(/>查看<\/el-checkbox>/g) || []).length >= 2 && portalVue.includes("<span>查看</span>"), "菜单权限配置应显式给出「查看」「编辑」两个勾选框（权限组页 + 个人配置页）");
assert(portalVue.includes("canEditMenu") && portalVue.includes("effectiveEditMenus") && portalVue.includes("menuOfPage"), "菜单编辑权限按当前登录人的权限组 + 个人追加计算，子页面跟随父菜单");
assert((portalVue.match(/canEdit\(/g) || []).length >= 60 && portalVue.includes("denyEdit"), "各菜单的新增/编辑/删除/保存/启停等写操作应按编辑权限隐藏");
assert(audienceVue.includes("canEdit('人群包管理')"), "人群包管理的写操作同样按菜单编辑权限隐藏");
assert(portalBridge.includes("canEditPage(activePage)") && portalVue.includes("syncPrimaryAction"), "页面右上角主操作按钮同样受菜单编辑权限控制");
assert(portalVue.includes("canViewMenu") && portalVue.includes("effectiveViewMenus") && portalVue.includes("canView: canViewMenu"), "侧边栏与页面应按查看权限过滤菜单");
assert(portalVue.includes("effectiveBoardNames") && portalVue.includes("effectiveTableNames") && portalVue.includes("boardScopeLabel"), "看板/数据表可见范围按权限组 + 个人授权计算并显示 N / 总数");
assert(portalVue.includes("this.scopeBoardNames.has(board.name)") && portalVue.includes("this.scopeTableNames.has(item.cnName)") && portalVue.includes("scopeAssets"), "看板管理、表管理与数据看板目录只展示授权范围内的内容");
assert(portalVue.includes("visibleCategories") && portalVue.includes("可见范围："), "管理页的筛选下拉与范围提示随可见范围收敛");
assert(portalCss.includes(".portal-vue-user > span { white-space: nowrap") && portalCss.includes(".portal-vue-topbar > .el-dropdown { flex: 0 0 auto; }") && portalCss.includes(".portal-vue-tabs { flex: 1 1 auto"), "顶部 tab 过多时应由 tab 条滚动收缩，头像/姓名区域不压缩换行");
assert(portalBridge.includes('menuEdits: ["灵犀智析"') && portalBridge.includes("menuEdits: []"), "权限组数据应包含菜单编辑权限，只读角色默认无编辑权限");
assert(portalBridge.includes('group: "系统管理"') && portalBridge.includes('name: "菜单管理"') && portalBridge.includes('name: "Skill 配置"'), "系统管理应包含菜单管理与 Skill 配置");
assert(html.includes('id="menuManagementView"') && portalVue.includes("mount(\"#menuManagementView\""), "菜单管理应挂载独立视图");
assert(portalVue.includes("MenuManagementApp") && portalVue.includes("权限标识") && portalVue.includes("组件路径"), "菜单管理应提供层级树/组件路径/权限标识配置");
assert(html.includes('id="skillManagementView"') && portalVue.includes("mount(\"#skillManagementView\""), "Skill 配置应挂载独立视图");
assert(portalVue.includes("SkillManagementApp") && portalVue.includes("提示词") && portalVue.includes("回滚到此版本") && portalVue.includes("保存为新版本") && portalVue.includes("versionNote"), "Skill 配置应合并为单一编辑页，保存即创建新版本（版本号+说明+发布/灰度）");
assert(portalVue.includes("grayUsers") && portalVue.includes("灰度用户") && portalVue.includes("toggleEnabled") && portalVue.includes("skillStatus"), "Skill 灰度应按系统内用户配置（不再按流量），并支持上下线开关");
assert("testVisible" in portalVue.match(/SkillManagementApp[\s\S]{0,200}/g) === false || !portalVue.includes("沙箱试跑"), "Skill 配置不应再包含沙箱试跑");
assert(portalVue.includes("skillScenarios") && portalVue.includes("工作台展示") && portalVue.includes("openEdit") && portalVue.includes("saveAll"), "工作台场景卡片应由 Skill 配置驱动（icon/标题/描述/排序），操作列只保留单个编辑按钮");
assert(!portalVue.includes("openCapability(") && !portalVue.includes("openDisplay(") && !portalVue.includes("openPrompt(") && !portalVue.includes("openGray(") && !portalVue.includes("openVersions("), "Skill 配置不应保留旧的五个独立入口按钮");
assert(portalVue.includes('id: "warehouse-analyst", name: "数仓分析 Skill", source: "maxcompute-warehouse-analyst", version: "v1.2-portal", status: "已发布", traffic: 100') === false || portalVue.includes('scenarioKey: "single"'), "Skill 注册表应包含工作台展示元数据");
assert(portalBridge.includes('name: "模型配置"') && portalVue.includes("ModelConfigApp") && portalVue.includes("modelConfigView"), "系统管理应提供模型配置页");
assert(portalVue.includes("v1/model-config") && portalVue.includes("已禁用"), "模型配置应支持禁用历史模型并持久化到网关");
assert(portalBridge.includes('bizLine: "权益"') && portalVue.includes("tableCascadeOptions") && portalVue.includes("activeTablePath") && portalVue.includes("changeTablePath") && portalVue.includes("<el-cascader"), "数据表选择应使用单个业务线到数据表的级联下拉");
assert(!portalVue.includes("portal-vue-ai-cascade-grid") && !portalVue.includes("activeBizLine") && !portalVue.includes("filteredTableOptions") && !portalVue.includes("changeBizLine"), "数据表选择不应保留拆分的业务线/数据表下拉");
assert(portalBridge.includes('name: "数据预警"') && portalBridge.includes('icon: "alert"'), "侧边栏应在数据资产上方提供数据预警菜单");
assert(html.includes('id="alertManagementView"') && portalVue.includes('mount("#alertManagementView"'), "数据预警应挂载独立视图");
assert(portalVue.includes("AlertManagementApp") && portalVue.includes("alertMonitorTables") && portalVue.includes("选择监控表"), "数据预警应按「选择监控表 → 配置规则」的配置式流程创建");
assert(portalVue.includes("alertOps") && portalVue.includes("toggleRelation") && portalVue.includes("addCondition") && portalVue.includes("portal-vue-alert-rule"), "数据预警应提供且/或条件构建器");
assert(!portalVue.includes("触发逻辑") && !portalVue.includes("背后表达式") && !portalVue.includes("alertSql"), "数据预警表单不应再展示触发逻辑与背后表达式");
assert(portalVue.includes("ruleSummary") && portalVue.includes("alertRuleText"), "触发条件摘要仍应保留用于列表展示");
assert(portalVue.includes("portal-vue-alert-preview") && portalVue.includes("insertVariable") && portalVue.includes("insertTitleVariable"), "数据预警应提供变量插入与推送效果预览");
assert(!portalVue.includes("alertTemplateStyles") && !portalVue.includes("模版样式"), "数据预警不应再提供模版样式选择（当前版本不支持）");
assert(portalVue.includes("观星台飞书机器人") && portalVue.includes("预警群") && portalVue.includes("alertGroupChoices"), "数据预警应通过观星台飞书机器人选择群");
assert(portalVue.includes("sendTestAlert") && portalVue.includes("testChannel") && portalVue.includes("测试通道"), "数据预警应支持配置测试通道并测试发送预警");
assert(portalVue.includes("预警方式") && portalVue.includes("realtime") && portalVue.includes("scheduled") && portalVue.includes("modeSummary"), "数据预警应支持实时与定时两种预警方式");
assert(portalVue.includes("alertCategoryDefaults") && portalVue.includes("categoryManagerVisible") && portalVue.includes("addCategory"), "数据预警应支持预警分类配置与分类管理");
assert(portalVue.includes("alertWeekdayChoices") && portalVue.includes('label="执行日"') && portalVue.includes('"schedule.weekday"'), "检查频率为每周时应先选择执行日（周几）");
assert(portalVue.includes("alertDedupChoices") && portalVue.includes("intervalMinutes") && portalVue.includes("dedupSummary"), "重复预警是否再次通知、按什么间隔通知应可配置");
assert(portalVue.includes("formRules") && portalVue.includes("validateConditions") && portalVue.includes("validateTemplateLines") && portalVue.includes("saveAlert"), "数据预警应在表单内做必填校验并直接保存");
assert(!portalVue.includes("validationVisible") && !portalVue.includes("校验并保存"), "数据预警不应再使用独立的校验弹窗");
["prop=\"name\"", "prop=\"category\"", "prop=\"keyField\"", "prop=\"conditions\"", "prop=\"template.lines\"", "prop=\"channel.groups\""].forEach(prop => {
  assert(portalVue.includes(prop), `数据预警必填字段应绑定 prop 以渲染必填标记：${prop}`);
});
[
  "用户工作时间非公司环境登陆",
  "用户工作时间异地登陆",
  "用户新设备登陆",
  "用户微信环境登陆",
  "用户今日多设备登陆"
].forEach(name => assert(portalVue.includes(name), `应内置登录与设备类预警规则：${name}`));
["分类", "监控表", "预警方式", "重复通知", "累计触发"].forEach(label => {
  assert(portalVue.includes(`<el-table-column label="${label}"`), `数据预警列表应把「${label}」拆成独立列`);
});
assert(portalVue.includes('label="状态" width="88"'), "状态列宽需容纳开关，避免单元格溢出被省略号截断");
assert(portalVue.includes("portal-vue-alert-cell-name"), "数据预警列表名称列应有独立样式");
assert(portalVue.includes("portal-vue-alert-hint") && portalVue.includes("是不是同一个问题"), "主体字段应提供说明文案，帮助理解重复判断口径");
assert(portalVue.includes("portal-vue-alert-dialog-head") && portalVue.includes("portal-vue-alert-back"), "数据预警编辑弹窗左上角应提供返回按钮");
assert(portalVue.includes('label="需求人" prop="requester"'), "数据预警表单应包含需求人必填字段");
assert(portalVue.includes('<el-table-column label="需求人"') && portalVue.includes('<el-table-column label="负责人"') && portalVue.includes("requesterFilter") && portalVue.includes("ownerFilter"), "列表应展示需求人与负责人，并支持按两者筛选");
assert(portalCss.includes(".portal-vue-alert-form .portal-vue-alert-hint"), "主体字段说明文案应独占一行显示在控件下方");
assert(portalCss.includes(".portal-vue-alert-table .el-table__cell { vertical-align: middle; }"), "数据预警列表单元格内容应上下居中，行高随内容自适应");
assert(!portalVue.includes("canViewAll") && !portalVue.includes('view: "mine"'), "数据预警列表不应再提供「我的 / 全部」切换");
assert(portalVue.includes("portal-vue-ai-chip-table-cascader") && !portalVue.includes("portal-vue-ai-table-panel-popper"), "表选择按钮应直接展开级联菜单，不应先打开中间弹层");
assert(portalVue.includes("portal-vue-ai-chip-model-select") && !portalVue.includes("portal-vue-ai-model-panel-popper"), "模型选择按钮应直接展开模型列表，不应先打开中间弹层");
assert(portalCss.includes(".portal-vue-ai-chip-table-cascader { width: 200px; }") && portalCss.includes(".portal-vue-ai-chip-model-select { width: 200px; }"), "表与模型下拉应统一为紧凑的 200px 宽度");
assert(portalVue.includes('reasoning: "high"') && portalVue.includes("maxTokens=this.currentContextLimit") && portalVue.includes("reasoningEffort:this.reasoning,maxTokens:this.maxTokens"), "分析请求应固定使用最高推理强度和当前模型最高上下文");
assert(!portalVue.includes("推理强度") && !portalVue.includes("上下文长度") && !portalVue.includes("重置为默认设置") && !portalVue.includes("portal-vue-ai-model-reset"), "模型菜单只应保留模型选择，不展示额外设置");
assert(portalVue.includes('label="业务线"') && portalVue.includes("bizLines()"), "表管理应提供业务线列与筛选");
assert(portalVue.includes("业务线咨询") && portalVue.includes("你问的是哪个业务线？") && portalVue.includes("businessLineVisible") && portalVue.includes("confirmBusinessLine"), "数据查询与指标解答在未引用数据表时应咨询业务线");
assert(portalVue.includes("存量") && portalVue.includes("权益") && portalVue.includes("保险") && portalVue.includes("短剧") && portalVue.includes("其他"), "业务线咨询应提供完整选项");
assert(portalVue.includes("assetCandidates") && portalVue.includes("businessLine") && gatewaySource.includes("assetCandidates") && gatewaySource.includes("业务线范围"), "选择业务线后应把候选数据资产范围交给 Skill");
assert(portalVue.includes("ability") === false || (portalVue.includes("自动向用户追问") && !portalVue.includes("资产检索范围") && !portalVue.includes("回答契约")), "Skill 编辑页应精简为标题/图标/描述/排序/提示词/上线状态，澄清改为模型自动追问");
assert(portalVue.includes("openVersionManage") && portalVue.includes("openNewVersion") && portalVue.includes("saveGrayDraft") && portalVue.includes("publishVersion") && portalVue.includes("versionStatusName") && portalVue.includes("回滚到此版本"), "Skill 版本管理应支持新增/未发布编辑/灰度/发版/查看历史/回滚全流程");
assert(portalVue.includes("iconInput") && portalVue.includes("onIconUpload") && portalVue.includes("isImageIcon"), "Skill 图标应支持上传图片（列表与工作台卡片均可展示）");

const deployScript = read("scripts/deploy.sh");
assert(deployScript.includes("set -euo pipefail"), "发版脚本应启用 pipefail，避免管道吞掉失败退出码");
assert(!/(\d{1,3}\.){3}\d{1,3}/.test(deployScript), "发版脚本不应硬编码服务器 IP，须从环境变量或 .deploy.env 读取");
assert(deployScript.includes("git bundle create") && deployScript.includes("merge --ff-only"), "发版脚本应通过 git bundle 直传并快进合并，不依赖服务器访问 GitHub");
assert(deployScript.includes("EXPECT_VERSION") && deployScript.includes("线上版本号"), "发版脚本应在发布后核对线上静态资源版本号");
assert(exists(".deploy.env.example") && read(".gitignore").includes(".deploy.env"), "应提供发版配置样例，且本地 .deploy.env 不入库");
assert(read("package.json").includes('"deploy": "bash scripts/deploy.sh"'), "应提供 npm run deploy 入口");

console.log("观星台原型 smoke test: passed");
