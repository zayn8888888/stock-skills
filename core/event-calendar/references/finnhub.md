# Finnhub 数据源（兜底）

富途日历是主源，见 `futu-calendar.md`。这里只在三种情况使用：

1. OpenD 未连接，或富途日历脚本返回 `error`
2. 欧元区 / ECB / 德国：富途经济日历没有这些市场代码
3. 单只股票在富途财报窗口结果里缺失，需要 `symbol=` 精确查询

## A1. 全球经济数据日历

```bash
FROM=$(date -u +%Y-%m-%d)
TO=$(date -u -v+14d +%Y-%m-%d 2>/dev/null || date -u -d '+14 days' +%Y-%m-%d)

curl -sS "https://finnhub.io/api/v1/calendar/economic?from=${FROM}&to=${TO}&token=${FINNHUB_API_KEY}" \
  | jq '.economicCalendar[] | select(.country | IN("US","EA","DE","JP","CN","HK"))'
```

返回字段：`country / event / time / impact / actual / estimate / prev / unit`

**impact 过滤**：只展示 `high` + `medium`，过滤 `low`。

**衍生事件回看**：返回 Minutes / SEP / Beige Book 这类"会议后衍生事件"时，必须在该行下方加原始事件日期说明：
```
| 05-20 | FOMC Minutes | ...
|       | ↳ 原始决议 5/7 已发布（保持 4.25-4.50%；下次会议 6/17-6/18）
```

**必抓宏观节点**（即便 Finnhub 未返回，也通过 Tavily 兜底确认日期）：

| 事件 | 频率 | 影响 |
|------|------|------|
| FOMC Rate Decision | 8次/年 | 全球风险资产 |
| ECB Rate Decision | 6周/次 | EUR + 全球流动性 |
| BOJ Policy Meeting | 8次/年 | JPY + 套息交易 |
| PBOC LPR 报价 | 每月20号 | A股 + HK |
| HKMA 议息 | 跟随 FOMC 后第2日 | HK |
| US CPI / Core PCE | 月度 | 全市场 |
| US 非农就业 | 月度第一个周五 | 全市场 |
| 中国 PMI（官方+财新） | 月度 | A股 + 港股 |

## A2. 财报日历

### 美股（富途窗口里缺这只代码时）

```bash
# 全市场未来 14 天财报
curl -sS "https://finnhub.io/api/v1/calendar/earnings?from=${FROM}&to=${TO}&token=${FINNHUB_API_KEY}" \
  | jq '.earningsCalendar[] | {date, symbol, hour, epsEstimate, revenueEstimate}'

# 单只票
curl -sS "https://finnhub.io/api/v1/calendar/earnings?from=${FROM}&to=${TO}&symbol=NVDA&token=${FINNHUB_API_KEY}" \
  | jq '.earningsCalendar[]'
```

`hour`：`bmo` = 盘前，`amc` = 盘后，`dmh` = 盘中。

**过滤规则**：全市场场景只保留 EPS estimate ≥ $0.5 或 revenue ≥ $1B；单票不过滤。

### 港股（富途财报日历没有日期时）

1. 主源是富途 `get_earnings_calendar.py --market HK`。只有结果里没有目标代码时，才试 Finnhub：`curl ".../calendar/earnings?...&symbol=<code>.HK&token=..."`
2. **再触发 Tavily**（任一）：Finnhub `earningsCalendar = []`，或 `date` 存在但 `epsEstimate = null && revenueEstimate = null`
3. 并行调用 Tavily：
   - `site:hkex.com.hk <code> 業績公告 <月份>`
   - `<公司中文名> 業績 公布日期 <月份>`
   - `<English company name> earnings results Hong Kong <month>`
4. 从摘要里抽日期 + 时段，标注「日期来自 Tavily，共识 EPS/Rev 暂无」

**港股常用 ticker 对照**：

| 富途 code | 港股 ticker | 中文名 |
|-----------|------------|--------|
| HK.00700 | 0700.HK | 腾讯控股 |
| HK.09988 | 9988.HK | 阿里巴巴-W |
| HK.01810 | 1810.HK | 小米集团-W |
| HK.03690 | 3690.HK | 美团-W |
| HK.00941 | 0941.HK | 中国移动 |
| HK.09618 | 9618.HK | 京东集团-SW |

**数字格式硬规则**：
- ⛔ 禁止省略前导整数位（`12.9B` 不许写 `.9B`）
- Revenue：`X.XB`（≥1B）/ `XXXM`（<1B）；EPS 保留 2 位小数
- 货币单位必须显式标（USD/CNY/HKD）
- 多个标的 EPS/Rev 每个标的独立成行，禁止串在一格

## A3. 限流与错误处理

- 免费版 60 calls/min，本 skill 单次最多 3 次，够用
- HTTP 401 → key 无效
- HTTP 429 → 限流，sleep 60s 后重试一次
- 网络错误 → 标"Finnhub 暂不可用"，继续跑 Polymarket + Tavily
