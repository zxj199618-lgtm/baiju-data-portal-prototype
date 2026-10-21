/**
 * 镜像完整性：网关（及其依赖的模块）里所有本地 require 的文件，都必须被 Dockerfile 复制进镜像，
 * 否则本机测试通过、容器一启动就 MODULE_NOT_FOUND。
 */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");
const dockerfile = fs.readFileSync(path.join(ROOT, "Dockerfile"), "utf8");

/** 从网关出发，递归收集所有本地 require 的脚本 */
function collectLocalModules(entry, seen = new Set()) {
  if (seen.has(entry)) return seen;
  seen.add(entry);
  const source = fs.readFileSync(path.join(ROOT, "scripts", entry), "utf8");
  for (const match of source.matchAll(/require\("\.\/([A-Za-z0-9_-]+\.cjs)"\)/g)) collectLocalModules(match[1], seen);
  return seen;
}

test("网关依赖的每个本地模块都被复制进镜像", () => {
  const modules = [...collectLocalModules("analysis-gateway.cjs")];
  assert.ok(modules.length >= 9, "应至少包含网关与它的 8 个模块");
  const missing = modules.filter(file => !dockerfile.includes(`COPY scripts/${file} ./${file}`));
  assert.deepEqual(missing, [], `Dockerfile 缺少这些文件的 COPY：${missing.join("、")}`);
});

test("语义层的指标目录被复制进镜像（网关在同级 semantic/ 目录查找）", () => {
  assert.match(dockerfile, /COPY semantic \.\/semantic/);
  assert.ok(fs.existsSync(path.join(ROOT, "semantic", "metrics.json")));
});

test("镜像里不包含测试、密钥与数据目录（.dockerignore）", () => {
  const ignore = fs.readFileSync(path.join(ROOT, ".dockerignore"), "utf8");
  ["tests/", "data/", ".env", "node_modules/"].forEach(entry => assert.ok(ignore.includes(entry), `.dockerignore 缺少 ${entry}`));
});
