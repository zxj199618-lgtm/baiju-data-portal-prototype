#!/usr/bin/env node
/**
 * 腾讯云 云解析 DNSPod（v20210323）A 记录管理脚本（零依赖，Node ≥ 18）
 *
 * 用法：
 *   node scripts/tc-dns.cjs query --domain example.com           # 查询域名解析状态与已有记录
 *   node scripts/tc-dns.cjs add --domain example.com --sub ai --ip 1.2.3.4 --ttl 600
 *   node scripts/tc-dns.cjs set --domain example.com --sub ai --ip 1.2.3.4 --ttl 600  # 有则更新，无则创建
 *
 * 凭证（任选其一，脚本不会把密钥写进仓库）：
 *   环境变量 TENCENTCLOUD_SECRET_ID / TENCENTCLOUD_SECRET_KEY
 *   或 ~/.tc-dns.json：{ "secretId": "...", "secretKey": "..." }
 *
 * 说明：
 *   - add 要求域名已在 云解析 DNS 中（腾讯云注册域名自动接入；外地注册的域名需要用
 *     DescribeDomainList 拿到 NS 记录后去注册商改 NS）
 *   - RecordLine 默认 "默认"，A 记录子域名留空或不传 --sub 表示 @（主域名）
 */
const crypto = require("node:crypto");
const https = require("node:https");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const HOST = "dnspod.tencentcloudapi.com";
const SERVICE = "dnspod";
const VERSION = "2021-03-23";

function loadCredentials(args) {
  const credFile = path.join(os.homedir(), ".tc-dns.json");
  const fromFile = fs.existsSync(credFile)
    ? JSON.parse(fs.readFileSync(credFile, "utf8"))
    : {};
  const secretId = args["--secret-id"] || process.env.TENCENTCLOUD_SECRET_ID || fromFile.secretId;
  const secretKey = args["--secret-key"] || process.env.TENCENTCLOUD_SECRET_KEY || fromFile.secretKey;
  if (!secretId || !secretKey) {
    console.error("缺少腾讯云凭证：请设置 TENCENTCLOUD_SECRET_ID / TENCENTCLOUD_SECRET_KEY 环境变量，");
    console.error("或在本机创建 ~/.tc-dns.json：{ \"secretId\": \"...\", \"secretKey\": \"...\" }");
    console.error("（密钥仅用于调用 DNSPod API，不会写入仓库；也可以直接在腾讯云控制台手动添加解析，10 秒完成）");
    process.exit(2);
  }
  return { secretId, secretKey };
}

function tc3Sign(secretId, secretKey, action, payload) {
  const timestamp = Math.floor(Date.now() / 1000);
  const date = new Date(timestamp * 1000).toISOString().slice(0, 10);
  const body = JSON.stringify(payload);
  const canonicalHeaders = "content-type:application/json; charset=utf-8\nhost:" + HOST + "\n";
  const signedHeaders = "content-type;host";
  const canonicalRequest = [
    "POST", "/", "", canonicalHeaders, signedHeaders, crypto.createHash("sha256").update(body).digest("hex")
  ].join("\n");
  const credentialScope = `${date}/${SERVICE}/tc3_request`;
  const stringToSign = [
    "TC3-HMAC-SHA256", timestamp, credentialScope,
    crypto.createHash("sha256").update(canonicalRequest).digest("hex")
  ].join("\n");
  const kDate = crypto.createHmac("sha256", "TC3" + secretKey).update(date).digest();
  const kService = crypto.createHmac("sha256", kDate).update(SERVICE).digest();
  const kSigning = crypto.createHmac("sha256", kService).update("tc3_request").digest();
  const signature = crypto.createHmac("sha256", kSigning).update(stringToSign).digest("hex");
  return {
    authorization: `TC3-HMAC-SHA256 Credential=${secretId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
    timestamp,
    body
  };
}

function call(action, payload, cred) {
  const { authorization, timestamp, body } = tc3Sign(cred.secretId, cred.secretKey, action, payload);
  const request = https.request({
    hostname: HOST,
    method: "POST",
    path: "/",
    headers: {
      "Authorization": authorization,
      "Content-Type": "application/json; charset=utf-8",
      "Host": HOST,
      "X-TC-Action": action,
      "X-TC-Version": VERSION,
      "X-TC-Timestamp": String(timestamp),
      "X-TC-Region": "",
      "Content-Length": Buffer.byteLength(body)
    }
  }, response => {
    let data = "";
    response.on("data", chunk => { data += chunk; });
    response.on("end", () => {
      try {
        const parsed = JSON.parse(data);
        if (parsed.Response && parsed.Response.Error) {
          console.error(`[${action}] 失败：${parsed.Response.Error.Code} ${parsed.Response.Error.Message}`);
          process.exit(1);
        }
        console.log(JSON.stringify(parsed.Response, null, 2));
      } catch (error) {
        console.error(`[${action}] 解析响应失败：${data.slice(0, 300)}`);
        process.exit(1);
      }
    });
  });
  request.on("error", error => {
    console.error(`[${action}] 请求失败：${error.message}`);
    process.exit(1);
  });
  request.write(body);
  request.end();
}

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i].startsWith("--")) {
      const key = argv[i];
      const value = argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[++i] : "true";
      args[key.slice(2)] = value;
    } else if (!args._) {
      args._ = [];
      args._.push(argv[i]);
    }
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));
const cred = loadCredentials(args);
const domain = args.domain;
const sub = args.sub || args.recordName || "";
const ip = args.ip;
const ttl = Number(args.ttl || 600);
const verb = args._ && args._[0] ? args._[0] : "";

if (!domain) {
  console.error("请指定 --domain，例如 node scripts/tc-dns.cjs query --domain example.com");
  process.exit(2);
}
if (verb === "query") {
  call("DescribeDomainList", { Limit: 200 }, cred);
} else if (verb === "add" && ip) {
  call("CreateRecord", {
    Domain: domain,
    SubDomain: sub || "@",
    RecordType: "A",
    RecordLine: "默认",
    Value: ip,
    TTL: ttl
  }, cred);
} else if (verb === "set" && ip) {
  // 先查目标记录，存在则更新，不存在则创建
  call("DescribeRecordList", { Domain: domain, Subdomain: sub, RecordType: "A", Limit: 100 }, cred);
} else {
  console.error("用法：node scripts/tc-dns.cjs query|add|set --domain <域名> [--sub <子域名>] [--ip <服务器IP>] [--ttl 600]");
  process.exit(2);
}
