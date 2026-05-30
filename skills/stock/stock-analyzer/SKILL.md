---
name: stock-analyzer
description: 个股多维分析助手。基于内置数据源能力（实时行情、K线、资金流、技术指标、新闻、期权、板块等），对单只股票做九个维度的综合分析，输出结构化分析报告。触发场景：(1) 用户要求"分析 XXX / XXX 怎么样 / XXX 值不值得买 / 帮我看看 XXX"；(2) 用户问"XXX 为什么涨/跌 / 能不能抄底 / 要不要加仓减仓"；(3) 用户提到个股并想了解基本面/技术面/衍生品综合情况。
---

# 个股多维分析

## 核心原则

1. **数据先行，结论在后**：每个判断必须有具体数据支撑，不编造、不夸大
2. **多空并陈，不做单边**：同时列出利多 / 利空 / 风险，帮用户建立完整决策框架
3. **拒绝迎合语气**：即使用户倾向某方向，也要客观列出反驳论据
4. **不出买卖指令**：只提供分析框架和数据，最终决策权交给用户
5. **标注数据时效**：行情数据标清时点，新闻/公告标清日期

## 执行契约

**硬约束，不满足不出报告**：

1. **九个维度全部覆盖**——维度 1-7 必做；维度 8 对美股/港股必做，A 股标注"本市场无期权，跳过"；维度 9 必做
2. **能并行的工具一次性并行调用**，数据齐全后统一输出报告
3. **核心维度调用报错必须重跑（最多 3 次，3 次后标注原因继续）**；非核心维度报错标注 ❌ 跳过并从新闻补充
4. **每个维度结尾加数据完整性自检**：列出本维度所有工具 + 调用结果（✅/❌/⏭️）
5. **每张表、每段数据必须标来源**：格式 `[来源: 工具名]`

## 代码格式

收到 ticker 后直接使用 `ticker` + `market` 参数，无需手动拼接格式：
- 纯字母 `NVDA` → `ticker: "NVDA", market: "US"`
- 港股 `00700` → `ticker: "00700", market: "HK"`
- A 股 `600519` → `ticker: "600519", market: "SH"`

先单独调一次 `get_quote_snapshot` 验证连通性，再展开并行。

## 九维度分析流程

### 维度 1：基础行情（必做）

```
get_quote_snapshot({ ticker, market })
```

提取：curPrice / openPrice / highPrice / lowPrice / lastClosePrice / volume / turnover / turnoverRate / amplitude。

美股需关注 `pre_price` / `after_price` / `overnight_price`（若有数据）。pe/pb/marketCap 从 `company_info` 补充。

### 维度 2：技术走势（必做）

```
get_technical_indicators({ ticker, market })      // SMA/RSI/MACD/BOLL
get_quote_kline({ ticker, market, params: { num: 30 } })  // 近30日K线
```

先执行异动扫描：检查近 30 日是否有「单日绝对涨跌幅 >15% 且量比 >5x」。若有，暂停并用 `get_corporate_dividends` + `get_news_search` 排查原因。

常规分析：近 30 日高低点 / 当前相对位置 / 是否破位 / 量价配合 / 均线关系。

**相对强度**（并行拉取基准 K 线）：美股用 SPY、A 股用 000300、港股用 HSI。计算超额收益。

### 维度 3：估值与基本面（必做）

```
get_company_info({ ticker, market })         // PE/PB/市值/EPS/股息率
get_valuation_detail({ ticker, market })     // PE百分位/前瞻PE
get_financial_statements({ ticker, market, params: { num: 4 } })
```

输出：pe 百分位（<0.2 低估 / >0.8 高估）/ 前瞻 vs 当前 pe / 财务趋势。

### 维度 4：资金流向（必做）

```
get_capital_flow({ ticker, market, params: { periodType: 2 } })  // 日级
get_capital_distribution({ ticker, market })                      // 超大/大/中/小单
```

输出：主力净流入趋势 / 大单占比 / 资金集中度。连续 3 日以上单向流入/流出标注信号。

### 维度 5：盘口与成交（必做）

```
get_quote_depth({ ticker, market, params: { levels: 10 } })
```

重点：买卖盘深度对比 / 买卖价差 / 流动性评估。用快照 turnover 字段计算冲击成本。

### 维度 6：同行对比（必做）

```
get_plate_list({ market, params: { plateSetType: 1 } })  // 行业板块
get_plate_stocks({ market, params: { plateCode: "..." } })
```

选 2-3 家业务相近的同行，对比 pe / pb / 股息率 / 当日涨跌幅。

### 维度 7：新闻与事件（回看，必做）

```
get_news_search({ ticker, params: { maxResults: 10 } })
get_sentiment_feed({ ticker })
get_corporate_dividends({ ticker, market })
```

结构化公告（分红）+ 新闻搜索 + 情绪数据。价格异动 ≥5% 必做反向追溯。

### 维度 8：期权链（美股/港股必做）

```
get_options_chain({ ticker, market })
```

分析：看涨/看跌比 / 大行权价集中度 / IV skew / Max Pain。A 股标注"本市场无期权，跳过"。

### 维度 9：事件日历（前瞻，必做）

调用 `event-calendar` skill 获取未来 14 天相关事件。未安装时用 `get_news_search` 降级。

## 综合研判输出

- **利多**：列出支持上涨的数据点
- **利空**：列出支持下跌的数据点
- **风险提示**：需要关注的潜在风险
- **关键信号**：等待什么信号确认拐点

## 常见陷阱速查

- **pe 失真**：周期股底部 pe 反而高；亏损股无 pe
- **资金流向仅参考**：单日净流入不等于后续上涨，看 3-5 日趋势
- **盘口可伪造**：大额挂单需结合逐笔成交验证
- **期权 OI ≠ 方向**：高 Put OI 可能是机构买保险；判方向看 IV skew

## 什么时候答"不确定"

- 数据工具调用失败且重试无效
- 数据明显异常（PE 负值、成交量为 0）
- 预测性问题（"明天会涨吗"）

## 输出调性

- 克制中性，不用"强烈推荐"、"必涨"、"肯定跌"
- 金额用"亿/万"口径，百分比保留 1-2 位小数
- 关键数据用粗体/表格强化

## 可选增强技能（Optional Enhancements）

以下技能可作为增强分析的补充，核心数据已通过上述工具获取：

- `futu-technical-anomaly`：技术面异动检测
- `futu-capital-anomaly`：资金流向异动检测
- `futu-news-search`：新闻搜索增强
- `futu-comment-sentiment`：市场评论情绪分析
- `futu-derivatives-anomaly`：衍生品异动检测
- `futu-stock-digest`：个股摘要生成
