/**
 * 回答反馈测试：只能评价自己的分析、重复提交覆盖、管理员汇总、历史记录保留评价。
 * 运行：node --test tests/feedback.test.cjs
 */
const { test, before, after, describe } = require("node:test");
const assert = require("node:assert/strict");
const { startHarness } = require("./helpers/gateway-harness.cjs");

describe("回答反馈", () => {
  let harness;
  before(async () => { harness = await startHarness(); });
  after(async () => { await harness.stop(); });

  const analyze = async name => {
    const result = await harness.call("POST", "/v1/analyze", {
      token: await harness.tokenFor(name),
      body: { question: `${name} 的问题：广告计划表有哪些字段？`, scenario: "single", model: harness.MODEL, tables: ["广告计划日报表"], toolMode: false }
    });
    assert.equal(result.status, 200);
    return result.data.meta.requestId;
  };
  const rate = async (name, body) => harness.call("POST", "/v1/feedback", { token: await harness.tokenFor(name), body });

  test("评价自己的分析：成功，并记录模型、Skill 与问题摘要", async () => {
    const requestId = await analyze("李雨航");
    const result = await rate("李雨航", { requestId, rating: "down", comment: "口径不对" });
    assert.equal(result.status, 200);
    const list = await harness.call("GET", "/v1/feedback", { token: await harness.tokenFor("曾祥竞") });
    const item = list.data.items.find(entry => entry.requestId === requestId);
    assert.equal(item.rating, "down");
    assert.equal(item.comment, "口径不对");
    assert.equal(item.user, "李雨航");
    assert.equal(item.model, harness.MODEL);
    assert.match(item.question, /广告计划表/);
  });

  test("不能评价别人的分析，也不能评价不存在的分析", async () => {
    const requestId = await analyze("谭嘉颖");
    assert.equal((await rate("林金维", { requestId, rating: "up" })).status, 404, "别人的 requestId 不应能被评价");
    assert.equal((await rate("林金维", { requestId: "不存在的id", rating: "up" })).status, 404);
  });

  test("评价值非法被拒绝；未登录被拒绝", async () => {
    const requestId = await analyze("李雨航");
    assert.equal((await rate("李雨航", { requestId, rating: "meh" })).status, 400);
    assert.equal((await harness.call("POST", "/v1/feedback", { body: { requestId, rating: "up" } })).status, 401);
  });

  test("重复评价覆盖上一次，不会产生两条；评语最多 500 字", async () => {
    const requestId = await analyze("黄佩贤");
    await rate("黄佩贤", { requestId, rating: "down", comment: "x".repeat(900) });
    await rate("黄佩贤", { requestId, rating: "up" });
    const list = await harness.call("GET", "/v1/feedback", { token: await harness.tokenFor("曾祥竞") });
    const mine = list.data.items.filter(entry => entry.requestId === requestId);
    assert.equal(mine.length, 1);
    assert.equal(mine[0].rating, "up");
    const again = await rate("黄佩贤", { requestId, rating: "down", comment: "x".repeat(900) });
    assert.equal(again.status, 200);
    const final = (await harness.call("GET", "/v1/feedback?rating=down&limit=100", { token: await harness.tokenFor("曾祥竞") })).data.items.find(entry => entry.requestId === requestId);
    assert.equal(final.comment.length, 500);
  });

  test("只有管理员能看反馈列表与汇总，并可按评价筛选", async () => {
    assert.equal((await harness.call("GET", "/v1/feedback", { token: await harness.tokenFor("李雨航") })).status, 403);
    const admin = await harness.tokenFor("曾祥竞");
    const downs = await harness.call("GET", "/v1/feedback?rating=down", { token: admin });
    assert.ok(downs.data.items.every(entry => entry.rating === "down"));
    const summary = downs.data.summary;
    assert.ok(summary.total >= 2);
    assert.equal(summary.up + summary.down, summary.total);
    assert.ok(summary.byModel[harness.MODEL].down >= 1);
  });

  test("历史记录保留 requestId 与评价；非法评价值被丢弃", async () => {
    const token = await harness.tokenFor("李雨航");
    await harness.call("PUT", "/v1/history", {
      token,
      body: {
        reports: [],
        sessions: [{ id: "s1", title: "t", messages: [
          { role: "assistant", lines: ["a"], requestId: "req-1", feedback: "up" },
          { role: "assistant", lines: ["b"], requestId: "req-2", feedback: "<script>" }
        ] }]
      }
    });
    const history = await harness.call("GET", "/v1/history", { token });
    const [first, second] = history.data.sessions[0].messages;
    assert.equal(first.requestId, "req-1");
    assert.equal(first.feedback, "up");
    assert.equal(second.feedback, "", "非法评价值不应被保存");
  });
});

