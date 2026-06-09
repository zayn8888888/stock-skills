---
name: ta-levels
description: >-
  确定性技术分析支撑/压力位计算器。基于用户提供的 OHLCV 数据，通过 Python 脚本（scripts/ta_levels.py）
  计算 7 种方法的关键价格位：经典枢轴点、斐波那契枢轴点、Camarilla 枢轴点、摆动高低点、
  斐波那契回调位、均线动态支撑/压力、成交量剖面（HVN/POC）。
  相同输入保证相同输出（无 LLM 推断参与计算）。
  Use when user provides OHLCV data and asks for 支撑位、压力位、阻力位、关键价位、pivot point、
  Fibonacci 位、均线支撑、Volume Profile、摆动高低点、日内短线关键位。
---

# 技术分析支撑/压力位计算

## 核心原则

> 计算结果 100% 由 `scripts/ta_levels.py` 产生，Claude 只负责格式化展示，**不判断、不主观加权**。

## 执行流程

```
Read references/methods.md          # 各方法公式说明（使用前必读）
Read references/csv-format.md       # 输入格式规范
```

### Step 1 — 数据获取（二选一）

**模式 A：直接指定代码**（推荐，需 OpenD 运行）

```bash
python scripts/ta_levels.py --code HK.00700 --ktype 1d --num 100 --method all
```

| 参数 | 说明 |
|------|------|
| `--code` | 富途格式股票代码（US.AAPL / HK.00700 / SH.600519） |
| `--ktype` | K 线类型，默认 1d（可选: 1m/3m/5m/15m/30m/60m/1d/1w/1M） |
| `--num` | K 线根数，默认 100 |
| `--rehab` | 复权类型，默认 forward（可选: none/forward/backward） |

**模式 B：提供 CSV 文件**（离线模式）

```bash
python scripts/ta_levels.py --file /tmp/ohlcv.csv --method all
```

| 列名 | 必须 | 说明 |
|------|------|------|
| open / high / low / close | ✅ | 大小写不敏感 |
| volume | ⬜ | Volume Profile 方法需要 |
| date | ⬜ | 有则展示，无则用序号 |

### Step 2 — 选择方法与参数

| 用途 | 推荐方法 | 关键参数 |
|------|---------|---------|
| 日内短线 | `pivot`（三种枢轴）| 无额外参数 |
| 波段支撑/压力 | `swing` + `fibonacci` | `--lookback 5`（可调） |
| 均线动态位 | `ma` | 无 |
| 筹码密集区 | `vp`（需成交量） | `--vp-bins 20` |
| 全量输出 | `all` | 上述所有参数 |

### Step 3 — 运行脚本

```bash
# 保存用户数据到 /tmp/ohlcv.csv，然后：
python scripts/ta_levels.py --file /tmp/ohlcv.csv --method all --output text
# 或机器消费：
python scripts/ta_levels.py --file /tmp/ohlcv.csv --method all --output json
```

### Step 4 — 展示结果

将脚本输出整理为表格，标注：
- **压力位**（当前价上方）：从近到远排列
- **支撑位**（当前价下方）：从近到远排列
- 注明数据来源（标的 / 时间周期 / K 线根数）

### Step 5 — 禁止做的事

- ❌ 不凭感觉"选"最重要的位
- ❌ 不添加无法从脚本输出中溯源的位
- ❌ 不给出买卖建议

## 快速示例

```bash
# 模式 A：直接拉取
python scripts/ta_levels.py --code US.AAPL --method all --output text
python scripts/ta_levels.py --code HK.00700 --ktype 1w --num 200 --method pivot

# 模式 B：CSV 文件
python scripts/ta_levels.py --file /tmp/ohlcv.csv --method pivot --output text
python scripts/ta_levels.py --file /tmp/ohlcv.csv --method swing --lookback 3 --output text
python scripts/ta_levels.py --file /tmp/ohlcv.csv --method all --output json
```

详细公式见 [references/methods.md](references/methods.md)。
CSV 格式规范见 [references/csv-format.md](references/csv-format.md)。
