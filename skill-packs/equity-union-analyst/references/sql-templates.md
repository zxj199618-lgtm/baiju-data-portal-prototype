# SQL 模板（StarRocks）

所有模板基于 `prod_equity.ads_equity_union_order_account_cost_stat_mv`，方言为 **StarRocks**。表无分区，必须带 `head_data_date` 过滤。

约定：
- 不写 `SELECT *`，显式列出所需列
- 比率统一 `ROUND(x / NULLIF(y, 0) * 100, 2)`，分母为 0 返回 `NULL`
- 套餐只用 `常规套餐`（自营）与 `三方支付套餐`（三方/CPA）两类，模板已内置过滤，其余取值不参与统计

---

## T1　数据新鲜度探查（每次分析前先跑）

```sql
SELECT  MAX(mv_update_time)                AS mv_update_time
        ,COUNT(1)                          AS row_cnt
        ,COUNT(DISTINCT account_id)        AS account_cnt
        ,COUNT(DISTINCT department)        AS dept_cnt
        ,MIN(head_data_date)               AS min_date
        ,MAX(head_data_date)               AS max_date
        ,ROUND(SUM(cash_cost), 2)          AS cash_cost
        ,ROUND(SUM(success_user_cnt), 0)   AS success_user_cnt
FROM    prod_equity.ads_equity_union_order_account_cost_stat_mv
WHERE   head_data_date >= date_sub(current_date(), 1)
;
```

判断：`mv_update_time` 距当前超过 2 小时 → 提示数据可能滞后。`row_cnt = 0` → 不要直接答「消耗为 0」，先查视图刷新状态。

---

## T2　维度取值探查（确认部门与套餐的真实取值）

```sql
SELECT  department
        ,commodity_classify
        ,COUNT(1)                          AS row_cnt
        ,COUNT(DISTINCT account_id)        AS account_cnt
        ,ROUND(SUM(cash_cost), 2)          AS cash_cost
        ,ROUND(SUM(success_user_cnt), 0)   AS success_user_cnt
FROM    prod_equity.ads_equity_union_order_account_cost_stat_mv
WHERE   head_data_date >= date_sub(current_date(), 7)
GROUP BY department
         ,commodity_classify
ORDER BY cash_cost DESC
;
```

用途：确认 `'达人部门-权益'`、`'伯都-权益'`、`'投放一部-权益一组'` 等值是否与预期完全一致（可能有空格/后缀变体），以及 `常规套餐` / `三方支付套餐` 这两个值的实际拼写。其他套餐分类不纳入分析，查出后忽略即可。

---

## T3　单日总量 + 核心派生指标

```sql
SELECT  head_data_date
        ,COUNT(DISTINCT account_id)                                  AS account_cnt
        ,ROUND(SUM(cash_cost), 2)                                    AS cash_cost
        ,ROUND(SUM(book_cost), 2)                                    AS book_cost
        ,ROUND(SUM(book_cost) / NULLIF(SUM(cash_cost), 0), 4)        AS book_cash_ratio
        ,SUM(valid_user_cnt)                                         AS valid_user_cnt
        ,SUM(contract_user_cnt)                                      AS contract_user_cnt
        ,SUM(success_user_cnt)                                       AS success_user_cnt
        ,SUM(valid_success_user_cnt)                                 AS valid_success_user_cnt
        ,ROUND(SUM(valid_user_cnt) * 100.0
               / NULLIF(SUM(user_cnt), 0), 2)                        AS valid_rate_pct
        ,ROUND(SUM(contract_user_cnt) * 100.0
               / NULLIF(SUM(valid_user_cnt), 0), 2)                  AS contract_rate_pct
        ,ROUND(SUM(success_user_cnt) * 100.0
               / NULLIF(SUM(contract_user_cnt), 0), 2)               AS success_rate_pct
        ,ROUND(SUM(cash_cost)
               / NULLIF(SUM(success_user_cnt), 0), 2)                AS cash_per_success_user
        ,ROUND(SUM(book_cost)
               / NULLIF(SUM(success_user_cnt), 0), 2)                AS book_per_success_user
        ,ROUND(SUM(pay_amount), 2)                                   AS pay_amount
        ,ROUND(SUM(pay_amount) / NULLIF(SUM(cash_cost), 0), 4)       AS roi_gross
FROM    prod_equity.ads_equity_union_order_account_cost_stat_mv
WHERE   head_data_date = current_date()
AND     commodity_classify = '常规套餐'
GROUP BY head_data_date
;
```

