/**
 * Skill 规范包引擎与权益包规范：术语解析、拦截规则、回答协议、参考资料工具、会话上下文。
 * 运行：node --test tests/skill-pack.test.cjs
 */
const { test, describe } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const pack = require("../scripts/skill-pack.cjs");

const packs = pack.loadPacks(path.join(__dirname, "..", "skill-packs"));
const equity = packs.get("equity-union-analyst");

describe("权益包加载", () => {
  test("清单、核心规则与四份参考资料都能读到", () => {
    assert.ok(equity, "应加载到 equity-union-analyst");
    assert.match(equity.instructions, /五条硬口径/);
    assert.deepEqual(equity.references.map(item => item.name), ["metrics", "table-schema", "playbook", "sql-templates"]);
    assert.ok(equity.references.every(item => item.content.length > 1000));
  });

  test("核心规则每次都进入上下文，要保持精简（不超过 5000 字符）", () => {
    assert.ok(equity.instructions.length < 5000, `SKILL.md 有 ${equity.instructions.length} 字符`);
  });
});

describe("术语解析", () => {
  const resolve = (question, carried) => pack.resolveTerms(equity.spec, question, carried);

  test("任哥落到投放一部两个组的部门口径", () => {
    const result = resolve("任哥昨天消耗多少");
    assert.deepEqual(result.resolved.map(item => item.term), ["任哥"]);
    assert.deepEqual(result.resolved[0].filter, { field: "department", values: ["投放一部-权益一组", "投放一部-权益二组"] });
    assert.equal(result.resolved[0].kind, "部门口径");
  });

  test("存量、子墨、白驹存量都是同一个账号口径，且不触发「白驹」歧义", () => {
    for (const question of ["存量昨天花了多少", "子墨本周 ROI", "白驹存量的签约率"]) {
      const result = resolve(question);
      assert.equal(result.ambiguous.length, 0, question);
      assert.deepEqual(result.resolved[0].filter, { field: "account_id", values: ["白驹存量"] }, question);
    }
  });

  test("单独说「白驹」是歧义：不自行选择口径，并给出两种选项", () => {
    const result = resolve("白驹这周消耗怎么样");
    assert.equal(result.resolved.length, 0);
    assert.equal(result.ambiguous.length, 1);
    assert.equal(result.ambiguous[0].options.length, 2);
  });

  test("三方 / CPA 落到三方支付套餐，自营落到常规套餐", () => {
    assert.equal(resolve("三方 ROI 怎么样").resolved[0].filter.values[0], "三方支付套餐");
    assert.equal(resolve("自营的签约率").resolved[0].filter.values[0], "常规套餐");
  });

  test("追问没有再提到口径时沿用上一轮的词；只认术语表里的词", () => {
    const result = resolve("那昨天呢", ["任哥", "不存在的词"]);
    assert.deepEqual(result.resolved.map(item => [item.term, item.carried]), [["任哥", true]]);
    assert.equal(resolve("那昨天呢", ["白驹"]).resolved.length, 0, "歧义词不沿用");
  });

  test("这一轮提到了新的口径就不再沿用旧的", () => {
    const result = resolve("伯都呢", ["任哥"]);
    assert.deepEqual(result.resolved.map(item => item.term), ["伯都"]);
  });
});

describe("拦截规则", () => {
  const guards = question => pack.matchGuards(equity.spec, question);

  test("按商户 / 支付渠道拆分被直接拦截，并给出替代方案", () => {
    for (const question of ["按商户看一下收入", "各支付渠道的消耗占比", "分商户统计成功用户"]) {
      const found = guards(question);
      assert.equal(found[0]?.id, "merchant-channel", question);
      assert.equal(found[0].mode, "block");
      assert.match(found[0].answer, /明细表/);
    }
  });

  test("正常问题不会被误拦", () => {
    for (const question of ["任哥昨天消耗多少", "近 7 天各账号的签约率排名", "哪个部门 ROI 最高"]) {
      assert.equal(guards(question).filter(item => item.mode === "block").length, 0, question);
    }
  });

  test("小时级转化、三方签约、日级 ROI、去重用户是提示类规则", () => {
    assert.equal(guards("每小时的转化率")[0]?.id, "hourly-conversion");
    assert.equal(guards("三方的签约率是多少")[0]?.id, "third-party-contract");
    assert.equal(guards("昨天的 ROI 回本了吗")[0]?.id, "daily-roi");
    assert.equal(guards("去重用户一共多少")[0]?.id, "distinct-users");
    assert.ok(guards("每小时的转化率").every(item => item.mode === "warn"));
  });
});

describe("给模型的上下文", () => {
  test("口径解析、歧义处理、提示与缺省值都会写进去", () => {
    const resolution = pack.resolveTerms(equity.spec, "任哥和白驹的三方 ROI");
    const text = pack.buildSpecContext({ resolution, guards: pack.matchGuards(equity.spec, "任哥和白驹的三方 ROI"), spec: equity.spec });
    assert.match(text, /「任哥」→ 部门口径/);
    assert.match(text, /department IN \('投放一部-权益一组', '投放一部-权益二组'\)/);
    assert.match(text, /「白驹」有多种含义/);
    assert.match(text, /缺省值/);
  });

  test("回答协议：答案优先、不写长报告；按角色调整关注点", () => {
    const optimizer = pack.buildAnswerProtocol(pack.roleForGroup("优化师"));
    assert.match(optimizer, /答案优先/);
    assert.match(optimizer, /不要为了完整写成长报告/);
    assert.match(optimizer, /可以马上执行的动作/);
    assert.match(pack.buildAnswerProtocol(pack.roleForGroup("数据分析师")), /SQL/);
    assert.match(pack.buildAnswerProtocol(pack.roleForGroup("运营组")), /业务语言/);
    assert.equal(pack.roleForGroup("门户管理员"), "general");
  });
});

describe("参考资料工具", () => {
  test("按名字读取，名字不对时说明可读哪些", () => {
    const tool = pack.createReferenceTool(equity);
    assert.equal(tool.schema.function.name, "read_reference");
    const ok = tool.execute(JSON.stringify({ name: "metrics" }));
    assert.equal(ok.ok, true);
    assert.match(ok.data.内容, /指标计算说明/);
    const bad = tool.execute(JSON.stringify({ name: "nope" }));
    assert.equal(bad.ok, false);
    assert.match(bad.error, /metrics、table-schema/);
  });
});

describe("会话上下文", () => {
  test("只保留最近几轮，丢掉代码块与提问卡片，截断长度，过滤非法 skillId", () => {
    const turns = pack.sanitizeConversation([
      { question: "更早的一轮，会被丢掉", answer: "old" },
      { question: "第一问", answer: "a".repeat(2000), skillId: "equity-union-analyst", terms: ["任哥"] },
      { question: "x", answer: "```ask\n{}\n```正文", skillId: "../evil" },
      { question: "三", answer: "c" }
    ]);
    assert.equal(pack.sanitizeConversation([{ question: "", answer: "没有问题的不要" }]).length, 0);
    assert.equal(turns.length, 3);
    assert.ok(!turns.some(turn => turn.question.startsWith("更早")));
    assert.ok(turns.every(turn => turn.answer.length <= 600));
    assert.equal(turns.find(turn => turn.question === "x")?.skillId, "", "非法 skillId 被清空");
    assert.match(pack.buildConversationContext(turns), /第 1 轮 用户：/);
    assert.equal(pack.buildConversationContext([]), "");
  });
});
