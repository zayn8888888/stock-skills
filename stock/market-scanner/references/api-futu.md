# 富途 API 参考

## 安装与脚本路径

OpenD + futu-api SDK 安装见 `install-futu-opend` skill；命令统一走 `${CLAUDE_SKILLS_DIR:-$HOME/.claude/skills}/futuapi/scripts/`，与 stock-analyzer 共用脚本集。

## 常用脚本对照表

| 脚本 | 用途 | 备注 |
|------|------|------|
| `get_snapshot.py <CODE>` | PE/市值/今日涨幅/成交额 | `pe_ratio` 港股常为 null，首选 `get_stock_info.py` 的 `pe_ttm_ratio` |
| `get_kline.py <CODE> --ktype 1d --num N` | 日/周/月 K 线 | 底层 SDK 三值解包，脚本已封装 |
| `get_capital_flow.py <CODE>` | 历史资金流（最近 36 天） | 美股蓝筹频繁返回 0，见 fallback 规则 |
| `get_capital_distribution.py <CODE>` | 超大/大/中/小单实时分布 | A 股数据完整 |
| `get_owner_plate.py <CODE>` | 查股票所属板块（反查） | |
| `get_plate_list.py <MKT> --type INDUSTRY/CONCEPT` | 获取板块列表 | |
| `get_plate_stock.py <PLATE>` | 获取板块成分股 | **A 股大量概念板块返回"未知股票"，见缺口说明** |
| `get_stock_filter.py` / `get_stock_screen.py --config x.json` | 条件选股（旧/新接口） | 详见下文 |
| `get_stock_info.py <CODE>` | 基本信息（含 pe_ttm_ratio / 52 周高低 / 换手率） | PE 首选此接口 |

## A 股板块 K 线

实测（2026-05-27）：`get_kline.py` 对 A 股 INDUSTRY（131 个）和 CONCEPT（788 个）板块的 K 线数据全量可用，代码格式 `SH.LIST0xxx`，788 个板块约 18 秒完成。

**但无法替代东财用于 L1.5**：富途与东财是两套独立板块体系，成分股不同、涨幅口径不同。更关键的是，热点新概念板块（先进封装/CPO/HBM/玻璃基板等 `SH.LIST23xxx`）的 `get_plate_stock.py` 全部报"未知股票"，L3 成分股无法获取。market-scanner 全链路必须保持东财口径。

```bash
# 仅作参考（不用于 market-scanner 主流程）
python3 "${CLAUDE_SKILLS_DIR:-$HOME/.claude/skills}"/futuapi/scripts/quote/get_plate_list.py SH --type CONCEPT --json
python3 "${CLAUDE_SKILLS_DIR:-$HOME/.claude/skills}"/futuapi/scripts/quote/get_kline.py SH.LIST0463 --ktype 1d --num 30 --json   # PCB概念 K 线可用

# ❌ 但这些新板块的成分股拿不到：
python3 "${CLAUDE_SKILLS_DIR:-$HOME/.claude/skills}"/futuapi/scripts/quote/get_plate_stock.py SH.LIST23120   # 先进封装 → ERROR "未知股票"
python3 "${CLAUDE_SKILLS_DIR:-$HOME/.claude/skills}"/futuapi/scripts/quote/get_plate_stock.py SH.LIST23084   # 玻璃基板封装 → ERROR
python3 "${CLAUDE_SKILLS_DIR:-$HOME/.claude/skills}"/futuapi/scripts/quote/get_plate_stock.py SH.LIST23307   # HBM → ERROR
```

## 港美股板块 K 线代码

