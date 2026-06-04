#!/usr/bin/env python3
"""
Ticker Journal 本地服务器。
用法：python3 ~/.stock-skills/journals/serve.py
访问：http://localhost:7788
每次刷新页面都会重新读取 journals 目录，无需手动 generate。
"""
import sys
import webbrowser
from http.server import HTTPServer, BaseHTTPRequestHandler
from pathlib import Path

# 把 journals 目录加入 path，直接复用 generate.py 的解析逻辑
JOURNALS_DIR = Path(__file__).parent
sys.path.insert(0, str(JOURNALS_DIR))
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


if __name__ == '__main__':
    server = HTTPServer(('127.0.0.1', PORT), Handler)
    url = f'http://localhost:{PORT}'
    print(f'✅ Ticker Journal 已启动：{url}')
    print(f'   每次刷新页面自动重新读取 journals/')
    print(f'   Ctrl+C 停止\n')
    webbrowser.open(url)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print('\n已停止。')
