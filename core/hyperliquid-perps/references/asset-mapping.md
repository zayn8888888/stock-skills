# 资产映射 — 传统标的 → Hyperliquid 镜像

> 数据基准：2026-05-14 实测 `perpDexs` + `metaAndAssetCtxs`。如出现新合约或下架，请重跑 `./scripts/snapshot.sh` 更新本表。

## 选 dex 的硬规则

调用 `lookup.sh {ticker} --best` 时，按以下顺序判定主镜像：

1. **OI 名义美元值**（`openInterest × markPx`）最大的那个 dex
2. 同 OI 时优先 `xyz`（TradeXYZ，市占 ~85%）
3. OI < 100k USD 的镜像列表中标记为"⚠️ 仅参考"，不进入信号引用

## 一、美股个股（流动性 高）

| Ticker | 主 dex | 备选 dex | 类型 | 备注 |
|---|---|---|---|---|
| NVDA | xyz | cash, km, flx | 半导体 | OI ~120M USD，流动性最佳 |
| TSLA | xyz | cash, km, flx | EV | |
| AAPL | xyz | km | 大型科技 | |
| MSFT | xyz | cash, km | 大型科技 | |
| GOOGL | xyz | cash, km | 大型科技 | |
| META | xyz | cash | 大型科技 | |
| AMZN | xyz | cash | 大型科技 | |
| AMD | xyz | — | 半导体 | |
| INTC | xyz | cash | 半导体 | |
| MU | xyz | km | 半导体（内存） | |
| MRVL | xyz | — | 半导体 | |
| ARM | xyz | — | 半导体 | |
| TSM | xyz | — | 半导体（代工） | |
| SNDK | xyz | — | 半导体（NAND） | |
| ORCL | xyz | — | 软件 | |
| LLY | xyz | — | 制药 | |
| NFLX | xyz | — | 流媒体 | |
| COST | xyz | — | 零售 | |
| EBAY | xyz | — | 电商 | |
| HOOD | xyz | cash | 经纪 | |
| ZM | xyz | — | SaaS | |
| BX | xyz | — | 资管 | |
| BABA | xyz | km, cash | 中概 | OI ~9M USD |
| GME | xyz | — | meme | |
| HIMS | xyz | — | 医疗 | |
| RIVN | xyz | — | EV | |
| RKLB | xyz | — | 航天 | |
| DKNG | xyz | — | 体育博彩 | |
| PLTR | xyz | km | 数据 | |
| BIRD | xyz | — | — | |
| CRWV | xyz | — | AI 基建 | |
| BMNR | km | — | — | km 独有 |
| RTX | km | — | 国防 | km 独有 |
| H100 | xyz | — | — | |

### 加密概念股（重要，本身就是加密-股票联动）

| Ticker | 主 dex | 备注 |
|---|---|---|
| MSTR | xyz | BTC 持仓代理 |
| COIN | xyz, flx | 加密交易所 |
| CRCL | xyz, flx | 稳定币（Circle） |

## 二、港股 / 中概镜像（⚠️ 流动性低）

| 标的 | 富途代码 | Hyperliquid 镜像 | OI | 可用性 |
|---|---|---|---|---|
| 腾讯控股 | HK.00700 | `km:TENCENT` | ~98k USD | ⚠️ 仅参考价 |
| 小米集团 | HK.01810 | `km:XIAOMI` | ~44k USD | ⚠️ 仅参考价 |
| 阿里巴巴 | HK.09988 / BABA | `xyz:BABA`（首选）/ `km:BABA` / `cash:BABA` | ~9M USD（xyz） | ✅ 可信 |

> ⚠️ km dex 上的港股镜像 OI 都 < 100k USD，**只能用作"次日开盘隐含价"参考**，不能用于资金费率/拥挤度等情绪信号判断。

## 三、Pre-IPO（Ventuals 独家）

| 公司 | Hyperliquid 合约 | OI（USD） | 杠杆 | 备注 |
|---|---|---|---|---|
| Anthropic | `vntl:ANTHROPIC` | ~5.9M USD | 3x | premium 1500+ bp |
| OpenAI | `vntl:OPENAI` | ~3.0M USD | 3x | premium 1000+ bp |
| SpaceX | `vntl:SPACEX` | ~3.5M USD | 3x | premium 1100+ bp |

**重要**：Pre-IPO 永续因为没有现货可借券做空，premium 长期高于 1000 bp 是结构性特征，**不是"多头过热"信号**。可作为"市场对该公司估值上限"的隐含定价。

## 四、指数

