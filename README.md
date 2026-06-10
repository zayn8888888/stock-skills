# stock-skills

> 为 [Claude Code](https://claude.com/claude-code) 设计的**股票分析 Skill 套件**。基于富途 OpenAPI 实时行情 + Tavily 新闻搜索，覆盖从"市场扫板"到"个股深挖"的完整链路。

## 包含的 Skill

| Skill | 解决什么问题 | 触发举例 |
|-------|------------|---------|
| [`market-scanner/`](market-scanner/) | 大A / HK / US 市场热点板块扫描 + 板块内"尚未过度拉升"候选股挖掘 | "市场最近啥热点" / "帮我找下一个热点" / "XX 板块里有没有还没涨透的票" |
| [`stock-analyzer/`](stock-analyzer/) | 单只股票九维度综合分析（行情 / 技术 / 估值 / 资金 / 盘口 / 同行 / 新闻 / 期权链 / 事件） | "分析 NVDA" / "腾讯能不能抄底" / "机构在赌什么方向" |
| [`stock-fundamentals/`](stock-fundamentals/) | 自下而上基本面（商业模式 → 护城河 → 财务 → 估值视角） | "XXX 适不适合长期持有" / "护城河在哪" / "盈利质量怎么样" |
| [`stock-valuation/`](stock-valuation/) | DCF + 历史 P/E + PEG 定量估值与安全边际区间 | "帮我估一下 XXX 合理价" / "三种方法算算估值区间" |
| [`event-calendar/`](event-calendar/) | 未来 14 天前瞻事件日历（Finnhub 美国经济+美股财报 / Polymarket 押注 / Tavily 中港政策） | "未来一周有什么大事" / "FOMC 降息概率" / "NVDA 什么时候出财报" |
| [`hyperliquid-perps/`](hyperliquid-perps/) | Hyperliquid 链上永续镜像（HIP-3 七大子 dex：美股/SPX/VIX/商品/FX/Pre-IPO 全覆盖），24/7 隐含价 + funding rate + OI + premium | "NVDA 周末链上多少" / "TSLA funding 拥不拥挤" / "SPX 现在永续在哪" / "OPENAI 链上估值" |
| [`trading-debate/`](trading-debate/) | 多 agent 辩论决策（TradingAgents 七阶段 + ai-hedge-fund 7 大师 + Reflection + 组合层 + 跨标的教训 + 跨市场基准） | "NVDA 给我一次多空辩论" / "用 Buffett+Burry 视角看 700" / "复盘我对 X 的决策" / "NVDA/AAPL/TSLA 哪个该加仓" / "我对半导体股有什么模式问题" |
| [`crypto-scanner/`](crypto-scanner/) | 加密市场热点赛道扫描（CoinGecko + 热搜 trending + Tavily 叙事 + Hyperliquid 拥挤度），4 阶段筛出候选 | "加密最近什么赛道在涨" / "山寨季开了吗" / "BTC 主导率高吗" / "DeFi/RWA/AI 哪个方向强" |
| [`crypto-analyzer/`](crypto-analyzer/) | 单只加密资产七维度分析（行情 / 技术 / 链上 / 叙事 / 同类 / 新闻 / 事件日历） | "分析 SOL" / "HYPE 链上 funding 怎样" / "ETH 值不值得买" |
| [`ta-levels/`](stock/ta-levels/) | 确定性技术分析：基于 OHLCV 数据计算 7 种支撑/压力位（枢轴点三种 / 摆动高低点 / 斐波那契回调 / 均线 / 成交量剖面），相同输入保证相同输出 | "给我算支撑位和压力位" / "pivot point 在哪" / "斐波那契位" / "均线支撑" / "Volume Profile" |

**链式协作建议**：
- scanner 扫出候选 → **analyzer** 多维扫一遍
- 长期价值视角加 **fundamentals**；要算清楚数字再加 **valuation**
- 想从"分析"转到"决策"（该不该买 / 仓位多少 / 风险点）→ **trading-debate**（自动调用 analyzer + event-calendar，无需手动先跑）
- **event-calendar** 横向辅助，被 scanner 的「催化」「产业链外推」与 analyzer 的「事件日历」维度自动调用
- **hyperliquid-perps** 横向辅助：被 analyzer 的「资金」维度引用 funding rate + 拥挤度，被 trading-debate 的 Risk 风险辩论引用作为"拥挤交易硬约束"，被 event-calendar 用于"事件后链上即时反应"
- **crypto-scanner** 扫出加密候选 → **crypto-analyzer** 七维度深挖 → 可选接 **trading-debate**



## 安装（Plugin 方式 · 推荐）

仓库内置 Claude Code Plugin 配置，整套 17 个 skill 作为单个 plugin 一起 enable / disable，最少手工管理。

```bash
# 1. 克隆仓库（私有 repo 需要你的 git 凭据，git clone 能成功就够了）
git clone git@github.com:zayn8888888/stock-skills.git ~/stock-skills

# 2. 在 Claude Code 内执行（注意 marketplace 路径用你 clone 的位置）
/plugin marketplace add ~/stock-skills
/plugin install stock-skills@stock-skills
```

> 安装后 plugin 内置的 `SessionStart` hook 会自动注入 `CLAUDE_SKILLS_DIR`，futuapi 相关 skill 开箱即用，无需手动配置。

之后管理：

```bash
/plugin disable stock-skills          # 全套 17 skill 一起下线
/plugin enable stock-skills           # 全套恢复
/plugin uninstall stock-skills        # 卸载
cd ~/stock-skills && git pull                  # 1. 拉最新代码
claude plugin uninstall stock-skills@stock-skills  # 2. 清除旧 cache
claude plugin install stock-skills@stock-skills   # 3. 重新安装
```

> 私有 repo 不能让陌生人通过 `/plugin marketplace add owner/repo` 直接拉，必须先 `git clone`，再 `/plugin marketplace add <本地路径>`。

## 安装（手动 · 不用 plugin）

```bash
git clone https://github.com/zayn8888888/stock-skills.git ~/stock-skills
cd ~/stock-skills
```

然后任选一种安装方式（仓库内自带 `scripts/install.sh`）：

### 方式 1：软链模式（推荐，更新最省事）

```bash
./scripts/install.sh --link
```

把仓库里的 skill 目录软链到 `~/.claude/skills/`。以后只要 `cd ~/stock-skills && git pull`，所有 skill 自动跟着更新，无需重装。

> ⚠️ 软链下「修改 ~/.claude/skills/xxx」= 修改仓库内容；如果你计划本地魔改 skill，建议改用拷贝模式。

### 方式 2：拷贝模式（默认，安全隔离）

```bash
./scripts/install.sh
```

仓库与 `~/.claude/skills/` 互不影响，本地随便改。更新时跑 `./scripts/update.sh`（自动 `git pull` + `rsync --delete` 同步）。

### 只装其中几个

两种模式都支持指定 skill：

```bash
./scripts/install.sh --link stock-analyzer market-scanner
./scripts/install.sh stock-valuation
```

可选 skill：`market-scanner` / `stock-analyzer` / `stock-fundamentals` / `stock-valuation` / `event-calendar` / `hyperliquid-perps` / `trading-debate` / `crypto-scanner` / `crypto-analyzer`。

### 自定义安装目录

设置 `CLAUDE_SKILLS_DIR` 环境变量即可（默认 `~/.claude/skills`）：

```bash
CLAUDE_SKILLS_DIR=/path/to/skills ./scripts/install.sh --link
```

## 更新

### Plugin 方式（推荐）

在 Claude Code 中直接执行：

```
/plugins update
```

会自动从 GitHub 拉取最新代码并更新所有 skill，无需手动操作。

### 脚本方式（仅适用于脚本安装的用户）

```bash
cd ~/stock-skills
./scripts/update.sh
```

脚本会自动 `git pull`，再按你当初安装的模式同步：

- 软链装的：`git pull` 已生效，脚本只做提示
- 拷贝装的：`rsync --delete` 把仓库目录覆盖到 `~/.claude/skills/<skill>/`
- 未安装的 skill：跳过（不会主动新增，需要装请用 `install.sh`）

加 `--no-pull` 可跳过 `git pull` 只做本地同步。

## 共同依赖

套件内 skill 普遍依赖：

### 富途 OpenAPI（必需）

- **富途 OpenD** 运行中，默认 `127.0.0.1:11111`
  - 下载：<https://www.futunn.com/OpenAPI>
- 能调用富途 OpenAPI 的 Python 脚本集或 Claude skill（社区已有多个 `futuapi` 实现）

SKILL.md 中引用的脚本名（`get_snapshot.py` / `get_kline.py` / `get_capital_flow.py` / `get_option_chain.py` 等）对应富途官方 Python SDK [`futu-api`](https://pypi.org/project/futu-api/) 的基础能力。

### Tavily 搜索（推荐）

- **stock-analyzer**：新闻维度依赖 [Tavily MCP Server](https://docs.tavily.com/)
- **stock-valuation** 财务估算（EPS、FCF、历史 PE 等）也需 Web 检索；无可用时需在报告中写明数据缺口。

没有 Tavily 时，analyzer 的新闻维度会降级或跳过；valuation 则可能无法完成部分方法。

### stock-fundamentals 额外依赖

- 近 7 天新闻快扫依赖社区 **`futu-stock-digest`** skill（SKILL 内约定；无需 OpenD）。

### event-calendar 额外依赖（可选但推荐）

- **Finnhub API key**：用于美国经济日历与美股财报日历。免费版 60 calls/min，足够一次扫描使用。
  - 申请：<https://finnhub.io/register>
  - 配置：`export FINNHUB_API_KEY=xxxxxx`
    - **首选写入 `~/.zshenv`**（zsh non-interactive shell 也读，对 Claude Code Bash 工具最稳）
    - 次选 `~/.zshrc` / `~/.bashrc`（仅交互 shell 生效，skill 已做 grep 兜底，但稳定性略低）
    - ⚠️ 写完后**新开一个 Claude Code 会话**，旧会话的 env 不会自动刷新
  - 未配置时本 skill 仅启用 Polymarket + Tavily 两源，**不阻塞使用**，但报告会标注"⚠️ Finnhub 未配置"
- **Polymarket Gamma API**：无需 key，public read-only
- **Tavily**：与 stock-analyzer 共用

### crypto-scanner / crypto-analyzer 额外依赖

- **CoinGecko Demo API key**（推荐，免费注册）：用于行情 / K线 / 赛道 / 热搜数据。
  - 申请：<https://www.coingecko.com/en/api/pricing>（Demo 免费，100 calls/min）
  - 配置：`export COINGECKO_DEMO_KEY=CG-xxxxxx`，**首选写入 `~/.zshenv`**
  - 未配置时自动降级到公共端点（~3 calls/min，功能受限但可用）
- **DNS 注意**：部分网络环境本地 DNS 会将 `api.coingecko.com` 解析到错误 IP（Meta CDN）。skill 内所有 curl 命令已内置 `--resolve "api.coingecko.com:443:104.20.41.132"` 绕过，无需手动修改 hosts。

### hyperliquid-perps 额外依赖

- **零依赖**：Hyperliquid `POST /info` 公开端点，无需注册、无需 API key
- 仅需 `curl` + `jq`（macOS 自带或 `brew install jq`）
- 网络可达 `api.hyperliquid.xyz`
- 单 IP 限流约 1200 次/分钟，本 skill 单次调用 ~10 次，远低于阈值

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

# 触发 stock-fundamentals（长期价值视角）
茅台护城河在哪

# 触发 stock-valuation（定量估值）
帮我用 DCF / P/E / PEG 估一下 US.AAPL 合理区间

# 触发 event-calendar（前瞻事件日历）
未来 14 天有什么大事
FOMC 降息概率多少
NVDA 什么时候出财报

# 触发 trading-debate（多 agent 辩论决策）
NVDA 给我一次多空辩论决策            # 七阶段：自动调 analyzer + event-calendar → Bull/Bear → RM → Trader → Risk 三方 → PM
用 Buffett + Burry 视角看 700        # v0.2 大师团模式（启用指定大师）
复盘我对 NVDA 的决策                 # v0.3 跨会话反思
NVDA / AAPL / TSLA 哪个该加仓        # v0.4 组合层：相关性矩阵 + 行业封顶 + 换手控制
NVDA + 700 + 茅台 该怎么排            # v0.5 跨市场：市值加权基准 + 时段对齐 + 汇率敞口
我对半导体股的判断有什么模式问题       # v0.5 跨标的教训聚合：4 维度切片找模式
```

## 文档

- [`stock-analyzer/SKILL.md`](stock-analyzer/SKILL.md) — 个股八维度分析流程
- [`stock-analyzer/references/`](stock-analyzer/references/) — 方法论 / 指标陷阱 / 报告模板
- [`stock-fundamentals/SKILL.md`](stock-fundamentals/SKILL.md) — 商业模式 / 护城河 / 财务验证 / 估值四步框架（基本面研究流程）
- [`market-scanner/SKILL.md`](market-scanner/SKILL.md) — 板块扫描 + 候选股筛选流程
- [`market-scanner/references/`](market-scanner/references/) — 扫描报告模板
- [`stock-valuation/SKILL.md`](stock-valuation/SKILL.md) — DCF / P/E / PEG 估值与安全边际模板
- [`event-calendar/SKILL.md`](event-calendar/SKILL.md) — 前瞻事件日历（Finnhub + Polymarket + Tavily 三源整合）
- [`event-calendar/references/`](event-calendar/references/) — 三源端点详解 / 中港政策 Tavily 关键词模板 / 输出格式
- [`trading-debate/SKILL.md`](trading-debate/SKILL.md) — 多 agent 辩论决策七阶段（v0.4：单标的 + 大师 + Reflection + 组合层）
- [`trading-debate/references/framework-reference.md`](trading-debate/references/framework-reference.md) — TradingAgents + ai-hedge-fund 架构对照
- [`trading-debate/references/role-prompts.md`](trading-debate/references/role-prompts.md) — 8 个角色完整 prompt 模板
- [`trading-debate/references/master-styles.md`](trading-debate/references/master-styles.md) — 7 个大师风格 agent（Buffett/Munger/Lynch/Burry/Druckenmiller/Damodaran/Ackman）
- [`trading-debate/references/reflection.md`](trading-debate/references/reflection.md) — v0.3 跨会话反思机制（基于 Claude Code memory）
- [`trading-debate/references/portfolio-layer.md`](trading-debate/references/portfolio-layer.md) — v0.4 多标的组合层 PM
- [`trading-debate/references/cross-ticker-lessons.md`](trading-debate/references/cross-ticker-lessons.md) — v0.5 跨标的教训聚合（4 维度切片找模式级错误）
- [`trading-debate/references/multi-market.md`](trading-debate/references/multi-market.md) — v0.5 跨市场基准选择（市值加权 + 时段对齐 + 汇率敞口 + 双 alpha 口径）

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
- 新市场适配（台股等）
- 输出模板改进
- 非富途数据源适配

提交前请确认没有引入任何个人账户 ID、API key 或专有数据。
