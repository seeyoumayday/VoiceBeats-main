# 使い方
npm install express

が必要です。

node server.js

により

http://127.0.0.1:8000/
http://localhost:8000/

でアクセスできます。

## 注意

server.jsが

app.use((req, res, next) => {
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
    next();
});

に設定されていることを確認してください。
