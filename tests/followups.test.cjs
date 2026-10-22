/**
 * 推荐问题：只推平台能回答的追问；按这一轮实际用到的工具生成；按角色排序；不额外调用模型。
 * 运行：node --test tests/followups.test.cjs
 */
const { test, describe } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { suggestFollowUps, collect } = require("../scripts/followups.cjs");
const { createSemanticLayer } = require("../scripts/semantic-layer.cjs");
const { createAnalysisToolkit } = require("../scripts/analysis-tools.cjs");
const { loadPacks } = require("../scripts/skill-pack.cjs");
const equity = require("../scripts/equity-sample.cjs");

const rows = equity.generate("2026-08-31");
const tableDef = { cnName: equity.TABLE_NAME, fields: equity.FIELDS, lineage: { upstream: [], downstream: [] } };
const semantic = createSemanticLayer({ catalog: require("../semantic/metrics.json"), tables: [tableDef], rowsOf: () => rows });
const toolkit = createAnalysisToolkit({ userName: "t", allowedTables: [equity.TABLE_NAME], tables: [tableDef], rowsOf: () => rows, semantic });
const spec = loadPacks(path.join(__dirname, "..", "skill-packs")).get("equity-union-analyst").spec;
const templates = loadPacks(path.join(__dirname, "..", "skill-packs")).get("report-writer").spec.templates;

/** 像工具循环那样产生证据条目 */
const evidenceOf = (...calls) => calls.map(([name, args]) => {
  const outcome = toolkit.execute(name, JSON.stringify(args));
  return { 工具: name, 参数: JSON.stringify(args), 结果: outcome.ok ? outcome.data : { 错误: outcome.error } };
});
const suggest = (evidence, extra = {}) => suggestFollowUps({ evidence, spec, semantic, templates, ...extra });
const texts = list => list.map(item => item.text);

describe("按这一轮做了什么生成", () => {
  test("看了一个指标：给出「按维度拆开 / 趋势 / 相关指标」这类平台能回答的追问，最多 3 条，至多 1 条报告", () => {
    const list = suggest(evidenceOf(["query_metric", { metric: "roi_self", table: equity.TABLE_NAME }]), { question: "近 7 天自营 ROI 怎么样", role: "general" });
    assert.ok(list.length >= 2 && list.length <= 3);
    assert.ok(list.filter(item => item.kind === "report").length <= 1);
    assert.ok(list.some(item => /各部门的自营 ROI 对比/.test(item.text)), texts(list).join(" | "));
    assert.ok(list.every(item => item.text.length <= 40));
  });

  test("已经按部门拆过：不再推荐按部门拆，换下一个可用维度（账号）", () => {
    const list = suggest(evidenceOf(["query_metric", { metric: "cost", table: equity.TABLE_NAME, group: "department" }]), { question: "近 7 天各部门的消耗", role: "general" });
    assert.ok(!texts(list).some(text => /各部门/.test(text)));
    assert.ok(texts(list).some(text => /各账号的消耗对比/.test(text)), texts(list).join(" | "));
  });

  test("变化明显（环比超过 3%）才问「为什么涨 / 跌」；变化很小时不推荐", () => {
    const big = evidenceOf(["query_metric", { metric: "sign_rate", table: equity.TABLE_NAME }]);
    assert.ok(Math.abs(big[0].结果.环比百分比) >= 3);
    assert.ok(texts(suggest(big, { question: "签约率", role: "optimizer" })).some(text => /签约率为什么跌了/.test(text)));
    const small = evidenceOf(["query_metric", { metric: "cost", table: equity.TABLE_NAME }]);
    assert.ok(Math.abs(small[0].结果.环比百分比) < 3);
    assert.ok(!texts(suggest(small, { question: "消耗", role: "optimizer" })).some(text => /为什么/.test(text)));
  });

  test("口径词作为范围带进问题：任哥 → 「任哥近 7 天…」", () => {
    const list = suggest(evidenceOf(["query_metric", { metric: "cost", table: equity.TABLE_NAME, filters: [{ field: "department", values: ["投放一部-权益一组", "投放一部-权益二组"] }] }]),
      { question: "任哥近 7 天消耗", resolvedTerms: [{ term: "任哥" }], role: "ops" });
    assert.ok(list.every(item => item.kind === "report" || item.text.startsWith("任哥")), texts(list).join(" | "));
  });

  test("归因之后：先往下拆贡献最大的那一组，并推荐整理成异动复盘", () => {
    const evidence = evidenceOf(["attribute_change", { metric: "sign_rate", table: equity.TABLE_NAME }]);
    const top = evidence[0].结果.维度[0].主要贡献[0].组;
    const list = suggest(evidence, { question: "签约率为什么下滑", role: "optimizer" });
    assert.match(list[0].text, new RegExp(`^${top}的提单签约率变化，继续往下拆是什么原因`));
    assert.ok(texts(list).includes("把上面的分析整理成异动复盘"));
    assert.equal(list[0].kind, "drill");
  });

  test("报告之后：推荐换模板重新整理（不含当前模板）", () => {
    const list = suggest(evidenceOf(["query_metric", { metric: "cost", table: equity.TABLE_NAME }]), { output: "report", currentTemplate: "weekly", question: "出个周报" });
    assert.deepEqual(texts(list), ["把上面的分析换成通用分析报告重新整理", "把上面的分析换成异动复盘重新整理"]);
    assert.ok(list.every(item => item.kind === "report"));
  });

  test("被拦截的需求：给出规范里写的替代问法", () => {
    const list = suggest([], { guards: [{ mode: "block", suggest: ["近 7 天各部门的实付收入对比", "a", "b", "c"] }] });
    assert.equal(list.length, 3);
    assert.equal(list[0].text, "近 7 天各部门的实付收入对比");
  });

  test("问口径（读了参考资料）：数分能看到取数 SQL 的追问；没有事实时给起步问题", () => {
    const withReference = suggest([{ 工具: "read_reference", 参数: "{}", 结果: { 内容: "x" } }], { question: "签约率怎么算", role: "analyst" });
    assert.equal(withReference[0].text, "这个指标怎么取数？给我一段取数 SQL");
    assert.deepEqual(texts(suggest([], { question: "你好" })), spec.followUps.starters);
  });
});

