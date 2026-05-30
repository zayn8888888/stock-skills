---
name: hyperliquid-perps
description: Hyperliquid 链上永续合约镜像数据助手。基于 Hyperliquid 公开 /info 端点（无需 API key），把 HIP-3 框架下 7 个子 dex（TradeXYZ/Kinetiq/dreamcash/Felix/Ventuals 等）上的传统资产永续合约（美股个股、SPX/NDX/VIX/JP225 等指数、黄金/原油/白银等大宗商品、EUR/JPY 等 FX、OPENAI/ANTHROPIC/SPACEX 等 pre-IPO）拉成结构化快照，输出 24/7 链上隐含价格 + 资金费率（funding rate）+ 持仓量（OI）+ 链上 vs 现货溢价（premium），用于"美股闭市时段隐含价"、"多空拥挤度"、"鲸鱼链上仓位"三类前瞻信号。触发场景：(1) 用户问"NVDA 周末/盘后涨跌 / SPX 此刻在链上多少 / TSLA 财报盘后链上反应"；(2) 用户问"funding rate / 资金费率 / 多空拥挤 / 链上 OI / 鲸鱼仓位 / Hyperliquid 上 XX 怎么样 / pre-IPO 价格 / OPENAI 估值"；(3) 被 stock-analyzer 在「资金」「事件日历」维度调用，被 trading-debate 在 Risk 风险辩论环节调用作为"拥挤交易"硬约束。不适用于：A 股标的（链上无镜像）、Hyperliquid 加密原生 perp 分析（与本项目无关）、链上下单/交易（本 skill 仅读不写）。
---

# Hyperliquid 链上永续合约镜像

## 核心原则

1. **只读，不下单**：本 skill 仅调用 `POST /info` 公开端点，绝不调用 `/exchange`，不持有任何私钥
2. **链上价 ≠ 现货真值**：Hyperliquid 永续是合成品，价格由 oracle + 永续 mark 双轨决定；当现货市场闭市（美股盘后/周末/亚洲时段），链上价是**资金做市的隐含定价**而非"已成交的现货"
3. **流动性门槛**：任何信号引用前必须先看 `oiNotionalUsd` 与 `dayNtlVlmUsd`：
   - **可信**：OI ≥ 1,000,000 USD 且 24h 成交 ≥ 1,000,000 USD
   - **仅供参考**：100k USD ≤ OI < 1M USD（如 Kinetiq 上的港股镜像）
   - **不要使用**：OI < 100k USD（数据噪音 > 信号）
4. **跨 dex 一致性校验**：同一标的（如 NVDA）在 4 个 dex 都有镜像时，先看 oracle price 偏差 —— 大于 0.5% 视为异常
5. **不出买卖指令**：funding 极值/OI 突变是观察信号，不是结论，最终决策权交给用户与 trading-debate

## 执行前必读（收到任务后第一步）

```bash
Read references/asset-mapping.md    # 完整资产类别映射（美股/指数/商品/FX/港股/Pre-IPO）
Read references/report-template.md  # 完整输出报告模板
Read references/data-sources.md     # Hyperliquid /info 端点完整 API 规格
```

## 前置依赖

### 必需

- `curl` + `jq`（macOS 自带或 `brew install jq`）
- 网络可达 `api.hyperliquid.xyz`（无需 API key、无需注册）

### 可选

- 无。Hyperliquid `POST /info` 全部公开。注意 IP 级限流约 1200 次/分钟，本 skill 单次调用约 8-10 次请求，远低于限制。

## 标准输入

调用方需要给出以下任一类参数：

| 字段 | 必填 | 说明 |
|------|------|------|
| `ticker` | 二选一 | 美股/港股标的代码或公司缩写，如 `NVDA`、`TSLA`、`SP500`、`TENCENT`、`OPENAI`，**不区分大小写** |
| `coin` | 二选一 | Hyperliquid 完整合约名，如 `xyz:NVDA`、`vntl:OPENAI`、`km:TENCENT`，**带 dex 前缀** |
| `mode` | 否 | `snapshot`（默认，跨 dex 全镜像）/ `best`（仅 OI 最大的 dex）/ `funding`（funding 历史）/ `candle`（K 线，含闭市段） |
| `hours` | 否 | funding/candle 模式回看小时数，默认 24，最大 168（7 天） |

