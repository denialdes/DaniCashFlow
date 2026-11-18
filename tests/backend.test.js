const test = require('node:test');
const assert = require('node:assert/strict');
const { create } = require('./gas-mock');

let seq = 0;
const rid = () => 'req-' + String(++seq).padStart(6, '0') + '-abcdef';

function world() {
  const m = create();
  m.g.setupDatabase();
  m.g.resetPassword('owner@gmail.com', 'rahasia-admin-1');
  m.guardWrites = true;
  const admin = m.addToken('admin', 'owner@gmail.com');
  const ok = (tok, action, payload) => { const r = m.call(tok, action, payload); assert.equal(r.ok, true, `${action}: ${JSON.stringify(r.error)}`); return r.data; };
  const fail = (tok, action, payload, code) => { const r = m.call(tok, action, payload); assert.equal(r.ok, false, `${action} seharusnya gagal`); if (code) assert.equal(r.error.code, code, r.error.message); return r.error; };
  const boot = (tok = admin) => ok(tok, 'bootstrap', {});
  const mk = (tok, action, p) => ok(tok, action, p).result;
  const cat = (b, type, name) => b.categories.find((c) => c.type === type && c.name === name).id;
  return { m, admin, ok, fail, boot, mk, cat };
}

test('setup: sheet, kategori, pengaturan, admin pemilik; idempotent', () => {
  const m = create();
  const first = m.g.setupDatabase();
  assert.equal(m.g.setupDatabase().length, 0, 'setup ulang tidak membuat password baru');
  assert.equal(first.length, 1);
  assert.equal(m.login('owner@gmail.com', first[0].password).ok, true, 'password awal berfungsi');
  m.g.Db.reset();
  assert.equal(m.g.Db.all('Users').length, 1);
  assert.equal(m.g.Db.all('Users')[0].email, 'owner@gmail.com');
  assert.equal(m.g.Db.all('Users')[0].role, 'Admin');
  assert.equal(m.g.Db.all('Categories').length, 15);
  assert.equal(m.g.Db.all('Transactions').length, 0, 'tidak ada data contoh keuangan');
  assert.equal(m.g.Db.all('Accounts').length, 0);
  assert.equal(m.ssById[m.main.id].sheets.length, 9, 'Sheet1 kosong dihapus, 9 sheet skema');
});

test('autentikasi: token tidak sah/kedaluwarsa ditolak; pengguna tak terdaftar/nonaktif ditolak', () => {
  const w = world();
  w.fail(null, 'bootstrap', {}, 'AUTH');
  w.fail('x'.repeat(150), 'bootstrap', {}, 'AUTH');
  w.fail('a:b:c:d', 'bootstrap', {}, 'AUTH');
  w.fail(w.admin.slice(0, -1) + (w.admin.endsWith('0') ? '1' : '0'), 'bootstrap', {}, 'AUTH'); // tanda tangan diubah
  w.fail(w.admin.replace('owner@gmail.com', 'budi@gmail.com'), 'bootstrap', {}, 'AUTH'); // isi diubah, tanda tangan lama
  w.fail(w.m.addToken('expired', 'owner@gmail.com', -1), 'bootstrap', {}, 'AUTH');
  const id = w.mk(w.admin, 'user.save', { name: 'Budi', email: 'budi@gmail.com', password: 'rahasia123', role: 'Anggota' }).id;
  const budi = w.m.addToken('budi', 'budi@gmail.com');
  w.ok(budi, 'bootstrap', {});
  w.mk(w.admin, 'user.save', { id, name: 'Budi', email: 'budi@gmail.com', role: 'Anggota', status: 'nonaktif' });
  w.fail(budi, 'bootstrap', {}, 'FORBIDDEN'); // status dicek ulang tiap request
});

test('login: password benar menghasilkan sesi; salah/tak dikenal/nonaktif ditolak; tak peka huruf besar pada username', () => {
  const w = world();
  const r = w.m.login('OWNER@Gmail.com', 'rahasia-admin-1');
  assert.equal(r.ok, true);
  assert.ok(w.ok(r.data.token, 'bootstrap', {}).user, 'token dari login berfungsi');
  assert.ok(r.data.expiresAt > Math.floor(w.m.clock.getTime() / 1000));
  for (const [u, p] of [['owner@gmail.com', 'salah'], ['hantu@gmail.com', 'rahasia-admin-1'], ['', ''], ['owner@gmail.com', 'x'.repeat(500)]]) {
    const x = w.m.login(u, p);
    assert.equal(x.ok, false); assert.equal(x.error.code, 'LOGIN'); assert.equal(x.error.message, 'Username atau password salah.');
  }
  assert.equal(w.m.call(null, 'auth.login', null).error.code, 'LOGIN', 'payload kosong tidak membuat server error');
  const id = w.mk(w.admin, 'user.save', { name: 'Budi', email: 'budi', password: 'rahasia123', role: 'Anggota' }).id;
  assert.equal(w.m.login('budi', 'rahasia123').ok, true);
  w.mk(w.admin, 'user.save', { id, name: 'Budi', email: 'budi', role: 'Anggota', status: 'nonaktif' });
  assert.equal(w.m.login('budi', 'rahasia123').error.code, 'FORBIDDEN');
});

test('login sah berulang (muat ulang halaman) tidak pernah terkunci; hanya percobaan gagal yang dihitung', () => {
  const w = world();
  for (let i = 0; i < 30; i++) assert.equal(w.m.login('owner@gmail.com', 'rahasia-admin-1').ok, true, 'login ke-' + (i + 1));
  for (let i = 0; i < 3; i++) w.m.login('owner@gmail.com', 'salah' + i);
  assert.equal(w.m.login('owner@gmail.com', 'rahasia-admin-1').ok, true, 'beberapa salah ketik tidak mengunci');
});

test('pengguna warisan dengan + di username masih bisa diubah Admin; token tidak membuka potongan hash', () => {
  const w = world();
  w.m.guardWrites = false; w.m.g.Db.reset();
  w.m.g.Db.insert('Users', Object.assign({ id: 'usr_legacy0001', email: 'ali+kk@gmail.com', name: 'Ali', role: 'Anggota', status: 'aktif', createdAt: 'x', updatedAt: 'x' }, w.m.g.Auth.credentials('lama-lama-123')));
  w.m.guardWrites = true;
  w.mk(w.admin, 'user.save', { id: 'usr_legacy0001', name: 'Ali', email: 'ali+kk@gmail.com', role: 'Anggota', password: 'baru-baru-123' });
  const r = w.m.login('ali+kk@gmail.com', 'baru-baru-123');
  assert.equal(r.ok, true);
  w.ok(r.data.token, 'bootstrap', {});
  w.m.g.Db.reset();
  assert.ok(!r.data.token.includes(w.m.g.Db.all('Users').find((u) => u.id === 'usr_legacy0001').passHash.slice(0, 12)), 'potongan hash tidak ada di token');
});

