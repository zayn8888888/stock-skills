# 维度 8 期权链扫描详细规程

**适用市场**：美股 / 港股（HK/US 前缀）。A 股等无期权市场直接跳过并在报告中标注"本市场无期权，跳过"。

## Step 0：快通道（先调用）

**先调用 `futu-derivatives-anomaly` skill**，拿富途量化引擎已聚合的：
- PCR、IV 异动、期权大单、期权情绪综合信号
- 港股：牛熊证街货比例 + 街货价格区间（旧流程拿不到）

> ⚠️ **`futu-derivatives-anomaly` 权限说明**：该 skill 底层调用 `get_derivative_unusual`，属于富途 **AI行情** 增值接口，需单独订阅。普通账户返回错误码 **-12301（DATA_UNAVAILABLE）**，不代表账户没有期权权限。

**何时仍需走 Step 1-3**：
- 用户问机构布局/对冲流（需看具体 strike OI 分布）
- 出现单一 strike 极端堆积疑虑
- 快通道返回"无异常"但用户坚持
- **⚡ 快通道返回任何错误码（包括 -12301）** → 不降级到 Tavily，直接走 Step 1-3（`get_option_chain` + `get_option_volatility` + `get_option_exercise_probability` 用的是基础期权行情权限，与 AI行情 接口独立）

## Step 1：取期权到期日

```bash
python3 ~/.claude/skills/futuapi/scripts/quote/get_option_expiration_date.py <CODE> --json
```

**到期日选择**：默认扫 2 个（近月 + 次近月）。以下情形**追加第 3 个**：

| 触发情形 | 追加到期日 |
|---------|-----------|
| 未来 30-60 天内有已知事件（财报/FDA/股东投票） | 事件后第一个到期日 |
| 正股是指数 ETF 或港股前 20 大蓝筹 | 最近季度末到期日（3/6/9/12 月第三个周五） |
| 用户明确问机构布局/对冲流 | 最近季度末到期日 |

普通个股（无事件+非蓝筹+未追问机构）只扫 2 个近月。

## Step 2：取期权链

```bash
# 取多个到期日（start ≤ end）
python3 ~/.claude/skills/futuapi/scripts/quote/get_option_chain.py <CODE> --start <EXPIRY1> --end <EXPIRY2> --json

# 取单个到期日（两种等价写法）
python3 ~/.claude/skills/futuapi/scripts/quote/get_option_chain.py US.FUTU --expiry 2026-06-05 --json
python3 ~/.claude/skills/futuapi/scripts/quote/get_option_chain.py US.FUTU --start 2026-06-05 --end 2026-06-05 --json
```

**扫描范围**：默认 ±10%/15% 不够，机构保护位/sell-put 锚定常在深度 OTM。原则：**由数据决定，不由默认值决定**。
- 先拉整条链 strike 分布，判断要扫多宽
- 港股建议至少 ±20%，美股 ±15% 起步；strike 稀疏时再放宽一档

## Step 3：批量订阅 + 拉取完整数据

```bash
# 分批，每批 ≤12 合约（超出报错）
python3 ~/.claude/skills/futuapi/scripts/subscribe/subscribe.py <OPT1..OPT12> --types QUOTE
python3 ~/.claude/skills/futuapi/scripts/quote/get_stock_quote.py <OPT1..OPT12> --json
# 重复直到覆盖完整范围
```

**必须用 `get_stock_quote.py`**，不要用 `get_snapshot.py`。snapshot 对期权不含 OI/IV/Greeks；stock_quote 才有完整字段：`open_interest` / `implied_volatility` / `delta|gamma|theta|vega|rho` / `strike_price` 等。

**扫描顺序**：先 Put 后 Call（支撑位信号通常比阻力位强）。扫完看 OI 分布，最外档 OI 仍显著则继续扩。

## 核心判断指标

| 指标 | 计算 | 含义 |
|------|------|------|
| Put/Call OI 比 | Σ Put OI / Σ Call OI | >1 偏空持仓；<0.7 偏多持仓 |
| Put/Call Vol 比 | 当日 Σ Put Vol / Σ Call Vol | 短期情绪，比 OI 更敏感 |
| Max OI 行权价 | OI 最大的 Call/Put strike | Call Max OI → 潜在阻力；Put Max OI → 潜在支撑 |
| 异常成交 | Vol/OI > 0.3 或 Vol > OI | 新开仓方向性押注 |
| 买卖价差比 | (ask-bid)/mid | <5% 流动性良好；>15% 几乎无法交易 |
| IV Skew | OTM Put IV − OTM Call IV | 正 skew 越大 → 尾部风险定价偏高 |
| ATM IV | ATM C/P IV 均值 | vs HV：IV > HV 预期波动扩大 |
| Max Pain | 所有期权买方总亏损最小的 strike | 到期日附近股价有向此收敛的统计倾向 |

**质量门槛**（不满足则标"数据不可信"，剔除该合约）：OI = 0 且 Vol = 0 / bid 或 ask = 0 / IV = 0 或 > 500%

## 单一 Strike 极端堆积识别

满足任一即标"事件级仓位"，报告单独高亮：
- 该 strike OI > 同向总 OI 的 50%
- 该 strike OI > 第二大 OI 的 3 倍
- 名义金额（OI × 行权价 × lot_size）≥ 流通市值 1%

**lot_size 必查**：美股 1 张 = 100 股；港股通常 100 或 200 股（从合约字段 `lot_size` 读取）；A 股场内期权 1 张 = 10000 份。

发现堆积后反向搜新闻（大额期权/sell put/知名机构动作关键词 + 公司名）。

## 输出格式

只给用户看 **Top 5 Call OI + Top 5 Put OI + 异常成交 Top 3**，不倒原始数据。解读示例：
- "Call Max OI 集中在 XXX（现价上方 X%），是主要阻力"
- "IV 24%，较 30 日 HV 18% 高 6pp，市场预期财报后波动显著"
- "Put/Call OI 比 1.4，偏空；但 Put OI 中 XXX 行权价占 45%，可能是机构保护性对冲"

## 财报临近时的 IV-implied 预期波动幅度（当维度 9 显示 ≤5 交易日内有财报时追加）

在维度 8 输出末尾**必须追加以下计算**：

```
📌 财报前期权参考（距财报 N 个交易日）：
  ATM IV = XX%
  IV-implied 预期波动幅度 = 现价 × ATM IV × √(N/365)
                          = $XX × XX% × √(N/365) = ±$___ （约 ±X%）

  卖方行权价参考：
  · OTM 距离需 > $___，行权价才在预期波动范围之外
  · 财报后通常发生 IV crush，届时可用更低 IV 卖出更远行权价
```

**无 ATM IV 数据时**：改用近 30 日历史波动率（HV）替代，并标注"使用 HV 近似"。

> 不出买卖建议，只提供幅度作为参考锚点。PDD 案例：IV 60%，7天到期 → IV-implied = $93.60 × 60% × √(7/365) ≈ ±$7.75，而当时 Sell Put 的行权价 $91 仅距现价 $2.60（< $7.75），财报跳空直接穿越行权价。
