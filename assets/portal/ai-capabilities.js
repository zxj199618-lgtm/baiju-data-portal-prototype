/**
 * 灵犀智析「能力导览」的内容与纯函数：欢迎页能力卡片、能力抽屉、详情弹层都读这里。
 * 依赖 core.js（window.PortalVue）；必须先于 page-analysis-workbench.js 加载。
 *
 * 注意：每项的 summary / boundary / example 是起草的文案，**待业务方确认事实后再对外**。
 * 视频：把 Muse 生成的文件放到 assets/guide/，再给对应项加 video: { src, poster, duration }；没有 video 的只显示图文。
 */
(() => {
  "use strict";
  if (!window.PortalVue) return;

  const GROUPS = [
    { key: "can", label: "直接能做" },
    { key: "need", label: "要你补充信息" },
    { key: "cannot", label: "暂时做不了" }
  ];

  const steps = (id, texts) => texts.map((text, index) => ({ image: `assets/guide/${id}-${index + 1}.svg`, text }));

  const list = [
    {
      id: "trend", group: "can", skillKey: "data-query", icon: "trend", title: "看趋势",
      summary: "说清楚看什么指标、什么时间，我会选合适的表和图。",
      example: "近 7 天各媒体消耗怎么变化？",
      boundary: "只能查你有权限的数据表，数据按日更新。",
      steps: steps("trend", ["在输入框里说出指标和时间", "系统自动选表、查数", "得到趋势图和结论，可继续追问"])
    },
    {
      id: "cause", group: "can", skillKey: "attribution", icon: "search", title: "找原因",
      summary: "指标涨了跌了，帮你拆到具体的渠道、产品或计划。",
      example: "本周 CPA 为什么涨了？",
      boundary: "能指出变化集中在哪里，但不能保证就是业务上的真实原因。",
      steps: steps("cause", ["问一个指标为什么变化", "系统按渠道、产品等维度逐层拆解", "得到贡献最大的几项，可点开看依据"])
    },
    {
      id: "caliber", group: "can", skillKey: "asset", icon: "book", title: "查口径",
      summary: "有哪些表、字段怎么算、谁负责，直接问就行。",
      example: "哪些表能看渠道归因？口径是什么？",
      boundary: "只能说明你有权限看到的表。",
      steps: steps("caliber", ["问想看的数据在哪张表", "系统检索表和字段说明", "得到表名、口径和负责人"])
    },
    {
      id: "impact", group: "can", skillKey: "lineage", icon: "share", title: "查影响",
      summary: "改一个字段或一张表之前，先看会影响哪些下游。",
      example: "如果改 tag_value 字段长度，会影响哪些下游？",
      boundary: "只覆盖已登记的血缘关系，没登记的依赖看不到。",
      steps: steps("impact", ["说出准备改的字段或表", "系统沿血缘找上下游", "得到受影响的表、任务和负责人"])
    },
    {
      id: "cross-line", group: "need", icon: "layers", title: "跨业务线分析",
      summary: "一次只能分析一条业务线，请先在输入框里选好业务线。",
      example: "近 7 天各媒体的消耗趋势",
      boundary: "要对比多条业务线，请分别提问后自己对照。",
      steps: steps("cross-line", ["点输入框里的「业务线」选一条", "再提出你的问题", "得到该业务线范围内的结果"])
    },
    {
      id: "realtime", group: "cannot", icon: "clock", title: "实时数据",
      summary: "看不了此刻正在发生的数据，只能看到已经入库的。",
      example: "昨天各媒体的消耗是多少？",
      boundary: "数据按日更新，最新到昨天。",
      steps: steps("realtime", ["问「现在」「刚刚」这类实时问题", "系统提示这类数据暂时查不到", "改问昨天或更早的数据就能得到答案"])
    },
    {
      id: "modify", group: "cannot", icon: "lock", title: "修改数据和配置",
      summary: "只能查询和分析，不能修改、删除数据，也不能改配置。",
      example: "这张表的字段口径是什么？",
      boundary: "需要改动请联系对应的数据负责人。",
      steps: steps("modify", ["提出修改或删除数据的要求", "系统说明这类操作不在能力范围内", "改成查询类问题，或联系数据负责人"])
    }
  ];

  /** Skill 列表还没加载（enabledSkillKeys 为 null）时全部显示；否则隐藏关联的 Skill 已下线的项，没有关联 Skill 的项始终保留。 */
  function visibleCapabilities(items, enabledSkillKeys) {
    if (!Array.isArray(enabledSkillKeys)) return items.slice();
    return items.filter(item => !item.skillKey || enabledSkillKeys.includes(item.skillKey));
  }

  /** 按 GROUPS 顺序分组，空组不返回。 */
  function groupCapabilities(items) {
    return GROUPS.map(group => ({ key: group.key, label: group.label, items: items.filter(item => item.group === group.key) })).filter(group => group.items.length);
  }

  /** 「试一试」填入输入框：草稿为空直接填，有草稿则追加到新的一行，不丢草稿。 */
  function mergeDraft(current, example) {
    if (!String(current || "").trim()) return example;
    return String(current).replace(/\n+$/, "") + "\n" + example;
  }

  window.PortalVue.aiCapabilities = { GROUPS, list, visibleCapabilities, groupCapabilities, mergeDraft };
})();
