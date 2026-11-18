/** E2E: Chromium + frontend asli + backend .gs asli (di tiruan Google Apps Script). Jalankan: node tests/e2e.js [folder-screenshot] */
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const assert = require('node:assert/strict');
const { create } = require('./gas-mock');

const FRONT = path.join(__dirname, '..', 'frontend');
const SHOTS = process.argv[2];
const API = 'https://script.google.com/macros/s/TEST/exec';
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };

(async () => {
  const m = create(); m.g.setupDatabase(); m.guardWrites = true;
  const ADMIN = { u: 'owner@gmail.com', p: 'rahasia-admin-1' }, MEMBER = { u: 'siti@gmail.com', p: 'rahasia123' };
  m.g.resetPassword(ADMIN.u, ADMIN.p);
  m.call(m.addToken('admin', ADMIN.u), 'user.save', { name: 'Siti', email: MEMBER.u, password: MEMBER.p, role: 'Anggota' });
  const apiCalls = [];

  const srv = http.createServer((req, res) => {
    const f = path.join(FRONT, req.url === '/' ? 'index.html' : decodeURIComponent(req.url.split('?')[0]));
    if (!f.startsWith(FRONT) || !fs.existsSync(f)) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'text/plain' }); res.end(fs.readFileSync(f));
  }).listen(0);
  const base = 'http://localhost:' + srv.address().port;

  const browser = await chromium.launch();
  const errors = [];
  async function newPage(creds, viewport, extra) {
    const ctx = await browser.newContext(Object.assign({ viewport, acceptDownloads: true, locale: 'id-ID', timezoneId: 'Asia/Jakarta' }, extra || {}));
    await ctx.clock.setFixedTime(m.clock); // jam browser = jam tiruan backend (token JWT berisi exp relatif jam itu)
    const page = await ctx.newPage(); global.lastPage = page; page.creds = creds;
    page.on('console', (x) => { if (x.type() === 'error' && !/Failed to load resource/.test(x.text())) errors.push(x.text()); });
    page.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message));
    await page.route('**/*', async (route) => {
      const u = route.request().url();
      if (u === base + '/__frame') return route.fulfill({ contentType: 'text/html', body: `<iframe src="${base}/" width="600" height="400"></iframe>` });
      if (u === base + '/js/config.js') return route.fulfill({ contentType: 'text/javascript', body: `window.APP_CONFIG={API_URL:${JSON.stringify(API)}};` });
      if (u.startsWith(API)) {
        const body = route.request().postData();
        try { const j = JSON.parse(body); apiCalls.push(j.action); } catch (e) {}
        const out = m.call(null, null, null, body);
        return route.fulfill({ contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(out) });
      }
      if (u.startsWith('https://fonts.')) return route.fulfill({ contentType: 'text/css', body: '' });
      if (u.startsWith(base)) return route.continue();
      return route.abort();
    });
    return page;
  }
  const shot = async (page, name) => { if (SHOTS) await page.screenshot({ path: path.join(SHOTS, name + '.png'), fullPage: true }); };
  const overflow = (page) => page.evaluate(() => {
    const w = document.documentElement.clientWidth, d = document.documentElement.scrollWidth - w;
    return d;
  });
  const signIn = async (page) => { m.clock = new Date(+m.clock + 11 * 60e3); /* jendela batas login 10 menit: banyak login admin berturut-turut tidak boleh saling menahan */ await page.fill('#lg-user', page.creds.u); await page.fill('#lg-pass', page.creds.p); await page.click('#lg-submit'); };
  const login = async (page) => { await page.goto(base); await signIn(page); await page.waitForSelector('#content h1, .callout'); };
  const fillMoney = async (page, label, v) => page.getByLabel(label).fill(String(v));

  // ───── Admin, desktop ─────
    let p = await newPage(ADMIN, { width: 1366, height: 800 });
  await p.goto(base);
  await p.waitForSelector('#lg-user');
  await shot(p, '01-login');
  await signIn(p);
  await p.waitForSelector('.hero');
  assert.match(await p.textContent('.kpi.primary .value'), /Rp 0/);
  assert.ok(await p.isVisible('text=Selamat datang'), 'empty state untuk keluarga baru');
  assert.equal(await p.locator('text=Contoh').count(), 0, 'tidak ada data contoh');
  assert.ok(await p.isVisible('.sidebar a[data-r="anggota"]'), 'admin melihat menu admin');

  // rekening
  await p.click('.sidebar a[data-r="rekening"]');
  await p.click('button:has-text("Tambah rekening") >> nth=0');
  await p.fill('input[name=name]', 'BCA Utama');
  await p.fill('input[name=openingBalance]', '5000000');
  assert.equal(await p.inputValue('input[name=openingBalance]'), '5.000.000', 'format ribuan otomatis');
  await p.click('button[type=submit]');
  await p.waitForSelector('td:has-text("BCA Utama")');
  await p.click('button:has-text("Tambah rekening") >> nth=0');
  await p.fill('input[name=name]', 'Dompet'); await p.selectOption('select[name=type]', 'tunai'); await p.fill('input[name=openingBalance]', '200000');
  await p.click('button[type=submit]');
  await p.waitForSelector('td:has-text("Dompet")');
  // validasi form: kosong → ringkasan galat
  await p.click('button:has-text("Tambah rekening") >> nth=0'); await p.click('button[type=submit]');
  assert.ok(await p.isVisible('.err-summary'), 'ringkasan galat tampil');
  assert.match(await p.textContent('.err'), /wajib diisi/);
  await p.keyboard.press('Escape');
  assert.equal(await p.locator('.modal').count(), 0, 'Esc menutup modal');

  // pemasukan (+XSS)
  await p.click('.sidebar a[data-r="pemasukan"]');
  await p.click('button:has-text("Tambah pemasukan") >> nth=0');
  await p.fill('input[name=amount]', '3500000');
  await p.selectOption('select[name=accountId]', { index: 1 }); await p.selectOption('select[name=categoryId]', { label: 'Gaji' });
  await p.fill('textarea[name=note]', '<img src=x onerror="window.__xss=1">gaji');
  await p.click('button[type=submit]');
  await p.waitForSelector('td:has-text("gaji")');
  assert.equal(await p.evaluate(() => window.__xss), undefined, 'XSS tidak tereksekusi');
  assert.equal(await p.locator('.tbl img').count(), 0);
  // pengeluaran
  await p.click('.sidebar a[data-r="pengeluaran"]');
  await p.click('button:has-text("Tambah pengeluaran") >> nth=0');
  await p.fill('input[name=amount]', '750000'); await p.selectOption('select[name=accountId]', { index: 1 }); await p.selectOption('select[name=categoryId]', { label: 'Listrik' });
  await p.click('button[type=submit]'); await p.waitForSelector('td:has-text("Listrik")');
  // pengeluaran melebihi saldo → ditolak oleh server, modal tetap terbuka dengan pesan
  await p.click('button:has-text("Tambah pengeluaran") >> nth=0');
  await p.fill('input[name=amount]', '99000000'); await p.selectOption('select[name=accountId]', { index: 1 }); await p.selectOption('select[name=categoryId]', { label: 'Air' });
  await p.click('button[type=submit]');
  await p.waitForSelector('.err-summary:not([hidden])');
  assert.match(await p.textContent('.err-summary'), /tidak mencukupi/);
  await p.keyboard.press('Escape');
  // transfer
  await p.click('.sidebar a[data-r="transfer"]');
  await p.click('button:has-text("Tambah transfer") >> nth=0');
  await p.fill('input[name=amount]', '1000000'); await p.selectOption('select[name=accountId]', { index: 1 }); await p.selectOption('select[name=toAccountId]', { index: 2 });
  await p.click('button[type=submit]'); await p.waitForSelector('td:has-text("→")');
  // klik ganda Simpan tidak membuat transaksi ganda
  await p.click('.sidebar a[data-r="pemasukan"]');
  await p.click('button:has-text("Tambah pemasukan") >> nth=0');
  await p.fill('input[name=amount]', '111'); await p.selectOption('select[name=accountId]', { index: 1 }); await p.selectOption('select[name=categoryId]', { label: 'Bonus' });
  await p.dblclick('button[type=submit]');
  await p.waitForSelector('.modal', { state: 'detached' });
  assert.equal(m.g.Db.all('Transactions').filter((t) => t.amount === 111).length, 1, 'klik ganda = 1 transaksi');

  // dashboard: angka konsisten dengan hitungan manual
  await p.click('.sidebar a[data-r="dashboard"]');
  await p.waitForSelector('.kpi.primary');
  const kv = await p.$$eval('.kpi .value', (x) => x.map((e) => e.textContent));
  assert.equal(kv[0], 'Rp 5.200.000'.replace('5.200.000', '7.950.111'.replace('7.950.111', '7.950.111')).replace('7.950.111', '7.950.111') === 'x' ? '' : kv[0]);
  // 5.000.000+200.000 awal + 3.500.000 + 111 − 750.000 (transfer netral) = 7.950.111
  assert.equal(kv[0], 'Rp 7.950.111'); assert.equal(kv[1], 'Rp 3.500.111'); assert.equal(kv[2], 'Rp 750.000'); assert.match(kv[3], /\+Rp 2\.750\.111/);
  await shot(p, '02-dashboard-desktop');

  // ubah & hapus transaksi
  await p.click('.sidebar a[data-r="pengeluaran"]');
  await p.click('button[aria-label="Ubah transaksi"] >> nth=0');
  await p.fill('input[name=amount]', '800000'); await p.click('button[type=submit]');
  await p.waitForSelector('td:has-text("800.000")');
  await p.click('button[aria-label="Hapus transaksi"] >> nth=0');
  assert.ok(await p.isVisible('.modal:has-text("Hapus transaksi?")'), 'modal konfirmasi');
  await p.click('.modal button:has-text("Ya, hapus")');
  await p.waitForSelector('.empty:has-text("Belum ada pengeluaran")');
  await shot(p, '03-pengeluaran-kosong');
  // pulihkan pengeluaran untuk laporan
  await p.click('button:has-text("Tambah pengeluaran") >> nth=0');
  await p.fill('input[name=amount]', '600000'); await p.selectOption('select[name=accountId]', { index: 1 }); await p.selectOption('select[name=categoryId]', { label: 'Listrik' });
  await p.click('button[type=submit]'); await p.waitForSelector('td:has-text("600.000")');
  // filter & pencarian
  await p.fill('input[type=search]', 'zzz'); await p.waitForSelector('.empty:has-text("Tidak ada transaksi yang cocok")');
  await p.fill('input[type=search]', '');

  // anggaran
  await p.click('.sidebar a[data-r="anggaran"]');
  await p.click('button:has-text("Tambah anggaran") >> nth=0');
  await p.selectOption('select[name=categoryId]', { label: 'Listrik' }); await p.fill('input[name=amount]', '700000'); await p.click('button[type=submit]');
  await p.waitForSelector('.badge:has-text("Hampir habis")');
  await shot(p, '04-anggaran');

  // tabungan + dana darurat
  await p.click('.sidebar a[data-r="tabungan"]');
  await p.click('button:has-text("Tambah target") >> nth=0');
  await p.fill('input[name=name]', 'Liburan'); await p.fill('input[name=targetAmount]', '2000000'); await p.click('button[type=submit]');
  await p.waitForSelector('h3:has-text("Liburan")');
  await p.click('button:has-text("Setor")');
  await p.fill('input[name=amount]', '500000'); await p.selectOption('select[name=accountId]', { index: 1 }); await p.click('button[type=submit]');
  await p.waitForSelector('.kpi .value:has-text("500.000")');
  await p.click('.sidebar a[data-r="darurat"]');
  await p.click('button:has-text("Buat pos dana darurat") >> nth=0');
  await p.fill('input[name=name]', 'Dana Darurat'); await p.click('button[type=submit]');
  await p.waitForSelector('h3:has-text("Dana Darurat")');
  await shot(p, '05-darurat');

  // utang
  await p.click('.sidebar a[data-r="utang"]');
  await p.click('button:has-text("Tambah") >> nth=0');
  await p.fill('input[name=party]', 'Pak Haji'); await p.fill('input[name=principal]', '1000000'); await p.click('button[type=submit]');
  await p.waitForSelector('strong:has-text("Pak Haji")');
  await p.click('button:has-text("Bayar")');
  await p.fill('input[name=amount]', '400000'); await p.selectOption('select[name=accountId]', { index: 1 }); await p.click('button[type=submit]');
  await p.waitForSelector('text=Sisa Rp 600.000');
  await shot(p, '06-utang');

  // laporan: periode, konsistensi, ekspor
  await p.click('.sidebar a[data-r="laporan"]');
  await p.waitForSelector('.kpi:has-text("Total pemasukan")');
  const rep = await p.$$eval('.kpi .value', (x) => x.map((e) => e.textContent));
  assert.equal(rep[0], 'Rp 3.500.111'); assert.equal(rep[1], 'Rp 600.000');
  await p.click('.seg button:has-text("Tahunan")'); await p.waitForSelector('.kpi:has-text("Total pemasukan")');
  assert.equal((await p.$$eval('.kpi .value', (x) => x.map((e) => e.textContent)))[0], 'Rp 3.500.111');
  await p.click('.seg button:has-text("Mingguan")'); await p.waitForSelector('.kpi:has-text("Total pemasukan")');
  await p.click('.seg button:has-text("Khusus")');
  await p.fill('input[aria-label="Dari tanggal"]', '2026-11-01'); await p.fill('input[aria-label="Sampai tanggal"]', '2026-11-30');
  await p.waitForSelector('.kpi:has-text("Total pemasukan")');
  await p.click('.seg button:has-text("Bulanan")');
  await p.waitForSelector('.kpi:has-text("Total pemasukan")');
  await shot(p, '07-laporan-desktop');
  for (const fmt of ['Excel', 'PDF']) {
    const [dl] = await Promise.all([p.waitForEvent('download'), p.click(`button:has-text("Ekspor ${fmt}")`)]);
    assert.match(dl.suggestedFilename(), fmt === 'PDF' ? /\.pdf$/ : /\.xlsx$/);
  }

  // admin: anggota, pengaturan, audit
  await p.click('.sidebar a[data-r="anggota"]'); await p.waitForSelector('td:has-text("siti@gmail.com")');
  await p.click('.sidebar a[data-r="pengaturan"]'); await p.waitForSelector('.badge:has-text("tx.create")');
  await p.click('button:has-text("Buat backup sekarang")'); await p.waitForSelector('.toast.ok:has-text("Backup dibuat")');
  await p.fill('#fam', 'Keluarga Kamal'); await p.click('button:has-text("Simpan pengaturan")');
  await p.waitForFunction(() => document.getElementById('fam-name').textContent === 'Keluarga Kamal');
  await shot(p, '08-pengaturan');

  // sesi: keluar kembali ke login
  await p.click('button:has-text("Keluar")'); await p.waitForSelector('#lg-user');

  // ───── Mobile (admin) ─────
  const mob = await newPage(ADMIN, { width: 375, height: 740 });
  await login(mob);
  assert.ok((await overflow(mob)) <= 0, 'dashboard mobile tanpa scroll horizontal');
  assert.equal(await mob.evaluate(() => getComputedStyle(document.querySelector('.sidebar')).visibility), 'hidden', 'sidebar tertutup tak dapat difokus di mobile');
  await shot(mob, '09-dashboard-mobile');
  await mob.click('#menu-btn'); await mob.waitForSelector('.sidebar.open');
  await shot(mob, '10-menu-mobile');
  await mob.click('.sidebar a[data-r="pengeluaran"]'); await mob.waitForSelector('#content h1:has-text("Pengeluaran")');
  assert.equal(await mob.locator('.sidebar.open').count(), 0, 'menu menutup setelah navigasi');
  assert.ok((await overflow(mob)) <= 0, 'tabel jadi kartu, tanpa scroll horizontal');
  await shot(mob, '11-pengeluaran-mobile');
  for (const r of ['pemasukan', 'transfer', 'rekening', 'anggaran', 'tabungan', 'darurat', 'utang', 'laporan', 'anggota', 'pengaturan']) {
    await mob.evaluate((x) => { location.hash = x; }, r); await mob.waitForTimeout(250);
    assert.ok((await overflow(mob)) <= 0, 'overflow di ' + r);
  }
  await shot(mob, '12-pengaturan-mobile');
  await mob.evaluate(() => { location.hash = 'laporan'; }); await mob.waitForSelector('.kpi:has-text("Total pemasukan")'); await shot(mob, '13-laporan-mobile');
  await mob.evaluate(() => { location.hash = 'dashboard'; }); await mob.click('#nav-add');
  assert.ok(await mob.isVisible('.modal:has-text("Catat transaksi")'), 'tombol + membuka pilihan cepat');
  await mob.click('.quick-btn.expense');
  assert.ok(await mob.isVisible('.modal:has-text("Tambah pengeluaran")'));
  const box = await mob.locator('.modal').boundingBox(); assert.ok(box.width <= 375);
  assert.ok(box.y + box.height >= 735, 'form tampil sebagai bottom sheet (menempel di bawah)');
  await shot(mob, '14-form-mobile');
  // tablet
  const tab = await newPage(ADMIN, { width: 768, height: 1024 }); await login(tab);
  assert.ok((await overflow(tab)) <= 0); await shot(tab, '15-dashboard-tablet');

  // ───── PWA & cache ─────
  const pw = await newPage(ADMIN, { width: 1280, height: 800 }); await login(pw);
  const mf = await pw.evaluate(() => fetch('manifest.webmanifest').then((r) => r.json()));
  assert.equal(mf.display, 'standalone'); assert.ok(mf.icons.length >= 3);
  for (const i of mf.icons) assert.equal(await pw.evaluate((u) => fetch(u).then((r) => r.status), i.src), 200, 'ikon ' + i.src);
  await pw.waitForFunction(() => navigator.serviceWorker.getRegistration().then((r) => !!(r && (r.active || r.installing))));
  await pw.waitForFunction(() => caches.has('kk-shell-v1'));
  await pw.waitForTimeout(500);
  const cached = await pw.evaluate(() => caches.open('kk-shell-v1').then((c) => c.keys()).then((k) => k.map((r) => r.url)));
  assert.ok(cached.length > 5 && cached.every((u) => u.startsWith(base)), 'hanya berkas statis same-origin yang di-cache: ' + cached.join());
  assert.ok(!cached.some((u) => /script\.google|accounts\.google/.test(u)), 'API/token tidak pernah di-cache');

  // ───── Anti-clickjacking ─────
  const fr = await newPage(ADMIN, { width: 800, height: 600 });
  await fr.goto(base + '/__frame');
  await fr.frameLocator('iframe').locator('body').getByText('tidak dapat ditampilkan di dalam frame').waitFor();
  assert.equal(await fr.frameLocator('iframe').locator('#lg-user').count(), 0, 'login tidak dirender di dalam frame');

  // ───── Sesi habis saat modal terbuka: modal ditutup, kembali ke login ─────
  const ex = await newPage(ADMIN, { width: 1280, height: 800 }); await login(ex);
  await ex.click('.hero-actions .btn.gold');
  await ex.waitForSelector('.modal');
  await ex.evaluate(() => Api.setToken('x'.repeat(150)));
  await ex.fill('input[name=amount]', '1000');
  await ex.selectOption('select[name=accountId]', { index: 1 }); await ex.selectOption('select[name=categoryId]', { index: 1 });
  await ex.click('button[type=submit]');
  await ex.waitForSelector('#lg-user');
  assert.equal(await ex.locator('.modal').count(), 0, 'modal tidak tertinggal di atas halaman login');

  // ───── Mode gelap ─────
  const dk = await newPage(ADMIN, { width: 1366, height: 800 }, { colorScheme: 'dark' }); await login(dk);
  await shot(dk, '18-dashboard-dark');
  assert.ok((await overflow(dk)) <= 0);

  // ───── Banyak perangkat: tanpa scroll horizontal, target sentuh ≥44px ─────
  const { devices } = require('playwright');
  for (const name of ['iPhone 13', 'iPhone 13 landscape', 'Pixel 7', 'Galaxy S9+', 'iPad (gen 7)']) {
    const { defaultBrowserType, ...d } = devices[name];
    const dp = await newPage(ADMIN, d.viewport, d); await login(dp);
    for (const r of ['dashboard', 'pengeluaran', 'rekening', 'anggaran', 'tabungan', 'utang', 'laporan']) {
      await dp.evaluate((x) => { location.hash = x; }, r); await dp.waitForTimeout(200);
      { const o = await overflow(dp); assert.ok(o <= 0, `${name}: overflow ${o}px di ${r}: ` + (await dp.evaluate(() => [...document.querySelectorAll('body *')].filter((e) => e.getBoundingClientRect().right > document.documentElement.clientWidth + 1).slice(0, 6).map((e) => e.tagName + '.' + e.className + ' ' + Math.round(e.getBoundingClientRect().right)).join(' | ') + ' || ' + ['.content', '.card:last-child', '.tbl-wrap', '.tbl tr', '.tbl td:first-child', '.tbl td:last-child'].map((q) => { const e = document.querySelector(q); return e ? q + ':' + Math.round(e.getBoundingClientRect().left) + '→' + Math.round(e.getBoundingClientRect().right) : q + ':-'; }).join(' ')))); }
    }
    if (d.viewport.width < 1024) {
      await dp.evaluate(() => { location.hash = 'dashboard'; });
      for (const sel of ['#nav-add', '#menu-btn', '.bottomnav a[data-r=dashboard]']) { const b = await dp.locator(sel).boundingBox(); assert.ok(b.width >= 44 && b.height >= 44, `${name}: target sentuh ${sel} ${b.width}x${b.height}`); }
    }
    await shot(dp, '19-' + name.replace(/[^a-z0-9]/gi, '_'));
  }
  const se = await newPage(ADMIN, { width: 320, height: 568 }); await login(se);
  for (const r of ['dashboard', 'pengeluaran', 'rekening', 'anggaran', 'tabungan', 'darurat', 'utang', 'laporan', 'anggota', 'pengaturan']) { await se.evaluate((x) => { location.hash = x; }, r); await se.waitForTimeout(200); assert.ok((await overflow(se)) <= 0, '320px overflow di ' + r); }
  await shot(se, '20-320px');

  // ───── Anggota (hak akses di UI & server) ─────
  const mem = await newPage(MEMBER, { width: 1280, height: 800 });
  await login(mem);
  assert.equal(await mem.locator('.sidebar a[data-r="anggota"], .sidebar a[data-r="pengaturan"]').count(), 0, 'menu admin tidak tampil untuk Anggota');
  await mem.evaluate(() => { location.hash = 'pengaturan'; });
  await mem.waitForSelector('.hero');
  await mem.click('.sidebar a[data-r="rekening"]');
  assert.equal(await mem.locator('button:has-text("Tambah rekening")').count(), 0, 'tombol admin tidak tampil');
  await mem.click('.sidebar a[data-r="pengeluaran"]');
  assert.equal(await mem.locator('button[aria-label="Ubah transaksi"]').count(), 0, 'Anggota tidak bisa ubah transaksi orang lain');
  await shot(mem, '16-anggota-pengeluaran');
  // aksi admin langsung ke server dengan token Anggota ditolak
  const r = await mem.evaluate(async (a) => { try { return await Api.call('acc.save', { name: 'X', type: 'bank', openingBalance: 1 }); } catch (e) { return { code: e.code }; } }, API);
  assert.equal(r.code, 'FORBIDDEN');

  // ───── Login gagal (pengguna tak dikenal) ─────
  const x = await newPage({ u: 'asing@gmail.com', p: 'salah-salah-1' }, { width: 800, height: 600 });
  await x.goto(base); await signIn(x); await x.waitForSelector('.callout.error:not([hidden])');
  assert.match(await x.textContent('.callout.error'), /Username atau password salah/);
  await shot(x, '17-login-ditolak');

  // ───── Server mati / jaringan putus ─────
  const off = await newPage(ADMIN, { width: 1280, height: 800 });
  await login(off);
  await off.route(API + '*', (rt) => rt.abort());
  await off.click('.sidebar a[data-r="pengeluaran"]');
  await off.waitForSelector('.callout.error:has-text("Tidak dapat terhubung")');
  assert.ok(await off.isVisible('button:has-text("Coba lagi")'));

  await browser.close(); srv.close();
  assert.deepEqual(errors, [], 'tidak ada error konsol: ' + errors.join(' | '));
  console.log('E2E OK. Panggilan API:', apiCalls.length);
})().catch(async (e) => { console.error('E2E GAGAL:', e.message); try { if (SHOTS && global.lastPage) { await global.lastPage.screenshot({ path: path.join(SHOTS, 'GAGAL.png') }); console.error('Teks halaman:', (await global.lastPage.innerText('body')).slice(0, 600)); } } catch (x) { console.error('diag gagal:', x.message); } process.exit(1); });
