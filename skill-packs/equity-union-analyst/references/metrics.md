# 指标计算说明

本文件中的「源表达式」均摘自 `ads_equity_union_order_account_cost_stat_mv` 的视图定义，可直接对应到生产代码。凡标注 `od 路` 的指标按订单侧分组（首单时间轴），`ct 路` 按消耗侧分组（消耗时间轴）。

## §1　速查总表

| 指标 | 类型 | 可加性 | 时间轴 |
|---|---|---|---|
| `order_cnt` | 订单计数 | 条件可加 | od |
| `valid_order_cnt` | 订单计数 | 条件可加 | od |
| `contract_order_cnt` | 订单计数 | 条件可加 | od |
| `success_order_cnt` | 订单计数 | 条件可加 | od |
| `off_contract_order_cnt` | 订单计数 | 条件可加 | od |
| `refund_order_cnt` | 订单计数 | 条件可加 | od |
| `user_cnt` | 用户计数 | **不可加** | od |
| `valid_user_cnt` | 用户计数 | **不可加** | od |
| `contract_user_cnt` | 用户计数 | **不可加** | od |
| `success_user_cnt` | 用户计数 | **不可加** | od |
| `off_contract_user_cnt` | 用户计数 | **不可加** | od |
| `refund_user_cnt` | 用户计数 | **不可加** | od |
| `report_user_cnt` | 用户计数 | **不可加** | od |
| `faild_pay_user_cnt` | 用户计数 | **不可加** | od |
| `paid_user_cnt` | 用户计数 | **不可加** | od |
| `valid_success_user_cnt` | 用户计数 | **不可加** | od |
| `success_user_cnt_2h` | 窗口用户计数 | **不可加**，且有口径断点 | od |
| `success_order_cnt_2h` | 窗口订单计数 | 条件可加，有断点 | od |
| `cash_cost` | 金额 | 可加 | ct |
| `book_cost` | 金额 | 可加 | ct |
| `out_source_cost` | 金额 | 可加 | od |
| `view_count` / `click_count` / `conversion_count` | 流量 | 可加 | ct |
| `pay_amount` / `refund_amount` | 金额 | 可加 | od |
| `fee_price` / `refund_fee_price` | 金额 | 可加 | od |
| `real_pay_amount` | 金额 | 可加 | od |
| `report_reward` | 金额 | 可加 | od |

「条件可加」「不可加」的判定依据见 §4。

## §2　逐指标计算说明

### §2.1　订单计数（6 个，od 路，均按 `order_id` 去重）

| 指标 | 源表达式 | 业务含义 |
|---|---|---|
| `order_cnt` | `count(DISTINCT order_id)` | 总订单数，**不过滤任何状态** |
| `valid_order_cnt` | `count(DISTINCT CASE WHEN order_status NOT IN ('下单失败') THEN order_id END)` | 有效提单数，排除下单失败 |
| `contract_order_cnt` | `count(DISTINCT CASE WHEN contract_status IN ('签约成功','解约中','已解约') THEN order_id END)` | 签约订单数，状态已归一（`阈值解约`/`自动解约` 已并入 `已解约`） |
| `success_order_cnt` | `count(DISTINCT CASE WHEN order_status = '支付成功' THEN order_id END)` | 支付成功订单数 |
| `off_contract_order_cnt` | `count(DISTINCT CASE WHEN contract_status IN ('解约中','已解约') AND order_status = '支付成功' THEN order_id END)` | 解约订单数，**要求支付成功** |
| `refund_order_cnt` | `count(DISTINCT CASE WHEN refund_status IN ('退款完成','部分退款') AND order_status = '支付成功' THEN order_id END)` | 退款订单数，**要求支付成功** |

