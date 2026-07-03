#!/usr/bin/env python3
"""
生成 ticker journal 仪表盘 HTML。
用法：python3 ${CLAUDE_SKILLS_DIR:-$HOME/.claude/skills}/ticker-journal/generate.py
输出：~/.stock-skills/journals/dashboard.html（由 JOURNALS_DIR 决定）
"""
import re
import json
import html as html_mod
from pathlib import Path
from datetime import date, datetime
from typing import Optional

JOURNALS_DIR = Path.home() / '.stock-skills' / 'journals'
REPORTS_DIR = Path.home() / '.stock-skills' / 'reports'
DECISIONS_DIR = Path.home() / '.stock-skills' / 'trading-debate' / 'decisions'
OUTPUT = JOURNALS_DIR / 'dashboard.html'
DOC_ROOTS = [REPORTS_DIR, DECISIONS_DIR]


def parse_journal(filepath: Path) -> list[dict]:
    text = filepath.read_text(encoding='utf-8')
    ticker = filepath.stem
    blocks = re.split(r'\n(?=## \d{4}-\d{2}-\d{2}(?: \d{2}:\d{2})? ·)', text)
    entries = []

    for block in blocks:
        m = re.match(
            r'## (\d{4}-\d{2}-\d{2})(?: (\d{2}:\d{2}))? · ([^\n·]+?) · ([^\n]+)',
            block,
        )
        if not m:
            continue

        entry_date = m.group(1).strip()
        entry_time = m.group(2).strip() if m.group(2) else ''
        source = m.group(3).strip()
        raw_rating = m.group(4).strip()

        rating = 'N/A'
        for r in ['Overweight', 'Underweight', 'Hold', '纯分析']:
            if r.lower() in raw_rating.lower():
                rating = r
                break

        decision_m = re.search(r'\*\*决策\*\*：([^\n]+)', block)
        decision_text = decision_m.group(1).strip() if decision_m else ''

        entry_m = re.search(r'@\s*([^\s，,]+)', decision_text)
        entry_price = entry_m.group(1) if entry_m else 'N/A'

        stop_m = re.search(r'stop\s+([^\s，,]+)', decision_text)
        stop = stop_m.group(1) if stop_m else 'N/A'

        target_m = re.search(r'target\s+([^\s，,（(]+)', decision_text)
        target = target_m.group(1) if target_m else 'N/A'

        pos_m = re.search(r'^([^@]+?)@', decision_text)
        position = re.sub(r'^(Overweight|Underweight|Hold|纯分析)\s*', '', pos_m.group(1).strip()).strip() if pos_m else 'N/A'

        price_m = re.search(r'- 价格：([^\n（(]+)', block)
        price_snap = price_m.group(1).strip() if price_m else 'N/A'

        # 完整数据快照（所有行）
        snap_start = block.find('**数据快照**')
        snap_end = block.find('\n**核心催化', snap_start) if snap_start >= 0 else -1
        snap_lines = []
        if snap_start >= 0 and snap_end >= 0:
            snap_lines = [l.lstrip('- ').strip() for l in block[snap_start:snap_end].split('\n') if l.strip().startswith('-')]

        master_m = re.search(r'\*\*大师信号\*\*：([^\n]+)', block)
        masters = master_m.group(1).strip() if master_m else 'N/A'

        review_m = re.search(r'\*\*复盘锚点\*\*：(\d{4}-\d{2}-\d{2})', block)
        review_date = review_m.group(1) if review_m else None

        # 关联决策 / 报告文件
        link_m = re.search(r'\*\*关联决策文件\*\*：`([^`]+)`', block)
        decision_file = link_m.group(1) if link_m else None

        report_m = re.search(r'\*\*关联报告\*\*：`([^`]+)`', block)
        report_file = report_m.group(1) if report_m else None

        # 全部催化（不截断）
        cat_start = block.find('核心催化')
        catalysts_all = []
        if cat_start >= 0:
            cat_end = block.find('核心风险', cat_start)
            if cat_end == -1:
                cat_end = block.find('\n---', cat_start)
            catalysts_all = [l.lstrip('- ').strip() for l in block[cat_start:cat_end].split('\n') if l.strip().startswith('-')]

        # 全部风险（不截断）
        risk_start = block.find('核心风险')
        risks_all = []
        if risk_start >= 0:
            risk_end = block.find('\n**大师信号', risk_start)
            if risk_end == -1:
                risk_end = block.find('\n---', risk_start)
            risks_all = [l.lstrip('- ').strip() for l in block[risk_start:risk_end].split('\n') if l.strip().startswith('-')]

        days_to_review = None
        if review_date:
            try:
                days_to_review = (date.fromisoformat(review_date) - date.today()).days
            except Exception:
                pass

        entries.append({
            'ticker': ticker,
            'date': entry_date,
            'time': entry_time,
            'source': source,
            'rating': rating,
            'decision': decision_text,
            'entry_price': entry_price,
            'stop': stop,
            'target': target,
            'position': position,
            'price_snap': price_snap,
            'snap_lines': snap_lines,
            'masters': masters,
            'review_date': review_date,
            'days_to_review': days_to_review,
            'decision_file': decision_file,
            'report_file': report_file,
            'catalysts': catalysts_all[:2],
            'catalysts_all': catalysts_all,
            'risks': risks_all[:2],
            'risks_all': risks_all,
        })

    entries.sort(key=lambda x: x['date'], reverse=True)
    for entry in entries:
        attach_doc(entry)
    return entries


