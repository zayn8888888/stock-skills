# 数据源详解

## A. Finnhub

### 概览

- 官网：<https://finnhub.io/>
- 文档：<https://finnhub.io/docs/api>
- 鉴权：query 参数 `token={api_key}`
- 免费版：60 calls/min；付费版起步 \$50/mo

### A1. Economic Calendar

```
GET https://finnhub.io/api/v1/calendar/economic?from=YYYY-MM-DD&to=YYYY-MM-DD&token=XXX
```

返回：

```json
{
  "economicCalendar": [
    {
      "actual": null,
      "country": "US",
      "estimate": 2.4,
      "event": "Core CPI YoY",
      "impact": "high",
      "prev": 2.5,
      "time": "2026-05-13 12:30:00",
      "unit": "%"
    }
  ]
}
```

**字段使用建议**：

| 字段 | 用法 |
|------|------|
| `country` | 过滤 `US` / `EU` / `CN` / `HK` / `JP` 等。注意：CN 数据稀疏，不要单靠 Finnhub |
| `event` | 事件名英文原文，输出时直接使用，不要硬翻译，避免歧义 |
| `impact` | `high` / `medium` / `low`，本 skill 只用 high + medium |
| `time` | UTC 时间，输出时按调用方需要转 HKT |
| `actual / estimate / prev` | actual = 已发布的实际值；estimate = 市场共识；prev = 上期值 |
| `unit` | %, K, M, B 等，输出时一定要带，不然数字无意义 |

### A2. Earnings Calendar

```
GET https://finnhub.io/api/v1/calendar/earnings?from=YYYY-MM-DD&to=YYYY-MM-DD[&symbol=XXX]&token=XXX
```

返回：

```json
{
  "earningsCalendar": [
    {
      "date": "2026-05-13",
      "epsActual": null,
      "epsEstimate": 0.74,
      "hour": "amc",
      "quarter": 1,
      "revenueActual": null,
      "revenueEstimate": 43200000000,
      "symbol": "NVDA",
      "year": 2027
    }
  ]
}
```

**字段使用建议**：

| 字段 | 用法 |
|------|------|
| `symbol` | 输出时拼成 `US.{symbol}` 与项目其它 skill 对齐 |
| `hour` | `bmo`(盘前) / `amc`(盘后) / `dmh`(盘中)；显示在事件名后 |
| `quarter / year` | 财年信息，例 NVDA 财年错位，要按 quarter+year 标 |
| `epsEstimate / revenueEstimate` | 市场共识；revenue 用千 / 百万 / 十亿格式化 |
| `epsActual / revenueActual` | 已发布的实际值，未发布为 null |

### A3. 错误码

| HTTP | 含义 | 处理 |
|------|------|------|
| 401 | API key 无效 | 提示用户检查 `FINNHUB_API_KEY` |
| 403 | 此端点需付费 | 极少出现（economic / earnings 是免费） |
| 429 | 限流 | sleep 60s 后重试一次，再失败就跳过 |
| 5xx | 服务端错误 | 跳过，标注"Finnhub 暂不可用" |

### A4. 港股 / A 股覆盖说明

- **港股**：`/calendar/earnings` 支持港股 symbol（如 `0700.HK`），但**字段经常为空**（estimate 缺失），不可靠；港股财报建议走 Tavily 兜底
- **A 股**：基本不覆盖；不要尝试

---

## B. Polymarket

### 概览

- 官网：<https://polymarket.com/>
- API：<https://gamma-api.polymarket.com/markets>（Gamma API，市场元数据）
- CLOB API：<https://clob.polymarket.com/>（订单簿与历史价格，本 skill 暂不需要）
- 鉴权：**无需 key**，public read-only
- 限流：未公开明确数字，实测 100 req/min 以下安全

### B1. 列出活跃市场

```
GET https://gamma-api.polymarket.com/markets?closed=false&active=true&limit=100&order=volume24hr&ascending=false
```

参数说明：

| 参数 | 说明 |
|------|------|
| `closed=false` | 排除已结算市场 |
| `active=true` | 仅返回正在交易的 |
| `limit=100` | 单次最多 100 条（默认 20） |
| `order=volume24hr` | 按 24h 成交量排序，配合 `ascending=false` 取最热 |
| `tag_id=...` | 可选：按标签过滤（如 politics / crypto / sports）；本 skill 不用，Claude 自己分类更灵活 |

返回（数组，节选关键字段）：

```json
[
  {
    "question": "Will the Fed cut rates by 25bps in May 2026?",
    "slug": "fed-rate-cut-may-2026",
    "endDate": "2026-05-15T20:00:00Z",
    "volumeNum": 2347891.5,
    "outcomes": "[\"Yes\", \"No\"]",
    "outcomePrices": "[\"0.73\", \"0.27\"]",
    "description": "This market resolves YES if the Federal Reserve...",
    "category": "Politics",
    "active": true,
    "closed": false
  }
]
```

> ⚠️ `outcomes` 和 `outcomePrices` 是 **JSON 字符串**而非数组，jq 处理时要 `fromjson`：
>
> ```bash
> jq '.[] | {q: .question, prices: (.outcomePrices | fromjson)}'
> ```

### B2. 单个市场详情

```
GET https://gamma-api.polymarket.com/markets/{condition_id}
```

本 skill 暂不需要——列表接口已经够用。

### B3. 流动性门槛与噪声过滤

| 阈值 | 含义 |
|------|------|
| `volumeNum < 50000` | 不采纳，价格噪声大 |
| `volumeNum 50k - 200k` | 采纳但标"低流动性，参考用" |
| `volumeNum > 200k` | 主表展示 |
| `endDate` 距今 > 180 天 | 不采纳，时间太远，与短期日历无关 |

### B4. 分类与过滤

Polymarket `category` 字段可信度一般，**不要直接用**——同一条市场可能挂在 "Politics" 但内容是关税。

由 Claude 读 `question + description` 自行分类（本 skill 主流程的「数据源 B：B2 分类与过滤」表）。

---

## C. Tavily

### 概览

- 调用方式：`mcp__plugin_tavily-web-search_tavily-web-search__tavily_search`
- 已经在项目内现成集成（参考 `stock-analyzer/SKILL.md` L108-120）
- 限流：取决于用户的 Tavily plan

### C1. 推荐参数

```python
{
  "query": "<关键词>",
  "topic": "news",          # 强制 news topic，过滤掉旧文档
  "days": 7,                # 限近 7 天发布
  "max_results": 5,
  "search_depth": "basic"   # basic 已经够用，advanced 翻倍计费
}
```

### C2. 关键词模板

完整模板见 `query-templates.md`。简要原则：

- 中港政策类用**中英混合 query**（中文社媒 + 英文路透/Bloomberg 双覆盖）
- 加日期/月份关键词，避免拉到旧政策
- 重点目标域优先（reuters.com / bloomberg.com / caixin.com / scmp.com / hkma.gov.hk）

### C3. 结果筛选

只采纳同时满足以下条件的结果：

1. `published_date` 在最近 7 天
2. 内容明确提到一个**未来日期**（"将于 X 月 X 日" / "next week" / "scheduled for"）
3. 来源可信

不满足的列入"参考线索"区，不进主表。
