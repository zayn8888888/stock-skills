# 富途日历（主数据源）

经济日历和财报日历优先走富途 OpenAPI。OpenD 未连接、脚本报错、或富途市场列表覆盖不到的地区，再回退 `references/finnhub.md`。

脚本目录：`${CLAUDE_SKILLS_DIR:-$HOME/.claude/skills}/futuapi/scripts/quote`

## 经济日历

先打 **一枪**。同一会话里这个接口一旦返回「频率太高」，不要重试，也不要再补 MEDIUM 或 `--all-pages`。

```bash
SCRIPTS="${CLAUDE_SKILLS_DIR:-$HOME/.claude/skills}/futuapi/scripts/quote"
FROM=$(date -u +%Y-%m-%d)
TO=$(date -u -v+14d +%Y-%m-%d 2>/dev/null || date -u -d '+14 days' +%Y-%m-%d)

python3 "$SCRIPTS/get_economic_calendar.py" \
  --begin-date "$FROM" --end-date "$TO" \
  --markets US --importance HIGH --count 50 --json
```

`region=HK` 或 `BOTH` 时，这一枪把 `--markets` 改成 `US,HK,SH`。不要把 JP 和 MEDIUM 再各打一遍。第一页够用：FOMC、CPI、非农、GDP、PCE 都在 HIGH 的前几条里。只有第一页成功且明显缺会期事件时，才补一次 `--all-pages`。

字段：`title`、`timestamp`、`country`、`star`、`previous`、`consensus`、`actual`。

| 字段 | 用法 |
|------|------|
| `title` | 事件名，原文输出 |
| `timestamp` | 事件时间。输出时标 UTC，并附 HKT |
| `country` | 国家或地区 |
| `star` | 重要性。只保留 HIGH / MEDIUM 对应结果 |
| `consensus` | 市场共识。空则写「待公布」，不编数字 |
| `previous` | 前值 |
| `actual` | 已公布实际值。空则写「待发布」 |

市场代码只有 `HK/US/SH/SG/JP/AU/MY/CA`。没有欧元区、德国、ECB。这些仍走 Finnhub；Finnhub 也不可用时，用 Tavily 确认 FOMC / ECB / BOJ / PBOC LPR / HKMA 的日期。

A 股看 `--markets SH`。深市没有单独代码，沪市日历已覆盖境内宏观发布。

## 财报日历

一个市场一条命令。服务端限制 **单次日期范围不超过 7 天**，超过会直接失败。14 天窗口拆成两段，每段 ≤7 天。仓库关心的市场是 US、HK、SH、SZ。

```bash
MID=$(date -u -v+7d +%Y-%m-%d 2>/dev/null || date -u -d '+7 days' +%Y-%m-%d)
python3 "$SCRIPTS/get_earnings_calendar.py" \
  --market US --begin-date "$FROM" --end-date "$MID" --sort-type HOT --json
python3 "$SCRIPTS/get_earnings_calendar.py" \
  --market US --begin-date "$MID" --end-date "$TO" --sort-type HOT --json
```

`region=US` 只跑 US。`region=HK` 把 `--market` 换成 HK。`region=BOTH` 再跑 HK。调用方带了 A 股标的再加 SH 和 SZ。每个市场都按上面的 7 天拆段。

字段：`security`、`name`、`earnings_date`、`earnings_timestamp`、`pub_type`、`period_text`、`eps_actual`、`eps_predict`、`revenue_actual`、`revenue_predict`。

- `security` 已是 `US.NVDA` / `HK.00700` 这种代码，不要再拼一遍。
- `eps_predict` / `revenue_predict` 是共识。空则写「共识暂无」，不要改用新闻里的数字冒充。
- `pub_type` 表示发布时段，原样写进事件名后面。
- 全市场只保留有共识 EPS 或共识营收的条目，再按用户给出的 `symbols` 过滤。单票查询不过滤共识：窗口结果里没有这只代码时，改走 Finnhub 的 `symbol=` 查询。

## 失败

| 情况 | 处理 |
|------|------|
| 经济日历返回「频率太高」 | 立刻停止这个接口。FOMC 日期改读 `get_fed_watch_target_rate.py` 的 `meeting_date`。CPI / 非农 / GDP / PCE 走 Finnhub，Finnhub 也没有再走 Tavily，并写明信源 |
| 财报日历返回「日期范围不能超过7天」 | 把窗口拆成 ≤7 天再各打一次，不要改走 Tavily |
| OpenD 未连接 / 其它 `error` | 经济日历与财报日历改走 Finnhub，信源标 `finnhub` |
| 富途有日期但共识为空 | 保留富途日期，共识写「暂无」。单票再试 Finnhub，Finnhub 有共识就补上并标 `futu+finnhub` |
| 欧元区 / ECB | 不调用富途经济日历，直接 Finnhub |
| 两源都失败 | 该行标「⚠️ 日历不可用」，继续 Polymarket 和 Tavily |
