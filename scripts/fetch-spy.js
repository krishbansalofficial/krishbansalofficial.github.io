// Refreshes public/data/spy.json, the price history the in-browser backtester
// runs on. It is committed rather than fetched at build time so the site (and
// CI) never depend on a market-data API being up.
//
//   node scripts/fetch-spy.js
//
// Source: Yahoo Finance's public chart endpoint, dividend- and split-adjusted
// daily closes. Dates are stored as day gaps from the first date to keep the
// file small (~70 KB for 25 years).
import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'public', 'data', 'spy.json');
const START = Date.UTC(2000, 0, 1) / 1000;
const DAY = 86_400_000;

const url = `https://query1.finance.yahoo.com/v8/finance/chart/SPY?period1=${START}&period2=${Math.floor(Date.now() / 1000)}&interval=1d&events=div,split`;
const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
if (!res.ok) throw new Error(`Yahoo returned ${res.status}`);
const { chart } = await res.json();
const result = chart?.result?.[0];
const closes = result?.indicators?.adjclose?.[0]?.adjclose;
if (!result?.timestamp || !closes) throw new Error('Unexpected response shape from Yahoo');

// Timestamps are the exchange open; shift by the exchange offset to get the
// New York trading date, then drop days with no close.
const rows = result.timestamp
  .map((t, i) => [Math.floor((t + result.meta.gmtoffset) * 1000 / DAY), closes[i]])
  .filter(([, c]) => Number.isFinite(c));

const first = rows[0][0];
const gaps = rows.map(([day], i) => (i === 0 ? 0 : day - rows[i - 1][0]));
const data = {
  symbol: 'SPY',
  source: 'Yahoo Finance (adjusted close)',
  start: new Date(first * DAY).toISOString().slice(0, 10),
  gaps,
  close: rows.map(([, c]) => Math.round(c * 100) / 100),
};

await mkdir(path.dirname(OUT), { recursive: true });
await writeFile(OUT, JSON.stringify(data));
console.log(`Wrote ${rows.length} trading days (${data.start} → ${new Date(rows.at(-1)[0] * DAY).toISOString().slice(0, 10)}) to ${path.relative(ROOT, OUT)}`);
