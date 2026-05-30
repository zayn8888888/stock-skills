# 输出前自检清单

写报告前逐项过一遍。**不满足就不要出报告**。

## Step 0 代码格式

- [ ] 用户输入的 ticker 是否已补全市场前缀（`FUTU` → `US.FUTU`）？
- [ ] Step 0 的单次快照是否**单独运行**（不在并行批次里）？确认成功后才启动并行？

## 覆盖完整性

- [ ] 九个维度都有章节？缺失的是否明确写了原因？
- [ ] 维度 2：是否**先执行异动强制扫描**（单日 >15% 且量比 >5x）？发现异动后是否暂停、查完原因再继续？后续维度是否标注了断层日？
- [ ] 维度 8 对美股/港股是否真的扫了期权？Top 5 Call/Put OI + P/C 比 + Max Pain 是否都给出？A 股是否显式标注"本市场无期权，跳过"？
- [ ] 维度 9 是否调用了 event-calendar skill？未安装时是否降级并标注？
- [ ] 维度 2/4/8 的 anomaly 三件套（technical / capital / derivatives）是否调用？OpenD 离线时这三个会失败，可标注"OpenD 未连接，跳过"，但**不能与维度 7 的 HTTP skill 混为一谈**
- [ ] 维度 8：`futu-derivatives-anomaly` 返回 **-12301** 时，是否走了 Step 1-3 完整扫描（而不是直接降级 Tavily）？-12301 是 AI行情接口权限问题，`get_option_chain` 用的是独立的基础期权权限
- [ ] "综合研判"是否同时列了利多 / 利空 / 风险 / 关键信号四块？
- [ ] 数据时点是否同时标了 HKT 和 ET？盘前/盘中/盘后是否按 ET 判断？
- [ ] **每段精细数据是否标了来源**（脚本名或 Tavily 关键词）？缺来源的数字是否已删除？
- [ ] **是否有被 cancel/报错的工具调用**？是否重跑或显式标 ❌？

## 维度 7 公告与事件专项

- [ ] **7a**：6 个 OpenAPI 事件脚本是否并行调用（buybacks / dividends / stock_splits / research_rating / insider_trade / shareholders_holding_changes）？A 股不支持的接口是否标 ❌？
- [ ] **7b**：`futu-stock-digest` skill 是否调用？拿到 bullish/bearish/neutral 方向判断了吗？
- [ ] **7c**：`futu-news-search` skill 是否**真的调用过**？（HTTP API，与 OpenD 完全无关——OpenD 离线也能跑）
- [ ] 关键词是否用了**中文公司名**？英文 ticker 在中文媒体源命中率极低
- [ ] 关键词是否是**高歧义词**（富途/苹果/小米/京东/茅台/Meta 等）？是的话用了锚定后缀没有？
- [ ] 结果**相关性是否自检过**？相关 < 70%（歧义词 < 85%）必须换词重搜
- [ ] 出现**零返回**时，是否按 fallback 链跑完？是否用热门票测过 API 没坏？是否把"零讨论"作为信号本身写进报告？详见 [news-search.md](news-search.md)
- [ ] **7e**：`futu-comment-sentiment` 是否做了对照测试？两者结果高度重合 = 命中 keyword bug，必须切 Tavily 雪球检索
- [ ] 新闻用的是**事件标的检验**（被讨论的是目标公司？），而非"标题主语"机械判断？投行评级/做空报告的 "X：Y" 格式保留了吗？
- [ ] 维度 7 末尾是否显式列了"未发现"项（做空报告/SEC调查/诉讼/监管处罚）？

## 价格异动追溯

- [ ] 维度 1/2 出现单日 ≥5% 或累计 ≥10% 异动时，是否做了**「日期+异动方向」反向追溯搜**？
- [ ] 反向追溯是否打了**至少 3 条并行 query**？
- [ ] 反向追溯是否**直接在主对话用 Tavily**，没有外包给 Agent subagent？

> 详细追溯方法和关键词模板见 [news-search.md](news-search.md)
