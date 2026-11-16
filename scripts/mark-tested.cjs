/**
 * 全套测试通过后记下「当前代码指纹」（HEAD 的 tree 哈希）到 .test-stamp，供发版脚本判断「这份代码刚测过，不用再跑一遍」。
 * 工作区有未提交的改动时不记：那时测的不是 HEAD。.test-stamp 已在 .gitignore 中。
 */
const { execSync } = require("node:child_process");
const { writeFileSync } = require("node:fs");
const path = require("node:path");
const root = path.join(__dirname, "..");
const run = cmd => execSync(cmd, { cwd: root, encoding: "utf8" }).trim();
if (run("git status --porcelain --untracked-files=no")) {
  console.log("[mark-tested] 工作区有未提交改动，不记录测试指纹");
} else {
  writeFileSync(path.join(root, ".test-stamp"), run("git rev-parse HEAD^{tree}") + "\n");
  console.log("[mark-tested] 已记录测试指纹，发版时将跳过重复测试");
}
