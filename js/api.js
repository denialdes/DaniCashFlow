/** Klien API. Token sesi hanya disimpan di memori (hilang saat tab ditutup). */
const Api = (() => {
  let token = null;
  let onAuthLost = () => {};

  class ApiError extends Error {
    constructor(code, message) { super(message); this.code = code; }
  }

  async function call(action, payload) {
    if (!token && action !== 'auth.login') throw new ApiError('AUTH', 'Silakan masuk terlebih dahulu.');
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 60000);
    let res;
    try {
      // text/plain = "simple request": tidak memicu preflight CORS yang tidak didukung Apps Script
      res = await fetch(APP_CONFIG.API_URL, { method: 'POST', body: JSON.stringify({ token, action, payload: payload || {} }), signal: ctl.signal, redirect: 'follow' });
    } catch (e) {
      throw new ApiError('NETWORK', e.name === 'AbortError' ? 'Server terlalu lama merespons. Coba lagi.' : 'Tidak dapat terhubung ke server. Periksa koneksi internet Anda.');
    } finally {
      clearTimeout(timer);
    }
    let json;
    try { json = await res.json(); } catch (e) { throw new ApiError('SERVER', 'Respons server tidak dapat dibaca. Pastikan URL Web App benar dan sudah di-deploy ulang.'); }
    if (!json.ok) {
      if (json.error.code === 'AUTH') { token = null; onAuthLost(json.error.message); }
      throw new ApiError(json.error.code, json.error.message);
    }
    return json.data;
  }

  /** Masuk dengan username+password; token sesi disimpan di memori. Mengembalikan {token, expiresAt (detik)}. */
  async function login(username, password) {
    const d = await call('auth.login', { username, password });
    token = d.token;
    return d;
  }

  return { ApiError, call, login, setToken: (t) => { token = t; }, hasToken: () => !!token, onAuthLost: (fn) => { onAuthLost = fn; } };
})();