**注意：**
- `order_cnt ≠ valid_order_cnt + 失败单` 这样的加法不成立，它们是三个互相独立的集合，不是漏斗分段
- `off_contract_order_cnt` / `refund_order_cnt` 都叠加了 `支付成功` 前提，因此天然 `≤ success_order_cnt`
- `contract_order_cnt` 只要求签约状态，不要求支付成功，所以可能 `> success_order_cnt`

### §2.2　用户计数（10 个，od 路，均按 `phone` 去重）

分子条件与对应订单指标完全一致，只是把 `order_id` 换成 `phone`。以下只列差异项。

| 指标 | 源表达式要点 | 业务含义 |
|---|---|---|
| `user_cnt` | `count(DISTINCT phone)` | 总用户数 |
| `valid_user_cnt` | `order_status NOT IN ('下单失败')` | 有效提单用户数 |
| `contract_user_cnt` | `contract_status IN ('签约成功','解约中','已解约')` | 签约用户数 |
| `success_user_cnt` | `order_status = '支付成功'` | 成功用户数 |
| `off_contract_user_cnt` | `contract_status IN ('解约中','已解约') AND order_status = '支付成功'` | 解约用户数 |
| `refund_user_cnt` | `refund_status IN ('退款完成','部分退款') AND order_status = '支付成功'` | 退款用户数 |
| `report_user_cnt` | `report_flag = '已上报'` | 上报用户数，**不要求支付成功** |
| `faild_pay_user_cnt` | `pay_status IN ('支付失败','扣款失败','发起扣款失败') AND contract_status IN ('签约成功','解约中','已解约') AND order_status != '支付成功'` | 扣费失败用户数；三个条件缺一不可，直接 `pay_status IN (...)` 会把未签约的失败单也算进来 |
| `paid_user_cnt` | `pay_status IN ('支付成功','支付失败','扣款失败','发起扣款失败') AND contract_status IN ('签约成功','解约中','已解约')` | 发起扣费用户数（不区分成败） |
| `valid_success_user_cnt` | `order_status = '支付成功' AND refund_status = '未发起' AND contract_status IN ('签约成功')` | 有效用户数（未解约未退款的成功用户），**留存分析的核心指标** |

### §2.3　近 8 小时窗口（2 个，有口径断点）

字段名里的 `_2h` 是**历史命名遗留，实际是 8 小时**。

```sql
-- od 路内部（真正的 8 小时窗口）
count(DISTINCT CASE WHEN pay_time <= create_time + INTERVAL '8' HOUR
                     AND coalesce(head_create_time, create_time) >= '2026-09-21 00:00:00'
                     AND order_status = '支付成功'
                THEN phone END)  AS success_user_cnt_2h
```

但最终输出列又包了一层按日期的切换：

```sql
-- 最终输出
CASE WHEN coalesce(head_data_date, data_date) >= '2026-09-21'
     THEN coalesce(od.success_user_cnt_2h, 0)
     ELSE coalesce(od.success_user_cnt, 0)      -- ← 旧逻辑：全量成功用户
END AS success_user_cnt_2h
```

**⚠️ 口径断点：2026-09-21 之前的数据，这一列等于 `success_user_cnt`（全量成功用户），不是 8 小时窗口。**

后果：跨 2026-09-21 的时间序列会在该日出现断崖式下跌，这是口径切换而非业务下滑。做趋势分析时：
- 若区间完全在 2026-09-21 之后 → 可正常使用
- 若跨该日 → 必须在图注标明断点，或改用 `success_user_cnt`
- 若区间完全在此之前 → 该列无 8 小时含义，等价于全量

同样的断点存在于 `success_order_cnt_2h`。

### §2.4　消耗与流量（ct 路）

| 指标 | 源表达式 | 业务含义 |
|---|---|---|
| `cash_cost` | `sum(cash_cost) + sum(no_order_cash_cost)` | 现金消耗，**已包含无订单消耗** |
| `book_cost` | `sum(cash_cost × point) + sum(no_order_cash_cost × point)` | 账面消耗 = 现金消耗 × 账面折算系数 `point` |
| `out_source_cost` | `sum(out_source_cost)`（od 路） | 外放成本，转投给下游的成本 |
| `view_count` | `sum(ad_view_count)` | 曝光数 |
| `click_count` | `sum(ad_click_count)` | 点击数 |
| `conversion_count` | `sum(ad_conversion_count)` | 转化数（平台回传口径） |

