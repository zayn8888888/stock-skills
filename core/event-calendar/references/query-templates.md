# Tavily 关键词模板（中港 + 行业政策兜底）

> 经济数据发布日程优先用富途日历（含沪市）。这里的 Tavily 只补政策、监管、没有结构化日期的事件。Polymarket 极少有人民币区资产相关市场。
>
> 模板里的占位符：`{YYYY-MM}` 当月、`{NEXT-MM}` 下个月、`{INDUSTRY_CN}` 中文行业名、`{INDUSTRY_EN}` 英文行业名。

## 1. 中国央行 / 货币政策

| Query | 主要目标域 |
|-------|----------|
| `"PBOC rate decision next meeting" {YYYY-MM}` | reuters.com / bloomberg.com / caixin.com |
| `中国人民银行 利率决议 {NEXT-MM}` | caixin.com / 21jingji.com / sina.com.cn |
| `LPR rate quotation schedule {YYYY-MM}` | reuters.com / pbc.gov.cn |
| `中国 LPR 报价 {NEXT-MM}` | sina.com.cn / cls.cn |
| `MLF operation schedule China` | bloomberg.com / reuters.com |
| `China RRR cut rumor next month` | reuters.com / scmp.com |

## 2. 香港金管局 / 港股政策

| Query | 主要目标域 |
|-------|----------|
| `HKMA discount rate next meeting` | hkma.gov.hk / scmp.com |
| `香港金管局 议息 {NEXT-MM}` | hk01.com / mingpao.com |
| `Hong Kong Linked Exchange Rate update` | scmp.com / bloomberg.com |
| `恒指调整 调入 调出 {NEXT-MM}` | hkex.com.hk / aastocks.com |
| `Hang Seng Index reshuffle announcement` | hkex.com.hk |

## 3. 中港经济数据释放日历

| Query | 主要目标域 |
|-------|----------|
| `China economic data release calendar {NEXT-MM}` | tradingeconomics.com / reuters.com |
| `中国 PMI 发布 {NEXT-MM}` | stats.gov.cn / sina.com.cn |
| `China CPI release date {NEXT-MM}` | reuters.com |
| `China trade balance import export {NEXT-MM}` | customs.gov.cn / reuters.com |
| `中国 社融 信贷 {NEXT-MM}` | pbc.gov.cn / cls.cn |
| `Hong Kong GDP release schedule` | censtatd.gov.hk / scmp.com |

## 4. 港股财报日历兜底（富途和 Finnhub 都没有日期时启用）

触发条件：富途 `get_earnings_calendar.py --market HK` 的窗口结果里没有目标代码，且 Finnhub `/calendar/earnings?symbol=<CODE>.HK` 返回空数组，或返回 `date` 但 `epsEstimate / revenueEstimate` 全 null。

### 4.1 三层并行 query

| 顺序 | Query 模板 | 主要目标域 | 期望抽取 |
|------|-----------|----------|---------|
| Q1 | `site:hkex.com.hk {CODE} 業績公告 {NEXT-MM}` | hkex.com.hk | 公告原文 + 准确披露日 |
| Q2 | `{中文公司名} 業績 公布日期 {NEXT-MM}` | aastocks.com / mingpao.com / cls.cn | 中文媒体确认日 |
| Q3 | `"{English Company Name}" earnings date Hong Kong {YYYY-MM}` | scmp.com / reuters.com / bloomberg.com | 英文媒体共识日 + 估值（如有） |

> ⚠️ Q1 必须 `site:hkex.com.hk` 严格限定——港交所披露日是权威源；Q2 / Q3 仅在 Q1 失败时启用。

### 4.2 Tavily 调用示例（腾讯）

