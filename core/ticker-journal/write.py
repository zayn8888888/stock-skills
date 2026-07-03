#!/usr/bin/env python3
"""
ticker-journal 原子写入：追加快照区块 + 保存完整报告 + 更新 INDEX。

用法：
  python3 write.py \\
    --ticker HK-1810-小米 \\
    --source stock-analyzer \\
    --block-file /tmp/block.md \\
    --report-file /tmp/full-report.md

  # 仅快照（无完整报告时）
  python3 write.py --ticker US-FUTU --source followup --block-file /tmp/block.md

block-file 格式：不含文件头，从 `## YYYY-MM-DD HH:MM · source · rating` 开始，以 `---` 结尾。
"""
from typing import Optional, Tuple
import argparse
import re
import sys
from datetime import datetime
from pathlib import Path

JOURNALS_DIR = Path.home() / '.stock-skills' / 'journals'
REPORTS_DIR = Path.home() / '.stock-skills' / 'reports'

# 区块头：## 2026-06-04 17:36 · stock-analyzer · 纯分析
BLOCK_HEADER_RE = re.compile(
    r'^## (\d{4}-\d{2}-\d{2})(?: (\d{2}:\d{2}))? · ([^\n·]+?) · ([^\n]+)',
    re.MULTILINE,
)
# 兼容旧格式（无时间）
LEGACY_HEADER_RE = re.compile(
    r'^## (\d{4}-\d{2}-\d{2}) · ([^\n·]+?) · ([^\n]+)',
    re.MULTILINE,
)


def parse_block_header(block: str) -> Optional[Tuple[str, str, str, str]]:
    """返回 (date, time, source, rating)；time 可能为空字符串。"""
    m = BLOCK_HEADER_RE.search(block)
    if m:
        return m.group(1), m.group(2) or '', m.group(3).strip(), m.group(4).strip()
    m = LEGACY_HEADER_RE.search(block)
    if m:
        return m.group(1), '', m.group(2).strip(), m.group(3).strip()
    return None


def block_key(date: str, time: str, source: str) -> str:
    return f'{date}|{time}|{source}'


def extract_existing_keys(text: str) -> set[str]:
    keys: set[str] = set()
    for block in re.split(r'\n(?=## \d{4}-\d{2}-\d{2})', text):
        parsed = parse_block_header(block)
        if parsed:
            d, t, src, _ = parsed
            keys.add(block_key(d, t, src))
    return keys


def count_blocks(text: str) -> int:
    return len(re.findall(r'^## \d{4}-\d{2}-\d{2}', text, re.MULTILINE))


def ensure_block_format(block: str) -> str:
    block = block.strip()
    if not block.startswith('## '):
        raise ValueError('block 必须以 ## YYYY-MM-DD 开头')
    if not block.endswith('---'):
        if block.endswith('\n---'):
            pass
        else:
            block = block.rstrip() + '\n\n---'
    return '\n\n' + block + '\n'


def save_report(ticker: str, source: str, date: str, time: str, content: str) -> Path:
    """保存完整报告，返回文件路径。"""
    REPORTS_DIR.mkdir(parents=True, exist_ok=True)
    ticker_dir = REPORTS_DIR / ticker
    ticker_dir.mkdir(parents=True, exist_ok=True)
    time_slug = time.replace(':', '') if time else '0000'
    fname = f'{date}-{time_slug}-{source}.md'
    path = ticker_dir / fname
    path.write_text(content.strip() + '\n', encoding='utf-8')
    return path


def inject_report_link(block: str, report_path: Path) -> str:
    """在区块中注入 **关联报告** 行（若尚未存在）。"""
    link_line = f'**关联报告**：`{report_path}`'
    if '**关联报告**' in block:
        return block
    # 插在 --- 之前
    if block.rstrip().endswith('---'):
        body = block.rstrip()[:-3].rstrip()
        return body + '\n' + link_line + '\n\n---'
    return block + '\n' + link_line + '\n\n---'


