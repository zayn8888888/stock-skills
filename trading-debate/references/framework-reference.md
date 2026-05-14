# 架构参考：TradingAgents + ai-hedge-fund

本文档说明 trading-debate skill 与两个开源项目的对应关系，便于理解流程与扩展。**仅复刻架构思路，不引入其代码或外部数据源。**

## TauricResearch/TradingAgents 流程映射

原项目用 LangGraph 编排，节点 + 条件边走完整 pipeline。本 skill 用顺序提示模拟相同流程。

### 原项目角色目录

```
tradingagents/agents/
├── analysts/
│   ├── market_analyst.py          # K 线 + 技术指标
│   ├── fundamentals_analyst.py    # 财务报表
│   ├── news_analyst.py            # 宏观 + 公司新闻
│   ├── sentiment_analyst.py       # 社交情绪
│   └── social_media_analyst.py    # Reddit / Twitter
├── researchers/
│   ├── bull_researcher.py         # 看多
│   └── bear_researcher.py         # 看空
├── managers/
│   ├── research_manager.py        # 裁判 Bull/Bear，出 ResearchPlan
│   └── portfolio_manager.py       # 最终决策，出 PortfolioDecision
├── trader/
│   └── trader.py                  # 中间 proposal，出 TraderProposal
└── risk_mgmt/
    ├── aggressive_debator.py      # 激进派
    ├── conservative_debator.py    # 保守派
    └── neutral_debator.py         # 中立派
```

### 关键编排逻辑（来自 conditional_logic.py）

```python
# Bull/Bear 辩论终止
if count >= 2 * max_debate_rounds:  # 默认 max=1，即 2 次发言
    return "Research Manager"
if last_response.startswith("Bull"):
    return "Bear Researcher"
return "Bull Researcher"

# Risk 三方辩论终止
if count >= 3 * max_risk_discuss_rounds:  # 默认 max=1，即 3 次发言
    return "Portfolio Manager"
# 轮转：Aggressive → Conservative → Neutral → Aggressive ...
```

### 评级体系（PortfolioRating）

5 档（**不是 6 档，不能自创**）：
- **Buy**：强力看多，建议建仓 / 加仓
- **Overweight**：建设性看多，建议逐步加大敞口
- **Hold**：中性平衡，维持现有仓位（仅当双方论据真旗鼓相当）
- **Underweight**：审慎看空，建议减仓
- **Sell**：强力看空，建议清仓 / 回避

### 结构化输出 schema（来自 schemas.py）

```python
class ResearchPlan:
    recommendation: PortfolioRating
    rationale: str          # 对话式总结
    strategic_actions: str  # 给 Trader 的执行指引

class TraderProposal:
    action: Literal["Buy", "Hold", "Sell"]  # 注意 Trader 只有 3 档
    reasoning: str
    entry_price: Optional[float]
    stop_loss: Optional[float]
    position_sizing: Optional[str]
    # 末尾必须输出: FINAL TRANSACTION PROPOSAL: **BUY/HOLD/SELL**

class PortfolioDecision:
    rating: PortfolioRating  # 5 档
    executive_summary: str
    investment_thesis: str
    price_target: Optional[float]
```

### Reflection（事后反思）

原项目：交易完成后调 `Reflector.reflect_on_final_decision`，输入 raw_return / alpha_return，输出 2-4 句反思存日志，下次相似分析作为 lesson 注入。

**本 skill v0.1 不实现**（无跨会话状态）。v0.3 路线图：用 memory 系统存。

## virattt/ai-hedge-fund 大师 agent 模式

原项目 17 个大师 agent，每个是独立函数，输出统一信号格式。

### 信号 schema

```python
class XSignal(BaseModel):
    signal: Literal["bullish", "bearish", "neutral"]
    confidence: int  # 0-100
    reasoning: str
```

### Prompt 模板四段式（以 Buffett 为例）

```
1. 角色定位：You are Warren Buffett. Decide bullish/bearish/neutral using only the provided facts.

2. Checklist（角色独有视角）：
   - Circle of competence
   - Competitive moat
   - Management quality
   - Financial strength
   - Valuation vs intrinsic value
   - Long-term prospects

3. Signal rules（明确触发条件）：
   - Bullish: strong business AND margin_of_safety > 0
   - Bearish: poor business OR clearly overvalued
   - Neutral: good business but margin_of_safety <= 0, or mixed evidence

4. Confidence scale（0-100 校准）：
   - 90-100%: Exceptional business in circle, attractive price
   - 70-89%:  Good moat, fair valuation
   - 50-69%:  Mixed signals
   - 30-49%:  Outside expertise or concerning fundamentals
   - 10-29%:  Poor business or significantly overvalued
```

### 17 个大师列表（v0.2 待选）

护城河 / 价值派：Warren Buffett, Charlie Munger, Phil Fisher, Aswath Damodaran
深度价值 / 反向：Ben Graham, Michael Burry, Mohnish Pabrai, Rakesh Jhunjhunwala
成长 / GARP：Peter Lynch, Cathie Wood
宏观 / 顺势：Stanley Druckenmiller, Bill Ackman
风险 / 黑天鹅：Nassim Taleb

加上工厂角色：fundamentals / news_sentiment / sentiment / technicals / valuation / growth_agent / risk_manager / portfolio_manager

## 与本 skill 的差异（明确区分）

| 维度 | TradingAgents | ai-hedge-fund | 本 skill v0.2（当前）|
|------|---------------|---------------|--------------|
| 数据源 | Yahoo + Reddit + 自建 | financialdatasets.ai API | 富途 OpenAPI + Tavily（复用现有 skill）|
| 编排引擎 | LangGraph | LangGraph | Claude Code skill 顺序提示 |
| 状态持久化 | LangGraph checkpoint | LangGraph state | 当前会话内 |
| Reflection | ✅ 事后反思存日志 | ❌ | ❌（v0.3 路线图） |
| 大师 agent | ❌ | ✅ 17 个 | ✅ **7 个**（Buffett/Munger/Lynch/Burry/Druckenmiller/Damodaran/Ackman）|
| 多标的组合 | ❌（单标的辩论） | ✅ Portfolio 跨标的优化 | ❌（v0.4 路线图） |
| 5 档评级 | ✅ | ✅（confidence + signal） | ✅ |
| Risk 三方辩论 | ✅ | ❌（单 risk agent） | ✅ |
| 角色独立 LLM 调用 | ✅ 每个角色独立 invoke | ✅ | ✅ 每个角色独立提示 |
| 大师信号注入辩论 | ❌（无大师概念） | ❌（大师独立投票，无辩论） | ✅ **大师信号→Bull/Bear 弹药**（本 skill 创新点） |

## 参考链接

- TradingAgents 源码：https://github.com/TauricResearch/TradingAgents
- TradingAgents 主页：https://tradingagents-ai.github.io/
- ai-hedge-fund 源码：https://github.com/virattt/ai-hedge-fund