def expand_path(p: str) -> Path:
    return Path(p.replace('~', str(Path.home())))


def is_allowed_doc(path: Path) -> bool:
    try:
        resolved = path.resolve()
        return any(
            str(resolved).startswith(str(root.resolve()))
            for root in DOC_ROOTS
        )
    except OSError:
        return False


def find_report_path(ticker: str, date: str, time: str, source: str, explicit: Optional[str]) -> Optional[Path]:
    if explicit:
        p = expand_path(explicit)
        if p.exists():
            return p
    ticker_dir = REPORTS_DIR / ticker
    if not ticker_dir.exists():
        return None
    if time:
        p = ticker_dir / f'{date}-{time.replace(":", "")}-{source}.md'
        if p.exists():
            return p
    matches = sorted(ticker_dir.glob(f'{date}*-{source}.md'), reverse=True)
    return matches[0] if matches else None


def attach_doc(entry: dict) -> None:
    """解析并挂载完整报告 / 决策文件路径。"""
    report_path = find_report_path(
        entry['ticker'], entry['date'], entry.get('time', ''),
        entry['source'], entry.get('report_file'),
    )
    decision_path = None
    if entry.get('decision_file'):
        p = expand_path(entry['decision_file'])
        if p.exists():
            decision_path = p

    if report_path:
        entry['doc_path'] = str(report_path)
        entry['doc_type'] = 'report'
        entry['doc_label'] = '完整报告'
    elif decision_path:
        entry['doc_path'] = str(decision_path)
        entry['doc_type'] = 'decision'
        entry['doc_label'] = '决策报告'
    else:
        entry['doc_path'] = None
        entry['doc_type'] = None
        entry['doc_label'] = None


def load_doc_html(path: str) -> Optional[str]:
    p = Path(path)
    if not p.exists() or not is_allowed_doc(p):
        return None
    return md_to_html(p.read_text(encoding='utf-8'))


def md_to_html(text: str) -> str:
    """轻量 markdown → HTML，覆盖分析报告常用格式。"""
    lines = text.split('\n')
    out: list[str] = []
    in_ul = False
    in_ol = False
    in_table = False
    in_code = False
    code_buf: list[str] = []

    def close_lists():
        nonlocal in_ul, in_ol
        if in_ul:
            out.append('</ul>')
            in_ul = False
        if in_ol:
            out.append('</ol>')
            in_ol = False

    def close_table():
        nonlocal in_table
        if in_table:
            out.append('</tbody></table>')
            in_table = False

    def inline(s: str) -> str:
        s = html_mod.escape(s)
        s = re.sub(r'\*\*(.+?)\*\*', r'<strong>\1</strong>', s)
        s = re.sub(r'`([^`]+)`', r'<code>\1</code>', s)
        return s

    for line in lines:
        if in_code:
            if line.strip() == '```':
                out.append(f'<pre><code>{html_mod.escape(chr(10).join(code_buf))}</code></pre>')
                code_buf = []
                in_code = False
            else:
                code_buf.append(line)
            continue

        if line.strip().startswith('```'):
            close_lists()
            close_table()
            in_code = True
            continue

        # 表格
        if '|' in line and line.strip().startswith('|'):
            cells = [c.strip() for c in line.strip().strip('|').split('|')]
            if all(re.match(r'^[\s\-:|]+$', c) for c in cells):
                continue
            if not in_table:
                close_lists()
                out.append('<table class="report-table"><tbody>')
                in_table = True
                tag = 'th'
            else:
                tag = 'td'
            out.append('<tr>' + ''.join(f'<{tag}>{inline(c)}</{tag}>' for c in cells) + '</tr>')
            continue

        close_table()

        stripped = line.strip()
        if not stripped:
            close_lists()
            continue

        if stripped == '---':
            close_lists()
            out.append('<hr>')
            continue

        hm = re.match(r'^(#{1,4})\s+(.+)$', stripped)
        if hm:
            close_lists()
            level = len(hm.group(1))
            out.append(f'<h{level}>{inline(hm.group(2))}</h{level}>')
            continue

        if re.match(r'^[-*]\s+', stripped):
            if not in_ul:
                close_lists()
                out.append('<ul>')
                in_ul = True
            item_text = re.sub(r'^[-*]\s+', '', stripped)
            out.append(f'<li>{inline(item_text)}</li>')
            continue

        if re.match(r'^\d+\.\s+', stripped):
            if not in_ol:
                close_lists()
                out.append('<ol>')
                in_ol = True
            item_text = re.sub(r'^\d+\.\s+', '', stripped)
            out.append(f'<li>{inline(item_text)}</li>')
            continue

        close_lists()
        out.append(f'<p>{inline(stripped)}</p>')

    close_lists()
    close_table()
    if in_code and code_buf:
        out.append(f'<pre><code>{html_mod.escape(chr(10).join(code_buf))}</code></pre>')
    return '\n'.join(out)


