#!/usr/bin/env python3
"""
Ticker Journal 本地服务器。
用法：python3 ${CLAUDE_SKILLS_DIR:-$HOME/.claude/skills}/ticker-journal/serve.py
访问：http://localhost:7788
每次刷新页面都会重新读取 journals 目录，无需手动 generate。
"""
import sys
import webbrowser
from http.server import HTTPServer, BaseHTTPRequestHandler
from socketserver import ThreadingMixIn
from pathlib import Path

# 数据目录由 generate.py 的 JOURNALS_DIR 决定（~/.stock-skills/journals/），
# load_all() 和 generate_html() 均来自 generate.py，本文件不直接读数据。
sys.path.insert(0, str(Path(__file__).parent))
from generate import load_all, generate_html

PORT = 7788


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path in ('/', '/index.html', '/dashboard'):
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
        else:
            self.send_response(404)
            self.end_headers()

    def log_message(self, fmt, *args):
        # 只打印非刷新请求，减少噪音
        if args and str(args[0]).startswith('GET /'):
            print(f'  {args[1]}  {args[0]}')


class ThreadedHTTPServer(ThreadingMixIn, HTTPServer):
    pass


if __name__ == '__main__':
    server = ThreadedHTTPServer(('127.0.0.1', PORT), Handler)
    url = f'http://localhost:{PORT}'
    print(f'✅ Ticker Journal 已启动：{url}')
    print(f'   每次刷新页面自动重新读取 journals/')
    print(f'   Ctrl+C 停止\n')
    webbrowser.open(url)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print('\n已停止。')
