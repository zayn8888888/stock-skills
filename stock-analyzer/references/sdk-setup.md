# 富途 API 接入

## 方式 A：futuapi 脚本集

安装了 `futuapi` skill 或自建脚本目录时直接用：
```bash
python3 skills/futuapi/scripts/quote/get_snapshot.py <CODE> --json
```
脚本路径替换为实际位置（`~/.claude/skills/futuapi/scripts/` 或 `skills/futuapi/scripts/`）。

## 方式 B：futu-api SDK 直装（`pip install futu-api`）

```python
import futu as ft
quote_ctx = ft.OpenQuoteContext(host='127.0.0.1', port=11111)
# 调用对应方法（见下方对照表）
quote_ctx.close()
```

## 命令 → SDK 对照表

| 原始脚本命令 | SDK 替代调用 |
|------------|------------|
| `get_snapshot.py <CODE>` | `quote_ctx.get_market_snapshot(['<CODE>'])` |
| `get_kline.py <CODE> --ktype 1d --num 30` | `quote_ctx.request_history_kline('<CODE>', start=..., end=..., ktype=ft.KLType.K_DAY)` → **三值解包** `(ret, data, _)` |
| `get_capital_flow.py <CODE>` | `quote_ctx.get_capital_flow('<CODE>')` |
| `get_capital_distribution.py <CODE>` | `quote_ctx.get_capital_distribution('<CODE>')` |
| `subscribe.py <CODE> --types ORDER_BOOK` | `quote_ctx.subscribe(['<CODE>'], [ft.SubType.ORDER_BOOK])`，之后 `time.sleep(0.3)` 再拉 |
| `get_orderbook.py <CODE> --num 10` | `quote_ctx.get_order_book('<CODE>', num=10)` |
| `get_owner_plate.py <CODE>` | `quote_ctx.get_owner_plate(['<CODE>'])` |
| `get_plate_stock.py <PLATE> --limit 20` | `quote_ctx.get_plate_stock('<PLATE>')` |
| `get_option_expiration_date.py <CODE>` | `quote_ctx.get_option_expiration_date('<CODE>')` |
| `get_option_chain.py <CODE> --start X --end Y` | `quote_ctx.get_option_chain('<CODE>', start='X', end='Y')` → **两值解包** `(ret, data)`，`data.option_type` 列区分 CALL/PUT |
| `get_stock_quote.py <OPT_CODES>` | 先 `subscribe(codes, [ft.SubType.QUOTE])`，再 `quote_ctx.get_stock_quote(codes)` |

> **已知坑**：`get_ticker` 方法不存在，逐笔数据需通过订阅推送；`request_history_kline` 是三值解包，不是两值；`get_financials_statements` 返回 **dict 不是 DataFrame**，禁止调 `.to_dict()` / `.columns`，直接用 `data.get('report_list', [])`。

## 新 API A 股覆盖矩阵（实测 SH.600519 茅台）

| 接口 | A 股支持 | 备注 |
|-----|---------|------|
| `get_valuation_detail` | ✅ 支持 | 返回 PE/PB 等多种估值类型，含历史百分位 + 行业对比，`valuation_type` 区分指标类型 |
| `get_shareholders_overview` | ❌ 不支持 | 明确报错"只支持港股美股市场正股和基金" |
| `get_corporate_actions_dividends` | ✅ 支持 | 返回完整分红历史，含公告日/登记日/除权日/派息日，预案状态也会显示 |
| `get_financials_statements` | ❌ 不支持 | `report_list=[]` 空列表，ret==0 但无数据（茅台实测确认） |
| `get_stock_screen` | ❌ 不支持 | `ScrMarket` 枚举无 CN，A 股不在范围内 |

> `get_valuation_detail` 返回 **dict**（非 DataFrame），包含 `valuation_type`（整数）、`trend.current_value`、`trend.valuation_percentile`、`trend.historical_items[]` 等字段，共 7 种 valuation_type。

## 富途代码格式

- **港股**：`HK.XXXXX`（5 位数字补零，如 `HK.00700` 腾讯）
- **美股**：`US.TICKER`（如 `US.TSLA`、`US.NVDA`）
- **A 股沪市**：`SH.XXXXXX`（6 位，如 `SH.600519` 茅台）
- **A 股深市**：`SZ.XXXXXX`（6 位，如 `SZ.000858` 五粮液）
- **期权代码**：交给 `resolve_option_code.py` 解析，不要手工拼
- 不确定时用 Tavily 确认一次，不要猜错代码后继续往下拉数据