describe("负反馈：截图和上下文", () => {
  let harness;
  before(async () => { harness = await startHarness(); });
  after(async () => { await harness.stop(); });

  const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from("fake-png-body")]);
  const png = `data:image/png;base64,${PNG.toString("base64")}`;
  const analyze = async name => (await harness.call("POST", "/v1/analyze", {
    token: await harness.tokenFor(name),
    body: { question: `${name} 的问题：广告计划表有哪些字段？`, scenario: "single", model: harness.MODEL, tables: ["广告计划日报表"], toolMode: false }
  })).data.meta.requestId;
  const rate = async (name, body) => harness.call("POST", "/v1/feedback", { token: await harness.tokenFor(name), body });
  const rawImage = async (id, name) => fetch(`${harness.baseUrl}/v1/feedback/images/${id}`, { headers: name ? { Authorization: `Bearer ${await harness.tokenFor(name)}` } : {} });

  test("踩 + 截图 + 上下文：保存，管理员能在列表里看到并取回图片", async () => {
    const requestId = await analyze("李雨航");
    const result = await rate("李雨航", { requestId, rating: "down", comment: "数字对不上", images: [png], context: { question: "广告计划表有哪些字段？", model: "gpt-x", conversation: [{ role: "user", text: "前一个问题" }], page: "#/analysis" } });
    assert.equal(result.status, 200, JSON.stringify(result.data));
    const item = (await harness.call("GET", "/v1/feedback", { token: await harness.tokenFor("曾祥竞") })).data.items.find(entry => entry.requestId === requestId);
    assert.equal(item.images.length, 1);
    assert.match(item.images[0], /^[a-f0-9]{24}\.png$/);
    assert.equal(item.context.model, "gpt-x");
    assert.deepEqual(item.context.conversation, [{ role: "user", text: "前一个问题" }]);
    const image = await rawImage(item.images[0], "曾祥竞");
    assert.equal(image.status, 200);
    assert.equal(image.headers.get("content-type"), "image/png");
    assert.equal(image.headers.get("x-content-type-options"), "nosniff");
    assert.ok(Buffer.from(await image.arrayBuffer()).equals(PNG));
  });

  test("截图只有管理员能看：普通账号 403，未登录 401，不存在 404", async () => {
    const requestId = await analyze("谭嘉颖");
    await rate("谭嘉颖", { requestId, rating: "down", images: [png] });
    const id = (await harness.call("GET", "/v1/feedback", { token: await harness.tokenFor("曾祥竞") })).data.items.find(entry => entry.requestId === requestId).images[0];
    assert.equal((await rawImage(id, "谭嘉颖")).status, 403);
    assert.equal((await rawImage(id, "")).status, 401);
    assert.equal((await rawImage(`${"0".repeat(24)}.png`, "曾祥竞")).status, 404);
    assert.equal((await rawImage("../../etc/passwd", "曾祥竞")).status, 404);
  });

  test("不合格的图片被拒绝：类型不对、文件头不符、超过 3 张", async () => {
    const requestId = await analyze("林金维");
    const gif = `data:image/gif;base64,${Buffer.from("GIF89a").toString("base64")}`;
    const fake = `data:image/png;base64,${Buffer.from("这不是图片").toString("base64")}`;
    assert.equal((await rate("林金维", { requestId, rating: "down", images: [gif] })).status, 400);
    assert.equal((await rate("林金维", { requestId, rating: "down", images: [fake] })).status, 400);
    assert.equal((await rate("林金维", { requestId, rating: "down", images: [png, png, png, png] })).status, 400);
  });

  test("改成「赞」或重新提交后，旧截图被删除，不留孤儿文件", async () => {
    const requestId = await analyze("黄佩贤");
    await rate("黄佩贤", { requestId, rating: "down", images: [png] });
    const admin = await harness.tokenFor("曾祥竞");
    const id = (await harness.call("GET", "/v1/feedback", { token: admin })).data.items.find(entry => entry.requestId === requestId).images[0];
    assert.equal((await rawImage(id, "曾祥竞")).status, 200);
    await rate("黄佩贤", { requestId, rating: "up", images: [png] });
    assert.equal((await rawImage(id, "曾祥竞")).status, 404, "覆盖后旧图应已删除");
    const item = (await harness.call("GET", "/v1/feedback", { token: admin })).data.items.find(entry => entry.requestId === requestId);
    assert.deepEqual(item.images, [], "好评不保留截图");
  });
});

