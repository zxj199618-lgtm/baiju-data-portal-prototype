/**
 * 回答反馈（赞 / 踩）：每个账号对每次分析至多一条，重复提交覆盖。
 * 存储：DATA_DIR/feedback.json，{ [requestId]: { ... } }。管理员可按评价筛选，并按模型 / Skill 汇总。
 */
const fs = require("fs");
const path = require("path");

const RATINGS = ["up", "down"];
const IMAGE_ID = /^[a-f0-9]{24}\.(png|jpg|webp)$/;

/**
 * 负反馈带上的上下文（前端自动收集）：只保留白名单字段，字符串和数组都按上限截断，
 * 对话只留最近 6 条。不是对象时返回 {}。不把前端传来的任意字段原样存下来。
 */
function sanitizeContext(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const text = (value, max) => (typeof value === "string" ? value.trim().slice(0, max) : "");
  const out = {
    question: text(raw.question, 300), businessLine: text(raw.businessLine, 40), model: text(raw.model, 80), reasoning: text(raw.reasoning, 20),
    skill: text(raw.skill, 80), sessionId: text(raw.sessionId, 60), page: text(raw.page, 200), userAgent: text(raw.userAgent, 200),
    appVersion: text(raw.appVersion, 40), viewport: text(raw.viewport, 20),
    tables: (Array.isArray(raw.tables) ? raw.tables : []).filter(name => typeof name === "string" && name.trim()).slice(0, 20).map(name => name.trim().slice(0, 60)),
    conversation: (Array.isArray(raw.conversation) ? raw.conversation : [])
      .filter(item => item && typeof item === "object" && ["user", "assistant"].includes(item.role) && typeof item.text === "string")
      .slice(-6).map(item => ({ role: item.role, text: item.text.trim().slice(0, 300) }))
  };
  const elapsed = Number(raw.elapsedSeconds);
  if (typeof raw.elapsedSeconds === "number" && Number.isFinite(elapsed) && elapsed >= 0) out.elapsedSeconds = Math.round(elapsed * 10) / 10;
  return out;
}

function createFeedbackStore({ dataDir }) {
  const file = path.join(dataDir, "feedback.json");

  const load = () => { try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return {}; } };
  const save = data => {
    fs.mkdirSync(dataDir, { recursive: true });
    const tmp = `${file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
    fs.renameSync(tmp, file);
  };

  /**
   * entry: { requestId, user, rating, comment?, model?, skill?, scenario?, toolMode?, question?, images?, context? }
   * 只有「踩」保留截图 id 和上下文；返回 { saved, removedImages }，removedImages 是被覆盖掉的旧截图，调用方负责删文件。
   */
  function set(entry) {
    if (!RATINGS.includes(entry.rating)) throw new Error("评价只能是 up 或 down");
    const data = load();
    const previous = data[entry.requestId];
    const down = entry.rating === "down";
    const images = down ? (Array.isArray(entry.images) ? entry.images : []).filter(id => typeof id === "string" && IMAGE_ID.test(id)).slice(0, 3) : [];
    const removedImages = ((previous && previous.images) || []).filter(id => !images.includes(id));
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
      answer: String(entry.answer || "").trim().slice(0, 4000),
      images,
      context: down ? sanitizeContext(entry.context) : {},
      at: new Date().toISOString()
    };
    save(data);
    return { saved: data[entry.requestId], removedImages };
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

module.exports = { createFeedbackStore, sanitizeContext, RATINGS };
