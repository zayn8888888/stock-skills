# stock-skills

> 为 [Claude Code](https://claude.com/claude-code) 设计的**股票分析 Skill 套件**。基于富途 OpenAPI 实时行情 + Tavily 新闻搜索，覆盖从"市场扫板"到"个股深挖"的完整链路。

## 包含的 Skill

| Skill | 解决什么问题 | 触发举例 |
|-------|------------|---------|
| [`stock-analyzer/`](stock-analyzer/) | 单只股票八维度综合分析（行情 / 技术 / 估值 / 资金 / 盘口 / 同行 / 新闻 / 期权链） | "分析 NVDA" / "腾讯能不能抄底" / "机构在赌什么方向" |
| [`market-scanner/`](market-scanner/) | HK / US 市场热点板块扫描 + 板块内"尚未过度拉升"候选股挖掘 | "市场最近啥热点" / "帮我找下一个热点" / "XX 板块里有没有还没涨透的票" |

两者设计为**链式协作**：scanner 扫出候选清单 → analyzer 逐个做深度分析。

## 安装

### 方式 1：整个套件一起装

```bash
git clone https://github.com/zayn8888888/stock-skills.git ~/tmp-stock-skills
cp -r ~/tmp-stock-skills/stock-analyzer ~/.claude/skills/stock-analyzer
cp -r ~/tmp-stock-skills/market-scanner ~/.claude/skills/market-scanner
rm -rf ~/tmp-stock-skills
```

### 方式 2：只装其中一个

```bash
# 只要个股分析
git clone --depth 1 --filter=blob:none --sparse \
  https://github.com/zayn8888888/stock-skills.git ~/tmp
cd ~/tmp && git sparse-checkout set stock-analyzer
cp -r stock-analyzer ~/.claude/skills/stock-analyzer
```

或直接在 GitHub 上复制需要的子目录。

## 共同依赖

两个 skill 都依赖：

### 富途 OpenAPI（必需）

- **富途 OpenD** 运行中，默认 `127.0.0.1:11111`
  - 下载：<https://www.futunn.com/OpenAPI>
- 能调用富途 OpenAPI 的 Python 脚本集或 Claude skill（社区已有多个 `futuapi` 实现）

SKILL.md 中引用的脚本名（`get_snapshot.py` / `get_kline.py` / `get_capital_flow.py` / `get_option_chain.py` 等）对应富途官方 Python SDK [`futu-api`](https://pypi.org/project/futu-api/) 的基础能力。

### Tavily 新闻搜索（推荐）

新闻相关维度依赖 [Tavily MCP Server](https://docs.tavily.com/)。没有也能跑，新闻维度会降级或跳过。

## 使用

安装后直接对 Claude 说自然语言即可：

```
# 触发 market-scanner
港股最近哪个板块在涨
帮我找找美股还没涨透的热点

# 触发 stock-analyzer
分析一下 US.NVDA
五粮液能不能抄底
TSLA 机构在赌什么方向
```

## 文档

- [`stock-analyzer/SKILL.md`](stock-analyzer/SKILL.md) — 个股八维度分析流程
- [`stock-analyzer/references/`](stock-analyzer/references/) — 方法论 / 指标陷阱 / 报告模板
- [`market-scanner/SKILL.md`](market-scanner/SKILL.md) — 板块扫描 + 候选股筛选流程
- [`market-scanner/references/`](market-scanner/references/) — 扫描报告模板

## ⚠️ 免责声明

**本项目只是一个 LLM prompt 集合，不是投资建议、不是投资顾问、不是金融产品。**

- 所有分析由大语言模型生成，**可能包含错误、幻觉或过时数据**
- 任何基于本项目输出的投资决策由使用者自行承担全部风险
- 作者不对任何直接或间接损失负责
- **禁止**用于商业投顾、付费荐股、金融机构对外服务
- 使用富途 OpenAPI 需遵守富途 [OpenAPI 服务协议](https://www.futunn.com/OpenAPI)，本项目与富途无任何合作或背书关系
- 市场有风险，决策需谨慎

完整免责见 [DISCLAIMER.md](DISCLAIMER.md)。

## License

[MIT](LICENSE) © zaynhuang

## 贡献

欢迎 issue 和 PR，尤其是：

- 维度判断逻辑的完善
- 新市场适配（A 股、台股、加密等）
- 输出模板改进
- 非富途数据源适配

提交前请确认没有引入任何个人账户 ID、API key 或专有数据。
