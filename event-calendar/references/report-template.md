# 事件日历报告模板

## 标准模板（独立调用场景）

```markdown
## 📅 前瞻事件日历 · {FROM} 至 {TO}（UTC）

**数据时点**：{now UTC}（HKT {now+8h}）
**覆盖范围**：US 经济 + 美股财报 + 全球 Polymarket 押注 + 中港政策（Tavily）
**数据源状态**：Finnhub <✅/❌> · Polymarket <✅/❌> · Tavily <✅/❌>
**说明**：日期默认 UTC，括号内为 HKT；hour 字段：bmo=盘前 / amc=盘后

---

### 1. 高优先级事件（impact = high + Polymarket vol > $200k）

| 日期(UTC / HKT) | 事件 | 类型 | 影响标的 | 市场预期 / 隐含概率 | 信源 |
|----------------|------|------|---------|-------------------|------|
| 2026-05-13 12:30 / 20:30 | US Core CPI YoY | 经济数据 | US 全市场 | est 2.4% (prev 2.5%) | finnhub |
| 2026-05-15 18:00 / 02:00+1 | FOMC Rate Decision | 货币政策 | US 全市场 | 降息 25bp 73% (Polymarket vol $2.3M) | polymarket + finnhub |
| 2026-05-13 amc / 04:30+1 | NVDA Q1 FY27 Earnings | 财报 | US.NVDA | EPS $0.74 / Rev $43.2B | finnhub |

### 2. 中优先级事件（impact = medium 或 Polymarket vol $50k-$200k）

| 日期(UTC) | 事件 | 类型 | 影响标的 | 市场预期 | 信源 |
|-----------|------|------|---------|---------|------|
| 2026-05-14 12:30 | US Retail Sales MoM | 经济数据 | US 消费股 | est 0.3% | finnhub |
| ... | | | | | |

### 3. Polymarket 高流动性宏观押注 Top 5

按 24h 成交量排序：

| 市场 | 分类 | Yes / No 价 | 24h vol | 截止 | 链接 |
|------|------|------------|---------|------|------|
| Fed cuts 25bps in May 2026 | 货币政策 | **0.73** / 0.27 | $2.34M | 2026-05-15 | [polymarket.com/event/fed-cuts...](https://polymarket.com/event/fed-cuts-may-2026) |
| US recession in 2026 | 经济数据 | 0.28 / **0.72** | $1.12M | 2026-12-31 | [...](https://polymarket.com/event/us-recession-2026) |
| Trump raises China tariffs by July | 行业政策 | 0.45 / 0.55 | $890K | 2026-07-31 | [...] |

### 4. 中港政策日程（Tavily）

#### 央行 / 货币政策
- **2026-05-20**：中国 LPR 报价（每月 20 号）。财新预期 LPR 1Y 维持 3.1%。[来源](https://...)
- **2026-05-21**：HKMA 议息（跟随 FOMC 后第二日，无独立决策）。[来源](https://...)

#### 行业政策
- **2026-05-15 前后**（待确认日期）：网信办拟发布生成式 AI 备案新规修订。[来源](https://...)
- ...

#### 经济数据释放
- **2026-05-12**：中国 4 月社融数据公布。[来源](https://...)
- **2026-05-15**：中国 4 月经济数据（工业 / 投资 / 消费）。[来源](https://...)

### 5. 参考线索（未确认日期，仅作信息）

> 这些项命中了关键词，但未明确未来日期，**不进主表**，仅供 Claude / 用户在 deep dive 时手动确认：

- 中国可能在 5 月底召开制造业出海政策吹风会（财新引消息源）
- ...

---

## 局限与免责

- **数据局限**：<具体局限，例如 Finnhub 对 HK / CN 覆盖薄弱；Polymarket 美国法律限制注册导致部分用户无法验证；Tavily 受语言与索引时效影响>
- **本日历不预测结果**：所有"市场预期 / 隐含概率"均直接引用数据源，本 skill 不对事件结果做主观预测
- **不构成投资建议**：日历是输入，最终投资决策请以 stock-analyzer / stock-fundamentals / stock-valuation 综合判断 + 自身风险承受能力为准
```

---

