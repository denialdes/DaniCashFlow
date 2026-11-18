/**
 * Pustaka UI kecil. Aturan keamanan: data dari server SELALU masuk lewat textContent/atribut
 * (el() tidak pernah memakai innerHTML untuk data); innerHTML hanya untuk ikon statis di bawah.
 */
const UI = (() => {
  const ICONS = {
    home: '<path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/>',
    income: '<path d="M12 3v12"/><path d="M7 11l5 5 5-5"/><path d="M5 21h14"/>',
    expense: '<path d="M12 21V9"/><path d="M7 13l5-5 5 5"/><path d="M5 3h14"/>',
    transfer: '<path d="M7 7h13"/><path d="M16 3l4 4-4 4"/><path d="M17 17H4"/><path d="M8 13l-4 4 4 4"/>',
    wallet: '<path d="M3 7a2 2 0 012-2h13v4"/><path d="M3 7v11a2 2 0 002 2h15V9H5a2 2 0 01-2-2z"/><circle cx="16.5" cy="14.5" r="1"/>',
    budget: '<path d="M21 12A9 9 0 1111.99 3"/><path d="M12 3v9h9"/>',
    savings: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
    shield: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="M9 12l2 2 4-4"/>',
    debt: '<path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6"/>',
    chart: '<path d="M4 20V10M10 20V4M16 20v-8M22 20H2"/>',
    users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.5-3.5 3.2-5.5 6.5-5.5s6 2 6.5 5.5"/><path d="M16 4.5a3.5 3.5 0 010 7M18 14.8c2 .6 3.2 2.3 3.5 5.2"/>',
    settings: '<path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>',
    menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>',
    trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
    download: '<path d="M12 4v11M7 11l5 5 5-5M5 20h14"/>',
    logout: '<path d="M9 4H5v16h4M16 8l4 4-4 4M20 12H9"/>',
    x: '<path d="M6 6l12 12M18 6L6 18"/>',
    check: '<path d="M5 12l5 5 9-10"/>',
    alert: '<path d="M12 3l10 18H2z"/><path d="M12 10v5M12 18h0"/>',
    left: '<path d="M15 6l-6 6 6 6"/>',
    right: '<path d="M9 6l6 6-6 6"/>',
    archive: '<path d="M3 5h18v4H3zM5 9v11h14V9M10 13h4"/>',
    db: '<ellipse cx="12" cy="6" rx="7" ry="3"/><path d="M5 6v12c0 1.7 3.1 3 7 3s7-1.3 7-3V6M5 12c0 1.7 3.1 3 7 3s7-1.3 7-3"/>',
    log: '<path d="M8 6h12M8 12h12M8 18h12M4 6h0M4 12h0M4 18h0"/>',
    inbox: '<path d="M3 13l3-8h12l3 8v6H3z"/><path d="M3 13h5l1 3h6l1-3h5"/>',
  };
  const NS = 'http://www.w3.org/2000/svg';

  function icon(name) {
    const s = document.createElement('span');
    s.className = 'ico';
    s.setAttribute('aria-hidden', 'true');
    s.innerHTML = `<svg viewBox="0 0 24 24" focusable="false">${ICONS[name] || ''}</svg>`; // ikon statis tepercaya
    return s;
  }

  function el(tag, props, ...kids) {
    const n = document.createElement(tag);
    let value;
    for (const [k, v] of Object.entries(props || {})) {
      if (v == null || v === false) continue;
      if (k === 'class') n.className = v;
      else if (k === 'text') n.textContent = v;
      else if (k === 'value') value = v;
      else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
      else if (v === true) n.setAttribute(k, '');
      else n.setAttribute(k, v);
    }
    append(n, kids);
    if (value !== undefined) n.value = value;
    return n;
  }
  function append(n, kids) {
    for (const k of kids.flat(Infinity)) {
      if (k == null || k === false) continue;
      n.append(k instanceof Node ? k : document.createTextNode(String(k)));
    }
    return n;
  }
  function svg(tag, attrs, ...kids) {
    const n = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs || {})) n.setAttribute(k, v);
    append(n, kids);
    return n;
  }

  // ───── Format ─────
  const idrFmt = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 });
  const idr = (n) => (n < 0 ? '−Rp ' : 'Rp ') + idrFmt.format(Math.abs(Math.round(n)));
  const dateFmt = new Intl.DateTimeFormat('id-ID', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });
  const date = (s) => (s ? dateFmt.format(new Date(s + 'T00:00:00Z')) : '–');
  const compact = (n) => {
    const a = Math.abs(n), sg = n < 0 ? '−' : '';
    const f = (x) => String(Math.round(x * 10) / 10).replace('.', ',');
    return sg + (a >= 1e9 ? f(a / 1e9) + ' M' : a >= 1e6 ? f(a / 1e6) + ' jt' : a >= 1e3 ? f(a / 1e3) + ' rb' : String(a));
  };
  const pct = (x) => (x == null ? '–' : String(x).replace('.', ',') + '%');
  const requestId = () => (crypto.randomUUID ? crypto.randomUUID() : 'r' + Date.now().toString(36) + Math.random().toString(36).slice(2, 12));

  // ───── Busy, toast ─────
  let busyN = 0, busyEl = null;
  const Busy = {
    on() { if (++busyN === 1) { busyEl = el('div', { class: 'busy-bar', role: 'progressbar', 'aria-label': 'Memuat' }); document.body.append(busyEl); } },
    off() { if (--busyN <= 0) { busyN = 0; if (busyEl) busyEl.remove(); busyEl = null; } },
  };
  function toast(message, type) {
    let box = document.getElementById('toasts');
    if (!box) { box = el('div', { id: 'toasts', class: 'toasts', 'aria-live': 'polite', role: 'status' }); document.body.append(box); }
    const t = el('div', { class: 'toast ' + (type || '') }, icon(type === 'error' ? 'alert' : 'check'), el('div', { text: message }));
    box.append(t);
    setTimeout(() => t.remove(), type === 'error' ? 7000 : 3500);
  }

  // ───── Modal (fokus terjebak, Esc menutup, fokus dikembalikan) ─────
  const openClosers = new Set();
  function openModal(title, bodyNodes, opts) {
    const prev = document.activeElement;
    const id = 'm' + Math.random().toString(36).slice(2, 8);
    const box = el('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': id }, el('h2', { id, text: title }), bodyNodes);
    const bg = el('div', { class: 'modal-bg' }, box);
    const close = (result) => { openClosers.delete(close); document.removeEventListener('keydown', onKey, true); bg.remove(); if (prev && prev.focus) prev.focus(); if (opts && opts.onClose) opts.onClose(result); };
    const focusables = () => [...box.querySelectorAll('a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex="0"]')].filter((x) => !x.closest('[hidden]'));
    function onKey(e) {
      if (e.key === 'Escape') { e.stopPropagation(); close(false); }
      else if (e.key === 'Tab') {
        const f = focusables();
        if (!f.length) return;
        const first = f[0], last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    }
    openClosers.add(close);
    document.addEventListener('keydown', onKey, true);
    document.body.append(bg);
    const f = focusables();
    (f.find((x) => x.matches('input,select,textarea')) || f[0] || box).focus();
    return { close, box };
  }

  function confirm(opt) {
    return new Promise((resolve) => {
      let m;
      const ok = el('button', { class: 'btn ' + (opt.danger ? 'danger' : 'primary'), type: 'button', onclick: () => { m.close(true); } }, opt.confirmLabel || 'Ya, lanjutkan');
      const no = el('button', { class: 'btn', type: 'button', onclick: () => m.close(false) }, 'Batal');
      m = openModal(opt.title || 'Konfirmasi', [el('p', { text: opt.message }), el('div', { class: 'modal-actions', style: 'margin-top:16px' }, no, ok)], { onClose: (r) => resolve(r === true) });
    });
  }

  // ───── Formulir generik ─────
  const digits = (s) => String(s).replace(/\D/g, '');
  const moneyText = (s) => { const d = digits(s).replace(/^0+(?=\d)/, ''); return d ? idrFmt.format(Number(d)) : ''; };

  /**
   * fields: [{name,label,type:text|money|int|date|select|textarea|email|password, required, options:[{value,label}], blank, max, min, maxDate, help, placeholder, value, disabled}]
   * onSubmit(values) → Promise; error dari server tampil di ringkasan error, modal tetap terbuka.
   */
  function openForm(opt) {
    const inputs = {}, errEls = {};
    const summary = el('div', { class: 'err-summary', tabindex: '-1', role: 'alert', hidden: true });
    const form = el('form', { novalidate: true });
    form.append(summary);
    if (opt.intro) form.append(el('p', { class: 'help', style: 'margin-bottom:12px', text: opt.intro }));

    for (const f of opt.fields) {
      const id = 'f_' + f.name + Math.random().toString(36).slice(2, 5);
      const init = opt.initial && opt.initial[f.name] != null ? opt.initial[f.name] : f.value != null ? f.value : '';
      let input;
      const common = { id, name: f.name, class: 'input', 'aria-describedby': id + '_e' + (f.help ? ' ' + id + '_h' : ''), disabled: f.disabled };
      if (f.type === 'select') {
        input = el('select', common, f.blank ? el('option', { value: '', text: f.blank }) : null, (f.options || []).map((o) => el('option', { value: o.value, text: o.label })));
        input.value = String(init);
        if (input.selectedIndex < 0) input.selectedIndex = 0; // tanpa opsi kosong: pilih opsi pertama
      } else if (f.type === 'textarea') {
        input = el('textarea', Object.assign({ maxlength: f.max || 200, rows: 3 }, common), init);
      } else if (f.type === 'money') {
        input = el('input', Object.assign({ type: 'text', inputmode: 'numeric', autocomplete: 'off', placeholder: f.placeholder || '0' }, common));
        input.value = init === '' ? '' : moneyText(String(init));
        input.addEventListener('input', () => { input.value = moneyText(input.value); });
      } else if (f.type === 'int') {
        input = el('input', Object.assign({ type: 'text', inputmode: 'numeric', autocomplete: 'off' }, common));
        input.value = init === '' ? '' : String(init);
        input.addEventListener('input', () => { input.value = digits(input.value); });
      } else {
        input = el('input', Object.assign({ type: f.type === 'date' ? 'date' : f.type === 'email' ? 'email' : f.type === 'password' ? 'password' : 'text', maxlength: f.max || 80, autocomplete: f.type === 'password' ? 'new-password' : 'off', max: f.type === 'date' ? f.maxDate : null, placeholder: f.placeholder }, common));
        input.value = init;
      }
      inputs[f.name] = input;
      errEls[f.name] = el('div', { class: 'err', id: id + '_e' });
      form.append(el('div', { class: 'field', 'data-field': f.name }, el('label', { for: id }, f.label, f.required ? el('span', { class: 'req', 'aria-hidden': 'true' }, ' *') : null), f.type === 'money' ? el('div', { class: 'money' }, input) : input, f.help ? el('div', { class: 'help', id: id + '_h', text: f.help }) : null, errEls[f.name]));
    }

    const read = () => {
      const v = {};
      for (const f of opt.fields) {
        const raw = inputs[f.name].value;
        v[f.name] = f.type === 'money' || f.type === 'int' ? (digits(raw) === '' ? '' : Number(digits(raw))) : String(raw).trim();
      }
      return v;
    };
    const validate = (v) => {
      const errs = [];
      for (const f of opt.fields) {
        const x = v[f.name];
        let m = '';
        if (f.required && (x === '' || x == null)) m = `${f.label} wajib diisi`;
        else if (x !== '' && (f.type === 'money' || f.type === 'int') && f.min != null && x < f.min) m = `${f.label} minimal ${f.min}`;
        else if (x !== '' && f.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x)) m = `${f.label} tidak valid`;
        else if (x !== '' && f.type === 'date' && f.maxDate && x > f.maxDate) m = `${f.label} tidak boleh di masa depan`;
        errEls[f.name].textContent = m;
        inputs[f.name].setAttribute('aria-invalid', m ? 'true' : 'false');
        if (m) errs.push({ name: f.name, message: m });
      }
      return errs;
    };
    const showSummary = (items) => {
      summary.replaceChildren(el('h3', { text: 'Periksa kembali isian Anda' }), el('ul', null, items.map((it) => el('li', null, it.name ? el('a', { href: '#', onclick: (e) => { e.preventDefault(); inputs[it.name].focus(); } }, it.message) : it.message))));
      summary.hidden = false;
      summary.focus();
    };

    let m;
    const submit = el('button', { class: 'btn primary', type: 'submit' }, opt.submitLabel || 'Simpan');
    const cancel = el('button', { class: 'btn', type: 'button', onclick: () => m.close(false) }, 'Batal');
    form.append(el('div', { class: 'modal-actions' }, cancel, submit));
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (submit.disabled) return;
      summary.hidden = true;
      const v = read();
      const errs = validate(v);
      if (errs.length) { showSummary(errs); return; }
      submit.disabled = true; cancel.disabled = true;
      const label = submit.textContent;
      submit.replaceChildren(el('span', { class: 'spinner', 'aria-hidden': 'true' }), 'Menyimpan…');
      try {
        await opt.onSubmit(v);
        m.close(true);
      } catch (err) {
        submit.disabled = false; cancel.disabled = false; submit.textContent = label;
        showSummary([{ message: err.message || 'Gagal menyimpan' }]);
      }
    });
    m = openModal(opt.title, form);
    return m;
  }

  // ───── Tabel, pager, kosong ─────
  function table(columns, rows, emptyNode) {
    if (!rows.length) return emptyNode || el('div', { class: 'empty', text: 'Tidak ada data.' });
    return el('div', { class: 'tbl-wrap' }, el('table', { class: 'tbl' },
      el('thead', null, el('tr', null, columns.map((c) => el('th', { scope: 'col', class: c.align === 'r' ? 'r' : '' }, c.label)))),
      el('tbody', null, rows.map((r) => el('tr', null, columns.map((c) => el('td', { 'data-label': c.label, class: c.align === 'r' ? 'r' : '' }, c.render ? c.render(r) : r[c.key])))))));
  }
  function pager(p, onPage) {
    if (!p || p.total === 0) return null;
    const from = (p.page - 1) * p.size + 1, to = Math.min(p.total, p.page * p.size);
    return el('nav', { class: 'pager', 'aria-label': 'Halaman' },
      el('span', { class: 'muted', text: `Menampilkan ${from}–${to} dari ${p.total}` }),
      el('span', { style: 'display:flex;gap:8px;align-items:center;flex-wrap:wrap' },
        el('button', { class: 'btn sm', type: 'button', disabled: p.page <= 1, onclick: () => onPage(p.page - 1), 'aria-label': 'Halaman sebelumnya' }, icon('left'), 'Sebelumnya'),
        el('span', { class: 'num', text: `${p.page} / ${p.pages}` }),
        el('button', { class: 'btn sm', type: 'button', disabled: p.page >= p.pages, onclick: () => onPage(p.page + 1), 'aria-label': 'Halaman berikutnya' }, 'Berikutnya', icon('right'))));
  }
  function empty(iconName, text, action) {
    return el('div', { class: 'empty' }, icon(iconName || 'inbox'), el('p', { text }), action || null);
  }
  const btn = (label, o) => el('button', Object.assign({ type: 'button', class: 'btn' }, o), o && o.icon ? icon(o.icon) : null, label);
  const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

  function download(base64, filename, mime) {
    const bin = atob(base64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const url = URL.createObjectURL(new Blob([bytes], { type: mime }));
    const a = el('a', { href: url, download: filename });
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }

  /** Avatar kategori: inisial berwarna stabil per nama (7 warna dari token). */
  function avatar(name, type) {
    if (type === 'transfer') return el('span', { class: 'avatar t-transfer', 'aria-hidden': 'true' }, icon('transfer'));
    let h = 0; for (const ch of String(name || '?')) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    return el('span', { class: 'avatar a' + (h % 7), 'aria-hidden': 'true', text: (String(name || '?').trim()[0] || '?').toUpperCase() });
  }

  const closeAll = () => [...openClosers].forEach((c) => c(false));

  return { avatar, closeAll, icon, el, svg, idr, date, compact, pct, requestId, Busy, toast, openModal, confirm, openForm, table, pager, empty, btn, debounce, download };
})();
