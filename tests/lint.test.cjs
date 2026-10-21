/**
 * 前端静态检查：assets 下所有脚本不能引用未定义的变量（no-undef）。
 * 前端是无构建的多个 <script>，这类错误只有运行到那段代码才会报 ReferenceError；这里把它提前到测试阶段。
 * 拆分 / 修改前端文件后必须保持通过。
 */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const path = require("node:path");

test("assets 下的脚本没有未定义的变量引用", () => {
  try {
    execFileSync(process.execPath, [path.join(__dirname, "..", "node_modules", "eslint", "bin", "eslint.js"), "assets"], { cwd: path.join(__dirname, ".."), stdio: "pipe" });
  } catch (error) {
    assert.fail(`发现未定义的变量引用：\n${String(error.stdout || error.message).split("\n").slice(0, 20).join("\n")}`);
  }
});

test("assets/portal/manifest.json、index.html 的 script 标签、磁盘上的文件三者一致（顺序也一致）", () => {
  const fs = require("node:fs");
  const root = path.join(__dirname, "..");
  const manifest = JSON.parse(fs.readFileSync(path.join(root, "assets/portal/manifest.json"), "utf8"));
  const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
  const tags = [...html.matchAll(/<script src="assets\/portal\/([^"?]+)\?v=[^"]+"><\/script>/g)].map(match => match[1]);
  assert.deepEqual(tags, manifest, "index.html 里 assets/portal 的 script 标签必须与 manifest.json 完全一致（含顺序）");
  const onDisk = fs.readdirSync(path.join(root, "assets/portal")).filter(file => file.endsWith(".js")).sort();
  assert.deepEqual([...manifest].sort(), onDisk, "manifest.json 必须覆盖 assets/portal 下的全部脚本，不能多也不能少");
  assert.equal(manifest[0], "core.js", "core.js 必须最先加载");
  assert.equal(manifest.at(-1), "boot.js", "boot.js 必须最后加载");
  const versions = new Set([...html.matchAll(/assets\/portal\/[^"?]+\?v=([^"]+)"/g)].map(match => match[1]));
  assert.equal(versions.size, 1, `assets/portal 下的脚本必须使用同一个版本号，当前有：${[...versions].join("、")}`);
});
