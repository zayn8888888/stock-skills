#!/usr/bin/env python3
"""
Futu Community Posts Fetcher
用法: python futu_community_sentiment.py FUTU [--num 20] [--tab latest|hot]

Cookie 配置（三选一）:
  1. 环境变量: FUTU_UID, FUTU_WEB_SIG, FUTU_CI_SIG
  2. 配置文件: ~/.futu_auth.json  {"uid":"...","web_sig":"...","ci_sig":"..."}
  3. 命令行参数: --uid, --web-sig, --ci-sig
"""

import os, json, html, re, sys, time, random, argparse
from typing import Optional, Tuple
from urllib.request import urlopen, Request
from datetime import datetime, timezone, timedelta

CST      = timezone(timedelta(hours=8))
COMM_API = 'https://q.futunn.com/nnq/stock-feedlist2'

_UA_POOL = [
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36',
]

def _ua():
    return random.choice(_UA_POOL)

def _sleep(lo=0.8, hi=2.0):
    time.sleep(lo + random.random() * (hi - lo))


# ── Cookie ───────────────────────────────────────────────────

def load_cookies(args):
    uid     = getattr(args, 'uid', None)     or os.environ.get('FUTU_UID')
    web_sig = getattr(args, 'web_sig', None) or os.environ.get('FUTU_WEB_SIG')
    ci_sig  = getattr(args, 'ci_sig', None)  or os.environ.get('FUTU_CI_SIG', '')

    if not (uid and web_sig):
        cfg = os.path.expanduser('~/.futu_auth.json')
        if os.path.exists(cfg):
            with open(cfg) as f:
                d = json.load(f)
            uid     = uid     or d.get('uid', '')
            web_sig = web_sig or d.get('web_sig', '')
            ci_sig  = ci_sig  or d.get('ci_sig', '')

    if not (uid and web_sig):
        print(json.dumps({'error': '未找到认证 cookie，请配置 ~/.futu_auth.json 或传入 --uid/--web-sig'}, ensure_ascii=False))
        sys.exit(1)

    return {'uid': uid, 'web_sig': web_sig, 'ci_sig': ci_sig}


def cookie_str(cookies):
    parts = [f"uid={cookies['uid']}", f"web_sig={cookies['web_sig']}"]
    if cookies.get('ci_sig'):
        parts.append(f"ci_sig={cookies['ci_sig']}")
    return '; '.join(parts)


# ── stock_id 查询 ────────────────────────────────────────────