```python
# Q1：site: 港交所
mcp__plugin_tavily-web-search_tavily-web-search__tavily_search(
  query="site:hkex.com.hk 0700 業績公告 2026年5月",
  topic="news", days=14, max_results=5
)

# Q1 命中即停；失败再 Q2
mcp__plugin_tavily-web-search_tavily-web-search__tavily_search(
  query="腾讯控股 業績 公布日期 2026年5月",
  include_domains=["aastocks.com", "mingpao.com", "cls.cn"],
  topic="news", days=14, max_results=5
)
```

### 4.3 信息抽取规则

从 Tavily 返回的标题 + 摘要里抽：

| 字段 | 抽取关键词 |
|------|----------|
| 披露日期 | `將於 X 月 X 日`、`scheduled for`、`to release on`、`公布 X 月 X 日` |
| 时段 | `收市後 / 盤後 / 收盘后` → amc；`午間 / 中午` → during；`開市前 / 早晨` → bmo |
| 共识值（可选） | 仅当 Q3 摘要明确给出"市场预期 EPS X / Rev XB" 时抽取，否则留 "待披露" |

**禁止操作**：
- ❌ 从 Tavily 文章正文里硬猜披露日（"上次是 5/14，所以这次也是 5/14"）—— 港股财报披露日由公司决定，无规律
- ❌ 把分析师预测的 EPS 当成"共识"——分析师预测 ≠ Bloomberg / Refinitiv 系统共识，标"分析师预测 EPS X.XX（来源 X）" 而非裸数字
- ❌ 港股 ticker 错配：`HK.00700` 在 Tavily 里要写 `0700`（去前导 HK 与多余 0），中文媒体常用 `00700` 或纯名字

### 4.4 港股常用 ticker 对照

参见 `SKILL.md` A2.2 节末尾对照表（此处不重复）。

## 5. 中国行业政策（按板块拆）

通用模板：`{INDUSTRY_CN} 政策 监管 {NEXT-MM}` + 英文版 `{INDUSTRY_EN} regulation policy China {YYYY-MM}`。

具体板块关键词建议：

| 板块 | 中文关键词 | 英文关键词 |
|------|----------|----------|
| AI / 大模型 | "大模型 监管" / "生成式 AI 备案" / "网信办 AI" | "China AI regulation" / "CAC LLM filing" |
| 新能源车 | "新能源车 补贴" / "以旧换新" / "充电桩 政策" | "China EV subsidy" / "NEV credit policy" |
| 半导体 | "半导体 出口管制" / "存储 芯片 政策" | "China semiconductor export control" / "chip ban" |
| 医药 | "医药 集采" / "药品 谈判" / "国家医保局" | "China drug procurement" / "NRDL negotiation" |
| 房地产 | "房地产 政策" / "保交楼" / "白名单" | "China property policy" / "housing stimulus" |
| 互联网平台 | "平台经济 监管" / "反垄断 互联网" | "China platform regulation" / "antitrust tech" |
| 光伏 | "光伏 政策" / "硅料 价格 调控" | "China solar policy" / "polysilicon regulation" |
| 教育培训 | "教培 政策" / "双减" | "China tutoring regulation" / "K-12 policy" |
| 游戏 | "游戏版号" / "防沉迷" | "China game license" / "minor gaming rule" |

## 6. 中美贸易 / 关税

| Query | 主要目标域 |
|-------|----------|
| `Trump tariff China {YYYY-MM}` | reuters.com / bloomberg.com / wsj.com |
| `US-China trade deal next round` | reuters.com / scmp.com |
| `Section 301 tariff review schedule` | ustr.gov / reuters.com |
| `中美贸易 关税 {NEXT-MM}` | sina.com.cn / cls.cn |
| `China retaliatory tariff schedule` | reuters.com |

## 7. 官方域名优先级（**重要：上一版 0 命中的根因**）

中港政策日程公告几乎只在官方渠道首发，路透/Bloomberg 是二手转载。**Tavily query 必须先用 `site:` 限定官方源**，全文搜不到再放宽。

### 6.1 一级官方源（首选 site: 限定）

