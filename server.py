#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
LM音乐台 服务器（纯静态文件服务）
- 仅提供静态文件，无任何写入接口
- API 地址、音频质量等由管理员直接编辑 config.json 配置
用法: python3 server.py [端口]   (默认 8080)
"""
import http.server
import os
import sys

ROOT = os.path.dirname(os.path.abspath(__file__))
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8080


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def log_message(self, fmt, *args):
        sys.stderr.write('[%s] %s\n' % (self.log_date_time_string(), fmt % args))


if __name__ == '__main__':
    print('LM音乐台服务已启动: http://0.0.0.0:%d  (目录: %s)' % (PORT, ROOT), flush=True)
    http.server.ThreadingHTTPServer(('0.0.0.0', PORT), Handler).serve_forever()