# 灵犀智析 视觉规范（Neutral · shadcn 风格）

日期：2026-11-23（第二版：由「Ink & Paper」改为参考 [shadcn/ui Trace](https://ui.shadcn.com/docs/components/base/trace) 的中性色风格）　适用范围：「灵犀智析」对话页及其抽屉、弹层。**不沿用站点的蓝色主题**。

## 设计意图
克制、单色、信息密：黑白灰为主，主色就是近黑色，靠间距、细边框和**小而安静的状态行（Trace）**表达层次。回答正文是页面里最突出的东西，过程信息（思考、用了什么技能、查了哪些表）收成一行行灰色小字，点开才看。

## 来源与取舍
shadcn/ui 是 React + Tailwind 的组件源码，本项目是 Vue + Element Plus 且没有构建步骤，**不能直接引入**。这里照它的设计令牌和 Trace 的结构与尺寸，用 Vue 模板和 CSS 重写了一份（`.ai-trace*`）。字体用系统无衬线字体栈（不引入 Geist 字体文件）。

## 色彩（只通过 `:root` 的 `--ai-*` 变量使用）
| 变量 | 值 | 对应 shadcn | 用途 |
|---|---|---|---|
| `--ai-canvas` / `--ai-surface` | `#FFFFFF` | background / card | 页面与卡片底 |
| `--ai-surface-2` | `#FAFAFA` | — | 会话栏、弹层内层 |
| `--ai-sunken` | `#F5F5F5` | muted | 用户气泡、代码块、chip |
| `--ai-line` / `--ai-line-strong` | `#E5E5E5` / `#D4D4D4` | border / input | 边框 / 悬停边框 |
| `--ai-ink` | `#0A0A0A` | foreground | 正文 |
| `--ai-ink-2` / `--ai-ink-3` | `#737373` / `#A3A3A3` | muted-foreground | Trace 行、次要文字 / 占位 |
| `--ai-accent` / `--ai-accent-hover` | `#171717` / `#262626` | primary | 主按钮（近黑） |
| `--ai-accent-tint` | `#F5F5F5` | accent | 选中、悬停底 |
| `--ai-danger` | `#DC2626` | destructive | 失败状态 |
| `--ai-ok` / `--ai-amber` / `--ai-amber-tint` | `#16A34A` / `#B45309` / `#FFFBEB` | — | 仅用于状态点和「边界」提示 |

## 形状与字体
- 圆角：`--ai-r-sm` 8、`--ai-r-md` 14（shadcn 的 rounded-2xl，卡片、代码块）、`--ai-r-lg` 22（rounded-3xl，用户气泡、输入框、弹层）；按钮和 chip 用胶囊（999px）。
- 正文 14px / 行高 1.75；Trace 行 14px / 20px；代码 12px 等宽。字重只有 400、500。
- 投影只有两档且很轻：`--ai-shadow-1`、`--ai-shadow-2`。不用渐变、不用发光。

## Trace 行（参考 shadcn Trace 的实测尺寸）
- 一行 = 图标（16px）+ 标题（一句话，不换行省略）+ 可选描述 + 展开箭头；文字 `--ai-ink-2`，悬停变 `--ai-ink`；行间距 8px，图标与标题间距 8px。
- 状态：无状态=已完成；`running` 标题带流光（`prefers-reduced-motion` 时关闭）；`error` 标题和图标用 `--ai-danger`；`pending` 用 `--ai-ink-3`。状态要写进标题文字里（例如「正在思考…」「调用失败」），不能只靠颜色。
- 展开内容：上 8px、下 4px，左侧 1px `--ai-line` 竖线，左内边距 16px，文字 `--ai-ink-2`，行高 1.625。
- 本页用到的行：思考过程、已使用的技能（含「换一个」）、查了哪些表（展开后是表名行）、口径理解、运行详情。

## 组件约定
- **用户消息**：`--ai-sunken` 底、22px 圆角、靠右、最大宽度 80%。**助手回答**：无气泡、无头像，直接是正文。
- **按钮 / chip**：描边胶囊（1px `--ai-line`、白底、32px 高、14px / 500），悬停边框加深；主按钮为 `--ai-accent` 底白字，一屏只有一个（发送）。
- **输入框**：白底、22px 圆角、1px 边框、轻投影。
- **能力卡**：白底、1px 边框、14px 圆角，悬停背景变 `--ai-sunken`；图标放在 `--ai-sunken` 圆角底上。
- **边界提示**：`--ai-amber-tint` 底、`--ai-amber` 字。
- **Element Plus 组件**：对话页范围内 `--el-color-primary` 指向 `--ai-accent`；浮层 / 抽屉 / 弹层加 `ai-theme` 类取同一套变量。

## 无障碍
Trace 行的展开按钮带 `aria-expanded`；图标按钮带 `aria-label`；状态写进标题文字；流光动画在 `prefers-reduced-motion` 下关闭。正文对比度不低于 4.5:1（`--ai-ink-3` 仅用于占位等非关键文字）。
