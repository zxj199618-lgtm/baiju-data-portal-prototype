/**
 * 短剧投放账户上报批次：只追加、不修改、不撤回，保存在 DATA_DIR/report-batches.json。
 *
 * 规则集中在这里：
 *  - 提交：门户管理员，或所在权限组 menuEdits 含「短剧投放账户上报」；上报人、时间、批次号都由服务端定，不信任客户端；
 *  - 查看：管理员，或权限组菜单里有「短剧投放账户上报」/「消耗对比」（消耗对比要按批次带入账户）；
 *  - 校验：账户 ID 必须是 6 位以上纯数字，同一批次里重复的按一条处理，媒体只认「巨量 / 广点通」（空记「未知」），一批最多 5000 个账户；
 *  - 批次号：DR + 日期 + 当天第几批（三位）。
 */
const fs = require("node:fs");
const path = require("node:path");

const SUBMIT_MENU = "短剧投放账户上报";
const READ_MENUS = [SUBMIT_MENU, "消耗对比"];
const MEDIAS = ["巨量", "广点通"];
const MAX_ACCOUNTS = 5000;
const pad = value => String(value).padStart(2, "0");

function createReportBatchStore({ dataDir, orgStore, now = () => new Date() }) {
  const file = path.join(dataDir, "report-batches.json");
  const load = () => { try { const data = JSON.parse(fs.readFileSync(file, "utf8")); return Array.isArray(data.batches) ? data.batches : []; } catch { return []; } };
  const persist = batches => {
    fs.mkdirSync(dataDir, { recursive: true });
    const tmp = `${file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify({ batches, updatedAt: new Date().toISOString() }, null, 2));
    fs.renameSync(tmp, file);
  };
  const groupOf = user => { const { groups, userGroups } = orgStore.effective(); return groups.find(group => group.name === userGroups[user]) || null; };
  const canSubmit = user => orgStore.isAdmin(user) || Boolean(groupOf(user)?.menuEdits?.includes(SUBMIT_MENU));
  const canRead = user => orgStore.isAdmin(user) || READ_MENUS.some(menu => groupOf(user)?.menus?.includes(menu) || groupOf(user)?.menuEdits?.includes(menu));

  /** 最近的批次在前；没有读取权限返回 null */
  function list(user, limit = 200) {
    if (!canRead(user)) return null;
    return { canSubmit: canSubmit(user), batches: load().slice().reverse().slice(0, Math.max(1, Math.min(500, Number(limit) || 200))) };
  }

  /** input: { accounts: [{ accountId, media }], warnings?: number } → { ok, batch } | { ok:false, status, error } */
  function submit(user, input) {
    if (!canSubmit(user)) return { ok: false, status: 403, error: `需要「${SUBMIT_MENU}」编辑权限` };
    if (!Array.isArray(input?.accounts) || !input.accounts.length) return { ok: false, status: 400, error: "没有可上报的账户" };
    if (input.accounts.length > MAX_ACCOUNTS) return { ok: false, status: 400, error: `一批最多 ${MAX_ACCOUNTS} 个账户` };
    const seen = new Map();
    let duplicates = 0;
    for (const [index, raw] of input.accounts.entries()) {
      const accountId = String(raw?.accountId ?? "").trim();
      if (!/^\d{6,}$/.test(accountId)) return { ok: false, status: 400, error: `第 ${index + 1} 个账户 ID 必须是 6 位以上纯数字` };
      const media = String(raw?.media ?? "").trim();
      if (media && !MEDIAS.includes(media)) return { ok: false, status: 400, error: `账户 ${accountId} 的媒体「${media}」不在支持的取值里（${MEDIAS.join(" / ")}）` };
      if (seen.has(accountId)) { duplicates += 1; continue; }
      seen.set(accountId, media || "未知");
    }
    const accountIds = [...seen.keys()];
    const medias = [...new Set(seen.values())];
    const warnings = Math.max(0, Math.min(accountIds.length + duplicates, Math.floor(Number(input.warnings) || 0))) + duplicates;
    const stamp = now();
    const date = `${stamp.getFullYear()}${pad(stamp.getMonth() + 1)}${pad(stamp.getDate())}`;
    const batches = load();
    const id = `DR${date}${String(batches.filter(batch => batch.id.startsWith(`DR${date}`)).length + 1).padStart(3, "0")}`;
    const batch = {
      id, submittedAt: `${stamp.getFullYear()}-${pad(stamp.getMonth() + 1)}-${pad(stamp.getDate())} ${pad(stamp.getHours())}:${pad(stamp.getMinutes())}`,
      submitter: user, media: medias.join(" / "), accounts: accountIds.length, checked: `通过（${warnings} 条警告）`,
      note: `本期上报 ${accountIds.length} 个短剧投放账户，消耗数据由系统自动拉取`, accountIds
    };
    persist([...batches, batch]);
    return { ok: true, batch };
  }

  return { list, submit, canRead, canSubmit };
}

module.exports = { createReportBatchStore, SUBMIT_MENU };
