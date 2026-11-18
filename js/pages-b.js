/** Halaman: Anggaran, Tabungan, Dana Darurat, Utang/Piutang/Cicilan, Laporan, Anggota, Pengaturan. */
const PagesB = (() => {
  const { el, idr, date, icon, btn } = UI;
  const { head, kpi, activeAccounts, accOptions } = PagesA;
  const progCls = (state) => (state === 'over' ? 'over' : state === 'warn' ? 'warn' : '');
  const guard = async (fn, okMsg) => { try { const r = await fn(); if (okMsg) UI.toast(okMsg, 'ok'); return r; } catch (e) { UI.toast(e.message, 'error'); } };
  const rowBtns = (...b) => el('span', { class: 'row-actions' }, ...b);

  // ───── Anggaran ─────
  function budForm(x) {
    const b = App.boot;
    UI.openForm({
      title: x ? 'Ubah anggaran' : 'Tambah anggaran', initial: x, submitLabel: 'Simpan',
      fields: [
        { name: 'period', label: 'Periode', type: 'select', required: true, options: [{ value: 'monthly', label: 'Bulanan' }, { value: 'weekly', label: 'Mingguan (Senin–Minggu)' }] },
        { name: 'categoryId', label: 'Kategori', type: 'select', required: true, options: [{ value: 'ALL', label: 'Semua pengeluaran' }].concat(PagesA.catOptions(b, 'expense')) },
        { name: 'amount', label: 'Batas anggaran', type: 'money', required: true, min: 1 },
      ],
      onSubmit: async (v) => { await App.write('bud.save', Object.assign({}, v, x ? { id: x.id } : {})); UI.toast('Anggaran tersimpan.', 'ok'); },
    });
  }
  function anggaran(root) {
    const b = App.boot, admin = App.isAdmin();
    root.append(head('Anggaran', admin ? btn('Tambah anggaran', { class: 'btn primary', icon: 'plus', onclick: () => budForm() }) : null));
    root.append(el('p', { class: 'help', style: 'margin:-8px 0 16px', text: 'Realisasi dihitung dari pengeluaran pada minggu (Senin–Minggu) atau bulan berjalan. Transfer, setoran tabungan, dan pembayaran utang tidak dihitung.' }));
    const section = (title, list) => el('section', { class: 'card', style: 'margin-bottom:16px' }, el('h2', { text: title }),
      list.length ? el('ul', { class: 'list' }, list.map((x) => el('li', null,
        el('div', { class: 'item-top' }, el('strong', { text: x.categoryName }), el('span', { style: 'display:flex;gap:8px;align-items:center' }, el('span', { class: 'badge ' + (x.state === 'over' ? 'expense' : x.state === 'warn' ? 'warn' : 'income'), text: x.state === 'over' ? 'Melebihi anggaran' : x.state === 'warn' ? 'Hampir habis' : 'Aman' }),
          admin ? rowBtns(btn('', { class: 'btn sm icon', icon: 'edit', 'aria-label': 'Ubah anggaran ' + x.categoryName, onclick: () => budForm(x) }),
            btn('', { class: 'btn sm icon', icon: 'trash', 'aria-label': 'Hapus anggaran ' + x.categoryName, onclick: async () => { if (await UI.confirm({ title: 'Hapus anggaran?', message: `Anggaran ${x.categoryName} akan dihapus. Transaksi tidak terpengaruh.`, danger: true, confirmLabel: 'Hapus' })) guard(() => App.write('bud.delete', { id: x.id }), 'Anggaran dihapus.'); } })) : null)),
        el('div', { class: 'prog ' + progCls(x.state), role: 'img', 'aria-label': `${x.pct}% terpakai` }, el('i', { style: `width:${Math.min(100, x.pct)}%` })),
        el('div', { class: 'item-sub' }, el('span', { class: 'num', text: `Terpakai ${idr(x.spent)} dari ${idr(x.limit)} (${UI.pct(x.pct)})` }), el('span', { class: 'num ' + (x.remaining < 0 ? 'expense' : ''), text: x.remaining >= 0 ? `Sisa ${idr(x.remaining)}` : `Lebih ${idr(-x.remaining)}` }))))) :
        UI.empty('budget', 'Belum ada anggaran.', admin ? btn('Tambah anggaran', { class: 'btn primary', onclick: () => budForm() }) : null));
    const m = b.budgets.filter((x) => x.period === 'monthly'), w = b.budgets.filter((x) => x.period === 'weekly');
    const mr = b.dashboard.monthRange, wr = b.dashboard.weekRange;
    root.append(section(`Bulanan · ${date(mr.from)} – ${date(mr.to)}`, m), section(`Mingguan · ${date(wr.from)} – ${date(wr.to)}`, w));
  }

  // ───── Tabungan ─────
  function savForm(x, kind) {
    UI.openForm({
      title: x ? 'Ubah target' : kind === 'darurat' ? 'Buat dana darurat' : 'Tambah target tabungan', initial: x, submitLabel: 'Simpan',
      fields: [
        { name: 'name', label: 'Nama', type: 'text', required: true, max: 60, placeholder: kind === 'darurat' ? 'Dana Darurat' : 'mis. Liburan, DP Rumah, Pendidikan Anak' },
        { name: 'targetAmount', label: 'Target nominal', type: 'money', min: 0, help: 'Kosongkan jika belum ada target' },
        { name: 'targetDate', label: 'Target tanggal', type: 'date', help: 'Opsional' },
      ],
      onSubmit: async (v) => { await App.write('sav.save', Object.assign({}, v, x ? { id: x.id } : { kind: kind || 'target', requestId: UI.requestId() })); UI.toast('Tersimpan.', 'ok'); },
    });
  }
  function moveForm(goal, direction) {
    const b = App.boot;
    if (!activeAccounts(b).length) { UI.toast('Buat rekening terlebih dahulu.', 'error'); return; }
    const requestId = UI.requestId();
    UI.openForm({
      title: (direction === 'deposit' ? 'Setor ke ' : 'Tarik dari ') + goal.name, submitLabel: direction === 'deposit' ? 'Setor' : 'Tarik',
      intro: `Saldo pos saat ini ${idr(goal.saved)}. Perpindahan ini bukan pemasukan/pengeluaran.`,
      fields: [
        { name: 'date', label: 'Tanggal', type: 'date', required: true, maxDate: b.today, value: b.today },
        { name: 'accountId', label: direction === 'deposit' ? 'Dari rekening' : 'Ke rekening', type: 'select', required: true, blank: 'Pilih rekening…', options: accOptions(b) },
        { name: 'amount', label: 'Nominal', type: 'money', required: true, min: 1 },
        { name: 'note', label: 'Catatan', type: 'text', max: 200 },
      ],
      onSubmit: async (v) => { const r = await App.write('sav.move', Object.assign({}, v, { goalId: goal.id, direction, requestId })); UI.toast(r.result.duplicate ? 'Sudah tersimpan sebelumnya.' : direction === 'deposit' ? 'Setoran tersimpan.' : 'Penarikan tersimpan.', 'ok'); },
    });
  }
  function goalCard(g, admin) {
    const pct = g.pct == null ? null : Math.min(100, g.pct);
    return el('li', { class: 'card' },
      el('div', { class: 'item-top' }, el('h3', { text: g.name }), g.status === 'arsip' ? el('span', { class: 'badge', text: 'Diarsipkan' }) : null),
      el('div', { class: 'kpi' }, el('div', { class: 'value num', text: idr(g.saved) }), el('div', { class: 'sub', text: g.targetAmount ? `dari target ${idr(g.targetAmount)}${g.targetDate ? ' · ' + date(g.targetDate) : ''}` : 'Tanpa target nominal' })),
      g.targetAmount ? el('div', { class: 'prog good', role: 'img', 'aria-label': `${g.pct}% tercapai`, style: 'margin:8px 0' }, el('i', { style: `width:${pct}%` })) : null,
      g.targetAmount ? el('div', { class: 'item-sub' }, el('span', { text: `${UI.pct(g.pct)} tercapai` }), el('span', { class: 'num', text: g.saved >= g.targetAmount ? 'Target tercapai' : `Kurang ${idr(g.targetAmount - g.saved)}` })) : null,
      g.status === 'aktif' ? el('div', { style: 'display:flex;gap:8px;flex-wrap:wrap;margin-top:12px' },
        btn('Setor', { class: 'btn sm primary', icon: 'plus', onclick: () => moveForm(g, 'deposit') }),
        btn('Tarik', { class: 'btn sm', disabled: g.saved <= 0, onclick: () => moveForm(g, 'withdraw') }),
        admin ? btn('', { class: 'btn sm icon', icon: 'edit', 'aria-label': 'Ubah ' + g.name, onclick: () => savForm(g) }) : null,
        admin ? btn('', { class: 'btn sm icon', icon: 'archive', 'aria-label': 'Arsipkan ' + g.name, onclick: async () => { if (await UI.confirm({ title: 'Arsipkan target?', message: `"${g.name}" akan disembunyikan. Hanya bisa jika saldonya Rp 0.`, confirmLabel: 'Arsipkan' })) guard(() => App.write('sav.status', { id: g.id, status: 'arsip' }), 'Target diarsipkan.'); } }) : null) : null);
  }
  function tabungan(root) {
    const b = App.boot, admin = App.isAdmin();
    const goals = b.savings.filter((s) => s.kind === 'target' && s.status === 'aktif');
    root.append(head('Tabungan & target', admin ? btn('Tambah target', { class: 'btn primary', icon: 'plus', onclick: () => savForm(null, 'target') }) : null));
    root.append(el('div', { class: 'grid g-kpi' }, kpi('Total tabungan target', idr(goals.reduce((s, x) => s + x.saved, 0)), `${goals.length} target aktif`, 'primary', 'savings')));
    root.append(goals.length ? el('ul', { class: 'grid g-3', style: 'list-style:none;padding:0;margin:0' }, goals.map((g) => goalCard(g, admin))) : el('div', { class: 'card' }, UI.empty('savings', 'Belum ada target tabungan.', admin ? btn('Tambah target', { class: 'btn primary', onclick: () => savForm(null, 'target') }) : null)));
  }

  // ───── Dana darurat ─────
  function darurat(root) {
    const b = App.boot, admin = App.isAdmin(), e = b.emergency;
    const funds = b.savings.filter((s) => s.kind === 'darurat' && s.status === 'aktif');
    root.append(head('Dana darurat', admin ? btn('Buat pos dana darurat', { class: 'btn primary', icon: 'plus', onclick: () => savForm(null, 'darurat') }) : null));
    const basisTxt = { none: 'Belum ada data pengeluaran', prior: 'Rata-rata pengeluaran ≤3 bulan penuh terakhir', current: 'Berdasarkan pengeluaran bulan berjalan (data masih sedikit)' }[e.basis];
    const cov = e.coverage;
    root.append(el('div', { class: 'grid g-kpi' },
      kpi('Dana darurat terkumpul', idr(e.saved), `${funds.length} pos aktif`, 'primary', 'shield'),
      kpi('Pengeluaran bulanan (rata-rata)', idr(e.avgMonthlyExpense), basisTxt, '', 'expense'),
      kpi(`Target ${e.months} bulan`, idr(e.suggestedTarget), 'Disarankan dari rata-rata pengeluaran', '', 'savings'),
      kpi('Cakupan saat ini', cov == null ? '–' : String(cov).replace('.', ',') + ' bulan', cov == null ? 'Butuh data pengeluaran' : cov >= e.months ? 'Target tercapai' : `Kurang ${String(Math.max(0, Math.round((e.months - cov) * 10) / 10)).replace('.', ',')} bulan`, '', 'chart')));
    if (e.suggestedTarget > 0) {
      const p = Math.min(100, Math.round((e.saved / e.suggestedTarget) * 1000) / 10);
      root.append(el('section', { class: 'card', style: 'margin-bottom:16px' }, el('h2', { text: 'Progres menuju target disarankan' }), el('div', { class: 'prog good', role: 'img', 'aria-label': p + '% tercapai' }, el('i', { style: `width:${p}%` })), el('div', { class: 'item-sub' }, el('span', { text: UI.pct(p) + ' tercapai' }), el('span', { class: 'num', text: `${idr(e.saved)} / ${idr(e.suggestedTarget)}` }))));
    }
    root.append(funds.length ? el('ul', { class: 'grid g-3', style: 'list-style:none;padding:0;margin:0' }, funds.map((g) => goalCard(g, admin))) : el('div', { class: 'card' }, UI.empty('shield', 'Belum ada pos dana darurat. Buat satu pos untuk mulai menyetor.', admin ? btn('Buat pos dana darurat', { class: 'btn primary', onclick: () => savForm(null, 'darurat') }) : null)));
  }

  // ───── Utang, piutang, cicilan ─────
  const kindName = { utang: 'Utang', piutang: 'Piutang', cicilan: 'Cicilan' };
  function debtForm(x) {
    const b = App.boot;
    const requestId = UI.requestId();
    const fields = [
      x ? null : { name: 'kind', label: 'Jenis', type: 'select', required: true, options: [{ value: 'utang', label: 'Utang (saya berutang)' }, { value: 'piutang', label: 'Piutang (orang berutang ke saya)' }, { value: 'cicilan', label: 'Cicilan (kredit/angsuran)' }] },
      { name: 'party', label: 'Nama pihak / keterangan', type: 'text', required: true, max: 60 },
      { name: 'principal', label: 'Nominal pokok', type: 'money', required: true, min: 1 },
      x ? null : { name: 'startDate', label: 'Tanggal mulai', type: 'date', required: true, maxDate: undefined, value: b.today },
      { name: 'dueDate', label: 'Jatuh tempo', type: 'date', help: 'Opsional' },
      { name: 'installmentAmount', label: 'Nominal cicilan per periode', type: 'money', min: 0, help: 'Opsional, sebagai pengingat' },
      { name: 'installmentCount', label: 'Jumlah cicilan', type: 'int', help: 'Opsional' },
      x ? null : { name: 'accountId', label: 'Rekening terkait pencairan', type: 'select', blank: 'Tidak dicatat ke rekening', options: accOptions(b), help: 'Utang: dana masuk ke rekening. Piutang: dana keluar dari rekening. Cicilan: abaikan. Dicatat sebagai transfer, bukan pemasukan/pengeluaran.' },
      { name: 'note', label: 'Catatan', type: 'textarea', max: 200 },
    ].filter(Boolean);
    UI.openForm({
      title: x ? 'Ubah ' + kindName[x.kind].toLowerCase() : 'Tambah utang / piutang / cicilan', initial: x, fields, submitLabel: 'Simpan',
      onSubmit: async (v) => { const r = await App.write('debt.save', Object.assign({}, v, x ? { id: x.id } : { requestId })); UI.toast(r.result.duplicate ? 'Sudah tersimpan sebelumnya.' : 'Tersimpan.', 'ok'); },
    });
  }
  function payForm(d) {
    const b = App.boot;
    if (!activeAccounts(b).length) { UI.toast('Buat rekening terlebih dahulu.', 'error'); return; }
    const requestId = UI.requestId();
    const verb = d.kind === 'piutang' ? 'Terima pembayaran dari ' : 'Bayar ';
    const fields = [
      { name: 'date', label: 'Tanggal', type: 'date', required: true, maxDate: b.today, value: b.today },
      { name: 'amount', label: 'Nominal', type: 'money', required: true, min: 1, value: Math.min(d.outstanding, d.installmentAmount || d.outstanding), help: `Sisa ${idr(d.outstanding)}` },
      { name: 'accountId', label: d.kind === 'piutang' ? 'Diterima di rekening' : 'Dibayar dari rekening', type: 'select', required: true, blank: 'Pilih rekening…', options: accOptions(b) },
    ];
    if (d.kind === 'cicilan') fields.push({ name: 'categoryId', label: 'Kategori pengeluaran', type: 'select', required: true, blank: 'Pilih kategori…', options: PagesA.catOptions(b, 'expense'), value: (b.categories.find((c) => c.name === 'Cicilan' && c.status === 'aktif') || {}).id, help: 'Cicilan dihitung sebagai pengeluaran.' });
    fields.push({ name: 'note', label: 'Catatan', type: 'text', max: 200 });
    UI.openForm({
      title: verb + d.party, fields, submitLabel: 'Simpan pembayaran',
      intro: d.kind === 'utang' ? 'Pembayaran utang dicatat sebagai transfer keluar (bukan pengeluaran).' : d.kind === 'piutang' ? 'Penerimaan piutang dicatat sebagai transfer masuk (bukan pemasukan).' : null,
      onSubmit: async (v) => { const r = await App.write('debt.pay', Object.assign({}, v, { debtId: d.id, requestId })); UI.toast(r.result.duplicate ? 'Sudah tersimpan sebelumnya.' : 'Pembayaran tersimpan.', 'ok'); },
    });
  }
  function utang(root) {
    const b = App.boot, admin = App.isAdmin(), t = b.dashboard;
    root.append(head('Utang, piutang & cicilan', admin ? btn('Tambah', { class: 'btn primary', icon: 'plus', onclick: () => debtForm() }) : null));
    root.append(el('div', { class: 'grid g-kpi' }, kpi('Sisa utang & cicilan', idr(t.totalDebt), 'Yang harus dibayar', 'primary', 'debt'), kpi('Piutang', idr(t.totalReceivable), 'Yang akan diterima', '', 'income')));
    const state = App.state.debtTab || (App.state.debtTab = 'aktif');
    const tabs = el('div', { class: 'seg', role: 'group', 'aria-label': 'Filter status' }, ['aktif', 'lunas'].map((k) => el('button', { type: 'button', 'aria-pressed': String(state === k), onclick: () => { App.state.debtTab = k; App.render(); } }, k === 'aktif' ? 'Berjalan' : 'Lunas')));
    const list = b.debts.filter((d) => (state === 'lunas') === d.settled);
    root.append(el('div', { style: 'margin-bottom:12px' }, tabs));
    root.append(el('section', { class: 'card' }, list.length ? el('ul', { class: 'list' }, list.map((d) => {
      const p = Math.min(100, Math.round((d.paid / d.principal) * 1000) / 10);
      const overdue = d.dueDate && !d.settled && d.dueDate < b.today;
      return el('li', null,
        el('div', { class: 'item-top' }, el('span', null, el('strong', { text: d.party }), ' ', el('span', { class: 'badge ' + (d.kind === 'piutang' ? 'income' : 'expense'), text: kindName[d.kind] }), overdue ? el('span', { class: 'badge warn', style: 'margin-left:6px', text: 'Lewat jatuh tempo' }) : null),
          el('span', { style: 'display:flex;gap:6px;flex-wrap:wrap' }, !d.settled ? btn(d.kind === 'piutang' ? 'Terima' : 'Bayar', { class: 'btn sm primary', onclick: () => payForm(d) }) : null,
            admin ? btn('', { class: 'btn sm icon', icon: 'edit', 'aria-label': 'Ubah ' + d.party, onclick: () => debtForm(d) }) : null,
            admin ? btn('', { class: 'btn sm icon', icon: 'trash', 'aria-label': 'Hapus ' + d.party, onclick: async () => { if (await UI.confirm({ title: 'Hapus data?', message: `"${d.party}" akan dihapus (hanya bisa jika belum ada pembayaran).`, danger: true, confirmLabel: 'Hapus' })) guard(() => App.write('debt.delete', { id: d.id }), 'Dihapus.'); } }) : null)),
        el('div', { class: 'prog ' + (d.settled ? 'good' : ''), role: 'img', 'aria-label': p + '% terbayar' }, el('i', { style: `width:${p}%` })),
        el('div', { class: 'item-sub' }, el('span', { class: 'num', text: `Dibayar ${idr(d.paid)} dari ${idr(d.principal)}` }), el('span', { class: 'num', text: d.settled ? 'Lunas' : `Sisa ${idr(d.outstanding)}` })),
        el('div', { class: 'item-sub' }, el('span', { text: `Mulai ${date(d.startDate)}${d.dueDate ? ' · Jatuh tempo ' + date(d.dueDate) : ''}` }), d.installmentAmount ? el('span', { class: 'num', text: `Cicilan ${idr(d.installmentAmount)}${d.installmentCount ? ' × ' + d.installmentCount : ''}` }) : null),
        d.note ? el('div', { class: 'help', text: d.note }) : null);
    })) : UI.empty('debt', state === 'lunas' ? 'Belum ada yang lunas.' : 'Tidak ada utang, piutang, atau cicilan berjalan.', admin && state === 'aktif' ? btn('Tambah', { class: 'btn primary', onclick: () => debtForm() }) : null)));
  }

  // ───── Laporan ─────
  function laporan(root) {
    const b = App.boot;
    const st = App.state.report || (App.state.report = { periodType: 'month', ref: b.today, from: b.today.slice(0, 8) + '01', to: b.today });
    const holder = el('div');
    const typeSel = el('div', { class: 'seg', role: 'group', 'aria-label': 'Jenis periode' });
    const refIn = el('input', { class: 'input', type: 'date', 'aria-label': 'Tanggal acuan periode', value: st.ref, max: '2100-12-31' });
    const fromIn = el('input', { class: 'input', type: 'date', 'aria-label': 'Dari tanggal', value: st.from });
    const toIn = el('input', { class: 'input', type: 'date', 'aria-label': 'Sampai tanggal', value: st.to });
    const names = { week: 'Mingguan', month: 'Bulanan', year: 'Tahunan', custom: 'Khusus' };
    const dates = el('div', { class: 'filters', style: 'max-width:520px' });
    const payload = () => (st.periodType === 'custom' ? { periodType: 'custom', from: st.from, to: st.to } : { periodType: st.periodType, ref: st.ref });
    const syncUi = () => {
      typeSel.replaceChildren(...Object.keys(names).map((k) => el('button', { type: 'button', 'aria-pressed': String(st.periodType === k), onclick: () => { st.periodType = k; syncUi(); load(); } }, names[k])));
      dates.replaceChildren(...(st.periodType === 'custom' ? [el('label', { class: 'help' }, 'Dari', fromIn), el('label', { class: 'help' }, 'Sampai', toIn)] : [el('label', { class: 'help' }, 'Tanggal dalam periode', refIn)]));
    };
    let seq = 0;
    async function load() {
      const my = ++seq;
      holder.replaceChildren(el('div', { class: 'skeleton', style: 'height:200px' }));
      try { const r = await App.read('report.get', payload()); if (my === seq) holder.replaceChildren(renderReport(r)); }
      catch (e) { if (my === seq) holder.replaceChildren(el('div', { class: 'callout error', role: 'alert', text: e.message })); }
    }
    const exp = (fmt) => async (ev) => {
      const bt = ev.currentTarget;
      bt.disabled = true; UI.Busy.on();
      try {
        const r = await App.exportReport(Object.assign(payload(), { format: fmt }));
        UI.download(r.base64, r.filename, r.mime); UI.toast('Berkas diunduh: ' + r.filename, 'ok');
      } catch (e) { UI.toast(e.message, 'error'); } finally { bt.disabled = false; UI.Busy.off(); }
    };
    [refIn, fromIn, toIn].forEach((i) => i.addEventListener('change', () => { st.ref = refIn.value || st.ref; st.from = fromIn.value || st.from; st.to = toIn.value || st.to; load(); }));
    syncUi();
    root.append(head('Laporan', btn('Ekspor Excel', { class: 'btn', icon: 'download', onclick: exp('xlsx') }), btn('Ekspor PDF', { class: 'btn', icon: 'download', onclick: exp('pdf') })),
      el('section', { class: 'card', style: 'margin-bottom:16px' }, typeSel, el('div', { style: 'margin-top:12px' }, dates)), holder);
    load();
  }
  function renderReport(r) {
    const p = r.period, dl = (d) => {
      if (d.pct == null) return d.abs === 0 ? 'sama dengan periode sebelumnya' : (d.abs > 0 ? '+' : '−') + idr(Math.abs(d.abs)) + ' vs sebelumnya';
      return `${d.abs > 0 ? '▲' : d.abs < 0 ? '▼' : '='} ${UI.pct(Math.abs(d.pct))} vs sebelumnya`;
    };
    const wrap = el('div');
    wrap.append(el('p', { class: 'help', style: 'margin-bottom:12px', text: `Periode ${date(p.from)} – ${date(p.to)} · dibandingkan ${date(p.prevFrom)} – ${date(p.prevTo)}` }));
    wrap.append(el('div', { class: 'grid g-kpi' },
      kpi('Total pemasukan', idr(r.totals.income), dl(r.delta.income), '', 'income'), kpi('Total pengeluaran', idr(r.totals.expense), dl(r.delta.expense), '', 'expense'),
      kpi('Selisih (pemasukan − pengeluaran)', (r.totals.net > 0 ? '+' : '') + idr(r.totals.net), `Sebelumnya ${idr(r.prev.net)}`, '', 'chart'), kpi('Total saldo akhir periode', idr(r.totalBalance), `${r.balances.length} rekening`, 'primary', 'wallet')));
    wrap.append(el('div', { class: 'grid g-2' },
      el('section', { class: 'card' }, el('h2', { text: 'Pemasukan vs pengeluaran' }), Charts.bars(r.series.buckets, 'Grafik batang pemasukan dan pengeluaran pada periode laporan')),
      el('section', { class: 'card' }, el('h2', { text: 'Pengeluaran per kategori' }), Charts.donut(r.categories, r.totals.expense))));
    wrap.append(el('div', { class: 'grid g-2' },
      el('section', { class: 'card' }, el('h2', { text: 'Perbandingan antarperiode per kategori' }), UI.table([
        { label: 'Kategori', render: (c) => c.name }, { label: 'Periode ini', align: 'r', render: (c) => el('span', { class: 'num', text: idr(c.amount) }) },
        { label: 'Sebelumnya', align: 'r', render: (c) => el('span', { class: 'num', text: idr(c.prevAmount) }) }, { label: 'Porsi', align: 'r', render: (c) => UI.pct(c.pct) }], r.categories, UI.empty('chart', 'Belum ada pengeluaran.'))),
      el('section', { class: 'card' }, el('h2', { text: 'Saldo setiap rekening (akhir periode)' }), UI.table([
        { label: 'Rekening', render: (a) => a.name }, { label: 'Saldo', align: 'r', render: (a) => el('strong', { class: 'num', text: idr(a.balance) }) }], r.balances, UI.empty('wallet', 'Belum ada rekening.')))));
    wrap.append(el('div', { class: 'grid g-2' },
      el('section', { class: 'card' }, el('h2', { text: 'Anggaran vs realisasi' }), UI.table([
        { label: 'Anggaran', render: (x) => `${x.categoryName} (${x.period === 'weekly' ? 'mingguan' : 'bulanan'})` }, { label: 'Batas', align: 'r', render: (x) => el('span', { class: 'num', text: idr(x.limit) }) },
        { label: 'Realisasi', align: 'r', render: (x) => el('span', { class: 'num ' + (x.state === 'over' ? 'expense' : ''), text: idr(x.spent) }) }, { label: 'Status', render: (x) => el('span', { class: 'badge ' + (x.state === 'over' ? 'expense' : x.state === 'warn' ? 'warn' : 'income'), text: x.state === 'over' ? 'Melebihi' : UI.pct(x.pct) }) }], r.budgets, UI.empty('budget', 'Belum ada anggaran.'))),
      el('section', { class: 'card' }, el('h2', { text: 'Perkembangan tabungan' }), UI.table([
        { label: 'Target', render: (s) => s.name }, { label: 'Terkumpul', align: 'r', render: (s) => el('span', { class: 'num', text: idr(s.saved) }) },
        { label: 'Perubahan periode', align: 'r', render: (s) => el('span', { class: 'num ' + (s.movement >= 0 ? 'income' : 'expense'), text: (s.movement > 0 ? '+' : '') + idr(s.movement) }) }, { label: 'Capaian', align: 'r', render: (s) => UI.pct(s.pct) }], r.savings, UI.empty('savings', 'Belum ada tabungan.')))));
    return wrap;
  }

  // ───── Anggota ─────
  function userForm(u) {
    UI.openForm({
      title: u ? 'Ubah anggota' : 'Tambah anggota', initial: u, submitLabel: 'Simpan',
      intro: 'Anggota masuk dengan username dan password di bawah ini. Sampaikan password kepada anggota secara langsung.',
      fields: [
        { name: 'name', label: 'Nama', type: 'text', required: true, max: 60 },
        { name: 'email', label: 'Username', type: 'text', required: true, max: 120, help: 'Huruf kecil, angka, titik, garis bawah, minus atau @ (3–120 karakter).' },
        { name: 'password', label: u ? 'Password baru' : 'Password', type: 'password', required: !u, max: 100, help: u ? 'Kosongkan jika password tidak ingin diganti. Mengganti password mengeluarkan anggota dari sesi yang sedang aktif.' : 'Minimal 8 karakter.' },
        { name: 'role', label: 'Peran', type: 'select', required: true, options: [{ value: 'Anggota', label: 'Anggota — catat transaksi, lihat laporan' }, { value: 'Admin', label: 'Admin — akses penuh & pengaturan' }] },
        u ? { name: 'status', label: 'Status', type: 'select', required: true, options: [{ value: 'aktif', label: 'Aktif' }, { value: 'nonaktif', label: 'Nonaktif (tidak bisa masuk)' }] } : null,
      ].filter(Boolean),
      onSubmit: async (v) => { await App.write('user.save', Object.assign({}, v, u ? { id: u.id } : {})); UI.toast('Anggota tersimpan.', 'ok'); },
    });
  }
  function anggota(root) {
    const users = App.boot.users || [];
    root.append(head('Anggota keluarga', btn('Tambah anggota', { class: 'btn primary', icon: 'plus', onclick: () => userForm() })));
    root.append(el('section', { class: 'card' }, UI.table([
      { label: 'Nama', render: (u) => u.name }, { label: 'Username', render: (u) => u.email },
      { label: 'Peran', render: (u) => el('span', { class: 'badge ' + (u.role === 'Admin' ? 'transfer' : ''), text: u.role }) },
      { label: 'Status', render: (u) => el('span', { class: 'badge ' + (u.status === 'aktif' ? 'income' : ''), text: u.status === 'aktif' ? 'Aktif' : 'Nonaktif' }) },
      { label: '', align: 'r', render: (u) => btn('', { class: 'btn sm icon', icon: 'edit', 'aria-label': 'Ubah ' + u.name, onclick: () => userForm(u) }) }], users)));
  }

  // ───── Pengaturan ─────
  function catForm(c, type) {
    UI.openForm({ title: c ? 'Ubah kategori' : 'Tambah kategori ' + (type === 'income' ? 'pemasukan' : 'pengeluaran'), initial: c, submitLabel: 'Simpan',
      fields: [{ name: 'name', label: 'Nama kategori', type: 'text', required: true, max: 60 }],
      onSubmit: async (v) => { await App.write('cat.save', Object.assign({}, v, c ? { id: c.id } : { type })); UI.toast('Kategori tersimpan.', 'ok'); } });
  }
  function catCard(title, type) {
    const list = App.boot.categories.filter((c) => c.type === type);
    return el('section', { class: 'card' }, el('div', { class: 'card-head' }, el('h2', { text: title }), btn('Tambah', { class: 'btn sm', icon: 'plus', onclick: () => catForm(null, type) })),
      UI.table([{ label: 'Nama', render: (c) => el('span', null, c.name, c.status === 'arsip' ? el('span', { class: 'badge', style: 'margin-left:8px', text: 'Arsip' }) : null) },
        { label: '', align: 'r', render: (c) => rowBtns(btn('', { class: 'btn sm icon', icon: 'edit', 'aria-label': 'Ubah ' + c.name, onclick: () => catForm(c) }),
          btn('', { class: 'btn sm icon', icon: 'archive', 'aria-label': (c.status === 'aktif' ? 'Arsipkan ' : 'Aktifkan ') + c.name, onclick: () => guard(() => App.write('cat.status', { id: c.id, status: c.status === 'aktif' ? 'arsip' : 'aktif' }), 'Status kategori diperbarui.') })) }], list));
  }
  function pengaturan(root) {
    const b = App.boot;
    root.append(head('Pengaturan'));
    const name = el('input', { class: 'input', id: 'fam', maxlength: 60, value: b.settings.familyName });
    const months = el('input', { class: 'input', id: 'em', inputmode: 'numeric', maxlength: 2, value: String(b.settings.emergencyMonths) });
    months.addEventListener('input', () => { months.value = months.value.replace(/\D/g, ''); });
    const save = el('button', { class: 'btn primary', type: 'submit' }, 'Simpan pengaturan');
    root.append(el('section', { class: 'card', style: 'margin-bottom:16px' }, el('h2', { text: 'Konfigurasi aplikasi' }),
      el('form', { style: 'max-width:480px', onsubmit: async (e) => { e.preventDefault(); save.disabled = true; await guard(() => App.write('settings.save', { familyName: name.value.trim(), emergencyMonths: Number(months.value) }), 'Pengaturan tersimpan.'); save.disabled = false; } },
        el('div', { class: 'field' }, el('label', { for: 'fam', text: 'Nama keluarga' }), name),
        el('div', { class: 'field' }, el('label', { for: 'em', text: 'Target dana darurat (bulan pengeluaran)' }), months, el('div', { class: 'help', text: '1–24 bulan. Umumnya 3–12 bulan.' })), save)));
    root.append(el('div', { class: 'grid g-2' }, catCard('Kategori pemasukan', 'income'), catCard('Kategori pengeluaran', 'expense')));
    root.append(el('section', { class: 'card', style: 'margin-bottom:16px' }, el('h2', { text: 'Backup data' }),
      el('p', { class: 'muted', style: 'margin-bottom:12px', text: 'Membuat salinan seluruh Google Sheets ke folder "Backup Keuangan Keluarga" di Google Drive pemilik. Backup otomatis harian dapat diaktifkan (lihat panduan). 14 backup terakhir disimpan.' }),
      btn('Buat backup sekarang', { class: 'btn', icon: 'db', onclick: async (ev) => { const bt = ev.currentTarget; bt.disabled = true; try { const r = await App.write('backup.run', {}); UI.toast('Backup dibuat: ' + r.result.name, 'ok'); } catch (e) { UI.toast(e.message, 'error'); } bt.disabled = false; } })));
    const st = App.state.audit || (App.state.audit = { page: 1 });
    const holder = el('div');
    const load = async () => {
      holder.replaceChildren(el('div', { class: 'skeleton', style: 'height:120px' }));
      try {
        const r = await App.read('audit.list', { page: st.page }); st.page = r.page;
        holder.replaceChildren(...[UI.table([{ label: 'Waktu', render: (x) => x.at.replace('T', ' ') }, { label: 'Pengguna', render: (x) => x.email }, { label: 'Aksi', render: (x) => el('span', { class: 'badge', text: x.action }) }, { label: 'Detail', render: (x) => el('span', { class: 'note', text: x.detail || '–' }) }], r.rows, UI.empty('log', 'Belum ada aktivitas.')), UI.pager({ page: r.page, pages: r.pages, total: r.total, size: 25 }, (p) => { st.page = p; load(); })].filter(Boolean));
      } catch (e) { holder.replaceChildren(el('div', { class: 'callout error', role: 'alert', text: e.message })); }
    };
    root.append(el('section', { class: 'card' }, el('h2', { text: 'Log aktivitas' }), holder));
    load();
  }

  return { anggaran, tabungan, darurat, utang, laporan, anggota, pengaturan };
})();
