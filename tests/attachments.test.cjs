const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { parseDataUrl, validateImages, createImageStore, toContentParts, MAX_IMAGES, MAX_IMAGE_BYTES } = require("../scripts/attachments.cjs");

// 最小的合法文件头（签名对即可，内容不需要是完整图片）
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from("rest")]);
const JPG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.from("rest")]);
const WEBP = Buffer.concat([Buffer.from("RIFF"), Buffer.from([1, 2, 3, 4]), Buffer.from("WEBPVP8 ")]);
const url = (mime, buf) => `data:${mime};base64,${buf.toString("base64")}`;

test("data URL 解析：只认 png / jpeg / webp，且文件头要和声明的类型一致", () => {
  const png = parseDataUrl(url("image/png", PNG));
  assert.deepEqual([png.mime, png.ext, png.buffer.equals(PNG)], ["image/png", "png", true]);
  assert.equal(parseDataUrl(url("image/jpeg", JPG)).ext, "jpg");
  assert.equal(parseDataUrl(url("image/webp", WEBP)).ext, "webp");
  assert.throws(() => parseDataUrl(url("image/gif", PNG)), /只支持 PNG、JPEG、WebP/);
  assert.throws(() => parseDataUrl(url("image/png", JPG)), /内容和类型不符/, "声明 png 实际是 jpeg 要拒绝");
  assert.throws(() => parseDataUrl(url("image/svg+xml", Buffer.from("<svg onload=alert(1)>"))), /只支持/);
  assert.throws(() => parseDataUrl("data:image/png;base64,@@@@"), /不是有效的图片/);
  assert.throws(() => parseDataUrl("http://evil.example/x.png"), /不是有效的图片/);
  assert.throws(() => parseDataUrl(123), /不是有效的图片/);
});

test("批量校验：最多 3 张、单张不超过 1.5 MB；不是数组或空数组都当没有图片", () => {
  assert.equal(MAX_IMAGES, 3);
  assert.equal(MAX_IMAGE_BYTES, 1.5 * 1024 * 1024);
  assert.deepEqual(validateImages(undefined), []);
  assert.deepEqual(validateImages([]), []);
  assert.equal(validateImages([url("image/png", PNG), url("image/jpeg", JPG)]).length, 2);
  assert.throws(() => validateImages([1, 2, 3, 4].map(() => url("image/png", PNG))), /最多 3 张/);
  const big = Buffer.concat([PNG, Buffer.alloc(MAX_IMAGE_BYTES)]);
  assert.throws(() => validateImages([url("image/png", big)]), /超过 1\.5 MB/);
  assert.throws(() => validateImages("not-an-array"), /格式不对/);
});

test("图片存储：落盘后只给 id，读回内容一致；id 带路径符号或类型不对读不到", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gxt-img-"));
  try {
    const store = createImageStore({ dir });
    const [first, second] = store.save(validateImages([url("image/png", PNG), url("image/jpeg", JPG)]));
    assert.match(first, /^[a-f0-9]{24}\.png$/);
    assert.match(second, /^[a-f0-9]{24}\.jpg$/);
    const read = store.read(first);
    assert.equal(read.mime, "image/png");
    assert.ok(read.buffer.equals(PNG));
    for (const bad of ["../x.png", "..%2fx.png", "a/b.png", "abc.png", `${"a".repeat(24)}.gif`, `${"a".repeat(24)}.png/`, "", null, undefined]) assert.equal(store.read(bad), null, "非法 id 要返回 null：" + bad);
    assert.equal(store.read(`${"0".repeat(24)}.png`), null, "不存在的文件返回 null");
    assert.equal(store.remove(first), true);
    assert.equal(store.read(first), null);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("多模态内容：文字在前，每张图一个 image_url；没有图片时原样返回字符串", () => {
  const parsed = validateImages([url("image/png", PNG)]);
  assert.equal(toContentParts("问题", []), "问题");
  const parts = toContentParts("问题", parsed);
  assert.equal(parts[0].type, "text");
  assert.equal(parts[0].text, "问题");
  assert.equal(parts[1].type, "image_url");
  assert.match(parts[1].image_url.url, /^data:image\/png;base64,/);
  assert.equal(parts.length, 2);
});
