# 被调用接口（market-scanner / stock-analyzer）

## market-scanner 调用

market-scanner 在 L4「催化」和 L5 产业链外推时调用：

```
任务：扫 US 板块未来 14 天催化
输入：from=今天, to=今天+14, region=US
要本 skill 给：经济日历 + 涉及 Top 板块成分股的财报日历 + Polymarket 宏观押注
```

## stock-analyzer 调用

stock-analyzer 在维度 9「事件日历」调用：

```
任务：列出 NVDA 未来 14 天事件
输入：from=今天, to=今天+14, symbols=[NVDA], region=US
要本 skill 给：NVDA 财报日 + 影响 NVDA 的宏观节点（FOMC/CPI/中美关税相关 Polymarket）
```

**宏观节点筛选规则**：

| 标的属性 | 必抓宏观节点 |
|---------|------------|
| 所有美股 | FOMC + US CPI + US 非农 + 关税相关 Polymarket |
| 所有港股 | HKMA + PBOC LPR + 香港金管局 |
| 中概股（含美股上市中国公司） | 叠加 PBOC LPR + 中美贸易/关税 Polymarket + ADR 监管 |
| 半导体 | 额外加芯片出口管制 Polymarket/Tavily |
| 新能源车 | 额外加中国新能源车补贴/关税 Tavily |
| 医药 | 额外加 FDA PDUFA 日历 + 中国集采 Tavily |
| 互联网平台 | 额外加反垄断/平台监管 Tavily |

## Tavily 中港政策兜底（C 源）

region = HK 或 BOTH 时并行 4 条：
```
Q1: "PBOC rate decision next meeting" OR "中国人民银行 利率决议 下次"
Q2: "HKMA policy meeting schedule" OR "香港金管局 议息"
Q3: "China economic data release calendar next week"（限近 7 天）
Q4: "中港 政策 监管 新闻"（限近 3 天）
```

结果筛选：URL 含日期 + 内容明确提到**未来日期** + 来源可信（路透/Bloomberg/财新/21财经/HKMA 官方）。不满足的列入"参考线索"区，不进主表。