**按问题选过滤条件：**

| 问法 | `commodity_classify` 过滤 | 附加处理 |
|---|---|---|
| 「今天消耗多少」「今天跑了多少」（总量） | `IN ('常规套餐','三方支付套餐')` | 删掉 `contract_*` 与签约率列 |
| 「自营转化怎么样」（本模板默认） | `= '常规套餐'` | — |
| 「三方 CPA 跑得怎么样」 | `= '三方支付套餐'` | `pay_amount` 换成 `report_reward`，删掉 `contract_*` 列 |

签约类指标（`contract_order_cnt`、`contract_user_cnt`、提单签约率、签约成功率）**只在 `= '常规套餐'` 时可解释**，另外两种取法必须删掉这些列，不能填 0。

⚠️ **关于本模板里的用户级指标**：`SUM(valid_user_cnt)` 等是「各切片去重值之和」，跨切片会重复（见 `metrics.md` §4.3），因此它**不是全局去重人数**，只能理解为「用户人次」。但用它算的**比率**（分子分母同为累加值）在业务上是通行口径，偏差会相互抵消大部分——报告里要注明「用户数按切片去重后累加」，不要写成「总用户数」。

---

## T4　按日趋势

```sql
SELECT  head_data_date
        ,ROUND(SUM(cash_cost), 2)                                    AS cash_cost
        ,ROUND(SUM(pay_amount), 2)                                   AS pay_amount
        ,SUM(success_user_cnt)                                       AS success_user_cnt
        ,SUM(success_order_cnt)                                      AS success_order_cnt
        ,ROUND(SUM(cash_cost)
               / NULLIF(SUM(success_user_cnt), 0), 2)                AS cash_per_success_user
        ,ROUND(SUM(pay_amount) / NULLIF(SUM(cash_cost), 0), 4)       AS roi_gross
FROM    prod_equity.ads_equity_union_order_account_cost_stat_mv
WHERE   head_data_date >= date_sub(current_date(), 6)
AND     head_data_date <= current_date()
AND     commodity_classify = '常规套餐'
GROUP BY head_data_date
ORDER BY head_data_date
;
```

⚠️ 区间跨 `2026-09-21` 时，若要用 `success_user_cnt_2h`，必须标注口径断点。

---

## T5　按部门汇总（含业务别称）

```sql
SELECT  department
        ,CASE department
              WHEN '达人部门-权益'   THEN '小炭/达人部门'
              WHEN '伯都-权益'       THEN '伯都'
              WHEN '投放一部-权益一组' THEN '任哥'
              WHEN '投放一部-权益二组' THEN '任哥'
              ELSE department
         END                                                         AS dept_alias
        ,COUNT(DISTINCT account_id)                                  AS account_cnt
        ,ROUND(SUM(cash_cost), 2)                                    AS cash_cost
        ,SUM(success_user_cnt)                                       AS success_user_cnt
        ,ROUND(SUM(cash_cost)
               / NULLIF(SUM(success_user_cnt), 0), 2)                AS cash_per_success_user
        ,SUM(contract_user_cnt)                                      AS contract_user_cnt
        ,ROUND(SUM(success_user_cnt) * 100.0
               / NULLIF(SUM(contract_user_cnt), 0), 2)               AS success_rate_pct
        ,ROUND(SUM(pay_amount), 2)                                   AS pay_amount
        ,ROUND(SUM(pay_amount) / NULLIF(SUM(cash_cost), 0), 4)       AS roi_gross
FROM    prod_equity.ads_equity_union_order_account_cost_stat_mv
WHERE   head_data_date = current_date()
AND     commodity_classify = '常规套餐'
GROUP BY department
ORDER BY cash_cost DESC
;
```

查「任哥」时，改为 `WHERE department IN ('投放一部-权益一组','投放一部-权益二组')`。

---

## T5b　按账号汇总（存量 / 子墨）

用途：「存量」「子墨」指同一个账号 `白驹存量`，与部门口径不同 —— 是**账号口径**，不含投放一部其他账号。

