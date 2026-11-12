/**
 * 业务线知识库接口：种子、权限裁剪、写权限、rev 冲突、表知识库、审计。
 * 运行：node --test tests/knowledge-api.test.cjs
 */
const { test, before, after, describe } = require("node:test");
const assert = require("node:assert/strict");
const { startHarness } = require("./helpers/gateway-harness.cjs");

describe("业务线知识库接口", () => {
  let harness;
  before(async () => { harness = await startHarness(); });
  after(async () => { await harness.stop(); });

  const get = async (name, route) => harness.call("GET", route, { token: await harness.tokenFor(name) });
  const send = async (method, name, route, body) => harness.call(method, route, { token: await harness.tokenFor(name), body });
  const fullGroup = (name, tables, extra = {}) => ({ name, desc: "", menus: ["灵犀智析"], menuEdits: [], boards: [], tables, status: "启用", ...extra });
  const groupsWith = (overrides = {}) => [
    fullGroup("门户管理员", ["全部数据表"], { menus: ["灵犀智析", "AI 中心"] }),
    fullGroup("投放组长", ["广告计划日报表"]),
    fullGroup("优化师", ["广告计划日报表"]),
    fullGroup("数据分析师", ["广告计划日报表", "用户订单明细"], { menus: ["灵犀智析", "数据看板"], boards: ["大盘数据"] }),
    fullGroup("只读访客", []),
    ...Object.entries(overrides).map(([name, extra]) => ({ name, ...extra }))
  ].reduce((list, item) => {
    const index = list.findIndex(group => group.name === item.name);
    if (index >= 0 && item.name in overrides) list[index] = { ...list[index], ...item };
    else if (index < 0) list.push(item);
    return list;
  }, []);

  test("未登录 401", async () => {
    assert.equal((await harness.call("GET", "/v1/knowledge")).status, 401);
    assert.equal((await harness.call("PUT", "/v1/knowledge/business-lines", { body: {} })).status, 401);
  });

  test("GET /v1/knowledge 首次返回种子：含 公共、权益 等业务线与 tableLines，且 rev 为数字", async () => {
    const result = await get("曾祥竞", "/v1/knowledge");
    assert.equal(result.status, 200);
    assert.equal(typeof result.data.rev, "number");
    const names = result.data.businessLines.map(line => line.name);
    assert.equal(names[0], "公共");
    for (const name of ["权益", "存量", "号卡", "保险"]) assert.ok(names.includes(name), name);
    assert.equal(result.data.tableLines["广告计划日报表"], "权益");
    assert.equal(result.data.tableLines["渠道维表"], "公共");
    assert.equal(result.data.tableLines["用户订单明细"], "号卡");
    assert.equal(result.data.canEdit, true);
    assert.ok(result.data.knownTables.includes("广告计划日报表"));
    assert.ok(result.data.knownTables.includes("渠道维表"));
  });

  test("非管理员只看到自己有权限的表所在的业务线", async () => {
    const result = await get("谭嘉颖", "/v1/knowledge");
    assert.equal(result.status, 200);
    assert.equal(result.data.canEdit, false);
    const names = result.data.businessLines.map(line => line.name);
    assert.deepEqual(names, ["公共", "权益"]);
    const mine = (await get("谭嘉颖", "/v1/auth/me")).data.tables;
    assert.ok(Object.keys(result.data.tableLines).length > 0);
    assert.ok(Object.keys(result.data.tableLines).every(table => mine.includes(table)), "tableLines 只含自己有权限的表");
    assert.equal(result.data.tableLines["用户订单明细"], undefined);
  });

  describe("管理员保存的关联与字段权限", () => {
    const relation = (id, right) => ({ id, left: { table: "广告计划日报表", field: "media_source" }, right, type: "N:1", note: "" });
    let rev;
    before(async () => {
      const current = await get("曾祥竞", "/v1/knowledge");
      const lines = current.data.businessLines.map(line => line.name === "权益"
        ? { ...line, relations: [relation("rel-a", { table: "广告计划日报表", field: "plan_id" }), relation("rel-b", { table: "广告计划日报表", field: "stat_date" })] }
        : line);
      const saved = await send("PUT", "曾祥竞", "/v1/knowledge/business-lines", { rev: current.data.rev, businessLines: lines, tableLines: {} });
      assert.equal(saved.status, 200, JSON.stringify(saved.data));
      rev = saved.data.rev;
    });

    test("有隐藏字段的用户看不到一端字段被隐藏的关联", async () => {
      const before = await get("谭嘉颖", "/v1/knowledge");
      const lineOf = result => result.data.businessLines.find(line => line.name === "权益");
      assert.equal(lineOf(before).relations.length, 2);
      const org = await get("曾祥竞", "/v1/org");
      const groups = (org.data.customized ? org.data.groups : groupsWith()).map(group => group.name === "优化师" ? { ...group, hiddenFields: { 广告计划日报表: ["plan_id"] } } : group);
      assert.equal((await send("PUT", "曾祥竞", "/v1/org", { groups })).status, 200);
      const after = await get("谭嘉颖", "/v1/knowledge");
      assert.deepEqual(lineOf(after).relations.map(item => item.id), ["rel-b"]);
      // 管理员（编辑者）仍看到完整关联
      const admin = await get("曾祥竞", "/v1/knowledge");
      assert.equal(lineOf(admin).relations.length, 2);
      assert.ok(rev >= 1);
    });
  });

  test("PUT business-lines：管理员保存成功后 GET 立即可见，rev 加 1；用旧 rev 再保存得 409", async () => {
    const current = await get("曾祥竞", "/v1/knowledge");
    const lines = [...current.data.businessLines, { name: "新业务线", knowledge: "# 新业务线\n口径说明", relations: [] }];
    const saved = await send("PUT", "曾祥竞", "/v1/knowledge/business-lines", { rev: current.data.rev, businessLines: lines, tableLines: {} });
    assert.equal(saved.status, 200);
    assert.equal(saved.data.rev, current.data.rev + 1);
    const after = await get("曾祥竞", "/v1/knowledge");
    assert.equal(after.data.rev, saved.data.rev);
    assert.ok(after.data.businessLines.some(line => line.name === "新业务线"));
    const stale = await send("PUT", "曾祥竞", "/v1/knowledge/business-lines", { rev: current.data.rev, businessLines: lines, tableLines: {} });
    assert.equal(stale.status, 409);
    const invalid = await send("PUT", "曾祥竞", "/v1/knowledge/business-lines", { rev: after.data.rev, businessLines: [], tableLines: {} });
    assert.equal(invalid.status, 400);
  });

  test("PUT business-lines：没有「表管理」编辑权限的普通用户 403；权限组 menuEdits 含「表管理」的用户可保存；写权限路由不走管理员闸门", async () => {
    const current = await get("曾祥竞", "/v1/knowledge");
    const body = { rev: current.data.rev, businessLines: current.data.businessLines, tableLines: {} };
    assert.equal((await send("PUT", "李雨航", "/v1/knowledge/business-lines", body)).status, 403);
    assert.equal((await send("PUT", "李雨航", "/v1/knowledge/tables/广告计划日报表", { markdown: "x" })).status, 403);
    const groups = groupsWith({ 数据分析师: { menuEdits: ["表管理"] } });
    assert.equal((await send("PUT", "曾祥竞", "/v1/org", { groups })).status, 200);
    const editor = await get("李雨航", "/v1/knowledge");
    assert.equal(editor.data.canEdit, true);
    const saved = await send("PUT", "李雨航", "/v1/knowledge/business-lines", { rev: editor.data.rev, businessLines: editor.data.businessLines, tableLines: {} });
    assert.equal(saved.status, 200, JSON.stringify(saved.data));
    assert.equal(saved.data.rev, editor.data.rev + 1);
  });

  test("编辑者拿到完整视图（含自己无权限的表），非编辑者拿到裁剪视图", async () => {
    // 李雨航此时是编辑者（上一条已授予），只有广告计划日报表 / 用户订单明细权限
    const editor = await get("李雨航", "/v1/knowledge");
    assert.ok(editor.data.businessLines.some(line => line.name === "保险"), "编辑者应看到全部业务线");
    assert.equal(editor.data.tableLines["渠道归因明细"], "保险", "编辑者应看到无权限表的归属");
    const reader = await get("谭嘉颖", "/v1/knowledge");
    assert.ok(!reader.data.businessLines.some(line => line.name === "保险"));
    assert.equal(reader.data.tableLines["渠道归因明细"], undefined);
  });

  describe("表知识库", () => {
    const TABLE = encodeURIComponent("广告计划日报表");

    test("首次读到种子（来自原型示例），保存后读回；无权限用户读同一张表得 404", async () => {
      const seeded = await get("曾祥竞", `/v1/knowledge/tables/${TABLE}`);
      assert.equal(seeded.status, 200);
      assert.equal(seeded.data.table, "广告计划日报表");
      assert.match(seeded.data.knowledge.markdown, /^# 广告计划日报表/);

      const saved = await send("PUT", "曾祥竞", `/v1/knowledge/tables/${TABLE}`, { markdown: "# 广告计划日报表\n新的口径 SECRET-BODY" });
      assert.equal(saved.status, 200);
      assert.equal(saved.data.knowledge.markdown, "# 广告计划日报表\n新的口径 SECRET-BODY");
      assert.equal(saved.data.knowledge.updatedBy, "曾祥竞");
      const back = await get("曾祥竞", `/v1/knowledge/tables/${TABLE}`);
      assert.equal(back.data.knowledge.markdown, "# 广告计划日报表\n新的口径 SECRET-BODY");

      const denied = await get("曾祥竞", `/v1/knowledge/tables/${encodeURIComponent("不存在的表")}`);
      assert.equal(denied.status, 404);
      const ORDER = encodeURIComponent("用户订单明细");
      const noPermission = await get("谭嘉颖", `/v1/knowledge/tables/${ORDER}`);
      assert.equal(noPermission.status, 404);
      assert.deepEqual(noPermission.data, (await get("谭嘉颖", `/v1/knowledge/tables/${encodeURIComponent("不存在的表")}`)).data);
    });

    test("非编辑者读到按隐藏字段脱敏的文本；编辑者读到原文", async () => {
      await send("PUT", "曾祥竞", `/v1/knowledge/tables/${TABLE}`, { markdown: "# 广告计划日报表\n公开说明\n按 plan_id 去重\n结尾" });
      const raw = await get("李雨航", `/v1/knowledge/tables/${TABLE}`); // 编辑者
      assert.match(raw.data.knowledge.markdown, /按 plan_id 去重/);
      const reader = await get("谭嘉颖", `/v1/knowledge/tables/${TABLE}`); // 优化师，plan_id 被隐藏
      assert.equal(reader.status, 200);
      assert.ok(!reader.data.knowledge.markdown.includes("plan_id"));
      assert.match(reader.data.knowledge.markdown, /公开说明/);
      // 业务线知识库正文同样脱敏
      const current = await get("曾祥竞", "/v1/knowledge");
      const lines = current.data.businessLines.map(line => line.name === "权益" ? { ...line, knowledge: "权益说明\nplan_id 的口径\n尾行" } : line);
      assert.equal((await send("PUT", "曾祥竞", "/v1/knowledge/business-lines", { rev: current.data.rev, businessLines: lines, tableLines: {} })).status, 200);
      const view = await get("谭嘉颖", "/v1/knowledge");
      const text = view.data.businessLines.find(line => line.name === "权益").knowledge.markdown;
      assert.ok(!text.includes("plan_id"));
      assert.match(text, /权益说明/);
      const adminText = (await get("曾祥竞", "/v1/knowledge")).data.businessLines.find(line => line.name === "权益").knowledge.markdown;
      assert.match(adminText, /plan_id 的口径/);
    });
  });

  test("审计：保存后 GET /v1/audit 有 type 为 knowledge-change 的记录，且不含正文", async () => {
    await send("PUT", "曾祥竞", `/v1/knowledge/tables/${encodeURIComponent("广告计划日报表")}`, { markdown: "# t\nAUDIT-SECRET-BODY" });
    const audit = await get("曾祥竞", "/v1/audit?type=knowledge-change");
    assert.equal(audit.status, 200);
    assert.ok(audit.data.items.length >= 2);
    assert.ok(audit.data.items.every(item => item.type === "knowledge-change" && item.user));
    assert.ok(audit.data.items.some(item => item.table === "广告计划日报表"));
    assert.ok(!JSON.stringify(audit.data).includes("AUDIT-SECRET-BODY"));
  });
});

describe("业务线接口：大请求体、失效关联、编辑者字段", () => {
  let harness;
  before(async () => { harness = await startHarness(); });
  after(async () => { await harness.stop(); });

  const get = async (name, route) => harness.call("GET", route, { token: await harness.tokenFor(name) });
  const send = async (method, name, route, body) => harness.call(method, route, { token: await harness.tokenFor(name), body });
  const group = (name, tables, extra = {}) => ({ name, desc: "", menus: ["灵犀智析"], menuEdits: [], boards: [], tables, status: "启用", ...extra });
  const lineOf = (view, name) => view.businessLines.find(line => line.name === name);

  test("超过 64KB 的中文请求体原样往返，不出现 U+FFFD", async () => {
    const current = (await get("曾祥竞", "/v1/knowledge")).data;
    const text = i => `# 业务线${i}\n` + "指标口径：消耗按产品归并，订单按首单日统计。\n".repeat(520);
    const lines = current.businessLines.map((line, i) => ({ ...line, knowledge: text(i) }));
    const body = { rev: current.rev, businessLines: lines, tableLines: {} };
    assert.ok(Buffer.byteLength(JSON.stringify(body)) > 64 * 1024 * 2, "请求体应跨越多个 64KB 分块");
    const saved = await send("PUT", "曾祥竞", "/v1/knowledge/business-lines", body);
    assert.equal(saved.status, 200, JSON.stringify(saved.data));
    const after = (await get("曾祥竞", "/v1/knowledge")).data;
    after.businessLines.forEach((line, i) => {
      assert.ok(!line.knowledge.markdown.includes("�"), `${line.name} 出现了 U+FFFD`);
      assert.equal(line.knowledge.markdown, text(i));
    });
  });

  test("50 条业务线 × 20000 字中文（约 3MB）可以保存", async () => {
    const current = (await get("曾祥竞", "/v1/knowledge")).data;
    const lines = current.businessLines.map(line => ({ ...line, knowledge: "中".repeat(20000) }));
    while (lines.length < 50) lines.push({ name: `线${lines.length}`, knowledge: "文".repeat(20000), relations: [] });
    const body = { rev: current.rev, businessLines: lines, tableLines: {} };
    assert.ok(Buffer.byteLength(JSON.stringify(body)) > 2e6);
    const saved = await send("PUT", "曾祥竞", "/v1/knowledge/business-lines", body);
    assert.equal(saved.status, 200, JSON.stringify(saved.data).slice(0, 200));
    const after = (await get("曾祥竞", "/v1/knowledge")).data;
    assert.equal(after.businessLines.length, 50);
    assert.equal(lineOf(after, "线49").knowledge.markdown, "文".repeat(20000));
    // 恢复成种子业务线，避免影响后面的用例
    const restore = await send("PUT", "曾祥竞", "/v1/knowledge/business-lines", { rev: after.rev, businessLines: current.businessLines, tableLines: {} });
    assert.equal(restore.status, 200, JSON.stringify(restore.data).slice(0, 200));
  });

  test("超过上限的请求体返回 413 和明确的错误，不是断开连接；其他接口沿用原上限", async () => {
    const huge = await send("PUT", "曾祥竞", "/v1/knowledge/business-lines", { rev: 0, businessLines: [{ name: "x", knowledge: "中".repeat(3_000_000) }] });
    assert.equal(huge.status, 413);
    assert.match(huge.data.error, /请求内容过大/);
    const feedback = await send("POST", "曾祥竞", "/v1/feedback", { note: "a".repeat(9000) });
    assert.equal(feedback.status, 413, "反馈接口原上限 8000 字符");
    assert.match(feedback.data.error, /请求内容过大/);
    // 服务仍可用
    assert.equal((await get("曾祥竞", "/v1/knowledge")).status, 200);
  });

  test("关联失效原因：编辑者视图与裁剪视图都带派生的 invalid；PUT 时客户端带来的 invalid 被忽略；表移出后标记失效", async () => {
    const current = (await get("曾祥竞", "/v1/knowledge")).data;
    const ok = { id: "rel-ok", left: { table: "广告计划日报表", field: "media_source" }, right: { table: "媒体消耗汇总", field: "media_source" }, type: "N:1", note: "", invalid: "客户端伪造" };
    const cross = { id: "rel-cross", left: { table: "广告计划日报表", field: "product_name" }, right: { table: "用户订单明细", field: "product_name" }, type: "N:1", note: "" };
    const lines = current.businessLines.map(line => line.name === "权益" ? { ...line, relations: [ok, cross] } : line);
    const saved = await send("PUT", "曾祥竞", "/v1/knowledge/business-lines", { rev: current.rev, businessLines: lines, tableLines: {} });
    assert.equal(saved.status, 200, JSON.stringify(saved.data));
    const stored = JSON.parse(require("node:fs").readFileSync(require("node:path").join(harness.dataDir, "knowledge.json"), "utf8"));
    assert.ok(!JSON.stringify(stored).includes("invalid"), "invalid 不应落盘");
    let view = (await get("曾祥竞", "/v1/knowledge")).data;
    let rels = lineOf(view, "权益").relations;
    assert.equal(rels.find(item => item.id === "rel-ok").invalid, undefined, "有效关联没有 invalid");
    assert.match(rels.find(item => item.id === "rel-cross").invalid, /用户订单明细.*不在「权益」/);
    // 把媒体消耗汇总移出 → rel-ok 失效
    const moved = await send("PUT", "曾祥竞", "/v1/knowledge/business-lines", { rev: view.rev, businessLines: view.businessLines, tableLines: { 媒体消耗汇总: "" } });
    assert.equal(moved.status, 200, JSON.stringify(moved.data));
    view = (await get("曾祥竞", "/v1/knowledge")).data;
    rels = lineOf(view, "权益").relations;
    assert.match(rels.find(item => item.id === "rel-ok").invalid, /媒体消耗汇总.*未分组/);
    // 非编辑者的裁剪视图同样标记（只含字段都可见的关联）
    const groups = [
      group("门户管理员", ["全部数据表"], { menus: ["灵犀智析", "AI 中心"] }),
      group("投放组长", ["广告计划日报表"]),
      group("优化师", ["广告计划日报表", "媒体消耗汇总", "用户订单明细"]),
      group("数据分析师", ["广告计划日报表"]),
      group("只读访客", [])
    ];
    assert.equal((await send("PUT", "曾祥竞", "/v1/org", { groups })).status, 200);
    const reader = (await get("谭嘉颖", "/v1/knowledge")).data;
    assert.equal(reader.canEdit, false);
    const readerRels = lineOf(reader, "权益").relations;
    assert.match(readerRels.find(item => item.id === "rel-ok").invalid, /媒体消耗汇总/);
    assert.match(readerRels.find(item => item.id === "rel-cross").invalid, /用户订单明细/);
  });

  test("编辑者的 GET /v1/knowledge 带 tableFields（网关真实字段，仅 knownTables）；非编辑者没有；/v1/table-fields 仍只给管理员", async () => {
    const groups = [
      group("门户管理员", ["全部数据表"], { menus: ["灵犀智析", "AI 中心"] }),
      group("投放组长", ["广告计划日报表"]),
      group("优化师", ["广告计划日报表"]),
      group("数据分析师", ["广告计划日报表", "用户订单明细"], { menus: ["灵犀智析", "表管理"], menuEdits: ["表管理"] }),
      group("只读访客", [])
    ];
    assert.equal((await send("PUT", "曾祥竞", "/v1/org", { groups })).status, 200);
    const real = (await get("曾祥竞", "/v1/table-fields")).data.tables;
    const editor = (await get("李雨航", "/v1/knowledge")).data;
    assert.equal(editor.canEdit, true);
    assert.deepEqual(Object.keys(editor.tableFields).sort(), [...editor.knownTables].sort());
    for (const table of editor.knownTables) assert.deepEqual(editor.tableFields[table], real[table].map(field => field.name), table);
    assert.equal((await get("李雨航", "/v1/table-fields")).status, 403, "/v1/table-fields 仍只给管理员");
    const reader = (await get("谭嘉颖", "/v1/knowledge")).data;
    assert.equal(reader.canEdit, false);
    assert.equal(reader.tableFields, undefined);
  });
});
