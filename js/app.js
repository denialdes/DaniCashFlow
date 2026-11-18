/** Shell aplikasi: login username+password, routing hash, navigasi, state. */
const App = (() => {
  const { el, icon } = UI;
  const ROUTES = [
    { id: 'dashboard', label: 'Dashboard', icon: 'home', fn: () => PagesA.dashboard },
    { group: 'Transaksi' },
    { id: 'pemasukan', label: 'Pemasukan', icon: 'income', fn: () => PagesA.pemasukan },
    { id: 'pengeluaran', label: 'Pengeluaran', icon: 'expense', fn: () => PagesA.pengeluaran },
    { id: 'transfer', label: 'Transfer', icon: 'transfer', fn: () => PagesA.transfer },
    { group: 'Kelola' },
    { id: 'rekening', label: 'Rekening & dompet', icon: 'wallet', fn: () => PagesA.rekening },
    { id: 'anggaran', label: 'Anggaran', icon: 'budget', fn: () => PagesB.anggaran },
    { id: 'tabungan', label: 'Tabungan & target', icon: 'savings', fn: () => PagesB.tabungan },
    { id: 'darurat', label: 'Dana darurat', icon: 'shield', fn: () => PagesB.darurat },
    { id: 'utang', label: 'Utang & cicilan', icon: 'debt', fn: () => PagesB.utang },
    { group: 'Analisis' },
    { id: 'laporan', label: 'Laporan', icon: 'chart', fn: () => PagesB.laporan },
    { group: 'Administrasi', admin: true },
    { id: 'anggota', label: 'Anggota & hak akses', icon: 'users', admin: true, fn: () => PagesB.anggota },
    { id: 'pengaturan', label: 'Pengaturan', icon: 'settings', admin: true, fn: () => PagesB.pengaturan },
  ];
  const app = { boot: null, state: {}, current: 'dashboard' };
  let root, sidebar, scrim, expiryTimer;
  const visible = () => ROUTES.filter((r) => !r.admin || app.isAdmin());

  app.isAdmin = () => !!app.boot && app.boot.user.role === 'Admin';
  app.go = (id) => { if (location.hash.slice(1) === id) app.render(); else location.hash = id; };

  /** Baca: jalankan, tampilkan galat jika gagal. */
  app.read = (action, payload) => Api.call(action, payload);
  /** Tulis: server mengembalikan {result, boot}; boot diterapkan lalu halaman digambar ulang. */
  app.write = async (action, payload) => {
    UI.Busy.on();
    try {
      const d = await Api.call(action, payload);
      if (d.boot) { app.boot = d.boot; app.render(); }
      return d;
    } finally { UI.Busy.off(); }
  };
  app.exportReport = async (payload) => (await Api.call('report.export', payload)).result;

  app.render = () => {
    const routes = visible();
    const id = location.hash.slice(1) || 'dashboard';
    const route = routes.find((r) => r.id === id) || routes[0];
    app.current = route.id;
    const top = document.getElementById('app-root');
    if (!top) return;
    document.title = `${route.label} · ${app.boot.settings.familyName}`;
    document.getElementById('fam-name').textContent = app.boot.settings.familyName;
    document.getElementById('top-title').textContent = route.label;
    document.querySelectorAll('a[data-r]').forEach((a) => (a.dataset.r === route.id ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current')));
    const main = document.getElementById('content');
    main.replaceChildren();
    try { route.fn()(main); } catch (e) { console.error(e); main.append(el('div', { class: 'callout error', role: 'alert', text: 'Halaman gagal ditampilkan. Muat ulang atau hubungi admin.' })); }
  };

  function buildShell() {
    const b = app.boot;
    root.replaceChildren();
    const nav = el('ul', { class: 'nav' });
    visible().forEach((r) => nav.append(r.group ? el('li', { class: 'nav-group', 'aria-hidden': 'true', text: r.group }) : el('li', null, el('a', { href: '#' + r.id, 'data-r': r.id, onclick: closeNav }, icon(r.icon), r.label))));
    sidebar = el('aside', { class: 'sidebar', id: 'sidebar', 'aria-label': 'Navigasi utama' },
      el('div', { class: 'brand' }, el('span', { class: 'logo' }, icon('wallet')), el('span', null, el('span', { id: 'fam-name' }), el('small', { text: 'Keuangan Keluarga' }))),
      el('nav', { 'aria-label': 'Menu' }, nav),
      el('div', { class: 'sidebar-foot' }, el('div', { class: 'who' }, el('strong', { text: b.user.name }), el('span', { class: 'muted', text: `${b.user.email} · ${b.user.role}` })),
        el('div', { style: 'display:flex;gap:8px' }, el('button', { class: 'btn sm', type: 'button', onclick: refresh, 'aria-label': 'Muat ulang data' }, 'Muat ulang'), el('button', { class: 'btn sm', type: 'button', onclick: signOut }, icon('logout'), 'Keluar'))));
    scrim = el('div', { class: 'scrim', hidden: true, onclick: closeNav });
    const bn = (id, label, ico) => el('a', { class: 'bn-item', href: '#' + id, 'data-r': id }, icon(ico), label);
    const bottom = el('nav', { class: 'bottomnav', 'aria-label': 'Navigasi cepat' },
      bn('dashboard', 'Beranda', 'home'), bn('anggaran', 'Anggaran', 'budget'),
      el('button', { class: 'bn-add', id: 'nav-add', type: 'button', 'aria-label': 'Catat transaksi', onclick: () => PagesA.quickAdd() }, icon('plus')),
      bn('laporan', 'Laporan', 'chart'),
      el('button', { class: 'bn-item', id: 'menu-btn', type: 'button', 'aria-label': 'Buka menu', 'aria-controls': 'sidebar', 'aria-expanded': 'false', onclick: openNav }, icon('menu'), 'Menu'));
    root.append(el('div', { class: 'app', id: 'app-root' }, sidebar, scrim, el('div', { class: 'main' },
      el('header', { class: 'topbar' }, el('span', { class: 'logo' }, icon('wallet')), el('div', { id: 'top-title', class: 'top-title', 'aria-hidden': 'true' })),
      el('main', { class: 'content', id: 'content', tabindex: '-1' })), bottom));
  }
  function openNav() { sidebar.classList.add('open'); scrim.hidden = false; document.getElementById('menu-btn').setAttribute('aria-expanded', 'true'); sidebar.querySelector('a').focus(); }
  function closeNav() { if (!sidebar) return; sidebar.classList.remove('open'); scrim.hidden = true; const m = document.getElementById('menu-btn'); if (m) m.setAttribute('aria-expanded', 'false'); }
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeNav(); });

  async function refresh() {
    UI.Busy.on();
    try { app.boot = await Api.call('bootstrap'); app.render(); UI.toast('Data dimuat ulang.', 'ok'); } catch (e) { UI.toast(e.message, 'error'); } finally { UI.Busy.off(); }
  }

  // ───── Login ─────
  function loginView(message, kind) {
    clearTimeout(expiryTimer); // jangan sampai timer sesi lama memutus sesi baru
    UI.closeAll(); // tutup modal yang tertinggal agar tidak menimpa halaman login
    const user = el('input', { class: 'input', id: 'lg-user', name: 'username', type: 'text', autocomplete: 'username', autocapitalize: 'none', spellcheck: 'false', maxlength: 120 });
    const pass = el('input', { class: 'input', id: 'lg-pass', name: 'password', type: 'password', autocomplete: 'current-password', maxlength: 100 });
    const msg = el('div', { class: 'callout ' + (kind || 'error'), role: 'alert', hidden: !message, text: message || '' });
    const submit = el('button', { class: 'btn primary', id: 'lg-submit', type: 'submit' }, 'Masuk');
    const form = el('form', { class: 'login-form', novalidate: true, onsubmit: async (e) => {
      e.preventDefault();
      const u = user.value.trim(), p = pass.value.trim();
      if (!u || !p) { msg.className = 'callout error'; msg.textContent = 'Username dan password wajib diisi.'; msg.hidden = false; return; }
      submit.disabled = true; msg.hidden = true;
      let session;
      try { session = await Api.login(u, p); }
      catch (err) { submit.disabled = false; pass.value = ''; msg.className = 'callout error'; msg.textContent = err.message; msg.hidden = false; pass.focus(); return; }
      await onLogin(session);
    } },
      msg,
      el('div', { class: 'field' }, el('label', { for: 'lg-user', text: 'Username' }), user),
      el('div', { class: 'field' }, el('label', { for: 'lg-pass', text: 'Password' }), pass),
      submit);
    root.replaceChildren(el('div', { class: 'login' },
      el('div', { class: 'login-art', 'aria-hidden': 'true' }, el('h2', { text: 'Keuangan keluarga, tertata dan aman.' }), el('p', { text: 'Catat pemasukan dan pengeluaran, pantau anggaran, dan capai target tabungan bersama.' })),
      el('div', { class: 'login-pane' }, el('div', { class: 'card' },
        el('div', { class: 'logo' }, icon('wallet')), el('h1', { text: 'Keuangan Keluarga' }), el('p', { class: 'muted', text: 'Masuk dengan username dan password dari admin keluarga.' }),
        form))));
    user.focus();
  }
  async function onLogin(session) {
    root.replaceChildren(el('div', { class: 'login' }, el('div', { class: 'card' }, el('div', { class: 'skeleton', style: 'height:24px;margin-bottom:12px' }), el('p', { class: 'muted', text: 'Memuat data…' }))));
    try { app.boot = await Api.call('bootstrap'); buildShell(); app.render(); scheduleExpiry(session.expiresAt); }
    catch (e) { Api.setToken(null); loginView(e.message); }
  }
  function scheduleExpiry(expSec) {
    clearTimeout(expiryTimer);
    expiryTimer = setTimeout(() => { Api.setToken(null); app.boot = null; loginView('Sesi berakhir demi keamanan. Silakan masuk lagi.', 'info'); }, Math.max(1000, expSec * 1000 - Date.now() - 20000));
  }
  function signOut() {
    Api.call('auth.logout').catch(() => {}); // cabut token di server (best-effort); tombol tetap bekerja walau gagal
    Api.setToken(null); app.boot = null; app.state = {};
    loginView();
  }

  function start() {
    root = document.getElementById('root');
    const c = window.APP_CONFIG || {};
    if (!c.API_URL || /^GANTI/.test(c.API_URL)) {
      root.replaceChildren(el('div', { class: 'login' }, el('div', { class: 'card' }, el('div', { class: 'logo' }, icon('alert')), el('h1', { text: 'Konfigurasi belum lengkap' }), el('div', { class: 'callout', text: 'Isi API_URL di js/config.js sesuai panduan instalasi (README).' }))));
      return;
    }
    Api.onAuthLost((m) => { app.boot = null; loginView(m, 'info'); });
    window.addEventListener('hashchange', () => { if (app.boot) { closeNav(); app.render(); document.getElementById('content').focus(); } });
    loginView();
  }
  app.start = start;
  return app;
})();