**关键点：**
- `cash_cost` 包含 `no_order_cash_cost`（未带来订单的消耗），所以它是**完整投放成本**。用 `cash_cost` 做 ROI 分母不会高估 ROI。
- 明细里 `cash_cost` 与 `no_order_cash_cost` 是两个字段，本表只输出了合计值，因此**无法从本表算出「有效订单消耗」**，那需要回明细表。
- `book_cost / cash_cost` 是账面折算比（约等于 `point` 的加权平均），可用来反查返点水平。
- `out_source_cost` 来自订单路，在无订单的小时上会是 0，做成本结构分析时注意与其他消耗指标不同轴。

### §2.5　金额（6 个，od 路）

| 指标 | 源表达式 | 业务含义 |
|---|---|---|
| `pay_amount` | `sum(pay_amount)` | 订单实付金额合计。**自营收入口径** |
| `refund_amount` | `sum(refund_amount)` | 退款金额合计 |
| `fee_price` | `sum(fee_price)` | 支付渠道手续费 |
| `refund_fee_price` | `sum(refund_fee_price)` | 退款退回的手续费 |
| `real_pay_amount` | `sum((pay_amount − refund_amount) − (fee_price − refund_fee_price)) × coalesce(pay_merchant_share_ratio,1)` | 实际订单收入（净额，已乘商户分成比例） |
| `report_reward` | `sum(report_reward)` | 佣金。**三方 CPA 收入口径** |

**关键点：**
- `real_pay_amount` 在明细行级先乘分成比例再求和；分成比例来自月度维表 `dim_equity_com_pay_channel_merchant_ratio_monthly`，按「年月 + 支付渠道 + 商户号 + 商户名」匹配，**匹配不上时比例取 1**（即不打折），这会让净收入偏高。本表 `pay_channel`/`pay_merchant` 恒 NULL，无法自查匹配情况。
- `report_reward` 是所有套餐都有的上报佣金，**不代表它就是收入**。只有 `commodity_classify = '三方支付套餐'` 时它才是收入口径；自营套餐的 `report_reward` 是付给渠道的佣金成本。
- 判断佣金含义要先看 `rule_report_node`：支付成功节点与签约成功节点，同一个 `report_reward` 对应的事件不同。

## §3　派生率公式库

**通用规则：** 分母一律 `NULLIF(x, 0)`，结果 `ROUND(..., 4)`；分母为 0 时输出 `NULL`，展示为 `—`。不得用 0 代替。

### §3.1　签约转化类（仅 `commodity_classify = '常规套餐'`）

| 指标 | 公式 | 说明 |
|---|---|---|
| **提单签约率** | `contract_user_cnt / valid_user_cnt` | 提了单的用户里有多少签约。分子分母都是用户级，量纲一致 |
| **签约成功率** | `success_user_cnt / contract_user_cnt` | 签约用户里有多少支付成功。**注意分母是签约用户不是有效用户** |
| 全链路成功率 | `success_user_cnt / valid_user_cnt` | 等于上面两个率相乘，可直接对比验证 |
| 有效提单率 | `valid_user_cnt / user_cnt` | 触达用户里有多少提了有效单 |
| 解约率 | `off_contract_user_cnt / success_user_cnt` | 成功用户里有多少解约 |
| 退款率 | `refund_user_cnt / success_user_cnt` | 成功用户里有多少退款 |
| 净留存率 | `valid_success_user_cnt / success_user_cnt` | 成功用户里还有多少「未解约未退款」 |
| 上报率 | `report_user_cnt / success_user_cnt` | 成功用户里有多少已上报 |

