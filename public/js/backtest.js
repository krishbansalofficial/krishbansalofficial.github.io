// "Backtest Theater": an interactive SPY backtester in a modal. The math lives
// in backtest-engine.js; this file is controls, an SVG equity chart, and a
// stats table.
import { h } from './dom.js';
import { STRATEGIES, backtest, decodePrices, defaultParams } from './backtest-engine.js';

const dialog = document.getElementById('lab');
const body = dialog.querySelector('.lab');
let prices = null;
const state = { key: 'sma', params: defaultParams('sma'), from: '2021-01-01', to: '', costBps: 5 };

const pct = (x, digits = 1) => `${x >= 0 ? '' : '−'}${Math.abs(x * 100).toFixed(digits)}%`;
const money = (x) => `$${Math.round(x * 10_000).toLocaleString('en-US')}`;

export async function openLab(preset) {
  if (preset && STRATEGIES[preset]) {
    state.key = preset;
    state.params = defaultParams(preset);
  }
  if (!dialog.open) dialog.showModal();
  if (!prices) {
    body.replaceChildren(h('p', { class: 'lab__loading' }, 'Loading 25 years of SPY prices…'));
    try {
      const res = await fetch('data/spy.json');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      prices = decodePrices(await res.json());
    } catch (err) {
      body.replaceChildren(h('p', { class: 'lab__loading' }, `Couldn’t load price data: ${err.message}`));
      return;
    }
  }
  render();
}

function render() {
  const { dates } = prices;
  const years = [...new Set(dates.map((d) => d.slice(0, 4)))];
  const strategy = STRATEGIES[state.key];

  const select = h('select', { id: 'lab-strategy', onChange: (e) => {
    state.key = e.target.value;
    state.params = defaultParams(state.key);
    render();
  } }, ...Object.entries(STRATEGIES)
    .filter(([key]) => key !== 'buyhold')
    .map(([key, s]) => h('option', { value: key, selected: key === state.key }, s.label)));

  const yearSelect = (id, value, onPick, endOfYear) => h('select', { id, onChange: (e) => { onPick(e.target.value); update(); } },
    ...years.map((y) => {
      const v = endOfYear ? (y === years.at(-1) ? '' : `${y}-12-31`) : `${y}-01-01`;
      return h('option', { value: v, selected: v === value }, y);
    }));

  const sliders = strategy.params.map((p) => {
    const out = h('output', {}, String(state.params[p.key]));
    return h('label', { class: 'lab__field' },
      h('span', {}, p.label, ' ', out),
      h('input', {
        type: 'range', min: p.min, max: p.max, step: p.step, value: state.params[p.key],
        onInput: (e) => { state.params[p.key] = Number(e.target.value); out.textContent = e.target.value; update(); },
      }));
  });
  const costOut = h('output', {}, `${state.costBps} bps`);

  body.replaceChildren(
    h('header', { class: 'lab__head' },
      h('p', { class: 'lab__kicker' }, h('b', {}, 'K'), 'Interactive Original'),
      h('h2', { class: 'lab__title', id: 'lab-title' }, 'Backtest Theater'),
      h('p', { class: 'lab__lede' }, 'Pick a strategy, tune it, and see how it would have traded SPY. Everything runs in your browser on real adjusted daily closes.')),
    h('div', { class: 'lab__controls' },
      h('label', { class: 'lab__field' }, h('span', {}, 'Strategy'), select),
      h('div', { class: 'lab__range' },
        h('label', { class: 'lab__field' }, h('span', {}, 'From'), yearSelect('lab-from', state.from, (v) => { state.from = v; })),
        h('label', { class: 'lab__field' }, h('span', {}, 'To'), yearSelect('lab-to', state.to, (v) => { state.to = v; }, true))),
      ...sliders,
      h('label', { class: 'lab__field' },
        h('span', {}, 'Trading cost ', costOut),
        h('input', {
          type: 'range', min: 0, max: 50, step: 1, value: state.costBps,
          onInput: (e) => { state.costBps = Number(e.target.value); costOut.textContent = `${e.target.value} bps`; update(); },
        }))),
    h('p', { class: 'lab__blurb' }, strategy.blurb),
    h('div', { class: 'lab__chart' }),
    h('div', { class: 'lab__stats' }),
    h('p', { class: 'lab__fine' },
      'Signals use only data up to each day’s close and trade at the next close, so nothing peeks at the future. ',
      'Sharpe assumes a 0% risk-free rate. Data: SPY adjusted closes from Yahoo Finance, ',
      `${dates[0]} to ${dates.at(-1)}. A teaching toy, not investment advice.`),
  );
  update();
}

function update() {
  const range = { from: state.from, to: state.to, costBps: state.costBps };
  let run, bench;
  try {
    run = backtest(prices, state.key, state.params, range);
    bench = backtest(prices, 'buyhold', {}, range);
  } catch (err) {
    body.querySelector('.lab__chart').replaceChildren(h('p', { class: 'lab__loading' }, err.message));
    body.querySelector('.lab__stats').replaceChildren();
    return;
  }
  body.querySelector('.lab__chart').replaceChildren(chart(run, bench));
  body.querySelector('.lab__stats').replaceChildren(statsTable(run.stats, bench.stats));
}