### 触发关键词识别（让用户自然语言能进 skill）

| 用户表述 | 推断参数 |
|---|---|
| "NVDA 周末链上多少 / 现在 SPX 永续在哪" | `ticker=NVDA / SP500`, `mode=snapshot` |
| "TSLA funding 多少 / 多头是不是太挤了" | `ticker=TSLA`, `mode=funding`, `hours=24` |
| "OPENAI 链上估值多少" | `ticker=OPENAI`, `mode=best` |
| "腾讯 / TENCENT Hyperliquid 上有吗" | `ticker=TENCENT`, `mode=snapshot` + 流动性提醒 |
| "比一下 NVDA 各 dex 价差" | `ticker=NVDA`, `mode=snapshot`（必跨 dex） |

## 核心能力

### 能力 1：snapshot —— 跨 dex 镜像全表

```bash
./scripts/snapshot.sh                      # 全部传统资产 dex
./scripts/snapshot.sh xyz                  # 仅 TradeXYZ
./scripts/snapshot.sh --filter NVDA TSLA   # 关键标的
./scripts/snapshot.sh --top 30             # OI 名义敞口前 30
```

**输出 CSV 列**：

| 列 | 含义 | 解读要点 |
|---|---|---|
| `dex` | 子 dex 标识（xyz/km/cash/flx/vntl） | `xyz` = TradeXYZ 龙头，OI 占比 80%+ |
| `coin` | 完整合约名（含 dex 前缀） | 如 `xyz:NVDA` |
| `markPx` | 当前标记价（USDC 计价） | 用于实时报价 |
| `prevDayPx` | 24h 前价格 | |
| `chgPct` | 24h 涨跌（%） | 链上 24/7 涨跌，可能领先现货 |
| `fundingHourly` | 当前每小时资金费率 | 正 = 多头付空头 |
| `fundingApr` | 年化（hourly × 24 × 365） | 极值预警：> +100% 极度多头拥挤；< -100% 极度空头拥挤（详见下文等级表） |
| `oiBase` | 持仓量（合约单位） | |
| `oiNotionalUsd` | 持仓名义美元值 | **流动性闸门** |
| `dayNtlVlmUsd` | 24h 名义成交（美元） | **流动性闸门** |
| `premiumBp` | 永续 mark 相对 oracle 的溢价（bp） | > 50 bp 持续 = 链上做空成本高 / 难做空 |

### 能力 2：lookup —— 按标的精确查询（stock-analyzer 主入口）

```bash
./scripts/lookup.sh NVDA          # 列所有 dex 上的 NVDA 镜像，按 OI 倒序
./scripts/lookup.sh NVDA --best   # 仅 OI 最大的那一个
./scripts/lookup.sh NVDA --json   # JSON 输出，含 24h funding 统计（avg/max/min APR）
```

`--json` 模式返回结构（给其它 skill 调用）：

```json
{
  "dex": "xyz",
  "coin": "xyz:NVDA",
  "markPx": 231.23,
  "prevDayPx": 225.94,
  "chgPct": 2.34,
  "fundingHourly": 0.0000225,
  "fundingAprNow": 19.72,
  "oiNotionalUsd": 122984716,
  "dayNtlVlmUsd": 94263521,
  "premiumBp": 7.75,
  "funding24h": {
    "count": 24,
    "avgApr": 18.28,
    "maxApr": 54.59,
    "minApr": 5.48
  }
}
```

### 能力 3：funding history —— 资金费率时间序列

直接调 `/info`：