```bash
# 港股板块：111 个 INDUSTRY + 117 个 CONCEPT = 228 个，代码格式 HK.LIST1xxx
python3 "${CLAUDE_SKILLS_DIR:-$HOME/.claude/skills}"/futuapi/scripts/quote/get_plate_list.py HK --type INDUSTRY --json
python3 "${CLAUDE_SKILLS_DIR:-$HOME/.claude/skills}"/futuapi/scripts/quote/get_plate_list.py HK --type CONCEPT --json

# 美股板块：145 个 INDUSTRY + 117 个 CONCEPT = 262 个，代码格式 US.LIST2xxx
python3 "${CLAUDE_SKILLS_DIR:-$HOME/.claude/skills}"/futuapi/scripts/quote/get_plate_list.py US --type INDUSTRY --json
python3 "${CLAUDE_SKILLS_DIR:-$HOME/.claude/skills}"/futuapi/scripts/quote/get_plate_list.py US --type CONCEPT --json

# 板块 N 日涨幅：拉日 K 线，取首尾 close
python3 "${CLAUDE_SKILLS_DIR:-$HOME/.claude/skills}"/futuapi/scripts/quote/get_kline.py <PLATE_CODE> --ktype 1d --num $((N+5)) --json
# JSON.data[] 每条含 close；returnRate = (last.close / data[-(N+1)].close - 1) * 100
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

`get_plate_stock.py` 对大量 A 股新增概念板块（先进封装 / CPO / HBM / 玻璃基板封装等）返回 `"未知股票"` 错误。

**根因**：这是富途**服务端产品层面**的限制，与本地 OpenD 版本无关，**升级 OpenD 无效**。

**解决方案**：
- A 股板块扫描一律走东方财富 API（见 [api-eastmoney.md](api-eastmoney.md)）
- 富途仅负责 A 股**个股级别**的深度行情（PE/市值/K线）和资金流数据

## 条件选股 V2（get_stock_screen）

新接口，ProtoID 3252，**仅支持 HK / US**（A 股走东财，本接口不支持）。脚本已封装请求构造、字段枚举、结果解码三件事，调用时只需写 JSON config。

### 用法

```bash
python3 "${CLAUDE_SKILLS_DIR:-$HOME/.claude/skills}"/futuapi/scripts/quote/get_stock_screen.py \
  --config /tmp/screen_hk_quality.json --page-count 50 --json
```

### JSON config 示例（港股质量阀门 + 按市值排序）

```json
{
  "filters": [
    {"type": "simple_field", "field": "MARKET", "values": ["HK"]},
    {"type": "simple_property", "name": "MARKET_CAP", "lower": 3000000000.0},
    {"type": "simple_property", "name": "PE_ANNUAL", "lower": 0.01},
    {"type": "simple_property", "name": "PRICE", "lower": 1.0}
  ],
  "retrieves": [
    {"type": "basic", "name": "CODE"},
    {"type": "basic", "name": "NAME"},
    {"type": "simple", "name": "MARKET_CAP"},
    {"type": "simple", "name": "PE_ANNUAL"},
    {"type": "simple", "name": "PE_TTM"},
    {"type": "simple", "name": "PB"},
    {"type": "simple", "name": "PRICE"}
  ],
  "sorts": [
    {"direction": "DESC", "property_type": "simple",
     "property_params": {"name": "MARKET_CAP"}}
  ]
}
```

按板块筛选时把第一个 filter 换成 `{"type": "plate", "plate_ids": ["HK.LIST1013"]}`。

**单位约定**：`lower / upper` 直接传原始值——`PRICE` 10.0 = 10 元；`MARKET_CAP` 1e10 = 100 亿；涨跌幅 5% 传 `5.0`（不是 0.05）。

### 输出结构

脚本已自动解码 `{stock_id, results}` 嵌套，输出每条是扁平 dict：

```json
{"data": [{"CODE": "HK.00700", "NAME": "腾讯控股", "MARKET_CAP": 4521098205499.0,
           "PE_ANNUAL": 21.55, "PE_TTM": 19.83, "PB": 5.42, "PRICE": 521.0}, ...]}
```

### 已知约束

| 约束 | 说明 |
|---|---|
| 港股 BMP 权限不支持 | 接口对 BMP 用户直接报错 |
| 港股财务数据 | 仅 Q1 + ANNUAL 完整，Q2/Q3/Q4 通常缺失 |
| 分页 | 每页最多 200，超出用 `--page-from` |
| A 股不支持 | `ScrMarket` 中无 A 股市场；A 股板块扫描一律走东财 |

## 港股 A 股信号差异

| 维度 | 港股 | A 股 |
|------|------|------|
| 板块来源 | 富途 INDUSTRY + CONCEPT | 东财 486 概念板块 |
| 资金流 | `get_capital_flow(DAY)` 完整 | `get_capital_flow` 完整 |
| 链上拥挤度 | 不适用（港股链上 OI < 10 万 USD，信号无效） | 不适用（无链上镜像） |
| 北向资金 | 不适用 | 需叠加（沪深港通数据） |
| `get_plate_stock` | 正常 | 概念板块有覆盖缺口 |
