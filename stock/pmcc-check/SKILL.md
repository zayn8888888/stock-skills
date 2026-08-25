---
name: pmcc-check
description: Use when 用户想对某只美股做 PMCC(Poor Man's Covered Call,买深度ITM LEAPS Call + 卖近月OTM Call)、问"XX 适不适合做 PMCC / poor man covered call / LEAPS 备兑",或要扫一批标的找 PMCC 候选,或用户说"PMCC 稳赚/无风险收租"需校准幻觉。不适用于正股备兑(有100股用 trade-check)、纯期权单腿投机、A股(无美式期权链)。
---

# PMCC 可行性检查与策略生成

## Overview

PMCC = 用深度 ITM LEAPS Call 替代 100 股正股 + 卖近月 OTM Call 收租。本质是"用更少资金模拟备兑",但**绝非稳赚**——它把持股的下跌风险用更少资金承担,缓冲更少,且 Long LEAPS 有到期日没法死扛。

**铁律:五关全过才开仓。任何一关不过就劝退或换标的,不要硬凑。**
结构扫描 → 趋势 → 财报 → IV/extrinsic → 流动性,逐关过滤。

| 关 | 工具 | 通过标准 |
|---|---|---|
| 1 结构 | scan_pmcc.py | delta≥0.78(以 0.80 档) + 回本≤24 月 + 单张占资金≤30% + 安全价差成立 |
| 2 趋势 | 60 日 K 线 | 非下降趋势 |
| 3 财报 | web 搜索 | Short 近月不跨财报 |
| 4 IV | scan 输出 extr% | ≤40%(理想 <25%) |
| 5 流动性 | scan 输出 spread | ≤2 点 |

**分流**:用户已持有 100 股想做备兑 → 改用 trade-check,本 skill 不适用。

## 工具与环境前置

**依赖**:富途 OpenD 已启动(端口 11111)+ Python futu-api SDK。scan_pmcc.py 自动复用 futuapi skill 的 common.py。

**脚本路径定位**(stock-skills 是 plugin,CLAUDE_SKILLS_DIR 在子环境可能未设,用 find 兜底;多版本取最新):
```bash
SCAN_PMCC=$(find ~/.claude/plugins ~/.claude/skills -path '*/pmcc-check/scripts/scan_pmcc.py' 2>/dev/null | sort | tail -1)
FUTUAPI=$(find ~/.claude/plugins ~/.claude/skills -path '*/futuapi/scripts/quote/get_kline.py' 2>/dev/null | sort | tail -1 | xargs dirname | xargs dirname)
# 之后用 $SCAN_PMCC 跑结构扫描,$FUTUAPI/quote/get_kline.py 调 K 线/快照/期权链
```

- **结构扫描**:`python3 $SCAN_PMCC --codes US.XX --capital <资金>`。已内嵌 BS 反推 IV/delta、安全价差检查、三档 delta 对比、流动性过滤、资金占用、Long spread(第五关直接读输出)
- **发现模式**(不知道扫什么时):`python3 $SCAN_PMCC --discover --capital <资金>` —— 内置 ~180 大池(纳指100/标普100 主要成分+主流ETF),批量快照按成交额粗筛、自动剔除买不起的高价股(现价>资金/0.93),入围 ~25 只再精扫
- **K线**:`$FUTUAPI/quote/get_kline.py US.XX --ktype 1d --num 60 --rehab forward`
- **VIX**(第四关参考,判断 IV 是否处高位):用 web 搜索工具搜 "VIX current level"。VIX < 15 为 IV 低位(适合开 PMCC),VIX > 20 偏高(等回落)
- **财报**:用 web 搜索工具搜 `"<ticker> earnings date"`(用搜索工具,不要直接抓网页)
- **失败处理**:脚本报连接/超时错误 → 提示用户确认 OpenD 已启动并在 GUI 解锁,不要反复重跑

## 五关流程

### 第一关:结构扫描(必须先跑 scan_pmcc.py)

```bash
# 单标的细看
python3 $SCAN_PMCC --codes US.XX --capital <用户资金USD>
# 扫一批候选
python3 $SCAN_PMCC --codes US.SBUX,US.KO,US.AAPL --capital 19000
# 发现模式:大池粗筛找候选(不知道扫什么时用)
python3 $SCAN_PMCC --discover --capital 19000
```

看输出三档(delta 0.85/0.80/0.70)对比,**阈值判定以 0.80 档为准**——深度 ITM 的 0.85 档 IV 反推误差大,delta 可能偏低 0.01~0.03,边缘值(如 0.77)既不误杀也不强过,看 0.80 档定夺。

**判定(三项全过才进下一关,scan 已标 ★):**
- delta ≥ 0.78(以 0.80 档为准)
- 回本月 ≤ 24(理想 ≤ 24,硬上限 ≤ 36)
- 单张占资金 ≤ 30%

**高价股资金门槛**:单张 LEAPS 成本约 = 现价 × 0.28(深度ITM 0.85档),所以做某股 PMCC 需资金 ≥ 现价 × 0.28 ÷ 0.30 ≈ 现价 × 0.93(单张占30%)。现价 $300 的 AAPL 需 ~$2800 资金才买得起1张且不超30%,想买2-3张分散需 $5600-8400。现价 > $200 的高价股在 $19k 资金下基本卡死资金关——这是资金量不够,不是换 Long strike 能解决的,换低价标的。

**安全价差死局检查(scan 已内嵌,但必须读懂):**
`Long_strike + Long_ask < Short_strike`,且 Short 月租 ≥ $0.30。若所有 OTM Short 都不满足 → **PMCC 结构不成立,直接换标的**。死局常见于:高价股(LEAPS extrinsic 绝对值大)+ 高 IV 标的。别试图换更浅 ITM 的 Long 来"救"——extrinsic 飙升、回本翻倍,更差(见 Common Mistakes)。

### 第二关:趋势

拉 60 日 K 线,判断高点/低点结构:
- 高点逐低 + 低点逐低 = 下降趋势 → **不做**(抢反弹胜率低)
- 高点逐高 + 低点逐高 = 上升 → 理想
- 无序 = 震荡 → 可做但仓位压低

LEAPS 行权价最好落在强支撑下方,Short 行权价落在阻力上方。

### 第三关:财报(web 搜索)

- **Short 近月(30-45 天)绝对不跨财报** —— 硬条件,跨了就换近月到期日或等财报后
- **LEAPS 必然跨多个财报** —— 这是固有风险,评估标的财报历史波动(连读 beat 还是大面 miss)。高方差财报标的(如 PDD、INTC)即使结构成立也不适合

### 第四关:IV / extrinsic

看 scan 输出的 `extr%` 和 `IV` 列(BS 反推)。口径说明:IV 用 mid 价反推(估 IV 水平要公允价),extr%/成本用 ask(实盘买入口径)——两者不矛盾,别当成 bug:
- extrinsic > 40%:IV 偏高,Long 买贵,IV crush 风险大 → 劝退或等 IV 回落(VIX < 15 时再扫)
- extrinsic 25-40%:可接受
- extrinsic < 25%:理想(低 IV 蓝筹)

### 第五关:流动性

看 scan 输出的 Long `spread`:
- spread > 2 点:摩擦大,**mid 价是幻觉,实盘要吃 ask**(成本比表里高)
- Short 月租 < $0.30:scan 已过滤为"无合格 Short"

## 策略单输出模板(五关全过后用)

```
【策略单】US.XX PMCC

📊 数据:现价 X | 趋势:温和上升 | IV Y%(extrinsic Z%)| 财报:Q?已发,Short不跨 ✓

🦵 Long  US.XX...C... (strike K, D天, YYYY-MM到期)
  买 ask A = $cost/张 | delta D | extrinsic E% | spread S
🦵 Short US.XX...C... (strike k, d天, 近月)
  卖 bid B = $rent/月 | 安全价差: K+A < k ✓ | 被行权赚 $(k-K-A)/股

💰 收益
  回本: A/B = N月 | 月租金收益率: B/A = X%/月
  上限: 涨过 k 被锁顶,最大盈利 = $M/张

🛑 止损(进场前定死,进场后不改)
  Long 报价跌破 P(−R%,内在支撑失效)→ 平两腿
  单笔最大亏损: ~$L/张(占资金 P%)

📈 量化场景(必须列出,治"稳赚"幻觉)
  跌到 Long strike(−X%):Long A→C 亏$D,Short归零赚$B,净亏$E/张
  横盘:IV crush,Long 跌 extrinsic×K%,净亏$F/张
  涨到 Short strike(+X%):被行权,净赚$M/张(封顶)

🔄 roll 计划:近月 Short 权利金衰减50-80%时买回,滚到下月;Long 剩余<30天或趋势反转则平仓

⚠️ 提醒
  - 非稳赚:跌时和正股一样亏本金,横盘 theta 净亏,只有温和涨才赚
  - 实盘下单前先 OpenD GUI 解锁交易密码
  - [若检测到"稳赚"信号,强制让用户看上面量化场景的亏损列]
```

## Common Mistakes(baseline 漏掉的坑)

| 错误 | 现实 |
|---|---|
| 用 mid 价估成本 | 流动性差的 LEAPS spread 可能 5 点,实盘买 ask 卖 bid,摩擦吃掉利润。永远用 ask 算成本 |
| 只看单档 delta | 不对比 0.70/0.80/0.85 三档,选不出"回本最快"档。降 delta 省 20% 资金的代价是 extrinsic 飙升、回本翻倍 |
| 漏安全价差检查 | Long+成本 > Short 时被行权**倒亏**。死局时换浅 ITM Long 是错的(extrinsic 更高)——换标的才对 |
| 忘记财报跨期 | Short 跨财报 = 跳空 + IV crush 双杀。LEAPS 跨财报是固有,但 Short 跨是可避免的错 |
| "稳赚"幻觉 | PMCC 跌时和正股一样亏(还少 buffer),横盘 theta 净亏,大涨被锁顶跑输正股。只有"温和涨"才赚 |
| 重仓单张 | LEAPS 单张占资金 > 30% = 集中度爆表,一张合约绑死组合命运 |
| 把到期行权概率当 delta | 富途 get_option_exercise_probability 是 400 天后到期概率,不是即时 delta。即时 delta 更高。用 scan_pmcc.py 的 BS delta |

## 参考实例(已验证)

US.SBUX(2026-08-14 扫描):现价 $108.55,Long US.SBUX270617C900000(strike90,307天)买$24.05,Short US.SBUX260918C115000 卖$1.20。delta0.86/extrinsic23%/IV25%/回本20月/占资金12.7% — 五关全过唯一达标。趋势温和上升(财报后104→109),Q3已发(7/29 beat),Short 9/18 不跨 Q4(10/28)。是低 IV + 低价 + 流动性好的标准 PMCC 标的画像。

对照:US.PDD(11天后财报+IV43%+LEAPS spread 5点=死局)、US.INTC(IV76%+下跌趋势=更糟)、US.AAPL(结构成立但单张$8170占资金43%=仓位不允许)——都不达标,各自卡在不同关。

## 何时调参

scan_pmcc.py 默认阈值(delta≥0.78/回本≤24/占资金≤30)是脚本顶部的 MIN_DELTA / MAX_RECOVER_MONTHS / MAX_CAP_PCT 常量,改一处全脚本生效。用户资金充裕时可放宽占资金到 40%;保守时回本压到 18 月。改阈值改脚本,别在脑子里放宽。