```bash
START=$(($(date +%s) - 86400))000
curl -s -X POST https://api.hyperliquid.xyz/info \
  -H 'Content-Type: application/json' \
  -d "{\"type\":\"fundingHistory\",\"coin\":\"xyz:NVDA\",\"startTime\":$START}" \
  | jq '[.[] | {t: (.time/1000 | strftime("%Y-%m-%d %H:%M")), apr: ((.fundingRate | tonumber) * 24 * 365 * 100), prem: (.premium | tonumber)}]'
```

**funding 极值解读模板**（输出报告时引用）：

| funding APR | 含义 | 对持有现货的提示 |
|---|---|---|
| > +100% | 极度多头拥挤 | ⚠️ 拥挤交易，警惕反向 squeeze |
| +20% ~ +100% | 多头偏强 | 正常上涨段 |
| -20% ~ +20% | 中性 | 无情绪偏向信号 |
| -100% ~ -20% | 空头偏强 | 警惕利空兑现 |
| < -100% | 极度空头拥挤 | ⚠️ 可能筑底反弹 |

### 能力 4：candle —— 1h K 线（捕捉美股闭市时段定价）

```bash
NOW=$(date +%s)000
START=$(($(date +%s) - 86400))000
curl -s -X POST https://api.hyperliquid.xyz/info \
  -H 'Content-Type: application/json' \
  -d "{\"type\":\"candleSnapshot\",\"req\":{\"coin\":\"xyz:NVDA\",\"interval\":\"1h\",\"startTime\":$START,\"endTime\":$NOW}}" \
  | jq '.[] | {t: (.t/1000 | strftime("%Y-%m-%d %H:%M UTC")), o,h,l,c,v}'
```

**美股闭市时段判断**（UTC）：

- **盘前**：13:00-14:30 UTC（EST 夏令时 9:30 前）
- **盘中**：14:30-21:00 UTC
- **盘后**：21:00-01:00 UTC
- **闭市**：01:00-13:00 UTC + 周末
- **闭市段链上价值**：链上 1h 收盘价 vs 上一个美股收盘价的偏离 = 隐含次日开盘的市场定价

## 资产类别覆盖速查

> （资产映射已在执行前必读块加载）

| 类别 | 主 dex | 代表标的 | 流动性 |
|---|---|---|---|
| **美股大型科技** | xyz / cash | NVDA, TSLA, MSFT, GOOGL, META, AMZN, AAPL | 高（NVDA OI 1.2 亿 USD） |
| **美股半导体** | xyz | INTC, AMD, MU, MRVL, ARM, TSM, SNDK | 高 |
| **加密概念股** | xyz | MSTR, COIN, CRCL, HOOD | 中-高 |
| **美股指数** | xyz / cash / km | SP500, XYZ100, VIX, JP225, NIFTY, KR200 | 极高（SP500 OI 4.87 亿） |
| **大宗商品** | xyz / flx | GOLD, SILVER, COPPER, BRENTOIL, CL, NATGAS, WHEAT, CORN, URANIUM, PALLADIUM, PLATINUM | 高 |
| **FX** | xyz / km | EUR, JPY, KRW, DXY | 中 |
| **港股 / 中概镜像** | km | TENCENT, XIAOMI, BABA | ⚠️ 极低（OI < 10 万 USD），仅参考价 |
| **Pre-IPO** | vntl | OPENAI, ANTHROPIC, SPACEX | 中（3-6M USD OI） |
| **主题指数** | vntl | MAG7, SEMIS, NUCLEAR, ROBOT, DEFENSE, BIOTECH | 中 |

## 输出报告模板

> （报告模板已在执行前必读块加载）
>
> **⚠️ 数字格式硬规则**：禁止用 `$` 前缀（`230.84 USD` 在 Claude Code 终端会被 KaTeX 渲染吞掉，输出成 `0.84`）。**统一用 `USD` 后缀**：`230.84 USD`、`125.8M USD`、`OI ≥ 1M USD`。

