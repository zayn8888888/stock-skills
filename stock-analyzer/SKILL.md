---
name: stock-analyzer
description: 个股多维分析助手。基于富途 OpenAPI 实时行情数据 + Tavily 新闻搜索 + event-calendar 事件日历 + hyperliquid-perps 链上永续镜像（美股 / 美元资产维度 4 资金面追加），对单只股票做行情、技术、估值、资金（含链上 funding）、盘口、同行、新闻（回看）、期权链、事件日历（前瞻）九个维度的综合分析，输出结构化分析报告。触发场景：(1) 用户要求"分析 XXX / XXX 怎么样 / XXX 值不值得买 / 帮我看看 XXX"；(2) 用户问"XXX 为什么涨/跌 / 能不能抄底 / 要不要加仓减仓 / 现在是利空出尽了吗 / 机构在赌什么方向"；(3) 用户提到个股并想了解基本面/技术面/衍生品综合情况。不适用于：纯指数/板块分析、宏观研究、纯财报深度解读。
---

# 个股多维分析

## 核心原则

1. **数据先行，结论在后**：每个判断必须有具体数据支撑，不编造、不夸大
2. **多空并陈，不做单边**：同时列出利多 / 利空 / 风险，帮用户建立完整决策框架
3. **拒绝迎合语气**：即使用户倾向某方向，也要客观列出反驳论据
4. **不出买卖指令**：只提供分析框架和数据，最终决策权交给用户
5. **标注数据时效**：行情数据标清时点，新闻/公告标清日期

## 前置依赖

富途 OpenAPI（需 OpenD）支持两种接入方式——完整 SDK 方法对照表、代码格式、已知坑见 [references/sdk-setup.md](references/sdk-setup.md)。

## 执行契约

**硬约束，不满足不出报告**：

1. **九个维度全部执行**。维度 1-7 必做；维度 8 对美股/港股必做，A 股明确标注"本市场无期权，跳过"；维度 9 必做，event-calendar 未安装时降级并标注
2. **能并行的工具一次性并行调用**，数据齐全后统一输出报告
3. **输出前按 [references/checklist.md](references/checklist.md) 自检**

## 分析流程（九维度）

### 维度 1：基础行情（必做）
```bash
python3 skills/futuapi/scripts/quote/get_snapshot.py <CODE> --json
```
提取：现价 / 开盘 / 最高 / 最低 / 昨收 / 成交量 / 成交额 / 涨跌幅 / 振幅。

### 维度 2：技术走势（必做）
```bash
python3 skills/futuapi/scripts/quote/get_kline.py <CODE> --ktype 1d --num 30 --json
```
重点：近 30 日高低点 / 当前相对位置 / 是否破位 / 量价配合 / 短期均线关系。额外触发 `futu-technical-anomaly` skill 拿量化技术信号清单，与人工解读交叉校验。

### 维度 3：估值与基本面（必做）

**Step A**：`python3 skills/futuapi/scripts/quote/get_stock_info.py <CODE> --json`  
提取：PE-TTM / PB / 股息率 / 总市值 / 流通市值 / 52 周高低 / 换手率。

**Step B（美股/港股，并行，需 OpenD）**：
```python
import futu as ft
ctx = ft.OpenQuoteContext(host='127.0.0.1', port=11111)
ret, vdata = ctx.get_valuation_detail('<CODE>')   # PE 历史序列 + 百分位 + 同板块横排
ret2, rdata = ctx.get_research_rating_summary('<CODE>')  # 分析师评级汇总
ctx.close()
# vdata['trend']['valuation_percentile'] 历史百分位 | ['forward_value'] 前瞻 PE
# rdata['inst_rating_summary_list'] 机构评级列表
```
降级：A 股 / OpenD 不可用 → 跳过 Step B，Tavily 补 `"<公司名> PE ratio analyst rating consensus"`。

输出要点：PE 百分位（<0.2 低估 / >0.8 高估）/ 前瞻 vs 当前 PE 折溢价 / 同板块 PE 排名 / 分析师买卖持有比例。

### 维度 4：资金流向（必做）
```bash
python3 skills/futuapi/scripts/quote/get_capital_flow.py <CODE> --json
python3 skills/futuapi/scripts/quote/get_capital_distribution.py <CODE> --json
```
额外触发 `futu-capital-anomaly` skill（港股买卖经纪商榜 + 卖空异动）。

