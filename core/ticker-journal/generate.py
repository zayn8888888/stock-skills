#!/usr/bin/env python3
"""
生成 ticker journal 仪表盘 HTML。
用法：python3 ~/.stock-skills/journals/generate.py
输出：~/.stock-skills/journals/dashboard.html
"""
import re
import json
from pathlib import Path
from datetime import date, datetime
from typing import Optional

JOURNALS_DIR = Path.home() / '.stock-skills' / 'journals'
OUTPUT = JOURNALS_DIR / 'dashboard.html'


def parse_journal(filepath: Path) -> list[dict]:
    """解析单个 ticker journal 文件，返回所有条目列表（最新在前）。"""
    text = filepath.read_text(encoding='utf-8')
    ticker = filepath.stem

    # 按 "## YYYY-MM-DD · " 分割条目
    blocks = re.split(r'\n(?=## \d{4}-\d{2}-\d{2} ·)', text)
    entries = []

    for block in blocks:
        m = re.match(r'## (\d{4}-\d{2}-\d{2}) · ([^\n·]+?) · ([^\n]+)', block)
        if not m:
            continue

        entry_date = m.group(1).strip()
        source = m.group(2).strip()
        raw_rating = m.group(3).strip()

        # 评级标准化
        rating = 'N/A'
        for r in ['Overweight', 'Underweight', 'Hold', '纯分析']:
            if r.lower() in raw_rating.lower():
                rating = r
                break

        # 决策行
        decision_m = re.search(r'\*\*决策\*\*：([^\n]+)', block)
        decision_text = decision_m.group(1).strip() if decision_m else ''

        # 入场价
        entry_m = re.search(r'@\s*([^\s，,]+)', decision_text)
        entry_price = entry_m.group(1) if entry_m else 'N/A'

        # 止损
        stop_m = re.search(r'stop\s+([^\s，,]+)', decision_text)
        stop = stop_m.group(1) if stop_m else 'N/A'

        # 目标
        target_m = re.search(r'target\s+([^\s，,（(]+)', decision_text)
        target = target_m.group(1) if target_m else 'N/A'

        # 仓位
        pos_m = re.search(r'^([^@]+?)@', decision_text)
        position = pos_m.group(1).strip().lstrip('Overweight').lstrip('Underweight').lstrip('Hold').lstrip('纯分析').strip() if pos_m else 'N/A'

        # 价格快照
        price_m = re.search(r'- 价格：([^\n（(]+)', block)
        price_snap = price_m.group(1).strip() if price_m else 'N/A'

        # 大师信号
        master_m = re.search(r'\*\*大师信号\*\*：([^\n]+)', block)
        masters = master_m.group(1).strip() if master_m else 'N/A'

        # 复盘锚点（日期）
        review_m = re.search(r'\*\*复盘锚点\*\*：(\d{4}-\d{2}-\d{2})', block)
        review_date = review_m.group(1) if review_m else None

        # 核心催化（前2条）
        catalysts = re.findall(r'- ([^\n]+)', block[block.find('核心催化'):block.find('核心风险')] if '核心催化' in block and '核心风险' in block else '')
        catalysts = [c for c in catalysts if c and not c.startswith('**')][:2]

        # 核心风险（前2条）
        risk_start = block.find('核心风险')
        risk_end = block.find('\n**大师信号', risk_start) if '\n**大师信号' in block[risk_start:] else risk_start + 300
        risks = re.findall(r'- ([^\n]+)', block[risk_start:risk_end])
        risks = [r for r in risks if r and not r.startswith('**')][:2]

        # 距复盘日天数
        days_to_review = None
        if review_date and review_date != 'N/A':
            try:
                rd = date.fromisoformat(review_date)
                days_to_review = (rd - date.today()).days
            except Exception:
                pass

        entries.append({
            'ticker': ticker,
            'date': entry_date,
            'source': source,
            'rating': rating,
            'decision': decision_text,
            'entry_price': entry_price,
            'stop': stop,
            'target': target,
            'position': position,
            'price_snap': price_snap,
            'masters': masters,
            'review_date': review_date,
            'days_to_review': days_to_review,
            'catalysts': catalysts,
            'risks': risks,
        })

    # 最新在前
    entries.sort(key=lambda x: x['date'], reverse=True)
    return entries


