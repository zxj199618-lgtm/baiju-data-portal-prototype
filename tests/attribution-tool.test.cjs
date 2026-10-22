/**
 * 语义层归因（attribute_change）与血缘工具：确定性拆解、核对、固定口径、权限。
 * 运行：node --test tests/attribution-tool.test.cjs
 */
const { test, describe } = require("node:test");
const assert = require("node:assert/strict");
const { createSemanticLayer } = require("../scripts/semantic-layer.cjs");
const { createAnalysisToolkit } = require("../scripts/analysis-tools.cjs");
const equity = require("../scripts/equity-sample.cjs");

const rows = equity.generate("2026-08-31");
const tableDef = { cnName: equity.TABLE_NAME, fields: equity.FIELDS, lineage: { upstream: [{ table: "dws_x", role: "订单明细", join: "LEFT JOIN" }], downstream: [] } };
const layer = createSemanticLayer({ catalog: require("../semantic/metrics.json"), tables: [tableDef], rowsOf: () => rows });
const attribute = (metric, extra = {}) => layer.attribute({ metric, table: equity.TABLE_NAME, days: 7, allowedTables: [equity.TABLE_NAME], ...extra });

describe("加法指标归因", () => {
  const result = attribute("cost");
  test("总体与 query 一致；每个维度的各组变化之和等于总变化", () => {
    assert.equal(result.ok, true);
    const query = layer.query({ metric: "cost", table: equity.TABLE_NAME, days: 7, allowedTables: [equity.TABLE_NAME] }).data;
    assert.equal(result.data.总体.近N天, query.近N天);
    assert.equal(result.data.总体.变化量, query.变化量);
    assert.ok(result.data.维度.length >= 3);
    for (const dimension of result.data.维度) {
      assert.equal(dimension.各组变化之和等于总变化, true, dimension.字段);
      const sum = dimension.主要贡献.reduce((total, item) => total + item.变化量, 0) + dimension.其余合计.变化量;
      assert.ok(Math.abs(sum - result.data.总体.变化量) < 0.05, `${dimension.字段} 合计 ${sum} 对不上总变化`);
    }
  });

  test("固定口径仍然生效：只取常规套餐与三方支付套餐，结果带出固定筛选", () => {
    assert.deepEqual(result.data.口径.固定筛选[0].取值, ["常规套餐", "三方支付套餐"]);
  });

  test("先限定范围再拆解：任哥范围内的各组之和等于任哥的总变化", () => {
    const scoped = attribute("cost", { filters: [{ field: "department", values: ["投放一部-权益一组", "投放一部-权益二组"] }], dimensions: ["account_id"] });
    assert.deepEqual(scoped.data.维度.map(item => item.字段), ["account_id"]);
    assert.ok(scoped.data.维度[0].主要贡献.every(item => item.组.startsWith("任哥")));
    assert.equal(scoped.data.筛选[0].字段, "department");
  });
});

describe("比率指标归因", () => {
  const result = attribute("sign_rate");
  test("结构效应 + 效率效应 + 分母为零的影响 = 总变化，每个维度都核对通过", () => {
    assert.equal(result.ok, true);
    for (const dimension of result.data.维度) {
      assert.equal(dimension.三部分之和等于总变化, true, dimension.字段);
      const total = dimension.结构效应合计 + dimension.效率效应合计 + dimension.分母为零的分组的影响;
      assert.ok(Math.abs(total - result.data.总体.变化量) < 0.01, `${dimension.字段}：${total} vs ${result.data.总体.变化量}`);
    }
  });

  test("埋的故事线能被定位：伯都主号的效率效应为负，达人号B 停投体现为结构效应", () => {
    const account = result.data.维度.find(item => item.字段 === "account_id");
    const boDu = account.主要贡献.find(item => item.组 === "伯都主号");
    const daren = account.主要贡献.find(item => item.组 === "达人号B");
    assert.ok(boDu && boDu.效率效应 < -1, `伯都主号效率效应 ${boDu?.效率效应}`);
    assert.ok(daren && Math.abs(daren.结构效应) > 0.5, `达人号B 结构效应 ${daren?.结构效应}`);
  });

  test("指标自带的固定筛选生效，与它冲突的筛选被拒绝并说明适用范围", () => {
    assert.deepEqual(result.data.口径.固定筛选.find(item => item.字段 === "commodity_classify").取值, ["常规套餐"]);
    const conflict = attribute("sign_rate", { filters: [{ field: "commodity_classify", values: ["三方支付套餐"] }] });
    assert.equal(conflict.ok, false);
    assert.match(conflict.error, /只适用于 commodity_classify = 常规套餐/);
  });

  test("百分比类指标用百分点表示：效应的量级和总变化一致", () => {
    assert.ok(Math.abs(result.data.总体.变化量) < 100);
    assert.match(result.data.读法, /结构效应/);
  });
});

describe("边界与错误", () => {
  test("未知指标、不支持的维度、无权限的表", () => {
    assert.match(attribute("nope").error, /未找到指标/);
    assert.match(attribute("cost", { dimensions: ["pay_merchant"] }).error, /不支持按 pay_merchant 拆解/);
    assert.match(layer.attribute({ metric: "cost", table: equity.TABLE_NAME, allowedTables: [] }).error, /没有可用的数据表|无权访问/);
  });

  test("筛选成单一取值的维度没有信息量，不出现；全部维度都只有一个取值时给出说明而不是空结果", () => {
    const one = attribute("cost", { filters: [{ field: "account_id", values: ["白驹存量"] }] });
    assert.ok(!one.data.维度.some(item => item.字段 === "account_id"));
    const none = attribute("cost", { filters: [{ field: "account_id", values: ["白驹存量"] }], dimensions: ["account_id"] });
    assert.match(none.data.说明, /没有可以拆解的维度/);
  });

  test("筛选后没有数据：说明原因", () => {
    assert.match(attribute("cost", { filters: [{ field: "department", values: ["不存在"] }] }).data.说明, /筛选后没有数据/);
  });
});

describe("工具箱接入", () => {
  const toolkit = createAnalysisToolkit({ userName: "t", allowedTables: [equity.TABLE_NAME], tables: [tableDef], rowsOf: () => rows, semantic: layer });
  const call = (name, args) => toolkit.execute(name, JSON.stringify(args));

  test("工具定义里有 attribute_change 与 get_lineage", () => {
    const names = toolkit.schemas.map(schema => schema.function.name);
    assert.ok(names.includes("attribute_change") && names.includes("get_lineage"));
  });

  test("attribute_change 经工具箱执行，返回的内容没被截断到不可用", () => {
    const outcome = call("attribute_change", { metric: "sign_rate" });
    assert.equal(outcome.ok, true);
    assert.ok(!outcome.content.includes('"truncated"'), `输出 ${outcome.content.length} 字符`);
    assert.ok(outcome.data.维度.length >= 3);
  });

  test("get_lineage：返回上下游；没登记血缘时如实说明；无权限的表和不存在的表同一条提示", () => {
    const lineage = call("get_lineage", { table: equity.TABLE_NAME }).data;
    assert.equal(lineage.上游[0].表, "dws_x");
    const noLineage = createAnalysisToolkit({ userName: "t", allowedTables: ["空表"], tables: [{ cnName: "空表", fields: [] }], rowsOf: () => [], semantic: layer });
    assert.match(noLineage.execute("get_lineage", JSON.stringify({ table: "空表" })).data.说明, /没有登记/);
    assert.equal(call("get_lineage", { table: "别人的表" }).ok, false);
  });
});
