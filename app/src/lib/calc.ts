// Reine Berechnungslogik – keine Abhängigkeit zu React oder Supabase.

export type Item = {
  id: string;
  name: string;
  cat: string;
  src: string;
  buy: number;
  buyDate: string; // JJJJ-MM-TT
  plat: string;
  sell: number | null; // null = noch im Lager
  sellDate: string;
  ship: number;
};

export type Platform = { name: string; pct: number; fix: number };
export type Settings = { oldDays: number; fixed: number };
export type UserState = { platforms: Platform[]; settings: Settings; checks: Record<string, boolean> };

export const DEFAULT_PLATFORMS: Platform[] = [
  { name: 'eBay (gewerblich)', pct: 11, fix: 0.35 },
  { name: 'eBay (privat)', pct: 0, fix: 0 },
  { name: 'Vinted', pct: 0, fix: 0 },
  { name: 'Kleinanzeigen', pct: 0, fix: 0 },
  { name: 'Etsy', pct: 10.5, fix: 0.55 },
  { name: 'Eigener Shop', pct: 3, fix: 0.25 },
];
export const DEFAULT_SETTINGS: Settings = { oldDays: 60, fixed: 0 };
export const defaultState = (): UserState => ({
  platforms: DEFAULT_PLATFORMS.map((p) => ({ ...p })),
  settings: { ...DEFAULT_SETTINGS },
  checks: {},
});

export const num = (v: unknown): number => {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
};
export const eur = (n: number) =>
  (Number.isFinite(n) ? n : 0).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });
export const pct = (n: number | null) =>
  n != null && Number.isFinite(n) ? `${Math.round(n).toLocaleString('de-DE')} %` : '–';
export const today = () => new Date().toISOString().slice(0, 10);
export const isDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(new Date(s).getTime());
export const days = (a: string, b: string) => Math.round((new Date(b).getTime() - new Date(a).getTime()) / 864e5);
export const fmtDate = (s: string) => (isDate(s) ? new Date(s).toLocaleDateString('de-DE') : '–');