test('ubah utang: jatuh tempo tidak boleh sebelum tanggal mulai (sama seperti saat membuat)', () => {
  const w = world();
  const id = w.mk(w.admin, 'debt.save', { requestId: rid(), kind: 'utang', party: 'Budi', principal: 1000, startDate: '2026-11-10', dueDate: '2026-12-10' }).id;
  w.fail(w.admin, 'debt.save', { id, party: 'Budi', principal: 1000, dueDate: '2026-01-01' }, 'VALIDATION');
  w.mk(w.admin, 'debt.save', { id, party: 'Budi', principal: 1000, dueDate: '2026-12-31' });
});

test('login dibatasi per username; username lain tidak terpengaruh', () => {
  const w = world();
  const codes = [];
  for (let i = 0; i < w.m.g.LIMITS.loginMax + 2; i++) codes.push(w.m.login('owner@gmail.com', 'salah' + i).error.code);
  assert.deepEqual(codes.slice(-2), ['BUSY', 'BUSY']);
  assert.equal(w.m.login('owner@gmail.com', 'rahasia-admin-1').error.code, 'BUSY', 'password benar pun ditahan selama terkunci');
  w.mk(w.admin, 'user.save', { name: 'Siti', email: 'siti', password: 'rahasia123', role: 'Anggota' });
  assert.equal(w.m.login('siti', 'rahasia123').ok, true);
});

test('password: hanya salt+hash tersimpan, tidak bocor ke klien/audit; ganti password mencabut sesi lama', () => {
  const w = world();
  const id = w.mk(w.admin, 'user.save', { name: 'Siti', email: 'siti', password: 'rahasia123', role: 'Anggota' }).id;
  const row = w.m.g.Db.all('Users').find((u) => u.id === id);
  assert.ok(row.passHash.length === 64 && row.salt && !JSON.stringify(row).includes('rahasia123'));
  const dump = JSON.stringify(w.boot()) + JSON.stringify(w.ok(w.admin, 'audit.list', {}));
  assert.ok(!dump.includes(row.passHash) && !dump.includes(row.salt) && !dump.includes('rahasia123'), 'hash/password tidak keluar');
  const old = w.m.login('siti', 'rahasia123').data.token;
  w.ok(old, 'bootstrap', {});
  w.mk(w.admin, 'user.save', { id, name: 'Siti', email: 'siti', role: 'Anggota' }); // tanpa password: lama dipertahankan
  w.ok(old, 'bootstrap', {});
  w.mk(w.admin, 'user.save', { id, name: 'Siti', email: 'siti', role: 'Anggota', password: 'baru-baru-123' });
  w.fail(old, 'bootstrap', {}, 'AUTH');
  assert.equal(w.m.login('siti', 'rahasia123').ok, false);
  assert.equal(w.m.login('siti', 'baru-baru-123').ok, true);
  w.fail(w.admin, 'user.save', { name: 'Tanpa', email: 'tanpa', role: 'Anggota' }, 'VALIDATION'); // password wajib untuk anggota baru
  w.fail(w.admin, 'user.save', { name: 'Tanpa', email: 'tanpa', role: 'Anggota', password: 'pendek' }, 'VALIDATION');
});

test('logout mencabut token itu saja; sesi lain pengguna yang sama tetap berjalan', () => {
  const w = world();
  const a = w.m.login('owner@gmail.com', 'rahasia-admin-1').data.token, b = w.m.login('owner@gmail.com', 'rahasia-admin-1').data.token;
  w.ok(a, 'auth.logout', {});
  w.fail(a, 'bootstrap', {}, 'AUTH');
  w.ok(b, 'bootstrap', {});
  w.fail(a, 'auth.logout', {}, 'AUTH'); // token yang sudah dicabut tidak bisa dipakai lagi
});

test('resetPassword (pemulihan admin) dan migrasi sheet lama tanpa kolom password', () => {
  const w = world();
  w.m.g.resetPassword('owner@gmail.com', 'pulih-12345');
  assert.equal(w.m.login('owner@gmail.com', 'pulih-12345').ok, true);
  assert.throws(() => w.m.g.resetPassword('hantu', 'pulih-12345'), /tidak ditemukan/);
  const sh = w.m.main.getSheetByName('Users');
  sh.v.forEach((row) => row.length = 7); // bentuk lama: tanpa salt & passHash
  assert.equal(w.m.call(w.admin, 'bootstrap', {}).error.code, 'SCHEMA');
  w.m.guardWrites = false; // setup dijalankan manual dari editor, tanpa lock
  const fresh = w.m.g.setupDatabase();
  assert.equal(fresh.length, 1, 'pengguna lama mendapat password awal');
  assert.equal(w.m.login(fresh[0].username, fresh[0].password).ok, true);
});

test('permintaan rusak: JSON salah, body besar, array, aksi tak dikenal, prototype key', () => {
  const w = world();
  assert.equal(w.m.call(null, null, null, '{bukan json').error.code, 'BAD_REQUEST');
  assert.equal(w.m.call(null, null, null, '').error.code, 'BAD_REQUEST');
  assert.equal(w.m.call(null, null, null, '[]').error.code, 'BAD_REQUEST');
  assert.equal(w.m.call(null, null, null, JSON.stringify({ token: w.admin, action: 'x', pad: 'a'.repeat(31000) })).error.code, 'BAD_REQUEST');
  w.fail(w.admin, 'nope', {}, 'NOT_FOUND');
  w.fail(w.admin, 'constructor', {}, 'NOT_FOUND');
  w.fail(w.admin, '__proto__', {}, 'NOT_FOUND');
  assert.equal(w.m.call(w.admin, 'bootstrap', 'bukan-objek').ok, true);
});

function seed(w) {
  const b0 = w.boot();
  const bank = w.mk(w.admin, 'acc.save', { name: 'BCA', type: 'bank', openingBalance: 1000000 }).id;
  const cash = w.mk(w.admin, 'acc.save', { name: 'Tunai', type: 'tunai', openingBalance: 0 }).id;
  const tx = (o) => w.ok(w.admin, 'tx.create', Object.assign({ requestId: rid() }, o)).result.tx;
  return { b0, bank, cash, tx };
}

