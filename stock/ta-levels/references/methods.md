# 方法公式参考

> 每种方法对应 `scripts/ta_levels.py` 中的一个函数，公式与代码一一对应。

---

## 1. 经典枢轴点 (`pivot_classic`)

基于上一周期（日/周/月）的 High、Low、Close：

```
PP  = (H + L + C) / 3
R1  = 2×PP − L       S1  = 2×PP − H
R2  = PP + (H−L)     S2  = PP − (H−L)
R3  = H + 2×(PP−L)   S3  = L − 2×(H−PP)
```

**适用场景**：日线/周线级别波段。

---

## 2. 斐波那契枢轴点 (`pivot_fibonacci`)

PP 相同，但用斐波那契比例展开区间：

```
PP  = (H + L + C) / 3
R   = H − L
R1  = PP + 0.382×R   S1  = PP − 0.382×R
R2  = PP + 0.618×R   S2  = PP − 0.618×R
R3  = PP + 1.000×R   S3  = PP − 1.000×R
```

**适用场景**：想要更关注黄金比例位的交易者。

---

## 3. Camarilla 枢轴点 (`pivot_camarilla`)

以上一周期振幅乘以 1.1 系数生成 4 档（日内专用）：

```
R = H − L
R4 = C + R×1.1/2     S4 = C − R×1.1/2
R3 = C + R×1.1/4     S3 = C − R×1.1/4
R2 = C + R×1.1/6     S2 = C − R×1.1/6
R1 = C + R×1.1/12    S1 = C − R×1.1/12
```

**适用场景**：日内短线；价格触碰 R3/S3 是反转信号，突破 R4/S4 是强趋势信号。

---

## 4. 摆动高低点 (`swing_highs_lows`)

以 `lookback` 为窗口（默认 5），左右各 N 根 K 线均不高于/低于该点：

```python
swing_high[i] = (high[i] == max(high[i-L:i+L+1]))
swing_low[i]  = (low[i]  == min(low[i-L:i+L+1]))
```

返回最近 5 个摆动高点（压力）和 5 个摆动低点（支撑）。

**参数**：`--lookback N`（建议日线 3–5，分钟线 5–10）

---

## 5. 斐波那契回调 (`fibonacci_retracement`)

在最近 `lookback` 根 K 线内找极值，从最高点向最低点展开：

```
swing_high = max(high[-L:])
swing_low  = min(low[-L:])
diff       = swing_high − swing_low

0.0%   = swing_high
23.6%  = swing_high − 0.236×diff
38.2%  = swing_high − 0.382×diff
50.0%  = swing_high − 0.500×diff
61.8%  = swing_high − 0.618×diff   ← 黄金比例，最常用
78.6%  = swing_high − 0.786×diff
100%   = swing_low
```

**参数**：`--fib-lookback N`（默认 50，对应约 2–3 个月日线）

---

## 6. 均线支撑/压力 (`moving_averages`)

计算当前收盘价所在位置相对于各周期均线：

| 均线 | 含义 |
|------|------|
| MA5  | 超短期 |
| MA10 | 短期 |
| MA20 | 月线（最常用） |
| MA60 | 季线 |
| MA120 | 半年线 |
| MA250 | 年线 |

当前价上方的均线 = 压力；下方的均线 = 支撑。均线值随每根新 K 线动态变化。

---

## 7. 成交量剖面 (`volume_profile`)

将整段价格区间均等分为 `bins` 个价格箱，累计每个箱的成交量：

```
bin_size = (price_max − price_min) / bins
每根 K 线的 volume 归入其收盘价对应的箱
```

输出：
- **POC**（Point of Control）：最大成交量价格，强支撑/压力
- **HVN**（High Volume Node）：前 5 个高成交量节点，成为关键位
- **LVN**（Low Volume Node）：成交量稀疏区，价格易快速穿越（不直接输出，可从 detail 推算）

**参数**：`--vp-bins N`（默认 20；数据越多可适当增大，建议不超过 50）

---

## 各方法适用性对比

| 方法 | 日线 | 分钟线 | 需要成交量 | 参数敏感度 |
|------|:----:|:------:|:---------:|:---------:|
| pivot_classic   | ✅ | ✅ | ❌ | 低 |
| pivot_fibonacci | ✅ | ✅ | ❌ | 低 |
| pivot_camarilla | ⬜ | ✅ | ❌ | 低 |
| swing           | ✅ | ✅ | ❌ | 中（lookback）|
| fibonacci       | ✅ | ✅ | ❌ | 中（lookback）|
| ma              | ✅ | ⬜ | ❌ | 无 |
| vp              | ✅ | ✅ | ✅ | 中（bins）|
