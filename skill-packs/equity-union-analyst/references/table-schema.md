# 表结构与字段字典

## §1　表基本信息

| 项目 | 值 |
|---|---|
| 表名 | `prod_equity.ads_equity_union_order_account_cost_stat_mv` |
| 中文名 | 权益-账号维度消耗统计表 |
| 类型 | StarRocks 异步物化视图（`REFRESH ASYNC`） |
| 分布键 | `HASH(account_id)`，3 副本 |
| 分区 | **无分区**。查询必须带 `head_data_date` 过滤，否则全表扫描 |
| 上流 | `prod_equity.dws_equity_com_order_profit_detail_mv` LEFT JOIN `prod_equity.dim_equity_com_pay_channel_merchant_ratio_monthly` |
| 粒度 | 账号 × 广告组 × 小时 × 套餐 × 优化师 × 部门 × 媒体 …共 21 个维度 |
| 字段数 | 56 |
| 数据时效 | 看 `mv_update_time`（视图刷新时刻），非订单落库时刻 |

## §2　血缘结构：为什么订单和消耗不是同一天

视图内部先构造宽明细 `t1`，再分两路聚合，最后 `FULL OUTER JOIN`：

```
dws_equity_com_order_profit_detail_mv (a)
        │  LEFT JOIN 月度分成比例表 (b)
        ▼
       t1 ──┬──► od 路：按 coalesce(date(head_create_time), data_date) 分组
            │          head_create_time = min(create_time) OVER (PARTITION BY coalesce(queue_id, contract_head_order_id, order_id))
            │          → 产出所有订单/用户计数、金额类指标
            │
            └──► ct 路：按 data_date / data_hour 分组
                       → 产出消耗、账面消耗、曝光/点击/转化

od  FULL OUTER JOIN  ct    ON 21 个维度等值（ct.data_date = od.head_data_date 等）
        │
        ▼
   coalesce 互补 → 最终 56 列
```

**关键结论：**

1. `head_create_time` 是「同一队列内最早那笔订单的创建时间」，即**首单时间**。同一队列的首单与全部续费单共享同一个 `head_create_time`，因此订单侧全部归到首单日。
2. 消耗侧归到**实际投放消耗那天**。
3. 两条主轴的日期如果不同，`FULL OUTER JOIN` 关联不上，会裂成两行：一行只有订单、一行只有消耗，靠 `coalesce(...,0)` 补零。**按周期汇总时两侧都齐全，按日看会错位。**
4. `head_data_hour` 同理：订单侧是首单小时，消耗侧是消耗小时。**小时级只能看消耗，不能看转化。**

## §3　恒为 NULL 的三列（死列）

| 列名 | 视图中的表达式 | 后果 |
|---|---|---|
| `pay_merchant` | `NULL AS pay_merchant` | 恒 NULL |
| `pay_merchant_name` | `NULL AS pay_merchant_name` | 恒 NULL |
| `pay_channel` | `NULL AS pay_channel` | 恒 NULL |

原因是 ct 路的分组维度里没有这三列，无法与 od 路对齐（od 路虽然带了原值，但为了 UNION 结构一致被强制置空）。**这三列不能用于筛选、分组、关联，也不会出现在任何有意义的统计里。** 需要商户/支付渠道维度时必须回明细表。

## §4　时间字段

| 列名 | 类型 | 含义 | 注意 |
|---|---|---|---|
| `head_data_date` | DATE | 统计日期 | 订单侧=首单日期；消耗侧=消耗日期 |
| `head_data_hour` | INT | 统计小时 0–23 | 同上，两侧错位 |
| `mv_update_time` | DATETIME | 视图刷新时间 | 判断数据是否新鲜，不是业务发生时间 |

**「今天」的定义**：`head_data_date = current_date()`。异步物化视图有刷新延迟，最新小时的数可能还没进来，回答时用 `mv_update_time` 说明数据截止时刻。

## §5　维度字段（21 个分组键 + 1 个派生）

| 列名 | 含义 | 取值/说明 | 可用性 |
|---|---|---|---|
| `platform_name` | 渠道 | 投放平台名称 | 可用 |
| `platform_source` | 平台渠道 | 平台下的二级来源 | 可用 |
| `account_id` | 广告账号 id | 投放账号。业务常说的「存量」「子墨」都指 `account_id = '白驹存量'` 这一个账号 | 可用，最细业务单元 |
| `adgroup_id` | 广告组 id | 血缘上等于明细表的 `plan_id` | 可用 |
| `optimize_user_name` | 优化师姓名 | 运营人员 | 可用 |
| `optimize_account` | 优化师_账号 | `concat(优化师, '_', 账号)` 派生列 | 可用 |
| `department` | 部门 | 归属口径见 SKILL.md 硬口径③ | 可用 |
| `main_body` | 主体名称 | 签约主体 | 可用 |
| `medium` | 媒体 | 流量媒体 | 可用 |
| `pay_category` | 支付大类 | 如 `银联`、`支付宝` | 可用 |
| `aggregation_commodity_type` | 聚合套餐类型 | 见 §5.1 | 可用 |
| `aggregation_commodity_code` | 聚合套餐编码 | NULL 常见 | 可用 |
| `aggregation_commodity_name` | 聚合套餐名称 | NULL 常见 | 可用 |
| `commodity_classify` | 套餐分类 | 见 SKILL.md 硬口径①，**分析前必须确认** | 可用 |
| `commodity_code` | 套餐编码 | 见 §5.2（已做 CASE 归一） | 可用 |
| `commodity_name` | 套餐名称 | 见 §5.2 | 可用 |
| `jz_strategy_code` | 加载分流编码 | 定向/分流规则 | 可用 |
| `jz_name` | 加载分流名称 | 同上 | 可用 |
| `rule_report_node` | 上报节点 | 见 §5.3（已做 CASE 归一） | 可用 |
| `is_renew` | 是否续费 | 通常 `是`/`否` | 可用 |
| `pay_merchant` / `pay_merchant_name` / `pay_channel` | 商户/渠道 | **恒 NULL** | ❌ 不可用 |