def load_all():
    """读取所有 ticker journal 文件。"""
    result = {}
    for f in sorted(JOURNALS_DIR.glob('*.md')):
        if f.name in ('INDEX.md',):
            continue
        entries = parse_journal(f)
        if entries:
            result[f.stem] = entries
    return result


def rating_color(rating: str) -> str:
    m = {
        'Overweight': '#22c55e',
        'Underweight': '#f97316',
        'Hold': '#eab308',
        '纯分析': '#60a5fa',
    }
    return m.get(rating, '#94a3b8')


def rating_bg(rating: str) -> str:
    m = {
        'Overweight': 'rgba(34,197,94,0.12)',
        'Underweight': 'rgba(249,115,22,0.12)',
        'Hold': 'rgba(234,179,8,0.12)',
        '纯分析': 'rgba(96,165,250,0.12)',
    }
    return m.get(rating, 'rgba(148,163,184,0.1)')


def review_badge(days: Optional[int]) -> str:
    if days is None:
        return ''
    if days < 0:
        return f'<span class="badge overdue">⚠ 已逾期 {abs(days)}d</span>'
    if days <= 14:
        return f'<span class="badge urgent">🔔 {days}d 后</span>'
    if days <= 30:
        return f'<span class="badge soon">📅 {days}d 后</span>'
    return f'<span class="badge normal">📅 {days}d 后</span>'


def build_card(ticker: str, entries: list[dict]) -> str:
    latest = entries[0]
    rc = rating_color(latest['rating'])
    rb = rating_bg(latest['rating'])
    history_dots = ''.join(
        f'<span class="dot" style="background:{rating_color(e["rating"])}" title="{e["date"]} {e["rating"]}"></span>'
        for e in reversed(entries)
    )
    catalysts_html = ''.join(f'<li>{c}</li>' for c in latest['catalysts']) or '<li>—</li>'
    risks_html = ''.join(f'<li>{r}</li>' for r in latest['risks']) or '<li>—</li>'
    review_html = review_badge(latest['days_to_review'])
    review_date_str = latest['review_date'] or 'N/A'
    entry_count = len(entries)

    return f'''
<div class="card" data-rating="{latest["rating"]}" data-days="{latest["days_to_review"] if latest["days_to_review"] is not None else 9999}">
  <div class="card-header" style="border-left:4px solid {rc}; background:{rb}">
    <div class="card-title-row">
      <span class="ticker">{ticker}</span>
      <span class="rating-badge" style="color:{rc}">{latest["rating"]}</span>
    </div>
    <div class="card-meta">
      <span class="source">{latest["source"]}</span>
      <span class="date">{latest["date"]}</span>
      {review_html}
    </div>
  </div>
  <div class="card-body">
    <div class="params">
      <div class="param"><span class="label">入场</span><span class="value">{latest["entry_price"]}</span></div>
      <div class="param"><span class="label">止损</span><span class="value stop">{latest["stop"]}</span></div>
      <div class="param"><span class="label">目标</span><span class="value target">{latest["target"]}</span></div>
      <div class="param"><span class="label">仓位</span><span class="value">{latest["position"]}</span></div>
    </div>
    <div class="masters">{latest["masters"]}</div>
    <div class="cr-grid">
      <div class="cr-col">
        <div class="cr-title bull">催化</div>
        <ul>{catalysts_html}</ul>
      </div>
      <div class="cr-col">
        <div class="cr-title bear">风险</div>
        <ul>{risks_html}</ul>
      </div>
    </div>
  </div>
  <div class="card-footer">
    <span class="history-label">历史 {entry_count} 条</span>
    <span class="dots">{history_dots}</span>
    <span class="review-date">复盘 {review_date_str}</span>
  </div>
</div>'''


