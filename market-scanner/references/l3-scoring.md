# L3 板块内候选性价比向量

## 数据拉取

### A 股

```python
# 东财拿成分股列表（含今日涨幅 + 5日涨幅 + 今日主力净流入）
stocks = em_get_board_stocks(bk_code, limit=50)
# → 直接有 today_pct, 5d_pct, main_flow_yi 三个关键字段

# 再对候选股用富途补充 PE / 市值 / 10日涨幅（东财无10日字段）
ctx.get_market_snapshot([s['futu_code'] for s in stocks])     # PE/市值/52周高低
ctx.request_history_kline(code, start=..., end=..., ...)       # 精确10日涨幅
ctx.get_capital_flow(code, period_type='DAY', start='...')     # 3日主力净流入详情
```

### HK / US：质量阀门加速路径（get_stock_screen）

板块成分股 > 30 只时，用 `get_stock_screen` **把质量阀门前移**，直接拿已过滤的成分股列表，减少后续逐个 snapshot 的调用量。完整用法与解码函数见 [api-futu.md](api-futu.md#条件选股-v2get_stock_screen)。

```python
from futu.quote.stock_screen_const import ScrMarket, ScrSortDir, SimpleField, SimpleProperty, BasicProperty

req = ft.StockScreenRequest()
req.page_count = 50

# ── 按市场筛（板块维度用 add_plate，但 add_plate 的板块代码格式待确认）
req.add_simple_field(field=SimpleField.MARKET, values=[ScrMarket.HK])   # 或 ScrMarket.US

# ── 质量阀门（对应硬阀门表格）
HK_THRESHOLDS = {'market_cap': 3_000_000_000.0, 'price': 1.0}
US_THRESHOLDS = {'market_cap': 500_000_000.0,   'price': 3.0}

req.add_simple_property(name=SimpleProperty.MARKET_CAP, lower=thresholds['market_cap'])
req.add_simple_property(name=SimpleProperty.PE_ANNUAL,  lower=0.01)   # PE > 0，排亏损
req.add_simple_property(name=SimpleProperty.PRICE,      lower=thresholds['price'])

req.add_retrieve_basic(name=BasicProperty.CODE)
req.add_retrieve_basic(name=BasicProperty.NAME)
req.add_retrieve_simple(name=SimpleProperty.MARKET_CAP)
req.add_retrieve_simple(name=SimpleProperty.PE_ANNUAL)
req.add_retrieve_simple(name=SimpleProperty.PE_TTM)
req.add_retrieve_simple(name=SimpleProperty.PB)

req.add_sort(direction=ScrSortDir.DESC, property_type='simple',
             property_params={'name': int(SimpleProperty.MARKET_CAP)})

ret, total, rows = ctx.get_stock_screen(req)   # ⚠️ 三值解包
stocks = decode_screen_rows(rows)              # 见 api-futu.md 解码函数
```

**加速路径后仍需补拉**（`get_stock_screen` 不含以下字段）：
- `request_history_kline` → 5日/10日涨幅（动量因子）
- `get_capital_flow` → 近 3 日主力净流入（资金因子）

**降级条件**：`get_stock_screen` 报错 / OpenD 不可用 → 回退到原始路径（`get_plate_stock` → `get_market_snapshot` 逐个过滤）。

## 质量阀门（硬条件，不过直接剔除）

| 条件 | HK | US | CN |
|------|----|----|-----|
| 5 日平均成交额 | ≥ 2000 万港币 | ≥ 300 万美元 | ≥ 5000 万人民币 |
| 市值 | ≥ 30 亿港币 | ≥ 5 亿美元 | ≥ 20 亿人民币 |
| PE-TTM | 为负则剔除 | 为负则剔除 | 为负则剔除 |
| 上市时间 | ≥ 60 日 | ≥ 60 日 | ≥ 60 日 |
| 仙股 | 股价 < HK$1 剔除 | 股价 < US$3 剔除 | 无仙股机制 |
| ST / *ST | — | — | 名称含 ST 直接剔除 |
| 涨跌停 | — | — | 涨/跌停中标注；不以当日涨幅作动量信号，改用 T-1 |

## 性价比向量（软排序，满分约 10 分，≥ 4 进候选）

| 因子 | 口径 | 打分 |
|------|------|------|
| **PE 分位** | 优先 `get_stock_info` 的 `pe_ttm`；PE 历史分位用近 60 日自身百分位 | <30% → +2，30-50% → +1，50-70% → 0，>70% → -1 |
| **相对板块动量** | 近 5 日涨幅 − 板块 5 日涨幅 | <-5pp → +2（追赶空间）；-5~+3pp → +1；+3~+8pp → 0；>+8pp → -2（已过度拉升） |
| **资金流** | 近 3 日主力资金净流入 / 总成交 | >5% → +2；1-5% → +1；-1~1% → 0；<-1% → -1 |
| **业绩质量** | EPS 为正 + 股息率 > 0 + 52 周不处历史高点 ±5% | 同时满足 → +1，否则 0 |
| **链上拥挤度**（仅 US） | `hyperliquid-perps lookup <ticker>`，取 `fundingAprNow`；无镜像时跳过，不扣分；**CN/HK 跳过** | APR < +20% → +1；+20~+100% → 0；>+100% → -2；< -20% → +1（空头偏强，可能筑底） |
| **北向资金方向**（仅 CN） | `get_capital_distribution` 取超大单净流入；Tavily 补查「北向资金 <股票名> 持仓变化」；HK/US 跳过 | 北向净买入 ≥ 成交额 1% → +2；小幅净买入或持平 → +1；净卖出 → -1 |
| **连板 / 涨停质量**（仅 CN） | 近 5 日是否出现连板，以及首板是否开板 | 首板未开板 → +1；连板 ≥ 2 且未开板 → +2；曾连板但已开板 → -1；无涨停 → 0 |

每板块取总分最高的 **3-5 只**进候选。

## PE 缺失 fallback

若 `get_stock_info` 也拿不到 PE-TTM（部分港股新股 / ADR / 美股亏损股）：
- PE 因子权重**转嫁到动量 + 资金流**（动量和资金各再加 0.5 分可能性）
- 报告里标「PE 数据缺失」
- **不要**硬赋 0 分当通过，也不要直接剔除

## 美股蓝筹资金流 fallback

若 `get_capital_flow` 对美股蓝筹返回 0（见 [api-futu.md](api-futu.md)）：
- 资金因子按代理口径算：近 3 日成交额 × 涨跌幅，相对同板块其他股排名
- 报告标注「资金代理信号」

## A 股资金流说明

`get_capital_flow` 对 A 股成分股数据完整，直接取近 3 日主力净流入使用，**无需 fallback**。

## 各市场差异汇总

| 维度 | HK | US | CN |
|------|----|----|-----|
| 链上拥挤度 | 跳过（OI < 10 万 USD） | 调用 hyperliquid-perps | 跳过（无链上镜像） |
| 北向资金 | 跳过 | 跳过 | 必须叠加 |
| 连板/涨停质量 | 跳过 | 跳过 | 必须评估 |
| 资金流质量 | 正常 | 蓝筹常返回 0，需 fallback | 正常 |
| PE 来源 | `get_stock_info` pe_ttm | `get_stock_info` pe_ttm | `get_stock_info` pe_ttm |