```sql
SELECT  account_id
        ,MAX(department)                                              AS department
        ,MAX(optimize_user_name)                                      AS optimize_user_name
        ,COUNT(DISTINCT head_data_date)                               AS active_days
        ,ROUND(SUM(cash_cost), 2)                                     AS cash_cost
        ,SUM(success_user_cnt)                                        AS success_user_cnt
        ,ROUND(SUM(cash_cost)
               / NULLIF(SUM(success_user_cnt), 0), 2)                 AS cash_per_success_user
        ,SUM(contract_user_cnt)                                       AS contract_user_cnt
        ,SUM(valid_user_cnt)                                          AS valid_user_cnt
        ,ROUND(SUM(contract_user_cnt) * 100.0
               / NULLIF(SUM(valid_user_cnt), 0), 2)                   AS contract_rate_pct
        ,ROUND(SUM(success_user_cnt) * 100.0
               / NULLIF(SUM(contract_user_cnt), 0), 2)                AS success_rate_pct
        ,ROUND(SUM(pay_amount), 2)                                    AS pay_amount
        ,ROUND(SUM(real_pay_amount), 2)                               AS real_pay_amount
        ,ROUND(SUM(pay_amount) / NULLIF(SUM(cash_cost), 0), 4)        AS roi_gross
FROM    prod_equity.ads_equity_union_order_account_cost_stat_mv
WHERE   head_data_date = current_date()
AND     commodity_classify = '常规套餐'
AND     account_id = '白驹存量'
GROUP BY account_id
;
```

> 用 `MAX(department)` / `MAX(optimize_user_name)` 而不是放进 `GROUP BY`：一个账号可能对应多个优化师，放分组键会把单账号拆成多行。需要看优化师明细时改成 `GROUP BY account_id, optimize_user_name`。

⚠️ 用户说「白驹」而没说明是部门还是账号时，**不要默认套用本模板**：先反问，同时把 T5（部门口径）和 T5b（账号口径）两个结果并列给出。

---

## T6　账号效率排名（含小样本过滤）

```sql
SELECT  account_id
        ,department
        ,optimize_user_name
        ,ROUND(SUM(cash_cost), 2)                                    AS cash_cost
        ,SUM(success_user_cnt)                                       AS success_user_cnt
        ,ROUND(SUM(cash_cost)
               / NULLIF(SUM(success_user_cnt), 0), 2)                AS cash_per_success_user
        ,ROUND(SUM(valid_user_cnt) * 100.0
               / NULLIF(SUM(user_cnt), 0), 2)                        AS valid_rate_pct
        ,ROUND(SUM(contract_user_cnt) * 100.0
               / NULLIF(SUM(valid_user_cnt), 0), 2)                  AS contract_rate_pct
        ,ROUND(SUM(success_user_cnt) * 100.0
               / NULLIF(SUM(contract_user_cnt), 0), 2)               AS success_rate_pct
        ,ROUND(SUM(pay_amount) / NULLIF(SUM(cash_cost), 0), 4)       AS roi_gross
FROM    prod_equity.ads_equity_union_order_account_cost_stat_mv
WHERE   head_data_date >= date_sub(current_date(), 6)
AND     commodity_classify = '常规套餐'
GROUP BY account_id
         ,department
         ,optimize_user_name
HAVING  SUM(success_user_cnt) >= 5          -- 过滤小样本，避免 1/1=100% 霸榜
ORDER BY cash_per_success_user
;
```

`HAVING` 阈值按业务量调整；报告里要说明「已过滤成功用户数 < 5 的账号」。

---

## T7　转化漏斗（自营）