test('saldo: pemasukan, pengeluaran, transfer dibedakan; transfer bukan pemasukan/pengeluaran', () => {
  const w = world();
  const { b0, bank, cash, tx } = seed(w);
  tx({ type: 'income', date: '2026-11-02', amount: 500000, accountId: bank, categoryId: w.cat(b0, 'income', 'Gaji'), note: 'gaji' });
  tx({ type: 'expense', date: '2026-11-03', amount: 200000, accountId: bank, categoryId: w.cat(b0, 'expense', 'Listrik') });
  tx({ type: 'transfer', date: '2026-11-04', amount: 300000, accountId: bank, toAccountId: cash });
  const b = w.boot();
  const bal = (id) => b.accounts.find((a) => a.id === id).balance;
  assert.equal(bal(bank), 1000000 + 500000 - 200000 - 300000);
  assert.equal(bal(cash), 300000);
  assert.equal(b.dashboard.totalBalance, 1300000);
  assert.deepEqual(b.dashboard.month, { income: 500000, expense: 200000, net: 300000 });
  assert.equal(b.dashboard.topCategories[0].amount, 200000);
});

test('tidak boleh minus: pengeluaran/transfer melebihi saldo ditolak', () => {
  const w = world();
  const { b0, bank, cash } = seed(w);
  const e = w.fail(w.admin, 'tx.create', { requestId: rid(), type: 'expense', date: '2026-11-02', amount: 1000001, accountId: bank, categoryId: w.cat(b0, 'expense', 'Air') }, 'INTEGRITY');
  assert.match(e.message, /Saldo rekening "BCA"/);
  w.fail(w.admin, 'tx.create', { requestId: rid(), type: 'transfer', date: '2026-11-02', amount: 2000000, accountId: bank, toAccountId: cash }, 'INTEGRITY');
  assert.equal(w.m.g.Db.all('Transactions').length, 0);
});

test('anti duplikasi: requestId sama = satu transaksi; klik ganda/retry aman', () => {
  const w = world();
  const { b0, bank } = seed(w);
  const p = { requestId: 'dup-request-0001', type: 'income', date: '2026-11-02', amount: 100000, accountId: bank, categoryId: w.cat(b0, 'income', 'Gaji') };
  const a = w.ok(w.admin, 'tx.create', p).result;
  const b = w.ok(w.admin, 'tx.create', p).result;
  assert.equal(a.duplicate, false);
  assert.equal(b.duplicate, true);
  assert.equal(a.tx.id, b.tx.id);
  assert.equal(w.m.g.Db.all('Transactions').length, 1);
  assert.equal(w.boot().accounts.find((x) => x.id === bank).balance, 1100000);
  w.fail(w.admin, 'tx.create', Object.assign({}, p, { requestId: 'short' }), 'VALIDATION');
});

test('edit & void memperbarui seluruh ringkasan', () => {
  const w = world();
  const { b0, bank, tx } = seed(w);
  const inc = tx({ type: 'income', date: '2026-11-02', amount: 500000, accountId: bank, categoryId: w.cat(b0, 'income', 'Gaji') });
  const exp = tx({ type: 'expense', date: '2026-11-03', amount: 200000, accountId: bank, categoryId: w.cat(b0, 'expense', 'Listrik') });
  w.ok(w.admin, 'tx.update', { id: exp.id, type: 'income' /* diabaikan: jenis tidak berubah */, date: '2026-11-03', amount: 250000, accountId: bank, categoryId: w.cat(b0, 'expense', 'Listrik') });
  let b = w.boot();
  assert.equal(b.dashboard.month.expense, 250000);
  assert.equal(b.accounts[0].balance, 1000000 + 500000 - 250000);
  w.ok(w.admin, 'tx.void', { id: exp.id });
  b = w.boot();
  assert.equal(b.dashboard.month.expense, 0);
  assert.equal(b.accounts[0].balance, 1500000);
  assert.equal(b.dashboard.topCategories.length, 0);
  // void pemasukan yang membuat saldo negatif setelah pengeluaran besar ditolak
  tx({ type: 'expense', date: '2026-11-05', amount: 1400000, accountId: bank, categoryId: w.cat(b0, 'expense', 'Lainnya') });
  w.fail(w.admin, 'tx.void', { id: inc.id }, 'INTEGRITY');
  w.fail(w.admin, 'tx.void', { id: exp.id }, 'NOT_FOUND');
  const logs = w.ok(w.admin, 'audit.list', {}).rows.map((r) => r.action);
  assert.ok(logs.includes('tx.update') && logs.includes('tx.void') && logs.includes('tx.create'));
});

test('hak akses: Anggota tidak bisa tindakan Admin; hanya edit transaksi sendiri; penolakan dicatat', () => {
  const w = world();
  const { b0, bank, tx } = seed(w);
  w.mk(w.admin, 'user.save', { name: 'Siti', email: 'siti@gmail.com', password: 'rahasia123', role: 'Anggota' });
  const siti = w.m.addToken('siti', 'siti@gmail.com');
  const sb = w.boot(siti);
  assert.equal(sb.users, undefined, 'daftar pengguna tidak bocor ke Anggota');
  for (const [a, p] of [['acc.save', { name: 'X', type: 'bank', openingBalance: 0 }], ['acc.status', { id: bank, status: 'arsip' }], ['cat.save', { name: 'Z', type: 'expense' }],
    ['bud.save', { period: 'monthly', categoryId: 'ALL', amount: 1000 }], ['sav.save', { name: 'S', kind: 'target' }], ['debt.save', { requestId: rid(), kind: 'utang', party: 'A', principal: 1, startDate: '2026-11-01' }],
    ['user.save', { name: 'H', email: 'h@gmail.com', role: 'Admin' }], ['settings.save', { familyName: 'X', emergencyMonths: 3 }], ['audit.list', {}], ['backup.run', {}]]) {
    w.fail(siti, a, p, 'FORBIDDEN');
  }
  const adminTx = tx({ type: 'income', date: '2026-11-02', amount: 1000, accountId: bank, categoryId: w.cat(b0, 'income', 'Gaji') });
  w.fail(siti, 'tx.update', { id: adminTx.id, date: '2026-11-02', amount: 1, accountId: bank, categoryId: w.cat(b0, 'income', 'Gaji') }, 'FORBIDDEN');
  w.fail(siti, 'tx.void', { id: adminTx.id }, 'FORBIDDEN');
  const mine = w.ok(siti, 'tx.create', { requestId: rid(), type: 'income', date: '2026-11-02', amount: 5000, accountId: bank, categoryId: w.cat(b0, 'income', 'Bonus') }).result.tx;
  w.ok(siti, 'tx.update', { id: mine.id, date: '2026-11-02', amount: 6000, accountId: bank, categoryId: w.cat(b0, 'income', 'Bonus') });
  const list = w.ok(siti, 'tx.list', {});
  assert.equal(list.rows.find((r) => r.id === adminTx.id).canEdit, false);
  assert.equal(list.rows.find((r) => r.id === mine.id).canEdit, true);
  const denied = w.ok(w.admin, 'audit.list', {}).rows.filter((r) => r.action === 'auth.denied');
  assert.ok(denied.length >= 10 && denied.every((r) => r.email === 'siti@gmail.com'));
});

