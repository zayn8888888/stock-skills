# L1.5 轮动时序分析

## 目标

在进入 L2 质量验证前，用 4 周历史数据判断每个入围板块的性质——是持续主线还是脉冲热点。**这一步直接决定"值不值得追"，比任何单日信号都重要。**

## classify_rotation 完整代码（A 股）

**数据来源**：东财历史 K 线（`em_get_board_kline(bk_code, weeks=4)`），无需本地存储，实时拉取。

> ⚠️ `push2his` 无备用节点，高频或交易高峰期会触发"Remote end closed"限流。`em_get_board_kline` 返回空 dict 时，调用方**必须走降级路径**（见本文末 [限流降级](#限流降级) 章节），不要直接报错中止。

```python
from itertools import takewhile

def classify_rotation(bk_code, bk_name):
    """拉4周日K线，按周聚合，输出板块轮动性质"""
    kdata = em_get_board_kline(bk_code, weeks=4)
    
    # 按自然周分组，计算每周累计涨幅
    week_data = {}
    for date_str, v in sorted(kdata.items()):
        dt = datetime.strptime(date_str, '%Y-%m-%d')
        wk = dt.strftime('%Y-W%U')
        week_data.setdefault(wk, []).append((date_str, v))
    
    weekly_rets = []
    week_labels = []
    for wk, days in sorted(week_data.items())[-4:]:
        fc = days[0][1]['close'] / (1 + days[0][1]['pct']/100)
        lc = days[-1][1]['close']
        weekly_rets.append(round((lc/fc-1)*100, 2))
        week_labels.append(f"{days[0][0][5:]}~{days[-1][0][5:]}")
    
    # 连涨周数（从最近一周往前数）
    consec = sum(1 for _ in takewhile(lambda v: v > 0, reversed(weekly_rets)))
    
    # 趋势加速 or 减速
    accelerating = len(weekly_rets) >= 2 and weekly_rets[-1] > weekly_rets[-2] > 0
    
    # 性质判断
    if consec == 4:     nature = '✅ 持续主线'
    elif consec == 3 and accelerating:  nature = '📊 次级主线↗'
    elif consec == 3:   nature = '📊 次级主线↘'
    elif consec <= 1 and len([v for v in weekly_rets[:-1] if v < 0]) >= 2:
                        nature = '⚡ 脉冲热点'
    elif weekly_rets[-1] < 0 and (len(weekly_rets) < 2 or weekly_rets[-2] < 0):
                        nature = '❄️ 退潮中'
    else:               nature = '↔️ 震荡'
    
    return {'weekly_rets': weekly_rets, 'labels': week_labels,
            'consec': consec, 'nature': nature}
```

## 性质判断规则表

| 连涨周数 | 周度趋势 | 性质标签 | 追板策略 | A股典型案例（2026-05实测） |
|---------|---------|---------|---------|----------------------|
| 4 周全正 | — | ✅ 持续主线 | **优先追**，4周资金持续认可；需检查是否过热 | 玻璃基板封装（4周全涨）、PCB（4周全涨） |
| 3 周正 | 最新周加速 | 📊 次级主线↗ | 可追，但确认加速再入 | 先进封装（W-1→本周加速） |
| 3 周正 | 最新周减速 | 📊 次级主线↘ | 谨慎，热度消退中 | — |
| 1-2 周正 | 前几周负 | ⚡ 脉冲热点 | **不追**，3-7天内消退 | MLCC（5d+15.8% 但前3周负）、培育钻石 |
| 最新1-2周负 | — | ❄️ 退潮中 | 不追，等下一个入场点 | 3D摄像头（W-1转负后继续弱） |

> **性质 ≠ 强弱**：MLCC 5日涨幅最高但性质是脉冲热点；玻璃基板封装 5日第二但是持续主线。L2 及之后**优先对性质为持续主线/次级主线的板块展开**，脉冲热点直接跳过 L2/L3，仅在报告里标注"已识别为脉冲热点，不做成分股分析"。

## 港美股适用方式

港美股板块 K 线直接支持周度对比，数据来源不同，逻辑相同：

```python
def hkus_plate_weekly(ctx, plate_code, weeks=4):
    end = datetime.today()
    start = end - timedelta(weeks=weeks+1)
    ret, data, _ = ctx.request_history_kline(
        plate_code, start=start.strftime('%Y-%m-%d'), end=end.strftime('%Y-%m-%d'),
        ktype=KLType.K_DAY, autype=AuType.QFQ, max_count=100)
    if ret != RET_OK: return {}
    daily = dict(zip(data['time_key'].str[:10], data['close'].tolist()))
    # 按周聚合（同 em_get_board_kline 的逻辑）...
```

## A 股 / 港股 / 美股 脉冲周期差异

| 市场 | 脉冲周期 | 次级主线门槛 | 持续主线门槛 |
|------|---------|------------|------------|
| A 股 CONCEPT | 3-7 个交易日 | 连涨 ≥ 3 周 | 连涨 4 周 |
| 港股 CONCEPT | 2-4 周 | 连涨 ≥ 3 周 | 连涨 4 周 |
| 美股 INDUSTRY | 更平滑 | 连涨 ≥ 2 周即可 | 连涨 4 周 |
| 美股 CONCEPT（ETF 主题） | 同 A 股 CONCEPT | 连涨 ≥ 3 周 | 连涨 4 周 |

## 输出格式（报告中的表格）

L1.5 在报告里以表格呈现，直接跟在 L1 板块排行后面：

```
| 板块        | 5d    | W-3   | W-2   | W-1   | 本周  | 连涨 | 性质         |
|------------|-------|-------|-------|-------|-------|------|-------------|
| 玻璃基板封装 | +12%  | +6.6% | +5.9% | +8.5% | +6.2% | 4周  | ✅ 持续主线  |
| PCB        | +7%   | +6.0% | +7.4% | +12.8%| +5.7% | 4周  | ✅ 持续主线  |
| 先进封装     | +11%  | +10.9%| -1.4% | +17.1%| +9.0% | 2周  | 📊 次级主线↗ |
| MLCC       | +15%  | +0.8% | -4.7% | +1.7% | -2.3% | 0周  | ⚡ 脉冲热点  |
```

## 限流降级

`push2his` 限流时（`em_get_board_kline` 返回空 dict），按以下两层降级执行，**不中止 L1.5，不静默跳过**：

### 降级 1：f109 + f115 简化分类（零额外调用，L1 已拉）

用 `em_get_all_boards()` 已返回的 `f109`（5日）和 `f115`（~30日）做代理判断：

```python
def classify_rotation_fallback(board):
    """push2his 限流时的降级分类，基于 f109/f115"""
    f109 = board.get('f109', 0)  # 5日涨幅
    f115 = board.get('f115', 0)  # ~30日涨幅（非10日）
    
    if f109 < 0:
        return '❄️ 退潮中', 'f109/f115降级'
    if f109 > 5 and f115 < f109 * 0.5:
        return '⚡ 脉冲嫌疑', 'f109/f115降级'  # 近5日远强于月度
    if f109 > 3 and f115 > 8:
        return '📊 趋势持续（降级）', 'f109/f115降级'  # 无法区分主线/次级
    return '↔️ 震荡', 'f109/f115降级'
```

**精度说明**：
- `退潮中` 和 `脉冲嫌疑` 置信度较高（f109/f115 方向明确）
- `趋势持续（降级）` 无法区分持续主线 vs 次级主线——两者策略不同，报告中必须标注"K线降级，无法区分主线级别"
- 在报告 L1.5 表格里，降级行用 `*` 标注，周度列填 `—`

### 降级 2：Tavily 新闻时序倒推（降级1也无法判断时）

并行搜近 4 周板块新闻，人工判断资金持续性：
```
"<板块名> 概念股 涨停 资金 <近3周日期范围>"
```
精度最低，仅作补充，报告中标注"新闻倒推，精度低"。

### 降级触发时的报告标注

```markdown
> ⚠️ L1.5 部分板块采用 f109/f115 降级分类（push2his 限流）：
> - 退潮/脉冲判断置信度正常
> - "趋势持续"板块无法区分主线级别，建议等 push2his 恢复后重跑确认
```
