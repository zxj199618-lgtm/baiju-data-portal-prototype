/**
 * Skill 配置保存校验：把「界面上的规则」落到服务端，避免绕过界面直接调接口写入脏数据。
 *  - 字段类型与长度（提示词、标题、描述、排序、启停……）；
 *  - 提示词版本：版本号不重复、至多一个线上版本、线上版本必须在列表里；
 *    线上版本与最近 KEEP_VERSIONS 个版本（按已存列表顺序，新版本在前）受保护，不能被删掉（方便回滚）；
 *  - 兜底 Skill 必须存在且不能是自己；灰度用户必须是已有账号。
 * 返回 { ok:true, patch } 或 { ok:false, error }；patch 里只有这次要写的字段，调用方原样合并进 Skill 记录。
 */
const KEEP_VERSIONS = 3;
const MAX_VERSIONS = 100;
const STATUSES = ["未发布", "灰度中", "已发布"];

const str = (value, max) => String(value ?? "").slice(0, max);

function validateSkillConfig(entry, body, { skillIds = [], accountNames = [] } = {}) {
  const patch = {};
  const fail = error => ({ ok: false, error });
  const limits = { icon: 400000, title: 60, desc: 2000, displayDesc: 2000, prompt: 100000, scenarioKey: 60, fallbackSkillId: 60 };
  for (const [key, max] of Object.entries(limits)) {
    if (body[key] === undefined) continue;
    if (typeof body[key] !== "string") return fail(`「${key}」需要是文本`);
    if (body[key].length > max) return fail(`「${key}」不能超过 ${max} 字`);
    patch[key] = body[key];
  }
  if (patch.title !== undefined && !patch.title.trim()) return fail("Skill 名称不能为空");
  if (body.enabled !== undefined) {
    if (typeof body.enabled !== "boolean") return fail("「enabled」需要是布尔值");
    patch.enabled = body.enabled;
  }
  if (body.sort !== undefined) {
    const sort = Number(body.sort);
    if (!Number.isFinite(sort) || sort < 0 || sort > 99999) return fail("排序需要是 0 到 99999 的数字");
    patch.sort = Math.floor(sort);
  }
  for (const key of ["clarification", "assetScope", "responseContract"]) {
    if (body[key] === undefined) continue;
    if (body[key] !== null && (typeof body[key] !== "object" || Array.isArray(body[key]))) return fail(`「${key}」需要是对象`);
    if (JSON.stringify(body[key] ?? null).length > 60000) return fail(`「${key}」内容过大`);
    patch[key] = body[key];
  }
  if (patch.fallbackSkillId) {
    if (patch.fallbackSkillId === entry.id) return fail("兜底 Skill 不能是自己");
    if (!skillIds.includes(patch.fallbackSkillId)) return fail(`兜底 Skill 不存在：${patch.fallbackSkillId}`);
  }
  if (body.grayUsers !== undefined) {
    if (!Array.isArray(body.grayUsers)) return fail("灰度用户需要是数组");
    const users = [...new Set(body.grayUsers.map(item => str(item, 40).trim()).filter(Boolean))].slice(0, 50);
    const unknown = users.filter(name => !accountNames.includes(name));
    if (unknown.length) return fail(`灰度用户不是已有账号：${unknown.join("、")}`);
    patch.grayUsers = users;
  }

  if (body.versions !== undefined) {
    if (!Array.isArray(body.versions)) return fail("提示词版本需要是数组");
    if (body.versions.length > MAX_VERSIONS) return fail(`提示词版本最多 ${MAX_VERSIONS} 个`);
    const versions = [];
    const seen = new Set();
    for (const item of body.versions) {
      const version = str(item?.version, 30).trim();
      if (!version) continue;
      if (seen.has(version)) return fail(`提示词版本号重复：${version}`);
      seen.add(version);
      const grayUsers = Array.isArray(item?.grayUsers) ? item.grayUsers.slice(0, 50).map(user => str(user, 40)) : [];
      let snapshot;
      if (item?.snapshot && typeof item.snapshot === "object") {
        const raw = JSON.stringify(item.snapshot);
        if (raw.length > 200000) return fail(`版本 ${version} 的内容过大`);
        snapshot = JSON.parse(raw);
      }
      versions.push({
        version, time: str(item?.time, 40), operator: str(item?.operator, 40), note: str(item?.note, 300),
        current: item?.current === true, status: STATUSES.includes(item?.status) ? item.status : "已发布", grayUsers, snapshot
      });
    }
    if (versions.filter(item => item.current).length > 1) return fail("只能有一个线上版本");
    if (body.currentVersion !== undefined) {
      const current = str(body.currentVersion, 30);
      if (current && !seen.has(current)) return fail(`线上版本不在版本列表里：${current}`);
      if (current) versions.forEach(item => { item.current = item.version === current; });
      patch.version = current || undefined;
    }
    // 受保护版本不能被删：已存列表里的线上版本 + 最近 KEEP_VERSIONS 个
    const stored = Array.isArray(entry.versions) ? entry.versions : [];
    const protectedNames = new Set(stored.filter((item, index) => item.current || index < KEEP_VERSIONS).map(item => item.version));
    const lost = [...protectedNames].filter(name => !seen.has(name));
    if (lost.length) return fail(`线上版本与最近 ${KEEP_VERSIONS} 个版本不能删除：${lost.join("、")}`);
    patch.versions = versions;
  }
  return { ok: true, patch };
}

module.exports = { validateSkillConfig, KEEP_VERSIONS };
