# Polymarket 数据源

## B1. 拉取活跃市场

```bash
curl -sS "https://gamma-api.polymarket.com/markets?closed=false&active=true&limit=1000&order=volume24hr&ascending=false" \
  | jq '.[] | select(.volumeNum > 50000) | {question, slug, endDate, volumeNum, outcomes, outcomePrices, description}'
```

> ⚠️ `/markets` 端点不支持关键词搜索（`q=` 参数被忽略）。经济数据类市场（CPI/NFP）vol24h 通常偏低，会被体育/地缘市场挤出——B4 使用专用搜索端点补漏。

**关键字段**：

| 字段 | 含义 |
|------|------|
| `question` | 市场标题 |
| `outcomePrices` | 与 outcomes 对齐的价格数组（0-1），**即市场隐含概率** |
| `volume24hr` | 24h 成交量（USD），**流动性门槛用这个** |
| `endDate` | 结算日（≠ 事件日！结算日往往晚于事件日） |
| `slug` | 拼 URL：`https://polymarket.com/event/{slug}` |

**事件日抽取规则**：优先从 `question` 文本 regex 抽日期 > 从 `description` 抽 > endDate（仅 fallback）。抽不到日期标"事件日不明确"。

## B2. 分类与过滤

只保留前四类：

| 分类 | 关键词识别 |
|------|----------|
| 货币政策 | Fed, FOMC, rate cut/hike, ECB, BOJ |
| 经济数据 | CPI, inflation, recession, unemployment, GDP |
| 行业/产业政策 | tariff, ban, regulation, antitrust, SEC, FTC |
| 地缘 | war, ceasefire, Taiwan, sanctions |
| ❌ 过滤 | 体育、娱乐、Crypto coin price target、明星 |

## B3. 流动性门槛与输出（硬规则）

| 24h vol | 主表 Top 5 | 附加可关注 |
|---------|-----------|---------|
| < $50k | ❌ | ❌ |
| $50k–$200k | ❌ | ✅ 标"低流动性参考" |
| > $200k | ✅ | — |

**「已基本定局」市场排除**（避免 Top 5 被无信息量市场占据）：

| 触发条件 | 处理 |
|---------|------|
| `max(yesPrice, noPrice) ≥ 95%` 且事件日 < 14 天 | 完全排除 |
| `max(yesPrice, noPrice) ≥ 99%`（无论日期） | 完全排除 |
| `max(yesPrice, noPrice) ≥ 90%` 且事件日已过 | 完全排除 |

**信息量优先**：Top 5 应优先 `min(yesPrice, noPrice) ≥ 5%` 的"仍有不确定性"市场。

**链接强制**：slug 必须输出为完整 URL：`https://polymarket.com/event/<slug>`，不允许用 `link`/`url` 占位。

**Top 5 主表必须包含**：分类 / 完整市场标题 / Yes-No 价 / 24h vol（带 $ 和单位）/ 截止日期 / 完整 URL。

## B4. 经济数据押注子表（门槛降到 $50k）

通用 Top 5 倾向政治/地缘/Fed 人事（vol 大）。CPI/NFP/GDP 押注 vol 通常 $50k-150k 会被挤出，但对宏观分析价值最大。

使用 `/public-search` 端点按关键词搜索：

```bash
BASE="https://gamma-api.polymarket.com/public-search?events_status=active&limit_per_type=10"

curl -sS "${BASE}&q=CPI+inflation"        | jq '.events[] | {title, slug, volume24hr}'
curl -sS "${BASE}&q=Fed+interest+rate"    | jq '.events[] | {title, slug, volume24hr}'
curl -sS "${BASE}&q=nonfarm+payroll+jobs" | jq '.events[] | {title, slug, volume24hr}'

# 对搜到的 slug 取详情
curl -sS "https://gamma-api.polymarket.com/events?slug=<slug>" \
  | jq '.[] | {title, markets: (.markets[] | {question, outcomePrices, outcomes, volume24hr})}'
```

**搜索关键词参考**：CPI inflation / Fed interest rate / nonfarm payroll jobs / unemployment rate / GDP recession / PCE core inflation

**输出格式**：
```markdown
### 经济数据押注（Polymarket，门槛 vol24 > $50k）
| 关联事件 | 市场标题 | 阈值/共识 | Yes/No | vol24 | 链接 |
| 5/12 CPI YoY | Will April CPI YoY be > 3.5%? | 阈值 3.5% | 35%/65% | $98k | [...] |
```

**空结果必须显式说明**（不要静默省略整个段落）：
```markdown
### 经济数据押注（Polymarket，门槛 vol24 > $50k）
> 本期无符合条件的经济数据市场（vol24 ≥ $50k 且非定局）。已用关键词 `CPI inflation` / `Fed interest rate` / `nonfarm payroll jobs` 搜索确认。
```