test('minimal satu Admin aktif; username unik', () => {
  const w = world();
  const me = w.boot().users[0];
  w.fail(w.admin, 'user.save', { id: me.id, name: 'x', email: me.email, role: 'Anggota', status: 'aktif' }, 'VALIDATION');
  w.fail(w.admin, 'user.save', { id: me.id, name: 'x', email: me.email, role: 'Admin', status: 'nonaktif' }, 'VALIDATION');
  w.fail(w.admin, 'user.save', { name: 'dup', email: 'OWNER@gmail.com', password: 'rahasia123', role: 'Anggota' }, 'VALIDATION');
  w.fail(w.admin, 'user.save', { name: 'bad', email: 'a b', password: 'rahasia123', role: 'Anggota' }, 'VALIDATION');
});

test('validasi input & ketahanan terhadap injeksi (XSS/rumus tersimpan apa adanya sebagai teks)', () => {
  const w = world();
  const { b0, bank, cash } = seed(w);
  const inc = w.cat(b0, 'income', 'Gaji'), expc = w.cat(b0, 'expense', 'Air');
  const base = { requestId: rid(), type: 'income', date: '2026-11-02', amount: 1000, accountId: bank, categoryId: inc };
  const bads = [{ amount: -5 }, { amount: 0 }, { amount: 10.5 }, { amount: '1e3' }, { amount: 'abc' }, { amount: 1e13 }, { amount: null }, { date: '2026-02-30' }, { date: '02/11/2026' }, { date: '2026-11-17' }, { date: '1999-01-01' },
    { type: 'hack' }, { categoryId: expc }, { categoryId: 'tidak-ada-xyz' }, { accountId: 'tidak-ada-xyz' }, { accountId: { $ne: 1 } }, { note: 'x'.repeat(201) }, { categoryId: null }];
  for (const b of bads) w.fail(w.admin, 'tx.create', Object.assign({}, base, { requestId: rid() }, b), 'VALIDATION');
  w.fail(w.admin, 'tx.create', { requestId: rid(), type: 'transfer', date: '2026-11-02', amount: 10, accountId: bank, toAccountId: bank }, 'VALIDATION');
  w.fail(w.admin, 'tx.create', { requestId: rid(), type: 'transfer', date: '2026-11-02', amount: 10, accountId: bank }, 'VALIDATION');
  const evil = '<img src=x onerror=alert(1)>';
  const t1 = w.ok(w.admin, 'tx.create', Object.assign({}, base, { requestId: rid(), note: evil })).result.tx;
  const t2 = w.ok(w.admin, 'tx.create', Object.assign({}, base, { requestId: rid(), note: '=HYPERLINK("http://evil","x")' })).result.tx;
  const t3 = w.ok(w.admin, 'tx.create', Object.assign({}, base, { requestId: rid(), note: 'a\u0000b\nc' })).result.tx;
  const rows = w.ok(w.admin, 'tx.list', { q: '' }).rows;
  assert.equal(rows.find((r) => r.id === t1.id).note, evil);
  assert.equal(rows.find((r) => r.id === t2.id).note, '=HYPERLINK("http://evil","x")', 'rumus tidak dievaluasi (kolom teks)');
  assert.equal(rows.find((r) => r.id === t3.id).note, 'a b c');
  assert.equal(rows.find((r) => r.id === t1.id).date, '2026-11-02', 'tanggal tetap teks yyyy-MM-dd');
  w.fail(w.admin, 'acc.save', { name: evil.repeat(5), type: 'bank', openingBalance: 0 }, 'VALIDATION');
  w.fail(w.admin, 'acc.save', { name: 'BCA', type: 'bank', openingBalance: 0 }, 'VALIDATION'); // nama ganda
  w.fail(w.admin, 'tx.list', { type: 'x' }, 'VALIDATION');
  w.fail(w.admin, 'tx.list', { from: 'kemarin' }, 'VALIDATION');
});

test('daftar transaksi: filter, pencarian, paginasi, urutan', () => {
  const w = world();
  const { b0, bank, tx } = seed(w);
  const gaji = w.cat(b0, 'income', 'Gaji'), lst = w.cat(b0, 'expense', 'Listrik');
  for (let i = 1; i <= 30; i++) tx({ type: 'income', date: `2026-10-${String(i).padStart(2, '0')}`, amount: 1000 + i, accountId: bank, categoryId: gaji, note: i === 7 ? 'bonus khusus' : 'rutin' });
  tx({ type: 'expense', date: '2026-11-01', amount: 5000, accountId: bank, categoryId: lst, note: 'token listrik' });
  const all = w.ok(w.admin, 'tx.list', {});
  assert.equal(all.total, 31); assert.equal(all.pages, 2); assert.equal(all.rows.length, 25); assert.equal(all.rows[0].date, '2026-11-01');
  assert.equal(w.ok(w.admin, 'tx.list', { page: 2 }).rows.length, 6);
  assert.equal(w.ok(w.admin, 'tx.list', { page: 99 }).page, 2);
  assert.equal(w.ok(w.admin, 'tx.list', { q: 'BONUS' }).total, 1);
  assert.equal(w.ok(w.admin, 'tx.list', { q: 'listrik' }).total, 1);
  assert.equal(w.ok(w.admin, 'tx.list', { type: 'expense' }).sum.expense, 5000);
  assert.equal(w.ok(w.admin, 'tx.list', { from: '2026-10-10', to: '2026-10-12' }).total, 3);
  assert.equal(w.ok(w.admin, 'tx.list', { categoryId: lst }).total, 1);
});