### §3.2　成本效率类

| 指标 | 公式 | 说明 |
|---|---|---|
| **每成功用户现金消耗** | `cash_cost / success_user_cnt` | 获得一个付费用户的现金成本。**CPA 的核心口径** |
| **每成功用户账面消耗** | `book_cost / success_user_cnt` | 同上，账面口径 |
| 每有效用户现金消耗 | `cash_cost / valid_user_cnt` | 提单成本，反映前端获客效率 |
| 每签约用户现金消耗 | `cash_cost / contract_user_cnt` | 签约成本 |
| CPM | `cash_cost / view_count × 1000` | 千次曝光成本 |
| CPC | `cash_cost / click_count` | 单次点击成本 |
| CTR | `click_count / view_count` | 点击率 |
| CVR | `conversion_count / click_count` | 平台回传转化率，**与站内支付成功不是同一件事** |

### §3.3　收入与回本类

| 指标 | 公式 | 适用 |
|---|---|---|
| ROI（自营·毛） | `pay_amount / cash_cost` | 自营，未扣退款手续费 |
| ROI（自营·净） | `real_pay_amount / cash_cost` | 自营，已扣退款、手续费、分成 |
| ROI（三方） | `report_reward / cash_cost` | **三方 CPA 唯一正确口径** |
| 客单价 | `pay_amount / success_order_cnt` | 单均实付 |
| 单用户收入 | `pay_amount / success_user_cnt` | 人均实付 |
| 单均佣金 | `report_reward / success_order_cnt` | 三方单均佣金 |
| 账面现金比 | `book_cost / cash_cost` | 反查返点/折算系数 |
| 收入成本比 | `pay_amount / book_cost` | 账面口径回本倍数 |

### §3.4　扣费健康度

| 指标 | 公式 | 说明 |
|---|---|---|
| 扣费成功率 | `1 − faild_pay_user_cnt / paid_user_cnt` | 发起扣费的人里多少没失败 |
| 首扣失败占比 | `faild_pay_user_cnt / contract_user_cnt` | 签约后首扣失败比例 |

## §4　可加性判定（跨维度汇总必读）

本表的每个指标都是「21 个维度分组后的组内值」。要把它在更粗粒度上再聚合（例如按部门汇总各账号），必须先判断可加性。

### §4.1　绝对可加：所有 `sum` 类

`cash_cost`、`book_cost`、`out_source_cost`、`view_count`、`click_count`、`conversion_count`、`pay_amount`、`refund_amount`、`fee_price`、`refund_fee_price`、`real_pay_amount`、`report_reward`。

这些是行级值的求和，跨任意维度 `SUM` 都正确。**唯一例外**：`out_source_cost` 来自订单路，和其他消耗不同轴，混在同一行求和时注意其时间归属。

### §4.2　条件可加：订单计数

`order_cnt` 与各 `*_order_cnt`。

一个 `order_id` 天然只属于「一个账号、一个广告组、一个套餐、一个队列、一个 `is_renew` 取值」，因此在跨维度汇总时不会重复。**前提是明细宽表里同一 `order_id` 只有一行。**

这个前提需要用模板 T11 验证：把本表某范围的订单数求和，与明细表的 `COUNT(DISTINCT order_id)` 对比。若两者相等则放心 `SUM`；若本表明显偏大，说明明细里同一订单有多行（多关联记录/多快照），此时 `SUM` 会高估。

**实践建议：** 订单数在部门/账号/套餐维度上 `SUM` 通常可用，但对外出正式报表前跑一次 T11。

### §4.3　不可加：所有用户计数

`user_cnt` 与各 `*_user_cnt` **不能跨行相加**。

原因是同一个 `phone` 会在多行出现：跨日期（多天各有订单）、跨套餐（买了两个套餐）、跨 `is_renew`（首单与续费分行）、跨广告组。每行的 `success_user_cnt` 是**该行内的去重人数**，两行相加会把同一人算两次。