def update_index(ticker: str, date: str, source: str, rating: str, count: int) -> None:
    index_path = JOURNALS_DIR / 'INDEX.md'
    line = f'- [{ticker}]({ticker}.md) — 最近：{date} {source} {rating}，共 {count} 条记录'

    if not index_path.exists():
        index_path.write_text(f'# Ticker Journal 索引\n\n{line}\n', encoding='utf-8')
        return

    text = index_path.read_text(encoding='utf-8')
    pattern = re.compile(rf'^- \[{re.escape(ticker)}\]\([^\)]+\)[^\n]*$', re.MULTILINE)
    if pattern.search(text):
        text = pattern.sub(line, text)
    else:
        if not text.endswith('\n'):
            text += '\n'
        text += line + '\n'
    index_path.write_text(text, encoding='utf-8')


def append_journal(ticker: str, block: str, force: bool = False) -> Tuple[str, int]:
    """
    追加区块到 journal 文件。
    返回 (action, total_count)：action 为 'appended' | 'skipped' | 'created'
    """
    JOURNALS_DIR.mkdir(parents=True, exist_ok=True)
    journal_path = JOURNALS_DIR / f'{ticker}.md'

    parsed = parse_block_header(block)
    if not parsed:
        raise ValueError('无法解析 block 头部，格式应为：## YYYY-MM-DD HH:MM · source · rating')

    date, time, source, rating = parsed
    key = block_key(date, time, source)

    if journal_path.exists():
        existing = journal_path.read_text(encoding='utf-8')
        existing_keys = extract_existing_keys(existing)
        if key in existing_keys and not force:
            count = count_blocks(existing)
            print(f'⏭ 跳过重复条目：{ticker} / {date} {time} / {source}（共 {count} 条）')
            return 'skipped', count
        new_content = existing.rstrip() + ensure_block_format(block)
        journal_path.write_text(new_content + '\n', encoding='utf-8')
        count = count_blocks(new_content)
        print(f'✅ 追加条目：{ticker} / {date} {time} / {source}（共 {count} 条）')
        return 'appended', count

    header = f'# {ticker} 标的档案\n'
    content = header + ensure_block_format(block) + '\n'
    journal_path.write_text(content, encoding='utf-8')
    print(f'✅ 新建档案：{ticker} / {date} {time} / {source}')
    return 'created', 1


def main() -> int:
    parser = argparse.ArgumentParser(description='ticker-journal 原子写入')
    parser.add_argument('--ticker', required=True, help='CANONICAL_TICKER，如 HK-1810-小米')
    parser.add_argument('--source', required=True, help='来源 skill，如 stock-analyzer')
    parser.add_argument('--block-file', required=True, help='快照区块 markdown 文件路径')
    parser.add_argument('--report-file', help='完整报告 markdown 文件路径（可选但推荐）')
    parser.add_argument('--force', action='store_true', help='强制写入，跳过重复检测')
    args = parser.parse_args()

    block_path = Path(args.block_file)
    if not block_path.exists():
        print(f'❌ block-file 不存在：{block_path}', file=sys.stderr)
        return 1

    block = block_path.read_text(encoding='utf-8').strip()
    parsed = parse_block_header(block)
    if not parsed:
        print('❌ block 头部格式错误', file=sys.stderr)
        return 1
    date, time, source, rating = parsed

    # source 一致性校验
    if source != args.source:
        print(f'⚠️ block 内 source={source} 与 --source={args.source} 不一致，以 block 为准')

    # 保存完整报告
    if args.report_file:
        report_path = Path(args.report_file)
        if not report_path.exists():
            print(f'❌ report-file 不存在：{report_path}', file=sys.stderr)
            return 1
        report_content = report_path.read_text(encoding='utf-8')
        saved = save_report(args.ticker, source, date, time, report_content)
        block = inject_report_link(block, saved)
        print(f'📄 完整报告已保存：{saved}')

    action, count = append_journal(args.ticker, block, force=args.force)

    if action != 'skipped':
        update_index(args.ticker, date, source, rating, count)

    return 0


if __name__ == '__main__':
    sys.exit(main())
