# 富途 API 参考

## SDK 安装与连接

```python
pip install futu-api   # 需要本地运行 OpenD（127.0.0.1:11111）

import futu as ft
from futu import KLType, AuType, RET_OK
ctx = ft.OpenQuoteContext(host='127.0.0.1', port=11111)
# 用完记得 ctx.close()
```

## 常用方法对照表

| 方法 | 用途 | 备注 |
|------|------|------|
| `ctx.get_market_snapshot(codes)` | PE/市值/今日涨幅/成交额 | `pe_ratio` 在港股常为 null，首选 `get_stock_info` 的 `pe_ttm` |
| `ctx.request_history_kline(code, start, end, ktype, autype, max_count)` | 日/周/月 K 线 | **三值解包**：`ret, data, _ = ctx...` |
| `ctx.get_capital_flow(code, period_type='DAY', start='...')` | 历史资金流（最近 36 天） | 美股蓝筹频繁返回 0，见 fallback 规则 |
| `ctx.get_capital_distribution(code)` | 超大/大/中/小单实时分布 | A 股数据完整，可直接使用 |
| `ctx.get_owner_plate(codes)` | 查股票所属板块（反查） | |
| `ctx.get_plate_list(market, plate_type)` | 获取板块列表 | `ft.Plate.INDUSTRY` / `ft.Plate.CONCEPT` |
| `ctx.get_plate_stock(plate_code)` | 获取板块成分股 | **A 股大量概念板块返回"未知股票"，见缺口说明** |
| `ctx.get_stock_filter(market, filter_list, plate_code)` | 条件选股 | |
| `ctx.get_stock_info(codes)` | 基本信息（含 pe_ttm） | PE 首选此接口 |

## A 股板块 K 线（`request_history_kline`）

实测（2026-05-27）：`request_history_kline` 对 A 股 INDUSTRY（131个）和 CONCEPT（788个）板块的**K 线数据**全量可用，代码格式 `SH.LIST0xxx`，788 个板块约 18 秒完成。

**但无法替代东财用于 L1.5**：富途与东财是两套独立板块体系，成分股不同、涨幅口径不同。更关键的是，热点新概念板块（先进封装/CPO/HBM/玻璃基板等 `SH.LIST23xxx`）的 `get_plate_stock` 全部报"未知股票"，L3 成分股无法获取。market-scanner 全链路必须保持东财口径。

```python
# 仅作参考（不用于 market-scanner 主流程）
ret, con = ctx.get_plate_list(ft.Market.SH, ft.Plate.CONCEPT)
ret2, data, _ = ctx.request_history_kline('SH.LIST0463', ...)  # PCB概念 K 线可用

# ❌ 但这些新板块的成分股拿不到：
ctx.get_plate_stock('SH.LIST23120')  # 先进封装 → ERROR "未知股票 LIST23120"
ctx.get_plate_stock('SH.LIST23084')  # 玻璃基板封装 → ERROR
ctx.get_plate_stock('SH.LIST23307')  # HBM → ERROR
```

## 港美股板块 K 线代码

```python
# 港股板块：111 个 INDUSTRY + 117 个 CONCEPT = 228 个
ret, hk_ind = ctx.get_plate_list(ft.Market.HK, ft.Plate.INDUSTRY)   # 代码格式 HK.LIST1xxx
ret, hk_con = ctx.get_plate_list(ft.Market.HK, ft.Plate.CONCEPT)    # 代码格式 HK.LIST1xxx

# 美股板块：145 个 INDUSTRY + 117 个 CONCEPT = 262 个
ret, us_ind = ctx.get_plate_list(ft.Market.US, ft.Plate.INDUSTRY)    # 代码格式 US.LIST2xxx
ret, us_con = ctx.get_plate_list(ft.Market.US, ft.Plate.CONCEPT)     # 代码格式 US.LIST2xxx

# 港美股板块 K 线可直接调用 request_history_kline，支持历史数据
def get_plate_return(ctx, code, days=5):
    ret, data, _ = ctx.request_history_kline(
        code,
        start=(datetime.today()-timedelta(days=days+5)).strftime('%Y-%m-%d'),
        end=datetime.today().strftime('%Y-%m-%d'),
        ktype=KLType.K_DAY, autype=AuType.QFQ, max_count=days+5)
    if ret != RET_OK or len(data) < days+1: return None
    closes = data['close'].tolist()
    return round((closes[-1]/closes[-days-1]-1)*100, 2)
```

**限速说明**：全量扫描 228 个港股板块约 34s，262 个美股板块约 40s；每次调用间隔 0.15s 即可，不触发限速。

**实测数据参考（2026-05-26）**：
- 港股半导体（HK.LIST1013）：5d +18.07%，10d +15.77%
- 港股手机产业链（HK.LIST1166）：5d +9.92%，10d +4.12%
- 美股半导体设备（US.LIST2016）：5d +5.12%，10d +1.39%

## 资金流 DAY fallback 规则

**问题**：`get_capital_flow(DAY)` 对美股头部股（NVDA/AAPL/GOOGL/META/AMD 等）经常返回 0（富途服务端数据不全）。

**识别**：板块内 >30% 市值成分股资金流为 0 → 启用代理。

**代理公式**：

```python
# 代理 = 成交额 × 涨跌幅（涨放量 ≈ 净买入，跌放量 ≈ 净卖出）
proxy_flow = sum(turnover * change_rate/100 for code in plate_stocks)
```

**适用范围**：
- 代理只用于板块间**相对排名**，不报绝对金额
- 报告中必须标注「资金代理信号」
- **港股资金流正常**：`get_capital_flow(DAY)` 对港股完整，历史可拉最近 36 天，无需 fallback
- **A 股资金流正常**：`get_capital_flow` 对 A 股成分股数据完整，直接使用，不需代理

