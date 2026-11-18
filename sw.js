/* Service worker minimal: hanya menyimpan berkas statis aplikasi (cangkang). TIDAK pernah menyentuh permintaan lintas-origin
   (API Apps Script), sehingga data keuangan & token tidak pernah masuk cache. Network-first: pembaruan langsung terpakai. */
const CACHE = 'kk-shell-v1';
const SHELL = ['./', 'index.html', 'css/styles.css', 'js/config.js', 'js/api.js', 'js/ui.js', 'js/charts.js', 'js/app.js', 'js/pages-a.js', 'js/pages-b.js', 'js/boot.js', 'manifest.webmanifest', 'icons/icon.svg'];

self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const r = e.request;
  if (r.method !== 'GET' || new URL(r.url).origin !== self.location.origin) return;
  e.respondWith(fetch(r).then((res) => { if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(r, copy)); } return res; }).catch(() => caches.match(r).then((m) => m || caches.match('index.html'))));
});
