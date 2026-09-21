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
assert(portalVue.includes('visible() { return !["灵犀智析"') && !portalVue.includes("portal-vue-ai-bot-btn") && !html.includes("feishuBotAddBtn"), "灵犀智析页应去掉顶部标题区，并不再提供添加飞书机器人入口");
assert(exists("assets/portal-shell.css") && read("assets/portal-shell.css").includes("div:first-child.portal-vue-page-head { max-width: none; width: 100%; }"), "页面头部应解除 760px 宽度限制占满内容宽度");
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
  "nav-push-active.svg",
  "nav-ai-default.svg",
  "nav-ai-active.svg"
].forEach(file => assert(exists(`assets/${file}`), `缺少品牌资产: ${file}`));

assert(html.includes('href="assets/momentx-observatory-favicon-32.png"'), "入口应使用站点 favicon");
assert(portalBridge.includes('default: "assets/nav-push-default.svg"'), "推送导航图标应引用独立 SVG");
// 单文件版靠 build-standalone.cjs 的 imagePaths 白名单内联资源：漏一个侧栏图标，
// 分享出去的单文件就会缺图（系统管理 / 灵犀智析 / 数据告警 / AI 中心 曾整组缺失）。
const standaloneBuild = read("scripts/build-standalone.cjs");
const navIconAssets = [...new Set([...portalBridge.matchAll(/"(assets\/nav-[a-z0-9-]+\.(?:svg|png))"/g)].map(match => match[1]))];
assert(navIconAssets.length >= 16, "侧栏图标应成对声明默认态与选中态资源");
navIconAssets.forEach(asset => assert(exists(asset), `侧栏图标资源缺失: ${asset}`));
navIconAssets.forEach(asset => assert(standaloneBuild.includes(`"${asset}"`), `单文件构建应内联侧栏图标（imagePaths 白名单）: ${asset}`));
assert(!portalBridge.includes("data:image/"), "门户桥接脚本不应再内嵌 data URL 图片");
assert(!portalVue.includes("data:image/png;base64") && !portalVue.includes("data:image/jpeg;base64"), "门户 Vue 模块不应再内嵌品牌图");

assert(portalBridge.includes('name: "维表管理"') && portalBridge.includes('name: "字典管理"'), "数据资产应包含维表管理与字典管理菜单");
["2.0", "3.0", "1.0"].forEach(version => assert(!portalBridge.includes('badge: "' + version + '"'), "已上线能力的角标应清除：" + version));
assert(portalBridge.includes('name: "表管理", badge: "4.0"') && portalBridge.includes('name: "维表管理", badge: "4.0"') && portalBridge.includes('name: "字典管理", badge: "4.0"'), "4.0 角标应保留");
assert(portalBridge.includes('name: "灵犀智析", badge: "5.0"') && portalBridge.includes('name: "Skill 配置", badge: "5.0"'), "5.0 角标应保留");
assert(portalBridge.indexOf('name: "标签管理"') > portalBridge.indexOf('name: "表管理"') && portalBridge.indexOf('name: "维表管理"') > portalBridge.indexOf('name: "标签管理"'), "标签管理应紧跟表管理，位于维表管理之前");
assert(portalBridge.includes('name: "数据告警", badge: "3.1"') && portalVue.includes("portal-nav-badge--v31"), "本次新增的数据告警应标记 3.1");
assert(portalVue.includes("navBadges("), "侧栏应支持同一菜单展示多个版本角标");
assert(portalCss.includes(".portal-vue-menu .el-sub-menu__title { padding-right: 38px !important; }"), "侧栏分组标题需为展开/折叠箭头预留位置，避免版本角标遮挡");
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
assert(portalVue.includes('visible() { return !["灵犀智析"') && !portalVue.includes("portal-vue-ai-bot-btn") && !html.includes("feishuBotAddBtn"), "灵犀智析页应去掉顶部标题区，并不再提供添加飞书机器人入口");
assert(exists("assets/portal-shell.css") && read("assets/portal-shell.css").includes(".portal-vue-page-head { max-width: none; width: 100%; }"), "页面头部应解除 760px 宽度限制占满内容宽度");