```markdown
# Hyperliquid 链上镜像 — {TICKER}

**最佳镜像**：{coin}（{dex} dex，OI {oiNotionalUsd}M USD）
**当前 mark**：{markPx} USD（24h {chgPct}%）｜oracle 偏差：{premiumBp} bp
**流动性等级**：{可信 / 仅供参考 / 不要使用}

## 事件锚点（**必填**）
- 距下次财报：{N} 个交易日（{YYYY-MM-DD}）
- 已有 trading-debate 决策：{Hold/Buy/Sell} @ {price}（{date}）

## funding rate（多空拥挤度）
- 当前 APR：{fundingAprNow}% — {解读}
- 24h 区间：avg {avgApr}% / max {maxApr}% / min {minApr}%

## 跨 dex 一致性
| dex | mark (USD) | OI (USD) | premium |
| ... |

## 信号摘要
- ✅ / ⚠️ {1-3 条结论}

> ⚠️ 链上永续 ≠ 现货真值；不构成投资建议
```

## 与其它 skill 的协作约定

### stock-analyzer

- **维度 4（资金）**：调用 `lookup.sh {ticker} --json`，把 funding 24h 统计 + premium 加入资金面分析
- **维度 9（事件日历）**：财报/FOMC 等事件后立即调用，看链上即时反应

### 事件锚点（所有调用方共同要求）

报告"事件锚点"段必须从下面三个来源**至少**填一条：

1. **event-calendar skill 的输出**——若上下文已有，直接引用财报/FOMC/CPI 日期
2. **memory（`MEMORY.md` 索引）**——查 `trading-debate-decision-*` 等条目，看是否有该标的近期决策
3. **stock-analyzer 维度 9 的事件日历输出**——若调用方在分析流程中

如三个来源都没有，写"无近期已知事件锚点"即可，不要省略整段。

### event-calendar

- 在 FOMC / CPI / 财报后段加一行"链上即时反应"，引用 SP500 perp 的 5min 涨跌

### trading-debate

- **Risk 风险辩论**：把 funding APR > +100% 或 < -100% 列为"拥挤交易硬约束"
- **Bull/Bear 辩论**：当 OI 24h 突变 > +30% 时，提示"链上鲸鱼建仓中"

### market-scanner

- **催化外推**：当某板块所有美股都在涨，但链上 funding 仍温和时，说明热度未透支，仍可追

## 已知限制

1. **港股/中概镜像流动性差**（除 BABA 外 OI < 100 万 USD）：链上价仅作"次日开盘隐含定价"参考，**不能用于资金面/拥挤度判断**
2. **A 股完全无镜像**：A 股标的请走 stock-analyzer 原本的富途 OpenAPI 路径
3. **Pre-IPO 永续永远高于公允价**：链上无法做空 → premium 持续 > 1000 bp 是常态，不是"多头过热"信号
4. **funding rate 间隔为 1 小时**：与 Binance/OKX 的 8 小时不同，年化倍数也不同（× 24 × 365 而非 × 3 × 365）
5. **HIP-3 部署者有暂停权**：极端情况下部署者可 halt trading；本 skill 仅在 dex 列表中带 `subDeployers.haltTrading` 字段时间接体现，不主动告警

## 故障排查

| 现象 | 可能原因 | 处置 |
|---|---|---|
| `❌ 未找到 XX 的镜像合约` | 拼写错误 / 该标的未上 HIP-3 | 跑 `./scripts/snapshot.sh` 看完整清单 |
| 同一标的 4 dex 价格偏差 > 1% | 某个 dex oracle 卡住 | 仅采用 OI 最大那个，其余忽略 |
| funding APR 看似离谱（> 1000%） | 单小时极端值，不是稳定状态 | 看 24h 平均而非 spot 值 |
| `xyz:JPN225` 等合约 OI=0 | 部分合约挂着但无人交易 | 直接跳过，不引用 |
| HTTP 429 限流 | 单 IP > 1200/min | 暂停几秒重试，本 skill 默认远低于此 |
