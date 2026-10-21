/**
 * 回答反馈（赞 / 踩）：每个账号对每次分析至多一条，重复提交覆盖。
 * 存储：DATA_DIR/feedback.json，{ [requestId]: { ... } }。管理员可按评价筛选，并按模型 / Skill 汇总。
 */
const fs = require("fs");
const path = require("path");

const RATINGS = ["up", "down"];

function createFeedbackStore({ dataDir }) {
  const file = path.join(dataDir, "feedback.json");

  const load = () => { try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return {}; } };
  const save = data => {
    fs.mkdirSync(dataDir, { recursive: true });
    const tmp = `${file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
    fs.renameSync(tmp, file);
  };

  /** entry: { requestId, user, rating, comment?, model?, skill?, scenario?, toolMode?, question? } */
  function set(entry) {
    if (!RATINGS.includes(entry.rating)) throw new Error("评价只能是 up 或 down");
    const data = load();
    data[entry.requestId] = {
      requestId: entry.requestId,
      user: entry.user,
      rating: entry.rating,
      comment: String(entry.comment || "").trim().slice(0, 500),
      model: entry.model || "",
      skill: entry.skill || "",
      scenario: entry.scenario || "",
      toolMode: entry.toolMode || "",
      question: String(entry.question || "").slice(0, 200),
      at: new Date().toISOString()
    };
    save(data);
    return data[entry.requestId];
  }

  function list({ rating = "", limit = 50 } = {}) {
    return Object.values(load())
      .filter(item => !rating || item.rating === rating)
      .sort((a, b) => String(b.at).localeCompare(String(a.at)))
      .slice(0, Math.min(200, Math.max(1, Number(limit) || 50)));
  }

  /** 按模型与 Skill 汇总好评 / 差评数，便于发现某个模型或 Skill 的口碑问题 */
  function summary() {
    const all = Object.values(load());
    const bucket = key => all.reduce((result, item) => {
      const name = item[key] || "（未知）";
      const entry = (result[name] = result[name] || { up: 0, down: 0 });
      entry[item.rating] += 1;
      return result;
    }, {});
    return { total: all.length, up: all.filter(item => item.rating === "up").length, down: all.filter(item => item.rating === "down").length, byModel: bucket("model"), bySkill: bucket("skill") };
  }

  return { set, list, summary };
}

module.exports = { createFeedbackStore, RATINGS };
