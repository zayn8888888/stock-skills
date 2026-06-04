---
name: futu-community-sentiment
description: >-
  使用富途牛牛已登录账号的认证 API，拉取指定股票的真实社区帖子并由 AI 进行情绪分析。
  与 futu-comment-sentiment 的区别：本 skill 使用需要 cookie 认证的 q.futunn.com 接口，
  返回的是按股票 stock_id 精确过滤的社区讨论，支持最新/推荐两个 tab，并支持分页拉取大量帖子。
  适用场景：用户询问某只股票的社区情绪、牛牛帖子、散户讨论、看多看空比例，
  或明确要求"用牛牛查评论"、"社区情绪"、"最新 tab"、"推荐 tab"。
metadata:
  version: 0.2.0
  author: zayn
  openclaw:
    requires:
      bins:
        - python3
license: MIT
---

# Futu Community Sentiment Skill（认证版）

基于富途牛牛登录 cookie，通过 `q.futunn.com` 认证接口拉取**股票专属**社区帖子，由 AI 进行语义情绪分析。

---

## 前提条件：Cookie 配置

脚本需要富途牛牛的登录 cookie，支持三种方式（优先级从高到低）：

**方式一：命令行参数（更新 cookie 时推荐）**
```bash
python3 <script> FUTU --uid YOUR_UID --web-sig 'YOUR_WEB_SIG' --ci-sig 'YOUR_CI_SIG' --save-cookies
```

**方式二：配置文件（日常使用）**
```
~/.futu_auth.json（权限 600）
{"uid": "...", "web_sig": "...", "ci_sig": "..."}
```

**方式三：环境变量**
```bash
export FUTU_UID=...  FUTU_WEB_SIG=...  FUTU_CI_SIG=...
```

**如何获取 cookie：** 登录 futunn.com → F12 → Network → 任意请求 → 请求头中复制 `uid`、`web_sig`、`ci_sig` 的值。

---

## 脚本路径

```
scripts/futu_community_sentiment.py
```

---

## 命令格式

```bash
python3 <script_path> <SYMBOL> [--num N] [--tab latest|hot] [--stock-id ID]
```

| 参数 | 说明 | 默认 |
|------|------|------|
| `SYMBOL` | 股票代码，如 `FUTU`、`TSLA`、`BABA` | 必填 |
| `--num N` | 拉取帖子数量，建议 30～100 | 20 |
| `--tab latest\|hot` | `latest`=最新 tab；`hot`=推荐 tab | `latest` |
| `--stock-id ID` | 直接指定内部 stock_id，跳过自动查询 | 自动 |

---

## 工作流程

### 1. 运行脚本拉取数据

```bash
SCRIPT="$HOME/Developer/stock-skills/futu/futu-community-sentiment/scripts/futu_community_sentiment.py"
python3 "$SCRIPT" FUTU --num 50 --tab latest
```

脚本输出纯 JSON，格式如下：

```json
{
  "symbol": "FUTU",
  "stock_name": "富途控股",
  "tab": "latest",
  "total": 48,
  "posts": [
    {"time": "2026-06-04 10:23", "text": "...", "likes": 0, "comments": 3},
    ...
  ]
}
```

### 2. AI 进行情绪分析

拿到 JSON 后，对 `posts` 逐条进行语义理解，分类为：

- **bullish（看多）**：预期上涨、抄底、加仓、对基本面有信心、认为利空出尽
- **bearish（看空）**：预期下跌、止损、割肉、唱衰、恐慌情绪
- **neutral（中性）**：提问、纯信息、无明确方向、观望

注意事项：
- 结合上下文语义判断，不要依赖单个词（"不看涨"≠ bullish）
- 港式粤语、繁体中文、英文混合帖子均需正确识别
- 反讽句子（"跌得真好"）要识别为 bearish
- 纯 `$股票名$` 无文本的帖子跳过不计

### 3. 汇总统计

统计 bullish / bearish / neutral 各自占比，给出整体判断：

- `abs(bull% - bear%) < 15` 且两者均 ≥ 25% → **Mixed**
- bull% 最高 → **Bullish**
- bear% 最高 → **Bearish**
- 否则 → **Neutral**

### 4. 输出格式

```
{stock_name} ({SYMBOL}) 社区情绪 · {最新/推荐} tab
数据窗口：{最早时间} ～ {最新时间}

看多 XX%  ·  看空 XX%  ·  中性 XX%
共 N 条有效帖子   整体：Bullish 📈 / Bearish 📉 / Mixed ⚖️ / Neutral 😐

代表观点（互动最多的 3 条）：
1. "..." · 时间
2. "..." · 时间
3. "..." · 时间

以上内容基于公开社区信息，不构成投资建议。
```

---

## Cookie 过期处理

脚本输出 `{"error": "Cookie 已过期..."}` 时，提示用户：

1. 登录 futunn.com，F12 → Network → 复制最新 `uid`、`web_sig`、`ci_sig`
2. 运行以下命令更新：
```bash
python3 "$SCRIPT" FUTU --uid NEW_UID --web-sig 'NEW_WEB_SIG' --ci-sig 'NEW_CI_SIG' --save-cookies
```
