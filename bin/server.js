const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 8000;
const SOURCE_DIR = path.join(__dirname, '..', 'source');

const MIME_TYPES = {
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'application/javascript',
    '.json': 'application/json',
    '.png': 'image/png',
    '.wav': 'audio/wav',
    '.webm': 'audio/webm',
    '.ico': 'image/x-icon'
};

const server = http.createServer((req, res) => {
    // クエリパラメータを無視してファイルの安全なパスを解決
    let filePath = path.join(SOURCE_DIR, req.url.split('?')[0]);
    if (filePath === SOURCE_DIR || filePath.endsWith('/')) {
        filePath = path.join(filePath, 'index.html');
    }

    // ディレクトリトラバーサル防止チェック
    const relative = path.relative(SOURCE_DIR, filePath);
    const isSafe = relative && !relative.startsWith('..') && !path.isAbsolute(relative);
    if (!isSafe && filePath !== path.join(SOURCE_DIR, 'index.html')) {
        res.statusCode = 403;
        res.setHeader('Content-Type', 'text/plain');
        res.end('Forbidden');
        return;
    }

    fs.readFile(filePath, (err, data) => {
        if (err) {
            if (err.code === 'ENOENT') {
                res.statusCode = 404;
                res.setHeader('Content-Type', 'text/plain');
                res.end('Not Found');
            } else {
                res.statusCode = 500;
                res.setHeader('Content-Type', 'text/plain');
                res.end('Internal Server Error');
            }
            return;
        }

        const ext = path.extname(filePath).toLowerCase();
        const contentType = MIME_TYPES[ext] || 'application/octet-stream';

        // SharedArrayBuffer (ffmpeg.wasm) に必要な COOP / COEP ヘッダーを付与
        res.setHeader('Content-Type', contentType);
        res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
        res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
        res.setHeader('Access-Control-Allow-Origin', '*');
        
        res.end(data);
    });
});

console.log(`=============================================`);
console.log(`  Voice Beats ローカルサーバーを起動しています`);
console.log(`  公開ディレクトリ: ${SOURCE_DIR}`);
console.log(`  URL: http://localhost:${PORT}`);
console.log(`=============================================`);

server.listen(PORT, () => {
    // 起動成功
});
