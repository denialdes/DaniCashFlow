// Dipisah dari index.html agar CSP tidak perlu 'unsafe-inline' untuk skrip.
// Anti-clickjacking: halaman keuangan tidak boleh ditanam di frame situs lain (meta CSP tidak mendukung frame-ancestors).
if (window.top !== window.self) {
  document.body.textContent = 'Halaman ini tidak dapat ditampilkan di dalam frame. Buka langsung di tab/aplikasi.';
} else {
  App.start();
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    navigator.serviceWorker.register('sw.js').catch(() => {}); // opsional: hanya mempercepat muat & memungkinkan "Pasang aplikasi"
  }
}
