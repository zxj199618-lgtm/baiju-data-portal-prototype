/**
 * 报告 Skill 的纯逻辑：意图识别、模板选择、提示词拼装，以及报告包的模板规范。
 * 运行：node --test tests/report-skill.test.cjs
 */
const { test, describe } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const report = require("../scripts/report-skill.cjs");
const { loadPacks } = require("../scripts/skill-pack.cjs");

const pack = loadPacks(path.join(__dirname, "..", "skill-packs")).get("report-writer");

describe("报告包", () => {
  test("是输出类 Skill，不参与自动路由，带 4 个模板且每个模板都有章节说明", () => {
    assert.equal(pack.manifest.kind, "output");
    assert.equal(pack.manifest.router, undefined);
    assert.deepEqual(pack.spec.templates.map(item => item.id), ["general", "weekly", "review", "definition"]);
    for (const template of pack.spec.templates) {
      assert.ok(template.sections.length >= 4, template.id);
      assert.ok(template.sections.every(section => section.title && section.guide), template.id);
    }
  });

  test("核心规则强调：只用已核实的事实、不心算、不补全、草稿口径要标注", () => {
    assert.match(pack.instructions, /不取数，不重算/);
    assert.match(pack.instructions, /待验证的假设/);
    assert.match(pack.instructions, /口径待数据团队确认/);
  });
});

describe("意图识别", () => {
  test("明确要报告的说法", () => {
    for (const question of ["帮我出个周报", "把上面的分析整理成报告", "写一份异动复盘", "生成一份报告", "整理成文档", "给我一份本周总结", "复盘一下", "周报", "出一份口径说明"]) {
      assert.equal(report.detectReportIntent(question), true, question);
    }
  });

  test("普通提问、提到「报告」二字的提问、整理成表格都不算", () => {
    for (const question of ["报告里的数字对吗", "近 7 天消耗多少", "这个报告怎么打开", "任哥为什么涨了", "有哪些表", "总结一下有多少用户", "汇总成表格给我", "整理成一张表"]) {
      assert.equal(report.detectReportIntent(question), false, question);
    }
  });

  test("「基于上面的内容」才沿用已有事实", () => {
    assert.equal(report.wantsReuse("把上面的分析写成周报"), true);
    assert.equal(report.wantsReuse("帮我出一份权益周报"), false);
  });
});

describe("模板选择", () => {
  const templates = pack.spec.templates;
  test("明确指定优先；其次看关键词；最后用通用模板", () => {
    assert.equal(report.pickTemplate(templates, "review", "出个周报").id, "review");
    assert.equal(report.pickTemplate(templates, "", "帮我出个周报").id, "weekly");
    assert.equal(report.pickTemplate(templates, "", "复盘一下消耗为什么涨").id, "review");
    assert.equal(report.pickTemplate(templates, "", "出一份口径说明").id, "definition");
    assert.equal(report.pickTemplate(templates, "", "整理成文档").id, "general");
    assert.equal(report.pickTemplate(templates, "不存在的", "整理成文档").id, "general");
  });
});

describe("提示词拼装", () => {
  test("系统提示含写作规则与模板章节；事实段每次取数一块并带口径词", () => {
    const template = pack.spec.templates.find(item => item.id === "weekly");
    const system = report.buildReportSystem(pack.instructions, template);
    assert.match(system, /报告撰写助手/);
    assert.match(system, /## 报告模板：周报/);
    assert.match(system, /1\. 本周概览：/);
    const facts = report.buildFactsSection([
      { question: "任哥近 7 天消耗", resolvedTerms: [{ term: "任哥", means: "投放一部权益一组 + 二组" }], answer: "消耗 10 万", evidence: [{ 工具: "query_metric", 结果: { 近N天: 100000 } }] },
      { question: "伯都呢", evidence: [{ 工具: "query_metric", 结果: { 近N天: 5 } }] }
    ]);
    assert.match(facts, /第 1 次取数：任哥近 7 天消耗/);
    assert.match(facts, /口径词：任哥（投放一部权益一组 \+ 二组）/);
    assert.match(facts, /第 2 次取数：伯都呢/);
    assert.equal(report.buildFactsSection([]), "");
  });
});