test('tabungan & dana darurat: setoran bukan pengeluaran, penarikan, batas saldo', () => {
  const w = world();
  const { b0, bank } = seed(w);
  const goal = w.mk(w.admin, 'sav.save', { name: 'Dana Darurat', kind: 'darurat', targetAmount: 6000000 }).id;
  const dep = (amount, extra) => w.ok(w.admin, 'sav.move', Object.assign({ requestId: rid(), goalId: goal, direction: 'deposit', accountId: bank, amount, date: '2026-11-10' }, extra));
  dep(400000);
  const d2 = dep(100000, { requestId: 'dup-saving-0001' }); const d3 = dep(100000, { requestId: 'dup-saving-0001' });
  assert.equal(d3.result.duplicate, true); assert.equal(d2.result.tx.id, d3.result.tx.id);
  let b = w.boot();
  assert.equal(b.savings[0].saved, 500000);
  assert.equal(b.accounts[0].balance, 500000);
  assert.deepEqual(b.dashboard.month, { income: 0, expense: 0, net: 0 }, 'setoran bukan pengeluaran');
  assert.equal(b.dashboard.totalSaved, 500000);
  assert.equal(b.savings[0].pct, 8.3);
  w.fail(w.admin, 'sav.move', { requestId: rid(), goalId: goal, direction: 'withdraw', accountId: bank, amount: 600000, date: '2026-11-10' }, 'INTEGRITY');
  w.fail(w.admin, 'sav.move', { requestId: rid(), goalId: goal, direction: 'deposit', accountId: bank, amount: 600000, date: '2026-11-10' }, 'INTEGRITY');
  w.fail(w.admin, 'sav.status', { id: goal, status: 'arsip' }, 'VALIDATION');
  w.ok(w.admin, 'sav.move', { requestId: rid(), goalId: goal, direction: 'withdraw', accountId: bank, amount: 500000, date: '2026-11-11' });
  b = w.boot();
  assert.equal(b.savings[0].saved, 0); assert.equal(b.accounts[0].balance, 1000000);
  w.ok(w.admin, 'sav.status', { id: goal, status: 'arsip' });
  w.fail(w.admin, 'sav.move', { requestId: rid(), goalId: goal, direction: 'deposit', accountId: bank, amount: 1, date: '2026-11-11' }, 'VALIDATION');
});

test('dana darurat: rekomendasi dari rata-rata pengeluaran ≤3 bulan penuh', () => {
  const w = world();
  const { b0, bank, tx } = seed(w);
  const e = w.cat(b0, 'expense', 'Kebutuhan Rumah Tangga');
  w.mk(w.admin, 'acc.save', { id: bank, name: 'BCA', type: 'bank', openingBalance: 100000000 });
  assert.equal(w.boot().emergency.basis, 'none');
  tx({ type: 'expense', date: '2026-11-03', amount: 800000, accountId: bank, categoryId: e });
  assert.deepEqual([w.boot().emergency.basis, w.boot().emergency.avgMonthlyExpense], ['current', 800000]);
  tx({ type: 'expense', date: '2026-08-10', amount: 3000000, accountId: bank, categoryId: e });
  tx({ type: 'expense', date: '2026-09-10', amount: 1000000, accountId: bank, categoryId: e });
  tx({ type: 'expense', date: '2026-10-10', amount: 2000000, accountId: bank, categoryId: e });
  const em = w.boot().emergency;
  assert.equal(em.avgMonthlyExpense, 2000000); assert.equal(em.suggestedTarget, 12000000);
});

test('utang/piutang/cicilan: pencairan, pembayaran, batas pokok, perlakuan arus kas', () => {
  const w = world();
  const { b0, bank, tx } = seed(w);
  const reqU = rid();
  const u = w.mk(w.admin, 'debt.save', { requestId: reqU, kind: 'utang', party: 'Pak Haji', principal: 2000000, startDate: '2026-11-01', accountId: bank }).id;
  const again = w.ok(w.admin, 'debt.save', { requestId: reqU, kind: 'utang', party: 'Pak Haji', principal: 2000000, startDate: '2026-11-01', accountId: bank });
  assert.equal(again.result.duplicate, true);
  assert.equal(w.m.g.Db.all('Debts').length, 1); assert.equal(w.m.g.Db.all('Transactions').length, 1);
  let b = w.boot();
  assert.equal(b.accounts[0].balance, 3000000, 'dana utang masuk rekening');
  assert.deepEqual(b.dashboard.month, { income: 0, expense: 0, net: 0 }, 'bukan pemasukan');
  assert.equal(b.dashboard.totalDebt, 2000000);
  w.ok(w.admin, 'debt.pay', { requestId: rid(), debtId: u, accountId: bank, amount: 500000, date: '2026-11-05' });
  w.fail(w.admin, 'debt.pay', { requestId: rid(), debtId: u, accountId: bank, amount: 1500001, date: '2026-11-05' }, 'VALIDATION');
  w.fail(w.admin, 'debt.delete', { id: u }, 'VALIDATION');
  b = w.boot();
  assert.equal(b.debts[0].outstanding, 1500000); assert.equal(b.accounts[0].balance, 2500000); assert.equal(b.dashboard.month.expense, 0);
  w.ok(w.admin, 'debt.pay', { requestId: rid(), debtId: u, accountId: bank, amount: 1500000, date: '2026-11-06' });
  b = w.boot(); assert.equal(b.debts[0].settled, true); assert.equal(b.dashboard.totalDebt, 0);
  w.fail(w.admin, 'debt.save', { id: u, party: 'Pak Haji', principal: 1000000 }, 'INTEGRITY');

  const p = w.mk(w.admin, 'debt.save', { requestId: rid(), kind: 'piutang', party: 'Andi', principal: 400000, startDate: '2026-11-07', accountId: bank }).id;
  b = w.boot(); assert.equal(b.dashboard.totalReceivable, 400000); assert.equal(b.accounts[0].balance, 1000000 + 2000000 - 2000000 - 400000);
  w.ok(w.admin, 'debt.pay', { requestId: rid(), debtId: p, accountId: bank, amount: 400000, date: '2026-11-08' });
  assert.equal(w.boot().accounts[0].balance, 1000000);

  const c = w.mk(w.admin, 'debt.save', { requestId: rid(), kind: 'cicilan', party: 'Kredit Motor', principal: 3000000, startDate: '2026-11-01', installmentAmount: 1000000, installmentCount: 3 }).id;
  w.fail(w.admin, 'debt.pay', { requestId: rid(), debtId: c, accountId: bank, amount: 1000000, date: '2026-11-09' }, 'VALIDATION'); // kategori wajib
  w.fail(w.admin, 'debt.pay', { requestId: rid(), debtId: c, accountId: bank, amount: 1000000, date: '2026-11-09', categoryId: w.cat(b0, 'income', 'Gaji') }, 'VALIDATION');
  w.ok(w.admin, 'debt.pay', { requestId: rid(), debtId: c, accountId: bank, amount: 1000000, date: '2026-11-09', categoryId: w.cat(b0, 'expense', 'Cicilan') });
  b = w.boot(); assert.equal(b.dashboard.month.expense, 1000000, 'cicilan dihitung pengeluaran'); assert.equal(b.accounts[0].balance, 0);
  w.fail(w.admin, 'debt.pay', { requestId: rid(), debtId: c, accountId: bank, amount: 1, date: '2026-11-09', categoryId: w.cat(b0, 'expense', 'Cicilan') }, 'INTEGRITY');
  const d2 = w.mk(w.admin, 'debt.save', { requestId: rid(), kind: 'piutang', party: 'Tanpa Kas', principal: 5, startDate: '2026-11-07' }).id;
  w.ok(w.admin, 'debt.delete', { id: d2 });
  assert.equal(w.m.g.Db.all('Debts').length, 3);
});

