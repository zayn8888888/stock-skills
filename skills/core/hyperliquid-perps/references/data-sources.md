# 数据源 — Hyperliquid `/info` 端点

## 1. 端点总览

- **Base URL**：`https://api.hyperliquid.xyz/info`（mainnet）
- **协议**：所有调用统一 `POST`，body 为 JSON，`Content-Type: application/json`
- **认证**：无（`/info` 完全公开；`/exchange` 才需要签名，本 skill 不涉及）
- **限流**：单 IP ~1200 次/分钟；每个 request 还有 weight，重型查询（如 candleSnapshot 长跨度）weight 更高
- **稳定性**：官方 SLA 不公开；实测 P99 延迟 < 300ms

## 2. 本 skill 用到的 5 个 request type

### 2.1 `perpDexs` — 列出所有 HIP-3 子 dex

```bash
curl -s -X POST $API -H 'Content-Type: application/json' -d '{"type":"perpDexs"}'
```

**返回**：数组，元素 0 是 `null`（代表主加密 perp dex），其余每个对象含：

| 字段 | 含义 |
|---|---|
| `name` | dex 短名（用作 coin 前缀），如 `xyz` |
| `fullName` | 全名，如 `XYZ` / `Markets by Kinetiq` |
| `deployer` | 部署者 EVM 地址 |
| `oracleUpdater` | 喂价者地址 |
| `feeRecipient` | 手续费接收地址 |
| `assetToStreamingOiCap` | `[[coin, oiCapUsd], ...]` —— 该 dex 上每个合约的 **流式 OI 上限**（USD，字符串） |
| `subDeployers` | 子操作权限分配 |
| `deployerFeeScale` | 部署者抽成（多数为 1.0） |
| `assetToFundingMultiplier` | `[[coin, multiplier], ...]` —— 资金费率额外倍数 |
| `assetToFundingInterestRate` | `[[coin, baseRate], ...]` —— 基础利率 |

**当前活跃子 dex**（2026-05 实测）：

| name | fullName | 资产域 | 合约数 |
|---|---|---|---|
| `xyz`  | XYZ (TradeXYZ) | 美股 / 指数 / 商品 / FX / 韩日股 ETF | 75 |
| `flx`  | Felix Exchange | 美股 + 商品（USDe 抵押） | 15 |
| `vntl` | Ventuals | pre-IPO + 主题指数 | 15 |
| `hyna` | HyENA | 加密 perp（USDe 抵押） | 24 |
| `km`   | Markets by Kinetiq | 美股 + **港股镜像（TENCENT/XIAOMI/BABA）** | 22 |
| `cash` | dreamcash | 美股 + KWEB/EWY | 15 |
| `para` | Paragon | BTCD/TOTAL2 加密主导率 | 3 |
| `abcd` | ABCDEx | 早期，无活跃合约 | 0 |

### 2.2 `meta` — 列某个 dex 的合约 universe（不含实时市场数据）

```bash
curl -s -X POST $API -H 'Content-Type: application/json' \
  -d '{"type":"meta","dex":"xyz"}'
```

**注意**：`dex` 留空字符串 `""` = 主加密 perp dex。

**返回**：`{ universe: [...], marginTables: [...] }`

`universe[i]`：

| 字段 | 含义 |
|---|---|
| `name` | 合约名（HIP-3 dex 会自带前缀，如 `xyz:NVDA`） |
| `szDecimals` | 合约最小数量小数位 |
| `maxLeverage` | 最大杠杆（NVDA = 20，SPX = 50，Pre-IPO = 3） |
| `marginTableId` | 关联的保证金阶梯表 ID |
| `growthMode` | `enabled` / `disabled` |
| `onlyIsolated` | 是否仅支持逐仓 |
| `isDelisted` | 是否已下架 |

### 2.3 `metaAndAssetCtxs` — universe + 实时市场上下文（**最常用**）

```bash
curl -s -X POST $API -H 'Content-Type: application/json' \
  -d '{"type":"metaAndAssetCtxs","dex":"xyz"}'
```

**返回**：长度 2 的数组，`[0]` = meta（同 2.2），`[1]` = `assetCtxs[]`，长度与 universe 一致，**位置一一对应**。

`assetCtxs[i]`：