```sql
SELECT  ROUND(SUM(view_count), 0)                                    AS view_count
        ,ROUND(SUM(click_count), 0)                                  AS click_count
        ,ROUND(SUM(conversion_count), 0)                             AS conversion_count
        ,SUM(valid_user_cnt)                                         AS valid_user_cnt
        ,SUM(contract_user_cnt)                                      AS contract_user_cnt
        ,SUM(success_user_cnt)                                       AS success_user_cnt
        ,SUM(valid_success_user_cnt)                                 AS valid_success_user_cnt
        ,ROUND(SUM(click_count) * 100.0
               / NULLIF(SUM(view_count), 0), 2)                      AS ctr_pct
        ,ROUND(SUM(conversion_count) * 100.0
               / NULLIF(SUM(click_count), 0), 2)                     AS cvr_platform_pct
        ,ROUND(SUM(valid_user_cnt) * 100.0
               / NULLIF(SUM(user_cnt), 0), 2)                        AS valid_rate_pct
        ,ROUND(SUM(contract_user_cnt) * 100.0
               / NULLIF(SUM(valid_user_cnt), 0), 2)                  AS contract_rate_pct
        ,ROUND(SUM(success_user_cnt) * 100.0
               / NULLIF(SUM(contract_user_cnt), 0), 2)               AS success_rate_pct
        ,ROUND(SUM(valid_success_user_cnt) * 100.0
               / NULLIF(SUM(success_user_cnt), 0), 2)                AS retain_rate_pct
FROM    prod_equity.ads_equity_union_order_account_cost_stat_mv
WHERE   head_data_date >= date_sub(current_date(), 6)
AND     commodity_classify = '常规套餐'
;
```

⚠️ 前三级（曝光/点击/转化）按消耗日，后四级按首单日，**不同轴**。结论中必须说明，不能当成同一天的完整漏斗。

---

## T8　自营 vs 三方对比

```sql
SELECT  commodity_classify
        ,ROUND(SUM(cash_cost), 2)                                    AS cash_cost
        ,SUM(success_user_cnt)                                       AS success_user_cnt
        ,SUM(success_order_cnt)                                      AS success_order_cnt
        ,ROUND(SUM(cash_cost)
               / NULLIF(SUM(success_user_cnt), 0), 2)                AS cash_per_success_user
        ,ROUND(SUM(pay_amount), 2)                                   AS pay_amount
        ,ROUND(SUM(report_reward), 2)                                AS report_reward
        ,ROUND(CASE WHEN commodity_classify = '常规套餐'
                    THEN SUM(pay_amount) ELSE SUM(report_reward) END
               / NULLIF(SUM(cash_cost), 0), 4)                       AS roi_by_caliber
FROM    prod_equity.ads_equity_union_order_account_cost_stat_mv
WHERE   head_data_date >= date_sub(current_date(), 6)
AND     commodity_classify IN ('常规套餐', '三方支付套餐')
GROUP BY commodity_classify
;
```

`roi_by_caliber` 会自动按类型选分子：自营用 `pay_amount`、三方用 `report_reward`。**不要跨类型相加收入。**

---

## T9　环比（日 / 周 / 月）

```sql
WITH agg AS (
    SELECT  CASE WHEN head_data_date >= date_sub(current_date(), 6)
                 THEN 'this_week' ELSE 'last_week' END                AS period
            ,SUM(cash_cost)                                          AS cash_cost
            ,SUM(success_user_cnt)                                   AS success_user_cnt
            ,SUM(pay_amount)                                         AS pay_amount
    FROM    prod_equity.ads_equity_union_order_account_cost_stat_mv
    WHERE   head_data_date >= date_sub(current_date(), 13)
    AND     head_data_date <= current_date()
    AND     commodity_classify = '常规套餐'
    GROUP BY CASE WHEN head_data_date >= date_sub(current_date(), 6)
                  THEN 'this_week' ELSE 'last_week' END
)
SELECT  ROUND(MAX(CASE WHEN period = 'this_week' THEN cash_cost END), 2)          AS cash_this
        ,ROUND(MAX(CASE WHEN period = 'last_week' THEN cash_cost END), 2)         AS cash_last
        ,ROUND((MAX(CASE WHEN period = 'this_week' THEN cash_cost END)
                - MAX(CASE WHEN period = 'last_week' THEN cash_cost END)) * 100.0
               / NULLIF(MAX(CASE WHEN period = 'last_week' THEN cash_cost END), 0), 2) AS cash_wow_pct
        ,ROUND(MAX(CASE WHEN period = 'this_week' THEN success_user_cnt END)
               / NULLIF(MAX(CASE WHEN period = 'last_week' THEN success_user_cnt END), 0) - 1, 4)
                                                                                  AS user_wow
        ,ROUND(MAX(CASE WHEN period = 'this_week' THEN pay_amount END)
               / NULLIF(MAX(CASE WHEN period = 'last_week' THEN pay_amount END), 0) - 1, 4)
                                                                                  AS revenue_wow
FROM    agg
;
```

