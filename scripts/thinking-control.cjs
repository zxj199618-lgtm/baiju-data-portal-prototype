/**
 * 轻量思考：报告这类「把已有事实排版成文」的任务不需要深度推理，推理 token 往往占一半以上的耗时。
 *
 * 按模型家族给出「关掉 / 压低思考」的请求参数；声明了 low 档的模型用 reasoning_effort=low。
 * 不认识的模型返回空对象（不改变行为）。调用方在上游拒绝这些参数时会自动去掉重试，所以参数写得不对也只是白试一次。
 */

function lightweightThinking(modelId, reasoning) {
  if (reasoning && Array.isArray(reasoning.levels) && reasoning.levels.includes("low")) return { reasoning_effort: "low" };
  const id = String(modelId || "").toLowerCase();
  if (/^qwen/.test(id)) return { enable_thinking: false };
  if (/^(zhipu\/)?glm/.test(id) || /^kimi-k/.test(id) || /^deepseek-(v3\.[12]|v4)/.test(id) || /^doubao-seed/.test(id)) return { thinking: { type: "disabled" } };
  return {};
}

module.exports = { lightweightThinking };