test('anggaran: batas diproporsikan, status, unik per kategori+periode', () => {
  const w = world();
  const { b0, bank, tx } = seed(w);
  const lst = w.cat(b0, 'expense', 'Listrik');
  const m = w.mk(w.admin, 'bud.save', { period: 'monthly', categoryId: lst, amount: 300000 }).id;
  w.mk(w.admin, 'bud.save', { period: 'weekly', categoryId: 'ALL', amount: 700000 });
  w.fail(w.admin, 'bud.save', { period: 'monthly', categoryId: lst, amount: 1 }, 'VALIDATION');
  w.fail(w.admin, 'bud.save', { period: 'monthly', categoryId: w.cat(b0, 'income', 'Gaji'), amount: 1 }, 'VALIDATION');
  tx({ type: 'expense', date: '2026-11-10', amount: 250000, accountId: bank, categoryId: lst });
  tx({ type: 'expense', date: '2026-11-16', amount: 100000, accountId: bank, categoryId: w.cat(b0, 'expense', 'Air') });
  const b = w.boot();
  const mb = b.budgets.find((x) => x.id === m), wb = b.budgets.find((x) => x.period === 'weekly');
  assert.deepEqual([mb.limit, mb.spent, mb.pct, mb.state], [300000, 250000, 83.3, 'warn']);
  assert.deepEqual([wb.limit, wb.spent, wb.rangeFrom, wb.rangeTo], [700000, 100000, '2026-11-16', '2026-11-22']);
  tx({ type: 'expense', date: '2026-11-11', amount: 60000, accountId: bank, categoryId: lst });
  assert.equal(w.boot().budgets.find((x) => x.id === m).state, 'over');
  const C = w.m.g.Calc;
  assert.equal(C.budgetLimit({ period: 'monthly', amount: 3100000 }, '2026-12-01', '2026-12-31'), 3100000);
  assert.equal(C.budgetLimit({ period: 'monthly', amount: 3100000 }, '2026-12-01', '2026-12-10'), 1000000);
  assert.equal(C.budgetLimit({ period: 'monthly', amount: 100 }, '2026-01-01', '2026-12-31'), 1200);
  assert.equal(C.budgetLimit({ period: 'monthly', amount: 3000 }, '2026-02-15', '2026-03-15'), Math.round(3000 * 14 / 28 + 3000 * 15 / 31));
  assert.equal(C.budgetLimit({ period: 'weekly', amount: 700 }, '2026-11-16', '2026-11-22'), 700);
});

test('laporan mingguan/bulanan/tahunan/khusus konsisten satu sama lain', () => {
  const w = world();
  const { b0, bank, tx } = seed(w);
  w.mk(w.admin, 'acc.save', { id: bank, name: 'BCA', type: 'bank', openingBalance: 5000000 });
  const gaji = w.cat(b0, 'income', 'Gaji'), air = w.cat(b0, 'expense', 'Air'), lst = w.cat(b0, 'expense', 'Listrik');
  // Sebaran tanggal lintas pergantian minggu/bulan/tahun
  const data = [['2025-12-31', 'income', 1000000, gaji], ['2026-01-01', 'expense', 100000, air], ['2026-01-31', 'income', 2000000, gaji], ['2026-02-01', 'expense', 50000, lst],
    ['2026-03-01', 'expense', 70000, air], ['2026-03-02', 'income', 300000, gaji], ['2026-06-15', 'expense', 90000, lst], ['2026-10-31', 'income', 400000, gaji], ['2026-11-01', 'expense', 10000, air], ['2026-11-16', 'income', 123456, gaji]];
  data.forEach(([date, type, amount, categoryId]) => tx({ type, date, amount, accountId: bank, categoryId }));
  const rep = (p) => w.ok(w.admin, 'report.get', p);
  const y = rep({ periodType: 'year', ref: '2026-06-01' });
  let inc = 0, exp = 0;
  for (let mo = 1; mo <= 12; mo++) { const r = rep({ periodType: 'month', ref: `2026-${String(mo).padStart(2, '0')}-10` }); inc += r.totals.income; exp += r.totals.expense; }
  assert.deepEqual([inc, exp], [y.totals.income, y.totals.expense]);
  assert.equal(y.totals.income, 2000000 + 300000 + 400000 + 123456);
  // jumlah semua minggu (Senin–Minggu) yang menutupi 2026 = total tahun + sisa di luar tahun
  let wi = 0, we = 0, d = '2025-12-29';
  const C = w.m.g.Calc;
  while (d <= '2027-01-03') { const r = rep({ periodType: 'week', ref: d }); wi += r.totals.income; we += r.totals.expense; d = C.addDays(d, 7); }
  assert.equal(wi, 1000000 + y.totals.income); assert.equal(we, y.totals.expense);
  const cust = rep({ periodType: 'custom', from: '2026-03-01', to: '2026-03-31' }), mar = rep({ periodType: 'month', ref: '2026-03-20' });
  assert.deepEqual(cust.totals, mar.totals); assert.deepEqual([cust.period.from, cust.period.to], [mar.period.from, mar.period.to]);
  assert.deepEqual([cust.period.prevFrom, cust.period.prevTo], ['2026-01-29', '2026-02-28'], 'pembanding rentang khusus = rentang sama panjang sebelumnya');
  const nov = rep({ periodType: 'month', ref: '2026-11-16' });
  assert.deepEqual(nov.period, { type: 'month', from: '2026-11-01', to: '2026-11-30', prevFrom: '2026-10-01', prevTo: '2026-10-31' });
  assert.equal(nov.prev.income, 400000);
  assert.deepEqual(nov.delta.income, { abs: 123456 - 400000, pct: Math.round(((123456 - 400000) / 400000) * 1000) / 10 });
  const wk = rep({ periodType: 'week', ref: '2026-11-18' });
  assert.deepEqual([wk.period.from, wk.period.to, wk.period.prevFrom, wk.period.prevTo], ['2026-11-16', '2026-11-22', '2026-11-09', '2026-11-15']);
  assert.equal(wk.series.granularity, 'day'); assert.equal(wk.series.buckets.length, 7);
  assert.equal(nov.series.granularity, 'week');
  assert.equal(y.series.granularity, 'month'); assert.equal(y.series.buckets.length, 12);
  for (const r of [y, nov, wk, cust]) {
    assert.equal(r.series.buckets.reduce((s, x) => s + x.income, 0), r.totals.income);
    assert.equal(r.series.buckets.reduce((s, x) => s + x.expense, 0), r.totals.expense);
    assert.equal(r.categories.reduce((s, x) => s + x.amount, 0), r.totals.expense);
  }
  // saldo akhir periode = saldo awal + semua mutasi sampai tanggal itu
  const feb = rep({ periodType: 'month', ref: '2026-02-10' });
  assert.equal(feb.balances[0].balance, 5000000 + 1000000 - 100000 + 2000000 - 50000);
  assert.equal(y.totalBalance, w.boot().dashboard.totalBalance);
  assert.equal(rep({ periodType: 'custom', from: '2026-01-01', to: '2026-01-01' }).series.buckets.length, 1);
  w.fail(w.admin, 'report.get', { periodType: 'custom', from: '2026-03-02', to: '2026-03-01' }, 'VALIDATION');
  w.fail(w.admin, 'report.get', { periodType: 'custom', from: '2000-01-01', to: '2026-03-01' }, 'VALIDATION');
  w.fail(w.admin, 'report.get', { periodType: 'decade' }, 'VALIDATION');
});

