# HKEXnews 披露易 IPO PDF 获取

港股 IPO 文件优先从 HKEXnews 页面解析 `.pdf` 链接，再下载或引用 PDF。不要根据日期、公司代码或文件名手工拼 URL。

## 三个入口

### 1. New Listing Information

入口：

```txt
https://www2.hkexnews.hk/New-Listings/New-Listing-Information/Main-Board?sc_lang=en
https://www2.hkexnews.hk/New-Listings/New-Listing-Information/GEM?sc_lang=en
```

用途：最终上市阶段文件。页面按股票代码和公司列出：

- New Listing Announcements
- Prospectuses
- Allotment Results
- New Listing Report

抓取策略：

1. 用 WebFetch 打开页面
2. 解析 HTML
3. 找到目标公司行
4. 取 Prospectuses / Allotment Results / New Listing Announcements 栏位的 `Download` href
5. 将相对链接转成绝对链接
6. 下载或记录 PDF URL

### 2. AP & PHIP

入口：

```txt
https://www1.hkexnews.hk/app/appindex.html
```

用途：递表和聆讯阶段文件：

- Application Proof / 申请版本
- PHIP / 聆讯后资料集
- OC Announcement / 整体协调人公告
- MB Rule 9.08 Statement 等相关材料

注意：

- 页面进入前有 Warning Statement；自动化时需要处理确认页。
- 已归类为 Inactive 的旧文件内容可能无法访问；最新 Application Proof / PHIP 可从 HKEXnews Listed Company Information 浏览和下载。
- AP / PHIP 经常有多版，必须保留 release date / title / pdfUrl，不要只保存最新一份。

### 3. Title Search

入口示例：

```txt
https://www1.hkexnews.hk/search/titlesearch.xhtml?category=1&lang=EN&market=SEHK
```

用途：补漏和历史文件检索。结果页字段通常包含：

- Release Time
- Stock Code
- Stock Short Name
- Document category
- PDF title and size

抓取策略：

1. 用公司名、股票代码、日期区间和标题关键字搜索
2. 优先搜 `Global Offering`、`Prospectus`、`Allotment Results`、`Application Proof`、`PHIP`
3. 搜索结果里的文档标题本身通常是 PDF 链接
4. `stockId` 是披露易内部 ID，不等同股票代码；不要把股票代码直接当 `stockId`

## Tavily site: 限定搜索

当 WebFetch 无法直接解析页面时，用 Tavily site: 限定搜索作为备选：

```
site:hkexnews.hk <公司名> prospectus allotment results global offering
site:hkexnews.hk <公司名> application proof PHIP OC announcement
site:hkexnews.hk <股票代码> prospectus allotment results
```

## PDF URL 规则

常见路径例子：

```txt
https://www1.hkexnews.hk/listedco/listconews/sehk/2026/0528/2026052800031.pdf
https://www1.hkexnews.hk/listedco/listconews/sehk/2017/0410/ltn201704101125.pdf
https://www1.hkexnews.hk/app/sehk/2026/108568/a133237/sehk26052500298.pdf
https://www1.hkexnews.hk/app/sehk/2026/108456/documents/sehk26042200374.pdf
```

这些结构只能帮助识别链接，不可用于猜测文件。正确做法永远是从页面 `<a href>` 解析。

## 文档类型标准化

| 文档类型 | 英文名 | 用途 |
|----------|--------|------|
| Application Proof | APPLICATION_PROOF | 递表阶段 |
| PHIP | PHIP | 聆讯后 |
| OC Announcement | OC_ANNOUNCEMENT | 整体协调人公告 |
| Prospectus | PROSPECTUS | 招股书（最终版） |
| Allotment Result | ALLOTMENT_RESULT | 配发结果 |
| Listing Announcement | LISTING_ANNOUNCEMENT | 上市公告 |

## 下载与缓存纪律

- 保存原始 PDF URL、来源页面 URL、抓取时间。
- 下载 PDF 后能计算 hash 时记录 `sha256`，防止同名文件覆盖或版本混淆。
- 同一家公司多版 Application Proof / PHIP 必须做版本管理。
- 最终投资评估优先使用最终 Prospectus；AP / PHIP 只作为递表阶段或版本变更研究材料。
- 下载失败、Warning Statement 阻塞、Inactive 文件不可访问时，必须写进数据缺口。
