/**
 * 跑测试：默认只跑单元 + 冒烟（不含浏览器端到端 e2e-ui），通过后记录代码指纹。
 * 浏览器端到端（约 4 分钟）一般大版本才需要：npm run test:e2e，或发版时 DEPLOY_E2E=1 npm run deploy。
 */
const { readdirSync } = require("node:fs");
const { spawnSync } = require("node:child_process");
const path = require("node:path");
const dir = path.join(__dirname, "..", "tests");
const files = readdirSync(dir).filter(name => name.endsWith(".test.cjs") && name !== "e2e-ui.test.cjs").map(name => path.join("tests", name));
const result = spawnSync(process.execPath, ["--test", ...files], { stdio: "inherit", cwd: path.join(__dirname, "..") });
if (result.status !== 0) process.exit(result.status || 1);
require("./mark-tested.cjs");
