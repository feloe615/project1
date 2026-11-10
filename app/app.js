'use strict';

/* ============================================================
 * ResellHub – Inventar, Verkäufe & Gewinne für Reseller
 * Daten liegen in localStorage (nur in diesem Browser).
 * ============================================================ */

const STORAGE_KEY = 'resellhub:v1';
const DAY = 86400000;

const DEFAULT_STATE = () => ({
  items: [],
  expenses: [],
  settings: {
    monthlyGoal: 500,
    agingDays: 60,
    targetRoi: 100,
    platforms: [
      { name: 'Vinted', feePct: 0, feeFixed: 0 },
      { name: 'eBay', feePct: 6.5, feeFixed: 0.35 },
      { name: 'Kleinanzeigen', feePct: 0, feeFixed: 0 },
      { name: 'Etsy', feePct: 9.5, feeFixed: 0.2 },
      { name: 'Vor Ort', feePct: 0, feeFixed: 0 },
    ],
  },
  nextSku: 1,
});

let state = load();

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      const base = DEFAULT_STATE();
      return { ...base, ...parsed, settings: { ...base.settings, ...(parsed.settings || {}) } };
    }
  } catch (e) { console.warn('Laden fehlgeschlagen', e); }
  return DEFAULT_STATE();
}

function save() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
  catch (e) { toast('Speichern fehlgeschlagen – bitte Backup erstellen!'); }
}

/* ---------- Helpers ---------- */
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const num = v => { const n = parseFloat(String(v ?? '').replace(',', '.')); return Number.isFinite(n) ? n : 0; };
const round2 = n => Math.round(n * 100) / 100;
const eur = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' });
const fmt = n => eur.format(n || 0);
const pct = n => (Number.isFinite(n) ? n.toLocaleString('de-DE', { maximumFractionDigits: 0 }) + ' %' : '–');
const today = () => new Date().toISOString().slice(0, 10);
const parseDate = s => (s ? new Date(s + 'T00:00:00') : null);
const fmtDate = s => (s ? parseDate(s).toLocaleDateString('de-DE') : '–');
const daysBetween = (a, b) => Math.max(0, Math.round((parseDate(b) - parseDate(a)) / DAY));
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const signClass = n => (n > 0 ? 'pos' : n < 0 ? 'neg' : '');

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg; t.hidden = false;
  clearTimeout(toast._t); toast._t = setTimeout(() => (t.hidden = true), 2600);
}