def load_all():
    result = {}
    for f in sorted(JOURNALS_DIR.glob('*.md')):
        if f.name == 'INDEX.md':
            continue
        entries = parse_journal(f)
        if entries:
            result[f.stem] = entries
    return result


def load_macro_cache() -> dict:
    cache_dir = Path.home() / '.stock-skills' / 'cache'
    result = {}
    for fname, key in [('tradfi-macro-latest.json', 'tradfi'), ('crypto-macro-latest.json', 'crypto')]:
        path = cache_dir / fname
        if not path.exists():
            continue
        try:
            d = json.loads(path.read_text(encoding='utf-8'))
            ts = datetime.fromisoformat(d['timestamp'])
            age_h = (datetime.now() - ts).total_seconds() / 3600
            result[key] = {
                'summary': d.get('summary', ''),
                'timestamp': ts.strftime('%Y-%m-%d %H:%M'),
                'age_h': round(age_h, 1),
                'expired': age_h > d.get('ttl_hours', 8),
            }
        except Exception:
            pass
    return result


def _md_table_to_html(text: str) -> str:
    rows = []
    for line in text.split('\n'):
        line = line.strip()
        if not line.startswith('|'):
            continue
        if re.match(r'^\|[\s\-|:]+\|$', line):
            continue
        cells = [c.strip() for c in line.split('|')[1:-1]]
        if cells:
            rows.append(cells)
    if not rows:
        return ''
    html = '<table class="macro-table">'
    for i, row in enumerate(rows):
        html += '<tr>'
        for cell in row:
            cell = re.sub(r'\*\*(.+?)\*\*', r'<strong>\1</strong>', cell)
            tag = 'th' if i == 0 else 'td'
            html += f'<{tag}>{cell}</{tag}>'
        html += '</tr>'
    html += '</table>'
    return html


def build_macro_panel(macro: dict) -> str:
    configs = [('tradfi', '🏦 宏观脉搏'), ('crypto', '🌍 加密宏观')]
    cards = []
    for key, label in configs:
        if key not in macro:
            continue
        m = macro[key]
        expired_cls = ' expired' if m['expired'] else ''
        badge_cls = 'expired' if m['expired'] else 'fresh'
        badge_text = '已过期' if m['expired'] else f'{m["age_h"]}h 前'
        table_html = _md_table_to_html(m['summary'])
        if not table_html:
            continue
        cards.append(f'<div class="macro-card{expired_cls}">'
                     f'<div class="macro-card-header">'
                     f'<span class="macro-label">{label}</span>'
                     f'<span class="macro-ts">{m["timestamp"]}</span>'
                     f'<span class="macro-badge {badge_cls}">{badge_text}</span>'
                     f'</div>'
                     f'<div class="macro-content">{table_html}</div>'
                     f'</div>')
    if not cards:
        return ('<div class="macro-panel macro-empty">'
                '<span class="macro-hint">尚无宏观快照 — 运行 tradfi-macro / crypto-macro skill 后自动出现</span>'
                '</div>')
    return ('<div class="macro-panel">'
            '<div class="macro-panel-header">'
            '<span class="macro-panel-title">宏观背景</span>'
            '<span class="macro-panel-hint">tradfi-macro / crypto-macro · 自动更新</span>'
            '</div>'
            f'<div class="macro-cards">{"".join(cards)}</div>'
            '</div>')


def rating_color(r):
    return {'Overweight': '#22c55e', 'Underweight': '#f97316', 'Hold': '#eab308', '纯分析': '#60a5fa'}.get(r, '#94a3b8')

def rating_bg(r):
    return {'Overweight': 'rgba(34,197,94,0.12)', 'Underweight': 'rgba(249,115,22,0.12)', 'Hold': 'rgba(234,179,8,0.12)', '纯分析': 'rgba(96,165,250,0.12)'}.get(r, 'rgba(148,163,184,0.1)')

def review_badge(days: Optional[int]):
    if days is None: return ''
    if days < 0: return f'<span class="badge overdue">⚠ 逾期{abs(days)}d</span>'
    if days <= 14: return f'<span class="badge urgent">🔔 {days}d后</span>'
    if days <= 30: return f'<span class="badge soon">📅 {days}d后</span>'
    return f'<span class="badge normal">📅 {days}d后</span>'


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
    days_val = latest['days_to_review'] if latest['days_to_review'] is not None else 9999

    # 纯分析卡片：params 行改为显示数据快照前 3 行（价格 + 估值 + 主要指标）
    if latest['rating'] == '纯分析' and latest['snap_lines']:
        snap_rows = ''.join(f'<div class="snap-preview-row">{l}</div>' for l in latest['snap_lines'][:3])
        params_section = f'<div class="snap-preview">{snap_rows}</div>'
    else:
        params_section = f'''<div class="params">
      <div class="param"><span class="label">入场</span><span class="value">{latest["entry_price"]}</span></div>
      <div class="param"><span class="label">止损</span><span class="value stop">{latest["stop"]}</span></div>
      <div class="param"><span class="label">目标</span><span class="value target">{latest["target"]}</span></div>
      <div class="param"><span class="label">仓位</span><span class="value">{latest["position"]}</span></div>
    </div>'''

    return f'''
<div class="card" data-ticker="{ticker}" data-rating="{latest["rating"]}" data-source="{latest["source"]}" data-days="{days_val}" onclick="openModal('{ticker}')">
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
    {params_section}
    <div class="masters">{latest["masters"]}</div>
    <div class="cr-grid">
      <div class="cr-col"><div class="cr-title bull">催化</div><ul>{catalysts_html}</ul></div>
      <div class="cr-col"><div class="cr-title bear">风险</div><ul>{risks_html}</ul></div>
    </div>
  </div>
  <div class="card-footer">
    <span class="history-label">历史 {entry_count} 条</span>
    <span class="dots">{history_dots}</span>
    <span class="review-date">复盘 {review_date_str}</span>
  </div>
</div>'''