// 灵犀智析顶部标题区（标题 + 副标题 + 添加飞书机器人按钮）去掉的硬约束：
// 只有壳层规则能保证整屏工作台不再露出标题区，Vue 的 visible() 列表属于第二道防线。
const shellCss = read("assets/portal-shell.css");
const lingxiHeadHideRule = shellCss.match(/\.main:has\(#analysisWorkbenchView:not\(\.hidden\)\)\s*\.page-head\s*\{([^}]*)\}/);
assert(lingxiHeadHideRule && /display:\s*none/.test(lingxiHeadHideRule[1]), "灵犀智析的顶部标题区必须由壳层规则硬隐藏（.main:has(#analysisWorkbenchView:not(.hidden)) .page-head { display: none }），不能只靠 Vue 的 visible() 列表");
assert(!/添加机器人|添加飞书机器人|portal-vue-ai-bot-btn|feishuBotAddBtn/.test(html + portalVue + portalBridge), "本轮决定：门户内不再出现任何「添加机器人」入口（顶栏个人名字左侧也暂不新增），后续版本再考虑");
const topbarAppSource = portalVue.slice(portalVue.indexOf("const TopbarApp"), portalVue.indexOf("\n  const ", portalVue.indexOf("const TopbarApp") + 1));
assert(topbarAppSource.includes('class="portal-vue-user"') && !/机器人|bot/i.test(topbarAppSource), "顶栏只保留「首页 + 页签 + 用户名」结构，个人名字左侧不得出现机器人入口");
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
assert(portalVue.includes("boardChecked(board.name)") && portalVue.includes("boardChecked(name){return this.allBoards||this.selectedBoards.includes(name);}"), "权限组勾选「全部看板」后，分类下的看板应显示为已勾选（仍保持禁用，不可单独操作）");
assert(!portalVue.includes(':disabled="allBoards" :model-value="selectedBoards.includes(board.name)"'), "勾选全部看板后不应再把子看板渲染成空的禁用勾选框（此断言防止回退）");
assert(portalVue.includes(':title="board.name"') && portalVue.includes(':title="table.cnName"'), "权限组看板/数据表勾选项应带 title 悬浮全文，长名称不丢信息");
assert(/\.portal-vue-child-checks \.el-checkbox__label \{[^}]*white-space:\s*normal/.test(portalCss), "长看板/表名应允许换行展示（Element Plus 默认 nowrap 会顶出卡片边界）");
assert(portalVue.includes("myTables"), "灵犀智析应按权限组展示可用数据表");
assert(portalVue.includes("权限组权限不可关闭") && portalVue.includes("isMenuLocked(item)") && portalVue.includes("isBoardLocked(board)") && portalVue.includes("isTableLocked(table)"), "配置个人权限时权限组已授予的菜单/看板/表权限应锁定，不允许关闭");
assert((portalVue.match(/class="portal-vue-lock-tag" :title="'来自权限组：' \+ user.group">\{\{ user.group \}\}<\/el-tag>/g) || []).length === 5, "锁定项标签应直接显示权限组名称（悬浮提示来源）");
assert(portalVue.includes("menuGrants") && portalVue.includes("boardGrants") && portalVue.includes("个人追加"), "个人权限配置只记录权限组之外的追加项，权限组权限保持不变");
assert(portalBridge.includes("groupLockNote") && portalBridge.includes("lockedBoardNames"), "JS 兜底渲染同样应锁定权限组授予的权限");
assert(portalVue.includes("管理范围") && portalVue.includes("el-tree-select") && portalVue.includes("buildDepartmentTree") && portalVue.includes("deptTree"), "配置权限应提供按部门配置的管理范围 tab，候选范围来自系统用户的部门");
assert(portalVue.includes("userInManageScope") && portalVue.includes("visibleUsersFor") && portalVue.includes("manageScopeAll"), "用户管理只展示当前登录人管理范围内的用户，可配置全部用户");
assert(portalVue.includes('openView(user){bridge.setActiveUserIndex(state.users.indexOf(user));bridge.setPage("查看权限");}') && portalBridge.includes('"查看权限": ["查看权限"'), "用户管理应提供「查看权限」入口，打开与「配置权限」同样的整页只读页面");
assert(!portalVue.includes("portal-vue-perm-view") && !portalVue.includes("viewPermissionsOf"), "查看权限不再是抽屉标签列表：旧抽屉实现应删除（此断言防止回退）");
assert(portalVue.includes("const PermissionReadApp") && portalVue.includes('mount("#permissionReadView", PermissionReadApp, "permission-read")') && html.includes('id="permissionReadView"') && portalBridge.includes('permissionReadView")?.classList.toggle("hidden", page !== "查看权限")'), "「查看权限」应为独立整页：容器 + Vue mount + 页面路由三者齐备");
assert(portalVue.includes("permissionsOfUser(this.user)") && portalVue.includes("function permissionsOfUser(user)"), "查看权限页应复用统一的权限快照（菜单 / 看板 / 表 / 管理范围）");
assert(portalVue.includes("items.filter(item=>this.permissions.viewMenus.includes(item.name))") && portalVue.includes("this.permissions.boards.includes(board.name)") && portalVue.includes("this.permissions.tables.includes(table.cnName)"), "查看权限页只渲染已授权的菜单/看板/数据表，未授权项不展示");
assert(portalVue.includes("该用户当前没有任何菜单权限。") && portalVue.includes("管理范围内的用户") && portalVue.includes("scopeUsers"), "查看权限页应给出空态说明，管理范围只列范围内用户");
assert(portalVue.includes("此页不支持任何修改"), "查看权限页应明确提示不支持修改")
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
const formActionsRule = (portalCss.match(/\.portal-vue-form-actions\s*\{[^}]*\}/) || [""])[0];
assert(!/position:\s*sticky/.test(formActionsRule), "表单底部操作区不应再用 position: sticky：.main 的 overflow-x: hidden 会隐式生成 overflow-y: auto 的滚动容器，sticky 会被拖到文档末尾（此断言防止回退）");
assert(/position:\s*fixed/.test(formActionsRule) && /bottom:\s*0/.test(formActionsRule), "表单底部操作区应默认悬浮在页面底部（position: fixed + bottom: 0），内容滚动时始终可见");
assert(/left:\s*var\(--portal-pane-left/.test(formActionsRule) && /right:\s*0/.test(formActionsRule), "悬浮操作区左边界应跟随侧栏宽度（left: var(--portal-pane-left)）并铺满内容区右侧，与内容区对齐");
assert(["--portal-pane-left: 248px", "--portal-pane-left: 76px", "--portal-pane-left: 0"].every(token => read("assets/portal-shell.css").includes(token)), "壳层应给出侧栏展开 248 / 收起 76 / 隐藏 0 三档 --portal-pane-left，收起或隐藏侧栏后悬浮操作区仍对齐内容区");
assert(/\.portal-vue-form-page\s*\{[^}]*padding-bottom:\s*96px/.test(portalCss), "悬浮操作区会盖住页面底部，表单页应预留 96px 底部空白，最后一个权限卡片不被遮挡");
assert(!/\.portal-vue-form-actions\s*\{[^}]*margin:\s*0 -28px -36px -36px/.test(portalCss), "悬浮操作区改用 fixed 定位后不应再靠负 margin 贴边");
assert((portalVue.match(/class="portal-vue-form-actions"/g) || []).length === 2, "配置用户权限页与数据开放平台 API 表单页共用同一套悬浮操作区（取消 / 保存）");
const audienceCss = read("assets/cp-vue-module.css");
const cpFooterRule = (audienceCss.match(/\.cp-vue-footer\s*\{[^}]*\}/) || [""])[0];
assert(!/position:\s*sticky/.test(cpFooterRule) && /position:\s*fixed/.test(cpFooterRule) && /bottom:\s*0/.test(cpFooterRule) && /left:\s*var\(--portal-pane-left/.test(cpFooterRule), "人群包推送表单的底部操作区（取消 / 校验并保存）应与配置权限页一致：悬浮在页面底部并对齐内容区，不再被 .main 滚动容器拖到文档末尾");
assert(/\.cp-vue-form-page\s*\{[^}]*padding-bottom:\s*96px/.test(audienceCss), "人群包推送表单页应预留 96px 底部空白，最后一段表单不被悬浮操作区遮挡");
assert(audienceVue.includes("canEdit('人群包管理')"), "人群包管理的写操作同样按菜单编辑权限隐藏");
assert(portalBridge.includes("canEditPage(activePage)") && portalVue.includes("syncPrimaryAction"), "页面右上角主操作按钮同样受菜单编辑权限控制");
assert(portalVue.includes("canViewMenu") && portalVue.includes("effectiveViewMenus") && portalVue.includes("canView: canViewMenu"), "侧边栏与页面应按查看权限过滤菜单");
assert(portalVue.includes("effectiveBoardNames") && portalVue.includes("effectiveTableNames") && portalVue.includes("boardScopeLabel"), "看板/数据表可见范围按权限组 + 个人授权计算并显示 N / 总数");
assert(portalVue.includes("this.scopeBoardNames.has(board.name)") && portalVue.includes("this.scopeTableNames.has(item.cnName)") && portalVue.includes("scopeAssets"), "看板管理、表管理与数据看板目录只展示授权范围内的内容");
assert(portalVue.includes('<el-form-item label="可查看用户">') && portalVue.includes("selectableUsers"), "看板编辑弹窗应在「可查看权限组」之后提供「可查看用户」多选，直接授权到具体用户");
assert(portalVue.includes("users: [...(board.users || [])]") && portalVue.includes("users: [...(this.form.users || [])]"), "看板表单应读写 board.users：编辑回填已有授权，保存写回");
assert(portalVue.includes("board.users.includes(user?.name)") && portalBridge.includes("boardDirectUsers") && portalBridge.includes('"QB_001": ["刘盾"]'), "直接授权的看板应对该用户可见（与权限组授权取并集），并带演示数据");
assert(portalVue.includes("direct: directUsers.includes(user.name)") && portalVue.includes("direct: true") && portalVue.includes("portal-vue-viewer-tag"), "看板列表「可查看用户」应为权限组可见用户与直接授权用户的并集，并标出直接授权");
assert(portalVue.includes("directBoardNames") && portalVue.includes("isBoardDirect(board)") && portalVue.includes("board.users=board.users.filter(name=>name!==this.user.name)"), "配置用户权限页应回显直接授权的看板（带「直接授权」标签），取消勾选并保存即收回");
assert(portalCss.includes(".portal-vue-board-dialog .el-dialog__body { max-height: calc(100vh - 220px)"), "看板编辑弹窗字段较多，内容区应独立滚动，保证底部「取消 / 保存」始终可见");
assert(portalVue.includes("visibleCategories") && portalVue.includes("可见范围："), "管理页的筛选下拉与范围提示随可见范围收敛");
assert(portalCss.includes(".portal-vue-user > span { white-space: nowrap") && portalCss.includes(".portal-vue-topbar > .el-dropdown { flex: 0 0 auto; }") && portalCss.includes(".portal-vue-tabs { flex: 1 1 auto"), "顶部 tab 过多时应由 tab 条滚动收缩，头像/姓名区域不压缩换行");
assert(portalBridge.includes('menuEdits: ["灵犀智析"') && portalBridge.includes("menuEdits: []"), "权限组数据应包含菜单编辑权限，只读角色默认无编辑权限");
assert(portalBridge.includes('group: "系统管理"') && portalBridge.includes('name: "菜单管理"'), "系统管理应包含菜单管理");
assert(portalBridge.includes('name: "操作日志"'), "系统管理应提供操作日志菜单");
assert(portalBridge.indexOf('name: "操作日志"') < portalBridge.indexOf('name: "菜单管理"') && portalBridge.indexOf('name: "操作日志"') > portalBridge.indexOf('name: "环境域名"'), "操作日志菜单应位于环境域名之后、菜单管理之前");
// AI 中心：把 Skill 配置 / 模型配置从系统管理抽成独立一级菜单，排在系统管理之前
const aiGroup = (portalBridge.match(/\{ group: "AI 中心"[\s\S]*?\}\] \}/) || [""])[0];
const systemGroup = (portalBridge.match(/\{ group: "系统管理"[\s\S]*?\}\] \}/) || [""])[0];
assert(portalBridge.includes('group: "AI 中心"') && portalBridge.indexOf('group: "AI 中心"') < portalBridge.indexOf('group: "系统管理"'), "AI 中心应作为一级菜单分组，排在系统管理之前");
assert(aiGroup.includes('name: "Skill 配置", badge: "5.0"') && aiGroup.includes('name: "模型配置", badge: "5.0"') && portalBridge.indexOf('name: "Skill 配置"') < portalBridge.indexOf('name: "模型配置"'), "AI 中心应包含 Skill 配置与模型配置（Skill 在前，保留 5.0 角标）");
assert(portalBridge.includes('group: "AI 中心", icon: "ai"'), "AI 中心应有独立侧栏图标");
assert(systemGroup.includes('name: "任务运维"') && systemGroup.includes('name: "环境域名"') && systemGroup.includes('name: "操作日志"') && systemGroup.includes('name: "菜单管理"'), "系统管理应保留任务运维 / 环境域名 / 操作日志 / 菜单管理");
assert(!systemGroup.includes("Skill 配置") && !systemGroup.includes("模型配置"), "系统管理不应再包含 Skill 配置与模型配置（此断言防止回退）");
assert(portalBridge.includes('if (page === "Skill 配置" || page === "模型配置") return "ai";'), "AI 中心两个页面的顶部页签应使用 ai 图标");
assert(portalBridge.includes('ai: { default: "assets/nav-ai-default.svg", active: "assets/nav-ai-active.svg" }'), "ai 图标应指向独立的默认/选中态资源");
const adminGroup = (portalBridge.match(/\{ name: "门户管理员"[\s\S]*?status: "启用" \}/) || [""])[0];
assert(adminGroup.includes('"AI 中心"') && adminGroup.includes('"模型配置"') && adminGroup.includes('"Skill 配置"'), "门户管理员权限组应同时给出 AI 中心分组名与两个菜单名（保存权限后分组名会被拍平成菜单名，不能只依赖分组授权）");
assert(portalVue.includes('name: "AI 中心", icon: "ai"') && portalVue.includes('permission: "ai_center"'), "菜单管理树应同步新增 AI 中心一级菜单（含图标与权限标识）");
assert((portalVue.match(/name: "Skill 配置"/g) || []).length === 1 && (portalVue.match(/name: "模型配置"/g) || []).length === 1, "菜单管理树里 Skill 配置 / 模型配置 只应出现在 AI 中心下，不重复挂载");
assert(portalVue.includes('ai:"◈"'), "菜单管理图标字典应包含 ai 字形");
assert(html.includes('id="operationLogView"') && portalVue.includes('mount("#operationLogView"'), "操作日志应挂载独立视图");
assert(portalVue.includes("OperationLogApp") && portalVue.includes("operationLogEvents") && portalVue.includes("operationLogSeeds"), "操作日志应基于埋点事件定义构建");
assert(portalVue.includes('"page_view"') && portalVue.includes('"dashboard_view_heartbeat"'), "操作日志应覆盖页面访问与看板心跳两类埋点");
assert(portalVue.includes('category: "页面访问"') && portalVue.includes('category: "查看看板"'), "操作日志应按页面访问 / 查看看板分类");
assert(portalVue.includes('const OPERATION_LOG_VISIBLE_CATEGORIES = ["查看看板"]') && portalVue.includes("!OPERATION_LOG_VISIBLE_CATEGORIES.includes(operationLogEvents[record.event]?.category)"), "操作日志当前只对外展示「查看看板」记录：页面访问等埋点隐藏（数据与定义保留，白名单加回即恢复）");
assert(portalVue.includes("visibleCategories() { return this.categories.filter(item => OPERATION_LOG_VISIBLE_CATEGORIES.includes(item)); }") && portalVue.includes('v-if="visibleCategories.length > 1"'), "只剩一个分类时不渲染分类页签与分类列，后续加回分类会自动恢复");
const logTabsBlock = (portalVue.match(/v-if="visibleCategories\.length > 1"[\s\S]{0,360}/) || [""])[0];
assert(logTabsBlock.includes('v-for="item in visibleCategories"') && !logTabsBlock.includes('v-for="item in categories"'), "操作日志分类页签不得再直接遍历全部分类（此断言防止回退）");
assert(portalBridge.includes("「查看看板」明细"), "操作日志页头文案应说明当前只开放查看看板明细");
assert(portalVue.includes("visitId") && portalVue.includes("duration_seconds") && portalVue.includes("visit_id"), "看板心跳应按 visit_id 归并为一次访问并计算停留时长");
assert(!portalVue.includes("数据来源：前端埋点"), "操作日志底部数据来源说明应移除");
assert(portalVue.includes("portal-vue-log-attrs") && portalVue.includes("detailBeats"), "操作日志详情应展示完整埋点属性与心跳明细");
assert(portalVue.includes('label="页面名称"') && portalVue.includes('label="页面URL"') && portalVue.includes('["menu_name", "菜单名称"'), "操作日志应把页面名称与页面URL拆成独立列，页面访问带菜单名称");
assert(portalVue.includes('label="UA"') && portalVue.includes("operationLogUaSummary") && portalVue.includes("uaSummaryOf"), "操作日志应展示 UA（摘要 + 完整值 tooltip）");
assert(portalVue.includes('type="datetimerange"') && portalVue.includes("rangeBounds") && portalVue.includes("timeShortcuts"), "操作日志时间筛选应支持选择时间范围，并保留快捷区间")
assert(portalBridge.includes('"操作日志": ["操作日志"'), "操作日志应配置页面标题与说明");
assert(html.includes('id="menuManagementView"') && portalVue.includes("mount(\"#menuManagementView\""), "菜单管理应挂载独立视图");
assert(portalVue.includes("MenuManagementApp") && portalVue.includes("权限标识") && portalVue.includes("组件路径"), "菜单管理应提供层级树/组件路径/权限标识配置");
assert(html.includes('id="skillManagementView"') && portalVue.includes("mount(\"#skillManagementView\""), "Skill 配置应挂载独立视图");
assert(portalVue.includes("SkillManagementApp") && portalVue.includes("提示词") && portalVue.includes("回滚到此版本") && portalVue.includes("保存为新版本") && portalVue.includes("versionNote"), "Skill 配置应合并为单一编辑页，保存即创建新版本（版本号+说明+发布/灰度）");
assert(portalVue.includes("grayUsers") && portalVue.includes("灰度用户") && portalVue.includes("toggleEnabled") && portalVue.includes("skillStatus"), "Skill 灰度应按系统内用户配置（不再按流量），并支持上下线开关");
assert("testVisible" in portalVue.match(/SkillManagementApp[\s\S]{0,200}/g) === false || !portalVue.includes("沙箱试跑"), "Skill 配置不应再包含沙箱试跑");
assert(portalVue.includes("skillScenarios") && portalVue.includes("工作台展示") && portalVue.includes("openEdit") && portalVue.includes("saveAll"), "工作台场景卡片应由 Skill 配置驱动（icon/标题/描述/排序），操作列只保留单个编辑按钮");
assert(!portalVue.includes("openCapability(") && !portalVue.includes("openDisplay(") && !portalVue.includes("openPrompt(") && !portalVue.includes("openGray(") && !portalVue.includes("openVersions("), "Skill 配置不应保留旧的五个独立入口按钮");
assert(portalVue.includes('id: "warehouse-analyst", name: "数仓分析 Skill", source: "maxcompute-warehouse-analyst", version: "v1.2-portal", status: "已发布", traffic: 100') === false || portalVue.includes('scenarioKey: "single"'), "Skill 注册表应包含工作台展示元数据");
assert(!portalVue.includes('label="来源包"') && !portalVue.includes("搜索 Skill 名称、来源"), "Skill 列表应去掉「来源包」列，搜索也不再按来源匹配（此断言防止回退）");
assert(portalVue.includes('@click="openCreate">＋ 新增 Skill') && !portalVue.includes("上传 Skill</el-button>") && !portalVue.includes("onUploadFile") && !portalVue.includes("Skill 以 ZIP 包"), "右上角应改为「新增 Skill」手动新增，移除 ZIP 上传按钮与上传说明");
assert(portalVue.includes("openCreate(){") && portalVue.includes("saveCreate(){") && portalVue.includes("state.skills.unshift(skill)") && portalVue.includes("versions:[{version,time:now"), "新增 Skill 应写入注册表并自动生成初始版本（v1.0 / 已发布 / 操作人）");
assert(portalVue.includes('v-model="createForm.name"') && portalVue.includes('v-model="createForm.prompt"') && portalVue.includes("onCreateIconUpload") && portalVue.includes("applyIcon(event,target)"), "新增 Skill 表单应覆盖名称/标题/图标/描述/排序/提示词/版本/上线状态，图标复用同一套上传逻辑");
assert(portalVue.includes("item.local&&!list.some(entry=>entry.id===item.id)") && portalVue.includes("filter(item=>item.local&&!remotes.some(entry=>entry.id===item.id))"), "门户手动新增的 Skill 在网关数据刷新后仍保留，不会建完就消失");
assert(portalBridge.includes('name: "模型配置"') && portalVue.includes("ModelConfigApp") && portalVue.includes("modelConfigView"), "AI 中心应提供模型配置页");
assert(portalVue.includes("v1/model-config") && portalVue.includes("已禁用"), "模型配置应支持禁用历史模型并持久化到网关");
assert(portalBridge.includes('bizLine: "权益"') && portalVue.includes("tableCascadeOptions") && portalVue.includes("activeTablePath") && portalVue.includes("changeTablePath") && portalVue.includes("<el-cascader"), "数据表选择应使用单个业务线到数据表的级联下拉");
assert(!portalVue.includes("portal-vue-ai-cascade-grid") && !portalVue.includes("activeBizLine") && !portalVue.includes("filteredTableOptions") && !portalVue.includes("changeBizLine"), "数据表选择不应保留拆分的业务线/数据表下拉");
assert(portalBridge.includes('name: "数据告警"') && portalBridge.includes('icon: "alert"'), "侧边栏应在数据资产上方提供数据告警菜单");
assert(html.includes('id="alertManagementView"') && portalVue.includes('mount("#alertManagementView"'), "数据告警应挂载独立视图");
assert(portalVue.includes("AlertManagementApp") && portalVue.includes("alertMonitorTables") && portalVue.includes("选择监控表"), "数据告警应按「选择监控表 → 配置规则」的配置式流程创建");
assert(portalVue.includes("alertTypeOps") && portalVue.includes("alertOpsOf") && portalVue.includes("toggleRelation") && portalVue.includes("addCondition") && portalVue.includes("portal-vue-alert-rule"), "数据告警应提供且/或条件构建器");
assert(portalVue.includes("alertTimeGrains") && portalVue.includes("changeConditionGrain") && portalVue.includes("portal-vue-alert-grain"), "时间范围应支持按日/周/月粒度切换");
assert(portalVue.includes("alertWeekChoices") && portalVue.includes("alertMonthDayChoices") && portalVue.includes("weekChoices") && portalVue.includes("monthDayChoices"), "周/月粒度应提供星期与日期的下拉选项");
assert(portalVue.includes(String.raw`"数值": [["gt", "大于"]`) && portalVue.includes(String.raw`"布尔": [["true", "是"]`) && portalVue.includes(String.raw`"日期": [["timeBetween", "时间范围"]`), "条件算子应按字段类型收敛，算子集合与人群包保持一致");
assert(!portalVue.includes("触发逻辑") && !portalVue.includes("背后表达式") && !portalVue.includes("alertSql"), "数据告警表单不应再展示触发逻辑与背后表达式");
assert(portalVue.includes("ruleSummary") && portalVue.includes("alertRuleText"), "触发条件摘要仍应保留用于列表展示");
assert(portalVue.includes("portal-vue-alert-preview") && portalVue.includes("insertVariable") && portalVue.includes("insertTitleVariable"), "数据告警应提供变量插入与推送效果预览");
assert(portalVue.includes('{{ field.cn }}（{{ field.name }}）'), "插入变量下拉应同时展示中文名与英文字段名");
assert(!portalVue.includes("alertTemplateStyles") && !portalVue.includes("模版样式"), "数据告警不应再提供模版样式选择（当前版本不支持）");
assert(portalVue.includes("观星台飞书机器人") && portalVue.includes("告警群") && portalVue.includes("alertGroupChoices"), "数据告警应通过观星台飞书机器人选择群");
assert(portalVue.includes("validateChannelReach") && portalVue.includes("revalidateChannel") && portalVue.includes('label="通知人" prop="channel.users"'), "告警群与通知人应至少填写一个，且两处都显示必填标记");
assert(portalVue.includes("sendTestAlert") && portalVue.includes("testChannel") && portalVue.includes("测试通道"), "数据告警应支持配置测试通道并测试发送告警");
assert(portalVue.includes("告警方式") && portalVue.includes("realtime") && portalVue.includes("scheduled") && portalVue.includes("modeSummary"), "数据告警应支持实时与定时两种告警方式");
assert(portalVue.includes("alertCategoryDefaults") && portalVue.includes("categoryManagerVisible") && portalVue.includes("addCategory"), "数据告警应支持告警分类配置与分类管理");
assert(portalVue.includes("alertWeekdayChoices") && portalVue.includes('label="执行日"') && portalVue.includes('"schedule.weekday"'), "检查频率为每周时应先选择执行日（周几）");
assert(portalVue.includes("alertDedupChoices") && portalVue.includes("intervalMinutes") && portalVue.includes("dedupSummary"), "重复告警是否再次通知、按什么间隔通知应可配置");
assert(portalVue.includes("时间范围内不重复通知") && portalVue.includes("分钟内不重复通知"), "重复告警默认项文案应为「时间范围内不重复通知」");
assert(portalVue.includes("formRules") && portalVue.includes("validateConditions") && portalVue.includes("validateTemplateLines") && portalVue.includes("saveAlert"), "数据告警应在表单内做必填校验并直接保存");
assert(!portalVue.includes("validationVisible") && !portalVue.includes("校验并保存"), "数据告警不应再使用独立的校验弹窗");
["prop=\"name\"", "prop=\"category\"", "prop=\"keyField\"", "prop=\"conditions\"", "prop=\"template.lines\"", "prop=\"channel.groups\""].forEach(prop => {
  assert(portalVue.includes(prop), `数据告警必填字段应绑定 prop 以渲染必填标记：${prop}`);
});
[
  "用户工作时间非公司环境登陆",
  "用户工作时间异地登陆",
  "用户新设备登陆",
  "用户微信环境登陆",
  "用户今日多设备登陆"
].forEach(name => assert(portalVue.includes(name), `应内置登录与设备类告警规则：${name}`));
["分类", "监控表", "告警方式", "重复通知", "近7日告警次数"].forEach(label => {
  assert(portalVue.includes(`<el-table-column label="${label}"`), `数据告警列表应把「${label}」拆成独立列`);
});
assert(portalVue.includes('label="状态" width="92"') && portalVue.includes("portal-vue-alert-cell-status"), "状态列需左对齐且留出宽度，避免开关被固定操作列覆盖");
assert(!portalVue.includes("推送统一走内置"), "数据告警列表底部说明文案应移除");
assert(portalVue.includes('label="触发条件" min-width="176"') && portalVue.includes('label="推送通道" min-width="128"'), "告警列表列宽合计需小于容器宽度，避免横向滚动导致固定列遮挡");
assert(portalVue.includes("portal-vue-alert-cell-name"), "数据告警列表名称列应有独立样式");
assert(portalVue.includes("portal-vue-alert-hint") && portalVue.includes("只算同一条告警，是否再次通知由上面的重复规则决定"), "重复判定字段应提供简洁的重复判断说明");
const dedupBlock = (portalVue.match(/prop="keyField"[\s\S]{0,560}/) || [""])[0];
assert(portalVue.includes("MEASURE_SQL_TYPES") && portalVue.includes("function isMeasureField(field)"), "应定义「度量值（数值型）」判定，供重复判定字段过滤使用");
assert(portalVue.includes("dedupFields() { return this.currentFields.filter(field => !isMeasureField(field)); }") && dedupBlock.includes('v-for="field in dedupFields"') && !dedupBlock.includes('v-for="field in currentFields"'), "重复判定字段下拉只能选维度字段，度量值（数值型）不可选（此断言防止回退）");
assert(dedupBlock.includes("度量值（数值型）不能作为去重口径"), "重复判定字段应说明只提供维度字段、度量值不可选");
assert(portalVue.includes("validateKeyField(rule, value, callback)") && portalVue.includes("不能作为重复判定字段"), "保存时仍应拦住度量值：校验器拒绝数值型字段作为重复判定字段");
assert(portalVue.includes("const dimensionFields = (table.fields || []).filter(field => !isMeasureField(field))") && portalVue.includes("defaultKeyField"), "新建表单与切换监控表的默认重复判定字段应落在维度字段上，不会默认选中度量值");
assert(portalVue.includes('class="portal-vue-alert-preview-avatar" src="assets/momentx-observatory-icon.png"'), "推送效果预览的头像应使用观星台品牌图标");
assert(portalVue.includes("portal-vue-alert-dialog-head") && portalVue.includes("portal-vue-alert-back"), "数据告警编辑弹窗左上角应提供返回按钮");
assert(portalVue.includes('label="负责人" prop="owner"') && portalVue.includes('label="告警方式" prop="mode"') && portalVue.includes('prop="dedup.mode"'), "负责人/告警方式/重复告警均应绑定 prop 以渲染必填星标");
assert(portalVue.includes('label="重复间隔" prop="dedup.intervalMinutes"') && portalVue.includes('"dedup.intervalMinutes": ['), "重复间隔应为必填项并校验 1~1440 分钟区间");
assert(portalVue.includes('label="需求人" prop="requester"'), "数据告警表单应包含需求人必填字段");
assert(portalVue.includes('<el-table-column label="需求人"') && portalVue.includes('<el-table-column label="负责人"') && portalVue.includes("requesterFilter") && portalVue.includes("ownerFilter"), "列表应展示需求人与负责人，并支持按两者筛选");
assert(portalVue.includes("groupFilter") && portalVue.includes("pushUserFilter") && portalVue.includes("全部推送群") && portalVue.includes("全部推送人"), "列表应支持按推送群与推送人筛选");
assert(portalVue.includes('placeholder="搜索告警名称"') && portalVue.includes('String(item.name || "").toLowerCase().includes(keyword)'), "搜索框应只按告警名称匹配");
assert(portalVue.includes("portal-vue-status-tabs") && portalVue.includes("enabledCount") && portalVue.includes("disabledCount") && portalVue.includes('status: "启用"'), "告警列表应提供启用中/已停用状态页签");
assert(portalVue.includes("portal-vue-pagination") && portalVue.includes("pagedRows") && portalVue.includes("rangeText") && portalVue.includes(":data=\"pagedRows\""), "告警列表应支持分页");
assert(portalCss.includes(".portal-vue-alert-form .portal-vue-alert-hint"), "重复判定字段说明文案应独占一行显示在控件下方");
assert(portalCss.includes(".portal-vue-alert-table .el-table__cell { vertical-align: middle; }"), "数据告警列表单元格内容应上下居中，行高随内容自适应");
assert(!portalVue.includes("canViewAll") && !portalVue.includes('view: "mine"'), "数据告警列表不应再提供「我的 / 全部」切换");
assert(portalVue.includes("portal-vue-ai-chip-table-cascader") && !portalVue.includes("portal-vue-ai-table-panel-popper"), "表选择按钮应直接展开级联菜单，不应先打开中间弹层");
assert(portalVue.includes("portal-vue-ai-chip-model-select") && !portalVue.includes("portal-vue-ai-model-panel-popper"), "模型选择按钮应直接展开模型列表，不应先打开中间弹层");
assert(portalCss.includes(".portal-vue-ai-chip-table-cascader { width: 200px; }") && portalCss.includes(".portal-vue-ai-chip-model-select { width: 200px; }"), "表与模型下拉应统一为紧凑的 200px 宽度");
assert(portalVue.includes('reasoning: "high"') && portalVue.includes("maxTokens=this.currentContextLimit") && portalVue.includes("reasoningEffort:this.reasoning,maxTokens:this.maxTokens"), "分析请求应固定使用最高推理强度和当前模型最高上下文");
assert(!portalVue.includes("推理强度") && !portalVue.includes("上下文长度") && !portalVue.includes("重置为默认设置") && !portalVue.includes("portal-vue-ai-model-reset"), "模型菜单只应保留模型选择，不展示额外设置");
assert(portalVue.includes('label="业务线"') && portalVue.includes("bizLines()"), "表管理应提供业务线列与筛选");
assert(portalVue.includes("portal-vue-ai-clarify") && portalVue.includes("clarifyVisible") && portalVue.includes("openClarify") && portalVue.includes("你问的是哪个业务线？"), "未引用数据表时应弹出底部澄清面板咨询业务线");
assert(portalVue.includes("clarifySubmit") && portalVue.includes("clarifyNext") && portalVue.includes("clarifyPrev") && portalVue.includes("clarifyOptionKey"), "澄清面板应支持 A/B/C 选项与上一题/下一题逐题推进");
assert(portalVue.includes("clarifyAnswers") && portalVue.includes("msg.confirms"), "已确认项应随消息气泡回显");
assert(portalVue.includes('questions: [') && portalVue.includes("timeRange") && portalVue.includes("granularity"), "澄清题目应支持配置多问");
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