function download(filename, content, type) {
  const blob = new Blob([content], { type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/* ---------- Domain logic ---------- */
const STATUS_LABEL = { lager: 'Im Lager', gelistet: 'Gelistet', reserviert: 'Reserviert', verkauft: 'Verkauft' };

const itemCost = i => num(i.purchasePrice) + num(i.extraCosts);
const saleNet = s => num(s.price) - num(s.fees) - num(s.shipping);
const itemProfit = i => (i.sale ? saleNet(i.sale) - itemCost(i) : 0);
const itemAge = i => daysBetween(i.purchaseDate, i.sale ? i.sale.date : today());
const isSold = i => i.status === 'verkauft' && i.sale;

function platformFor(name) { return state.settings.platforms.find(p => p.name === name); }
function calcFees(platformName, price) {
  const p = platformFor(platformName);
  if (!p || !price) return 0;
  return round2(price * num(p.feePct) / 100 + num(p.feeFixed));
}

function suggestPrice(cost) {
  // Preis, der nach Standard-Plattformgebühr den Ziel-ROI erreicht (grobe Orientierung)
  const roi = num(state.settings.targetRoi) / 100;
  return cost > 0 ? Math.ceil(cost * (1 + roi)) : 0;
}

function nextSku() {
  const sku = 'R-' + String(state.nextSku).padStart(4, '0');
  state.nextSku += 1;
  return sku;
}

function periodRange(period) {
  const now = new Date();
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  let start;
  if (period === 'month') start = new Date(now.getFullYear(), now.getMonth(), 1);
  else if (period === 'year') start = new Date(now.getFullYear(), 0, 1);
  else if (period === 'all') start = new Date(1970, 0, 1);
  else start = new Date(end - Number(period) * DAY);
  return { start, end };
}
const inRange = (dateStr, { start, end }) => { const d = parseDate(dateStr); return d && d >= start && d < end; };

function stats(range) {
  const sold = state.items.filter(i => isSold(i) && inRange(i.sale.date, range));
  const revenue = sold.reduce((s, i) => s + num(i.sale.price), 0);
  const fees = sold.reduce((s, i) => s + num(i.sale.fees) + num(i.sale.shipping), 0);
  const cogs = sold.reduce((s, i) => s + itemCost(i), 0);
  const grossProfit = revenue - fees - cogs;
  const expenses = state.expenses.filter(e => inRange(e.date, range)).reduce((s, e) => s + num(e.amount), 0);
  const netProfit = grossProfit - expenses;
  const purchases = state.items.filter(i => inRange(i.purchaseDate, range));
  const open = state.items.filter(i => !isSold(i));
  const avgDays = sold.length ? sold.reduce((s, i) => s + itemAge(i), 0) / sold.length : NaN;
  return {
    sold, revenue, fees, cogs, grossProfit, expenses, netProfit,
    margin: revenue ? (netProfit / revenue) * 100 : NaN,
    roi: cogs ? (grossProfit / cogs) * 100 : NaN,
    avgDays,
    avgProfit: sold.length ? grossProfit / sold.length : NaN,
    purchasesCount: purchases.length,
    purchasesValue: purchases.reduce((s, i) => s + itemCost(i), 0),
    openCount: open.length,
    stockValue: open.reduce((s, i) => s + itemCost(i), 0),
    stockListValue: open.reduce((s, i) => s + num(i.listPrice), 0),
    sellThrough: (sold.length + open.length) ? (sold.length / (sold.length + open.length)) * 100 : NaN,
  };
}

/* ---------- Navigation ---------- */
function showView(name) {
  $$('#tabs button').forEach(b => b.classList.toggle('active', b.dataset.view === name));
  $$('.view').forEach(v => v.classList.toggle('active', v.id === 'view-' + name));
  try { localStorage.setItem('resellhub:view', name); } catch (_) { /* ignore */ }
  render();
}
$('#tabs').addEventListener('click', e => { const b = e.target.closest('button'); if (b) showView(b.dataset.view); });

function render() {
  const active = $('.view.active').id.replace('view-', '');
  refreshLists();
  ({ dashboard: renderDashboard, inventory: renderInventory, sales: renderSales, expenses: renderExpenses, settings: renderSettings })[active]();
}

function uniq(arr) { return [...new Set(arr.filter(Boolean))].sort((a, b) => a.localeCompare(b, 'de')); }
function refreshLists() {
  const opts = arr => arr.map(v => `<option value="${esc(v)}">`).join('');
  $('#dl-categories').innerHTML = opts(uniq(state.items.map(i => i.category)));
  $('#dl-brands').innerHTML = opts(uniq(state.items.map(i => i.brand)));
  $('#dl-sources').innerHTML = opts(uniq(state.items.map(i => i.source)));
  const catSel = $('#inv-category'); const cur = catSel.value;
  catSel.innerHTML = '<option value="">Alle Kategorien</option>' + uniq(state.items.map(i => i.category)).map(c => `<option>${esc(c)}</option>`).join('');
  catSel.value = cur;
  const platSel = $('#sales-platform'); const curP = platSel.value;
  platSel.innerHTML = '<option value="">Alle Plattformen</option>' + state.settings.platforms.map(p => `<option>${esc(p.name)}</option>`).join('');
  platSel.value = curP;
}

/* ---------- Dashboard ---------- */
$('#dash-period').addEventListener('change', renderDashboard);

function kpi(label, value, sub = '', cls = '') {
  return `<div class="kpi"><div class="label">${label}</div><div class="value ${cls}">${value}</div><div class="sub">${sub}</div></div>`;
}

function renderDashboard() {
  const s = stats(periodRange($('#dash-period').value));
  $('#kpis').innerHTML = [
    kpi('Umsatz', fmt(s.revenue), `${s.sold.length} Verkäufe`),
    kpi('Nettogewinn', fmt(s.netProfit), `nach ${fmt(s.expenses)} Ausgaben`, signClass(s.netProfit)),
    kpi('Marge', pct(s.margin), 'Nettogewinn / Umsatz', signClass(s.margin)),
    kpi('ROI', pct(s.roi), 'Rohgewinn / Wareneinsatz', signClass(s.roi)),
    kpi('Ø Gewinn / Artikel', Number.isFinite(s.avgProfit) ? fmt(s.avgProfit) : '–', 'vor Ausgaben'),
    kpi('Ø Tage bis Verkauf', Number.isFinite(s.avgDays) ? Math.round(s.avgDays) : '–', 'Einkauf → Verkauf'),
    kpi('Eingekauft', fmt(s.purchasesValue), `${s.purchasesCount} Artikel im Zeitraum`),
    kpi('Lagerwert (EK)', fmt(s.stockValue), `${s.openCount} offen · VK-Potenzial ${fmt(s.stockListValue)}`),
  ].join('');

  // Monatsziel – immer aktueller Monat
  const m = stats(periodRange('month'));
  const goal = num(state.settings.monthlyGoal);
  const progress = goal ? Math.min(100, Math.max(0, (m.netProfit / goal) * 100)) : 0;
  const now = new Date();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const forecast = (m.netProfit / now.getDate()) * daysInMonth;
  $('#goal-card').innerHTML = goal
    ? `<h2>Monatsziel: ${fmt(goal)} Nettogewinn</h2>
       <div><b class="${signClass(m.netProfit)}">${fmt(m.netProfit)}</b> erreicht (${pct((m.netProfit / goal) * 100)}) ·
       Hochrechnung Monatsende: <b>${fmt(forecast)}</b> ·
       noch ${fmt(Math.max(0, goal - m.netProfit))} offen</div>
       <div class="progress"><div style="width:${progress}%"></div></div>`
    : '<h2>Kein Monatsziel gesetzt</h2><p class="hint">Lege in den Einstellungen ein Gewinnziel fest.</p>';

  renderMonthlyChart();

  // Plattformen
  const byPlat = groupBy(s.sold, i => i.sale.platform || '–');
  $('#platform-table').innerHTML = byPlat.length ? miniTable(
    ['Plattform', 'Verkäufe', 'Umsatz', 'Gebühren', 'Gewinn', 'Ø Tage'],
    byPlat.map(([k, list]) => [
      esc(k), list.length,
      fmt(sum(list, i => num(i.sale.price))),
      fmt(sum(list, i => num(i.sale.fees) + num(i.sale.shipping))),
      `<span class="${signClass(sum(list, itemProfit))}">${fmt(sum(list, itemProfit))}</span>`,
      Math.round(sum(list, itemAge) / list.length),
    ])) : '<p class="hint">Noch keine Verkäufe im Zeitraum.</p>';

  // Kategorien
  const byCat = groupBy(s.sold, i => i.category || 'Ohne Kategorie')
    .sort((a, b) => sum(b[1], itemProfit) - sum(a[1], itemProfit)).slice(0, 8);
  $('#category-table').innerHTML = byCat.length ? miniTable(
    ['Kategorie', 'Verkäufe', 'Gewinn', 'Ø Gewinn', 'ROI'],
    byCat.map(([k, list]) => {
      const p = sum(list, itemProfit), c = sum(list, itemCost);
      return [esc(k), list.length, fmt(p), fmt(p / list.length), pct(c ? (p / c) * 100 : NaN)];
    })) : '<p class="hint">Noch keine Verkäufe im Zeitraum.</p>';

  // Ladenhüter
  const agingDays = num(state.settings.agingDays) || 60;
  $('#aging-hint').textContent = `(> ${agingDays} Tage im Bestand)`;
  const aging = state.items.filter(i => !isSold(i) && itemAge(i) > agingDays).sort((a, b) => itemAge(b) - itemAge(a));
  $('#aging-list').innerHTML = aging.length ? miniTable(
    ['Artikel', 'Tage', 'EK', 'Preis', ''],
    aging.slice(0, 10).map(i => [
      `${esc(i.title)} <span class="sku">${esc(i.sku)}</span>`, `<span class="warn">${itemAge(i)}</span>`,
      fmt(itemCost(i)), i.listPrice ? fmt(i.listPrice) : '–',
      `<button class="small" data-edit="${i.id}">Bearbeiten</button>`,
    ])) + (aging.length > 10 ? `<p class="hint">… und ${aging.length - 10} weitere</p>` : '') +
    '<p class="hint">Tipp: Preis senken, neu einstellen oder auf weiteren Plattformen listen.</p>'
    : '<p class="hint">Keine Ladenhüter – sehr gut! 🎉</p>';
}

function groupBy(list, keyFn) {
  const m = new Map();
  list.forEach(x => { const k = keyFn(x); if (!m.has(k)) m.set(k, []); m.get(k).push(x); });
  return [...m.entries()];
}
const sum = (list, fn) => list.reduce((s, x) => s + fn(x), 0);
function miniTable(head, rows) {
  return `<table class="mini"><thead><tr>${head.map((h, i) => `<th class="${i ? 'num' : ''}">${h}</th>`).join('')}</tr></thead>
    <tbody>${rows.map(r => `<tr>${r.map((c, i) => `<td class="${i ? 'num' : ''}">${c}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
}

function renderMonthlyChart() {
  const now = new Date();
  const months = [];
  for (let k = 11; k >= 0; k--) {
    const start = new Date(now.getFullYear(), now.getMonth() - k, 1);
    const end = new Date(now.getFullYear(), now.getMonth() - k + 1, 1);
    const s = stats({ start, end });
    months.push({ label: start.toLocaleDateString('de-DE', { month: 'short' }), revenue: s.revenue, profit: s.netProfit });
  }
  const W = 600, H = 220, pad = { l: 46, r: 8, t: 12, b: 24 };
  const max = Math.max(1, ...months.map(m => Math.max(m.revenue, m.profit)));
  const min = Math.min(0, ...months.map(m => m.profit));
  const y = v => pad.t + (H - pad.t - pad.b) * (1 - (v - min) / (max - min));
  const bw = (W - pad.l - pad.r) / months.length;
  const ticks = [min, 0, max / 2, max].filter((v, i, a) => a.indexOf(v) === i);
  let svg = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Umsatz und Gewinn pro Monat">`;
  ticks.forEach(t => {
    svg += `<line x1="${pad.l}" x2="${W - pad.r}" y1="${y(t)}" y2="${y(t)}" stroke="var(--border)"/>`;
    svg += `<text x="${pad.l - 6}" y="${y(t) + 3}" text-anchor="end">${Math.round(t)} €</text>`;
  });
  months.forEach((m, i) => {
    const x = pad.l + i * bw;
    svg += `<rect x="${x + bw * 0.12}" width="${bw * 0.38}" y="${y(m.revenue)}" height="${Math.max(0, y(0) - y(m.revenue))}" rx="2" fill="var(--border)"><title>${m.label}: Umsatz ${fmt(m.revenue)}</title></rect>`;
    const top = m.profit >= 0 ? y(m.profit) : y(0);
    svg += `<rect x="${x + bw * 0.5}" width="${bw * 0.38}" y="${top}" height="${Math.abs(y(m.profit) - y(0))}" rx="2" fill="${m.profit >= 0 ? 'var(--primary)' : 'var(--neg)'}"><title>${m.label}: Gewinn ${fmt(m.profit)}</title></rect>`;
    svg += `<text x="${x + bw / 2}" y="${H - 6}" text-anchor="middle">${m.label}</text>`;
  });
  svg += '</svg>';
  $('#chart-monthly').innerHTML = svg +
    '<p class="hint"><span style="color:var(--muted)">■</span> Umsatz &nbsp; <span style="color:var(--primary)">■</span> Nettogewinn</p>';
}

/* ---------- Inventory ---------- */
let invSort = { key: 'purchaseDate', dir: -1 };
['#inv-search', '#inv-status', '#inv-category'].forEach(s => $(s).addEventListener('input', renderInventory));

const INV_COLS = [
  { key: 'title', label: 'Artikel' },
  { key: 'status', label: 'Status' },
  { key: 'category', label: 'Kategorie' },
  { key: 'purchaseDate', label: 'Gekauft' },
  { key: 'age', label: 'Tage', num: true, get: itemAge },
  { key: 'cost', label: 'EK gesamt', num: true, get: itemCost },
  { key: 'listPrice', label: 'Preis', num: true, get: i => num(i.listPrice) },
  { key: 'potential', label: 'Pot. Gewinn', num: true, get: i => (isSold(i) ? itemProfit(i) : num(i.listPrice) - itemCost(i)) },
  { key: 'location', label: 'Lagerort' },
];

function filteredItems() {
  const q = $('#inv-search').value.trim().toLowerCase();
  const st = $('#inv-status').value;
  const cat = $('#inv-category').value;
  return state.items.filter(i => {
    if (st === 'open' && isSold(i)) return false;
    if (!['open', 'all'].includes(st) && i.status !== st) return false;
    if (cat && i.category !== cat) return false;
    if (q && ![i.title, i.sku, i.brand, i.category, i.source, i.location, i.notes].join(' ').toLowerCase().includes(q)) return false;
    return true;
  });
}

function sortList(list, sort, cols) {
  const col = cols.find(c => c.key === sort.key);
  const get = col && col.get ? col.get : x => x[sort.key];
  return [...list].sort((a, b) => {
    const va = get(a), vb = get(b);
    if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * sort.dir;
    return String(va ?? '').localeCompare(String(vb ?? ''), 'de') * sort.dir;
  });
}

function headerRow(cols, sort, extra = '') {
  return `<thead><tr>${cols.map(c => `<th data-sort="${c.key}" class="${c.num ? 'num' : ''}">${c.label}${sort.key === c.key ? (sort.dir > 0 ? ' ▲' : ' ▼') : ''}</th>`).join('')}${extra}</tr></thead>`;
}

function renderInventory() {
  const list = sortList(filteredItems(), invSort, INV_COLS);
  const agingDays = num(state.settings.agingDays) || 60;
  const open = list.filter(i => !isSold(i));
  $('#inv-summary').innerHTML = `
    <span><b>${list.length}</b> Artikel</span>
    <span>EK gesamt: <b>${fmt(sum(list, itemCost))}</b></span>
    <span>Angebotswert offen: <b>${fmt(sum(open, i => num(i.listPrice)))}</b></span>
    <span>Ohne Preis: <b>${open.filter(i => !num(i.listPrice)).length}</b></span>`;
  const rows = list.map(i => {
    const age = itemAge(i);
    const potential = isSold(i) ? itemProfit(i) : (num(i.listPrice) ? num(i.listPrice) - itemCost(i) : NaN);
    return `<tr>
      <td class="title">${esc(i.title)}<br><span class="sku">${esc(i.sku)}${i.brand ? ' · ' + esc(i.brand) : ''}${i.size ? ' · ' + esc(i.size) : ''}${(i.platforms || []).length ? ' · ' + i.platforms.map(esc).join(', ') : ''}</span></td>
      <td><span class="badge ${i.status}">${STATUS_LABEL[i.status] || i.status}</span></td>
      <td>${esc(i.category) || '–'}</td>
      <td>${fmtDate(i.purchaseDate)}</td>
      <td class="num ${!isSold(i) && age > agingDays ? 'warn' : ''}">${age}</td>
      <td class="num">${fmt(itemCost(i))}</td>
      <td class="num">${isSold(i) ? fmt(i.sale.price) : (i.listPrice ? fmt(i.listPrice) : '–')}</td>
      <td class="num ${signClass(potential)}">${Number.isFinite(potential) ? fmt(potential) : '–'}</td>
      <td>${esc(i.location) || '–'}</td>
      <td class="actions">
        ${isSold(i) ? `<button class="small" data-unsell="${i.id}">Rückgängig</button>` : `<button class="small primary" data-sell="${i.id}">Verkauft</button>`}
        <button class="small" data-edit="${i.id}">Bearbeiten</button>
        <button class="small" data-dup="${i.id}" title="Duplizieren">⧉</button>
        <button class="small danger" data-del="${i.id}" title="Löschen">✕</button>
      </td></tr>`;
  }).join('');
  $('#inv-table').innerHTML = headerRow(INV_COLS, invSort, '<th></th>') +
    `<tbody>${rows || `<tr><td colspan="${INV_COLS.length + 1}" class="empty">Keine Artikel. Lege mit „+ Artikel“ los oder lade Demodaten in den Einstellungen.</td></tr>`}</tbody>`;
}

$('#inv-table').addEventListener('click', e => {
  const th = e.target.closest('th[data-sort]');
  if (th) { invSort = { key: th.dataset.sort, dir: invSort.key === th.dataset.sort ? -invSort.dir : 1 }; renderInventory(); }
});

// Global item actions (inventory, dashboard, sales)
document.addEventListener('click', e => {
  const b = e.target.closest('button');
  if (!b) return;
  const d = b.dataset;
  if (d.edit) openItemDialog(state.items.find(i => i.id === d.edit));
  else if (d.sell) openSellDialog(state.items.find(i => i.id === d.sell));
  else if (d.dup) {
    const src = state.items.find(i => i.id === d.dup);
    const copy = { ...structuredClone(src), id: uid(), sku: nextSku(), status: 'lager', sale: null, purchaseDate: today() };
    state.items.push(copy); save(); render(); toast('Artikel dupliziert');
  } else if (d.del) {
    const it = state.items.find(i => i.id === d.del);
    if (confirm(`„${it.title}“ wirklich löschen?`)) { state.items = state.items.filter(i => i.id !== d.del); save(); render(); toast('Gelöscht'); }
  } else if (d.unsell) {
    const it = state.items.find(i => i.id === d.unsell);
    if (confirm('Verkauf rückgängig machen (z. B. bei Rücksendung)?')) { it.status = 'gelistet'; it.sale = null; save(); render(); }
  } else if (d.delExp) {
    if (confirm('Ausgabe löschen?')) { state.expenses = state.expenses.filter(x => x.id !== d.delExp); save(); render(); }
  } else if (d.editExp) openExpenseDialog(state.expenses.find(x => x.id === d.editExp));
});

/* ---------- Item dialog ---------- */
let editingItem = null;
$('#btn-add-item').addEventListener('click', () => openItemDialog(null));

function openItemDialog(item) {
  editingItem = item;
  const f = $('#form-item');
  f.reset();
  $('#dlg-item-title').textContent = item ? 'Artikel bearbeiten' : 'Neuer Artikel';
  const data = item || { purchaseDate: today(), status: 'lager', condition: 'Sehr gut', platforms: [] };
  ['title', 'sku', 'category', 'brand', 'size', 'condition', 'source', 'purchaseDate', 'purchasePrice', 'extraCosts', 'listPrice', 'location', 'notes'].forEach(k => {
    if (f.elements[k]) f.elements[k].value = data[k] ?? '';
  });
  const statusSel = f.elements.status;
  statusSel.disabled = !!(item && isSold(item));
  statusSel.value = item && isSold(item) ? 'gelistet' : (data.status || 'lager');
  $('#item-platforms').innerHTML = state.settings.platforms.map(p =>
    `<label><input type="checkbox" value="${esc(p.name)}" ${(data.platforms || []).includes(p.name) ? 'checked' : ''}> ${esc(p.name)}</label>`).join('');
  updatePriceSuggestion();
  $('#dlg-item').returnValue = ''; $('#dlg-item').showModal();
}

function updatePriceSuggestion() {
  const f = $('#form-item');
  const cost = num(f.elements.purchasePrice.value) + num(f.elements.extraCosts.value);
  const s = suggestPrice(cost);
  $('#price-suggestion').textContent = s ? `Vorschlag für ${state.settings.targetRoi}% ROI: ab ${fmt(s)}` : '';
}
['purchasePrice', 'extraCosts'].forEach(n => $('#form-item').elements[n].addEventListener('input', updatePriceSuggestion));

$('#dlg-item').addEventListener('close', () => {
  if ($('#dlg-item').returnValue !== 'save') return;
  const f = $('#form-item');
  const v = Object.fromEntries(new FormData(f));
  const platforms = $$('#item-platforms input:checked').map(c => c.value);
  const fields = {
    title: v.title.trim(), category: v.category.trim(), brand: v.brand.trim(), size: v.size.trim(),
    condition: v.condition, source: v.source.trim(), purchaseDate: v.purchaseDate,
    purchasePrice: num(v.purchasePrice), extraCosts: num(v.extraCosts), listPrice: num(v.listPrice),
    location: v.location.trim(), notes: v.notes.trim(), platforms,
  };
  if (editingItem) {
    Object.assign(editingItem, fields, { sku: v.sku.trim() || editingItem.sku });
    if (!isSold(editingItem)) editingItem.status = v.status;
    toast('Artikel gespeichert');
  } else {
    let status = v.status;
    if (status === 'lager' && platforms.length) status = 'gelistet';
    state.items.push({ id: uid(), sku: v.sku.trim() || nextSku(), status, sale: null, createdAt: new Date().toISOString(), ...fields });
    toast('Artikel angelegt');
  }
  save(); render();
});

/* ---------- Sell dialog ---------- */
let sellingItem = null;
let feesTouched = false;

function openSellDialog(item) {
  sellingItem = item; feesTouched = false;
  const f = $('#form-sell');
  f.reset();
  $('#sell-item-name').textContent = `${item.title} (${item.sku}) · EK ${fmt(itemCost(item))}`;
  $('#sell-platform').innerHTML = state.settings.platforms.map(p => `<option>${esc(p.name)}</option>`).join('');
  f.elements.date.value = today();
  f.elements.platform.value = (item.platforms && item.platforms[0]) || state.settings.platforms[0]?.name || '';
  f.elements.price.value = item.listPrice || '';
  f.elements.fees.value = calcFees(f.elements.platform.value, num(f.elements.price.value)) || '';
  updateSellPreview();
  $('#dlg-sell').returnValue = ''; $('#dlg-sell').showModal();
}

function updateSellPreview() {
  const f = $('#form-sell');
  if (!feesTouched) f.elements.fees.value = calcFees(f.elements.platform.value, num(f.elements.price.value)) || '';
  const net = num(f.elements.price.value) - num(f.elements.fees.value) - num(f.elements.shipping.value);
  const profit = net - itemCost(sellingItem);
  const roi = itemCost(sellingItem) ? (profit / itemCost(sellingItem)) * 100 : NaN;
  $('#sell-preview').innerHTML = `Auszahlung: <b>${fmt(net)}</b> · Gewinn: <b class="${signClass(profit)}">${fmt(profit)}</b> · ROI: <b>${pct(roi)}</b> · ${itemAge(sellingItem)} Tage im Bestand`;
}
['price', 'platform', 'shipping'].forEach(n => $('#form-sell').elements[n].addEventListener('input', updateSellPreview));
$('#form-sell').elements.fees.addEventListener('input', () => { feesTouched = true; updateSellPreview(); });

$('#dlg-sell').addEventListener('close', () => {
  if ($('#dlg-sell').returnValue !== 'save' || !sellingItem) return;
  const v = Object.fromEntries(new FormData($('#form-sell')));
  sellingItem.status = 'verkauft';
  sellingItem.sale = { date: v.date, platform: v.platform, price: num(v.price), fees: num(v.fees), shipping: num(v.shipping), buyer: v.buyer.trim() };
  save(); render();
  toast(`Verkauft! Gewinn: ${fmt(itemProfit(sellingItem))}`);
});

/* ---------- Sales ---------- */
let salesSort = { key: 'date', dir: -1 };
['#sales-search', '#sales-platform', '#sales-month'].forEach(s => $(s).addEventListener('input', renderSales));

const SALES_COLS = [
  { key: 'date', label: 'Datum', get: i => i.sale.date },
  { key: 'title', label: 'Artikel' },
  { key: 'platform', label: 'Plattform', get: i => i.sale.platform },
  { key: 'price', label: 'VK', num: true, get: i => num(i.sale.price) },
  { key: 'fees', label: 'Gebühren+Versand', num: true, get: i => num(i.sale.fees) + num(i.sale.shipping) },
  { key: 'cost', label: 'EK', num: true, get: itemCost },
  { key: 'profit', label: 'Gewinn', num: true, get: itemProfit },
  { key: 'roi', label: 'ROI', num: true, get: i => (itemCost(i) ? itemProfit(i) / itemCost(i) : -Infinity) },
  { key: 'age', label: 'Tage', num: true, get: itemAge },
];

function filteredSales() {
  const q = $('#sales-search').value.trim().toLowerCase();
  const plat = $('#sales-platform').value;
  const month = $('#sales-month').value;
  return state.items.filter(i => isSold(i)
    && (!plat || i.sale.platform === plat)
    && (!month || i.sale.date.startsWith(month))
    && (!q || [i.title, i.sku, i.brand, i.category, i.sale.buyer].join(' ').toLowerCase().includes(q)));
}

function renderSales() {
  const list = sortList(filteredSales(), salesSort, SALES_COLS);
  const profit = sum(list, itemProfit);
  $('#sales-summary').innerHTML = `
    <span><b>${list.length}</b> Verkäufe</span>
    <span>Umsatz: <b>${fmt(sum(list, i => num(i.sale.price)))}</b></span>
    <span>Gebühren+Versand: <b>${fmt(sum(list, i => num(i.sale.fees) + num(i.sale.shipping)))}</b></span>
    <span>Rohgewinn: <b class="${signClass(profit)}">${fmt(profit)}</b></span>`;
  const rows = list.map(i => `<tr>
      <td>${fmtDate(i.sale.date)}</td>
      <td class="title">${esc(i.title)}<br><span class="sku">${esc(i.sku)}${i.sale.buyer ? ' · ' + esc(i.sale.buyer) : ''}</span></td>
      <td>${esc(i.sale.platform)}</td>
      <td class="num">${fmt(i.sale.price)}</td>
      <td class="num">${fmt(num(i.sale.fees) + num(i.sale.shipping))}</td>
      <td class="num">${fmt(itemCost(i))}</td>
      <td class="num ${signClass(itemProfit(i))}">${fmt(itemProfit(i))}</td>
      <td class="num">${pct(itemCost(i) ? (itemProfit(i) / itemCost(i)) * 100 : NaN)}</td>
      <td class="num">${itemAge(i)}</td>
      <td class="actions"><button class="small" data-unsell="${i.id}">Rückgängig</button></td>
    </tr>`).join('');
  $('#sales-table').innerHTML = headerRow(SALES_COLS, salesSort, '<th></th>') +
    `<tbody>${rows || `<tr><td colspan="${SALES_COLS.length + 1}" class="empty">Noch keine Verkäufe. Markiere Artikel im Inventar als „Verkauft“.</td></tr>`}</tbody>`;
}
$('#sales-table').addEventListener('click', e => {
  const th = e.target.closest('th[data-sort]');
  if (th) { salesSort = { key: th.dataset.sort, dir: salesSort.key === th.dataset.sort ? -salesSort.dir : 1 }; renderSales(); }
});

/* ---------- Expenses ---------- */
let editingExpense = null;
$('#exp-month').addEventListener('input', renderExpenses);
$('#btn-add-expense').addEventListener('click', () => openExpenseDialog(null));

function openExpenseDialog(exp) {
  editingExpense = exp;
  const f = $('#form-expense'); f.reset();
  const d = exp || { date: today() };
  ['date', 'category', 'amount', 'note'].forEach(k => (f.elements[k].value = d[k] ?? ''));
  $('#dlg-expense').returnValue = ''; $('#dlg-expense').showModal();
}
$('#dlg-expense').addEventListener('close', () => {
  if ($('#dlg-expense').returnValue !== 'save') return;
  const v = Object.fromEntries(new FormData($('#form-expense')));
  const fields = { date: v.date, category: v.category.trim(), amount: num(v.amount), note: v.note.trim() };
  if (editingExpense) Object.assign(editingExpense, fields);
  else state.expenses.push({ id: uid(), ...fields });
  save(); render(); toast('Ausgabe gespeichert');
});

function renderExpenses() {
  const month = $('#exp-month').value;
  const list = state.expenses.filter(e => !month || e.date.startsWith(month)).sort((a, b) => b.date.localeCompare(a.date));
  const byCat = groupBy(list, e => e.category).map(([k, l]) => `<span>${esc(k)}: <b>${fmt(sum(l, e => num(e.amount)))}</b></span>`).join('');
  $('#exp-summary').innerHTML = `<span>Gesamt: <b>${fmt(sum(list, e => num(e.amount)))}</b></span>${byCat}`;
  $('#exp-table').innerHTML = `<thead><tr><th>Datum</th><th>Kategorie</th><th>Notiz</th><th class="num">Betrag</th><th></th></tr></thead><tbody>${
    list.map(e => `<tr><td>${fmtDate(e.date)}</td><td>${esc(e.category)}</td><td class="title">${esc(e.note)}</td><td class="num">${fmt(e.amount)}</td>
      <td class="actions"><button class="small" data-edit-exp="${e.id}">Bearbeiten</button><button class="small danger" data-del-exp="${e.id}">✕</button></td></tr>`).join('')
    || '<tr><td colspan="5" class="empty">Keine Ausgaben erfasst.</td></tr>'}</tbody>`;
}

/* ---------- Settings ---------- */
function renderSettings() {
  const f = $('#settings-form');
  ['monthlyGoal', 'agingDays', 'targetRoi'].forEach(k => (f.elements[k].value = state.settings[k]));
  $('#platform-settings').innerHTML = '<div class="platform-row platform-head"><span>Name</span><span>Gebühr %</span><span>Fix €</span><span></span></div>' +
    state.settings.platforms.map((p, idx) => `<div class="platform-row" data-idx="${idx}">
      <input data-f="name" value="${esc(p.name)}"><input data-f="feePct" type="number" step="0.1" value="${p.feePct}">
      <input data-f="feeFixed" type="number" step="0.01" value="${p.feeFixed}"><button class="small danger" data-rm-plat="${idx}">✕</button></div>`).join('');
}
$('#settings-form').addEventListener('submit', e => {
  e.preventDefault();
  const f = e.target;
  ['monthlyGoal', 'agingDays', 'targetRoi'].forEach(k => (state.settings[k] = num(f.elements[k].value)));
  save(); toast('Einstellungen gespeichert');
});
$('#platform-settings').addEventListener('change', e => {
  const row = e.target.closest('.platform-row'); if (!row || !e.target.dataset.f) return;
  const p = state.settings.platforms[row.dataset.idx];
  const field = e.target.dataset.f;
  if (field === 'name') {
    const old = p.name, neu = e.target.value.trim();
    if (!neu) { e.target.value = old; return; }
    p.name = neu;
    state.items.forEach(i => {
      if (i.platforms) i.platforms = i.platforms.map(x => (x === old ? neu : x));
      if (i.sale && i.sale.platform === old) i.sale.platform = neu;
    });
  } else p[field] = num(e.target.value);
  save(); toast('Plattform gespeichert');
});
$('#platform-settings').addEventListener('click', e => {
  const b = e.target.closest('[data-rm-plat]'); if (!b) return;
  state.settings.platforms.splice(Number(b.dataset.rmPlat), 1); save(); renderSettings();
});
$('#btn-add-platform').addEventListener('click', () => {
  state.settings.platforms.push({ name: 'Neue Plattform ' + (state.settings.platforms.length + 1), feePct: 0, feeFixed: 0 });
  save(); renderSettings();
});

/* ---------- Import / Export ---------- */
function toCsv(rows) {
  return '﻿' + rows.map(r => r.map(c => {
    const s = typeof c === 'number' ? c.toLocaleString('de-DE', { useGrouping: false, maximumFractionDigits: 2 }) : String(c ?? '');
    return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }).join(';')).join('\r\n');
}

$('#btn-export-sales').addEventListener('click', () => {
  const list = filteredSales().sort((a, b) => a.sale.date.localeCompare(b.sale.date));
  download(`verkaeufe-${today()}.csv`, toCsv([
    ['Datum', 'SKU', 'Artikel', 'Kategorie', 'Plattform', 'Verkaufspreis', 'Gebühren', 'Versand', 'Einkaufspreis', 'Nebenkosten', 'Gewinn', 'Einkaufsdatum', 'Quelle', 'Käufer'],
    ...list.map(i => [i.sale.date, i.sku, i.title, i.category, i.sale.platform, num(i.sale.price), num(i.sale.fees), num(i.sale.shipping),
      num(i.purchasePrice), num(i.extraCosts), round2(itemProfit(i)), i.purchaseDate, i.source, i.sale.buyer]),
  ]), 'text/csv;charset=utf-8');
});

const CSV_FIELDS = ['title', 'sku', 'category', 'brand', 'size', 'condition', 'source', 'purchaseDate', 'purchasePrice', 'extraCosts', 'listPrice', 'location', 'notes'];
$('#btn-export-inventory').addEventListener('click', () => {
  download(`inventar-${today()}.csv`, toCsv([[...CSV_FIELDS, 'status', 'platforms'],
    ...state.items.map(i => [...CSV_FIELDS.map(k => i[k]), i.status, (i.platforms || []).join(',')])]), 'text/csv;charset=utf-8');
});

function parseCsv(text) {
  text = text.replace(/^﻿/, '');
  const delim = (text.split('\n')[0].match(/;/g) || []).length >= (text.split('\n')[0].match(/,/g) || []).length ? ';' : ',';
  const rows = []; let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') q = false; else cell += c;
    } else if (c === '"') q = true;
    else if (c === delim) { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter(r => r.some(x => x.trim()));
}

$('#file-import-csv').addEventListener('change', async e => {
  const file = e.target.files[0]; if (!file) return;
  const rows = parseCsv(await file.text());
  e.target.value = '';
  if (rows.length < 2) return toast('CSV ist leer');
  const head = rows[0].map(h => h.trim());
  let n = 0;
  rows.slice(1).forEach(r => {
    const o = Object.fromEntries(head.map((h, i) => [h, (r[i] || '').trim()]));
    if (!o.title) return;
    const item = { id: uid(), status: 'lager', sale: null, platforms: [], createdAt: new Date().toISOString() };
    CSV_FIELDS.forEach(k => (item[k] = o[k] || ''));
    ['purchasePrice', 'extraCosts', 'listPrice'].forEach(k => (item[k] = num(item[k])));
    if (/^\d{1,2}\.\d{1,2}\.\d{4}$/.test(item.purchaseDate)) {
      const [d, m, y] = item.purchaseDate.split('.'); item.purchaseDate = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(item.purchaseDate)) item.purchaseDate = today();
    if (o.platforms) item.platforms = o.platforms.split(',').map(s => s.trim()).filter(Boolean);
    if (['lager', 'gelistet', 'reserviert'].includes(o.status)) item.status = o.status;
    if (!item.sku) item.sku = nextSku();
    state.items.push(item); n++;
  });
  save(); render(); toast(`${n} Artikel importiert`);
});

$('#btn-backup').addEventListener('click', () => {
  download(`resellhub-backup-${today()}.json`, JSON.stringify({ app: 'resellhub', version: 1, exportedAt: new Date().toISOString(), ...state }, null, 2), 'application/json');
});
$('#file-restore').addEventListener('change', async e => {
  const file = e.target.files[0]; if (!file) return;
  e.target.value = '';
  try {
    const data = JSON.parse(await file.text());
    if (!Array.isArray(data.items)) throw new Error('Ungültiges Backup');
    if (!confirm(`Backup mit ${data.items.length} Artikeln laden? Aktuelle Daten werden ersetzt.`)) return;
    const base = DEFAULT_STATE();
    state = { items: data.items, expenses: data.expenses || [], settings: { ...base.settings, ...(data.settings || {}) }, nextSku: data.nextSku || data.items.length + 1 };
    save(); render(); toast('Backup wiederhergestellt');
  } catch (err) { toast('Backup konnte nicht gelesen werden'); }
});
$('#btn-reset').addEventListener('click', () => {
  if (confirm('Wirklich ALLE Daten löschen? Das kann nicht rückgängig gemacht werden.')) { state = DEFAULT_STATE(); save(); render(); toast('Alle Daten gelöscht'); }
});
$('#btn-demo').addEventListener('click', () => {
  if (state.items.length && !confirm('Demodaten zu bestehenden Daten hinzufügen?')) return;
  loadDemo(); save(); render(); toast('Demodaten geladen');
});

function loadDemo() {
  const cats = [
    ['Sneaker', ['Nike', 'Adidas', 'New Balance'], [25, 70]],
    ['Jacken', ['The North Face', 'Patagonia', 'Carhartt'], [15, 60]],
    ['Vintage', ['Levi\'s', 'Ralph Lauren', 'Tommy Hilfiger'], [4, 20]],
    ['Elektronik', ['Nintendo', 'Sony', 'Apple'], [20, 120]],
    ['Bücher & Medien', ['Diverse'], [1, 5]],
  ];
  const sources = ['Flohmarkt', 'Outlet', 'Kleinanzeigen', 'Second-Hand-Laden', 'Haushaltsauflösung'];
  const plats = state.settings.platforms.map(p => p.name).filter(n => n !== 'Vor Ort');
  const rnd = (a, b) => a + Math.random() * (b - a);
  const pick = arr => arr[Math.floor(Math.random() * arr.length)];
  const d = n => new Date(Date.now() - n * DAY).toISOString().slice(0, 10);
  for (let k = 0; k < 70; k++) {
    const [cat, brands, [lo, hi]] = pick(cats);
    const ek = round2(rnd(lo, hi));
    const daysAgo = Math.floor(rnd(1, 330));
    const listPrice = Math.round(ek * rnd(1.6, 3.2));
    const platforms = [pick(plats)];
    const item = {
      id: uid(), sku: nextSku(), title: `${pick(brands)} ${cat === 'Bücher & Medien' ? 'Buchpaket' : cat.replace(/n$/, '')} ${Math.floor(rnd(1, 99))}`,
      category: cat, brand: pick(brands), size: cat === 'Sneaker' ? String(Math.floor(rnd(38, 46))) : '', condition: pick(['Neu mit Etikett', 'Sehr gut', 'Gut']),
      source: pick(sources), purchaseDate: d(daysAgo), purchasePrice: ek, extraCosts: Math.random() < 0.3 ? round2(rnd(1, 6)) : 0,
      listPrice, location: `Box ${Math.floor(rnd(1, 9))}`, notes: '', platforms, status: 'gelistet', sale: null, createdAt: new Date().toISOString(),
    };
    const sellAfter = Math.floor(rnd(2, 90));
    if (Math.random() < 0.65 && sellAfter < daysAgo) {
      const price = Math.round(listPrice * rnd(0.75, 1));
      item.status = 'verkauft';
      item.sale = { date: d(daysAgo - sellAfter), platform: platforms[0], price, fees: calcFees(platforms[0], price), shipping: Math.random() < 0.3 ? 4.99 : 0, buyer: '' };
    } else if (Math.random() < 0.15) item.status = 'lager';
    state.items.push(item);
  }
  for (let m = 0; m < 11; m++) {
    state.expenses.push({ id: uid(), date: d(m * 30 + 3), category: 'Versandmaterial', amount: round2(rnd(8, 25)), note: 'Kartons & Polsterfolie' });
    if (m % 3 === 0) state.expenses.push({ id: uid(), date: d(m * 30 + 10), category: 'Fahrtkosten', amount: round2(rnd(10, 30)), note: 'Flohmarkt-Tour' });
  }
}

/* ---------- Init ---------- */
let initialView = 'dashboard';
try { initialView = localStorage.getItem('resellhub:view') || 'dashboard'; } catch (_) { /* ignore */ }
showView($('#view-' + initialView) ? initialView : 'dashboard');

if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