export function newId(): string {
  const c = (globalThis as any).crypto;
  if (c?.randomUUID) return c.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => {
    const r = (Math.random() * 16) | 0;
    return (ch === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}
export const isUuid = (s: unknown) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(s ?? ''));

export function fees(price: number, platName: string, platforms: Platform[]) {
  const p = platforms.find((x) => x.name === platName);
  if (!p || price <= 0) return 0;
  return (price * num(p.pct)) / 100 + num(p.fix);
}

export type Calc = { sold: boolean; fees: number; profit: number; roi: number | null; age: number };
export function calcItem(it: Item, platforms: Platform[]): Calc {
  const sold = it.sell != null;
  const f = sold ? fees(it.sell!, it.plat, platforms) : 0;
  const profit = sold ? it.sell! - it.buy - it.ship - f : 0;
  const roi = sold && it.buy > 0 ? (profit / it.buy) * 100 : null;
  const end = sold && isDate(it.sellDate) ? it.sellDate : today();
  const age = isDate(it.buyDate) ? Math.max(0, days(it.buyDate, end)) : 0;
  return { sold, fees: f, profit, roi, age };
}

export type Stats = ReturnType<typeof stats>;
export function stats(items: Item[], st: UserState) {
  const rows = items.map((it) => ({ it, ...calcItem(it, st.platforms) }));
  const sold = rows.filter((r) => r.sold);
  const stock = rows.filter((r) => !r.sold);
  const revenue = sold.reduce((a, r) => a + (r.it.sell ?? 0), 0);
  const profit = sold.reduce((a, r) => a + r.profit, 0);
  const cost = sold.reduce((a, r) => a + r.it.buy, 0);
  const stockValue = stock.reduce((a, r) => a + r.it.buy, 0);
  const avgDays = sold.length ? sold.reduce((a, r) => a + r.age, 0) / sold.length : 0;
  const t = today();
  const profit30 =
    sold.filter((r) => isDate(r.it.sellDate) && days(r.it.sellDate, t) <= 30).reduce((a, r) => a + r.profit, 0) -
    num(st.settings.fixed);

  const group = (key: (r: (typeof sold)[number]) => string) => {
    const m = new Map<string, number[]>();
    sold.forEach((r) => {
      const k = key(r);
      m.set(k, [...(m.get(k) ?? []), r.profit]);
    });
    return m;
  };
  const byMonth = [...group((r) => (r.it.sellDate || r.it.buyDate).slice(0, 7)).entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .slice(-12)
    .map(([k, v]) => ({
      label: new Date(k + '-01').toLocaleDateString('de-DE', { month: 'short', year: '2-digit' }),
      value: v.reduce((x, y) => x + y, 0),
    }));
  const byPlatform = [...group((r) => r.it.plat || 'Ohne Plattform').entries()]
    .map(([k, v]) => ({ label: k, value: v.reduce((x, y) => x + y, 0) }))
    .sort((a, b) => b.value - a.value);
  const byCategory = [...group((r) => r.it.cat || 'Ohne Kategorie').entries()]
    .map(([k, v]) => ({ label: `${k} (${v.length})`, value: v.reduce((x, y) => x + y, 0) / v.length }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 8);
  const old = stock.filter((r) => r.age > num(st.settings.oldDays)).sort((a, b) => b.age - a.age);

  return { rows, sold, stock, revenue, profit, cost, stockValue, avgDays, profit30, byMonth, byPlatform, byCategory, old };
}

export type GoalInput = { goal: number; avgProfit: number; avgBuy: number; days: number; minutes: number; sellThrough: number; fixed: number };
export function goalPlan(g: GoalInput) {
  if (g.avgProfit <= 0) return null;
  const st = Math.max(1, g.sellThrough) / 100;
  const salesM = Math.ceil((g.goal + g.fixed) / g.avgProfit);
  const listM = Math.ceil(salesM / st);
  const stockNeeded = Math.ceil((salesM * Math.max(1, g.days)) / 30 / st);
  const capital = stockNeeded * g.avgBuy;
  const hours = (listM * g.minutes) / 60;
  return { salesM, salesW: salesM / 4.33, salesD: salesM / 30, listM, stockNeeded, capital, hours, hoursW: hours / 4.33, hourly: hours ? g.goal / hours : 0 };
}

export type SimInput = { capital: number; roi: number; turns: number; reinvest: number; max: number; months: number };
export function simulate(s: SimInput) {
  let cap = s.capital;
  const max = s.max > 0 ? s.max : Infinity;
  const months = Math.min(36, Math.max(1, Math.round(s.months) || 1));
  const data: { m: number; profit: number; take: number }[] = [];
  let taken = 0;
  for (let m = 1; m <= months; m++) {
    const profit = cap * (s.roi / 100) * s.turns;
    const reinv = profit * (s.reinvest / 100);
    let next = cap + reinv;
    let overflow = 0;
    if (next > max) {
      overflow = next - max;
      next = max;
    }
    const take = profit - reinv + overflow;
    taken += take;
    data.push({ m, profit, take });
    cap = next;
  }
  return { data, capital: cap, taken, capped: cap >= max };
}

export const CHECKLIST: [string, string[]][] = [
  ['Stufe 1: Fundament', [
    'Jeden Einkauf und Verkauf in der App erfassen',
    'Gewerbe anmelden und Steuerfrage klären (z. B. Kleinunternehmerregelung), ggf. mit Steuerberatung',
    'Separates Geschäftskonto für das Reselling nutzen',
    'Feste Foto-Ecke mit gutem Licht und neutralem Hintergrund einrichten',
    'Vorlagen für Titel, Beschreibung und Maße der wichtigsten Kategorien anlegen',
  ]],
  ['Stufe 2: Effizienz', [
    'Die 2–3 profitabelsten Kategorien in der Übersicht finden und darauf fokussieren',
    'Verlässliche Einkaufsquellen aufbauen (Haushaltsauflösungen, Restposten, feste Flohmärkte)',
    'Fotos, Einstellen und Versand an festen Tagen bündeln',
    'Versandmaterial in größeren Mengen günstiger kaufen',
    'Ladenhüter-Regel festlegen: nach X Tagen Preis senken oder im Bundle verkaufen',
  ]],
  ['Stufe 3: Reichweite', [
    'Auf mindestens einer weiteren Plattform einstellen',
    'Lagerplätze nummerieren (z. B. Kiste A3) und beim Artikel notieren',
    'Kanal für Stammkundschaft aufbauen (Instagram, WhatsApp-Kanal, Newsletter)',
    'Eigenen Shop prüfen, sobald genug Stammkundschaft da ist',
  ]],
  ['Stufe 4: Skalieren', [
    'Wiederkehrende Aufgaben auslagern (Fotos, Verpackung), z. B. per Minijob',
    'Feste monatliche Reinvestitionsquote festlegen',
    'Größeres Lager anmieten, wenn Platz zum Engpass wird',
    'Monatliches Review: Kennzahlen prüfen und Ziel im Plan anpassen',
  ]],
];

// CSV (Semikolon, Excel-kompatibel)
const COLS = ['name', 'cat', 'src', 'buy', 'buyDate', 'plat', 'sell', 'sellDate', 'ship'] as const;
export function toCsv(items: Item[], platforms: Platform[]) {
  const q = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lines = [
    [...COLS, 'gebuehren', 'gewinn'].join(';'),
    ...items.map((it) => {
      const c = calcItem(it, platforms);
      const vals = COLS.map((k) => q(k === 'sell' ? (it.sell ?? '') : it[k]));
      return [...vals, c.sold ? c.fees.toFixed(2) : '', c.sold ? c.profit.toFixed(2) : ''].join(';');
    }),
  ];
  return '﻿' + lines.join('\n');
}
export function parseCsv(text: string, fallbackPlatform: string): Item[] {
  const t = text.replace(/^﻿/, '');
  const rows: string[][] = [];
  let row: string[] = [], cur = '', quoted = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (quoted) {
      if (c === '"') { if (t[i + 1] === '"') { cur += '"'; i++; } else quoted = false; } else cur += c;
    } else if (c === '"') quoted = true;
    else if (c === ';' || c === ',') { row.push(cur); cur = ''; }
    else if (c === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; }
    else if (c !== '\r') cur += c;
  }
  if (cur || row.length) { row.push(cur); rows.push(row); }
  const head = (rows.shift() ?? []).map((h) => h.trim());
  if (!head.includes('name')) throw new Error('Die erste Zeile braucht mindestens die Spalte „name“.');
  const get = (r: string[], k: string) => { const i = head.indexOf(k); return i >= 0 ? (r[i] ?? '').trim() : ''; };
  return rows.filter((r) => r.join('').trim()).map((r) => {
    const sell = get(r, 'sell');
    return {
      id: newId(), name: get(r, 'name') || 'Ohne Namen', cat: get(r, 'cat'), src: get(r, 'src'),
      buy: num(get(r, 'buy')), buyDate: isDate(get(r, 'buyDate')) ? get(r, 'buyDate') : today(),
      plat: get(r, 'plat') || fallbackPlatform, sell: sell === '' ? null : num(sell),
      sellDate: isDate(get(r, 'sellDate')) ? get(r, 'sellDate') : '', ship: num(get(r, 'ship')),
    };
  });
}

export function demoItems(platforms: Platform[]): Item[] {
  const cats: [string, number, number][] = [['Sneaker', 35, 90], ['Vintage-Jacken', 12, 45], ['Elektronik', 40, 85], ['Bücher', 1, 9], ['Spielzeug/LEGO', 20, 55]];
  const now = Date.now();
  return Array.from({ length: 40 }, (_, i) => {
    const [c, b, s] = cats[i % cats.length];
    const bd = new Date(now - (Math.random() * 300 + 5) * 864e5);
    const sold = Math.random() < 0.8;
    const sd = new Date(Math.min(now, bd.getTime() + (Math.random() * 50 + 3) * 864e5));
    return {
      id: newId(), name: `Beispiel: ${c} #${i + 1}`, cat: c, src: ['Flohmarkt', 'Kleinanzeigen', 'Restposten'][i % 3],
      buy: +(b * (0.6 + Math.random() * 0.8)).toFixed(2), buyDate: bd.toISOString().slice(0, 10),
      plat: platforms[i % platforms.length]?.name ?? '', sell: sold ? +(s * (0.7 + Math.random() * 0.6)).toFixed(2) : null,
      sellDate: sold ? sd.toISOString().slice(0, 10) : '', ship: sold ? +(Math.random() * 4).toFixed(2) : 0,
    };
  });
}