def generate_html(data: dict[str, list[dict]]) -> str:
    now = datetime.now().strftime('%Y-%m-%d %H:%M')

    # 排序：逾期 > 14天内 > 按距复盘日升序
    def sort_key(item):
        days = item[1][0]['days_to_review']
        if days is None:
            return (2, 9999)
        if days < 0:
            return (0, days)
        return (1, days)

    sorted_data = sorted(data.items(), key=sort_key)

    cards_html = '\n'.join(build_card(ticker, entries) for ticker, entries in sorted_data)

    # 统计
    all_latest = [entries[0] for entries in data.values()]
    count_ow = sum(1 for e in all_latest if e['rating'] == 'Overweight')
    count_hold = sum(1 for e in all_latest if e['rating'] == 'Hold')
    count_uw = sum(1 for e in all_latest if e['rating'] == 'Underweight')
    count_overdue = sum(1 for e in all_latest if e['days_to_review'] is not None and e['days_to_review'] < 0)
    count_urgent = sum(1 for e in all_latest if e['days_to_review'] is not None and 0 <= e['days_to_review'] <= 14)
    total = len(data)

    return f'''<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Ticker Journal — {now}</title>
<style>
  :root {{
    --bg: #0f1117;
    --surface: #1a1d27;
    --border: #2a2d3a;
    --text: #e2e8f0;
    --muted: #64748b;
    --green: #22c55e;
    --red: #f97316;
    --yellow: #eab308;
    --blue: #60a5fa;
  }}
  * {{ box-sizing: border-box; margin: 0; padding: 0; }}
  body {{ background: var(--bg); color: var(--text); font-family: -apple-system, 'PingFang SC', sans-serif; font-size: 13px; }}
  .header {{ padding: 20px 24px 16px; border-bottom: 1px solid var(--border); display: flex; align-items: center; justify-content: space-between; }}
  .header h1 {{ font-size: 18px; font-weight: 600; letter-spacing: -0.3px; }}
  .header .updated {{ color: var(--muted); font-size: 12px; }}
  .stats {{ display: flex; gap: 16px; padding: 14px 24px; border-bottom: 1px solid var(--border); flex-wrap: wrap; }}
  .stat {{ display: flex; align-items: center; gap: 6px; }}
  .stat-dot {{ width: 8px; height: 8px; border-radius: 50%; }}
  .stat-label {{ color: var(--muted); }}
  .stat-val {{ font-weight: 600; }}
  .toolbar {{ padding: 12px 24px; display: flex; gap: 8px; flex-wrap: wrap; border-bottom: 1px solid var(--border); }}
  .filter-btn {{ padding: 4px 12px; border-radius: 999px; border: 1px solid var(--border); background: transparent; color: var(--muted); cursor: pointer; font-size: 12px; transition: all .15s; }}
  .filter-btn:hover, .filter-btn.active {{ border-color: var(--blue); color: var(--blue); background: rgba(96,165,250,.1); }}
  .grid {{ display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 16px; padding: 20px 24px; }}
  .card {{ background: var(--surface); border-radius: 10px; overflow: hidden; border: 1px solid var(--border); transition: transform .15s, box-shadow .15s; }}
  .card:hover {{ transform: translateY(-2px); box-shadow: 0 8px 24px rgba(0,0,0,.4); }}
  .card.hidden {{ display: none; }}
  .card-header {{ padding: 12px 14px 10px; }}
  .card-title-row {{ display: flex; align-items: baseline; justify-content: space-between; margin-bottom: 4px; }}
  .ticker {{ font-size: 16px; font-weight: 700; letter-spacing: .5px; }}
  .rating-badge {{ font-size: 12px; font-weight: 600; }}
  .card-meta {{ display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }}
  .source {{ color: var(--muted); font-size: 11px; }}
  .date {{ color: var(--muted); font-size: 11px; }}
  .badge {{ font-size: 11px; font-weight: 600; padding: 1px 6px; border-radius: 4px; }}
  .badge.overdue {{ background: rgba(239,68,68,.2); color: #f87171; }}
  .badge.urgent {{ background: rgba(234,179,8,.2); color: #fbbf24; }}
  .badge.soon {{ background: rgba(96,165,250,.15); color: #93c5fd; }}
  .badge.normal {{ background: rgba(148,163,184,.1); color: var(--muted); }}
  .card-body {{ padding: 10px 14px; }}
  .params {{ display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; margin-bottom: 8px; }}
  .param {{ text-align: center; }}
  .label {{ display: block; color: var(--muted); font-size: 10px; text-transform: uppercase; letter-spacing: .5px; margin-bottom: 2px; }}
  .value {{ font-weight: 600; font-size: 12px; }}
  .value.stop {{ color: #f87171; }}
  .value.target {{ color: var(--green); }}
  .masters {{ color: var(--muted); font-size: 11px; margin-bottom: 8px; line-height: 1.5; border-top: 1px solid var(--border); padding-top: 7px; }}
  .cr-grid {{ display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }}
  .cr-title {{ font-size: 10px; font-weight: 700; letter-spacing: .5px; text-transform: uppercase; margin-bottom: 4px; }}
  .cr-title.bull {{ color: var(--green); }}
  .cr-title.bear {{ color: var(--red); }}
  .cr-col ul {{ padding-left: 12px; }}
  .cr-col li {{ font-size: 11px; color: var(--muted); line-height: 1.5; margin-bottom: 2px; list-style: disc; }}
  .card-footer {{ padding: 8px 14px; border-top: 1px solid var(--border); display: flex; align-items: center; justify-content: space-between; background: rgba(0,0,0,.2); }}
  .history-label {{ color: var(--muted); font-size: 11px; }}
  .dots {{ display: flex; gap: 4px; align-items: center; }}
  .dot {{ width: 8px; height: 8px; border-radius: 50%; opacity: .8; }}
  .review-date {{ color: var(--muted); font-size: 11px; }}
  @media (max-width: 600px) {{ .grid {{ grid-template-columns: 1fr; padding: 12px; }} .params {{ grid-template-columns: repeat(2,1fr); }} }}
</style>
</head>
<body>
<div class="header">
  <h1>📊 Ticker Journal</h1>
  <span class="updated">更新于 {now}</span>
</div>
<div class="stats">
  <div class="stat"><div class="stat-dot" style="background:#22c55e"></div><span class="stat-label">Overweight</span><span class="stat-val">{count_ow}</span></div>
  <div class="stat"><div class="stat-dot" style="background:#eab308"></div><span class="stat-label">Hold</span><span class="stat-val">{count_hold}</span></div>
  <div class="stat"><div class="stat-dot" style="background:#f97316"></div><span class="stat-label">Underweight</span><span class="stat-val">{count_uw}</span></div>
  <div class="stat"><div class="stat-dot" style="background:#f87171"></div><span class="stat-label">复盘逾期</span><span class="stat-val">{count_overdue}</span></div>
  <div class="stat"><div class="stat-dot" style="background:#fbbf24"></div><span class="stat-label">14天内复盘</span><span class="stat-val">{count_urgent}</span></div>
  <div class="stat" style="margin-left:auto"><span class="stat-label">共</span><span class="stat-val">&nbsp;{total}&nbsp;</span><span class="stat-label">标的</span></div>
</div>
<div class="toolbar">
  <button class="filter-btn active" onclick="filterAll()">全部 ({total})</button>
  <button class="filter-btn" onclick="filterRating('Overweight')">🟢 Overweight ({count_ow})</button>
  <button class="filter-btn" onclick="filterRating('Hold')">🟡 Hold ({count_hold})</button>
  <button class="filter-btn" onclick="filterRating('Underweight')">🟠 Underweight ({count_uw})</button>
  <button class="filter-btn" onclick="filterUrgent()">⚠ 待复盘 ({count_overdue + count_urgent})</button>
</div>
<div class="grid" id="grid">
{cards_html}
</div>
<script>
function filterAll() {{
  document.querySelectorAll('.card').forEach(c => c.classList.remove('hidden'));
  setActive(0);
}}
function filterRating(r) {{
  document.querySelectorAll('.card').forEach(c => {{
    c.classList.toggle('hidden', c.dataset.rating !== r);
  }});
  setActive(null);
}}
function filterUrgent() {{
  document.querySelectorAll('.card').forEach(c => {{
    const d = parseInt(c.dataset.days);
    c.classList.toggle('hidden', d >= 15 || isNaN(d));
  }});
  setActive(null);
}}
function setActive(idx) {{
  document.querySelectorAll('.filter-btn').forEach((b, i) => b.classList.toggle('active', i === idx));
}}
document.querySelectorAll('.filter-btn').forEach((btn, i) => {{
  btn.addEventListener('click', () => setActive(i));
}});
</script>
</body>
</html>'''


if __name__ == '__main__':
    data = load_all()
    html = generate_html(data)
    OUTPUT.write_text(html, encoding='utf-8')
    print(f'✅ 生成完成：{OUTPUT}')
    print(f'   标的数：{len(data)}')
    print(f'   打开方式：open {OUTPUT}')
