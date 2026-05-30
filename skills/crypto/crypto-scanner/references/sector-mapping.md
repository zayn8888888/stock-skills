# CoinGecko 赛道 ID 映射

使用 `/coins/categories` 端点时需要 CoinGecko 赛道 ID。以下为常见赛道的 ID 对照。

> 如果列表中没有目标赛道，用 `/coins/categories?order=market_cap_change_24h_desc` 拉取实时列表后从响应中取 `id` 字段。

## 主要赛道 ID

| 赛道名称 | CoinGecko ID | 备注 |
|---|---|---|
| Layer 1 | `layer-1` | 公链基础设施 |
| Layer 2 | `layer-2` | ETH L2（Optimism/Arbitrum/Base 等）|
| DeFi | `decentralized-finance-defi` | 去中心化金融 |
| AI / Agent | `artificial-intelligence` | AI 叙事赛道 |
| RWA | `real-world-assets-rwa` | 现实世界资产代币化 |
| Meme | `meme-token` | Meme 币 |
| GameFi | `gaming` | 链游 / GameFi |
| DePIN | `depin` | 去中心化物理基础设施 |
| Stablecoins | `stablecoins` | 稳定币（通常不用于动量扫描）|
| Liquid Staking | `liquid-staking-tokens` | ETH/SOL 流动质押 |
| BRC-20 | `brc-20` | Bitcoin 生态 |
| Solana Ecosystem | `solana-ecosystem` | SOL 生态 |
| Base Ecosystem | `base-ecosystem` | Base L2 生态 |
| Ton Ecosystem | `ton-ecosystem` | TON 生态 |
| SocialFi | `social-money` | 社交 Fi |
| Restaking | `restaking` | EigenLayer 生态 |
| Modular Blockchain | `modular-blockchain` | 模块化公链 |

## 动态获取最新赛道列表

当上表覆盖不到目标赛道时，直接从 API 取实时数据：

```bash
curl "https://api.coingecko.com/api/v3/coins/categories?order=market_cap_change_24h_desc" \
  -H "x-cg-demo-api-key: $COINGECKO_DEMO_KEY" \
  | jq '[.[:20] | .[] | {id, name, market_cap_change_24h}]'
```

## 赛道叙事关键词（用于 Tavily 信号 B）

| 赛道 | 英文搜索词 | 中文搜索词 |
|---|---|---|
| AI Agent | AI agent crypto narrative | AI 代理 加密货币 叙事 |
| RWA | real world assets tokenization | RWA 代币化 现实资产 |
| DeFi | DeFi protocol TVL yield | DeFi 协议 锁仓量 收益 |
| DePIN | decentralized physical infrastructure | DePIN 去中心化基础设施 |
| GameFi | blockchain gaming play-to-earn | 链游 GameFi 边玩边赚 |
| Layer 2 | Ethereum scaling rollup | 以太坊扩容 Rollup L2 |
| Meme | meme coin community viral | Meme 币 社区 热点 |
