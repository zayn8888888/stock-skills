---
name: event-calendar
description: 前瞻事件日历助手。经济日历与财报日历优先用富途 OpenAPI（港股、美股、A 股），Finnhub 只在 OpenD 不可用或富途没有欧元区数据时兜底。Polymarket 负责高流动性宏观押注。Tavily 负责中港政策与行业事件文本。输出未来 N 天结构化事件清单，含日期、事件名、市场预期、市场押注概率、信源。触发场景：(1) 用户问"未来一周/一个月有什么大事 / FOMC 何时开会 / 降息概率多少 / CPI 何时发布 / 财报日历 / 美股财报日 / NVDA 什么时候出财报"；(2) 用户问"政策预期 / 关税预期 / 降息预期 / 押注 / Polymarket / 选举概率 / 衰退概率"；(3) 被 market-scanner 在「催化」「产业链外推」环节调用，被 stock-analyzer 作为「事件日历」维度调用。不适用于：历史事件回溯（用 stock-analyzer 维度 7）、实时盘中事件推送、把富途事件合约当成预测市场（押注仍用 Polymarket）。
---

# 前瞻事件日历

## 核心原则

1. **未来不预测，市场预期可引用**：只列"市场预期值/共识值/隐含概率"，清楚标注来源
2. **数据缺失显式标注**：任何数据源不可用，剩余源照常给数据，不可用的单独标"⚠️ 不可用 + 原因"
3. **时区统一**：日期一律 **UTC**，对中港用户额外标 HKT（UTC+8）
4. **流动性门槛**：Polymarket 市场 24h vol ≥ $50,000 才采用
5. **不出买卖指令**：日历是输入，不是结论

## 执行前必读（收到任务后第一步）

```bash
Read references/futu-calendar.md   # 富途经济日历 + 财报日历（主源）
Read references/finnhub.md          # Finnhub 兜底：OpenD 失败，以及欧元区 / ECB
Read references/polymarket.md       # Polymarket Gamma API 详细用法
Read references/caller-interface.md # 被 market-scanner / stock-analyzer 调用时的接口规格
Read references/data-sources.md     # 三个数据源完整 API 规格（Finnhub/Polymarket/Tavily）
Read references/query-templates.md  # 中港政策 Tavily 关键词模板
Read references/report-template.md  # 完整报告模板与表格硬规则
```

## Finnhub API Key 检查

⚠️ Claude Code Bash 工具是 non-interactive non-login shell，默认不读 `~/.zshrc`，用以下脚本先检查：

```bash
if [ -z "${FINNHUB_API_KEY:-}" ]; then
  for rc in ~/.zshenv ~/.zshrc ~/.bash_profile ~/.bashrc ~/.profile; do
    [ -f "$rc" ] || continue
    KEY=$(grep -E '^[[:space:]]*export[[:space:]]+FINNHUB_API_KEY=' "$rc" 2>/dev/null \
          | tail -1 | sed -E 's/^[[:space:]]*export[[:space:]]+FINNHUB_API_KEY=[[:space:]]*//; s/^["'"'"']//; s/["'"'"'][[:space:]]*$//')
    if [ -n "$KEY" ]; then export FINNHUB_API_KEY="$KEY"; break; fi
  done
fi
[ -z "${FINNHUB_API_KEY:-}" ] && echo "⚠️ FINNHUB_API_KEY 未设置"
```

未配置时跳过 Finnhub 兜底，继续跑富途日历 + Polymarket + Tavily。🔒 不要在对话里 echo $FINNHUB_API_KEY。

## 标准输入

| 字段 | 必填 | 默认 | 说明 |
|------|------|------|------|
| `from` | 否 | 今天 | UTC `YYYY-MM-DD` |
| `to` | 否 | 今天+14天 | UTC `YYYY-MM-DD` |
| `symbols` | 否 | 空 | 关心的标的列表 |
| `region` | 否 | **BOTH** | `US` / `HK` / `BOTH`；默认 BOTH，只有调用方明确说"只看美股/港股"时才传单一 region |

## 窗口外白名单

主表按 `from~to` 严格筛选，但以下决议发生在 `to+30天` 内**允许进主表**（标"窗口外但关键"）：FOMC / ECB / BOJ / PBOC LPR / HKMA。其他越界事件只进「窗口外预告」小节。

## 数据源执行顺序（并行）

1. **富途日历**（经济日历 US/HK/SH/JP + 财报日历 US/HK/SH/SZ）
2. **Finnhub**（仅兜底：OpenD 失败，或欧元区 / ECB，或单票在富途窗口里缺失）
3. **Polymarket**（高流动性宏观押注 + 经济数据子表。预测市场不改走富途事件合约）
4. **Tavily**（中港政策兜底）

（各数据源 API 用法、查询模板、接口规格已在执行前必读块加载）

## 输出格式

```markdown
## 📅 前瞻事件日历 · {FROM} 至 {TO} · 数据时点 {now UTC}

> 数据源：富途日历 {✅/❌} · Finnhub 兜底 {✅/❌/未用} · Polymarket {✅/❌} · Tavily {✅/❌}
> 时区：日期默认 UTC，括号内标注 HKT（UTC+8）/EST

| 日期(UTC) | 事件 | 类型 | 影响标的 | 市场预期 / 隐含概率 | 信源 |
|-----------|------|------|---------|-------------------|------|
| 2026-05-13 (HKT 05-13) | NVDA Q1 FY27 财报 (amc) | 财报 | US.NVDA | EPS $0.74 / Rev $43.2B | futu |
| 2026-05-15 (HKT 05-16) | FOMC 利率决议 | 货币政策 | US 全市场 | 降息 25bp 73% (vol $2.3M) | polymarket+futu |

### Polymarket 高流动性宏观押注 Top 5
（同上格式，保留 question 全文 + slug 完整 URL）

### 经济数据押注（来自 Polymarket，门槛 vol24 > $50k）
（详见 references/polymarket.md B4 格式）

### 参考线索（未确认日期，仅作信息）
```

## 失败模式与降级

| 场景 | 行为 |
|------|------|
| 经济日历返回「频率太高」 | 停止重试。FOMC 用 FedWatch 的 `meeting_date`，其余宏观日期走 Finnhub，再不行走 Tavily，并写明各自信源 |
| 财报日历日期范围超过 7 天 | 拆成两段重打，每段 ≤7 天 |
| OpenD 未连接 / 富途日历其它报错 | 经济日历与财报日历改走 Finnhub，标"⚠️ 富途日历不可用，已改用 Finnhub" |
| `FINNHUB_API_KEY` 未设置 / 401 / 网络错误 | 只影响兜底。富途日历已成功则忽略；富途也失败则标"⚠️ Finnhub 未配置" |
| Polymarket Gamma API 5xx | 跳过押注表，标"⚠️ Polymarket 暂不可用"。不要改用富途事件合约填这张表 |
| Tavily 无结果 | 政策区域显示"未检索到符合条件的政策日程" |
| 日历与押注全部失败 | 输出"⚠️ 数据源不可用"，不强行编内容 |

## 输出原则

1. 每条事件必须有信源链接，**不编日期、不编共识值**
2. `actual` 为空就标"待发布"，不写预测数字
3. Polymarket 隐含概率必须附 24h volume
4. 时间窗口默认 14 天；用户明确说"下个月/下季度"再扩
5. 不出买卖指令，不写"建议关注/利好/利空"
