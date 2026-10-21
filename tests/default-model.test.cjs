/**
 * 默认模型可配置：管理员设置、校验、失效时自动退回，以及未指定模型的请求使用它。
 * 运行：node --test tests/default-model.test.cjs
 */
const { test, before, after, describe } = require("node:test");
const assert = require("node:assert/strict");
const { startHarness } = require("./helpers/gateway-harness.cjs");

describe("默认模型", () => {
  let harness, admin, user;
  before(async () => {
    harness = await startHarness();
    harness.relay.models = [harness.MODEL, "alt-model", "third-model"];
    admin = await harness.tokenFor("曾祥竞");
    user = await harness.tokenFor("李雨航");
    await harness.call("POST", "/v1/providers/prov-relay/refresh", { token: admin });
  });
  after(async () => { await harness.stop(); });

  const models = async () => (await harness.call("GET", "/v1/models", { token: user })).data;

  test("未设置时：内置默认模型在清单里就用它", async () => {
    const data = await models();
    assert.equal(data.default, harness.MODEL);
    assert.equal(data.defaultConfigured, "");
  });

  test("管理员设置后立即生效；普通用户不能设置", async () => {
    assert.equal((await harness.call("PUT", "/v1/default-model", { token: user, body: { model: "alt-model" } })).status, 403);
    const result = await harness.call("PUT", "/v1/default-model", { token: admin, body: { model: "alt-model" } });
    assert.equal(result.status, 200);
    assert.equal((await models()).default, "alt-model");
  });

  test("未指定模型的分析请求使用配置的默认模型", async () => {
    harness.relay.requests.length = 0;
    const result = await harness.call("POST", "/v1/analyze", { token: user, body: { question: "你好", scenario: "general", tables: [], toolMode: false } });
    assert.equal(result.status, 200);
    assert.equal(harness.relay.requests.at(-1).model, "alt-model");
    assert.equal(result.data.meta.model, "alt-model");
  });

  test("不在清单里的模型、被停用的模型都不能设为默认", async () => {
    const unknown = await harness.call("PUT", "/v1/default-model", { token: admin, body: { model: "no-such-model" } });
    assert.equal(unknown.status, 400);
    assert.match(unknown.data.error, /不在可调用的模型清单里/);
    await harness.call("PUT", "/v1/model-config/third-model", { token: admin, body: { enabled: false } });
    const disabled = await harness.call("PUT", "/v1/default-model", { token: admin, body: { model: "third-model" } });
    assert.equal(disabled.status, 400);
    assert.match(disabled.data.error, /已被停用/);
  });

  test("配置的默认模型之后被停用：自动退回内置默认，而不是让用户用一个不可用的模型", async () => {
    await harness.call("PUT", "/v1/model-config/alt-model", { token: admin, body: { enabled: false } });
    const data = await models();
    assert.equal(data.default, harness.MODEL);
    assert.equal(data.defaultConfigured, "alt-model", "配置值保留，只是当前不生效");
  });

  test("传空字符串清除配置，并写入审计", async () => {
    assert.equal((await harness.call("PUT", "/v1/default-model", { token: admin, body: { model: "" } })).status, 200);
    assert.equal((await models()).defaultConfigured, "");
    assert.ok(harness.readJsonLines("analysis-audit.jsonl").some(entry => entry.type === "default-model" && entry.user === "曾祥竞"));
  });
});