**误差量级取决于维度组合**：

| 汇总维度 | 是否会重复 | 说明 |
|---|---|---|
| 只按 `department` 汇总 | 低 | 同一手机号在同一部门买两个套餐会重复，通常影响小 |
| 只按 `account_id` 汇总 | 中 | 同账号多套餐必然重复 |
| 按日期汇总 | **高** | 跨天重复是主要偏差来源 |
| 按套餐 + 日期汇总 | **最高** | 多重复因素叠加 |

**正确的表述方式：**
- 单行或单切片的值 → 可以说「用户数」
- 多行 `SUM` 的值 → 必须说「用户数（跨维度累加，含重复）」或「按…去重的用户人次」
- 需要精确全局去重人数 → 本表做不到，必须回 `dwd_equity_shop_profit_detail_f_d` 用 `COUNT(DISTINCT phone)`

**千万不要**用 `MAX(user_cnt)` 或 `AVG(user_cnt)` 去「修正」，两者都没有业务含义。

### §4.4　派生率的汇总陷阱

派生率**永远不能对率本身求平均**。

错误做法：先算每个账号的签约成功率，再 `AVG(成功率)` —— 小账号（1 个用户 1 单）和大账号权重相同，结果完全失真。

正确做法：先分别 `SUM` 分子和分母，再相除：

```sql
SUM(success_user_cnt) / NULLIF(SUM(contract_user_cnt), 0)
```

⚠️ 但用户级指标的分子分母都不可加，所以这个「先合后除」的结果也只是近似。**唯一严谨的口径是单一切片内计算**，跨切片时要在结论里标注这一限制。

## §5　边界条件（回答时必须声明）

| 边界 | 内容 |
|---|---|
| 套餐类型 | 签约、转化、留存类指标仅对 `commodity_classify = '常规套餐'`（自营）有业务意义 |
| 三方 CPA | 三方不适用签约漏斗，看 `success_user_cnt` + `report_reward`，不看 `contract_*` |
| 套餐范围 | 只纳入 `常规套餐`（自营）与 `三方支付套餐`（三方/CPA）两类，其余取值直接过滤，不参与任何统计 |
| 时间对齐 | 日级 ROI 不稳定，跨天续费会分离订单与消耗；周期口径才可靠 |
| 跨期首单 | 窗口开始前的首单，其后续消耗落在窗口内 → 该窗口 ROI 被低估 |
| 口径断点 | 2026-09-21 前后 `success_*_2h` 含义不同 |
| 死列 | `pay_merchant`、`pay_merchant_name`、`pay_channel` 恒 NULL |
| 分母为 0 | 输出 `—`，不输出 0% |

## §6　口径误用对照

| 错误做法 | 正确做法 | 后果 |
|---|---|---|
| `SUM(user_cnt)` 当总用户数 | 单切片用，多切片标注「含重复」 | 用户数偏高，ROI/CPA 被低估 |
| `AVG(签约率)` 跨账号平均 | `SUM(分子)/SUM(分母)` | 大小账号同权，率失真 |
| 三方收入用 `pay_amount` | 用 `report_reward` | 三方是佣金模式，没有实付金额概念 |
| 自营收入用 `report_reward` | 用 `pay_amount` 或 `real_pay_amount` | `report_reward` 在自营是成本不是收入 |
| 用 `conversion_count` 当支付成功数 | 用 `success_order_cnt` / `success_user_cnt` | 前者是平台回传口径，与站内支付不是同一事件 |
| 用 `order_cnt` 当有效提单 | 用 `valid_order_cnt` | 前者含下单失败 |
| 把 `book_cost` 当另一种现金消耗 | 明确区分账面/现金 | 两者差一个 `point` 系数 |
| 签约率高就认为业绩好 | 联看 `valid_user_cnt` 分母规模 | 小分母会放大率，1/1 = 100% |
