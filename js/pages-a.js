/** Halaman: Dashboard, Pemasukan, Pengeluaran, Transfer, Rekening. Context `App` disediakan app.js. */
const PagesA = (() => {
  const { el, idr, date, icon, btn } = UI;
  const typeLabel = { income: 'Pemasukan', expense: 'Pengeluaran', transfer: 'Transfer' };
  const typeSign = { income: '+', expense: '−', transfer: '' };
const outside = (t) => (t.refType === 'saving' ? 'Tabungan' : t.refType ? 'Pihak lain' : '–');

  const head = (title, ...actions) => el('div', { class: 'page-head' }, el('h1', { text: title }), el('div', { class: 'actions' }, ...actions));
  const kpi = (label, value, sub, cls, ico) => el('div', { class: 'card kpi ' + (cls || '') }, el('div', { class: 'label' }, ico ? icon(ico) : null, label), el('div', { class: 'value', text: value }), sub ? el('div', { class: 'sub', text: sub }) : null);
  const activeAccounts = (b) => b.accounts.filter((a) => a.status === 'aktif');
  const accOptions = (b) => activeAccounts(b).map((a) => ({ value: a.id, label: `${a.name} (${idr(a.balance)})` }));
  const catOptions = (b, type) => b.categories.filter((c) => c.type === type && c.status === 'aktif').map((c) => ({ value: c.id, label: c.name }));

  function needAccounts(b) {
    if (activeAccounts(b).length) return false;
    UI.toast('Buat rekening/dompet terlebih dahulu.', 'error');
    return true;
  }

  // ───── Form transaksi (dipakai dashboard, pemasukan, pengeluaran, transfer) ─────
  function txForm(type, existing) {
    const b = App.boot;
    if (needAccounts(b)) { App.go('rekening'); return; }
    if (type === 'transfer' && !existing && activeAccounts(b).length < 2) { UI.toast('Transfer membutuhkan minimal 2 rekening aktif.', 'error'); return; }
    const requestId = UI.requestId(); // satu per pembukaan form: klik ganda/ulang tidak menggandakan
    const linked = existing && existing.refType;
    const fields = [
      { name: 'date', label: 'Tanggal', type: 'date', required: true, maxDate: b.today, value: b.today },
      { name: 'amount', label: 'Nominal', type: 'money', required: true, min: 1 },
    ];
    if (type === 'transfer') {
      fields.push({ name: 'accountId', label: 'Dari rekening', type: 'select', required: !linked || !!(existing && existing.accountId), blank: 'Pilih rekening…', options: accOptions(b), disabled: !!linked },
        { name: 'toAccountId', label: 'Ke rekening', type: 'select', required: !linked || !!(existing && existing.toAccountId), blank: 'Pilih rekening…', options: accOptions(b), disabled: !!linked });
    } else {
      fields.push({ name: 'accountId', label: type === 'income' ? 'Masuk ke rekening' : 'Dibayar dari rekening', type: 'select', required: true, blank: 'Pilih rekening…', options: accOptions(b) },
        { name: 'categoryId', label: 'Kategori', type: 'select', required: true, blank: 'Pilih kategori…', options: catOptions(b, type) });
    }
    fields.push({ name: 'note', label: 'Catatan', type: 'textarea', max: 200, help: 'Opsional, maksimal 200 karakter' });
    UI.openForm({
      title: (existing ? 'Ubah ' : 'Tambah ') + typeLabel[type].toLowerCase(), fields, initial: existing, submitLabel: existing ? 'Simpan perubahan' : 'Simpan',
      intro: linked ? 'Transaksi ini terhubung dengan tabungan/utang. Rekening tidak dapat diubah di sini.' : null,
      onSubmit: async (v) => {
        const payload = Object.assign({}, v, existing ? { id: existing.id } : { type, requestId });
        const r = await App.write(existing ? 'tx.update' : 'tx.create', payload);
        UI.toast(r.result.duplicate ? 'Transaksi sudah tersimpan sebelumnya.' : existing ? 'Transaksi diperbarui.' : 'Transaksi tersimpan.', 'ok');
      },
    });
  }

  async function voidTx(t) {
    const ok = await UI.confirm({ title: 'Hapus transaksi?', message: `${typeLabel[t.type]} ${idr(t.amount)} tanggal ${date(t.date)} akan dibatalkan dan saldo dihitung ulang. Riwayat tetap tercatat di log aktivitas.`, confirmLabel: 'Ya, hapus', danger: true });
    if (!ok) return;
    try { await App.write('tx.void', { id: t.id }); UI.toast('Transaksi dihapus.', 'ok'); } catch (e) { UI.toast(e.message, 'error'); }
  }

  const txTitle = (t) => (t.type === 'transfer' ? `${t.accountName || outside(t)} → ${t.toAccountName || outside(t)}` : t.categoryName);
  function txColumns(withActions) {
    const cols = [
      { label: 'Tanggal', render: (t) => date(t.date) },
      { label: 'Jenis', render: (t) => el('span', { class: 'badge ' + t.type, text: typeLabel[t.type] }) },
      { label: 'Kategori / Rekening', render: (t) => el('span', { class: 'cat-cell' }, UI.avatar(t.categoryName, t.type), el('span', null, txTitle(t), t.type === 'transfer' ? null : el('span', { class: 'muted', text: ' · ' + t.accountName }))) },
      { label: 'Catatan', render: (t) => el('span', { class: 'note', text: t.note || '–' }) },
      { label: 'Nominal', align: 'r', render: (t) => el('span', { class: 'num ' + t.type, text: typeSign[t.type] + idr(t.amount) }) },
    ];
    if (withActions) {
      cols.push({ label: 'Dicatat oleh', render: (t) => t.userName || '–' }, {
        label: '', align: 'r', render: (t) => (t.canEdit ? el('span', { class: 'row-actions' },
          btn('', { class: 'btn sm icon', icon: 'edit', 'aria-label': 'Ubah transaksi', title: 'Ubah', onclick: () => txForm(t.type, t) }),
          btn('', { class: 'btn sm icon', icon: 'trash', 'aria-label': 'Hapus transaksi', title: 'Hapus', onclick: () => voidTx(t) })) : null),
      });
    }
    return cols;
  }

  /** Daftar ringkas bergaya "buku kas" untuk beranda. */
  function txList(rows) {
    if (!rows.length) return UI.empty('inbox', 'Belum ada transaksi. Mulai dengan mencatat pengeluaran pertama.', btn('Catat pengeluaran', { class: 'btn primary', onclick: () => txForm('expense') }));
    return el('ul', { class: 'txlist' }, rows.map((t) => el('li', { class: 'txitem' }, UI.avatar(t.categoryName, t.type),
      el('div', { class: 'mid' }, el('div', { class: 'ttl', text: t.note || txTitle(t) }), el('div', { class: 'meta', text: `${t.note ? txTitle(t) + ' · ' : ''}${t.type === 'transfer' ? '' : t.accountName + ' · '}${date(t.date)}` })),
      el('div', { class: 'amt ' + t.type, text: typeSign[t.type] + idr(t.amount) }))));
  }

  /** Pilihan cepat (tombol + di navigasi bawah). */
  function quickAdd() {
    let m;
    const q = (type, ico) => el('button', { class: 'quick-btn ' + type, type: 'button', onclick: () => { m.close(false); txForm(type); } }, icon(ico), el('span', { text: typeLabel[type] }));
    m = UI.openModal('Catat transaksi', el('div', { class: 'quick' }, q('expense', 'expense'), q('income', 'income'), q('transfer', 'transfer')));
  }

  // ───── Dashboard ─────
  function greeting(name) {
    const h = Number(new Intl.DateTimeFormat('en-GB', { hour: '2-digit', hour12: false, timeZone: 'Asia/Jakarta' }).format(new Date()));
    return `${h < 11 ? 'Selamat pagi' : h < 15 ? 'Selamat siang' : h < 18 ? 'Selamat sore' : 'Selamat malam'}, ${String(name).split(' ')[0]}`;
  }
  function dashboard(root) {
    const b = App.boot, d = b.dashboard;
    const accs = activeAccounts(b);
    const used = d.month.income > 0 ? Math.round((d.month.expense / d.month.income) * 100) : d.month.expense > 0 ? 100 : 0;
    const over = d.month.expense > d.month.income;
    const flowKpi = (cls, label, value, sub) => el('div', { class: 'kpi ' + cls }, el('div', { class: 'label', text: label }), el('div', { class: 'value', text: value }), sub ? el('div', { class: 'sub', text: sub }) : null);
    root.append(el('section', { class: 'hero', 'aria-label': 'Ringkasan keuangan' },
      el('div', null,
        el('h1', { class: 'hero-greet' }, el('strong', { text: greeting(b.user.name) }), ` · ${b.settings.familyName}`),
        el('div', { class: 'kpi primary' }, el('div', { class: 'label' }, icon('wallet'), 'Saldo keluarga'), el('div', { class: 'value', text: idr(d.totalBalance) }), el('div', { class: 'sub', text: `${accs.length} rekening aktif` })),
        accs.length ? el('div', { class: 'chips' }, accs.slice(0, 4).map((a) => el('span', { class: 'chip' }, a.name, el('b', { text: idr(a.balance) }))), accs.length > 4 ? el('span', { class: 'chip', text: `+${accs.length - 4} lagi` }) : null) : el('div', { style: 'height:16px' }),
        el('div', { class: 'hero-actions' }, btn('Pengeluaran', { class: 'btn gold', icon: 'expense', onclick: () => txForm('expense') }), btn('Pemasukan', { class: 'btn', icon: 'income', onclick: () => txForm('income') }), btn('Transfer', { class: 'btn', icon: 'transfer', onclick: () => txForm('transfer') }))),
      el('div', { class: 'hero-flow' },
        el('h2', { text: `Arus kas bulan ini · ${date(d.monthRange.from).slice(3)}` }),
        el('div', { class: 'ribbon' + (over ? ' over' : ''), role: 'img', 'aria-label': `Pengeluaran ${used}% dari pemasukan bulan ini` }, el('i', { style: `width:${Math.min(100, used)}%` })),
        el('div', { class: 'item-sub', style: 'color:rgba(255,255,255,.85);margin:-6px 0 0' }, el('span', { text: `Terpakai ${used}% dari pemasukan` })),
        el('div', { class: 'flow-row' }, flowKpi('inc', 'Pemasukan', idr(d.month.income)), flowKpi('exp', 'Pengeluaran', idr(d.month.expense), `Minggu ini ${idr(d.week.expense)}`)),
        el('div', { class: 'net' }, flowKpi('', 'Selisih bulan ini', (d.month.net > 0 ? '+' : '') + idr(d.month.net), d.month.net >= 0 ? 'Surplus' : 'Defisit')))));
    if (!b.accounts.length) root.append(el('div', { class: 'card', style: 'margin-bottom:16px' }, UI.empty('wallet', 'Selamat datang! Mulai dengan menambahkan rekening, dompet tunai, atau e-wallet beserta saldo awalnya.', btn('Tambah rekening pertama', { class: 'btn primary', onclick: () => { App.go('rekening'); } }))));

    const monthBud = b.budgets.filter((x) => x.period === 'monthly').sort((x, y) => y.pct - x.pct);
    root.append(el('div', { class: 'bento' },
      el('section', { class: 'card span-2', 'aria-labelledby': 'h-trend' }, el('div', { class: 'card-head' }, el('h2', { id: 'h-trend', text: 'Pemasukan dan pengeluaran, 6 bulan terakhir' })), Charts.bars(d.trend.buckets, 'Grafik batang pemasukan dan pengeluaran per bulan selama 6 bulan terakhir')),
      el('section', { class: 'card', 'aria-labelledby': 'h-cat' }, el('div', { class: 'card-head' }, el('h2', { id: 'h-cat', text: 'Pengeluaran bulan ini per kategori' })), Charts.donut(d.topCategories, d.month.expense))));

    root.append(el('div', { class: 'bento' },
      el('section', { class: 'card' }, el('div', { class: 'card-head' }, el('h2', { text: 'Anggaran bulan ini' }), btn('Kelola', { class: 'btn sm', onclick: () => App.go('anggaran') })),
        monthBud.length ? el('ul', { class: 'list' }, monthBud.slice(0, 4).map((x) => el('li', null, el('div', { class: 'item-top' }, el('span', { text: x.categoryName }), el('span', { class: 'badge ' + (x.state === 'over' ? 'expense' : x.state === 'warn' ? 'warn' : ''), text: x.state === 'over' ? 'Melebihi' : UI.pct(x.pct) })),
          el('div', { class: 'prog ' + (x.state === 'ok' ? '' : x.state), role: 'img', 'aria-label': `${x.pct}% terpakai` }, el('i', { style: `width:${Math.min(100, x.pct)}%` })), el('div', { class: 'item-sub' }, el('span', { class: 'num', text: `${idr(x.spent)} dari ${idr(x.limit)}` }))))) : el('p', { class: 'muted', text: 'Belum ada anggaran bulanan. Atur batas per kategori agar pengeluaran terpantau.' })),
      el('section', { class: 'card' }, el('h2', { text: 'Tabungan dan kewajiban' }), el('ul', { class: 'list', style: 'gap:12px' },
        el('li', { class: 'item-top', style: 'margin:0' }, el('span', { text: 'Total tabungan' }), el('strong', { class: 'num income', text: idr(d.totalSaved) })),
        el('li', { class: 'item-top', style: 'margin:0' }, el('span', { text: 'Sisa utang dan cicilan' }), el('strong', { class: 'num expense', text: idr(d.totalDebt) })),
        el('li', { class: 'item-top', style: 'margin:0' }, el('span', { text: 'Piutang' }), el('strong', { class: 'num', text: idr(d.totalReceivable) })),
        el('li', { class: 'item-top', style: 'margin:0' }, el('span', { text: 'Dana darurat' }), el('strong', { class: 'num', text: b.emergency.coverage == null ? '–' : String(b.emergency.coverage).replace('.', ',') + ' bulan' })),
        el('li', { class: 'item-sub', style: 'margin:0' }, el('span', { text: `Target ${b.emergency.months} bulan pengeluaran` })))),
      el('section', { class: 'card' }, el('div', { class: 'card-head' }, el('h2', { text: 'Rekening' }), btn('Kelola', { class: 'btn sm', onclick: () => App.go('rekening') })),
        accs.length ? el('ul', { class: 'list', style: 'gap:12px' }, accs.map((a) => el('li', { class: 'item-top', style: 'margin:0;align-items:center' }, el('span', { class: 'cat-cell' }, UI.avatar(a.name), el('span', null, a.name, el('span', { class: 'muted', style: 'display:block;font-size:.8125rem', text: { bank: 'Bank', tunai: 'Tunai', ewallet: 'E-wallet' }[a.type] }))), el('strong', { class: 'num', text: idr(a.balance) })))) : el('p', { class: 'muted', text: 'Belum ada rekening.' }))));

    root.append(el('section', { class: 'card' }, el('div', { class: 'card-head' }, el('h2', { text: 'Transaksi terakhir' }), btn('Lihat semua', { class: 'btn sm', onclick: () => App.go('pengeluaran') })), txList(d.recent)));
  }

  // ───── Daftar transaksi per jenis ─────
  function txPage(type) {
    return (root) => {
      const b = App.boot;
      const st = App.state['tx_' + type] || (App.state['tx_' + type] = { q: '', accountId: '', categoryId: '', from: '', to: '', page: 1 });
      const sum = el('div', { class: 'grid g-kpi' });
      const holder = el('div');
      const filterRow = el('div', { class: 'filters' });
      const q = el('input', { class: 'input', type: 'search', placeholder: 'Cari catatan/nominal…', 'aria-label': 'Cari', value: st.q, maxlength: 60 });
      const acc = el('select', { class: 'input', 'aria-label': 'Filter rekening' }, el('option', { value: '', text: 'Semua rekening' }), b.accounts.map((a) => el('option', { value: a.id, text: a.name })));
      acc.value = st.accountId;
      const cat = type === 'transfer' ? null : el('select', { class: 'input', 'aria-label': 'Filter kategori' }, el('option', { value: '', text: 'Semua kategori' }), b.categories.filter((c) => c.type === type).map((c) => el('option', { value: c.id, text: c.name })));
      if (cat) cat.value = st.categoryId;
      const from = el('input', { class: 'input', type: 'date', 'aria-label': 'Dari tanggal', value: st.from });
      const to = el('input', { class: 'input', type: 'date', 'aria-label': 'Sampai tanggal', value: st.to });
      filterRow.append(...[q, acc, cat, from, to].filter(Boolean)); // append(null) akan menulis teks "null"
      let seq = 0;
      const load = async () => {
        const my = ++seq;
        holder.replaceChildren(el('div', { class: 'skeleton', style: 'height:160px' }));
        try {
          const r = await App.read('tx.list', { type, q: st.q, accountId: st.accountId, categoryId: st.categoryId, from: st.from, to: st.to, page: st.page });
          if (my !== seq) return;
          st.page = r.page;
          sum.replaceChildren(kpi('Total ' + typeLabel[type].toLowerCase() + ' (sesuai filter)', idr(r.sum[type]), `${r.total} transaksi`, '', type));
          holder.replaceChildren(...[UI.table(txColumns(true), r.rows, UI.empty('inbox', r.total || st.q || st.from || st.to || st.accountId || st.categoryId ? 'Tidak ada transaksi yang cocok dengan filter.' : `Belum ada ${typeLabel[type].toLowerCase()}.`, btn('Tambah ' + typeLabel[type].toLowerCase(), { class: 'btn primary', onclick: () => txForm(type) }))), UI.pager(r, (p) => { st.page = p; load(); })].filter(Boolean));
        } catch (e) { if (my === seq) holder.replaceChildren(el('div', { class: 'callout error', role: 'alert', text: e.message }), btn('Coba lagi', { class: 'btn', style: 'margin-top:8px', onclick: load })); }
      };
      const apply = () => { st.q = q.value.trim(); st.accountId = acc.value; st.categoryId = cat ? cat.value : ''; st.from = from.value; st.to = to.value; st.page = 1; load(); };
      q.addEventListener('input', UI.debounce(apply, 350));
      [acc, cat, from, to].forEach((x) => x && x.addEventListener('change', apply));
      root.append(...[head(typeLabel[type], btn('Tambah ' + typeLabel[type].toLowerCase(), { class: 'btn primary', icon: 'plus', onclick: () => txForm(type) })),
        type === 'transfer' ? el('p', { class: 'help', style: 'margin:-8px 0 16px', text: 'Transfer memindahkan saldo antar rekening dan tidak dihitung sebagai pemasukan atau pengeluaran. Setoran tabungan dan pembayaran utang juga tampil di sini.' }) : null,
        sum, el('section', { class: 'card' }, filterRow, holder)].filter(Boolean));
      load();
    };
  }

  // ───── Rekening ─────
  function accForm(a) {
    UI.openForm({
      title: a ? 'Ubah rekening' : 'Tambah rekening', initial: a, submitLabel: 'Simpan',
      fields: [
        { name: 'name', label: 'Nama rekening/dompet', type: 'text', required: true, max: 60, placeholder: 'mis. BCA Utama, Dompet, GoPay' },
        { name: 'type', label: 'Jenis', type: 'select', required: true, options: [{ value: 'bank', label: 'Rekening bank' }, { value: 'tunai', label: 'Uang tunai' }, { value: 'ewallet', label: 'E-wallet' }] },
        { name: 'openingBalance', label: 'Saldo awal', type: 'money', required: true, min: 0, help: 'Saldo saat mulai dicatat di aplikasi. Mutasi berikutnya dihitung dari transaksi.' },
      ],
      onSubmit: async (v) => { await App.write('acc.save', Object.assign({}, v, a ? { id: a.id } : {})); UI.toast('Rekening tersimpan.', 'ok'); },
    });
  }
  function rekening(root) {
    const b = App.boot, admin = App.isAdmin();
    root.append(head('Rekening & dompet', admin ? btn('Tambah rekening', { class: 'btn primary', icon: 'plus', onclick: () => accForm() }) : null));
    if (!admin) root.append(el('p', { class: 'help', style: 'margin:-8px 0 16px', text: 'Hanya Admin yang dapat menambah atau mengubah rekening.' }));
    root.append(el('div', { class: 'grid g-kpi' }, kpi('Total saldo', idr(b.dashboard.totalBalance), `${activeAccounts(b).length} rekening aktif`, 'primary', 'wallet')));
    const typeName = { bank: 'Bank', tunai: 'Tunai', ewallet: 'E-wallet' };
    root.append(el('section', { class: 'card' }, UI.table([
      { label: 'Nama', render: (a) => el('span', null, a.name, a.status === 'arsip' ? el('span', { class: 'badge', style: 'margin-left:8px', text: 'Diarsipkan' }) : null) },
      { label: 'Jenis', render: (a) => typeName[a.type] },
      { label: 'Saldo awal', align: 'r', render: (a) => el('span', { class: 'num', text: idr(a.openingBalance) }) },
      { label: 'Saldo saat ini', align: 'r', render: (a) => el('strong', { class: 'num', text: idr(a.balance) }) },
      { label: '', align: 'r', render: (a) => (admin ? el('span', { class: 'row-actions' },
        btn('', { class: 'btn sm icon', icon: 'edit', 'aria-label': 'Ubah ' + a.name, onclick: () => accForm(a) }),
        btn('', { class: 'btn sm icon', icon: 'archive', 'aria-label': (a.status === 'aktif' ? 'Arsipkan ' : 'Aktifkan ') + a.name, title: a.status === 'aktif' ? 'Arsipkan' : 'Aktifkan', onclick: async () => {
          const next = a.status === 'aktif' ? 'arsip' : 'aktif';
          if (next === 'arsip' && !(await UI.confirm({ title: 'Arsipkan rekening?', message: `"${a.name}" tidak akan muncul di pilihan transaksi baru. Riwayat tetap tersimpan.`, confirmLabel: 'Arsipkan' }))) return;
          try { await App.write('acc.status', { id: a.id, status: next }); UI.toast(next === 'arsip' ? 'Rekening diarsipkan.' : 'Rekening diaktifkan.', 'ok'); } catch (e) { UI.toast(e.message, 'error'); }
        } })) : null) },
    ], b.accounts, UI.empty('wallet', 'Belum ada rekening.', admin ? btn('Tambah rekening', { class: 'btn primary', onclick: () => accForm() }) : null))));
  }

  return { dashboard, pemasukan: txPage('income'), pengeluaran: txPage('expense'), transfer: txPage('transfer'), rekening, txForm, quickAdd, head, kpi, activeAccounts, accOptions, catOptions };
})();
