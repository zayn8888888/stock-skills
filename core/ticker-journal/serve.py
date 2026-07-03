#!/usr/bin/env python3
"""
Ticker Journal 本地服务器。
用法：python3 ${CLAUDE_SKILLS_DIR:-$HOME/.claude/skills}/ticker-journal/serve.py
访问：http://localhost:7788
每次刷新页面都会重新读取 journals 目录，无需手动 generate。
"""
import json
import sys
import webbrowser
from http.server import HTTPServer, BaseHTTPRequestHandler
from socketserver import ThreadingMixIn
from pathlib import Path
from urllib.parse import parse_qs, urlparse

sys.path.insert(0, str(Path(__file__).parent))
from generate import load_all, generate_html, load_doc_html, is_allowed_doc

PORT = 7788


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path

        if path in ('/', '/index.html', '/dashboard'):
            self._serve_dashboard()
        elif path == '/api/doc':
            self._serve_doc(parse_qs(parsed.query))
        else:
            self.send_response(404)
            self.end_headers()

    def _serve_dashboard(self):
        try:
            data = load_all()
            html = generate_html(data)
            body = html.encode('utf-8')
            self.send_response(200)
            self.send_header('Content-Type', 'text/html; charset=utf-8')
            self.send_header('Content-Length', str(len(body)))
            self.end_headers()
            self.wfile.write(body)
        except Exception as e:
            err = f'<pre>Error: {e}</pre>'.encode()
            self.send_response(500)
            self.send_header('Content-Type', 'text/html; charset=utf-8')
            self.end_headers()
            self.wfile.write(err)

    def _serve_doc(self, query: dict):
        paths = query.get('path', [])
        if not paths:
            self._json_response(400, {'error': 'missing path'})
            return

        doc_path = Path(paths[0])
        if not doc_path.exists():
            self._json_response(404, {'error': 'file not found'})
            return
        if not is_allowed_doc(doc_path):
            self._json_response(403, {'error': 'path not allowed'})
            return

        html = load_doc_html(str(doc_path))
        if html is None:
            self._json_response(500, {'error': 'read failed'})
            return

        content = doc_path.read_text(encoding='utf-8')
        self._json_response(200, {
            'path': str(doc_path),
            'html': html,
            'content': content,
        })

    def _json_response(self, status: int, data: dict):
        body = json.dumps(data, ensure_ascii=False).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, fmt, *args):
        if args and str(args[0]).startswith('GET /'):
            print(f'  {args[1]}  {args[0]}')


class ThreadedHTTPServer(ThreadingMixIn, HTTPServer):
    pass


if __name__ == '__main__':
    server = ThreadedHTTPServer(('127.0.0.1', PORT), Handler)
    url = f'http://localhost:{PORT}'
    print(f'✅ Ticker Journal 已启动：{url}')
    print(f'   每次刷新页面自动重新读取 journals/ + reports/')
    print(f'   详情抽屉支持「快照 / 完整报告」Tab 切换')
    print(f'   Ctrl+C 停止\n')
    webbrowser.open(url)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print('\n已停止。')
