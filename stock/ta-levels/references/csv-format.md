# CSV 输入格式规范

## 必须列（大小写不敏感）

| 列名 | 类型 | 说明 |
|------|------|------|
| `open`  | float | 开盘价 |
| `high`  | float | 最高价 |
| `low`   | float | 最低价 |
| `close` | float | 收盘价 |

## 可选列

| 列名 | 类型 | 用途 |
|------|------|------|
| `volume` | float/int | Volume Profile 方法必需；其余方法忽略 |
| `date`   | string | 任意格式，用于摆动高低点的 detail 展示 |

## 示例（最简）

```csv
open,high,low,close
10.50,10.80,10.30,10.65
10.65,10.90,10.55,10.72
10.72,11.10,10.60,11.05
...
```

## 示例（含成交量和日期）

```csv
date,open,high,low,close,volume
2025-01-02,10.50,10.80,10.30,10.65,1234567
2025-01-03,10.65,10.90,10.55,10.72,987654
2025-01-06,10.72,11.10,10.60,11.05,2345678
...
```

## 从富途 API 获取数据

使用 `futuapi` skill 拉取 K 线后另存为 CSV：

```python
# 伪代码示例
kline_data = get_kline("HK.00700", ktype=KLType.K_DAY, num=100)
kline_data[["time_key","open","high","low","close","volume"]].to_csv(
    "/tmp/ohlcv.csv", index=False
)
```

然后将 `time_key` 列重命名为 `date` 即可被脚本识别。

## 最低数据量要求

| 方法 | 最少 K 线数 |
|------|:----------:|
| pivot_*      | 2（需要"上一根"） |
| swing        | `2×lookback + 1`（默认 11 根） |
| fibonacci    | `fib_lookback`（默认 50 根） |
| ma           | 250（才能算 MA250，否则跳过该均线） |
| vp           | 2 |

**建议**：至少提供 60 根以上 K 线，才能同时覆盖多数方法。

## 常见问题

| 现象 | 原因 | 处理 |
|------|------|------|
| `缺少必要列: ['high']` | 列名有空格或大写 | 脚本已自动 `strip().lower()`，检查列名是否包含非 ASCII 字符 |
| MA250 未出现在结果中 | 数据不足 250 根 | 正常，脚本自动跳过 |
| Volume Profile 报错 | 无 volume 列 | 提供含 volume 的数据，或跳过该方法 |
| 摆动高低点结果为空 | lookback 过大或数据量不足 | 减小 `--lookback` 参数 |