## A 股板块覆盖缺口说明

`ctx.get_plate_stock()` 对大量 A 股新增概念板块（先进封装 / CPO / HBM / 玻璃基板封装等）返回 `"未知股票"` 错误。

**根因**：这是富途**服务端产品层面**的限制，与本地 OpenD 版本无关，**升级 OpenD 无效**。

**解决方案**：
- A 股板块扫描一律走东方财富 API（见 [api-eastmoney.md](api-eastmoney.md)）
- 富途仅负责 A 股**个股级别**的深度行情（PE/市值/K线）和资金流数据

## 条件选股 V2（get_stock_screen）

新接口，ProtoID 3252，**仅支持 HK / US**（A 股走东财，无需此接口）。

### 正确用法（实测验证）

```python
import futu as ft
from futu.quote.stock_screen_const import (
    ScrMarket, ScrSortDir, SimpleField, SimpleProperty,
    FinancialProperty, Term, BasicProperty
)

ctx = ft.OpenQuoteContext(host='127.0.0.1', port=11111)

req = ft.StockScreenRequest()
req.page_count = 50  # 每次返回数量（无 page_size 参数，用 page_count 属性）

# 市场或板块（二选一）
req.add_simple_field(field=SimpleField.MARKET, values=[ScrMarket.HK])  # 按市场
# req.add_plate(plate_ids=['HK.LIST1013'])                              # 按板块（待验证，优先用 MARKET）

# 质量阀门条件
req.add_simple_property(name=SimpleProperty.MARKET_CAP, lower=3_000_000_000.0)   # 港股：市值 ≥ 30亿港元
req.add_simple_property(name=SimpleProperty.PE_ANNUAL, lower=0.01)               # PE 为正（排除亏损股）
req.add_simple_property(name=SimpleProperty.PRICE, lower=1.0)                    # 港股：股价 ≥ 1 港元（排除仙股）

# 指定返回字段
req.add_retrieve_basic(name=BasicProperty.CODE)
req.add_retrieve_basic(name=BasicProperty.NAME)
req.add_retrieve_simple(name=SimpleProperty.MARKET_CAP)
req.add_retrieve_simple(name=SimpleProperty.PE_ANNUAL)
req.add_retrieve_simple(name=SimpleProperty.PE_TTM)
req.add_retrieve_simple(name=SimpleProperty.PB)
req.add_retrieve_simple(name=SimpleProperty.PRICE)

# 排序（add_sort 三参数，property_params 是字典）
req.add_sort(
    direction=ScrSortDir.DESC,
    property_type='simple',
    property_params={'name': int(SimpleProperty.MARKET_CAP)}
)

# ⚠️ 三值解包：ret, total_count, results_list = ctx.get_stock_screen(req)
ret, total, rows = ctx.get_stock_screen(req)
ctx.close()
```

### 结果解码

返回的 `rows` 是嵌套结构，每条是 `{'stock_id': ..., 'results': [...属性列表...]}` ，需要手动解码：

```python
from futu.quote.stock_screen_const import BasicProperty, SimpleProperty

PROP_MAP = {
    int(BasicProperty.CODE):          'code',
    int(BasicProperty.NAME):          'name',
    int(SimpleProperty.MARKET_CAP):   'market_cap',
    int(SimpleProperty.PE_ANNUAL):    'pe_annual',
    int(SimpleProperty.PE_TTM):       'pe_ttm',
    int(SimpleProperty.PB):           'pb',
    int(SimpleProperty.PRICE):        'price',
}

def decode_screen_rows(rows):
    out = []
    for row in rows:
        d = {}
        for item in row.get('results', []):
            key = PROP_MAP.get(item['property']['name'], f"prop_{item['property']['name']}")
            d[key] = item.get('sval') or item.get('dval')
        out.append(d)
    return out

stocks = decode_screen_rows(rows)
# → [{'code': 'META', 'name': 'Meta Platforms', 'market_cap': 1549098205499.0, 'pe_annual': 25.98, ...}, ...]
```

### 已知坑（实测踩过）

| 坑 | 说明 |
|---|---|
| 方法名 | `ctx.get_stock_screen(req)`，不是 `ctx.stock_screen()` |
| 返回值 | **三值解包** `(ret, total, rows)`，不是两值 |
| `page_count` | 用 `req.page_count = N` 设数量，无 `page_size` 参数 |
| 字段来自 `stock_screen_const` | `SimpleProperty.PE_ANNUAL` 在 `SimpleProperty`，不在 `FinancialProperty` |
| `add_sort` 第三参数 | 是字典 `{'name': int(SimpleProperty.MARKET_CAP)}`，不是直接传枚举 |
| `add_retrieve_simple_property` | 方法名是 `add_retrieve_simple`，不是 `add_retrieve_simple_property` |
| A 股不支持 | `ScrMarket` 中无 A 股市场；A 股板块扫描一律走东财 |

## 港股 A 股信号差异

| 维度 | 港股 | A 股 |
|------|------|------|
| 板块来源 | 富途 INDUSTRY + CONCEPT | 东财 486 概念板块 |
| 资金流 | `get_capital_flow(DAY)` 完整 | `get_capital_flow` 完整 |
| 链上拥挤度 | 不适用（港股链上 OI < 10 万 USD，信号无效） | 不适用（无链上镜像） |
| 北向资金 | 不适用 | 需叠加（沪深港通数据） |
| `get_plate_stock` | 正常 | 概念板块有覆盖缺口 |