| 字段 | 含义 |
|---|---|
| `markPx` | 标记价（撮合价 + premium，USDC） |
| `oraclePx` | 预言机价（外部喂价） |
| `midPx` | 当前买卖中价 |
| `prevDayPx` | 24h 前价格 |
| `funding` | **每小时**资金费率（小数，0.0000225 = 0.00225%/h） |
| `premium` | (markPx - oraclePx) / oraclePx，小数 |
| `openInterest` | 持仓量（合约单位，**不是 USD**） |
| `dayBaseVlm` | 24h 成交量（合约单位） |
| `dayNtlVlm` | 24h 名义成交（USDC） |
| `impactPxs` | `[bid_impact, ask_impact]` —— 一档冲击价 |

**OI 美元化**：`oiNotionalUsd = openInterest * markPx`（本 skill snapshot.sh 已自动算）

**funding 年化**：`fundingApr = fundingHourly * 24 * 365 * 100`（百分数）—— Hyperliquid funding 间隔为 1 小时，与 Binance 8 小时不同

### 2.4 `fundingHistory` — 资金费率时间序列

```bash
START=$(($(date +%s) - 86400))000  # 毫秒
curl -s -X POST $API -H 'Content-Type: application/json' \
  -d "{\"type\":\"fundingHistory\",\"coin\":\"xyz:NVDA\",\"startTime\":$START}"
```

**入参**：

| 字段 | 必填 | 说明 |
|---|---|---|
| `coin` | ✅ | 合约名（含 dex 前缀） |
| `startTime` | ✅ | 毫秒时间戳 |
| `endTime` | 否 | 默认现在 |

**返回**：数组，每项 `{ coin, fundingRate, premium, time }`，间隔 1 小时

### 2.5 `candleSnapshot` — K 线（含闭市段）

```bash
curl -s -X POST $API -H 'Content-Type: application/json' \
  -d '{
    "type":"candleSnapshot",
    "req":{
      "coin":"xyz:NVDA",
      "interval":"1h",
      "startTime":1778659200000,
      "endTime":1778745600000
    }
  }'
```

**支持 interval**：`1m` / `3m` / `5m` / `15m` / `30m` / `1h` / `2h` / `4h` / `8h` / `12h` / `1d` / `3d` / `1w` / `1M`

**返回**：数组，每根 K 线：

| 字段 | 含义 |
|---|---|
| `t` | open time（ms） |
| `T` | close time（ms） |
| `s` | symbol（同 coin） |
| `i` | interval |
| `o` / `h` / `l` / `c` | 开高低收（字符串数字） |
| `v` | 成交量（合约单位） |
| `n` | 成交笔数 |

**美股闭市段定位**（UTC）：
- 盘前：13:00-14:30
- 盘中：14:30-21:00
- 盘后：21:00-01:00（次日）
- 闭市：01:00-13:00 + 周六全天 + 周日 < 22:00

闭市段的 1h 收盘价 - 上一个盘后收盘价 = **链上隐含次日开盘**（流动性 ≥ 1M USD 的合约才可信）

## 3. coin 命名规范

- **主加密 dex**：直接是符号，如 `BTC` / `ETH` / `SOL`
- **HIP-3 子 dex**：`{dexName}:{ASSET}`，如 `xyz:NVDA` / `vntl:OPENAI` / `km:TENCENT`
- 同一标的可能在多个 dex 都有合约（如 NVDA 在 xyz / km / cash / flx 都有），需先用 OI 选最佳

## 4. 限流与重试策略

- 单 IP 1200 次/分钟，本 skill 默认调用：
  - `snapshot.sh`（全部 dex）：1 + N 次（N = 5 个传统资产 dex）= ~6 次
  - `lookup.sh --json`：相同 6 次 + 1 次 fundingHistory = 7 次
- 真实压力：单次完整调用 < 1 秒，远低于限流
- 429 处置：脚本不内置重试，调用方在 wrapper 里加 `sleep 2 && retry` 即可

## 5. 数据时效与一致性边界

| 维度 | 行为 |
|---|---|
| **markPx 更新频率** | 每个 block（< 1s） |
| **funding rate 更新** | 每 1 小时整点结算 |
| **OI / 24h vol 更新** | 实时，但 24h 是滚动窗口 |
| **历史 K 线保留** | 至少 30 天（实测）；更长历史需调用方自己持久化 |
| **跨 dex oracle 一致性** | 同标的偏差通常 < 0.1%，> 0.5% 视为异常 |

## 6. 与官方文档的对应关系

- 官方文档：<https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/info-endpoint>
- 本 skill 版本固定为**当前生产 schema**；如未来字段增减，先跑 `snapshot.sh xyz | head -n 1` 看 jq 输出是否报 null，再决定是否升级