| 标的 | 主 dex | 备选 | OI（USD） | 备注 |
|---|---|---|---|---|
| **S&P 500** | `xyz:SP500` | `cash:USA500`, `flx:USA500`, `km:US500` | ~487M USD | **官方授权（S&P Dow Jones）**，链上唯一合规 |
| Nasdaq 100 风格 | `xyz:XYZ100` | `flx:USA100`, `km:USTECH` | ~358M USD | XYZ100 = TradeXYZ 自创 100 指数（剔除金融） |
| **VIX** | `xyz:VIX` | — | 中 | 波动率 |
| 日经 225 | `xyz:JP225` | — | 中 | |
| Nifty 50 | `xyz:NIFTY` | — | 中 | 印度 |
| 韩国 200 | `xyz:KR200` | — | 中 | |
| Russell 2000 | `km:SMALL2000` | — | 低 | km 独有 |

### 主题指数（Ventuals）

| 主题 | 合约 | 成分 |
|---|---|---|
| MAG7 | `vntl:MAG7` | 七大科技股 |
| 半导体 | `vntl:SEMIS` | 半导体板块 |
| 核能 | `vntl:NUCLEAR` | 核能产业链 |
| 机器人 | `vntl:ROBOT` | 机器人 |
| 国防 | `vntl:DEFENSE` | 国防工业 |
| 生物科技 | `vntl:BIOTECH` | Biotech |
| 信息技术 | `vntl:INFOTECH` | 广义 IT |
| 能源 | `vntl:ENERGY` | 能源板块 |

## 五、大宗商品

| 标的 | 主 dex | 备选 | OI |
|---|---|---|---|
| 黄金 | `xyz:GOLD` | `flx:GOLD`, `km:GOLD`, `cash:GOLD`, `hyna:GOLD` | ~130M USD |
| 白银 | `xyz:SILVER` | `flx:SILVER`, `km:SILVER`, `cash:SILVER`, `hyna:SILVER` | ~87M USD |
| 铜 | `xyz:COPPER` | `flx:COPPER` | ~50M USD |
| 铂金 | `xyz:PLATINUM` | `flx:PLATINUM` | 中 |
| 钯金 | `xyz:PALLADIUM` | `flx:PALLADIUM` | 中 |
| WTI 原油 | `xyz:CL` | `cash:WTI`, `km:USOIL` | ~147M USD |
| Brent 原油 | `xyz:BRENTOIL` | `flx:OIL` | ~300M USD |
| 天然气 | `xyz:NATGAS` | `flx:GAS` | 中 |
| TTF 气 | `xyz:TTF` | — | 低 |
| 小麦 | `xyz:WHEAT` | `vntl:WHEAT` | 中 |
| 玉米 | `xyz:CORN` | — | 低 |
| 大豆 | `vntl:SOY` | — | 低 |
| 铀 | `xyz:URANIUM` | — | 低 |
| 铀矿 | `xyz:URNM` | — | 低 |
| 铝 | `xyz:ALUMINIUM` | — | 低 |

## 六、外汇 & 区域 ETF

| 标的 | 合约 | 类型 |
|---|---|---|
| EUR/USD | `xyz:EUR`, `km:EUR` | FX |
| USD/JPY | `xyz:JPY` | FX |
| USD/KRW | `xyz:KRW` | FX |
| 美元指数 | `xyz:DXY` | FX |
| EWJ（日股 ETF） | `xyz:EWJ` | 区域 |
| EWY（韩股 ETF） | `xyz:EWY`, `cash:EWY` | 区域 |
| EWT（台股 ETF） | `xyz:EWT` | 区域 |
| EWZ（巴西 ETF） | `xyz:EWZ` | 区域 |
| KWEB（中概 ETF） | `cash:KWEB` | 区域 |
| XLE（能源 ETF） | `xyz:XLE` | 行业 |

## 七、协作约定

### stock-analyzer 调用本 skill 时

```bash
# 第一步：lookup 拿主镜像
RES=$(./hyperliquid-perps/scripts/lookup.sh $TICKER --json)

# 第二步：先看流动性
OI=$(echo "$RES" | jq '.oiNotionalUsd')
if [ "$(echo "$OI < 1000000" | bc)" -eq 1 ]; then
  echo "⚠️ 流动性不足（OI=$OI），仅作参考价"
fi

# 第三步：才引用 funding / premium 信号
```

### trading-debate 调用时

- 关注字段：`funding24h.avgApr`, `funding24h.maxApr`, `premiumBp`
- 拥挤红线：`avgApr > 100% || avgApr < -100%` 任何一个达成，作为风险辩论硬约束

### event-calendar 调用时

- 仅关注 `chgPct` 与 `markPx`，因为 event-calendar 不需要资金费率
- 用 candle 1h 看事件后 1-3 小时的链上反应
