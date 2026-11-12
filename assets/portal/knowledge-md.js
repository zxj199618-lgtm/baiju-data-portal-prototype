/**
 * 知识库 Markdown 工具：轻量渲染、文本规范化、表 / 业务线知识库模板。
 * 纯函数、不依赖 DOM，页面里通过 window.PortalKnowledgeMd 使用，单元测试直接 require。
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.PortalKnowledgeMd = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const knowledgeNow = () => new Date().toLocaleString("zh-CN", { hour12: false, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).replace(/\//g, "-");
  /* 轻量 Markdown 渲染（预览与保存后的内容一致）：标题、加粗、斜体、行内代码、链接（仅 http/https）、引用、分隔线、代码块、有序/无序列表、段落。
     先转义再套标签，不执行 HTML */
  const escapeHtml = text => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const renderInlineMd = text => {
    const codes = [];
    let html = escapeHtml(text).replace(/`([^`]+)`/g, (_, code) => { codes.push(`<code>${code}</code>`); return `\u0000${codes.length - 1}\u0000`; });
    html = html
      .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, (_, label, url) => `<a href="${url}" target="_blank" rel="noopener">${label}</a>`)
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/(^|[^*])\*([^*\s][^*]*)\*(?!\*)/g, "$1<em>$2</em>");
    return html.replace(/\u0000(\d+)\u0000/g, (_, index) => codes[Number(index)]);
  };
  const renderKnowledgeMarkdown = markdown => {
    const html = [];
    let list = null;
    let quote = [];
    let fence = null;
    const closeList = () => { if (list) { html.push(`</${list}>`); list = null; } };
    const openList = type => { if (list !== type) { closeList(); html.push(`<${type}>`); list = type; } };
    const flushQuote = () => { if (quote.length) { html.push(`<blockquote>${quote.map(renderInlineMd).join("<br>")}</blockquote>`); quote = []; } };
    String(markdown || "").replace(/\r\n?/g, "\n").split("\n").forEach(line => {
      if (fence !== null) {
        if (/^\s*```/.test(line)) { html.push(`<pre><code>${escapeHtml(fence.join("\n"))}</code></pre>`); fence = null; }
        else fence.push(line);
        return;
      }
      if (/^\s*```/.test(line)) { closeList(); flushQuote(); fence = []; return; }
      const t = line.trim();
      const quoteLine = t.match(/^>\s?(.*)$/);
      if (quoteLine) { closeList(); quote.push(quoteLine[1]); return; }
      flushQuote();
      const heading = t.match(/^(#{1,6})\s+(.*)$/);
      const bullet = line.match(/^\s*[-*+]\s+(.*)$/);
      const ordered = line.match(/^\s*\d+\.\s+(.*)$/);
      if (heading) { closeList(); const level = Math.min(heading[1].length + 1, 5); html.push(`<h${level}>${renderInlineMd(heading[2])}</h${level}>`); }
      else if (/^(-{3,}|\*{3,}|_{3,})$/.test(t)) { closeList(); html.push("<hr>"); }
      else if (bullet) { openList("ul"); html.push(`<li>${renderInlineMd(bullet[1])}</li>`); }
      else if (ordered) { openList("ol"); html.push(`<li>${renderInlineMd(ordered[1])}</li>`); }
      else if (!t) { /* 空行不结束列表，避免有序列表编号从 1 重新开始 */ }
      else { closeList(); html.push(`<p>${renderInlineMd(t)}</p>`); }
    });
    if (fence !== null) html.push(`<pre><code>${escapeHtml(fence.join("\n"))}</code></pre>`);
    closeList();
    flushQuote();
    return html.join("");
  };

  /* 把随手填写的文本规范成 Markdown：项目符号统一为 "- "，编号统一为 "1. "，
     【标题】/ 一、标题 / 单独一行的「标题：」或短标题（其后紧跟列表）转为二级标题，「键：值」转为列表项，标题前补空行；代码块内容保持原样 */
  const normalizeToMarkdown = raw => {
    const lines = String(raw || "").replace(/\r\n?/g, "\n").split("\n").map(line => line.trim() === "" ? "" : line);
    const trimmed = lines.map(line => line.trim());
    const isListLike = t => !/^https?:/i.test(t) && /^(?:[•·●○▪■◆]\s*|[*+-]\s+|\d+[.、)）]\s*|[^：:\s]{1,20}[：:]\s*\S)/.test(t);
    const nextContent = index => { for (let i = index + 1; i < trimmed.length; i++) if (trimmed[i]) return trimmed[i]; return ""; };
    const out = [];
    let fenced = false;
    lines.forEach((original, index) => {
      if (/^\s*```/.test(original)) { fenced = !fenced; out.push(original.trimEnd()); return; }
      if (fenced) { out.push(original); return; }
      const t = trimmed[index];
      let m;
      if (!t) { out.push(""); return; }
      if (/^#{1,6}\s/.test(t) || /^>/.test(t) || /^(-{3,}|\*{3,}|_{3,})$/.test(t)) { out.push(t); return; }
      if ((m = t.match(/^(?:[•·●○▪■◆]\s*|[*+-]\s+)(.*)$/))) { out.push(`- ${m[1]}`); return; }
      if ((m = t.match(/^(\d+)(?:\.\s+|[、)）]\s*)(.*)$/))) { out.push(`${m[1]}. ${m[2]}`); return; }
      if ((m = t.match(/^[一二三四五六七八九十]+[、.）)]\s*(.+)$/))) { out.push(`## ${m[1]}`); return; }
      if ((m = t.match(/^【(.+?)】\s*(.*)$/))) { out.push(`## ${m[1]}`); if (m[2]) out.push(m[2]); return; }
      if (/^[^：:]{1,12}[：:]$/.test(t) && !/^https?:/i.test(t)) { out.push(`## ${t.slice(0, -1)}`); return; }
      if (/^[^：:。，,.；;！!？?*_`>\[]{1,15}$/.test(t) && isListLike(nextContent(index)) && !isListLike(t)) { out.push(`## ${t}`); return; }
      if (/^[^：:\s]{1,20}[：:]\s*\S/.test(t) && !/^https?:/i.test(t)) { out.push(`- ${t}`); return; }
      out.push(t);
    });
    const result = [];
    let inFence = false;
    out.forEach(line => {
      if (/^\s*```/.test(line)) { inFence = !inFence; result.push(line); return; }
      if (!inFence && /^#{1,6}\s/.test(line) && result.length && result[result.length - 1] !== "") result.push("");
      result.push(line);
    });
    return result.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  };
  const knowledgeTemplate = name => `# ${name}

## 表说明
- 用途：
- 粒度：
- 主键：
- 数据时效：
- 数据范围：

## 角色
- 投放组长：
- 优化师：
- 数据分析师：
- 只读访客：

## 指标口径
### 指标名称
- 计算公式：
- 依赖字段：
- 默认口径：
- 投放组长口径（如有差异）：

## 特殊规则
1. 
`;

  const businessLineTemplate = name => `# ${name}

## 业务概述
- 业务定位：
- 目标用户：
- 主要玩法：

## 术语与口径
- 术语：

## 核心指标
### 指标名称
- 计算公式：
- 依赖表 / 字段：
- 默认口径：

## 表地图
- 表名：用途；粒度；与其他表的关联键

## 常见分析套路
1. 

## 注意事项
1. 
`;

  return { renderKnowledgeMarkdown, normalizeToMarkdown, knowledgeTemplate, businessLineTemplate, knowledgeNow };
});
