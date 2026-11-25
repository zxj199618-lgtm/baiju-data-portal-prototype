/**
 * 灵犀智析富交互视图引擎：
 * - 交互式 Markdown 数据表格（列排序、数值右对齐、涨跌语义徽章、一键切换 表格 / 柱状图 / 折线图、复制/导出 CSV）
 * - 原生 SVG 交互式图表（零外部依赖，单文件版同样可用；支持 bar / line / horizontal-bar 与 Hover 数值提示）
 * - 报告大纲提取（供右侧分屏画布目录跳转）
 *
 * 依赖 core.js（window.PortalVue）；在 page-analysis-workbench.js 之前加载。
 */
(() => {
  "use strict";
  if (!window.PortalVue) return;

  const esc = value => String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

  /** 解析带千分位、单位（万/亿/%/元）的数值字符串；无法解析返回 NaN */
  function parseNumericValue(raw) {
    const text = String(raw ?? "").trim().replace(/,/g, "");
    if (!text || /^[-—–]+$/.test(text)) return NaN;
    const match = text.match(/^([+-]?\d+(?:\.\d+)?)\s*(%|％|万|亿|元|次|人|条|个|天|pp)?$/);
    if (!match) return NaN;
    const num = Number(match[1]);
    if (!Number.isFinite(num)) return NaN;
    if (match[2] === "万") return num * 1e4;
    if (match[2] === "亿") return num * 1e8;
    return num;
  }

  /** 判断单元格是否为涨跌/环比类文本（如 +12.3%、-5.4%、+2.1pp） */
  function trendKind(raw) {
    const text = String(raw ?? "").trim();
    if (/^\+\d+(?:\.\d+)?\s*(?:%|％|pp)$/.test(text)) return "up";
    if (/^-\d+(?:\.\d+)?\s*(?:%|％|pp)$/.test(text)) return "down";
    return "";
  }

  /** 友好的大数格式化（轴刻度与 Tooltip） */
  function formatCompact(value, unit = "") {
    if (!Number.isFinite(value)) return "—";
    const abs = Math.abs(value);
    if (unit === "%" || unit === "％") return `${value.toFixed(Math.abs(value) < 10 ? 2 : 1)}%`;
    if (abs >= 1e8) return `${(value / 1e8).toFixed(2)}亿`;
    if (abs >= 1e4) return `${(value / 1e4).toFixed(abs >= 1e5 ? 1 : 2)}万`;
    if (Number.isInteger(value)) return value.toLocaleString("zh-CN");
    return value.toFixed(2);
  }

  /** 从单元格文本推断单位 */
  function detectUnit(values) {
    const sample = values.find(v => String(v || "").trim());
    if (!sample) return "";
    const m = String(sample).trim().match(/(%|％|万|亿|元|pp)$/);
    return m ? (m[1] === "％" ? "%" : m[1]) : "";
  }

  /** 从 Markdown 表格提取结构化数据，判断是否适合切换图表 */
  function analyzeTableElement(table) {
    const headCells = Array.from(table.querySelectorAll("thead th, tbody tr:first-child th"));
    const bodyRows = Array.from(table.querySelectorAll("tbody tr")).filter(tr => tr.querySelectorAll("td").length > 0);
    const headers = headCells.map(th => th.textContent.trim());
    const rows = bodyRows.map(tr => Array.from(tr.querySelectorAll("td")).map(td => td.textContent.trim()));
    if (headers.length < 2 || rows.length < 2) return null;

    const numericCols = [];
    for (let col = 1; col < headers.length; col++) {
      const vals = rows.map(r => parseNumericValue(r[col]));
      const validCount = vals.filter(Number.isFinite).length;
      if (validCount >= Math.max(2, Math.ceil(rows.length * 0.6))) {
        numericCols.push({
          index: col,
          name: headers[col],
          values: vals.map(v => (Number.isFinite(v) ? v : 0)),
          raws: rows.map(r => r[col] || ""),
          unit: detectUnit(rows.map(r => r[col]))
        });
      }
    }
    if (!numericCols.length) return null;
    const labels = rows.map(r => r[0] || "");
    const looksTimeSeries = labels.every(l => /^\d{4}[-/]\d{1,2}(?:[-/]\d{1,2})?$|^\d{1,2}[-/月]\d{1,2}日?$|^第?\d+[天周月日]$/.test(l.trim()));
    return { headers, rows, labels, numericCols, defaultChart: looksTimeSeries ? "line" : "bar" };
  }

  /** 渲染原生 SVG 图表（支持 bar / line / horizontal-bar） */
  function renderChartSvg({ type = "bar", labels = [], series = [], title = "", unit = "" }) {
    if (!labels.length || !series.length) return '<div class="ai-chart-empty">暂无可视化数据</div>';
    const activeSeries = series.slice(0, 3);
    const allValues = activeSeries.flatMap(s => s.values).filter(Number.isFinite);
    const maxVal = Math.max(...allValues, 0);
    const minVal = Math.min(...allValues, 0);
    const span = maxVal - minVal || 1;
    const width = 640;
    const height = type === "horizontal-bar" ? Math.max(180, labels.length * 34 + 44) : 230;
    const pad = type === "horizontal-bar"
      ? { top: 20, right: 64, bottom: 20, left: 112 }
      : { top: 24, right: 20, bottom: 38, left: 56 };
    const plotW = width - pad.left - pad.right;
    const plotH = height - pad.top - pad.bottom;
    const fills = ["var(--ai-chart-1)", "var(--ai-chart-2)", "var(--ai-chart-3)"];

    let body = "";
    if (type === "horizontal-bar") {
      const s = activeSeries[0];
      const maxAbs = Math.max(...s.values.map(v => Math.abs(v)), 1);
      const rowH = plotH / labels.length;
      const barH = Math.min(18, rowH * 0.56);
      labels.forEach((label, i) => {
        const val = s.values[i] || 0;
        const y = pad.top + i * rowH + (rowH - barH) / 2;
        const barW = Math.max(2, (Math.abs(val) / maxAbs) * plotW);
        const fill = val < 0 ? "var(--ai-danger)" : fills[0];
        const tip = `${label} · ${s.name}: ${s.raws?.[i] || formatCompact(val, unit)}`;
        body += `<text x="${pad.left - 10}" y="${y + barH / 2 + 4}" text-anchor="end" class="ai-chart-axis">${esc(label.slice(0, 10))}</text>`;
        body += `<rect x="${pad.left}" y="${y}" width="${barW.toFixed(1)}" height="${barH.toFixed(1)}" rx="4" fill="${fill}" class="ai-chart-bar" data-tip="${esc(tip)}"/>`;
        body += `<text x="${(pad.left + barW + 6).toFixed(1)}" y="${y + barH / 2 + 4}" class="ai-chart-val">${esc(s.raws?.[i] || formatCompact(val, unit))}</text>`;
      });
    } else {
      const ticks = 4;
      for (let t = 0; t <= ticks; t++) {
        const ratio = t / ticks;
        const y = pad.top + plotH * (1 - ratio);
        const val = minVal + span * ratio;
        body += `<line x1="${pad.left}" y1="${y.toFixed(1)}" x2="${width - pad.right}" y2="${y.toFixed(1)}" class="ai-chart-grid"/>`;
        body += `<text x="${pad.left - 8}" y="${(y + 4).toFixed(1)}" text-anchor="end" class="ai-chart-axis">${esc(formatCompact(val, unit))}</text>`;
      }
      const zeroY = pad.top + plotH * (1 - (0 - minVal) / span);
      const stepX = plotW / labels.length;
      const maxLabels = Math.min(labels.length, 8);
      const labelStep = Math.max(1, Math.ceil(labels.length / maxLabels));
      labels.forEach((label, i) => {
        if (i % labelStep !== 0 && i !== labels.length - 1) return;
        const x = pad.left + stepX * i + stepX / 2;
        body += `<text x="${x.toFixed(1)}" y="${height - 12}" text-anchor="middle" class="ai-chart-axis">${esc(label.slice(0, 9))}</text>`;
      });

      if (type === "line") {
        activeSeries.forEach((s, si) => {
          const pts = labels.map((label, i) => {
            const val = s.values[i] || 0;
            const x = pad.left + stepX * i + stepX / 2;
            const y = pad.top + plotH * (1 - (val - minVal) / span);
            return { x, y, val, label, raw: s.raws?.[i] || formatCompact(val, unit) };
          });
          const d = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
          if (si === 0 && pts.length > 1) {
            const areaD = `${d} L${pts[pts.length - 1].x.toFixed(1)},${zeroY.toFixed(1)} L${pts[0].x.toFixed(1)},${zeroY.toFixed(1)} Z`;
            body += `<path d="${areaD}" class="ai-chart-area"/>`;
          }
          body += `<path d="${d}" fill="none" stroke="${fills[si]}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`;
          pts.forEach(p => {
            const tip = `${p.label} · ${s.name}: ${p.raw}`;
            body += `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="3.5" fill="var(--ai-surface)" stroke="${fills[si]}" stroke-width="2" class="ai-chart-dot" data-tip="${esc(tip)}"/>`;
          });
        });
      } else {
        const groupW = Math.min(stepX * 0.68, 52);
        const barW = Math.max(6, groupW / activeSeries.length - 2);
        activeSeries.forEach((s, si) => {
          labels.forEach((label, i) => {
            const val = s.values[i] || 0;
            const cx = pad.left + stepX * i + stepX / 2;
            const x = cx - groupW / 2 + si * (barW + 2);
            const yVal = pad.top + plotH * (1 - (val - minVal) / span);
            const y = Math.min(yVal, zeroY);
            const h = Math.max(2, Math.abs(zeroY - yVal));
            const tip = `${label} · ${s.name}: ${s.raws?.[i] || formatCompact(val, unit)}`;
            body += `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barW.toFixed(1)}" height="${h.toFixed(1)}" rx="3" fill="${fills[si]}" class="ai-chart-bar" data-tip="${esc(tip)}"/>`;
          });
        });
      }
    }

    const legend = activeSeries.length > 1
      ? `<div class="ai-chart-legend">${activeSeries.map((s, si) => `<span><i style="background:${fills[si]}"></i>${esc(s.name)}</span>`).join("")}</div>`
      : "";
    return `<div class="ai-chart-stage" data-chart-type="${esc(type)}">${title ? `<div class="ai-chart-title">${esc(title)}</div>` : ""}<svg viewBox="0 0 ${width} ${height}" class="ai-chart-svg" role="img" aria-label="${esc(title || "数据图表")}">${body}</svg><div class="ai-chart-tip" hidden></div>${legend}</div>`;
  }

  /** 渲染显式 ```chart JSON 代码块 */
  function renderChartBlock(rawJson) {
    try {
      const cfg = JSON.parse(String(rawJson || "").trim());
      const labels = Array.isArray(cfg.labels) ? cfg.labels.map(String) : [];
      const rawSeries = Array.isArray(cfg.series) ? cfg.series : (Array.isArray(cfg.values) ? [{ name: cfg.metric || "数值", values: cfg.values }] : []);
      const series = rawSeries.map(s => ({
        name: String(s.name || "数值"),
        values: (Array.isArray(s.values) ? s.values : []).map(v => Number(v) || 0),
        raws: Array.isArray(s.raws) ? s.raws.map(String) : undefined
      }));
      if (!labels.length || !series.length) return "";
      const type = ["bar", "line", "horizontal-bar"].includes(cfg.type) ? cfg.type : "bar";
      return `<div class="ai-chart-card" data-rich-chart="1">${renderChartSvg({ type, labels, series, title: cfg.title || "", unit: cfg.unit || "" })}</div>`;
    } catch {
      return "";
    }
  }

  /** 将二维表转为 CSV 文本（带 UTF-8 BOM 友好） */
  function toCsv(headers, rows) {
    const cell = value => {
      const str = String(value ?? "");
      return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
    };
    return [headers.map(cell).join(","), ...rows.map(r => r.map(cell).join(","))].join("\n");
  }

  /** 绑定 SVG Hover 浮层交互 */
  function bindChartHover(stage) {
    if (!stage || stage.dataset.hoverBound) return;
    stage.dataset.hoverBound = "1";
    const tip = stage.querySelector(".ai-chart-tip");
    if (!tip) return;
    stage.addEventListener("mousemove", event => {
      const target = event.target.closest("[data-tip]");
      if (!target) { tip.hidden = true; return; }
      const rect = stage.getBoundingClientRect();
      tip.textContent = target.getAttribute("data-tip") || "";
      tip.hidden = false;
      const x = Math.min(rect.width - 140, Math.max(8, event.clientX - rect.left + 12));
      const y = Math.max(8, event.clientY - rect.top - 32);
      tip.style.left = `${x}px`;
      tip.style.top = `${y}px`;
    });
    stage.addEventListener("mouseleave", () => { tip.hidden = true; });
  }

  /** 增强容器内的 Markdown 表格与图表（幂等，重复调用不会重复包裹） */
  function enhanceContainer(rootEl) {
    if (!rootEl || typeof rootEl.querySelectorAll !== "function") return;

    rootEl.querySelectorAll(".ai-chart-stage").forEach(bindChartHover);

    rootEl.querySelectorAll("table.portal-vue-ai-report-table").forEach(table => {
      if (table.dataset.richBound) return;
      table.dataset.richBound = "1";

      const headRow = table.querySelector("tbody tr:first-child");
      const hasTh = headRow && headRow.querySelectorAll("th").length > 0;
      const bodyRows = Array.from(table.querySelectorAll("tbody tr")).slice(hasTh ? 1 : 0);

      // 数值列右对齐 + 涨跌语义徽章
      if (hasTh) {
        const ths = Array.from(headRow.querySelectorAll("th"));
        ths.forEach((th, colIdx) => {
          const vals = bodyRows.map(tr => tr.children[colIdx]?.textContent?.trim() || "");
          const numericHits = vals.filter(v => Number.isFinite(parseNumericValue(v))).length;
          const isNumericCol = colIdx > 0 && numericHits >= Math.max(1, Math.ceil(bodyRows.length * 0.6));
          if (isNumericCol) {
            th.classList.add("is-num");
            bodyRows.forEach(tr => {
              const td = tr.children[colIdx];
              if (!td) return;
              td.classList.add("is-num");
              const kind = trendKind(td.textContent);
              if (kind && !td.querySelector(".ai-num-delta")) {
                td.innerHTML = `<span class="ai-num-delta is-${kind}">${esc(td.textContent.trim())}</span>`;
              }
            });
          }
          // 表头点击排序
          th.classList.add("is-sortable");
          th.title = "点击按此列排序";
          th.addEventListener("click", () => {
            const currentDir = th.dataset.sort === "asc" ? "desc" : "asc";
            ths.forEach(item => { delete item.dataset.sort; });
            th.dataset.sort = currentDir;
            const tbody = table.querySelector("tbody");
            const sorted = Array.from(tbody.querySelectorAll("tr")).slice(1).sort((a, b) => {
              const av = a.children[colIdx]?.textContent?.trim() || "";
              const bv = b.children[colIdx]?.textContent?.trim() || "";
              const an = parseNumericValue(av), bn = parseNumericValue(bv);
              const cmp = Number.isFinite(an) && Number.isFinite(bn) ? an - bn : av.localeCompare(bv, "zh-CN");
              return currentDir === "asc" ? cmp : -cmp;
            });
            sorted.forEach(tr => tbody.appendChild(tr));
          });
        });
      }

      const info = analyzeTableElement(table);
      const wrap = document.createElement("div");
      wrap.className = "ai-table-card";
      table.parentNode.insertBefore(wrap, table);

      const toolbar = document.createElement("div");
      toolbar.className = "ai-table-bar";
      const left = document.createElement("div");
      left.className = "ai-table-bar-left";
      left.innerHTML = `<span class="ai-table-meta">${bodyRows.length} 行数据</span>`;
      const right = document.createElement("div");
      right.className = "ai-table-bar-actions";

      let chartHost = null;
      let activeMetricIdx = 0;

      if (info) {
        const modes = [
          { key: "table", label: "表格" },
          { key: "bar", label: "柱状图" },
          { key: "line", label: "折线图" }
        ];
        const seg = document.createElement("div");
        seg.className = "ai-table-seg";
        seg.setAttribute("data-test", "ai-table-view-switch");
        chartHost = document.createElement("div");
        chartHost.className = "ai-table-chart-host";
        chartHost.hidden = true;

        const renderMode = mode => {
          seg.querySelectorAll("button").forEach(btn => btn.classList.toggle("active", btn.dataset.mode === mode));
          if (mode === "table") {
            table.hidden = false;
            chartHost.hidden = true;
            return;
          }
          table.hidden = true;
          chartHost.hidden = false;
          const col = info.numericCols[activeMetricIdx] || info.numericCols[0];
          const metricTabs = info.numericCols.length > 1
            ? `<div class="ai-chart-metrics">${info.numericCols.map((c, idx) => `<button type="button" class="${idx === activeMetricIdx ? "active" : ""}" data-metric-idx="${idx}">${esc(c.name)}</button>`).join("")}</div>`
            : "";
          chartHost.innerHTML = metricTabs + renderChartSvg({
            type: mode,
            labels: info.labels,
            series: [{ name: col.name, values: col.values, raws: col.raws }],
            unit: col.unit
          });
          chartHost.querySelectorAll("[data-metric-idx]").forEach(btn => {
            btn.addEventListener("click", () => {
              activeMetricIdx = Number(btn.dataset.metricIdx) || 0;
              renderMode(mode);
            });
          });
          bindChartHover(chartHost.querySelector(".ai-chart-stage"));
        };

        modes.forEach(m => {
          const btn = document.createElement("button");
          btn.type = "button";
          btn.dataset.mode = m.key;
          btn.textContent = m.label;
          if (m.key === "table") btn.classList.add("active");
          btn.addEventListener("click", () => renderMode(m.key));
          seg.appendChild(btn);
        });
        left.appendChild(seg);
      }

      const headers = hasTh ? Array.from(headRow.querySelectorAll("th")).map(th => th.textContent.trim()) : [];
      const rawRows = bodyRows.map(tr => Array.from(tr.querySelectorAll("td")).map(td => td.textContent.trim()));

      const copyBtn = document.createElement("button");
      copyBtn.type = "button";
      copyBtn.className = "ai-table-act";
      copyBtn.textContent = "复制 CSV";
      copyBtn.addEventListener("click", () => {
        const csv = toCsv(headers, rawRows);
        if (navigator.clipboard?.writeText) {
          navigator.clipboard.writeText(csv).then(() => {
            copyBtn.textContent = "已复制";
            setTimeout(() => { copyBtn.textContent = "复制 CSV"; }, 1600);
          }).catch(() => {});
        }
      });

      const exportBtn = document.createElement("button");
      exportBtn.type = "button";
      exportBtn.className = "ai-table-act";
      exportBtn.textContent = "导出 CSV";
      exportBtn.addEventListener("click", () => {
        const csv = "\uFEFF" + toCsv(headers, rawRows);
        const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `灵犀智析数据-${Date.now()}.csv`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      });

      right.appendChild(copyBtn);
      right.appendChild(exportBtn);
      toolbar.appendChild(left);
      toolbar.appendChild(right);
      wrap.appendChild(toolbar);

      const scroll = document.createElement("div");
      scroll.className = "ai-table-scroll";
      scroll.appendChild(table);
      wrap.appendChild(scroll);
      if (chartHost) wrap.appendChild(chartHost);
    });
  }

  /** 从 Markdown 提取标题大纲（供分屏报告画布目录导航） */
  function extractOutline(markdown) {
    const list = [];
    String(markdown || "").split(/\r?\n/).forEach((line, idx) => {
      const m = line.trim().match(/^(#{1,3})\s+(.+)$/);
      if (m) list.push({ id: `sec-${idx}`, level: m[1].length, text: m[2].replace(/[*`]/g, "").trim() });
    });
    return list;
  }

  window.PortalVue.aiRichView = {
    parseNumericValue,
    trendKind,
    formatCompact,
    toCsv,
    renderChartSvg,
    renderChartBlock,
    enhanceContainer,
    extractOutline
  };
})();