describe("对话里粘贴图片：发给模型", () => {
  let harness;
  before(async () => { harness = await startHarness(); });
  after(async () => { await harness.stop(); });

  const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from("fake-png-body")]);
  const png = `data:image/png;base64,${PNG.toString("base64")}`;
  const ask = async (name, extra) => harness.call("POST", "/v1/analyze", {
    token: await harness.tokenFor(name),
    body: { question: "看下这张图里的数据对不对", scenario: "single", model: harness.MODEL, tables: ["广告计划日报表"], toolMode: false, ...extra }
  });
  const imageRequests = () => harness.relay.requests.filter(request => request.messages.some(message => Array.isArray(message.content) && message.content.some(part => part.type === "image_url")));

  test("带图片的提问：最后一条用户消息变成「文字 + image_url」发给模型；不带图片时仍是纯文字", async () => {
    harness.relay.requests.length = 0;
    const withImage = await ask("李雨航", { images: [png] });
    assert.equal(withImage.status, 200, JSON.stringify(withImage.data));
    const sent = imageRequests();
    assert.ok(sent.length >= 1, "模型应收到图片");
    const user = sent[0].messages.filter(message => message.role === "user").at(-1);
    assert.equal(user.content[0].type, "text");
    assert.match(user.content[0].text, /看下这张图里的数据对不对/);
    assert.equal(user.content[1].image_url.url, png);
    harness.relay.requests.length = 0;
    assert.equal((await ask("李雨航", {})).status, 200);
    assert.equal(imageRequests().length, 0, "没有图片时不能带 image_url");
    assert.ok(harness.relay.requests.every(request => request.messages.every(message => typeof message.content === "string")));
  });

  test("图片不合格被拒绝：类型、文件头、张数；整个请求不调用模型", async () => {
    harness.relay.requests.length = 0;
    const gif = `data:image/gif;base64,${Buffer.from("GIF89a").toString("base64")}`;
    const fake = `data:image/png;base64,${Buffer.from("这不是图片").toString("base64")}`;
    for (const images of [[gif], [fake], [png, png, png, png], "不是数组"]) {
      const result = await ask("谭嘉颖", { images });
      assert.equal(result.status, 400, JSON.stringify(images).slice(0, 40));
      assert.ok(result.data.error);
    }
    assert.equal(harness.relay.requests.length, 0, "校验失败时不应调用模型");
  });

  test("审计里只记图片张数，不记图片内容", async () => {
    const result = await ask("林金维", { images: [png] });
    assert.equal(result.status, 200);
    const audit = (await harness.call("GET", "/v1/audit?limit=20", { token: await harness.tokenFor("曾祥竞") })).data;
    const entry = (audit.items || audit.entries || audit).find?.(item => item.requestId === result.data.meta.requestId);
    assert.ok(entry, "审计里应有这次分析");
    assert.equal(entry.imageCount, 1);
    assert.ok(!JSON.stringify(entry).includes("base64"), "审计里不能出现图片内容");
  });
});