test('laporan: tabungan & anggaran vs realisasi', () => {
  const w = world();
  const { b0, bank } = seed(w);
  const g = w.mk(w.admin, 'sav.save', { name: 'Liburan', kind: 'target', targetAmount: 1000000 }).id;
  w.ok(w.admin, 'sav.move', { requestId: rid(), goalId: g, direction: 'deposit', accountId: bank, amount: 100000, date: '2026-10-20' });
  w.ok(w.admin, 'sav.move', { requestId: rid(), goalId: g, direction: 'deposit', accountId: bank, amount: 250000, date: '2026-11-05' });
  w.mk(w.admin, 'bud.save', { period: 'monthly', categoryId: 'ALL', amount: 600000 });
  const r = w.ok(w.admin, 'report.get', { periodType: 'month', ref: '2026-11-10' });
  assert.deepEqual([r.savings[0].saved, r.savings[0].movement, r.savings[0].pct], [350000, 250000, 35]);
  assert.equal(r.budgets[0].limit, 600000); assert.equal(r.budgets[0].categoryName, 'Semua pengeluaran');
});

test('ekspor xlsx/pdf: berkas sementara dibuat, diekspor dengan token OAuth, lalu dibuang; sel rumus dinetralkan', () => {
  const w = world();
  const { b0, bank, tx } = seed(w);
  tx({ type: 'income', date: '2026-11-02', amount: 1000, accountId: bank, categoryId: w.cat(b0, 'income', 'Gaji'), note: '=SUM(A1)' });
  w.mk(w.admin, 'acc.save', { name: '=cmd|evil', type: 'bank', openingBalance: 0 });
  const r = w.ok(w.admin, 'report.export', { periodType: 'month', ref: '2026-11-10', format: 'pdf' }).result;
  assert.equal(r.filename, 'laporan-keuangan-2026-11-01_2026-11-30.pdf'); assert.equal(r.mime, 'application/pdf');
  assert.equal(Buffer.from(r.base64, 'base64').toString(), '%PDF-fake');
  assert.match(w.m.lastExport.url, /format=pdf&size=A4/); assert.equal(w.m.lastExport.auth, 'Bearer oauth-token');
  assert.equal(w.m.trashed.length, 1, 'berkas sementara dibuang');
  const flat = JSON.stringify(w.m.lastExport.sheets);
  assert.ok(flat.includes("'=cmd|evil") && flat.includes("'=SUM(A1)"), 'awalan rumus dinetralkan');
  w.ok(w.admin, 'report.export', { periodType: 'year', format: 'xlsx' });
  w.fail(w.admin, 'report.export', { periodType: 'year', format: 'exe' }, 'VALIDATION');
  w.m.exportFail = true;
  w.fail(w.admin, 'report.export', { periodType: 'year', format: 'xlsx' }, 'EXPORT');
  assert.equal(w.m.trashed.length, 3, 'dibuang juga saat gagal');
  assert.equal(w.m.lock.held, false);
});

test('rekening: arsip hanya saat saldo 0; ubah saldo awal tidak boleh membuat minus', () => {
  const w = world();
  const { b0, bank, cash, tx } = seed(w);
  tx({ type: 'expense', date: '2026-11-02', amount: 900000, accountId: bank, categoryId: w.cat(b0, 'expense', 'Air') });
  w.fail(w.admin, 'acc.save', { id: bank, name: 'BCA', type: 'bank', openingBalance: 800000 }, 'INTEGRITY');
  w.fail(w.admin, 'acc.status', { id: bank, status: 'arsip' }, 'VALIDATION');
  w.ok(w.admin, 'acc.status', { id: cash, status: 'arsip' });
  w.fail(w.admin, 'tx.create', { requestId: rid(), type: 'income', date: '2026-11-02', amount: 1, accountId: cash, categoryId: w.cat(b0, 'income', 'Gaji') }, 'VALIDATION');
});

test('kategori: nama unik per jenis, arsip menyembunyikan dari transaksi baru namun riwayat tetap', () => {
  const w = world();
  const { b0, bank, tx } = seed(w);
  const air = w.cat(b0, 'expense', 'Air');
  tx({ type: 'expense', date: '2026-11-02', amount: 100, accountId: bank, categoryId: air });
  w.fail(w.admin, 'cat.save', { name: 'air', type: 'expense' }, 'VALIDATION');
  w.mk(w.admin, 'cat.save', { name: 'Air', type: 'income' });
  w.ok(w.admin, 'cat.status', { id: air, status: 'arsip' });
  w.fail(w.admin, 'tx.create', { requestId: rid(), type: 'expense', date: '2026-11-02', amount: 100, accountId: bank, categoryId: air }, 'VALIDATION');
  assert.equal(w.ok(w.admin, 'report.get', { periodType: 'month' }).categories[0].name, 'Air');
});

test('pengaturan: validasi dan efek ke target dana darurat', () => {
  const w = world();
  w.fail(w.admin, 'settings.save', { familyName: '', emergencyMonths: 6 }, 'VALIDATION');
  w.fail(w.admin, 'settings.save', { familyName: 'Z', emergencyMonths: 99 }, 'VALIDATION');
  w.ok(w.admin, 'settings.save', { familyName: 'Keluarga Kamal', emergencyMonths: 3 });
  const b = w.boot();
  assert.equal(b.settings.familyName, 'Keluarga Kamal'); assert.equal(b.emergency.months, 3);
});

test('lock: semua penulisan di bawah lock; lock dilepas saat error; sibuk → BUSY', () => {
  const w = world();
  const { bank } = seed(w); // guardWrites aktif: penulisan tanpa lock akan melempar error
  w.fail(w.admin, 'tx.create', { requestId: rid(), type: 'bogus' }, 'VALIDATION');
  assert.equal(w.m.lock.held, false);
  w.m.lock.failNext = 1;
  w.fail(w.admin, 'acc.save', { name: 'Y', type: 'bank', openingBalance: 0 }, 'BUSY');
  assert.equal(w.m.g.Db.all('Accounts').length, 2, 'tidak ada penulisan saat lock gagal');
  w.ok(w.admin, 'acc.save', { name: 'Y', type: 'bank', openingBalance: 0 });
});

