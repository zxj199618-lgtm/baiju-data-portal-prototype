
  /* ============ 人群包模块（独立 IIFE，不污染原逻辑；通过 window.cp* 与路由对接） ============ */
  (() => {
    const $ = (id) => document.getElementById(id);
    const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
    const wan = (n) => (n / 10000).toFixed(1) + " 万";
    function cpToast(t) { const el = $("cpToast"); if (!el) return; el.textContent = t; el.classList.add("show"); clearTimeout(window._cptt); window._cptt = setTimeout(() => el.classList.remove("show"), 1900); }

    /* ---------- 标签主体表（人群包圈选 & 标签管理共用） ---------- */
    const cpTables = [
      { name: "dws_user_tag_wide", cn: "总标签宽表", fields: [
        { name: "gender", cn: "性别", type: "文本", values: ["男", "女", "未知"], cov: 88 },
        { name: "city", cn: "城市", type: "文本", values: ["北京", "上海", "广州", "深圳", "杭州", "成都", "武汉", "西安"], cov: 74 },
        { name: "age", cn: "年龄", type: "数值", cov: 61 },
        { name: "active_score", cn: "活跃度分", type: "数值", cov: 69 },
        { name: "reg_date", cn: "注册日期", type: "日期", cov: 95 },
        { name: "last_active_date", cn: "最近活跃日期", type: "日期", cov: 82 },
        { name: "is_paid_user", cn: "是否付费用户", type: "布尔", cov: 83 },
        { name: "interest_tags", cn: "兴趣标签", type: "数组", values: ["电竞", "手游", "影音", "运动", "数码", "母婴", "出行", "美食"], cov: 57 },
        { name: "equity_level", cn: "权益等级", type: "文本", values: ["高", "中", "低"], cov: 52 },
        { name: "consume_amt", cn: "累计消费金额", type: "数值", cov: 47 },
        { name: "device_id", cn: "设备ID", type: "文本", cov: 100 },
        { name: "phone_md5", cn: "手机号MD5", type: "文本", cov: 100 },
      ] },
      { name: "dwd_equity_tag_f_d", cn: "权益业务线标签表", fields: [
        { name: "equity_level", cn: "权益等级", type: "文本", values: ["钻石", "金", "银", "普通"], cov: 100 },
        { name: "pay_channel", cn: "常用支付渠道", type: "文本", values: ["宝付", "易付宝", "银联-三方", "银联-自营"], cov: 92 },
        { name: "success_order_cnt", cn: "成功订单数", type: "数值", cov: 100 },
        { name: "last_pay_date", cn: "最近支付日期", type: "日期", cov: 88 },
        { name: "is_member", cn: "是否会员", type: "布尔", cov: 100 },
        { name: "phone_md5", cn: "手机号MD5", type: "文本", cov: 100 },
      ] },
      { name: "dwd_haoka_tag_f_d", cn: "号卡业务线标签表", fields: [
        { name: "province", cn: "省份", type: "文本", values: ["青海", "内蒙古", "广东", "四川", "河南", "山东"], cov: 96 },
        { name: "package", cn: "套餐", type: "文本", values: ["电竞包", "视频包", "通用流量包"], cov: 100 },
        { name: "online_days", cn: "在网天数", type: "数值", cov: 100 },
        { name: "activate_date", cn: "激活日期", type: "日期", cov: 90 },
        { name: "phone_md5", cn: "手机号MD5", type: "文本", cov: 100 },
      ] },
    ];

    let cpTargets = [
      { name: "巨量DMP-OSS", bucket: "flink-baiju-prod", region: "cn-shenzhen", endpoint: "https://oss-cn-shenzhen.aliyuncs.com", ak: "LTAI5t8Z****Sepiyenw", sk: "********", refs: 2, last: "2026-07-03 03:12", status: "启用" },
      { name: "广点通-OSS", bucket: "gdt-audience-prod", region: "cn-shanghai", endpoint: "https://oss-cn-shanghai.aliyuncs.com", ak: "LTAI4f9x****Kd2mAb", sk: "********", refs: 1, last: "2026-07-02 03:05", status: "启用" },
    ];
    const targetAddr = (t) => `oss://${t.bucket || "-"}`;

    let cpPackages = [
      { id: "AUD1001", name: "权益核心付费用户", category: "定向包", mode: "sql", table: "dwd_equity_shop_order_f_d", cover: 824000, cov: null, fields: ["phone_hash"], encrypt: "MD5", format: "dmp", dmpDataType: "MOBILE_HASH_SHA256", freq: "每日推送", dailyTime: "03:12", hourlyMinute: 0, channel: "巨量DMP-OSS", status: "启用", last: "2026-07-03 03:12 成功", owner: "李雨航", desc: "用于权益付费用户复投与价值分析。", rule: "SQL：近 30 天权益订单成功支付用户，按手机号去重输出。", sql: "SELECT DISTINCT phone_hash FROM dwd_equity_shop_order_f_d WHERE dt = :max_pt AND pay_status = 'SUCCESS' AND pay_time >= date_sub(current_date, 30)" },
      { id: "AUD1002", name: "号卡电竞包-青海", category: "定向包", mode: "ui", table: "dwd_haoka_tag_f_d", cover: 156000, cov: 1.3, fields: ["phone_hash"], encrypt: "SHA256", format: "txt", freq: "每日推送", dailyTime: "03:05", hourlyMinute: 0, channel: "广点通-OSS", status: "启用", last: "2026-07-03 03:05 成功", owner: "谭嘉颖", desc: "青海电竞包用户定向投放。", relation: "AND", rule: "标签圈选：省份=青海，权益包类型=电竞包，近 7 天可触达。" },
      { id: "AUD1003", name: "高活跃女性-华南", category: "定向包", mode: "ui", table: "dws_user_tag_wide", cover: 203000, cov: 1.7, fields: ["oaid"], encrypt: "不加密", format: "txt", freq: "手动下载", dailyTime: "03:00", hourlyMinute: 0, channel: "", status: "启用", last: "2026-06-30 10:00 成功", owner: "林金维", desc: "华南高活跃女性用户定向触达。", relation: "AND", rule: "标签圈选：性别=女，常驻区域=华南，近 30 天活跃天数 >= 15。" },
      { id: "AUD1004", name: "沉默权益用户召回", category: "排除包", mode: "ui", table: "dwd_equity_tag_f_d", cover: 48000, cov: 0.4, fields: ["phone_hash"], encrypt: "MD5", format: "dmp", dmpDataType: "OAID_MD5", freq: "每小时推送", dailyTime: "03:00", hourlyMinute: 0, channel: "巨量DMP-OSS", status: "停用", last: "2026-06-28 03:00 失败", owner: "李雨航", desc: "权益沉默用户召回及排除管理。", relation: "AND", rule: "标签圈选：权益用户近 14 天未活跃，排除近 7 天已转化用户。" },
    ];
    const requirementCategoryCodeDefaults = Object.freeze({
      "权益": "EQUITY",
      "存量": "RETAIN",
      "号卡": "HAOKA",
      "保险": "INSURANCE",
      "达人": "CREATOR"
    });
    const audienceTypeCode = (category) => category === "排除包" ? "EXCLUDE" : "TARGET";
    const audiencePackageId = (category, requirementCategoryCode, sequence) => {
      const typeCode = audienceTypeCode(category);
      const categoryCode = String(requirementCategoryCode || "GENERAL").trim().toUpperCase() || "GENERAL";
      return `AUD_${typeCode}_${categoryCode}_${String(sequence).padStart(4, "0")}`;
    };
    let audSeq = 1004;
    const nextAudId = (category, requirementCategoryCode) => {
      const sequence = ++audSeq;
      return category && requirementCategoryCode ? audiencePackageId(category, requirementCategoryCode, sequence) : "AUD" + sequence;
    };
    const previewAudId = (category, requirementCategoryCode) => audiencePackageId(category, requirementCategoryCode, audSeq + 1);
    [
      ["高价值游戏用户-广东", "ui", "dws_user_tag_wide", 278000, 2.3, "oaid_hash", "SHA256", "每日推送", "广点通-OSS", "启用", "2026-07-02 03:05 成功", "谭嘉颖", "标签圈选：城市=广东核心城市，兴趣标签包含游戏，近 14 天活跃。"],
      ["权益会员续费提醒", "ui", "dwd_equity_tag_f_d", 126000, 1.1, "phone_hash", "MD5", "每日推送", "巨量DMP-OSS", "启用", "2026-07-02 03:12 成功", "李雨航", "标签圈选：权益等级=金/钻石，最近支付日期距今 25-30 天。"],
      ["号卡新激活用户", "ui", "dwd_haoka_tag_f_d", 95000, 0.8, "phone_hash", "SHA256", "每小时推送", "广点通-OSS", "启用", "2026-07-03 10:00 成功", "林金维", "标签圈选：激活日期为近 24 小时，在网天数 <= 2。"],
      ["沉默高消费召回", "sql", "dws_user_tag_wide", 68000, 0.6, "phone_hash", "MD5", "手动下载", "", "启用", "2026-07-01 10:20 成功", "李雨航", "SQL：累计消费金额高且近 30 天未活跃用户。"],
      ["权益低活跃排除包", "ui", "dwd_equity_tag_f_d", 42000, 0.4, "phone_hash", "MD5", "每日推送", "巨量DMP-OSS", "停用", "2026-06-29 03:12 成功", "谭嘉颖", "标签圈选：权益等级=普通，成功订单数=0，用于投放排除。"],
      ["青海号卡复购人群", "ui", "dwd_haoka_tag_f_d", 72000, 0.6, "phone_hash", "SHA256", "每日推送", "广点通-OSS", "启用", "2026-07-03 03:05 成功", "林金维", "标签圈选：省份=青海，套餐=通用流量包，在网天数 > 30。"],
      ["会员高等级扩量", "ui", "dwd_equity_tag_f_d", 188000, 1.6, "oaid_hash", "SHA256", "每日推送", "巨量DMP-OSS", "启用", "2026-07-03 03:12 成功", "李雨航", "标签圈选：权益等级=钻石/金，是否会员=是。"],
      ["新注册冷启动", "ui", "dws_user_tag_wide", 310000, 2.6, "oaid", "不加密", "手动下载", "", "启用", "2026-06-30 11:02 成功", "谭嘉颖", "标签圈选：注册日期近 7 天，活跃度分 >= 60。"],
      ["付费潜力用户", "sql", "dws_user_tag_wide", 146000, 1.2, "phone_hash", "SHA256", "每日推送", "广点通-OSS", "启用", "2026-07-02 03:05 成功", "林金维", "SQL：活跃度高、未付费且兴趣标签命中权益相关。"],
      ["视频包升级人群", "ui", "dwd_haoka_tag_f_d", 83000, 0.7, "phone_hash", "SHA256", "每日推送", "广点通-OSS", "启用", "2026-07-01 03:05 成功", "谭嘉颖", "标签圈选：套餐=视频包，在网天数 > 60，排除近 7 天已转化。"],
      ["银联支付偏好", "ui", "dwd_equity_tag_f_d", 54000, 0.5, "phone_hash", "MD5", "每日推送", "巨量DMP-OSS", "停用", "2026-06-28 03:12 成功", "李雨航", "标签圈选：常用支付渠道=银联-三方/银联-自营。"],
      ["高活跃城市白领", "ui", "dws_user_tag_wide", 236000, 2.0, "oaid_hash", "SHA256", "每日推送", "广点通-OSS", "启用", "2026-07-03 03:05 成功", "林金维", "标签圈选：城市=北京/上海/深圳/杭州，活跃度分 > 80。"]
    ].forEach(([name, mode, table, cover, cov, field, encrypt, freq, channel, status, last, owner, rule]) => {
      const scheduleTime = ((last || "").match(/\d{2}:\d{2}/) || ["03:00"])[0];
      cpPackages.push({ id: nextAudId(), name, category: /排除/.test(name) ? "排除包" : "定向包", mode, table, cover, cov: mode === "sql" ? null : cov, fields: [field], encrypt, format: "txt", freq, dailyTime: freq === "每日推送" ? scheduleTime : "03:00", hourlyMinute: freq === "每小时推送" ? Number(scheduleTime.split(":")[1]) : 0, channel, status, last, owner, desc: `${name}的人群定向及投放管理。`, relation: mode === "ui" && /扩量|偏好/.test(name) ? "OR" : "AND", rule, sql: mode === "sql" ? rule.replace(/^SQL：/, "SELECT DISTINCT phone_hash FROM dws_user_tag_wide WHERE ") : "" });
    });
    const inferRequirementCategory = (pkg) => {
      const name = pkg.name || "";
      const table = pkg.table || "";
      if (/保险/.test(name)) return "保险";
      if (/达人/.test(name)) return "达人";
      if (/haoka/i.test(table) || /号卡|套餐|电竞包/.test(name)) return "号卡";
      if (/equity/i.test(table) || /权益|会员|银联/.test(name)) return "权益";
      return "存量";
    };
    cpPackages.forEach(pkg => { if (!pkg.requirementCategory) pkg.requirementCategory = inferRequirementCategory(pkg); });
    cpPackages.forEach((pkg, index) => {
      const sequence = Number(String(pkg.id || "").match(/(\d+)$/)?.[1]) || 1001 + index;
      const fallbackCode = `CUSTOM_${index + 1}`;
      pkg.requirementCategoryCode = pkg.requirementCategoryCode || requirementCategoryCodeDefaults[pkg.requirementCategory] || fallbackCode;
      pkg.id = audiencePackageId(pkg.category, pkg.requirementCategoryCode, sequence);
      audSeq = Math.max(audSeq, sequence);
    });
    const outputFieldLabelMap = { oaid: "OAID", oaid_hash: "OAID 哈希值", phone: "手机号", phone_hash: "手机号哈希值" };
    const outputFieldLabel = (field) => outputFieldLabelMap[field] || field || "—";
    const tableCn = (n) => (cpTables.find(t => t.name === n) || {}).cn || n;
    const fieldCn = (tbl, fn) => { const t = cpTables.find(x => x.name === tbl); const f = t && t.fields.find(x => x.name === fn); return f ? f.cn : fn; };
    const packageOutputField = (p) => {
      const first = (p.fields || [])[0];
      return first ? outputFieldLabel(first) : "—";
    };
    const packageTableCell = (p) => p.mode === "sql" ? "—" : esc(tableCn(p.table));
    const packageDelivery = (p) => p.freq === "手动下载" ? "手动下载" : esc(p.channel || "未配置渠道");
    const packageFreq = (p) => p.freq === "手动下载" ? "不推送" : (p.freq || "—");
    const packageSchedule = (p) => {
      if (p.freq === "手动下载") return "—";
      if (/小时/.test(p.freq || "")) {
        const minute = Math.min(59, Math.max(0, Number(p.hourlyMinute ?? 0)));
        return `每小时第 ${String(minute).padStart(2, "0")} 分钟`;
      }
      return `每天 ${p.dailyTime || "03:00"}`;
    };
    function describePackageRule(p) {
      if (p.mode === "sql" && p.sql) return `SQL：${p.sql}`;
      if (p.mode === "ui") {
        const rule = p.rule || `标签圈选：基于${tableCn(p.table)}配置标签条件，输出${packageOutputField(p)}。`;
        if (/满足以上(?:所有|任一)条件/.test(rule)) return rule;
        const relationText = p.relation === "OR" ? "满足以上任一条件" : "满足以上所有条件";
        return `${rule.replace(/[。；\s]*$/, "")}。条件关系：${relationText}。`;
      }
      if (p.rule) return p.rule;
      if (p.mode === "sql") return "SQL 模式：按已保存 SQL 运行，输出结果集中的标识列。";
      return "";
    }
    function formatAbsoluteDateTime(value) {
      return value ? value.replace("T", " ") : "未填写";
    }
    function summarizeCurrentRule() {
      if (cpState.mode === "sql") {
        const sql = ($("cpSqlText").value || "").trim();
        return sql ? "SQL 模式：" + sql.split(/\s+/).slice(0, 18).join(" ") + (sql.split(/\s+/).length > 18 ? "..." : "") : "SQL 模式：待填写 SQL 规则。";
      }
      const table = currentTable();
      const conds = [...$("cpCondList").querySelectorAll(".cp-cond-row")].map(row => {
        const field = table?.fields.find(f => f.name === row.querySelector('[data-role="field"]')?.value);
        const op = row.querySelector('[data-role="op"]')?.value;
        const opText = row.querySelector('[data-role="op"] option:checked')?.textContent || "";
        if (op === "between") {
          const min = row.querySelector('[data-role="v1"]')?.value?.trim() || "未填写";
          const max = row.querySelector('[data-role="v2"]')?.value?.trim() || "未填写";
          return `${field?.cn || "字段"}在 ${min} 和 ${max} 之间（含边界）`;
        }
        if (op === "relative") {
          const days = row.querySelector('[data-role="v1"]')?.value?.trim() || "未填写";
          return `${field?.cn || "字段"}最近 ${days} 天以内（含今天）`;
        }
        if (op === "absolute") {
          const start = row.querySelector('[data-role="v1"]')?.value?.trim() || "未填写";
          const end = row.querySelector('[data-role="v2"]')?.value?.trim() || "未填写";
          return `${field?.cn || "字段"}在 ${formatAbsoluteDateTime(start)} 到 ${formatAbsoluteDateTime(end)} 之间`;
        }
        const valInput = row.querySelector('[data-role="val"] input');
        const val = valInput?.value?.trim() || "已配置";
        return `${field?.cn || "字段"}${opText}${val}`;
      }).filter(Boolean);
      const relationText = cpState.andor === "OR" ? "满足以上任一条件" : "满足以上所有条件";
      return `标签圈选：${tableCn($("cpTable").value)}；${conds.join("；") || "待配置条件"}。条件关系：${relationText}。`;
    }

    /* ---------- 列表页 ---------- */
    let cpStatus = "启用";
    let cpEditingIndex = null;
    let cpManagePage = 1;
    let cpManagePageSize = 10;
    function syncCpOwnerFilter() {
      const select = $("cpOwnerFilter");
      const selected = select.value;
      const owners = [...new Set(cpPackages.map(p => p.owner).filter(Boolean))].sort((a, b) => a.localeCompare(b, "zh-CN"));
      select.innerHTML = `<option value="">全部需求来源</option>${owners.map(owner => `<option value="${esc(owner)}">${esc(owner)}</option>`).join("")}`;
      if (owners.includes(selected)) select.value = selected;
    }
    function syncCpTableFilter() {
      const select = $("cpTableFilter");
      const selected = select.value;
      const tables = [...new Set(cpPackages.map(p => p.table).filter(Boolean))];
      select.innerHTML = `<option value="">全部圈选表</option>${tables.map(table => `<option value="${esc(table)}">${esc(tableCn(table))}</option>`).join("")}`;
      if (tables.includes(selected)) select.value = selected;
    }
      function cpRenderList() {
        if (window.cpVueModuleApi) { window.cpVueModuleApi.refreshList(); return; }
        syncCpOwnerFilter();
        syncCpTableFilter();
        const kw = ($("cpSearch").value || "").trim();
        const owner = $("cpOwnerFilter").value;
        const category = $("cpCategoryFilter").value;
        const mode = $("cpModeFilter").value;
        const table = $("cpTableFilter").value;
        const delivery = $("cpDeliveryFilter").value;
        const rows = cpPackages.filter(p => p.status === cpStatus
          && (!kw || p.name.includes(kw))
          && (!owner || p.owner === owner)
          && (!category || (p.category || "定向包") === category)
          && (!mode || p.mode === mode)
          && (!table || p.table === table)
          && (!delivery || packageDelivery(p) === delivery));
        const totalPages = Math.max(1, Math.ceil(rows.length / cpManagePageSize));
        cpManagePage = Math.min(cpManagePage, totalPages);
        const pagedRows = rows.slice((cpManagePage - 1) * cpManagePageSize, cpManagePage * cpManagePageSize);
        $("cpTableBody").innerHTML = pagedRows.map(p => {
          const idx = cpPackages.indexOf(p);
          const runOk = /成功/.test(p.last);
          const stats = buildRuns(p);
          const runCount = stats.length;
          const useCount = stats.filter(r => r.used).length;
          return `<tr>
            <td><strong>${esc(p.name)}</strong></td>
            <td>${esc(p.category || "定向包")}</td>
            <td>${esc(p.requirementCategory || "—")}</td>
            <td>${esc(p.owner || "—")}</td>
            <td class="cp-manage-desc" title="${esc(p.desc || "—")}">${esc(p.desc || "—")}</td>
            <td><span class="cp-status-cell"><button class="cp-toggle-btn ${p.status === "启用" ? "on" : ""}" data-cp-toggle="${idx}" aria-label="${p.status === "启用" ? "关闭" : "启用"}${esc(p.name)}"></button></span></td>
            <td>${p.mode === "sql" ? "SQL 模式" : "标签圈选"}</td>
            <td>${packageTableCell(p)}</td>
            <td>${p.mode === "sql" ? wan(p.cover) : `${wan(p.cover)}（${p.cov}%）`}</td>
            <td>${p.mode === "sql" ? "—" : esc(packageOutputField(p))}</td>
            <td>${p.mode === "sql" ? "—" : esc(p.encrypt || "—")}</td>
            <td>${packageDelivery(p)}</td>
            <td>${packageFreq(p)}</td>
            <td>${packageSchedule(p)}</td>
            <td>${runCount} 次</td>
            <td>${useCount} 次</td>
            <td style="color:${runOk ? "#3f4857" : "#d4380d"}">${esc(p.last)}</td>
            <td>
              <button class="cp-linkbtn" data-cp-edit="${idx}">编辑</button>
              <button class="cp-linkbtn" data-cp-run="${idx}">运行历史</button>
              ${p.status === "启用" ? `
                <button class="cp-linkbtn" data-cp-exec="${idx}">立即运行</button>
                <button class="cp-linkbtn" data-cp-export="${idx}">导出</button>
              ` : ""}
            </td>
        </tr>`;
      }).join("") || `<tr><td colspan="18" style="text-align:center;color:#98a2b3;height:120px">暂无人群包，点击右上角「新建人群包」开始</td></tr>`;
      const totalRuns = rows.reduce((sum, p) => sum + buildRuns(p).length, 0);
      const totalUsed = rows.reduce((sum, p) => sum + buildRuns(p).filter(r => r.used).length, 0);
      if (window.renderPagination) window.renderPagination("cpPagination", rows.length, cpManagePage, cpManagePageSize, "cp");
      const summary = document.createElement("span");
      summary.style.cssText = "font-size:12px;color:#98a2b3;margin-left:12px";
      summary.textContent = `累计运行 ${totalRuns} 次 / 已使用 ${totalUsed} 次`;
      $("cpPagination").querySelector(".pagination-controls")?.prepend(summary);
    }
    window.cpRenderList = cpRenderList;
    $("cpStatusTabs").addEventListener("click", e => { const b = e.target.closest("[data-cp-status]"); if (!b) return; cpStatus = b.dataset.cpStatus; cpManagePage = 1; [...$("cpStatusTabs").children].forEach(x => x.classList.toggle("active", x === b)); cpRenderList(); });
    $("cpSearch").addEventListener("input", () => { cpManagePage = 1; cpRenderList(); });
    ["cpOwnerFilter", "cpCategoryFilter", "cpModeFilter", "cpTableFilter", "cpDeliveryFilter"].forEach(id => $(id).addEventListener("change", () => { cpManagePage = 1; cpRenderList(); }));
    $("cpPagination").addEventListener("click", e => {
      if (e.target.closest('[data-page-prev="cp"]') && cpManagePage > 1) { cpManagePage -= 1; cpRenderList(); }
      if (e.target.closest('[data-page-next="cp"]')) { cpManagePage += 1; cpRenderList(); }
    });
    $("cpPagination").addEventListener("change", e => {
      const sizeSelect = e.target.closest('[data-page-size="cp"]');
      if (!sizeSelect) return;
      cpManagePageSize = Number(sizeSelect.value);
      cpManagePage = 1;
      cpRenderList();
    });
    $("cpCreateBtn").addEventListener("click", () => { cpEditingIndex = null; window.setSimplePage("新建人群包"); });
    $("cpTableBody").addEventListener("click", e => {
      const run = e.target.closest("[data-cp-run]"); const exec = e.target.closest("[data-cp-exec]"); const exp = e.target.closest("[data-cp-export]"); const tg = e.target.closest("[data-cp-toggle]"); const edit = e.target.closest("[data-cp-edit]");
      if (tg) {
        const p = cpPackages[+tg.dataset.cpToggle];
        const nextStatus = p.status === "启用" ? "停用" : "启用";
        const impact = nextStatus === "停用" ? "停用后将停止按计划自动运行。" : "启用后将按已配置的调度计划自动运行。";
        cpConfirm(`${nextStatus}人群包`, `确认${nextStatus}「${esc(p.name)}」？${impact}`, () => {
          p.status = nextStatus;
          cpToast(`「${p.name}」已${nextStatus}`);
          cpRenderList();
        });
        return;
      }
      if (edit) { cpEditingIndex = +edit.dataset.cpEdit; return window.setSimplePage("新建人群包"); }
      if (run) return openRunHistory(cpPackages[+run.dataset.cpRun]);
      if (exec) {
        const p = cpPackages[+exec.dataset.cpExec];
        if (p.status !== "启用") return cpToast("停用的人群包不支持立即运行");
        return doDeliver(p, "run");
      }
      if (exp) {
        const p = cpPackages[+exp.dataset.cpExport];
        if (p.status !== "启用") return cpToast("停用的人群包不支持导出");
        return doDeliver(p, "export");
      }
    });
    function doDeliver(p, kind) {
      const plain = p.encrypt === "不加密";
      const act = kind === "export" ? "导出" : "立即生成并推送";
      const go = () => cpToast(kind === "export" ? `「${p.name}」已生成下载` : `「${p.name}」已触发运行，推送至 ${p.channel || "OSS"}`);
      if (plain) return cpConfirm("明文标识 · 二次确认", `「${esc(p.name)}」加密方式为「不加密」，${act}属敏感操作，将记录审计日志（操作人 曾祥竞 / ${new Date().toLocaleString("zh-CN")}）。确认继续？`, go);
      go();
    }

    /* ---------- 运行历史（时间戳回调标识 + 分页，用于数据监控） ---------- */
    let cpRunPkg = null, cpRunPage = 1;
    const CP_RUN_PAGESIZE = 8;
    const pad2 = (x) => String(x).padStart(2, "0");
    const pad4 = (x) => String(x).padStart(4, "0");
    function formatRunDuration(value) {
      const totalSeconds = Math.max(0, Math.round(Number(value) || 0));
      const hours = Math.floor(totalSeconds / 3600);
      const minutes = Math.floor((totalSeconds % 3600) / 60);
      const seconds = totalSeconds % 60;
      if (hours) return `${hours}小时${pad2(minutes)}分${pad2(seconds)}秒`;
      if (minutes) return `${minutes}分${pad2(seconds)}秒`;
      return `${seconds}秒`;
    }
    function buildRuns(p) {
      const hourly = /小时/.test(p.freq || "");
      const manual = p.freq === "手动下载";
      const dailyTime = p.dailyTime || "03:00";
      const [dailyHour, dailyMinute] = dailyTime.split(":").map(Number);
      const hourlyMinute = Math.min(59, Math.max(0, Number(p.hourlyMinute ?? 0)));
      const n = hourly ? 96 : (manual ? 6 : 30);          // 每小时：近 4 天=96 次
      const stepMs = hourly ? 3600e3 : 86400e3;
      const now = new Date(2026, 6, 3, hourly ? 14 : dailyHour, hourly ? hourlyMinute : dailyMinute); // 2026-07-03
      const runs = [];
      for (let i = 0; i < n; i++) {
        const d = new Date(now.getTime() - i * stepMs);
        const ymd = `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}`;
        // 回调标识 = 人群包ID + 运行时间戳 + 当日运行序号，天然唯一、不会用尽
        const stamp = hourly ? ymd + pad2(d.getHours()) : ymd;
        const dailySeq = hourly ? d.getHours() + 1 : 1;
        const tstr = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${hourly ? pad2(d.getHours()) + ":" + pad2(hourlyMinute) : dailyTime}`;
        const st = ((i < 3 && /失败/.test(p.last)) || i === 8) ? "失败" : "成功";
        const calcReason = st === "失败" ? (i % 2 ? "上游分区未就绪，已告警" : "SQL 校验失败：时间分区表达式无效") : "";
        let pushSt = "推送成功", pushReason = "";
        if (manual) { pushSt = "未推送（手动下载）"; }
        else if (i === 4 && !hourly) { pushSt = "待推送"; }
        else if (i === 0 && p.id === "AUD1002") { pushSt = "推送失败"; pushReason = "目标渠道凭证失效（AK 过期）"; }
        else if ((i === 6 && /失败/.test(p.last)) || (!hourly && i % 9 === 5)) {
          pushSt = "推送失败";
          pushReason = i % 2 ? "目标渠道凭证失效（AK 过期）" : "OSS bucket 配额不足，剩余 0B";
        }
        const used = st === "成功" && !manual && (i % 3 === 0 || i === 1);
        const durationSeconds = 2 + ((i * 3 + Math.round(p.cover / 100000)) % 7);
        runs.push({ t: tstr, durationSeconds, st, calcReason, pushSt, pushReason, cnt: Math.round(p.cover * (1 - ((i * 7) % 20) / 300)), cbid: `${p.id}_${stamp}${pad4(dailySeq)}`, dailySeq, rule: describePackageRule(p), used });
      }
      return runs;
    }
    function runCoverageText(p, r) {
      if (r.st !== "成功") return "—";
      const amount = wan(r.cnt);
      if (p.mode === "sql") return amount;
      const baseCover = Number(p.cover) || 0;
      const rate = baseCover ? (Number(p.cov) || 0) * r.cnt / baseCover : 0;
      return `${amount}（${rate.toFixed(1)}%）`;
    }
    function renderRunDrawer() {
      const p = cpRunPkg; if (!p) return;
      const runs = buildRuns(p);
      const total = runs.length;
      const totalPages = Math.max(1, Math.ceil(total / CP_RUN_PAGESIZE));
      if (cpRunPage > totalPages) cpRunPage = totalPages;
      if (cpRunPage < 1) cpRunPage = 1;
      const slice = runs.slice((cpRunPage - 1) * CP_RUN_PAGESIZE, cpRunPage * CP_RUN_PAGESIZE);
      const usedCount = runs.filter(r => r.used).length;
      $("cpRunBody").innerHTML =
        `<div class="cp-run-summary">
          <div><span>累计运行次数</span><strong>${total} 次</strong></div>
          <div><span>使用次数</span><strong>${usedCount} 次</strong></div>
        </div>` +
        slice.map(r => `<div class="cp-run-item">
          <div class="cp-run-top"><span class="pill ${r.st === "成功" ? "green" : "red"}">${r.st}</span><strong style="font-size:13px">生成时间：${r.t}　·　运行时长：${formatRunDuration(r.durationSeconds)}</strong></div>
          <div class="cp-run-meta">覆盖量：${runCoverageText(p, r)}${r.st === "失败" ? '　·　<span style="color:#d4380d">上游分区未就绪，已告警</span>' : ""}</div>
          <div class="cp-run-cbid">回调标识：<code>${esc(r.cbid)}</code>　<span class="cp-used-tag ${r.used ? "" : "off"}">${r.used ? "已使用" : "未使用"}</span>　<span class="cp-rule-icon" data-rule-tip="${esc(r.rule)}" aria-label="查看运行规则" tabindex="0"><span class="cp-rule-glyph"></span></span></div>
          <div class="cp-rule-popover">${esc(r.rule)}</div>
        </div>`).join("") +
        `<div class="cp-run-pager"><span>共 ${total} 条记录 · 第 ${cpRunPage}/${totalPages} 页</span>
          <span class="cp-run-pager-actions"><button class="pagination-btn" data-run-prev ${cpRunPage <= 1 ? "disabled" : ""}>‹</button>
          <button class="pagination-btn" data-run-next ${cpRunPage >= totalPages ? "disabled" : ""}>›</button>
          <span>跳至</span><input class="cp-run-jump" data-run-jump type="number" min="1" max="${totalPages}" value="${cpRunPage}" /><button class="pagination-btn" data-run-go>页</button></span></div>`;
    }
    function openRunHistory(p) { cpRunPkg = p; cpRunPage = 1; $("cpRunTitle").textContent = "运行历史 · " + p.name; renderRunDrawer(); $("cpMask").classList.add("open"); $("cpRunDrawer").classList.add("open"); }
    $("cpRunBody").addEventListener("click", e => {
      if (e.target.closest("[data-run-prev]")) { cpRunPage--; renderRunDrawer(); }
      else if (e.target.closest("[data-run-next]")) { cpRunPage++; renderRunDrawer(); }
      else if (e.target.closest("[data-run-go]")) {
        const input = $("cpRunBody").querySelector("[data-run-jump]");
        if (input) { cpRunPage = Number(input.value) || cpRunPage; renderRunDrawer(); }
      }
    });
    $("cpRunBody").addEventListener("keydown", e => {
      if (e.key === "Enter" && e.target.closest("[data-run-jump]")) {
        cpRunPage = Number(e.target.value) || cpRunPage;
        renderRunDrawer();
      }
    });
    const closeRun = () => { $("cpMask").classList.remove("open"); $("cpRunDrawer").classList.remove("open"); };
    $("cpRunClose").addEventListener("click", closeRun); $("cpMask").addEventListener("click", closeRun);

    /* ---------- 通用确认框 ---------- */
    let cpConfirmCb = null;
    function cpConfirm(title, text, cb) { $("cpConfirmTitle").textContent = title; $("cpConfirmText").innerHTML = text; cpConfirmCb = cb; $("cpConfirmModal").classList.add("open"); }
    $("cpConfirmCancel").addEventListener("click", () => $("cpConfirmModal").classList.remove("open"));
    $("cpConfirmOk").addEventListener("click", () => { $("cpConfirmModal").classList.remove("open"); const cb = cpConfirmCb; cpConfirmCb = null; if (cb) cb(); });

    /* ---------- 新建人群包 ---------- */
    const cpState = { mode: "ui", andor: "AND" };
    const opMap = {
      "数值": [["gt", "大于"], ["lt", "小于"], ["eq", "等于"], ["gte", "大于等于"], ["lte", "小于等于"], ["between", "区间"], ["notnull", "有值"], ["isnull", "无值"]],
      "文本": [["eq", "等于"], ["ne", "不等于"], ["notnull", "有值"], ["isnull", "无值"]],
      "日期": [["relative", "相对时间"], ["absolute", "绝对时间"], ["notnull", "有值"], ["isnull", "无值"]],
      "数组": [["contains", "包含"], ["notcontains", "不包含"], ["notnull", "有值"], ["isnull", "无值"]],
      "布尔": [["true", "是"], ["false", "否"], ["notnull", "有值"], ["isnull", "无值"]],
    };
    const noValOps = new Set(["notnull", "isnull", "true", "false"]);
    let condSeq = 0;
    const currentTable = () => cpTables.find(t => t.name === $("cpTable").value) || cpTables[0];
    const outputFieldOptions = Object.keys(outputFieldLabelMap);

    function enhanceCpSelect(select) {
      if (!select || select.dataset.cpEnhanced === "skip") return;
      let wrap = select.nextElementSibling?.classList?.contains("cp-select-wrap") ? select.nextElementSibling : null;
      if (!wrap) {
        wrap = document.createElement("div");
        wrap.className = "cp-select-wrap";
        wrap.innerHTML = '<button class="cp-custom-select" type="button"></button><div class="cp-select-menu"></div>';
        select.insertAdjacentElement("afterend", wrap);
        select.dataset.cpEnhanced = "true";
        select.style.display = "none";
        wrap.querySelector(".cp-custom-select").addEventListener("click", event => {
          event.stopPropagation();
          document.querySelectorAll(".cp-select-wrap.open").forEach(item => { if (item !== wrap) item.classList.remove("open"); });
          wrap.classList.toggle("open");
        });
        wrap.querySelector(".cp-select-menu").addEventListener("click", event => {
          const option = event.target.closest("[data-cp-option]");
          if (!option) return;
          select.value = option.dataset.cpOption;
          select.dispatchEvent(new Event("change", { bubbles: true }));
          wrap.classList.remove("open");
          enhanceCpSelect(select);
        });
      }
      const selected = select.selectedIndex > -1 ? select.options[select.selectedIndex] : null;
      wrap.querySelector(".cp-custom-select").textContent = selected ? selected.textContent : (select.dataset.cpPlaceholder || "请选择");
      wrap.querySelector(".cp-select-menu").innerHTML = [...select.options].map(option => `
        <div class="cp-select-option ${option.value === select.value ? "active" : ""}" data-cp-option="${esc(option.value)}">${esc(option.textContent)}</div>
      `).join("");
    }

    function enhanceCpSelects(root = document) {
      root.querySelectorAll(".cp-form select").forEach(enhanceCpSelect);
    }

    document.addEventListener("click", event => {
      if (!event.target.closest(".cp-select-wrap")) document.querySelectorAll(".cp-select-wrap.open").forEach(item => item.classList.remove("open"));
      if (!event.target.closest(".cp-user-picker")) $("cpOwnerPicker")?.classList.remove("open");
      if (!event.target.closest(".cp-value-combo")) document.querySelectorAll(".cp-value-combo.open").forEach(item => item.classList.remove("open"));
    });

    function fillTableSelect() { $("cpTable").innerHTML = cpTables.map(t => `<option value="${t.name}">${esc(t.cn)}（${t.name}）</option>`).join(""); enhanceCpSelect($("cpTable")); }

    function valueCell(field, op) {
      if (noValOps.has(op)) return '';
      const t = field.type;
      if (t === "数值") {
        if (op === "between") return '<div class="cp-range cp-inclusive-range"><span class="cp-range-word">在</span><input type="number" data-role="v1" placeholder="最小值" aria-label="区间最小值，包含"><span class="cp-range-word">和</span><input type="number" data-role="v2" placeholder="最大值" aria-label="区间最大值，包含"><span class="cp-range-word">之间</span></div>';
        return '<input type="number" data-role="v1" placeholder="数值">';
      }
      if (t === "文本" || t === "数组") {
        const values = field.values || [];
        const options = values.map(v => `<button class="cp-value-option" type="button" data-cp-value-option="${esc(v)}">${esc(v)}</button>`).join("");
        return `<div class="cp-textmulti"><span class="cp-chips"></span><span class="cp-value-combo" data-values="${esc(values.join("|"))}"><input class="cp-chipin" placeholder="选择或输入值后回车" autocomplete="off"><span class="cp-value-menu">${options}</span></span></div>`;
      }
      if (t === "日期") {
        if (op === "relative") return '<div class="cp-range cp-relative-range"><span class="cp-range-word">最近</span><span class="cp-relative-control"><input type="number" min="1" step="1" data-role="v1" placeholder="天数"><span class="cp-relday">天以内</span></span><span class="cp-relative-note">含今天</span></div>';
        if (op === "absolute") return '<div class="cp-range cp-absolute-range"><span class="cp-range-word">在</span><input type="datetime-local" step="60" data-role="v1" aria-label="开始时间，默认当天零点"><span class="cp-range-word">到</span><input type="datetime-local" step="60" data-role="v2" aria-label="结束时间，默认当天零点"><span class="cp-range-word">之间</span></div>';
      }
      return '<input data-role="v1" placeholder="值">';
    }
    function condRow() {
      const t = currentTable(); if (!t) return "";
      const f0 = t.fields[0]; const ops = opMap[f0.type] || [];
      return `<div class="cp-cond-row">
        <select data-role="field">${t.fields.map((f, i) => `<option value="${f.name}" ${i === 0 ? "selected" : ""}>${esc(f.cn)}（${f.type}）</option>`).join("")}</select>
        <select data-role="op">${ops.map(o => `<option value="${o[0]}">${o[1]}</option>`).join("")}</select>
        <div data-role="val">${valueCell(f0, ops[0][0])}</div>
        <button class="cp-cond-del" data-role="del" type="button">×</button>
      </div>`;
    }
    function syncConditionDeleteButtons() {
      const rows = [...$("cpCondList").querySelectorAll(".cp-cond-row")];
      rows.forEach(row => {
        const deleteButton = row.querySelector('[data-role="del"]');
        if (deleteButton) deleteButton.hidden = rows.length === 1;
      });
    }
    const addCond = () => {
      $("cpCondList").insertAdjacentHTML("beforeend", condRow());
      enhanceCpSelects($("cpCondList"));
      $("cpCondList").querySelectorAll(".cp-chipin, [data-role='v1']").forEach(resizeRuleInput);
      syncConditionDeleteButtons();
    };
    const resetConds = () => { $("cpCondList").innerHTML = ""; addCond(); };

    $("cpCondList").addEventListener("change", e => {
      const row = e.target.closest(".cp-cond-row"); if (!row) return;
      const t = currentTable();
      if (e.target.dataset.role === "field") {
        const f = t.fields.find(x => x.name === e.target.value); const ops = opMap[f.type] || [];
        row.querySelector('[data-role="op"]').innerHTML = ops.map(o => `<option value="${o[0]}">${o[1]}</option>`).join("");
        row.querySelector('[data-role="val"]').innerHTML = valueCell(f, ops[0][0]);
        enhanceCpSelects(row);
      } else if (e.target.dataset.role === "op") {
        const f = t.fields.find(x => x.name === row.querySelector('[data-role="field"]').value);
        row.querySelector('[data-role="val"]').innerHTML = valueCell(f, e.target.value);
      } else if (e.target.classList.contains("cp-chipin")) {
        addChip(e.target);
      }
      row.classList.remove("cp-condition-invalid");
    });
    function resizeRuleInput(input) {
      if (!input || !input.matches(".cp-chipin, [data-role='v1']")) return;
      if (input.closest(".cp-inclusive-range, .cp-absolute-range")) { input.style.removeProperty("width"); return; }
      const sample = input.value || input.placeholder || "";
      input.style.width = `${Math.min(260, Math.max(96, sample.length * 13 + 26))}px`;
    }
    function renderValueOptions(input) {
      const combo = input?.closest(".cp-value-combo");
      if (!combo) return;
      const keyword = input.value.trim().toLowerCase();
      const values = (combo.dataset.values || "").split("|").filter(Boolean).filter(value => !keyword || value.toLowerCase().includes(keyword));
      combo.querySelector(".cp-value-menu").innerHTML = values.map(value => `<button class="cp-value-option" type="button" data-cp-value-option="${esc(value)}">${esc(value)}</button>`).join("") || '<button class="cp-value-option" type="button" disabled style="color:#98a2b3;cursor:default">按回车添加当前输入</button>';
    }
    function ensureAbsoluteMidnightDefault(input) {
      if (!input?.matches('.cp-absolute-range input[type="datetime-local"]') || input.value) return;
      const today = new Date();
      const pad = value => String(value).padStart(2, "0");
      input.value = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}T00:00`;
      input.closest(".cp-cond-row")?.classList.remove("cp-condition-invalid");
    }
    $("cpCondList").addEventListener("focusin", e => {
      ensureAbsoluteMidnightDefault(e.target);
      if (!e.target.classList.contains("cp-chipin")) return;
      resizeRuleInput(e.target); renderValueOptions(e.target); e.target.closest(".cp-value-combo")?.classList.add("open");
    });
    $("cpCondList").addEventListener("input", e => {
      resizeRuleInput(e.target); e.target.closest(".cp-cond-row")?.classList.remove("cp-condition-invalid");
      if (e.target.classList.contains("cp-chipin")) { renderValueOptions(e.target); e.target.closest(".cp-value-combo")?.classList.add("open"); }
    });
    $("cpCondList").addEventListener("keydown", e => {
      if (e.key === "Enter" && e.target.classList.contains("cp-chipin")) { e.preventDefault(); addChip(e.target); e.target.closest(".cp-value-combo")?.classList.remove("open"); }
      if (e.key === "Escape" && e.target.classList.contains("cp-chipin")) e.target.closest(".cp-value-combo")?.classList.remove("open");
    });
    $("cpCondList").addEventListener("click", e => {
      if (e.target.dataset.role === "del") {
        const rows = $("cpCondList").querySelectorAll(".cp-cond-row");
        if (rows.length <= 1) return;
        e.target.closest(".cp-cond-row").remove();
        syncConditionDeleteButtons();
        return;
      }
      const valueOption = e.target.closest("[data-cp-value-option]");
      if (valueOption) {
        const input = valueOption.closest(".cp-value-combo").querySelector(".cp-chipin");
        input.value = valueOption.dataset.cpValueOption; addChip(input); input.closest(".cp-value-combo").classList.remove("open"); return;
      }
      if (e.target.matches(".cp-chip i")) e.target.closest(".cp-chip").remove();
    });
    function addChip(input) {
      const v = input.value.trim(); if (!v) return;
      const chips = input.closest(".cp-textmulti").querySelector(".cp-chips");
      if ([...chips.children].some(c => c.dataset.v === v)) { input.value = ""; resizeRuleInput(input); return; }
      const span = document.createElement("span"); span.className = "cp-chip"; span.dataset.v = v; span.innerHTML = esc(v) + '<i>×</i>';
      chips.appendChild(span); input.value = ""; resizeRuleInput(input);
    }
    $("cpAddCond").addEventListener("click", addCond);
    function toggleAndor(nextValue) {
      cpState.andor = nextValue || (cpState.andor === "AND" ? "OR" : "AND");
      [...$("cpAndor").querySelectorAll("[data-andor]")].forEach(x => x.classList.toggle("active", x.dataset.andor === cpState.andor));
    }
    $("cpAndor").addEventListener("click", () => toggleAndor());

    const sqlKeywords = new Set("SELECT DISTINCT FROM WHERE AND OR AS JOIN LEFT RIGHT INNER OUTER FULL CROSS ON GROUP BY ORDER HAVING UNION ALL LIMIT OFFSET CASE WHEN THEN ELSE END IN IS NULL NOT LIKE BETWEEN EXISTS OVER PARTITION ASC DESC INSERT UPDATE DELETE INTO VALUES SET CREATE TABLE VIEW WITH RECURSIVE COUNT SUM AVG MIN MAX DATE_SUB CURRENT_DATE".split(" "));
    function formatSqlText(sql) {
      const original = String(sql || "").trim();
      if (!original) return "";
      const protectedSegments = [];
      let source = original.replace(/(--[^\n]*|\/\*[\s\S]*?\*\/|'(?:''|\\.|[^'])*'|"(?:""|\\.|[^"])*")/g, segment => {
        const placeholder = "__SQL_SEGMENT_" + protectedSegments.length + "__";
        protectedSegments.push(segment);
        return placeholder;
      });
      source = source.replace(/\s+/g, " ").trim();
      [
        ["UNION\\s+ALL", "UNION ALL"],
        ["LEFT\\s+OUTER\\s+JOIN", "LEFT OUTER JOIN"],
        ["RIGHT\\s+OUTER\\s+JOIN", "RIGHT OUTER JOIN"],
        ["FULL\\s+OUTER\\s+JOIN", "FULL OUTER JOIN"],
        ["LEFT\\s+JOIN", "LEFT JOIN"],
        ["RIGHT\\s+JOIN", "RIGHT JOIN"],
        ["INNER\\s+JOIN", "INNER JOIN"],
        ["FULL\\s+JOIN", "FULL JOIN"],
        ["CROSS\\s+JOIN", "CROSS JOIN"],
        ["GROUP\\s+BY", "GROUP BY"],
        ["ORDER\\s+BY", "ORDER BY"],
        ["SELECT", "SELECT"],
        ["FROM", "FROM"],
        ["WHERE", "WHERE"],
        ["HAVING", "HAVING"],
        ["UNION", "UNION"],
        ["LIMIT", "LIMIT"],
        ["OFFSET", "OFFSET"]
      ].forEach(([pattern, label]) => {
        source = source.replace(new RegExp("\\s*\\b" + pattern + "\\b\\s*", "gi"), "\n" + label + " ");
      });
      source = source.replace(/\s*\b(AND|OR)\b\s*/gi, (_, keyword) => "\n  " + keyword.toUpperCase() + " ");
      source = source.replace(/\b(SELECT|DISTINCT|FROM|WHERE|AND|OR|AS|JOIN|LEFT|RIGHT|INNER|OUTER|FULL|CROSS|ON|GROUP|BY|ORDER|HAVING|UNION|ALL|LIMIT|OFFSET|CASE|WHEN|THEN|ELSE|END|IN|IS|NULL|NOT|LIKE|BETWEEN|EXISTS|OVER|PARTITION|ASC|DESC|WITH|RECURSIVE)\b/gi, keyword => keyword.toUpperCase());
      source = source.split("\n").map(line => line.trim()).filter(Boolean).map(line => /^(AND|OR)\b/.test(line) ? "  " + line : line).join("\n");
      protectedSegments.forEach((segment, index) => {
        source = source.replaceAll("__SQL_SEGMENT_" + index + "__", segment);
      });
      return source.trim();
    }
    function highlightSqlSyntax(sql) {
      const source = String(sql || "");
      const tokenPattern = /(?:--[^\n]*|\/\*[\s\S]*?\*\/|'(?:''|\\.|[^'])*'|"(?:""|\\.|[^"])*"|:[A-Za-z_]\w*|\b\d+(?:\.\d+)?\b|\b[A-Za-z_]\w*\b)/g;
      let html = "";
      let lastIndex = 0;
      source.replace(tokenPattern, (raw, offset) => {
        html += esc(source.slice(lastIndex, offset));
        const upper = raw.toUpperCase();
        if (raw.startsWith("--") || raw.startsWith("/*")) html += '<span class="sql-token comment">' + esc(raw) + "</span>";
        else if (raw.startsWith("'") || raw.startsWith('"')) html += '<span class="sql-token string">' + esc(raw) + "</span>";
        else if (raw.startsWith(":")) html += '<span class="sql-token parameter">' + esc(raw) + "</span>";
        else if (/^\d/.test(raw)) html += '<span class="sql-token number">' + esc(raw) + "</span>";
        else if (sqlKeywords.has(upper)) html += '<span class="sql-token keyword">' + esc(raw) + "</span>";
        else if (/^\s*\(/.test(source.slice(offset + raw.length))) html += '<span class="sql-token function">' + esc(raw) + "</span>";
        else html += esc(raw);
        lastIndex = offset + raw.length;
        return raw;
      });
      return html + esc(source.slice(lastIndex));
    }
    function syncSqlHighlightScroll() {
      $("cpSqlHighlight").parentElement.scrollTop = $("cpSqlText").scrollTop;
      $("cpSqlHighlight").parentElement.scrollLeft = $("cpSqlText").scrollLeft;
    }
    function renderSqlHighlight() {
      const value = $("cpSqlText").value || "";
      $("cpSqlHighlight").innerHTML = highlightSqlSyntax(value) + (value.endsWith("\n") ? " " : "");
      syncSqlHighlightScroll();
    }
    function formatAndRenderSql() {
      const input = $("cpSqlText");
      const formatted = formatSqlText(input.value);
      if (formatted !== input.value) input.value = formatted;
      renderSqlHighlight();
    }
    $("cpSqlText").addEventListener("input", renderSqlHighlight);
    $("cpSqlText").addEventListener("scroll", syncSqlHighlightScroll);
    $("cpSqlText").addEventListener("blur", formatAndRenderSql);
    $("cpSqlText").addEventListener("paste", () => window.setTimeout(formatAndRenderSql, 0));
    $("cpSqlText").addEventListener("keydown", event => {
      if (event.key !== "Tab") return;
      event.preventDefault();
      const input = event.currentTarget;
      input.setRangeText("  ", input.selectionStart, input.selectionEnd, "end");
      renderSqlHighlight();
    });
    renderSqlHighlight();

    function detectSqlOutputConfig(sql) {
      const source = String(sql || "").toUpperCase();
      const hasSha256 = /SHA2\s*\(|SHA256(?:_PHONE)?/.test(source);
      const hasMd5 = /MD5\s*\(|PHONE_MD5/.test(source);
      if (hasSha256 && hasMd5) return { error: "SQL 中混用了 MD5 与 SHA256，请统一输出加密口径" };
      const encrypt = hasSha256 ? "SHA256" : hasMd5 ? "MD5" : "不加密";
      const hasOaid = /\bOAID\b/.test(source);
      return { field: hasOaid ? (encrypt === "不加密" ? "oaid" : "oaid_hash") : (encrypt === "不加密" ? "phone" : "phone_hash"), encrypt };
    }
    function syncSqlOutputConfig() {
      if (cpState.mode !== "sql") return detectSqlOutputConfig("");
      const detected = detectSqlOutputConfig($("cpSqlText").value);
      if (detected.error) return detected;
      $("cpFieldSelect").value = detected.field;
      const encryptInput = $("cpEncrypt").querySelector(`input[value="${detected.encrypt}"]`);
      if (encryptInput) encryptInput.checked = true;
      enhanceCpSelect($("cpFieldSelect"));
      return detected;
    }

    // 模式切换
    function applyMode() {
      const sqlMode = cpState.mode === "sql";
      $("cpUiMode").classList.toggle("hidden", sqlMode);
      $("cpSqlMode").classList.toggle("hidden", !sqlMode);
      $("cpSqlParams").classList.toggle("hidden", sqlMode);
      $("cpOutputFieldWrap").classList.toggle("hidden", sqlMode);
      $("cpEncryptWrap").classList.toggle("hidden", sqlMode);
      if (sqlMode) { formatAndRenderSql(); syncSqlOutputConfig(); }
      [...$("cpModeTabs").children].forEach(x => x.classList.toggle("active", x.dataset.cpMode === cpState.mode));
    }
    $("cpModeTabs").addEventListener("click", e => { const b = e.target.closest("[data-cp-mode]"); if (!b) return; cpState.mode = b.dataset.cpMode; applyMode(); });
    $("cpTable").addEventListener("change", () => { resetConds(); fillFieldSelect(); });

    // 参数行
    function paramRow(name, bind) {
      return `<div class="cp-param-row">
        <input placeholder="参数名，如 :start_date" value="${esc(name || "")}" />
        <input placeholder="说明" />
        <select><option ${bind === "T-1" ? "selected" : ""}>T-1（昨天）</option><option ${bind === "最新分区" ? "selected" : ""}>最新分区 MAX_PT</option><option>近7天</option><option>固定值</option></select>
        <button class="cp-cond-del" data-role="pdel" type="button">×</button></div>`;
    }
    $("cpAddParam").addEventListener("click", () => { $("cpParamList").insertAdjacentHTML("beforeend", paramRow()); enhanceCpSelects($("cpParamList")); });
    $("cpParamList").addEventListener("click", e => { if (e.target.dataset.role === "pdel") e.target.closest(".cp-param-row").remove(); });

    // 输出字段（单选下拉）
    function fillFieldSelect() {
      const select = $("cpFieldSelect");
      select.dataset.cpPlaceholder = "请选择输出字段";
      select.innerHTML = outputFieldOptions.map(field => `<option value="${field}">${outputFieldLabel(field)}</option>`).join("");
      select.selectedIndex = -1;
      enhanceCpSelect(select);
    }

    function setCpCategory(value = "") {
      $("cpCategory").value = value;
      [...$("cpCategoryCards").querySelectorAll("[data-cp-category]")].forEach(button => button.classList.toggle("active", button.dataset.cpCategory === value));
    }
    $("cpCategoryCards").addEventListener("click", event => {
      const button = event.target.closest("[data-cp-category]");
      if (!button) return;
      setCpCategory(button.dataset.cpCategory);
      $("cpCategory").closest(".form-field").classList.remove("invalid");
    });

    function renderOwnerOptions(query = "") {
      const keyword = query.trim().toLowerCase();
      const users = (window.simpleUsers || []).filter(user => !keyword || [user.name, user.dept, user.role, user.email].some(value => String(value || "").toLowerCase().includes(keyword)));
      $("cpOwnerMenu").innerHTML = users.map(user => `<div class="cp-user-option" data-cp-owner="${esc(user.name)}"><strong>${esc(user.name)}</strong><small>${esc(user.dept)} · ${esc(user.role)}</small></div>`).join("") || '<div class="cp-user-option" style="color:#98a2b3;cursor:default">未找到匹配用户</div>';
    }
    $("cpOwner").addEventListener("focus", () => { renderOwnerOptions($("cpOwner").value); $("cpOwnerPicker").classList.add("open"); });
    $("cpOwner").addEventListener("input", () => { renderOwnerOptions($("cpOwner").value); $("cpOwnerPicker").classList.add("open"); });
    $("cpOwnerMenu").addEventListener("mousedown", event => {
      const option = event.target.closest("[data-cp-owner]");
      if (!option) return;
      event.preventDefault();
      $("cpOwner").value = option.dataset.cpOwner;
      $("cpOwnerPicker").classList.remove("open");
    });

    // 交付：频次决定调度控件与渠道是否展示
    function updateFreq() {
      const value = ($("cpFreq").querySelector("input:checked") || {}).value;
      const manual = value === "手动下载";
      $("cpScheduleWrap").classList.toggle("hidden", manual);
      $("cpDailySchedule").classList.toggle("hidden", value !== "每日推送");
      $("cpHourlySchedule").classList.toggle("hidden", value !== "每小时推送");
      $("cpChannelWrap").classList.toggle("hidden", manual);
    }
    $("cpFreq").addEventListener("change", updateFreq);

    function fillChannel() {
      const availableTargets = cpTargets.filter(target => (target.status || "启用") === "启用");
      $("cpChannel").innerHTML = availableTargets.map(t => `<option>${esc(t.name)}</option>`).join("") || `<option value="">（暂无启用中的 OSS 渠道，请先到「人群包推送渠道」新增）</option>`;
      enhanceCpSelect($("cpChannel"));
    }

    function cpRenderCreate() {
      if (window.cpVueModuleApi) { window.cpVueModuleApi.openForm(Number.isInteger(cpEditingIndex) ? cpEditingIndex : null); return; }
      const editing = Number.isInteger(cpEditingIndex) ? cpPackages[cpEditingIndex] : null;
      cpState.mode = editing?.mode || "ui"; cpState.andor = editing?.relation || "AND";
      window.document.getElementById("pageTitle").innerHTML = `<button class="btn ghost" data-cp-back style="vertical-align:middle;margin-right:12px">返回</button>${editing ? "编辑人群包" : "新建人群包"}`;
      $("cpSaveCreate").textContent = "校验并保存";
      $("cpName").value = editing?.name || ""; $("cpName").closest(".form-field").classList.remove("invalid");
      setCpCategory(editing ? (editing.category || "定向包") : "");
      $("cpRequirementCategory").value = editing?.requirementCategory || "";
      $("cpDesc").value = editing?.desc || "";
      $("cpOwner").value = editing?.owner || "";
      ["cpCategory", "cpRequirementCategory", "cpTable", "cpFieldSelect", "cpChannel"].forEach(id => $(id)?.closest(".form-field")?.classList.remove("invalid"));
      $("cpSqlText").value = editing?.sql || "";
      toggleAndor(cpState.andor);
      fillTableSelect();
      if (editing?.table && [...$("cpTable").options].some(option => option.value === editing.table)) $("cpTable").value = editing.table;
      resetConds(); applyMode();
      fillFieldSelect();
      if (editing?.fields?.[0] && [...$("cpFieldSelect").options].some(option => option.value === editing.fields[0])) $("cpFieldSelect").value = editing.fields[0];
      $("cpParamList").innerHTML = paramRow(":max_pt", "最新分区");
      ($("cpEncrypt").querySelector(`input[value="${editing?.encrypt || "不加密"}"]`) || $("cpEncrypt").querySelector('input[value="不加密"]')).checked = true;
      ($("cpFormat").querySelector(`input[value="${editing?.format || "txt"}"]`) || $("cpFormat").querySelector('input[value="txt"]')).checked = true;
      const editingFreq = editing?.freq || "每日推送";
      ($("cpFreq").querySelector(`input[value="${editingFreq}"]`) || $("cpFreq").querySelector('input[value="每日推送"]')).checked = true;
      $("cpDailyTime").value = editing?.dailyTime || "03:00";
      $("cpHourlyMinute").value = editing?.hourlyMinute ?? 0;
      fillChannel();
      if (editing?.channel && [...$("cpChannel").options].some(option => option.value === editing.channel || option.textContent === editing.channel)) $("cpChannel").value = editing.channel;
      if (cpState.mode === "sql") syncSqlOutputConfig();
      updateFreq(); enhanceCpSelects($("cpCreateView")); renderOwnerOptions();
    }
    window.cpRenderCreate = cpRenderCreate;
    window.cpCancelEdit = () => { cpEditingIndex = null; };

    /* ---------- 标签管理（字段自动同步自标签表 + 手动完善） ---------- */
    // 标签元数据种子：部分预填，其余留空（待完善）
    const tagPresets = {
      gender: { def: "用户性别", calc: "取实名 / 画像性别，未知归一为「未知」", freq: "离线" },
      city: { def: "常驻城市", calc: "近 90 天定位城市众数", freq: "离线" },
      age: { def: "年龄", calc: "身份证 / 画像推断", freq: "离线" },
      is_paid_user: { def: "是否付费用户", calc: "历史成功订单数 > 0", freq: "离线" },
      equity_level: { def: "权益等级", calc: "按累计权益消费分档", freq: "离线" },
      pay_channel: { def: "常用支付渠道", calc: "近 180 天支付笔数最多的渠道", freq: "离线" },
      success_order_cnt: { def: "成功订单数", calc: "count(订单 where 状态 = 支付成功)", freq: "离线" },
      province: { def: "号卡归属省份", calc: "号卡开卡省份", freq: "实时" },
      is_member: { def: "是否会员", calc: "会员到期日 >= 今天", freq: "实时" },
    };
    cpTables.forEach(t => t.fields.forEach(f => {
      const p = tagPresets[f.name] || {};
      f.def = f.def || p.def || ""; f.calc = f.calc || p.calc || ""; f.freq = f.freq || p.freq || "";
      f.enumv = f.enumv || (f.values ? f.values.join("，") : "");
    }));

    function sqlToSemantic(t) {
      t = String(t || "").toUpperCase();
      if (/DATE|TIME/.test(t)) return "日期";
      if (/BOOL/.test(t)) return "布尔";
      if (/ARRAY/.test(t)) return "数组";
      if (/INT|DECIMAL|DOUBLE|FLOAT|BIGINT|NUMERIC/.test(t)) return "数值";
      return "文本";
    }
    // 表管理「设为标签表」桥接
    window.cpTag = {
      has: (name) => cpTables.some(t => t.name === name),
      get: (name) => cpTables.find(t => t.name === name),
      setExportFields: (name, fields) => {
        const table = cpTables.find(t => t.name === name);
        if (table) table.exportFields = fields;
      },
      toggle: (assetIdx) => {
        const a = (window.dataAssets || [])[assetIdx]; if (!a) return;
        const i = cpTables.findIndex(t => t.name === a.table);
        if (i >= 0) { cpTables.splice(i, 1); cpToast(`已取消标签表：${a.table}`); }
        else {
          cpTables.push({ name: a.table, cn: a.cnName || a.table, exportFields: [], fields: (a.fields || []).map(f => ({
            name: f.name, cn: f.comment || f.name, type: sqlToSemantic(f.type),
            cov: Math.round(45 + Math.random() * 55), def: "", calc: "", freq: "", enumv: "",
          })) });
          cpToast(`已配置为标签表，${(a.fields || []).length} 个字段已同步到「标签管理」，请完善标签信息`);
        }
        if (window.renderDataAssets) window.renderDataAssets((($("assetSearch") || {}).value) || "");
        if (!$("tagCatalogView").classList.contains("hidden")) cpRenderTagCatalog();
      },
    };
    let tagSubjectIdx = 0;
    let tagCatalogPage = 1;
    let tagCatalogPageSize = 10;
    function cpRenderTagCatalog() {
      const sub = $("tagSubject");
      if (tagSubjectIdx >= cpTables.length) tagSubjectIdx = 0;
      sub.innerHTML = cpTables.map((t, i) => `<option value="${i}">${esc(t.cn)}（${t.name}）</option>`).join("");
      sub.value = tagSubjectIdx;
      const t = cpTables[tagSubjectIdx];
      const kw = ($("tagSearch").value || "").trim();
      const fields = t ? t.fields.filter(f => !kw || f.name.includes(kw) || f.cn.includes(kw)) : [];
      const totalPages = Math.max(1, Math.ceil(fields.length / tagCatalogPageSize));
      tagCatalogPage = Math.min(tagCatalogPage, totalPages);
      const pagedFields = fields.slice((tagCatalogPage - 1) * tagCatalogPageSize, tagCatalogPage * tagCatalogPageSize);
      const todo = (v) => v ? esc(v) : '<span class="cp-todo">待完善</span>';
      $("tagTableBody").innerHTML = pagedFields.map(f => {
        const low = f.cov < 55; const idx = t.fields.indexOf(f);
        return `<tr>
          <td><strong>${esc(f.cn)}</strong></td>
          <td><code style="font-family:ui-monospace,Menlo,monospace">${esc(f.name)}</code></td>
          <td>${esc(f.type)}</td>
          <td style="white-space:normal;max-width:200px">${todo(f.def)}</td>
          <td style="white-space:normal;max-width:180px;color:#667085">${f.enumv ? esc(f.enumv) : '<span class="cp-muted-cell">—</span>'}</td>
          <td style="white-space:normal;max-width:220px">${todo(f.calc)}</td>
          <td>${f.freq ? '<span class="pill ' + (f.freq === "实时" ? "blue" : "green") + '">' + esc(f.freq) + '</span>' : '<span class="cp-todo">待完善</span>'}</td>
          <td><span class="cp-cov"><span class="cp-cov-bar ${low ? "low" : ""}"><i style="width:${f.cov}%"></i></span><span class="cp-cov-num">${f.cov}%</span></span></td>
          <td><button class="cp-linkbtn" data-tag-edit="${idx}">编辑</button></td>
        </tr>`;
      }).join("") || `<tr><td colspan="9" style="text-align:center;color:#98a2b3;height:100px">该主体暂无字段</td></tr>`;
      const pending = t ? t.fields.filter(f => !f.def || !f.freq).length : 0;
      $("tagPendingHint").textContent = pending ? `${pending} 个标签待完善（缺定义 / 更新频率）` : "全部标签已完善 ✓";
      window.renderPagination?.("tagPagination", fields.length, tagCatalogPage, tagCatalogPageSize, "tag");
    }
    window.cpRenderTagCatalog = cpRenderTagCatalog;
    $("tagSearch").addEventListener("input", () => { tagCatalogPage = 1; cpRenderTagCatalog(); });
    $("tagSubject").addEventListener("change", () => { tagSubjectIdx = +$("tagSubject").value; tagCatalogPage = 1; cpRenderTagCatalog(); });
    $("tagPagination").addEventListener("click", e => {
      if (e.target.closest('[data-page-prev="tag"]') && tagCatalogPage > 1) { tagCatalogPage -= 1; cpRenderTagCatalog(); }
      if (e.target.closest('[data-page-next="tag"]')) { tagCatalogPage += 1; cpRenderTagCatalog(); }
    });
    $("tagPagination").addEventListener("change", e => {
      const size = e.target.closest('[data-page-size="tag"]');
      if (!size) return;
      tagCatalogPageSize = Number(size.value); tagCatalogPage = 1; cpRenderTagCatalog();
    });

    // 标签编辑弹窗
    let tagEditRef = null;
    $("tagTableBody").addEventListener("click", e => {
      const b = e.target.closest("[data-tag-edit]"); if (!b) return;
      const t = cpTables[tagSubjectIdx]; const f = t.fields[+b.dataset.tagEdit]; tagEditRef = f;
      $("tagEditName").textContent = `${f.cn}（${f.name}）`;
      $("tagEditAuto").innerHTML = `自动同步：字段名 <code>${esc(f.name)}</code> · 类型 <b>${esc(f.type)}</b> · 覆盖率 ${f.cov}%（以下为手动完善项）`;
      $("tagEditDef").value = f.def || ""; $("tagEditEnum").value = f.enumv || ""; $("tagEditCalc").value = f.calc || "";
      const fr = $("tagEditFreq").querySelector(`input[value="${f.freq || "离线"}"]`); if (fr) fr.checked = true;
      $("tagEditModal").classList.add("open");
    });
    $("tagEditCancel").addEventListener("click", () => $("tagEditModal").classList.remove("open"));
    $("tagEditSave").addEventListener("click", () => {
      if (!tagEditRef) return;
      tagEditRef.def = $("tagEditDef").value.trim();
      tagEditRef.enumv = $("tagEditEnum").value.trim();
      tagEditRef.calc = $("tagEditCalc").value.trim();
      tagEditRef.freq = ($("tagEditFreq").querySelector("input:checked") || {}).value || "离线";
      if (tagEditRef.enumv) tagEditRef.values = tagEditRef.enumv.split(/[，,]/).map(s => s.trim()).filter(Boolean);
      $("tagEditModal").classList.remove("open"); cpRenderTagCatalog(); cpToast("标签信息已保存");
    });

    /* ---------- 推送渠道 ---------- */
    let targetStatus = "启用";
    let targetPage = 1;
    let targetPageSize = 10;
    function cpRenderTargets() {
      const kw = ($("targetSearch").value || "").trim();
      const rows = cpTargets.filter(t => (t.status || "启用") === targetStatus && (!kw || t.name.includes(kw)));
      const totalPages = Math.max(1, Math.ceil(rows.length / targetPageSize));
      targetPage = Math.min(targetPage, totalPages);
      const pagedRows = rows.slice((targetPage - 1) * targetPageSize, targetPage * targetPageSize);
      $("targetTableBody").innerHTML = pagedRows.map(t => `<tr>
        <td><strong>${esc(t.name)}</strong></td>
        <td><span class="pill blue">OSS</span></td>
        <td><code style="font-family:ui-monospace,Menlo,monospace;font-size:12px">${esc(targetAddr(t))}</code><div style="font-size:11px;color:#98a2b3">${esc(t.region || "")}${t.endpoint ? " · " + esc(t.endpoint) : ""}</div></td>
        <td>${t.refs} 个人群包</td>
        <td>${esc(t.last)}</td>
        <td><button class="cp-toggle-btn ${(t.status || "启用") === "启用" ? "on" : ""}" data-tgt-toggle="${cpTargets.indexOf(t)}" aria-label="${(t.status || "启用") === "启用" ? "关闭" : "启用"}${esc(t.name)}"></button></td>
      </tr>`).join("") || `<tr><td colspan="6" style="text-align:center;color:#98a2b3;height:100px">暂无 OSS 推送渠道</td></tr>`;
      window.renderPagination?.("targetPagination", rows.length, targetPage, targetPageSize, "target");
    }
    window.cpRenderTargets = cpRenderTargets;
    $("targetStatusTabs").addEventListener("click", e => {
      const tab = e.target.closest("[data-target-status]"); if (!tab) return;
      targetStatus = tab.dataset.targetStatus; targetPage = 1;
      [...$("targetStatusTabs").children].forEach(button => button.classList.toggle("active", button === tab));
      cpRenderTargets();
    });
    $("targetSearch").addEventListener("input", () => { targetPage = 1; cpRenderTargets(); });
    $("targetPagination").addEventListener("click", e => {
      if (e.target.closest('[data-page-prev="target"]') && targetPage > 1) { targetPage -= 1; cpRenderTargets(); }
      if (e.target.closest('[data-page-next="target"]')) { targetPage += 1; cpRenderTargets(); }
    });
    $("targetPagination").addEventListener("change", e => {
      const size = e.target.closest('[data-page-size="target"]');
      if (!size) return;
      targetPageSize = Number(size.value); targetPage = 1; cpRenderTargets();
    });
    $("targetTableBody").addEventListener("click", e => {
      const toggle = e.target.closest("[data-tgt-toggle]"); if (!toggle) return;
      const target = cpTargets[+toggle.dataset.tgtToggle];
      target.status = (target.status || "启用") === "启用" ? "停用" : "启用";
      cpRenderTargets(); cpToast(`推送目标「${target.name}」已${target.status === "启用" ? "开启" : "关闭"}`);
    });

    function cpOpenTargetModal() {
      ["tgtName", "tgtBucket", "tgtRegion", "tgtEndpoint", "tgtAk", "tgtSk"].forEach(id => { const el = $(id); if (el) el.value = ""; });
      $("tgtName").closest(".form-field").classList.remove("invalid");
      $("cpTargetModal").classList.add("open");
    }
    window.cpOpenTargetModal = cpOpenTargetModal;
    $("addTargetBtn").addEventListener("click", cpOpenTargetModal);
    $("tgtCancel").addEventListener("click", () => $("cpTargetModal").classList.remove("open"));
    $("tgtSave").addEventListener("click", () => {
      const name = $("tgtName").value.trim(); if (!name) { $("tgtName").closest(".form-field").classList.add("invalid"); return; }
      if (!$("tgtBucket").value.trim()) { cpToast("请填写存储桶名称（bucket_name）"); return; }
      cpTargets.push({ name, bucket: $("tgtBucket").value.trim(), region: $("tgtRegion").value.trim(), endpoint: $("tgtEndpoint").value.trim(), ak: $("tgtAk").value.trim(), sk: $("tgtSk").value ? "********" : "", refs: 0, last: "尚未使用", status: "启用" });
      $("cpTargetModal").classList.remove("open"); cpRenderTargets(); cpToast(`推送渠道「${name}」已保存`);
    });

    window.cpVueBridge = {
      packages: cpPackages,
      targets: cpTargets,
      tables: cpTables,
      users: () => window.simpleUsers || [],
      nextAudId,
      previewAudId,
      buildRuns,
      formatRunDuration,
      describePackageRule,
      tableCn,
      fieldCn,
      packageOutputField,
      packageDelivery,
      packageFreq,
      packageSchedule,
      wan,
      formatSqlText,
      highlightSqlSyntax,
      detectSqlOutputConfig,
      toast: cpToast,
      setPage: window.setSimplePage,
      getEditingIndex: () => cpEditingIndex,
      setEditingIndex: value => { cpEditingIndex = value; }
    };

    cpRenderList();
  })();
  