function statsTable(s, b) {
  const rows = [
    ['$10,000 becomes', money(1 + s.totalReturn), money(1 + b.totalReturn)],
    ['Annual return (CAGR)', pct(s.cagr), pct(b.cagr)],
    ['Volatility', pct(s.volatility), pct(b.volatility)],
    ['Sharpe ratio', s.sharpe.toFixed(2), b.sharpe.toFixed(2)],
    ['Max drawdown', pct(s.maxDrawdown), pct(b.maxDrawdown)],
    ['Time invested', pct(s.exposure, 0), pct(b.exposure, 0)],
    ['Trades', String(s.trades), String(b.trades)],
  ];
  // Higher is better except for volatility and drawdown depth.
  const better = [s.totalReturn > b.totalReturn, s.cagr > b.cagr, s.volatility < b.volatility,
    s.sharpe > b.sharpe, s.maxDrawdown > b.maxDrawdown, null, null];
  return h('table', {},
    h('thead', {}, h('tr', {}, h('th', {}, ''), h('th', { scope: 'col' }, STRATEGIES[state.key].label), h('th', { scope: 'col' }, 'Buy & Hold'))),
    h('tbody', {}, ...rows.map(([label, a, c], i) =>
      h('tr', {}, h('th', { scope: 'row' }, label), h('td', { class: better[i] === true ? 'is-better' : null }, a), h('td', {}, c)))));
}

const W = 760;
const H = 280;
const PAD = { l: 58, r: 12, t: 12, b: 26 };

function chart(run, bench) {
  const n = run.equity.length;
  const all = [...run.equity, ...bench.equity];
  const lo = Math.min(...all);
  const hi = Math.max(...all);
  // Log scale, so a 10% move looks the same size in 2001 and 2025.
  const y = (v) => PAD.t + (1 - (Math.log(v) - Math.log(lo)) / (Math.log(hi) - Math.log(lo) || 1)) * (H - PAD.t - PAD.b);
  const x = (i) => PAD.l + (i / (n - 1)) * (W - PAD.l - PAD.r);
  const path = (eq) => eq.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join('');

  const ticks = Array.from({ length: 5 }, (_, i) => Math.exp(Math.log(lo) + (i / 4) * (Math.log(hi) - Math.log(lo))));
  const years = [];
  run.dates.forEach((d, i) => {
    if (i > 0 && d.slice(0, 4) !== run.dates[i - 1].slice(0, 4)) years.push([i, d.slice(0, 4)]);
  });
  const every = Math.ceil(years.length / 8);

  const ns = 'http://www.w3.org/2000/svg';
  const el = (tag, attrs, text) => {
    const node = document.createElementNS(ns, tag);
    for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
    if (text != null) node.textContent = text;
    return node;
  };

  const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': `Growth of $10,000: ${STRATEGIES[state.key].label} ends at ${money(run.equity.at(-1))}, Buy & Hold at ${money(bench.equity.at(-1))}` });
  for (const t of ticks) {
    svg.append(el('line', { x1: PAD.l, x2: W - PAD.r, y1: y(t), y2: y(t), class: 'grid' }));
    svg.append(el('text', { x: PAD.l - 8, y: y(t) + 4, 'text-anchor': 'end' }, money(t)));
  }
  years.filter((_, i) => i % every === 0).forEach(([i, label]) => {
    svg.append(el('text', { x: x(i), y: H - 6, 'text-anchor': 'middle' }, label));
  });
  svg.append(el('path', { d: path(bench.equity), class: 'bench' }));
  svg.append(el('path', { d: path(run.equity), class: 'strat' }));

  // Hover crosshair with a readout of both curves on that day.
  const cross = el('line', { y1: PAD.t, y2: H - PAD.b, class: 'cross', visibility: 'hidden' });
  svg.append(cross);
  const readout = h('div', { class: 'lab__readout' });
  svg.addEventListener('pointermove', (e) => {
    const box = svg.getBoundingClientRect();
    const px = ((e.clientX - box.left) / box.width) * W;
    const i = Math.round(((px - PAD.l) / (W - PAD.l - PAD.r)) * (n - 1));
    if (i < 0 || i >= n) return;
    cross.setAttribute('x1', x(i));
    cross.setAttribute('x2', x(i));
    cross.setAttribute('visibility', 'visible');
    readout.textContent = `${run.dates[i]} · Strategy ${money(run.equity[i])} · Buy & Hold ${money(bench.equity[i])}`;
  });
  svg.addEventListener('pointerleave', () => {
    cross.setAttribute('visibility', 'hidden');
    readout.textContent = '';
  });

  return h('figure', {},
    h('figcaption', { class: 'lab__legend' },
      h('span', { class: 'lab__key lab__key--strat' }, STRATEGIES[state.key].label),
      h('span', { class: 'lab__key lab__key--bench' }, 'Buy & Hold'),
      readout),
    svg);
}