**美股标的额外调用 `hyperliquid-perps` skill**（链上 24/7 多空偏向）：OI ≥ 1M USD 正常引用；< 100k 跳过。funding APR > +100% = 极度多头拥挤，< -100% = 极度空头拥挤。港股除 BABA 外 OI < 100k，A 股无镜像，均跳过。

### 维度 5：盘口与成交（必做）
```bash
python3 skills/futuapi/scripts/subscribe/subscribe.py <CODE> --types ORDER_BOOK TICKER
python3 skills/futuapi/scripts/quote/get_orderbook.py <CODE> --num 10 --json
```
重点：买卖盘深度对比 / 近 30 笔成交方向占比 / 大单集中度。

### 维度 6：同行对比（必做）
```bash
python3 skills/futuapi/scripts/quote/get_owner_plate.py <CODE> --json
python3 skills/futuapi/scripts/quote/get_plate_stock.py <PLATE_CODE> --limit 20 --json
```
选 2-3 家业务相近、市值相近的同行，对比 PE-TTM / PB / 股息率 / 当日涨跌幅。

### 维度 7：新闻与事件（回看，必做）

并行调用四类源：`futu-news-search`（官方动态）/ `futu-comment-sentiment`（社区情绪，注意已知 keyword bug）/ Tavily 监管做空 / Tavily 市场结构。

关键词用**中文公司名**；零返回走 fallback 链；价格异动 ≥5% 必做反向追溯；报告末尾必须列"未发现"显式证伪。

**完整规程、futu-comment-sentiment bug 处理、fallback 链、歧义词对策、反向追溯模板见 [references/news-search.md](references/news-search.md)**。

### 维度 8：期权链（美股/港股必做，无期权市场明确标注跳过）

先调 `futu-derivatives-anomaly` skill（快通道）；再按需走 Step 1-3 完整扫描（取到期日 → 取期权链 → 批量订阅拉 OI/IV/Greeks）。

扫描范围由数据决定（港股 ±20%，美股 ±15% 起步）；每批 ≤12 合约；必须用 `get_stock_quote.py` 不是 `get_snapshot.py`。

**完整规程、到期日选择策略、核心指标、单一 strike 极端堆积识别见 [references/options-chain.md](references/options-chain.md)**。

### 维度 9：事件日历（前瞻，必做）

调用 `event-calendar` skill：`from=今天, to=今天+14天, symbols=[<CODE>], region=US/HK/BOTH`。未安装时 Tavily 单源降级并标注。宏观节点按标的属性筛选（半导体加芯片出口管制、中概股加 PBOC + 中美贸易等）。

## 输出格式

```markdown
## 📊 <名称>(<CODE>) 多维分析 · YYYY-MM-DD HH:MM

### 1. 行情速览  ### 2. 技术面  ### 3. 估值水平
### 4. 资金面   ### 5. 盘口情绪  ### 6. 同行对比
### 7. 新闻与事件（回看）  ### 8. 期权链  ### 9. 事件日历（前瞻 14 天）

### 💡 综合研判
- **利多**：  - **利空**：  - **风险提示**：  - **关键信号**（等待什么信号确认拐点）：
```

## 常见陷阱速查

- **PE 失真**：周期股底部 PE 反而高；亏损股无 PE
- **资金流向仅参考**：单日净流入不等于后续上涨，看 3-5 日趋势
- **链上 funding ≠ 趋势预测**：反映当下拥挤度，需与现货资金流结合
- **港股链上镜像流动性不足**：除 BABA 外 OI < 100k，不要引用 funding 数字
- **盘口可伪造**：大额挂单需结合逐笔成交验证
- **期权 OI ≠ 方向**：高 Put OI 可能是机构买保险；判方向看新开仓方向和 IV skew
- **期权 Max Pain 非因果**：远离到期日参考价值很低

## 什么时候答"不确定"

- OpenD 未连接 / API 调用失败
- 数据明显异常（PE 负值、成交量为 0）
- 预测性问题（"明天会涨吗"）

## 输出调性

- 克制中性，不用"强烈推荐"、"必涨"、"肯定跌"
- 金额用"亿/万"口径，百分比保留 1-2 位小数
- 关键数据用粗体/表格强化，避免大段文字
- 用户只追问某一维度时展开该维度，否则按九维度全景输出
