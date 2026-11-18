// Membuat ikon PNG dari frontend/icons/icon.svg (butuh Playwright). Jalankan: node tools/make-icons.js
const { chromium } = require('playwright'); const fs = require('fs'), path = require('path');
const dir = path.join(__dirname, '..', 'frontend', 'icons');
const svg = fs.readFileSync(path.join(dir, 'icon.svg'), 'utf8');
const maskable = svg.replace(/<rect[^>]*\/>/, '<rect width="512" height="512" fill="#1e40af"/>').replace('translate(112 112) scale(12.33)', 'translate(150 150) scale(8.5)');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage();
  for (const [name, size, src] of [['icon-192.png', 192, svg], ['icon-512.png', 512, svg], ['icon-maskable-512.png', 512, maskable], ['apple-touch-icon.png', 180, maskable]]) {
    await p.setViewportSize({ width: size, height: size });
    await p.setContent(`<body style="margin:0"><img src="data:image/svg+xml;base64,${Buffer.from(src).toString('base64')}" width="${size}" height="${size}"></body>`);
    await p.screenshot({ path: path.join(dir, name), omitBackground: true });
  }
  await b.close();
})();
