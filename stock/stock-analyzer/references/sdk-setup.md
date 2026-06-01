# 富途 API 接入

## 脚本路径

所有命令统一走 `futuapi` 脚本集，安装路径 `${CLAUDE_SKILLS_DIR:-$HOME/.claude/skills}/futuapi/scripts/`，由 `install-futu-opend` skill 配套安装 OpenD + SDK。

```bash
python3 "${CLAUDE_SKILLS_DIR:-$HOME/.claude/skills}"/futuapi/scripts/quote/get_snapshot.py <CODE> --json
```

## 脚本 → 底层 SDK 方法对照（调试参考）

平时无需直接调 SDK；该表仅在调试或脚本未覆盖时使用。

| 脚本命令 | 底层 SDK 调用 |
|------------|------------|
| `get_snapshot.py <CODE>` | `get_market_snapshot(['<CODE>'])` |
| `get_kline.py <CODE> --ktype 1d --num 30` | `request_history_kline('<CODE>', start=..., end=..., ktype=KLType.K_DAY)` → **三值解包** `(ret, data, _)` |
| `get_capital_flow.py <CODE>` | `get_capital_flow('<CODE>')` |
| `get_capital_distribution.py <CODE>` | `get_capital_distribution('<CODE>')` |
| `subscribe.py <CODE> --types ORDER_BOOK` | `subscribe(['<CODE>'], [SubType.ORDER_BOOK])`，之后 `time.sleep(0.3)` 再拉 |
| `get_orderbook.py <CODE> --num 10` | `get_order_book('<CODE>', num=10)` |
| `get_owner_plate.py <CODE>` | `get_owner_plate(['<CODE>'])` |
| `get_plate_stock.py <PLATE> --limit 20` | `get_plate_stock('<PLATE>')` |
| `get_option_expiration_date.py <CODE>` | `get_option_expiration_date('<CODE>')` |
| `get_option_chain.py <CODE> --start X --end Y` | `get_option_chain('<CODE>', start='X', end='Y')` → **两值解包** `(ret, data)`，`data.option_type` 列区分 CALL/PUT |
| `get_stock_quote.py <OPT_CODES>` | 先 `subscribe(codes, [SubType.QUOTE])`，再 `get_stock_quote(codes)` |
| `get_valuation_detail.py <CODE>` | `get_valuation_detail('<CODE>')` |
| `get_research_rating_summary.py <CODE>` | `get_research_rating_summary('<CODE>')` |
| `get_financials_statements.py <CODE> --num 8` | `get_financials_statements('<CODE>', num=8)` → 返回 **dict 不是 DataFrame**，用 `data.get('report_list', [])` |

> **已知坑**：`get_ticker` 方法不存在，逐笔数据需通过订阅推送；`request_history_kline` 三值解包；`get_financials_statements` 返回 dict，禁止调 `.to_dict()` / `.columns`。

## 新 API A 股覆盖矩阵（实测 SH.600519 茅台）

| 接口 | A 股支持 | 备注 |
|-----|---------|------|
| `get_valuation_detail` | ✅ 支持 | 返回 PE/PB 等多种估值类型，含历史百分位 + 行业对比，`valuation_type` 区分指标类型 |
| `get_shareholders_overview` | ❌ 不支持 | 明确报错"只支持港股美股市场正股和基金" |
| `get_corporate_actions_dividends` | ✅ 支持 | 返回完整分红历史，含公告日/登记日/除权日/派息日，预案状态也会显示 |
| `get_financials_statements` | ❌ 不支持 | `report_list=[]` 空列表，ret==0 但无数据（茅台实测确认） |
| `get_stock_screen` | ❌ 不支持 | `ScrMarket` 枚举无 CN，A 股不在范围内 |

> `get_valuation_detail` 返回 **dict**（非 DataFrame），包含 `valuation_type`（整数）、`trend.current_value`、`trend.valuation_percentile`、`trend.historical_items[]` 等字段，共 7 种 valuation_type。

## 已知字段缺陷与替代方案

| 字段 | 缺陷 | 替代方案 |
|------|------|---------|
| `high_price_52weeks` / `low_price_52weeks` | 美股返回 0 | 用 `get_kline.py <CODE> --ktype 1d --num 252 --json` 自算 52 周高低 |
| `pe_ratio` vs `pe_ttm_ratio` | 美股两者数值相同，无法区分静态/TTM | 美股以 `pe_ttm_ratio` 为准；A 股/港股两字段含义需结合财报日判断 |
| `valuation_percentile` | 语义未经官方文档确认（窗口期/方向未定义），不可直接用于结论 | 通过 `historical_items[]` 时序数据自行计算：统计 `current_value` 高于/低于历史序列的比例来确定方向和分位 |

> ⚠️ `valuation_percentile` 使用禁令：禁止将该字段直接写入报告结论（如"80% 分位 = 高估"）。必须先通过 `historical_items[]` 序列验证字段方向，确认后才可引用，否则标注"语义待验证，不引用"。

## OrderBook 量字段单位

`get_orderbook.py` 返回的 Bid/Ask 列表格式为 `[价格, 数量, 委托笔数, {}]`，**数量的单位因市场而异**：

| 市场 | 数量单位 | 备注 |
|------|---------|------|
| 美股 | **股（shares）** | 直接读取，如 `2139` = 2139 股 |
| 港股 | **手（lot）** | 需查 lot_size 换算：`数量 × lot_size = 股数` |
| A 股 | **手（100 股/手）** | `数量 × 100 = 股数` |

> 报告中引用盘口数字时必须注明单位，并换算为"股数"或"名义金额"后再解读大小。

## 富途代码格式

- **港股**：`HK.XXXXX`（5 位数字补零，如 `HK.00700` 腾讯）
- **美股**：`US.TICKER`（如 `US.TSLA`、`US.NVDA`）
- **A 股沪市**：`SH.XXXXXX`（6 位，如 `SH.600519` 茅台）
- **A 股深市**：`SZ.XXXXXX`（6 位，如 `SZ.000858` 五粮液）
- **期权代码**：交给 `resolve_option_code.py` 解析，不要手工拼
- 不确定时用 Tavily 确认一次，不要猜错代码后继续往下拉数据

> ⚠️ **裸 ticker 会报错**：所有脚本均要求带市场前缀。`get_snapshot.py FUTU` 直接报错，必须用 `get_snapshot.py US.FUTU`。Step 0 拿到用户输入的 ticker 后立刻补全前缀，后续调用统一用带前缀的格式。
