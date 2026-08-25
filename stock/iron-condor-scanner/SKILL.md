---
name: iron-condor-scanner
description: 扫描美股标的的期权结构，按铁鹰(Iron Condor)策略适配度打分排序，输出适合做铁鹰的标的清单+可选铁鹰腿骨架。基于富途 OpenAPI，6维打分(流动性门槛/IV溢价/IV位/HV趋势/DTE/GEX)+财报事件期扣分+负溢价否决。当用户要找"适合做铁鹰/区间卖方/credit spread 的标的"或"扫描美股期权卖方机会"时使用。不适用于A股/港股(无美式个股期权链或结构不同)、0DTE当日博弈、纯买方做多波动率场景。
---

# Iron Condor 适配度扫描器 v2

## 用途
扫描一批美股标的，按铁鹰适配度打分排序，筛出当前适合做铁鹰/区间卖方的标的，可选输出铁鹰腿骨架。

## 用法
在本 skill 目录下执行（从仓库根跑则用 `stock/iron-condor-scanner/scripts/scan_ic.py`）：
```bash
python3 scripts/scan_ic.py                       # 默认22标的
python3 scripts/scan_ic.py --discover            # 发现模式: 大池~180标的按成交额粗筛top25再精筛(不知道做什么时用)
python3 scripts/scan_ic.py --discover --pool-size 40 --top 10 --detail 3
python3 scripts/scan_ic.py --codes US.SPY,US.IWM --output out.csv
python3 scripts/scan_ic.py --dte-min 30 --dte-max 45
```
参数：`--codes` `--discover` `--pool-size N`(发现模式入围数,默认25) `--top N` `--dte-min` `--dte-max` `--detail N`(前N名铁鹰腿) `--output CSV`

发现模式说明：内置 ~180 标的大池（纳指100/标普100 主要成分+主流ETF，均为有期权且流动性尚可的标的），先用批量快照按成交额粗筛（成交额是期权链厚度的代理指标），入围后再跑完整 6 维打分。池子靠人工维护，新晋热门股需手动补进 LARGE_POOL。

## 打分模型(6维度满分100 + 财报扣分 + 负溢价否决)

| 维度 | 分 | 数据源 | 逻辑 |
|---|---|---|---|
| 流动性(门槛) | 15 | `get_market_snapshot` 期权 bid/ask | spread<8% 得15, 8-15% 得8, >15% **淘汰** |
| IV 溢价 | 30 | `option_volatility` volatility_premium | >8% 满分, <0 零分, **<-5% 否决总分降到40** |
| IV 位 | 15 | `option_volatility` impvol_status | 高估15/震荡10/低估5 |
| 区间形态 | 10 | `option_volatility` history_volatility 序列 | 近5日/近20日 HV 比值, <0.9 收敛满分 |
| DTE | 10 | `get_option_expiration_date` | 30-45 天窗口满分 |
| GEX | 20 | 本到期日 OI×gamma 算 dealer 净 gamma | 显著正(抑制)20, 负(放大)5 |
| 财报扣分 | -15 | IV高估+溢价>4% 疑似事件期 | gap risk, 扣15+标 ⚠ |

评级：≥75 ★优秀 / 60-74 良好 / 45-59 一般 / <45 不适合

## 输出
排序表(标的/现价/DTE/IV/已实现/溢价/IVRank/HV趋势/GEX/价差/各维分/总分/评级) + 财报事件期提示 + 可选铁鹰腿骨架(delta选腿: 卖0.30/买0.18) + 可选 CSV。

## 依赖与限制
- 富途 OpenD `127.0.0.1:11111` + Python `futu-api` SDK + `pandas`；复用 `stock-skills` 的 `common.py`（脚本自动从 CLAUDE_SKILLS_DIR / ~/.claude/skills / plugin cache 定位，多版本取最新）
- 限频：option_volatility 30次/30s、option_chain 10次/30s、get_market_snapshot 单次≤400代码(全链已分批) → 标的间 sleep 3s，22 标的约 3-4 分钟
- OI 为 T+1（前一交易日收盘）；快照/IV 为实时

## 局限(诚实声明)
1. **IVRank 仅参考列非主导**：富途 `option_volatility` 的 items 只返回 ~8 个采样点（非 252 日序列），真算标准 IV Rank 需外部数据源(IVolatility/CBOE)；IV 位打分以富途 `impvol_status` 为主。
2. **GEX 为本到期日近似**：只算 DTE 窗口那个到期日的 dealer 净 gamma，非全链加总；单股 GEX 噪声大，ETF 更可信。
3. **财报拿不到未来日期**：富途只给历史财报，用"IV高估+高溢价"代理疑似事件期，实战前必须人工确认下次财报日。
4. **区间形态用 HV 趋势近似**：非真实 ATR（省 `request_history_kline` 7天额度）；realized 低 ≠ 区间稳，可能蓄势待破。
5. 打分权重经验设计（流动性门槛化避免 SPY 式虚高、负溢价否决避开 TSLA 式送钱），非唯一正确，可用 `--codes` 缩小后人工复核。
6. 输出不构成投资建议，期权卖方有风险，临期/gap/破区间均可亏。

## 与 scan_pmcc 的关系
`../pmcc-check/scripts/scan_pmcc.py` 扫 PMCC（买方 LEAPS + 卖方 short），本 skill 扫铁鹰（区间卖方），互补。均复用 stock-skills `common.py` + 富途 OpenD。