def generate_html(data: dict) -> str:
    now = datetime.now().strftime('%Y-%m-%d %H:%M')
    macro_panel_html = build_macro_panel(load_macro_cache())

    # 按最新条目日期降序
    sorted_data = sorted(data.items(), key=lambda x: x[1][0]['date'], reverse=True)

    cards_html = '\n'.join(build_card(ticker, entries) for ticker, entries in sorted_data)

    all_latest = [entries[0] for entries in data.values()]
    count_ow = sum(1 for e in all_latest if e['rating'] == 'Overweight')
    count_hold = sum(1 for e in all_latest if e['rating'] == 'Hold')
    count_uw = sum(1 for e in all_latest if e['rating'] == 'Underweight')
    count_overdue = sum(1 for e in all_latest if e['days_to_review'] is not None and e['days_to_review'] < 0)
    count_urgent = sum(1 for e in all_latest if e['days_to_review'] is not None and 0 <= e['days_to_review'] <= 14)
    total = len(data)

    # 来源过滤按钮（动态枚举实际存在的 source）
    source_counts: dict[str, int] = {}
    for entries in data.values():
        if entries:
            s = entries[0]['source']
            source_counts[s] = source_counts.get(s, 0) + 1
    source_filter_btns = '\n  '.join(
        f'<button class="filter-btn" onclick="filterSource(\'{s}\')">{s} ({c})</button>'
        for s, c in sorted(source_counts.items())
    )

    # 把全部 journal 数据序列化给 JS 用
    journal_json = json.dumps(data, ensure_ascii=False)

    # 预加载完整报告 HTML（离线 dashboard.html 也能看；serve.py 刷新时同步更新）
    docs_cache: dict[str, str] = {}
    for entries in data.values():
        for entry in entries:
            doc_path = entry.get('doc_path')
            if doc_path and doc_path not in docs_cache:
                html = load_doc_html(doc_path)
                if html:
                    docs_cache[doc_path] = html
    docs_json = json.dumps(docs_cache, ensure_ascii=False)

    return f'''<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Ticker Journal — {now}</title>
<style>
  :root {{
    --bg: #0f1117; --surface: #1a1d27; --surface2: #22263a;
    --border: #2a2d3a; --text: #e2e8f0; --muted: #64748b;
    --green: #22c55e; --red: #f97316; --yellow: #eab308; --blue: #60a5fa;
  }}
  * {{ box-sizing: border-box; margin: 0; padding: 0; }}
  body {{ background: var(--bg); color: var(--text); font-family: -apple-system, 'PingFang SC', sans-serif; font-size: 13px; overflow-x: hidden; }}

  /* ── header ── */
  .header {{ padding: 18px 24px 14px; border-bottom: 1px solid var(--border); display: flex; align-items: center; justify-content: space-between; }}
  .header h1 {{ font-size: 17px; font-weight: 600; }}
  .header-right {{ display: flex; align-items: center; gap: 12px; }}
  .header .updated {{ color: var(--muted); font-size: 12px; }}
  .refresh-btn {{ padding: 5px 12px; border-radius: 6px; border: 1px solid var(--border); background: transparent; color: var(--muted); cursor: pointer; font-size: 12px; transition: all .15s; }}
  .refresh-btn:hover {{ border-color: var(--blue); color: var(--blue); background: rgba(96,165,250,.1); }}
  .refresh-btn.spinning {{ opacity: .5; pointer-events: none; }}

  /* ── stats ── */
  .stats {{ display: flex; gap: 16px; padding: 12px 24px; border-bottom: 1px solid var(--border); flex-wrap: wrap; }}
  .stat {{ display: flex; align-items: center; gap: 6px; }}
  .stat-dot {{ width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }}
  .stat-label {{ color: var(--muted); }}
  .stat-val {{ font-weight: 600; }}

  /* ── toolbar ── */
  .toolbar {{ padding: 10px 24px; display: flex; gap: 8px; flex-wrap: wrap; border-bottom: 1px solid var(--border); }}
  .filter-btn {{ padding: 4px 12px; border-radius: 999px; border: 1px solid var(--border); background: transparent; color: var(--muted); cursor: pointer; font-size: 12px; transition: all .15s; }}
  .filter-btn:hover, .filter-btn.active {{ border-color: var(--blue); color: var(--blue); background: rgba(96,165,250,.1); }}

  /* ── grid ── */
  .grid {{ display: grid; grid-template-columns: repeat(auto-fill, minmax(310px, 1fr)); gap: 14px; padding: 18px 24px; }}
  .card {{ background: var(--surface); border-radius: 10px; overflow: hidden; border: 1px solid var(--border); cursor: pointer; transition: transform .15s, box-shadow .15s; }}
  .card:hover {{ transform: translateY(-2px); box-shadow: 0 8px 24px rgba(0,0,0,.45); border-color: #3a3d4a; }}
  .card.hidden {{ display: none; }}
  .card-header {{ padding: 11px 14px 9px; }}
  .card-title-row {{ display: flex; align-items: baseline; justify-content: space-between; margin-bottom: 3px; }}
  .ticker {{ font-size: 15px; font-weight: 700; letter-spacing: .5px; }}
  .rating-badge {{ font-size: 12px; font-weight: 600; }}
  .card-meta {{ display: flex; align-items: center; gap: 7px; flex-wrap: wrap; }}
  .source, .date {{ color: var(--muted); font-size: 11px; }}
  .badge {{ font-size: 10px; font-weight: 600; padding: 1px 5px; border-radius: 4px; }}
  .badge.overdue {{ background: rgba(239,68,68,.2); color: #f87171; }}
  .badge.urgent {{ background: rgba(234,179,8,.2); color: #fbbf24; }}
  .badge.soon {{ background: rgba(96,165,250,.15); color: #93c5fd; }}
  .badge.normal {{ background: rgba(148,163,184,.1); color: var(--muted); }}
  .card-body {{ padding: 9px 14px; }}
  .params {{ display: grid; grid-template-columns: repeat(4,1fr); gap: 5px; margin-bottom: 8px; }}
  .param {{ text-align: center; }}
  .label {{ display: block; color: var(--muted); font-size: 10px; text-transform: uppercase; letter-spacing: .4px; margin-bottom: 2px; }}
  .value {{ font-weight: 600; font-size: 12px; }}
  .value.stop {{ color: #f87171; }}
  .value.target {{ color: var(--green); }}
  .masters {{ color: var(--muted); font-size: 11px; margin-bottom: 7px; line-height: 1.5; border-top: 1px solid var(--border); padding-top: 7px; }}
  .cr-grid {{ display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }}
  .cr-title {{ font-size: 10px; font-weight: 700; letter-spacing: .4px; text-transform: uppercase; margin-bottom: 3px; }}
  .cr-title.bull {{ color: var(--green); }} .cr-title.bear {{ color: var(--red); }}
  .cr-col ul {{ padding-left: 12px; }}
  .cr-col li {{ font-size: 11px; color: var(--muted); line-height: 1.5; margin-bottom: 2px; list-style: disc; }}
  .card-footer {{ padding: 7px 14px; border-top: 1px solid var(--border); display: flex; align-items: center; justify-content: space-between; background: rgba(0,0,0,.2); }}
  .history-label, .review-date {{ color: var(--muted); font-size: 11px; }}
  .dots {{ display: flex; gap: 4px; align-items: center; }}
  .dot {{ width: 7px; height: 7px; border-radius: 50%; opacity: .8; }}

  /* ── snap preview（纯分析卡片替代 params 行） ── */
  .snap-preview {{ margin-bottom: 8px; }}
  .snap-preview-row {{ font-size: 11px; color: var(--muted); line-height: 1.6; padding: 1px 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }}

  /* ── modal overlay ── */
  .modal-overlay {{ display: none; position: fixed; inset: 0; background: rgba(0,0,0,.65); z-index: 100; backdrop-filter: blur(2px); }}
  .modal-overlay.open {{ display: flex; align-items: flex-start; justify-content: flex-end; }}

  /* ── drawer ── */
  .drawer {{ width: min(560px, 100vw); height: 100vh; background: var(--surface); border-left: 1px solid var(--border); overflow-y: auto; display: flex; flex-direction: column; animation: slideIn .2s ease; }}
  @keyframes slideIn {{ from {{ transform: translateX(100%); }} to {{ transform: translateX(0); }} }}

  .drawer-header {{ padding: 16px 20px 12px; border-bottom: 1px solid var(--border); display: flex; align-items: center; justify-content: space-between; position: sticky; top: 0; background: var(--surface); z-index: 1; }}
  .drawer-ticker {{ font-size: 20px; font-weight: 700; }}
  .drawer-close {{ background: none; border: none; color: var(--muted); font-size: 20px; cursor: pointer; padding: 2px 6px; border-radius: 4px; line-height: 1; }}
  .drawer-close:hover {{ color: var(--text); background: var(--surface2); }}

  .drawer-body {{ padding: 0; flex: 1; }}

  /* 每个 entry 区块 */
  .entry-block {{ border-bottom: 1px solid var(--border); }}
  .entry-block:last-child {{ border-bottom: none; }}

  .entry-head {{ padding: 14px 20px 10px; cursor: pointer; display: flex; align-items: center; justify-content: space-between; user-select: none; }}
  .entry-head:hover {{ background: rgba(255,255,255,.03); }}
  .entry-head-left {{ display: flex; align-items: center; gap: 10px; }}
  .entry-head-date {{ font-size: 13px; font-weight: 600; }}
  .entry-head-source {{ font-size: 11px; color: var(--muted); }}
  .entry-rating {{ font-size: 11px; font-weight: 700; }}
  .entry-chevron {{ color: var(--muted); font-size: 13px; transition: transform .2s; }}
  .entry-block.open .entry-chevron {{ transform: rotate(90deg); }}

  .entry-detail {{ display: none; padding: 0 20px 16px; }}
  .entry-block.open .entry-detail {{ display: block; }}

  .detail-section {{ margin-bottom: 12px; }}
  .detail-title {{ font-size: 10px; font-weight: 700; letter-spacing: .6px; text-transform: uppercase; color: var(--muted); margin-bottom: 6px; }}
  .decision-text {{ font-size: 12px; line-height: 1.6; color: var(--text); background: var(--surface2); padding: 8px 10px; border-radius: 6px; }}

  .snap-grid {{ display: grid; gap: 4px; }}
  .snap-row {{ font-size: 12px; color: var(--muted); line-height: 1.5; padding: 3px 0; border-bottom: 1px solid rgba(255,255,255,.04); }}
  .snap-row:last-child {{ border-bottom: none; }}

  .masters-detail {{ font-size: 12px; color: var(--muted); line-height: 1.7; }}

  .cr-detail {{ display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }}
  .cr-detail ul {{ padding-left: 14px; }}
  .cr-detail li {{ font-size: 12px; color: var(--muted); line-height: 1.6; margin-bottom: 3px; list-style: disc; }}

  .anchor-list {{ list-style: none; padding: 0; }}
  .anchor-list li {{ font-size: 12px; color: var(--muted); line-height: 1.6; padding: 4px 0; border-bottom: 1px solid rgba(255,255,255,.04); display: flex; gap: 8px; }}
  .anchor-list li:last-child {{ border-bottom: none; }}
  .anchor-num {{ color: var(--blue); font-weight: 700; flex-shrink: 0; }}

  .file-link {{ font-size: 11px; color: var(--blue); font-family: monospace; word-break: break-all; opacity: .8; }}

  /* ── 条目 Tab（快照 / 完整报告） ── */
  .entry-tabs {{ display: flex; gap: 4px; padding: 0 20px 10px; border-bottom: 1px solid var(--border); }}
  .entry-tab {{
    padding: 4px 12px; border-radius: 6px; border: 1px solid var(--border);
    background: transparent; color: var(--muted); cursor: pointer; font-size: 11px;
    transition: all .15s;
  }}
  .entry-tab:hover {{ border-color: var(--blue); color: var(--blue); }}
  .entry-tab.active {{ border-color: var(--blue); color: var(--blue); background: rgba(96,165,250,.12); }}
  .entry-tab.disabled {{ opacity: .35; cursor: not-allowed; pointer-events: none; }}
  .tab-panel {{ display: none; padding: 0 20px 16px; }}
  .tab-panel.active {{ display: block; }}

  /* ── 完整报告渲染区 ── */
  .report-body {{
    font-size: 12px; line-height: 1.7; color: var(--text);
    max-height: 60vh; overflow-y: auto; padding: 4px 0;
  }}
  .report-body h1, .report-body h2, .report-body h3, .report-body h4 {{
    margin: 14px 0 6px; font-weight: 600; color: var(--text);
  }}
  .report-body h1 {{ font-size: 16px; }}
  .report-body h2 {{ font-size: 14px; color: var(--blue); }}
  .report-body h3 {{ font-size: 13px; }}
  .report-body p {{ margin: 6px 0; color: var(--muted); }}
  .report-body ul, .report-body ol {{ padding-left: 18px; margin: 6px 0; }}
  .report-body li {{ margin: 3px 0; color: var(--muted); line-height: 1.6; }}
  .report-body strong {{ color: var(--text); }}
  .report-body code {{ background: var(--surface2); padding: 1px 4px; border-radius: 3px; font-size: 11px; }}
  .report-body pre {{ background: var(--surface2); padding: 10px; border-radius: 6px; overflow-x: auto; margin: 8px 0; }}
  .report-body pre code {{ background: none; padding: 0; }}
  .report-body hr {{ border: none; border-top: 1px solid var(--border); margin: 12px 0; }}
  .report-table {{ width: 100%; border-collapse: collapse; font-size: 11px; margin: 8px 0; }}
  .report-table th {{ color: var(--muted); font-weight: 600; text-align: left; padding: 4px 8px 4px 0; border-bottom: 1px solid var(--border); }}
  .report-table td {{ padding: 4px 8px 4px 0; color: var(--muted); border-bottom: 1px solid rgba(255,255,255,.04); vertical-align: top; }}
  .report-empty {{ font-size: 12px; color: var(--muted); padding: 16px 0; text-align: center; }}
  .report-loading {{ font-size: 12px; color: var(--muted); padding: 20px 0; text-align: center; }}

  /* ── macro panel ── */
  .macro-panel {{ border-bottom: 1px solid var(--border); padding: 14px 24px; }}
  .macro-panel.macro-empty {{ padding: 10px 24px; }}
  .macro-hint {{ font-size: 11px; color: var(--muted); }}
  .macro-panel-header {{ display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; }}
  .macro-panel-title {{ font-size: 13px; font-weight: 600; }}
  .macro-panel-hint {{ font-size: 11px; color: var(--muted); }}
  .macro-cards {{ display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }}
  .macro-card {{ background: var(--surface); border: 1px solid var(--border); border-radius: 8px; overflow: hidden; }}
  .macro-card.expired {{ opacity: .55; }}
  .macro-card-header {{ padding: 7px 12px; display: flex; align-items: center; gap: 8px; border-bottom: 1px solid var(--border); background: var(--surface2); }}
  .macro-label {{ font-size: 12px; font-weight: 600; }}
  .macro-ts {{ font-size: 11px; color: var(--muted); margin-left: auto; }}
  .macro-badge {{ font-size: 10px; font-weight: 600; padding: 1px 6px; border-radius: 4px; }}
  .macro-badge.fresh {{ background: rgba(34,197,94,.15); color: #4ade80; }}
  .macro-badge.expired {{ background: rgba(248,113,113,.15); color: #f87171; }}
  .macro-content {{ padding: 8px 12px; }}
  .macro-table {{ width: 100%; border-collapse: collapse; font-size: 11px; }}
  .macro-table th {{ color: var(--muted); font-weight: 600; text-align: left; padding: 3px 8px 3px 0; font-size: 10px; text-transform: uppercase; letter-spacing: .4px; }}
  .macro-table td {{ padding: 3px 8px 3px 0; line-height: 1.5; color: var(--text); vertical-align: top; }}
  .macro-table td:first-child {{ color: var(--muted); white-space: nowrap; width: 38%; }}
  .macro-table tr:not(:last-child) td {{ border-bottom: 1px solid rgba(255,255,255,.04); }}

  @media (max-width: 768px) {{ .macro-cards {{ grid-template-columns: 1fr; }} }}
  @media (max-width: 600px) {{
    .grid {{ grid-template-columns: 1fr; padding: 12px; }}
    .params {{ grid-template-columns: repeat(2,1fr); }}
    .drawer {{ width: 100vw; }}
  }}
</style>
</head>
<body>

<div class="header">
  <h1>📊 Ticker Journal</h1>
  <div class="header-right">
    <span class="updated">更新于 {now}</span>
    <button class="refresh-btn" onclick="refresh(this)" title="重新读取 journals 目录">↻ 刷新</button>
  </div>
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
  {source_filter_btns}
</div>

{macro_panel_html}

<div class="grid" id="grid">
{cards_html}
</div>

<!-- Modal drawer -->
<div class="modal-overlay" id="overlay" onclick="closeModal(event)">
  <div class="drawer" id="drawer">
    <div class="drawer-header">
      <span class="drawer-ticker" id="drawer-ticker"></span>
      <button class="drawer-close" onclick="closeDrawer()">✕</button>
    </div>
    <div class="drawer-body" id="drawer-body"></div>
  </div>
</div>

<script>
const JOURNAL = {journal_json};
const DOCS = {docs_json};

const RC = {{
  'Overweight':'#22c55e','Underweight':'#f97316','Hold':'#eab308','纯分析':'#60a5fa'
}};

function ratingColor(r) {{ return RC[r] || '#94a3b8'; }}

function esc(s) {{
  if (!s) return '';
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}}

function buildEntryBlock(entry, idx) {{
  const rc = ratingColor(entry.rating);
  const snapRows = (entry.snap_lines || []).map(l =>
    `<div class="snap-row">${{esc(l)}}</div>`).join('');

  const catItems = (entry.catalysts_all || []).map(c => `<li>${{esc(c)}}</li>`).join('') || '<li>—</li>';
  const riskItems = (entry.risks_all || []).map(r => `<li>${{esc(r)}}</li>`).join('') || '<li>—</li>';
  const reviewDate = entry.review_date || 'N/A';
  const hasDoc = !!entry.doc_path;
  const docLabel = entry.doc_label || '完整报告';

  const snapshotPanel = `
    <div class="detail-section">
      <div class="detail-title">决策</div>
      <div class="decision-text">${{esc(entry.decision)}}</div>
    </div>
    ${{snapRows ? `<div class="detail-section"><div class="detail-title">数据快照</div><div class="snap-grid">${{snapRows}}</div></div>` : ''}}
    <div class="detail-section">
      <div class="detail-title">大师信号</div>
      <div class="masters-detail">${{esc(entry.masters)}}</div>
    </div>
    <div class="detail-section">
      <div class="detail-title">催化 / 风险</div>
      <div class="cr-detail">
        <div><div class="cr-title bull" style="margin-bottom:6px">催化</div><ul>${{catItems}}</ul></div>
        <div><div class="cr-title bear" style="margin-bottom:6px">风险</div><ul>${{riskItems}}</ul></div>
      </div>
    </div>
    <div class="detail-section">
      <div class="detail-title">复盘锚点</div>
      <div class="masters-detail" style="color:var(--blue)">${{esc(reviewDate)}}</div>
    </div>`;

  return `
<div class="entry-block${{idx===0?' open':''}}" id="entry-${{idx}}" data-doc-path="${{esc(entry.doc_path || '')}}">
  <div class="entry-head" onclick="toggleEntry(${{idx}})">
    <div class="entry-head-left">
      <span class="entry-head-date">${{esc(entry.date)}}${{entry.time ? ' ' + esc(entry.time) : ''}}</span>
      <span class="entry-head-source">${{esc(entry.source)}}</span>
    </div>
    <div style="display:flex;align-items:center;gap:8px">
      <span class="entry-rating" style="color:${{rc}}">${{esc(entry.rating)}}</span>
      <span class="entry-chevron">▶</span>
    </div>
  </div>
  <div class="entry-detail">
    <div class="entry-tabs">
      <button class="entry-tab active" onclick="switchTab(${{idx}}, 'snapshot', event)">快照</button>
      <button class="entry-tab${{hasDoc ? '' : ' disabled'}}" onclick="switchTab(${{idx}}, 'report', event)">${{esc(docLabel)}}</button>
    </div>
    <div class="tab-panel active" id="panel-${{idx}}-snapshot">${{snapshotPanel}}</div>
    <div class="tab-panel" id="panel-${{idx}}-report">
      <div class="report-loading" id="report-load-${{idx}}" style="display:none">加载中…</div>
      <div class="report-body" id="report-body-${{idx}}">${{hasDoc ? '' : '<div class="report-empty">暂无完整报告存档<br><span style="font-size:11px;opacity:.7">新分析会通过 write.py 自动保存至 reports/</span></div>'}}</div>
    </div>
  </div>
</div>`;
}}

const docCache = {{}};

async function switchTab(idx, tab, ev) {{
  if (ev) ev.stopPropagation();
  const block = document.getElementById('entry-' + idx);
  if (!block) return;
  block.querySelectorAll('.entry-tab').forEach(t => t.classList.remove('active'));
  block.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
  const tabIdx = tab === 'snapshot' ? 0 : 1;
  block.querySelectorAll('.entry-tab')[tabIdx]?.classList.add('active');
  document.getElementById('panel-' + idx + '-' + tab)?.classList.add('active');

  if (tab === 'report') {{
    const docPath = block.dataset.docPath;
    const bodyEl = document.getElementById('report-body-' + idx);
    const loadEl = document.getElementById('report-load-' + idx);
    if (!docPath || !bodyEl) return;
    if (DOCS[docPath]) {{
      bodyEl.innerHTML = DOCS[docPath];
      docCache[docPath] = DOCS[docPath];
      return;
    }}
    if (docCache[docPath]) {{
      bodyEl.innerHTML = docCache[docPath];
      return;
    }}
    loadEl.style.display = 'block';
    bodyEl.innerHTML = '';
    try {{
      const resp = await fetch('/api/doc?path=' + encodeURIComponent(docPath));
      if (!resp.ok) throw new Error('HTTP ' + resp.status);
      const data = await resp.json();
      docCache[docPath] = data.html;
      bodyEl.innerHTML = data.html;
    }} catch (e) {{
      bodyEl.innerHTML = '<div class="report-empty">加载失败：' + esc(String(e)) + '<br><span style="font-size:11px;opacity:.7">' + esc(docPath) + '</span></div>';
    }} finally {{
      loadEl.style.display = 'none';
    }}
  }}
}}

function openModal(ticker) {{
  const entries = JOURNAL[ticker];
  if (!entries) return;

  document.getElementById('drawer-ticker').textContent = ticker;
  document.getElementById('drawer-body').innerHTML =
    entries.map((e, i) => buildEntryBlock(e, i)).join('');

  document.getElementById('overlay').classList.add('open');
  document.body.style.overflow = 'hidden';
}}

function closeDrawer() {{
  document.getElementById('overlay').classList.remove('open');
  document.body.style.overflow = '';
}}

function closeModal(e) {{
  if (e.target === document.getElementById('overlay')) closeDrawer();
}}

function toggleEntry(idx) {{
  document.getElementById('entry-' + idx).classList.toggle('open');
}}

document.addEventListener('keydown', e => {{ if (e.key === 'Escape') closeDrawer(); }});

// 卡片过滤
function filterAll() {{
  document.querySelectorAll('.card').forEach(c => c.classList.remove('hidden'));
  setActive(0);
}}
function filterRating(r) {{
  document.querySelectorAll('.card').forEach(c =>
    c.classList.toggle('hidden', c.dataset.rating !== r));
  setActive(null);
}}
function filterUrgent() {{
  document.querySelectorAll('.card').forEach(c => {{
    const d = parseInt(c.dataset.days);
    c.classList.toggle('hidden', d >= 15 || isNaN(d));
  }});
  setActive(null);
}}
function filterSource(s) {{
  document.querySelectorAll('.card').forEach(c =>
    c.classList.toggle('hidden', c.dataset.source !== s));
  setActive(null);
}}
function setActive(idx) {{
  document.querySelectorAll('.filter-btn').forEach((b, i) =>
    b.classList.toggle('active', i === idx));
}}
document.querySelectorAll('.filter-btn').forEach((btn, i) =>
  btn.addEventListener('click', () => setActive(i)));

function refresh(btn) {{
  btn.classList.add('spinning');
  btn.textContent = '↻ 加载中…';
  location.reload();
}}
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
