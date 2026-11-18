/** Grafik SVG tanpa pustaka luar: batang pemasukan vs pengeluaran, donat kategori. Selalu disertai tabel/legenda teks (aksesibilitas). */
const Charts = (() => {
  const { el, svg, compact, idr } = UI;
  const PALETTE = ['var(--chart-1)', 'var(--chart-2)', 'var(--chart-3)', 'var(--chart-4)', 'var(--chart-5)', 'var(--chart-6)', 'var(--chart-7)'];

  function niceMax(v) {
    if (v <= 0) return 1;
    const p = Math.pow(10, Math.floor(Math.log10(v)));
    const n = v / p;
    return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
  }

  function bars(buckets, summary) {
    const W = 420, H = 230, L = 46, B = 28, T = 10, R = 6;
    const max = niceMax(Math.max(0, ...buckets.map((b) => Math.max(b.income, b.expense))));
    const iw = W - L - R, ih = H - T - B, gw = iw / Math.max(1, buckets.length);
    const bw = Math.min(22, (gw - 5) / 2);
    const s = svg('svg', { class: 'chart chart-bars', viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': summary });
    for (let i = 0; i <= 4; i++) {
      const y = T + ih - (ih * i) / 4;
      s.append(svg('line', { class: 'grid-line', x1: L, x2: W - R, y1: y, y2: y }), svg('text', { x: L - 5, y: y + 4, 'text-anchor': 'end' }, compact((max * i) / 4)));
    }
    const step = Math.ceil(buckets.length / 8);
    buckets.forEach((b, i) => {
      const cx = L + gw * i + gw / 2;
      const hI = (b.income / max) * ih, hE = (b.expense / max) * ih;
      const g = svg('g', null, svg('title', null, `${b.label}: pemasukan ${idr(b.income)}, pengeluaran ${idr(b.expense)}`));
      g.append(svg('rect', { class: 'bar-income', x: cx - bw - 1, y: T + ih - hI, width: bw, height: Math.max(hI, b.income ? 1 : 0), rx: 3 }),
        svg('rect', { class: 'bar-expense', x: cx + 1, y: T + ih - hE, width: bw, height: Math.max(hE, b.expense ? 1 : 0), rx: 3 }));
      if (i % step === 0) g.append(svg('text', { x: cx, y: H - 8, 'text-anchor': 'middle' }, b.label));
      s.append(g);
    });
    return el('figure', { style: 'margin:0' }, s,
      el('div', { class: 'legend' }, el('span', null, el('i', { class: 'sw', style: 'background:var(--income)' }), 'Pemasukan'), el('span', null, el('i', { class: 'sw', style: 'background:var(--expense)' }), 'Pengeluaran')),
      el('details', { style: 'margin-top:8px' }, el('summary', { class: 'muted', style: 'cursor:pointer;min-height:32px' }, 'Lihat data dalam tabel'),
        UI.table([{ label: 'Periode', render: (b) => b.label }, { label: 'Pemasukan', align: 'r', render: (b) => el('span', { class: 'num income', text: idr(b.income) }) }, { label: 'Pengeluaran', align: 'r', render: (b) => el('span', { class: 'num expense', text: idr(b.expense) }) }], buckets)));
  }

  function donut(items, total) {
    if (!items.length || total <= 0) return UI.empty('chart', 'Belum ada pengeluaran pada periode ini.');
    const top = items.slice(0, 6);
    const rest = items.slice(6).reduce((s, x) => s + x.amount, 0);
    const parts = top.map((x) => ({ name: x.name, amount: x.amount })).concat(rest ? [{ name: 'Lainnya', amount: rest }] : []);
    const R = 60, C = 2 * Math.PI * R;
    const s = svg('svg', { class: 'chart', viewBox: '0 0 160 160', role: 'img', 'aria-label': 'Pengeluaran per kategori: ' + parts.map((p) => `${p.name} ${Math.round((p.amount / total) * 100)}%`).join(', ') });
    s.append(svg('circle', { cx: 80, cy: 80, r: R, fill: 'none', stroke: 'var(--border)', 'stroke-width': 22 }));
    let off = 0;
    parts.forEach((p, i) => {
      const len = (p.amount / total) * C;
      s.append(svg('circle', { cx: 80, cy: 80, r: R, fill: 'none', stroke: PALETTE[i % PALETTE.length], 'stroke-width': 22, 'stroke-dasharray': `${Math.max(len - 1, 0)} ${C}`, 'stroke-dashoffset': -off, transform: 'rotate(-90 80 80)' }, svg('title', null, `${p.name}: ${idr(p.amount)}`)));
      off += len;
    });
    s.append(svg('text', { x: 80, y: 78, 'text-anchor': 'middle', style: 'font-size:10px' }, 'Total'), svg('text', { x: 80, y: 94, 'text-anchor': 'middle', style: 'font-size:13px;font-weight:600;fill:var(--text)' }, compact(total)));
    return el('div', { class: 'donut-wrap' }, s, el('ul', { class: 'legend-col' }, parts.map((p, i) => el('li', null, el('i', { class: 'sw', style: `background:${PALETTE[i % PALETTE.length]}` }), el('span', { class: 'nm', title: p.name, text: p.name }), el('span', { class: 'num', text: UI.pct(Math.round((p.amount / total) * 1000) / 10) })))));
  }

  return { bars, donut };
})();