test('struktur database divalidasi; error sistem tidak membocorkan detail', () => {
  const w = world();
  w.m.main.getSheetByName('Transactions').v[0][3] = 'jumlah';
  const e = w.fail(w.admin, 'tx.list', {}, 'SCHEMA');
  assert.match(e.message, /Struktur sheet Transactions tidak valid/);
  w.m.main.getSheetByName('Transactions').v[0][3] = 'amount';
  const orig = w.m.g.Db.all.bind(w.m.g.Db);
  w.m.g.Db.all = (n) => { if (n === 'Accounts') throw new Error('rahasia internal'); return orig(n); };
  const tok = w.m.addToken('baru', 'owner@gmail.com');
  const r = w.m.call(tok, 'bootstrap', {});
  assert.equal(r.error.code, 'SERVER'); assert.ok(!/rahasia/.test(JSON.stringify(r)));
});

test('pemulihan dari backup: menimpa data, membuat backup pengaman, menolak backup rusak', () => {
  const w = world();
  const { b0, bank, tx } = seed(w);
  tx({ type: 'income', date: '2026-11-02', amount: 777, accountId: bank, categoryId: w.cat(b0, 'income', 'Gaji') });
  const snapshot = w.m.main.sheets.map((s) => ({ name: s.name, v: JSON.parse(JSON.stringify(s.v, (k, x) => x)) }));
  const backup = w.m.ctx.SpreadsheetApp.create('backup');
  backup.sheets = snapshot.map((s) => { const sh = new (w.m.main.sheets[0].constructor)(backup, s.name); sh.v = s.v; return sh; });
  tx({ type: 'income', date: '2026-11-03', amount: 5, accountId: bank, categoryId: w.cat(b0, 'income', 'Gaji') });
  assert.equal(w.m.g.Db.all('Transactions').length, 2);
  w.m.guardWrites = false;
  w.m.g.restoreFromBackup(backup.getId());
  w.m.guardWrites = true;
  w.m.g.Db.reset();
  assert.equal(w.m.g.Db.all('Transactions').length, 1);
  assert.equal(w.boot().accounts.find((a) => a.id === bank).balance, 1000777);
  assert.equal(Object.keys(w.m.files).length, 1, 'backup pengaman dibuat sebelum menimpa');
  backup.sheets[3].v[0][1] = 'rusak';
  assert.throws(() => w.m.g.restoreFromBackup(backup.getId()), /tidak sesuai/);
  assert.equal(w.m.g.Db.all('Transactions').length, 1, 'data tidak berubah bila backup tidak valid');
});

test('ekspor berjalan tanpa lock, dibatasi 6 per 10 menit per pengguna', () => {
  const w = world();
  const { b0, bank, tx } = seed(w);
  tx({ type: 'income', date: '2026-11-02', amount: 1000, accountId: bank, categoryId: w.cat(b0, 'income', 'Gaji'), note: '\t=x' });
  for (let i = 0; i < 6; i++) w.ok(w.admin, 'report.export', { periodType: 'month', format: 'xlsx' });
  assert.equal(w.m.exportLockHeld, false, 'lock tidak dipegang selama ekspor Drive');
  assert.ok(JSON.stringify(w.m.lastExport.sheets).includes("'=x"), 'catatan berawalan tab+rumus: karakter kontrol dibuang, rumus dinetralkan');
  w.fail(w.admin, 'report.export', { periodType: 'month', format: 'xlsx' }, 'BUSY');
  assert.equal(w.m.lock.held, false);
  assert.equal(w.m.g.Db.all('AuditLogs').filter((l) => l.action === 'report.export').length, 6);
});

test('penolakan hak akses berulang: pencatatan audit dibatasi 20 per 10 menit', () => {
  const w = world();
  w.mk(w.admin, 'user.save', { name: 'Siti', email: 'siti@gmail.com', password: 'rahasia123', role: 'Anggota' });
  const siti = w.m.addToken('siti', 'siti@gmail.com');
  for (let i = 0; i < 30; i++) w.fail(siti, 'settings.save', { familyName: 'x', emergencyMonths: 1 }, 'FORBIDDEN');
  w.m.g.Db.reset();
  assert.equal(w.m.g.Db.all('AuditLogs').filter((l) => l.action === 'auth.denied').length, 20);
});

test('sheet tumbuh otomatis melewati 1000 baris; restore backup besar juga aman', () => {
  const w = world();
  const { b0, bank } = seed(w);
  w.m.lock.held = true;
  for (let i = 0; i < 1010; i++) w.m.g.Db.insert('AuditLogs', { id: 'log_' + i, at: '2026-11-01T00:00:00', userId: 'u', email: 'e', action: 'a', entity: '', entityId: '', detail: '' });
  w.m.lock.held = false;
  w.m.g.Db.reset();
  const n = w.m.g.Db.all('AuditLogs').length;
  assert.ok(n >= 1010);
  const big = w.m.ctx.SpreadsheetApp.create('backup');
  const Sh = w.m.main.sheets[0].constructor;
  big.sheets = w.m.main.sheets.map((s) => { const sh = new Sh(big, s.name); sh.v = JSON.parse(JSON.stringify(s.v)); return sh; });
  // sheet tujuan dikembalikan ke ukuran awal 1000 baris, lalu restore dari backup 1010+ baris
  w.m.main.getSheetByName('AuditLogs').maxRows = 1000; w.m.main.getSheetByName('AuditLogs').v = [w.m.main.getSheetByName('AuditLogs').v[0]];
  w.m.guardWrites = false; w.m.g.restoreFromBackup(big.getId()); w.m.guardWrites = true;
  w.m.g.Db.reset();
  assert.equal(w.m.g.Db.all('AuditLogs').length, n);
});

test('checkSetup: semua ✔ pada instalasi sehat; ✘ bila zona waktu salah / ada pengguna tanpa password', () => {
  const w = world();
  const run = () => vm_run(w, 'checkSetup()');
  const ok = run();
  assert.ok(ok.every((l) => l.startsWith('✔')), ok.join('\n'));
  w.m.scriptTz = 'UTC';
  w.m.guardWrites = false; w.m.g.Db.reset(); w.m.g.Db.all('Users').forEach((u) => { w.m.g.Db.update('Users', u.id, { passHash: '' }); });
  const bad = run();
  assert.ok(bad[0].startsWith('✘'), 'zona waktu');
  assert.ok(bad.some((l) => l.startsWith('✘') && /password/.test(l)), 'pengguna tanpa password');
});
function vm_run(w, code) { return require('vm').runInContext(code, w.m.ctx); }