### §5.1　`aggregation_commodity_type` 取值

源表 `IN ('银联聚合', '聚合套餐')` 会触发套餐编码回退逻辑（见 §5.2），因此该字段直接决定 `commodity_code` 的取值来源。另见 `'直投'` 等值。**做套餐级分析时必须同时看这个字段和 `commodity_classify`，否则会把聚合包的编码当成单品的编码。**

### §5.2　`commodity_code` / `commodity_name` 已被 CASE 归一

```sql
commodity_code = CASE WHEN aggregation_commodity_type IN ('银联聚合','聚合套餐')
                      THEN aggregation_commodity_code
                      ELSE commodity_code END
commodity_name 同逻辑
```

**含义**：这两个字段是「对外展示用的套餐标识」——聚合包显示聚合包编码，直投显示单品编码。因此：

- 想统计**实际扣费的子套餐**，不能只看这两列，需结合 `aggregation_commodity_*` 一起看
- 同一 `commodity_code` 可能对应多个 `aggregation_commodity_code`（一个聚合包含多个子套餐）

### §5.3　`rule_report_node` 已被 CASE 归一

```sql
rule_report_node = CASE WHEN aggregation_commodity_type IN ('银联聚合')
                        THEN aggregation_commodity_rule_report_node
                        ELSE commodity_rule_report_node END
```

上报节点决定佣金按「支付成功」还是「签约成功」结算，**是收入口径的关键前提**：节点不同，同一个 `report_reward` 的含义不同。分析三方佣金时如果发现佣金与成功订单数对不上，先查这一列。

## §6　指标字段分组

| 分组 | 字段 |
|---|---|
| 订单计数（6） | `order_cnt`、`valid_order_cnt`、`contract_order_cnt`、`success_order_cnt`、`off_contract_order_cnt`、`refund_order_cnt` |
| 用户计数（10） | `user_cnt`、`valid_user_cnt`、`contract_user_cnt`、`success_user_cnt`、`off_contract_user_cnt`、`refund_user_cnt`、`report_user_cnt`、`faild_pay_user_cnt`、`paid_user_cnt`、`valid_success_user_cnt` |
| 近 8 小时窗口（2） | `success_user_cnt_2h`、`success_order_cnt_2h` |
| 消耗与流量（8） | `cash_cost`、`book_cost`、`out_source_cost`、`view_count`、`click_count`、`conversion_count` |
| 金额（6） | `pay_amount`、`refund_amount`、`fee_price`、`refund_fee_price`、`real_pay_amount`、`report_reward` |

每列的计算表达式与可加性判定见 `metrics.md`。

## §7　枚举值（区分来源）

**A. 视图定义中直接出现的枚举**（可确信，已与源码核对）：

| 字段 | 枚举 |
|---|---|
| `contract_status`（已归一） | `签约成功`、`解约中`、`已解约`（源表的 `阈值解约`、`自动解约` 已并入 `已解约`） |
| `order_status`（t1 内） | `支付成功`、`下单失败`，另有中间态 |
| `refund_status`（t1 内） | `未发起`、`部分退款`、`退款完成` |
| `pay_status`（t1 内） | `支付成功`、`支付失败`、`扣款失败`、`发起扣款失败` |
| `report_flag`（t1 内） | `已上报`，另有未上报态 |
| `aggregation_commodity_type` | `银联聚合`、`聚合套餐`（触发套餐编码回退），另有 `直投` 等 |

**B. 业务口径给定、视图定义中未出现字面量**：

| 字段 | 口径内的取值 | 来源 |
|---|---|---|
| `commodity_classify` | `常规套餐`（自营）、`三方支付套餐`（三方/CPA） | 业务方口径，**需用 T2 探查确认实际写法** |

业务口径**只承认上述两个值**。表中若存在其他取值，不属于分析范围：取数时直接过滤，不解读、不单列、不在结论中提及。

⚠️ `commodity_classify` 的字面量并**没有**出现在视图的 CASE 表达式里，取值来自上游 `dws_equity_com_order_profit_detail_mv`。首次分析跑 T2 的目的仅是确认这两个值的实际拼写（防止空格/别名导致漏数），不是去评估其他分类。

**C. 通用原则**：上述枚举均为「已知出现过的值」，不代表全集。任何硬编码筛选前，先用模板 T2 看真实分布。

## §8　常见误判清单

| 误判 | 事实 |
|---|---|
| 「按商户看收入」 | 三列恒 NULL，做不到 |
| 「`success_user_cnt_2h` 是近 2 小时」 | **是近 8 小时**，`_2h` 是历史命名遗留，字段注释已写明 |
| 「`book_cost` 是另一种口径的现金消耗」 | `book_cost = (cash_cost + no_order_cash_cost) × point`，`point` 是账面折算系数，账面≠现金 |
| 「`order_cnt` 包含下单失败」 | `order_cnt = COUNT(DISTINCT order_id)` 不过滤状态，`valid_order_cnt` 才排除 `下单失败` |
| 「`real_pay_amount` 等于 `pay_amount`」 | `real_pay_amount = ((pay_amount − refund_amount) − (fee_price − refund_fee_price)) × 分成比例`，已扣退款、手续费、乘分成 |
| 「`commodity_classify` 是数字」 | 本表是中文串 |
