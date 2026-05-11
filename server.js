const express = require('express');
const path = require('path');
const app = express();

// ヘッダーを設定するミドルウェア
app.use((req, res, next) => {
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
    next();
});

// 静的ファイルの提供
app.use(express.static(path.join(__dirname, 'public')));

// ルートハンドラ
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

/*
// about.html用のヘッダーを設定するミドルウェア
app.get('/about', (req, res, next) => {
    res.setHeader('Cross-Origin-Opener-Policy', 'require-corp');
    res.setHeader('Cross-Origin-Embedder-Policy', 'cross-origin');
    next();
}, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'about.html'));
});
*/

app.get('/howto', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'howto.html'));
});

app.get('/update', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'update.html'));
});

let port = process.env.PORT;
if (port == null || port == "") {
  port = 8000;
}
app.listen(port);

/*
app.listen(8000, () => {
    console.log('Server is running on http://localhost:8000');
});
*/