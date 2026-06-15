const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const path = require('path');

const app = express();
const PORT = 3000;

app.use(express.static(path.join(__dirname, 'public')));

app.use('/api', createProxyMiddleware({
  target: 'http://127.0.0.1:4987',
  changeOrigin: true
}));

app.listen(PORT, () => {
  console.log(`Frontend running on http://127.0.0.1:${PORT}`);
});
