# 港股 IPO 数据源与查询模板

## 结构化接口

### Futu IPO 列表

```bash
python3 "${CLAUDE_SKILLS_DIR:-$HOME/.claude/skills}"/futuapi/scripts/quote/get_ipo_list.py HK --json
```

用途：港股市场级 IPO / 新股列表。字段随 OpenD 版本和数据权限变化，输出只引用实际返回字段。

### 已上市新股行情

```bash
python3 "${CLAUDE_SKILLS_DIR:-$HOME/.claude/skills}"/futuapi/scripts/quote/get_snapshot.py <CODE> --json
python3 "${CLAUDE_SKILLS_DIR:-$HOME/.claude/skills}"/futuapi/scripts/quote/get_stock_info.py <CODE> --json
python3 "${CLAUDE_SKILLS_DIR:-$HOME/.claude/skills}"/futuapi/scripts/quote/get_company_profile.py <CODE> --json
python3 "${CLAUDE_SKILLS_DIR:-$HOME/.claude/skills}"/futuapi/scripts/quote/get_kline.py <CODE> --ktype 1d --num 120 --json
```

用途：已上市新股的实时行情、公司概况、K 线走势。

### Skill 内置辅助脚本

```bash
python3 stock/hk-ipo-analyzer/scripts/record_hkex_document.py --help
python3 stock/hk-ipo-analyzer/scripts/sponsor_performance.py --help
```

用途：
- `record_hkex_document.py`：把 HKEX 文件的公司、文件类型、PDF URL、来源页面、抓取时间和本地 PDF sha256 规范化为 JSON。
- `sponsor_performance.py`：对保荐人 / 承销商样本 CSV 或 JSON 计算首日破发率、当前破发率、当前上涨率和收益中位数。

这些脚本不替代搜索。先找到来源和样本，再用脚本做登记或计算。

## 官方披露源（港股优先）

| 来源 | 查什么 |
|------|--------|
| HKEXnews / 披露易 | 招股书、PHIP、配发结果、上市公告 |
| 公司 IR 页面 | 业务介绍、管理层、联系方式 |
| 港交所公告 | 监管披露、关联交易、重大事项 |

港股 PDF 抓取细节见 [hkex-documents.md](hkex-documents.md)：优先从 New Listing Information、AP & PHIP、Title Search 页面解析 `.pdf` href，不手拼 URL。

## Tavily / WebSearch 查询模板

使用规则：
- 只要用户问"近期 / 最新 / 本周 / upcoming"，先用搜索查实时来源。
- 单只 IPO 必须至少做一次官方域名限定搜索。
- 搜索结果只作证据入口，最终数字优先引用官方文件原文。

### 市场级日历

```
港股 新股 招股 申购 上市日期 配售结果
港股 IPO calendar upcoming listing subscription allotment result
港股 近期新股 打新 本周 招股中
site:hkexnews.hk new listing information prospectus
```

### 单只 IPO — 发行结构

```
<公司名> IPO 招股书 发行价 募资 用途 风险因素
<公司名> IPO prospectus offering price underwriter cornerstone
<公司名> IPO allotment result cornerstone investor lock-up greenshoe
<公司名> IPO listing date first day trading break issue price
site:hkexnews.hk <公司名> prospectus allotment results global offering
site:hkexnews.hk <公司名> application proof PHIP OC announcement
```

### 保荐人 / 承销商历史项目

```
<保荐人> IPO 保荐 项目 近两年 破发 发行价 上市
<保荐人> sponsor IPO listings last 24 months issue price first day close
<承销商> lead underwriter IPO performance last 12 months
site:hkexnews.hk <保荐人> 保荐人 配发结果 上市 发行价
```

样本整理成 CSV 或 JSON 后，用：

```bash
python3 stock/hk-ipo-analyzer/scripts/sponsor_performance.py samples.csv --json
```

### 价格表现补证

```
<样本公司> IPO issue price first day close current price
<样本公司> 发行价 首日收盘价 当前价 破发
```

### 同业估值锚

```
<公司名> IPO peers competitors valuation revenue gross margin
<公司名> 招股书 同业 可比公司 估值 市销率 市盈率
<行业关键词> HK listed peers valuation revenue margin
```

同业选择顺序：
1. 招股书直接列出的同业
2. 同市场、业务高度相似公司
3. 跨市场但业务高度相似公司
4. 无直接同业时改用业务指标锚（ARR / GMV / 订单 / 现金跑道 / 管线里程碑），并说明不可比原因

### 事件专项

```
<公司名> IPO lock-up expiration date
<公司名> IPO greenshoe stabilization announcement
<公司名> IPO broke issue price first day trading
<公司名> IPO analyst coverage quiet period
<公司名> 新股 锁定期 解禁 稳价期
```

## 字段优先级

1. 官方文件原文（HKEXnews PDF）
2. Futu 结构化字段
3. 交易所 / 公司公告摘要
4. 主流财经媒体
5. 二级转载（只能作线索，不作最终事实）