def lookup_stock_id(symbol: str) -> Optional[Tuple[str, str]]:
    for i, suffix in enumerate(('US', 'HK')):
        if i > 0:
            _sleep(1.0, 2.5)
        url = f'https://www.futunn.com/stock/{symbol.upper()}-{suffix}'
        req = Request(url, headers={
            'User-Agent': _ua(),
            'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        })
        try:
            with urlopen(req) as r:
                page = r.read().decode('utf-8', errors='ignore')
        except Exception:
            continue

        m = re.search(
            r'"stockCode"\s*:\s*"' + re.escape(symbol.upper()) +
            r'"[^}]{0,200}"stockId"\s*:\s*"(\d+)"',
            page
        )
        if m:
            sid = m.group(1)
            nm  = re.search(r'"name"\s*:\s*"([^"]+)"', page[max(0, m.start()-200):m.start()+10])
            return sid, (nm.group(1) if nm else symbol)

    return None


# ── 帖子拉取 ─────────────────────────────────────────────────

def fetch_community(stock_id: str, num: int, cookies: dict, feed_type: int) -> list:
    PAGE = 20
    all_feed, more_mark, sequence, page_num = [], '', '', 0

    while len(all_feed) < num:
        if page_num > 0:
            _sleep(1.2, 3.0)
        page_num += 1

        ts    = int(time.time() * 1000)
        extra = ('&refresh_cycle_info%5Bcycle_info%5D=&refresh_cycle_info%5Brefresh_cycle%5D=0'
                 if feed_type == 501 else '')
        url = (f'{COMM_API}?type={feed_type}&load_list_type=2'
               f'&stock_id={stock_id}&num={PAGE}'
               f'&more_mark={more_mark}&sequence={sequence}{extra}&_={ts}')
        headers = {
            'accept': 'application/json, text/plain, */*',
            'accept-language': 'zh-CN,zh;q=0.9,en;q=0.8',
            'priority': 'u=1, i',
            'sec-fetch-dest': 'empty',
            'sec-fetch-mode': 'cors',
            'sec-fetch-site': 'same-site',
            'user-agent': _ua(),
            'x-futu-nnq-new-website': 'nnq',
            'Referer': 'https://www.futunn.com/',
            'cookie': cookie_str(cookies),
        }
        with urlopen(Request(url, headers=headers)) as r:
            data = json.load(r)

        if data.get('code') == 10888:
            print(json.dumps({'error': 'Cookie 已过期或无效，请更新 ~/.futu_auth.json'}, ensure_ascii=False))
            sys.exit(1)

        batch = data.get('feed', [])
        all_feed.extend(batch)

        if not data.get('has_more') or not batch:
            break
        more_mark = data.get('more_mark', '')
        sequence  = data.get('sequence', '')

    return all_feed[:num]


# ── 文本提取 ─────────────────────────────────────────────────

def extract_text(summary: dict) -> str:
    parts = []
    for node in summary.get('rich_text', []):
        t = node.get('type')
        if t == 0:
            txt = node.get('text', {})
            if isinstance(txt, dict):
                txt = txt.get('text', '')
            if txt:
                cleaned = re.sub(r'<[^>]+>', ' ', str(txt))
                cleaned = html.unescape(cleaned).strip()
                if cleaned:
                    parts.append(cleaned)
        elif t == 3:
            name = node.get('stock', {}).get('stock_name', '')
            if name:
                parts.append(f'${name}$')
    return ' '.join(parts).strip()


def extract_ts(item: dict) -> str:
    ts = item.get('feed_comm', {}).get('timestamp', 0)
    try:
        ts = int(ts)
        if ts > 1e12:
            ts //= 1000
        if ts > 0:
            return datetime.fromtimestamp(ts, tz=CST).strftime('%Y-%m-%d %H:%M')
    except Exception:
        pass
    return ''


# ── 主逻辑 ───────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description='Futu 社区帖子拉取（输出 JSON）')
    parser.add_argument('symbol',         help='股票代码，如 FUTU / TSLA / BABA')
    parser.add_argument('--stock-id',     help='直接指定 Futu 内部 stock_id（跳过自动查询）')
    parser.add_argument('--num',          type=int, default=20, help='拉取帖子数，默认 20')
    parser.add_argument('--tab',          choices=['latest', 'hot'], default='latest',
                        help='latest=最新 tab(type=500)  hot=推荐 tab(type=501)')
    parser.add_argument('--uid',          help='富途 uid')
    parser.add_argument('--web-sig',      dest='web_sig', help='web_sig cookie')
    parser.add_argument('--ci-sig',       dest='ci_sig',  help='ci_sig cookie')
    parser.add_argument('--save-cookies', action='store_true',
                        help='将 --uid/--web-sig/--ci-sig 保存到 ~/.futu_auth.json')
    args = parser.parse_args()

    cookies = load_cookies(args)

    if args.save_cookies:
        cfg = os.path.expanduser('~/.futu_auth.json')
        with open(cfg, 'w') as f:
            json.dump({'uid': cookies['uid'], 'web_sig': cookies['web_sig'],
                       'ci_sig': cookies['ci_sig']}, f, indent=2)
        os.chmod(cfg, 0o600)

    # 查 stock_id
    stock_id   = args.stock_id
    stock_name = args.symbol
    if not stock_id:
        result = lookup_stock_id(args.symbol)
        if result:
            stock_id, stock_name = result
        else:
            print(json.dumps({'error': f'未找到 {args.symbol}，请用 --stock-id 手动指定'}, ensure_ascii=False))
            sys.exit(1)

    feed_type = 501 if args.tab == 'hot' else 500
    feed      = fetch_community(stock_id, args.num, cookies, feed_type)

    posts = []
    for item in feed:
        text = extract_text(item.get('summary', {}))
        if not text or len(text) < 4:
            continue
        posts.append({
            'time':     extract_ts(item),
            'text':     text,
            'likes':    item.get('like', {}).get('like_count', 0),
            'comments': item.get('comments_total_count', 0),
        })

    print(json.dumps({
        'symbol':     args.symbol.upper(),
        'stock_name': stock_name,
        'tab':        args.tab,
        'total':      len(posts),
        'posts':      posts,
    }, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
