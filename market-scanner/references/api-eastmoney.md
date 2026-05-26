# 东方财富 HTTP API 参考

## 节点配置与优先级

```python
import urllib.request, json, time
from datetime import datetime, timedelta

# push2delay 最稳定，优先使用；push2 偶发 502
EM_NODES = [
    'http://push2delay.eastmoney.com',  # 优先
    'http://push2.eastmoney.com',        # 备用
]
EM_HIS_NODE = 'http://push2his.eastmoney.com'  # 历史K线，高频调用后会限流
EM_HEADERS = {'User-Agent': 'Mozilla/5.0', 'Connection': 'close'}

def em_fetch(path, retries=3):
    """依次尝试各节点，失败自动切换"""
    for node in EM_NODES:
        for _ in range(retries):
            try:
                req = urllib.request.Request(node + path, headers=EM_HEADERS)
                with urllib.request.urlopen(req, timeout=8) as r:
                    return json.loads(r.read())
            except: time.sleep(1)
    return {}
```

## 接口 1：全量概念板块列表（486 个，按 5 日涨幅排序）

```python
def em_get_all_boards(pages=5):
    boards = []
    for pn in range(1, pages+1):
        path = f'/api/qt/clist/get?pn={pn}&pz=100&po=1&np=1&fltt=2&invt=2&fid=f109&fs=m:90+t:3&fields=f12,f14,f3,f109'
        d = em_fetch(path)
        diff = (d.get('data') or {}).get('diff') or []
        if not diff: break
        boards.extend(diff)
        time.sleep(0.3)
    return boards
```

**字段说明**：

| 字段 | 含义 | 备注 |
|------|------|------|
| `f12` | BK 板块代码 | 如 `BK1101` |
| `f14` | 板块名称 | |
| `f3`  | 今日涨幅（%） | 严禁单独作为筛选口径 |
| `f109` | 5 日涨幅（%） | 经实测与富途 5d K线误差 < 0.01% |
| `f115` | 约 30 日涨幅（%） | **不是 10 日**，10 日需用富途 K 线计算 |

> 注意：单次最多返回 100 条，486 个板块需分 5 页（pn=1~5）。

## 接口 2：单板块成分股

```python
def em_get_board_stocks(bk_code, limit=50):
    path = (f'/api/qt/clist/get?pn=1&pz={limit}&po=1&np=1&fltt=2&invt=2&fid=f109'
            f'&fs=b:{bk_code}+f:!60&fields=f12,f13,f14,f3,f6,f109,f62')
    d = em_fetch(path)
    stocks = (d.get('data') or {}).get('diff') or []
    return [{'futu_code': f"{'SH' if s.get('f13')==1 else 'SZ'}.{s['f12']}",
             'name': s.get('f14',''), 'today_pct': float(s.get('f3') or 0),
             '5d_pct': float(s.get('f109') or 0),
             'turnover_yi': float(s.get('f6') or 0)/1e8,
             'main_flow_yi': float(s.get('f62') or 0)/1e8}
            for s in stocks]
```

**成分股接口字段说明**：

| 字段 | 含义 | 备注 |
|------|------|------|
| `f12` | 股票代码（6 位数字） | |
| `f13` | 市场标识 | `1` = 上交所（SH）；`0` = 深交所（SZ） |
| `f14` | 股票名称 | |
| `f3`  | 今日涨幅（%） | |
| `f6`  | 成交额（元）| 除以 1e8 得亿元 |
| `f109` | 5 日涨幅（%）| **注意**：在成分股接口里 5 日涨幅用 f109，f104/f105 在此接口返回 0 |
| `f62` | 今日主力净流入（元）| 除以 1e8 得亿元 |

## 接口 3：板块历史日 K 线（周度轮动分析用）

```python
def em_get_board_kline(bk_code, weeks=4):
    end = datetime.today()
    start = end - timedelta(weeks=weeks+1)
    path = (f'/api/qt/stock/kline/get?secid=90.{bk_code}'
            f'&fields1=f1,f2,f3,f4&fields2=f51,f52,f53,f54,f55,f56,f57,f58,f59'
            f'&klt=101&fqt=1&beg={start.strftime("%Y%m%d")}&end={end.strftime("%Y%m%d")}&lmt=200')
    req = urllib.request.Request(EM_HIS_NODE + path, headers=EM_HEADERS)
    with urllib.request.urlopen(req, timeout=8) as r:
        d = json.loads(r.read())
    # 返回 {日期: {'close':..., 'pct':...}}
    result = {}
    for k in (d.get('data') or {}).get('klines') or []:
        f = k.split(',')
        try: result[f[0]] = {'close': float(f[2]), 'pct': float(f[8])}
        except: pass
    return result
```

> 历史 K 线走 `EM_HIS_NODE`，高频调用后会触发限流，建议调用间隔 ≥ 0.3s，或换时段重试。

## 已验证 BK 代码表

经实测 f109（5日涨幅）与富途误差 < 0.01%：

```
BK1101=先进封装    BK1128=CPO概念      BK1152=高带宽内存HBM
BK1136=光通信模块  BK0877=PCB          BK1175=玻璃基板封装
BK0890=MLCC       BK0946=EDA概念      BK0935=中芯概念
BK0578=稀土永磁   BK0952=第三代半导体  BK1023=培育钻石
```

未知 BK 代码时：调用 `em_get_all_boards()` 按板块名关键词搜索，不要凭记忆编代码。

## 噪音板块 NOISE_KEYWORDS

以下关键词出现在板块名称中，说明是统计类/资金类虚拟板块，会常驻 5d 排行 Top 10 但不代表真实行业轮动，**必须在进入 L1.5 前过滤**：

```python
NOISE_KEYWORDS = ['昨日','历史新高','百日新高','连板','涨停','跌停','首板',
                  '大盘股','中盘股','小盘股','龙头股','高价股','低价股','近期新高',
                  '破净','破发','回购','增持','社保','QFII','融资融券',
                  '沪股通','深股通','A股通','富时','MSCI','标普']
```

## 为什么 A 股板块扫描用东财而不用富途 INDUSTRY

富途 INDUSTRY 只有 131 个行业板块，完全看不到跨行业主题（先进封装 / CPO / HBM / 玻璃基板封装等）。东财 486 个概念板块全覆盖，且 f109 字段精度经过实测验证。以 2026-05 为例，玻璃基板封装（BK1175）是 4 周持续主线，但富途根本没有对应的可查板块。