## 子调用模板（被 market-scanner / stock-analyzer 调用时）

### A. market-scanner 调用（L4 催化补强 + L5 外推日历）

被调用方期望的输出格式更紧凑，**只要表格 + 简要小结**，不要完整模板：

```markdown
#### 未来 14 天催化日历（来自 event-calendar）

| 日期 | 事件 | 类型 | 关联板块 / 标的 | 市场预期 | 信源 |
|------|------|------|---------------|---------|------|
| ... | | | | | |

> 小结：未来 14 天 US 全市场最关键节点是 5/15 FOMC（降息押注 73%）+ 5/13 NVDA 财报（半导体板块 beta 决定）；中港重要节点是 5/20 LPR 报价。
```

### B. stock-analyzer 调用（维度 9）

```markdown
### 维度 9：事件日历（未来 14 天）

| 日期 | 事件 | 类型 | 市场预期 | 信源 |
|------|------|------|---------|------|
| 2026-05-13 amc | NVDA Q1 FY27 财报 | 财报 | EPS $0.74 / Rev $43.2B | finnhub |
| 2026-05-15 | FOMC 议息 | 货币政策 | 降息 25bp 73% | polymarket |
| 2026-05-13 | US Core CPI | 经济数据 | est 2.4% | finnhub |

> **关键风险节点**：5/13 财报本身就是 binary 风险事件；CPI 同日发布可能放大盘前波动；FOMC 决议两天后则影响半导体估值锚。
```

---

## 表格硬规则

1. **一事件一行（独立事件）**：互相独立的事件不许合并。`Existing Home Sales` 和 `CPI` 是两个独立事件，必须分两行；同样 `LPR 1Y` 和 `LPR 5Y` 是同一份报告里的两个数字，但 `Retail Sales` 和 `CPI` 是不同发布，必须分行
2. **同事件多指标 → 一行内换行**：CPI 报告同时发布 `Inflation MoM + Core CPI MoM + YoY` 三个指标；PCE 报告同时发布 `Core PCE + GDP 2nd Est + Personal Income/Spending + Durable Goods` 四个指标。**这种情况算"一个发布事件"，保留一行**，但**「市场预期」单元格内必须用换行（`<br>` / markdown 列表 `- `）让每个指标占独立一行**，禁止用斜杠 `/` 串接：

   ```markdown
   ❌ 错：Inflation MoM 估 0.6%（前 0.9%）/ Core CPI MoM 0.4%（前 0.2%）/ 同比 3.4%（前 3.3%）
   ✅ 对：
        - Inflation MoM 估 0.6%（前 0.9%）
        - Core CPI MoM 估 0.4%（前 0.2%）
        - Inflation YoY 估 3.4%（前 3.3%）
   ```

3. **一标的一行**：财报日多公司同日，每家单独一行；EPS / Rev 列严格对齐，禁止 `2.97 / .99B；5.00 / .41B` 这种紧凑写法
4. **数字带单位**：Revenue 用 `X.XB`（≥ 1B）/ `XXXM`（< 1B）格式，**禁止省略前导整数位**（`.88B` 是错的，`12.9B` 是对的）；货币单位 USD / CNY / HKD 显式写出
5. **链接必须可点**：Polymarket slug **不允许写 `link` 占位**，必须输出完整 URL `https://polymarket.com/event/<slug>`
6. **国家覆盖**：经济日历不只看 US，按主流市场范围 `US / EA / DE / JP / CN / HK` 全部纳入；ECB / 日银 / 中国 PMI 这种全球宏观影响事件必进主表

## 调性速查

- ✅ "5/15 FOMC，Polymarket 降息 25bp 隐含概率 73%（24h vol $2.3M）"
- ❌ "5/15 FOMC 大概率降息，利好科技股"（市场预期不等于结果；不出方向判断）
- ✅ "NVDA 5/13 盘后财报，Finnhub 共识 EPS $0.74 / Rev $43.2B"
- ❌ "NVDA 财报有望超预期"（预测事件结果不是本 skill 职责）
- ✅ "Finnhub key 未配置 → 美国经济日历与美股财报日历不可用，本次仅展示 Polymarket + Tavily 数据"
- ❌ 静默降级，不告知用户哪些源缺失