---

## T10　小时级消耗（仅消耗，不含转化）

```sql
SELECT  head_data_hour
        ,ROUND(SUM(cash_cost), 2)                                    AS cash_cost
        ,ROUND(SUM(view_count), 0)                                   AS view_count
        ,ROUND(SUM(click_count), 0)                                  AS click_count
        ,ROUND(SUM(book_cost), 2)                                    AS book_cost
FROM    prod_equity.ads_equity_union_order_account_cost_stat_mv
WHERE   head_data_date = current_date()
AND     commodity_classify IN ('常规套餐', '三方支付套餐')
GROUP BY head_data_hour
ORDER BY head_data_hour
;
```

**不要在这个模板里加 `success_user_cnt` 等转化指标**——`head_data_hour` 在订单侧是首单小时、消耗侧是消耗小时，两者错位。

---

## T11　订单数可加性抽检（需明细表权限，可选）

本表已按 21 维度聚合，丢失了 `order_id`，因此**无法自证**订单数是否可加。需要回明细表对比：

```sql
-- 在 MaxCompute / 明细表侧执行，与本表 SUM(order_cnt) 对比
SELECT  COUNT(DISTINCT order_id) AS order_cnt_dwd
FROM    dwd_equity_shop_profit_detail_f_d
WHERE   dt = '${bizdate}'
AND     account_id = '目标账号'
AND     commodity_classify = '常规套餐'
;
```

若本表 `SUM(order_cnt)` 明显大于 `order_cnt_dwd`，说明同一订单在明细里有多行，跨维度 `SUM` 会高估。此时订单数只能按单一切片使用。

---

## T12　异常日检测

```sql
WITH daily AS (
    SELECT  head_data_date
            ,SUM(cash_cost)             AS cash_cost
            ,SUM(success_user_cnt)      AS success_user_cnt
    FROM    prod_equity.ads_equity_union_order_account_cost_stat_mv
    WHERE   head_data_date >= date_sub(current_date(), 29)
    AND     commodity_classify = '常规套餐'
    GROUP BY head_data_date
)
SELECT  head_data_date
        ,ROUND(cash_cost, 2)                                        AS cash_cost
        ,success_user_cnt
        ,ROUND(AVG(cash_cost) OVER (), 2)                            AS avg_30d
        ,ROUND(STDDEV(cash_cost) OVER (), 2)                         AS std_30d
        ,ROUND((cash_cost - AVG(cash_cost) OVER ())
               / NULLIF(STDDEV(cash_cost) OVER (), 0), 2)            AS z_score
FROM    daily
WHERE   ABS((cash_cost - AVG(cash_cost) OVER ())
            / NULLIF(STDDEV(cash_cost) OVER (), 0)) >= 2
ORDER BY head_data_date
;
```

返回 `|z| ≥ 2` 的异常日。检测到异常后进入 playbook §8 做维度下钻。

---

## T13　套餐结构（同时看聚合包与单品）

```sql
SELECT  aggregation_commodity_type
        ,aggregation_commodity_code
        ,commodity_code
        ,commodity_name
        ,ROUND(SUM(cash_cost), 2)                                    AS cash_cost
        ,SUM(success_user_cnt)                                       AS success_user_cnt
        ,ROUND(SUM(cash_cost)
               / NULLIF(SUM(success_user_cnt), 0), 2)                AS cash_per_success_user
        ,ROUND(SUM(valid_success_user_cnt) * 100.0
               / NULLIF(SUM(success_user_cnt), 0), 2)                AS retain_rate_pct
FROM    prod_equity.ads_equity_union_order_account_cost_stat_mv
WHERE   head_data_date >= date_sub(current_date(), 6)
AND     commodity_classify = '常规套餐'
GROUP BY aggregation_commodity_type
         ,aggregation_commodity_code
         ,commodity_code
         ,commodity_name
ORDER BY cash_cost DESC
;
```

`commodity_code` 已被视图做 CASE 归一（聚合包显示聚合包编码），因此**必须同时带上 `aggregation_commodity_code`**，否则看不到实际扣费的子套餐。
