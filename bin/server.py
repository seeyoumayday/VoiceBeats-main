import http.server
import socketserver
import os
import sys

PORT = 8000
# プロジェクトルートの source ディレクトリの絶対パスを取得
BIN_DIR = os.path.dirname(os.path.abspath(__file__))
SOURCE_DIR = os.path.join(os.path.dirname(BIN_DIR), 'source')

class CoiHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        # http.server にルートディレクトリを指定
        super().__init__(*args, directory=SOURCE_DIR, **kwargs)

    def end_headers(self):
        # SharedArrayBuffer (ffmpeg.wasm) に必要な COOP / COEP ヘッダーを付与
        self.send_header('Cross-Origin-Opener-Policy', 'same-origin')
        self.send_header('Cross-Origin-Embedder-Policy', 'require-corp')
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate')
        super().end_headers()

# Windows等のOSで.jsファイルのMIMEタイプが正しく判定されない問題への対策
CoiHandler.extensions_map.update({
    '.js': 'application/javascript',
    '.css': 'text/css',
    '.html': 'text/html',
    '.wav': 'audio/wav',
    '.webm': 'audio/webm',
    '.png': 'image/png',
    '.json': 'application/json',
    '.ico': 'image/x-icon'
})

def main():
    print(f"=============================================")
    print(f"  Voice Beats ローカルサーバーを起動しています")
    print(f"  公開ディレクトリ: {SOURCE_DIR}")
    print(f"  URL: http://localhost:{PORT}")
    print(f"=============================================")
    
    # 念のためカレントディレクトリを移動して起動
    os.chdir(SOURCE_DIR)
    
    # ポートの競合対策を有効にするため、allow_reuse_address を指定
    socketserver.TCPServer.allow_reuse_address = True
    try:
        with socketserver.TCPServer(("", PORT), CoiHandler) as httpd:
            httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nサーバーを停止しました。")
        sys.exit(0)
    except Exception as e:
        print(f"\nエラーが発生しました: {e}")
        sys.exit(1)

if __name__ == '__main__':
    main()