describe("只推平台能回答的", () => {
  test("每条涉及的指标都存在，涉及的维度都在该表可用的维度里", () => {
    const metrics = ["cost", "roi_self", "roi_third", "sign_rate", "success_users", "cost_per_success_user", "net_retention_rate", "pay_amount"];
    for (const metric of metrics) {
      const list = suggest(evidenceOf(["query_metric", { metric, table: equity.TABLE_NAME }]), { question: metric });
      for (const item of list.filter(entry => entry.kind !== "report")) {
        const mentioned = [...(item.text.match(/各([一-龥]+?)的/) || [])].slice(1);
        for (const label of mentioned) {
          const fields = semantic.dimensionsOf(metric, equity.TABLE_NAME);
          assert.ok(fields.some(field => require("../scripts/followups.cjs").DIMENSION_LABELS[field] === label), `${metric}：「${item.text}」里的维度 ${label} 该表不支持`);
        }
      }
    }
  });

  test("规范里配的相关指标如果不在这张表上，就不推荐（防止配置写错）", () => {
    const bad = { ...spec, followUps: { ...spec.followUps, relatedMetrics: { cost: ["不存在的指标"] } } };
    const list = suggestFollowUps({ evidence: evidenceOf(["query_metric", { metric: "cost", table: equity.TABLE_NAME }]), spec: bad, semantic, templates, question: "消耗" });
    assert.ok(!texts(list).some(text => /不存在的指标/.test(text)));
  });

  test("失败的工具调用不算事实：不据此推荐", () => {
    const failed = [{ 工具: "query_metric", 参数: "{}", 结果: { 错误: "未找到指标" } }];
    assert.equal(collect(failed).hasFacts, false);
    assert.deepEqual(texts(suggest(failed, { question: "x" })), spec.followUps.starters);
  });
});

describe("按角色排序", () => {
  test("优化师先看「为什么」，运营先看趋势，数分先看口径 / 拆解", () => {
    const evidence = evidenceOf(["query_metric", { metric: "sign_rate", table: equity.TABLE_NAME }]);
    assert.equal(suggest(evidence, { question: "签约率", role: "optimizer" })[0].kind, "why");
    assert.equal(suggest(evidence, { question: "签约率", role: "ops" })[0].kind, "trend");
    assert.equal(suggest(evidence, { question: "签约率", role: "analyst" })[0].kind, "group");
  });
});
