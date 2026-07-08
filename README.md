# stock-skills

> 为 [Claude Code](https://claude.com/claude-code) 设计的**股票 / 加密 / 富途生态分析 Skill 套件**。基于富途 OpenAPI 实时行情、Tavily 新闻搜索、Hyperliquid 链上数据、Finnhub / Polymarket 事件数据，覆盖从"市场扫板"到"个股深挖"、从"分析"到"决策留痕"的完整链路。

## 包含的 Skill（24 个）

### 股票研究

| Skill | 解决什么问题 | 触发举例 |
|-------|------------|---------|
| [`market-scanner`](stock/market-scanner/) | 大 A / HK / US 市场热点板块扫描 + 板块内候选股挖掘 | "市场最近啥热点" / "帮我找下一个热点" |
| [`stock-analyzer`](stock/stock-analyzer/) | 单只股票九维度综合分析（行情 / 技术 / 估值 / 资金 / 盘口 / 同行 / 新闻 / 期权链 / 事件） | "分析 NVDA" / "腾讯能不能抄底" |
| [`stock-fundamentals`](stock/stock-fundamentals/) | 自下而上基本面（商业模式 → 护城河 → 财务 → 估值视角） | "XXX 适不适合长期持有" |
| [`stock-valuation`](stock/stock-valuation/) | DCF + 历史 P/E + PEG 定量估值与安全边际区间 | "帮我估一下 XXX 合理价" |
| [`ta-levels`](stock/ta-levels/) | 基于 OHLCV 确定性计算支撑 / 压力位 | "给我算支撑位和压力位" |

### 核心编排与留痕

| Skill | 解决什么问题 | 触发举例 |
|-------|------------|---------|
| [`event-calendar`](core/event-calendar/) | 前瞻事件日历（Finnhub / Polymarket / Tavily） | "未来一周有什么大事" |
| [`tradfi-macro`](core/tradfi-macro/) | 传统金融宏观背景（VIX / 美元 / 利率 / 中国宏观） | "现在宏观环境怎样" |
| [`hyperliquid-perps`](core/hyperliquid-perps/) | Hyperliquid 链上永续镜像，读隐含价 / funding / OI / premium | "NVDA 周末链上多少" |
| [`trading-debate`](core/trading-debate/) | 多 agent 辩论决策 + 大师视角 + 组合层 + 复盘锚点 | "NVDA 给我一次多空辩论" |
| [`ticker-journal`](core/ticker-journal/) | 分析后写入标的档案、加载历史 context、启动本地 dashboard | "加载 FUTU 档案" / "打开仪表盘" |
| [`ticker-journal-migrate`](core/ticker-journal-migrate/) | 从历史 session 补录未写入 journal 的分析记录 | "把最近的分析写进 journal" |

### 加密研究

| Skill | 解决什么问题 | 触发举例 |
|-------|------------|---------|
| [`crypto-scanner`](crypto/crypto-scanner/) | 加密市场热点赛道扫描 + 候选筛选 | "加密最近什么赛道在涨" |
| [`crypto-analyzer`](crypto/crypto-analyzer/) | 单只加密资产七维度分析 | "分析 SOL" / "HYPE funding 怎样" |
| [`crypto-macro`](crypto/crypto-macro/) | 加密市场宏观背景、BTC dominance、山寨季、杠杆情绪 | "山寨季开了吗" |

### 富途生态与数据工具

| Skill | 解决什么问题 | 触发举例 |
|-------|------------|---------|
| [`futuapi`](futu/futuapi/) | 富途 OpenAPI 行情 / 账户 / 交易 / 订阅脚本速查与执行 | "查 US.AAPL 快照" / "查我的持仓" |
| [`install-futu-opend`](futu/install-futu-opend/) | 安装 / 升级 Futu OpenD 与 Python SDK | "安装 OpenD" |
| [`test-env`](futu/test-env/) | 检查 `CLAUDE_SKILLS_DIR` 环境变量注入 | "测试 skill 环境" |
| [`futu-news-search`](futu/futu-news-search/) | 富途新闻搜索与近期公告快扫 | "查一下 FUTU 近期新闻" |
| [`futu-stock-digest`](futu/futu-stock-digest/) | 近 7 天股票新闻摘要与红旗信号 | "FUTU 最近新闻摘要" |
| [`futu-technical-anomaly`](futu/futu-technical-anomaly/) | 技术异动检测 | "这只股技术面有什么异动" |
| [`futu-capital-anomaly`](futu/futu-capital-anomaly/) | 资金流 / 买卖经纪商 / 卖空异动检测 | "资金有没有异常" |
| [`futu-derivatives-anomaly`](futu/futu-derivatives-anomaly/) | 期权 / 衍生品异动检测 | "期权链有什么异常" |
| [`futu-comment-sentiment`](futu/futu-comment-sentiment/) | 富途牛牛评论情绪分析 | "牛牛圈情绪怎样" |
| [`futu-community-sentiment`](futu/futu-community-sentiment/) | 富途社区情绪聚合 | "社区情绪有没有转向" |

**链式协作建议**：
- scanner 扫出候选 → **analyzer** 多维扫一遍
- 长期价值视角加 **fundamentals**；要算清楚数字再加 **valuation**
- 想从"分析"转到"决策"（该不该买 / 仓位多少 / 风险点）→ **trading-debate**（自动调用 analyzer + event-calendar，无需手动先跑）
- **event-calendar** 横向辅助，被 scanner 的「催化」「产业链外推」与 analyzer 的「事件日历」维度自动调用
- **hyperliquid-perps** 横向辅助：被 analyzer 的「资金」维度引用 funding rate + 拥挤度，被 trading-debate 的 Risk 风险辩论引用作为"拥挤交易硬约束"，被 event-calendar 用于"事件后链上即时反应"
- **crypto-scanner** 扫出加密候选 → **crypto-analyzer** 七维度深挖 → 可选接 **trading-debate**



## 安装（Plugin 方式 · 推荐）

仓库内置 Claude Code Plugin 配置，整套 24 个 skill 作为单个 plugin 一起 enable / disable，最少手工管理。

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
/plugin disable stock-skills          # 全套 24 skill 一起下线
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

可指定任意一个或多个 skill 名，skill 名就是上方表格中的目录名；安装脚本会从 `stock/`、`core/`、`crypto/`、`futu/` 四个分组中自动发现所有 `SKILL.md`。

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

- [`stock/stock-analyzer/SKILL.md`](stock/stock-analyzer/SKILL.md) — 个股九维度分析流程
- [`stock/stock-analyzer/references/`](stock/stock-analyzer/references/) — 方法论 / 指标陷阱 / 报告模板
- [`stock/stock-fundamentals/SKILL.md`](stock/stock-fundamentals/SKILL.md) — 商业模式 / 护城河 / 财务验证 / 估值四步框架
- [`stock/stock-valuation/SKILL.md`](stock/stock-valuation/SKILL.md) — DCF / P/E / PEG 估值与安全边际模板
- [`stock/market-scanner/SKILL.md`](stock/market-scanner/SKILL.md) — 板块扫描 + 候选股筛选流程
- [`stock/ta-levels/SKILL.md`](stock/ta-levels/SKILL.md) — 确定性支撑 / 压力位计算器
- [`core/event-calendar/SKILL.md`](core/event-calendar/SKILL.md) — 前瞻事件日历
- [`core/tradfi-macro/SKILL.md`](core/tradfi-macro/SKILL.md) — 传统金融宏观背景
- [`core/hyperliquid-perps/SKILL.md`](core/hyperliquid-perps/SKILL.md) — Hyperliquid 链上永续镜像
- [`core/trading-debate/SKILL.md`](core/trading-debate/SKILL.md) — 多 agent 辩论决策七阶段
- [`core/trading-debate/references/framework-reference.md`](core/trading-debate/references/framework-reference.md) — TradingAgents + ai-hedge-fund 架构对照
- [`core/trading-debate/references/role-prompts.md`](core/trading-debate/references/role-prompts.md) — 角色 prompt 模板
- [`core/trading-debate/references/master-styles.md`](core/trading-debate/references/master-styles.md) — 大师风格 agent
- [`core/trading-debate/references/reflection.md`](core/trading-debate/references/reflection.md) — 跨会话反思机制
- [`core/trading-debate/references/portfolio-layer.md`](core/trading-debate/references/portfolio-layer.md) — 多标的组合层 PM
- [`core/trading-debate/references/cross-ticker-lessons.md`](core/trading-debate/references/cross-ticker-lessons.md) — 跨标的教训聚合
- [`core/trading-debate/references/multi-market.md`](core/trading-debate/references/multi-market.md) — 跨市场基准选择
- [`core/ticker-journal/SKILL.md`](core/ticker-journal/SKILL.md) — 标的档案读写与本地 dashboard
- [`crypto/crypto-scanner/SKILL.md`](crypto/crypto-scanner/SKILL.md) — 加密赛道扫描
- [`crypto/crypto-analyzer/SKILL.md`](crypto/crypto-analyzer/SKILL.md) — 加密资产七维度分析
- [`crypto/crypto-macro/SKILL.md`](crypto/crypto-macro/SKILL.md) — 加密市场宏观背景
- [`futu/futuapi/SKILL.md`](futu/futuapi/SKILL.md) — 富途 OpenAPI 脚本速查
- [`futu/futuapi/docs/`](futu/futuapi/docs/) — 字段映射 / API 限制 / 故障排查

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
