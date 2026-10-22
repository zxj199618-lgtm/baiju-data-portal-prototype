/**
 * 「权益-账号维度消耗统计表」的示例数据（原型用）。
 *
 * 结构对齐生产物化视图 prod_equity.ads_equity_union_order_account_cost_stat_mv 的 56 个字段，
 * 数据是按固定随机种子生成的示例值，不是真实业务数据；接入真实数据源后，这张表由数据源替换，
 * Skill 规范、语义层指标和评测用例都不需要改。
 *
 * 示例里埋了几条故事线，方便验证诊断类问题：
 *  - 伯都主号（常规套餐）最近 7 天提单签约率明显下滑、消耗上涨；
 *  - 达人号B 最近 3 天停投（消耗为 0）；
 *  - 另有少量「其他套餐」行，用来验证「只取常规套餐与三方支付套餐」的固定口径。
 */

const TABLE_NAME = "权益-账号维度消耗统计表";
const DAYS = 30;

const FIELDS = [
  { name: "head_data_date", type: "DATE", comment: "统计日期：订单侧为队列首单日，消耗侧为消耗发生日（两条时间主轴）" },
  { name: "head_data_hour", type: "INT", comment: "统计小时 0–23；订单侧是首单小时，消耗侧是消耗小时。示例数据按日粒度，恒为 0" },
  { name: "platform_name", type: "VARCHAR", comment: "渠道（投放平台）" },
  { name: "platform_source", type: "VARCHAR", comment: "平台渠道（二级来源）" },
  { name: "account_id", type: "VARCHAR", comment: "广告账号 id；业务常说的「存量」「子墨」指 account_id = '白驹存量'" },
  { name: "adgroup_id", type: "VARCHAR", comment: "广告组 id" },
  { name: "optimize_user_name", type: "VARCHAR", comment: "优化师姓名" },
  { name: "optimize_account", type: "VARCHAR", comment: "优化师_账号（派生列）" },
  { name: "department", type: "VARCHAR", comment: "部门；归属口径见 Skill 规范（任哥 = 投放一部权益一组 + 二组）" },
  { name: "main_body", type: "VARCHAR", comment: "主体名称（签约主体）" },
  { name: "medium", type: "VARCHAR", comment: "媒体（流量媒体）" },
  { name: "pay_category", type: "VARCHAR", comment: "支付大类，如 银联、支付宝" },
  { name: "aggregation_commodity_type", type: "VARCHAR", comment: "聚合套餐类型：银联聚合、聚合套餐、直投" },
  { name: "aggregation_commodity_code", type: "VARCHAR", comment: "聚合套餐编码（常为 NULL）" },
  { name: "aggregation_commodity_name", type: "VARCHAR", comment: "聚合套餐名称（常为 NULL）" },
  { name: "commodity_classify", type: "VARCHAR", comment: "套餐分类（中文）：常规套餐 = 自营；三方支付套餐 = 三方 / CPA；分析只取这两类" },
  { name: "commodity_code", type: "VARCHAR", comment: "套餐编码（聚合包显示聚合包编码，直投显示单品编码）" },
  { name: "commodity_name", type: "VARCHAR", comment: "套餐名称" },
  { name: "jz_strategy_code", type: "VARCHAR", comment: "加载分流编码" },
  { name: "jz_name", type: "VARCHAR", comment: "加载分流名称" },
  { name: "rule_report_node", type: "VARCHAR", comment: "上报节点：支付成功 / 签约成功，决定佣金按哪个事件结算" },
  { name: "is_renew", type: "VARCHAR", comment: "是否续费：是 / 否（首单与续费分行）" },
  { name: "pay_merchant", type: "VARCHAR", comment: "恒为 NULL，不可用于筛选或分组" },
  { name: "pay_merchant_name", type: "VARCHAR", comment: "恒为 NULL，不可用于筛选或分组" },
  { name: "pay_channel", type: "VARCHAR", comment: "恒为 NULL，不可用于筛选或分组" },
  { name: "order_cnt", type: "BIGINT", comment: "总订单数（按 order_id 去重，不过滤任何状态）" },
  { name: "valid_order_cnt", type: "BIGINT", comment: "有效提单数（排除下单失败）" },
  { name: "contract_order_cnt", type: "BIGINT", comment: "签约订单数（仅常规套餐有意义）" },
  { name: "success_order_cnt", type: "BIGINT", comment: "支付成功订单数" },
  { name: "off_contract_order_cnt", type: "BIGINT", comment: "解约订单数（要求支付成功）" },
  { name: "refund_order_cnt", type: "BIGINT", comment: "退款订单数（要求支付成功）" },
  { name: "user_cnt", type: "BIGINT", comment: "总用户数（分组内按手机号去重，跨行相加会重复）" },
  { name: "valid_user_cnt", type: "BIGINT", comment: "有效提单用户数（用户计数，不可跨行累加）" },
  { name: "contract_user_cnt", type: "BIGINT", comment: "签约用户数（仅常规套餐有意义；用户计数，不可跨行累加）" },
  { name: "success_user_cnt", type: "BIGINT", comment: "成功用户数（支付成功；用户计数，不可跨行累加）" },
  { name: "off_contract_user_cnt", type: "BIGINT", comment: "解约用户数（用户计数，不可跨行累加）" },
  { name: "refund_user_cnt", type: "BIGINT", comment: "退款用户数（用户计数，不可跨行累加）" },
  { name: "report_user_cnt", type: "BIGINT", comment: "上报用户数（不要求支付成功）" },
  { name: "faild_pay_user_cnt", type: "BIGINT", comment: "扣费失败用户数（已签约但支付失败）" },
  { name: "paid_user_cnt", type: "BIGINT", comment: "发起扣费用户数（不区分成败）" },
  { name: "valid_success_user_cnt", type: "BIGINT", comment: "有效用户数（成功、未解约、未退款），留存分析的核心指标" },
  { name: "success_user_cnt_2h", type: "BIGINT", comment: "近 8 小时内成功用户数（字段名 _2h 是历史遗留；2026-09-21 之前等于 success_user_cnt）" },
  { name: "success_order_cnt_2h", type: "BIGINT", comment: "近 8 小时内成功订单数（口径断点同上）" },
  { name: "cash_cost", type: "DECIMAL(18,2)", comment: "现金消耗（元），已含无订单消耗；消耗类指标默认用它" },
  { name: "book_cost", type: "DECIMAL(18,2)", comment: "账面消耗（元）= 现金消耗 × 账面折算系数" },
  { name: "out_source_cost", type: "DECIMAL(18,2)", comment: "外放成本（元），订单侧口径" },
  { name: "view_count", type: "BIGINT", comment: "曝光数（平台回传）" },
  { name: "click_count", type: "BIGINT", comment: "点击数（平台回传）" },
  { name: "conversion_count", type: "BIGINT", comment: "转化数（平台回传口径，不等于站内支付成功）" },
  { name: "pay_amount", type: "DECIMAL(18,2)", comment: "订单实付金额（元）；自营收入口径" },
  { name: "refund_amount", type: "DECIMAL(18,2)", comment: "退款金额（元）" },
  { name: "fee_price", type: "DECIMAL(18,2)", comment: "支付渠道手续费（元）" },
  { name: "refund_fee_price", type: "DECIMAL(18,2)", comment: "退款退回的手续费（元）" },
  { name: "real_pay_amount", type: "DECIMAL(18,2)", comment: "实际订单收入（元）= 扣退款、扣手续费、乘分成比例后的净额" },
  { name: "report_reward", type: "DECIMAL(18,2)", comment: "佣金（元）；三方 CPA 的收入口径" },
  { name: "mv_update_time", type: "DATETIME", comment: "视图刷新时间，用来判断数据是否新鲜（不是业务发生时间）" }
];