| 主题 | 官方域名 | site: 限定示例 |
|------|---------|--------------|
| PBOC / 央行 | `pbc.gov.cn` | `site:pbc.gov.cn 货币政策委员会` |
| 中国统计局（PMI / CPI / 工业 / 投资 / 消费） | `stats.gov.cn` | `site:stats.gov.cn 数据发布日程` |
| 中国海关（贸易数据） | `customs.gov.cn` | `site:customs.gov.cn 进出口` |
| HKMA | `hkma.gov.hk` | `site:hkma.gov.hk press release` |
| 港交所 | `hkex.com.hk` | `site:hkex.com.hk 恒生指数 检讨` |
| HK 政府新闻 | `info.gov.hk` | `site:info.gov.hk policy address` |
| 香港统计处 | `censtatd.gov.hk` | `site:censtatd.gov.hk` |
| 网信办（AI 备案、平台监管） | `cac.gov.cn` | `site:cac.gov.cn 生成式人工智能` |
| 证监会 | `csrc.gov.cn` | `site:csrc.gov.cn` |
| 国家医保局（集采） | `nhsa.gov.cn` | `site:nhsa.gov.cn 集中采购` |
| 财政部（关税） | `mof.gov.cn` | `site:mof.gov.cn 关税` |
| USTR（美方关税） | `ustr.gov` | `site:ustr.gov section 301` |

### 6.2 二级权威源（site: 限定失败再用）

按可信度排序：reuters.com > bloomberg.com > wsj.com > caixin.com > scmp.com > 21jingji.com > cls.cn

### 6.3 调用顺序

```
Step 1: site: 限定一级官方源 → 命中即采用
Step 2: 失败则去掉 site:，限定二级权威源 include_domains
Step 3: 再失败 → 写"未检索到"，**不要硬编**未来日期
```

### 6.4 调用示例（PBOC LPR）

```python
# Step 1：site: 官方源
mcp__plugin_tavily-web-search_tavily-web-search__tavily_search(
  query="site:pbc.gov.cn LPR 报价 公告",
  topic="news", days=14, max_results=5
)

# Step 1 失败 → Step 2：路透 + 财新
mcp__plugin_tavily-web-search_tavily-web-search__tavily_search(
  query="LPR rate quotation schedule next month",
  include_domains=["reuters.com", "bloomberg.com", "caixin.com"],
  topic="news", days=14, max_results=5
)
```

## 8. 调用建议

### 并行 vs 串行

四组（央行 / HKMA / 经济数据 / 关税）**默认并行调用**，每组 1 条 query 即可，避免一次拉太多新闻 token。

### topic 与 days 参数

```
topic = "news"
days = 7        # 一般场景
days = 3        # 用户明确说"最近的"或"刚出来的"
days = 14       # 行业政策类（迭代慢，14 天才能覆盖到月度发文节奏）
```

### 结果二次过滤

Tavily 返回后，Claude 必须过一遍**自检**：

1. 标题/正文出现**未来日期**（"将于"、"scheduled for"、"next month"、"在 X 月召开"），否则不进主表
2. 排除"分析师预测"类纯观点文章——只要"会议日程 / 数据发布日 / 政策实施日"
3. 同一事件多源命中 → 取最权威源（路透 > Bloomberg > 财新 > 21 财经 > 第一财经 > 其它）
4. 同源多篇命中 → 取 published_date 最新的一篇

### 不要做的事

- ❌ 不要把"分析师预测降息 25bp"当作未来事件——它不是事件，是观点
- ❌ 不要拉"过去一周回顾"类周报——本 skill 看未来，不看历史
- ❌ 不要相信单一标题党源（财经头条 / 雪球热文等）

## 9. 失败兜底

如果某组 query 返回 0 条或全部被自检过滤，**不要硬填**——在输出里写：

```
> Tavily 中港政策搜索：央行政策组 {NEXT-MM} 暂未检索到明确日程
```

让用户知道是真的没搜到，不是 skill 漏了。
