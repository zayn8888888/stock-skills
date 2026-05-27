---
name: event-calendar
description: 前瞻事件日历助手。聚合三个数据源——Finnhub（美国经济数据释放日历 + 美股财报日历）、Polymarket（高流动性宏观市场隐含概率）、Tavily（中港政策与行业事件文本搜索），输出未来 N 天结构化事件清单，含日期、事件名、市场预期、市场押注概率、信源链接。触发场景：(1) 用户问"未来一周/一个月有什么大事 / FOMC 何时开会 / 降息概率多少 / CPI 何时发布 / 财报日历 / 美股财报日 / NVDA 什么时候出财报"；(2) 用户问"政策预期 / 关税预期 / 降息预期 / 押注 / Polymarket / 选举概率 / 衰退概率"；(3) 被 market-scanner 在「催化」「产业链外推」环节调用，被 stock-analyzer 作为「事件日历」维度调用。不适用于：历史事件回溯（用 stock-analyzer 维度 7）、实时盘中事件推送、A 股本土经济日历（Finnhub 不覆盖，仅靠 Tavily 兜底）。
---

# 前瞻事件日历

## 核心原则

1. **未来不预测，市场预期可引用**：只列"市场预期值/共识值/隐含概率"，清楚标注来源
2. **数据缺失显式标注**：任何数据源不可用，剩余源照常给数据，不可用的单独标"⚠️ 不可用 + 原因"
3. **时区统一**：日期一律 **UTC**，对中港用户额外标 HKT（UTC+8）
4. **流动性门槛**：Polymarket 市场 24h vol ≥ $50,000 才采用
5. **不出买卖指令**：日历是输入，不是结论

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

未配置时跳过 Finnhub，继续跑 Polymarket + Tavily。🔒 不要在对话里 echo $FINNHUB_API_KEY。

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

1. **Finnhub**（美国经济日历 + 美股财报）→ 详见 [references/finnhub.md](references/finnhub.md)
2. **Polymarket**（高流动性宏观押注 + 经济数据子表）→ 详见 [references/polymarket.md](references/polymarket.md)
3. **Tavily**（中港政策兜底）→ 详见 [references/caller-interface.md](references/caller-interface.md)

被 market-scanner / stock-analyzer 调用时的接口规格见 [references/caller-interface.md](references/caller-interface.md)。

## 输出格式

```markdown
## 📅 前瞻事件日历 · {FROM} 至 {TO} · 数据时点 {now UTC}

> 数据源：Finnhub {✅/❌} · Polymarket {✅/❌} · Tavily {✅/❌}
> 时区：日期默认 UTC，括号内标注 HKT（UTC+8）/EST

| 日期(UTC) | 事件 | 类型 | 影响标的 | 市场预期 / 隐含概率 | 信源 |
|-----------|------|------|---------|-------------------|------|
| 2026-05-13 (HKT 05-13) | NVDA Q1 FY27 财报 (amc) | 财报 | US.NVDA | EPS $0.74 / Rev $43.2B | finnhub |
| 2026-05-15 (HKT 05-16) | FOMC 利率决议 | 货币政策 | US 全市场 | 降息 25bp 73% (vol $2.3M) | polymarket+finnhub |

### Polymarket 高流动性宏观押注 Top 5
（同上格式，保留 question 全文 + slug 完整 URL）

### 经济数据押注（来自 Polymarket，门槛 vol24 > $50k）
（详见 references/polymarket.md B4 格式）

### 参考线索（未确认日期，仅作信息）
```

## 失败模式与降级

| 场景 | 行为 |
|------|------|
| `FINNHUB_API_KEY` 未设置 / 401 / 网络错误 | 跳过源 A，标"⚠️ Finnhub 未配置"，继续 B+C |
| Polymarket Gamma API 5xx | 跳过 B，标"⚠️ Polymarket 暂不可用"，继续 A+C |
| Tavily 无结果 | C 区域显示"未检索到符合条件的政策日程" |
| 三源全部失败 | 输出"⚠️ 三个数据源全部不可用"，不强行编内容 |

## 输出原则

1. 每条事件必须有信源链接，**不编日期、不编共识值**
2. `actual` 为空就标"待发布"，不写预测数字
3. Polymarket 隐含概率必须附 24h volume
4. 时间窗口默认 14 天；用户明确说"下个月/下季度"再扩
5. 不出买卖指令，不写"建议关注/利好/利空"