/** 固定种子的随机数，保证示例数据可复现 */
function seeded(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6D2B79F5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const ACCOUNTS = [
  { id: "达人号A", department: "达人部门-权益", user: "周一", platform: "巨量", scale: 1.0 },
  { id: "达人号B", department: "达人部门-权益", user: "周一", platform: "快手", scale: 0.8, stopsLast: 3 },
  { id: "伯都主号", department: "伯都-权益", user: "吴迪", platform: "巨量", scale: 1.6, dropsLast: 7 },
  { id: "伯都二号", department: "伯都-权益", user: "吴迪", platform: "广点通", scale: 0.7 },
  { id: "任哥一组-1", department: "投放一部-权益一组", user: "任杰", platform: "巨量", scale: 1.3 },
  { id: "任哥一组-2", department: "投放一部-权益一组", user: "任杰", platform: "快手", scale: 0.9 },
  { id: "任哥二组-1", department: "投放一部-权益二组", user: "任杰", platform: "广点通", scale: 1.1 },
  { id: "白驹存量", department: "存量运营-权益", user: "子墨", platform: "巨量", scale: 0.6 }
];

const dayBack = (anchor, offset) => new Date(Date.parse(`${anchor}T00:00:00Z`) - offset * 86400000).toISOString().slice(0, 10);

/**
 * @param {string} anchor 最新数据日（YYYY-MM-DD）
 * @returns {object[]} 行，字段与 FIELDS 一致
 */
function generate(anchor) {
  const random = seeded(20260921);
  const between = (low, high) => low + (high - low) * random();
  const rows = [];

  const emptyRow = (date, account, classify, renew) => {
    const commodity = classify === "常规套餐"
      ? { type: "直投", code: "EQ-A100", name: "权益月卡 29.9", aggCode: null, aggName: null, node: "签约成功", pay: "支付宝" }
      : classify === "三方支付套餐"
        ? { type: "银联聚合", code: "AGG-U200", name: "银联聚合包", aggCode: "AGG-U200", aggName: "银联聚合包", node: "支付成功", pay: "银联" }
        : { type: "直投", code: "EQ-Z900", name: "其他套餐（示例）", aggCode: null, aggName: null, node: "支付成功", pay: "支付宝" };
    return {
      head_data_date: date, head_data_hour: 0,
      platform_name: account.platform, platform_source: `${account.platform}-信息流`,
      account_id: account.id, adgroup_id: `${account.id}-G${renew === "否" ? 1 : 2}`,
      optimize_user_name: account.user, optimize_account: `${account.user}_${account.id}`,
      department: account.department, main_body: "示例主体", medium: account.platform, pay_category: commodity.pay,
      aggregation_commodity_type: commodity.type, aggregation_commodity_code: commodity.aggCode, aggregation_commodity_name: commodity.aggName,
      commodity_classify: classify, commodity_code: commodity.code, commodity_name: commodity.name,
      jz_strategy_code: "JZ-01", jz_name: "默认分流", rule_report_node: commodity.node, is_renew: renew,
      pay_merchant: null, pay_merchant_name: null, pay_channel: null,
      order_cnt: 0, valid_order_cnt: 0, contract_order_cnt: 0, success_order_cnt: 0, off_contract_order_cnt: 0, refund_order_cnt: 0,
      user_cnt: 0, valid_user_cnt: 0, contract_user_cnt: 0, success_user_cnt: 0, off_contract_user_cnt: 0, refund_user_cnt: 0,
      report_user_cnt: 0, faild_pay_user_cnt: 0, paid_user_cnt: 0, valid_success_user_cnt: 0, success_user_cnt_2h: 0, success_order_cnt_2h: 0,
      cash_cost: 0, book_cost: 0, out_source_cost: 0, view_count: 0, click_count: 0, conversion_count: 0,
      pay_amount: 0, refund_amount: 0, fee_price: 0, refund_fee_price: 0, real_pay_amount: 0, report_reward: 0,
      mv_update_time: date === anchor ? `${date} 18:30:00` : `${date} 23:30:00`
    };
  };

  const money = value => Number(value.toFixed(2));

  for (let offset = DAYS - 1; offset >= 0; offset -= 1) {
    const date = dayBack(anchor, offset);
    const index = DAYS - 1 - offset;
    const daysFromEnd = offset; // 0 = 最新一天
    const weekly = 1 + 0.1 * Math.sin((index % 7) / 7 * Math.PI * 2);

    for (const account of ACCOUNTS) {
      const stopped = account.stopsLast && daysFromEnd < account.stopsLast;
      const dropping = account.dropsLast && daysFromEnd < account.dropsLast;
      const baseCost = 5200 * account.scale * weekly * between(0.9, 1.1) * (dropping ? 1.2 : 1);

      // —— 常规套餐 · 首单行（带消耗与漏斗）——
      const selfRow = emptyRow(date, account, "常规套餐", "否");
      if (!stopped) {
        const cost = baseCost;
        const view = Math.round(cost / between(26, 34) * 1000);
        const click = Math.round(view * between(0.018, 0.024));
        const conversion = Math.round(click * between(0.2, 0.26));
        const users = Math.round(conversion * between(0.5, 0.6));
        const valid = Math.round(users * between(0.82, 0.88));
        const signRate = (dropping ? between(0.22, 0.26) : between(0.33, 0.38));
        const contract = Math.round(valid * signRate);
        const success = Math.round(contract * between(0.78, 0.84));
        const off = Math.round(success * between(0.1, 0.14));
        const refund = Math.round(success * between(0.02, 0.04));
        const validSuccess = Math.max(0, success - off - refund);
        const pay = success * 29.9;
        const refundAmount = refund * 29.9;
        const fee = pay * 0.006;
        Object.assign(selfRow, {
          order_cnt: Math.round(users * 1.15), valid_order_cnt: Math.round(valid * 1.05), contract_order_cnt: contract, success_order_cnt: success,
          off_contract_order_cnt: off, refund_order_cnt: refund,
          user_cnt: users, valid_user_cnt: valid, contract_user_cnt: contract, success_user_cnt: success, off_contract_user_cnt: off, refund_user_cnt: refund,
          report_user_cnt: Math.round(success * 0.95), faild_pay_user_cnt: Math.max(0, contract - success), paid_user_cnt: contract, valid_success_user_cnt: validSuccess,
          success_user_cnt_2h: success, success_order_cnt_2h: success, // 2026-09-21 之前这两列等于全量成功数
          cash_cost: money(cost), book_cost: money(cost * 1.04), out_source_cost: 0,
          view_count: view, click_count: click, conversion_count: conversion,
          pay_amount: money(pay), refund_amount: money(refundAmount), fee_price: money(fee), refund_fee_price: money(refundAmount * 0.006),
          real_pay_amount: money(((pay - refundAmount) - (fee - refundAmount * 0.006)) * 0.97), report_reward: money(success * 3)
        });
      }
      rows.push(selfRow);

      // —— 常规套餐 · 续费行（只有订单与收入，没有消耗）——
      const renewRow = emptyRow(date, account, "常规套餐", "是");
      {
        const renewSuccess = Math.round(account.scale * between(55, 75) * (stopped ? 0.9 : 1));
        const pay = renewSuccess * 29.9;
        Object.assign(renewRow, {
          order_cnt: renewSuccess, valid_order_cnt: renewSuccess, contract_order_cnt: renewSuccess, success_order_cnt: renewSuccess,
          user_cnt: renewSuccess, valid_user_cnt: renewSuccess, contract_user_cnt: renewSuccess, success_user_cnt: renewSuccess,
          valid_success_user_cnt: Math.round(renewSuccess * 0.96), paid_user_cnt: renewSuccess, report_user_cnt: renewSuccess,
          success_user_cnt_2h: renewSuccess, success_order_cnt_2h: renewSuccess,
          pay_amount: money(pay), fee_price: money(pay * 0.006), real_pay_amount: money(pay * 0.994 * 0.97)
        });
      }
      rows.push(renewRow);

      // —— 三方支付套餐 · 首单行（CPA 模式：看成功用户与佣金，没有签约漏斗）——
      if (account.id !== "白驹存量") {
        const thirdRow = emptyRow(date, account, "三方支付套餐", "否");
        if (!stopped) {
          const cost = baseCost * 0.55;
          const view = Math.round(cost / between(24, 32) * 1000);
          const click = Math.round(view * between(0.02, 0.028));
          const conversion = Math.round(click * between(0.22, 0.3));
          const success = Math.round(conversion * between(0.3, 0.38));
          Object.assign(thirdRow, {
            order_cnt: Math.round(success * 1.3), valid_order_cnt: Math.round(success * 1.1), success_order_cnt: success,
            user_cnt: Math.round(success * 1.3), valid_user_cnt: Math.round(success * 1.1), success_user_cnt: success, valid_success_user_cnt: success,
            report_user_cnt: success, paid_user_cnt: success, success_user_cnt_2h: success, success_order_cnt_2h: success,
            cash_cost: money(cost), book_cost: money(cost * 1.03), out_source_cost: money(success * 2),
            view_count: view, click_count: click, conversion_count: conversion,
            pay_amount: money(success * 9.9), fee_price: money(success * 0.06), real_pay_amount: money(success * 9.9 * 0.99 * 0.97),
            report_reward: money(success * 18)
          });
        }
        rows.push(thirdRow);
      }

      // —— 业务口径之外的其他套餐：少量数据，分析时必须被过滤掉 ——
      if (account.scale >= 1 && !stopped) {
        const other = emptyRow(date, account, "其他套餐", "否");
        const success = Math.round(between(3, 8));
        Object.assign(other, {
          order_cnt: success, valid_order_cnt: success, success_order_cnt: success, user_cnt: success, valid_user_cnt: success, success_user_cnt: success,
          cash_cost: money(between(200, 400)), pay_amount: money(success * 49), real_pay_amount: money(success * 49 * 0.95)
        });
        rows.push(other);
      }
    }
  }
  return rows;
}

module.exports = { TABLE_NAME, FIELDS, generate, ACCOUNTS };
