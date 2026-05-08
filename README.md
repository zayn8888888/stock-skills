# stock-analyzer-skill

> 为 [Claude Code](https://claude.com/claude-code) 设计的**个股多维分析** Skill。基于富途 OpenAPI 实时行情 + Tavily 新闻搜索，对单只股票做行情、技术、估值、资金、盘口、同行、新闻、期权链共八个维度的结构化分析。

## 特性

- **八维度覆盖**：行情 / 技术 / 估值 / 资金 / 盘口 / 同行 / 新闻 / 期权链
- **多空并陈**：同时列出利多 / 利空 / 风险提示 / 关键观察信号，不做单边推荐
- **拒绝迎合**：即使用户倾向某方向（"是不是利空出尽了"），也客观列出反驳论据
- **不出买卖指令**：只提供分析框架和数据，最终决策权交给用户
- **数据时效标注**：行情标清时点，新闻标清日期，避免旧信息误导
- **期权链深扫**：覆盖深度 OTM 的 OI 堆积点，识别单一 strike 事件级仓位

适用场景：`"分析 XXX"` / `"XXX 怎么样"` / `"XXX 能不能抄底"` / `"机构在赌什么方向"`

不适用：纯指数/板块分析、宏观研究、纯财报深度解读。

## 安装

### 1. 作为 Claude Code Skill 安装

把本仓库克隆到 Claude skills 目录：

```bash
git clone https://github.com/zaynhuang/stock-analyzer-skill.git ~/.claude/skills/stock-analyzer
```

或作为项目级 skill：

```bash
git clone https://github.com/zaynhuang/stock-analyzer-skill.git .claude/skills/stock-analyzer
```

### 2. 准备依赖

本 skill **只提供分析框架和 prompt**，不附带任何数据获取脚本。你需要自备：

#### 富途行情数据源（必需）

本 skill 通过 shell 命令调用富途 OpenAPI 脚本取数据。你需要：

- **富途 OpenD** 运行中，默认 `127.0.0.1:11111`
  - 下载：<https://www.futunn.com/OpenAPI>
- 一个能调用富途 OpenAPI 的 Python 脚本集或 Claude skill，例如任意开源的 `futuapi` skill（社区已有多个实现）

SKILL.md 中引用的脚本名（`get_snapshot.py` / `get_kline.py` / `get_stock_info.py` / `get_capital_flow.py` / `get_orderbook.py` / `get_ticker.py` / `get_option_chain.py` 等）对应富途官方 Python SDK [`futu-api`](https://pypi.org/project/futu-api/) 的基础能力。如果你用的是其他命名/实现，请在使用前告诉 Claude 具体路径，或修改 SKILL.md 中的命令。

#### Tavily 新闻搜索（推荐）

维度 7（新闻与事件）依赖 [Tavily MCP Server](https://docs.tavily.com/)：

- 注册 Tavily 免费账号获取 API Key
- 在 Claude Code 中接入 Tavily MCP，skill 会自动调用 `tavily_search`

如果没有 Tavily，维度 7 可以改用 WebSearch 或让 Claude 跳过，其他七个维度不受影响。

## 使用

安装后，直接对 Claude 说：

```
分析一下 US.NVDA
帮我看看腾讯（HK.00700）
五粮液能不能抄底
TSLA 机构在赌什么方向
```

Claude 会自动识别并触发本 skill，按八维度流程拉数据、做分析、输出报告。

## 输出样例（结构）

```markdown
## 📊 名称(CODE) 多维分析 · YYYY-MM-DD HH:MM

### 1. 行情速览
### 2. 技术面
### 3. 估值水平
### 4. 资金面
### 5. 盘口情绪
### 6. 同行对比
### 7. 新闻与事件
### 8. 期权链（可选）

### 💡 综合研判
- 利多：...
- 利空：...
- 风险提示：...
- 关键信号：...
```

完整模板见 [references/report-template.md](references/report-template.md)。

## 文档

- [SKILL.md](SKILL.md) — 完整的触发规则、八维度流程、输出约束
- [references/methodology.md](references/methodology.md) — 每个维度的判断方法论
- [references/metrics-interpretation.md](references/metrics-interpretation.md) — 各项指标的解读陷阱速查
- [references/report-template.md](references/report-template.md) — 完整输出模板和场景化调整

## ⚠️ 免责声明

**本项目只是一个 LLM prompt 集合，不是投资建议、不是投资顾问、不是金融产品。**

- 所有分析由大语言模型生成，**可能包含错误、幻觉或过时数据**
- 任何基于本 skill 输出的投资决策由使用者自行承担全部风险
- 本项目作者不对任何直接或间接损失负责
- **禁止**将本项目用于商业投顾、付费荐股、金融机构对外服务
- 使用富途 OpenAPI 需遵守富途 [OpenAPI 服务协议](https://www.futunn.com/OpenAPI)，本项目与富途无任何合作或背书关系
- 市场有风险，决策需谨慎

完整免责见 [DISCLAIMER.md](DISCLAIMER.md)。

## License

[MIT](LICENSE) © zaynhuang

## 贡献

欢迎 issue 和 PR，尤其是：

- 维度判断逻辑的完善
- 新市场/新品种适配（台股、加密货币衍生品等）
- 输出模板的改进
- 不同数据源适配（非富途）

提交 PR 前请确认没有引入任何个人账户 ID、API key 或专有数据。
