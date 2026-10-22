/**
 * 证据账本：保存每次分析取到的事实（工具结果、口径、问题和回答摘要），供「报告 Skill」按需使用。
 *
 * 为什么要有它：报告应该基于对话里已经查到、已经核对过的数字来写，而不是让模型重新取一遍数
 * （重新取数可能和对话里说过的不一致，也更贵）。
 *
 * 安全与容量：
 * - 只有产生它的账号（scope）能读取；演示模式下 scope 是「账号~访客」，不同访客互相看不到；
 * - 不保存 read_reference（参考资料不是事实）与 ask_user；单条超过上限时只保留前面的几次取数；
 * - 超过保留天数或总数量上限的旧记录自动清理。
 */

const fs = require("fs");
const path = require("path");

const ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const SKIP_TOOLS = new Set(["read_reference", "ask_user"]);
const MAX_ENTRY_BYTES = 80 * 1024;
const MAX_ANSWER_CHARS = 1500;

function createEvidenceLedger({ dir, ttlDays = 14, maxFiles = 2000 }) {
  let saves = 0;

  const fileOf = requestId => path.join(dir, `${requestId}.json`);

  /** 删除过期记录；超过总数上限时再删最旧的 */
  function prune() {
    let names;
    try { names = fs.readdirSync(dir).filter(name => name.endsWith(".json")); } catch { return; }
    const cutoff = Date.now() - ttlDays * 86400000;
    const stats = [];
    for (const name of names) {
      const file = path.join(dir, name);
      try {
        const mtime = fs.statSync(file).mtimeMs;
        if (mtime < cutoff) fs.unlinkSync(file);
        else stats.push({ file, mtime });
      } catch { /* 并发删除时忽略 */ }
    }
    if (stats.length > maxFiles) {
      stats.sort((a, b) => a.mtime - b.mtime).slice(0, stats.length - maxFiles).forEach(item => { try { fs.unlinkSync(item.file); } catch { /* 忽略 */ } });
    }
  }

  /** 只保留事实类工具的结果；超出大小上限时丢弃后面的 */
  function trimEvidence(evidence) {
    const kept = [];
    let size = 0;
    for (const item of Array.isArray(evidence) ? evidence : []) {
      if (item && SKIP_TOOLS.has(item.工具)) continue;
      const bytes = Buffer.byteLength(JSON.stringify(item ?? null));
      if (size + bytes > MAX_ENTRY_BYTES) break;
      kept.push(item);
      size += bytes;
    }
    return kept;
  }

  function save({ requestId, scope, user, question, model, skill, pack, resolvedTerms, evidence, answer, output = "answer", template = "" }) {
    if (!ID_PATTERN.test(String(requestId || ""))) return false;
    const kept = trimEvidence(evidence);
    if (!kept.length) return false; // 没有取到事实的回答（拦截、追问、闲聊）不留账本
    try {
      fs.mkdirSync(dir, { recursive: true });
      const entry = {
        requestId, scope, user, at: new Date().toISOString(), question: String(question || "").slice(0, 400), model: model || "", skill: skill || "", pack: pack || "",
        resolvedTerms: Array.isArray(resolvedTerms) ? resolvedTerms.slice(0, 6) : [], output, template,
        answer: String(answer || "").replace(/```[\s\S]*?```/g, " ").slice(0, MAX_ANSWER_CHARS), evidence: kept
      };
      const tmp = `${fileOf(requestId)}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(entry));
      fs.renameSync(tmp, fileOf(requestId));
      saves += 1;
      if (saves % 50 === 1) prune();
      return true;
    } catch (error) {
      console.warn("[ledger] 写入失败：", error.message);
      return false;
    }
  }

  /** 读取一条；不是自己的（scope 不同）或不存在都返回 null，不区分原因 */
  function load(requestId, scope) {
    if (!ID_PATTERN.test(String(requestId || ""))) return null;
    try {
      const entry = JSON.parse(fs.readFileSync(fileOf(requestId), "utf8"));
      return entry.scope === scope ? entry : null;
    } catch { return null; }
  }

  /** 按给定顺序读取多条（去重，最多 limit 条），跳过读不到的 */
  function loadMany(requestIds, scope, limit = 4) {
    const seen = new Set();
    const entries = [];
    for (const id of Array.isArray(requestIds) ? requestIds : []) {
      if (seen.has(id)) continue;
      seen.add(id);
      const entry = load(id, scope);
      if (entry) entries.push(entry);
      if (entries.length >= limit) break;
    }
    return entries;
  }

  return { save, load, loadMany, prune };
}

module.exports = { createEvidenceLedger, ID_PATTERN };
