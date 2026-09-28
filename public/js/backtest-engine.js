// Pure backtesting math for the "Backtest Theater" (no DOM, so it runs under
// node:test too). Every strategy maps a price history to a daily position in
// {0, 1}. The position decided at day t's close earns day t+1's return, so a
// signal can never trade on the close it was computed from (no lookahead).
const DAY = 86_400_000;
const TRADING_DAYS = 252;

// Expands the compact file written by scripts/fetch-spy.js.
export function decodePrices({ start, gaps, close }) {
  let day = Date.parse(`${start}T00:00:00Z`) / DAY;
  const dates = gaps.map((gap) => {
    day += gap;
    return new Date(day * DAY).toISOString().slice(0, 10);
  });
  return { dates, close };
}

function sma(values, n) {
  const out = new Array(values.length).fill(NaN);
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= n) sum -= values[i - n];
    if (i >= n - 1) out[i] = sum / n;
  }
  return out;
}

function dailyReturns(close) {
  return close.map((c, i) => (i === 0 ? 0 : c / close[i - 1] - 1));
}

export const STRATEGIES = {
  buyhold: {
    label: 'Buy & Hold',
    blurb: 'Always invested. The benchmark every strategy has to beat.',
    params: [],
    positions: (close) => close.map(() => 1),
  },
  sma: {
    label: 'Moving-Average Crossover',
    blurb: 'Invested while the fast average is above the slow one; in cash otherwise.',
    params: [
      { key: 'fast', label: 'Fast MA (days)', min: 5, max: 100, step: 5, value: 50 },
      { key: 'slow', label: 'Slow MA (days)', min: 50, max: 300, step: 10, value: 200 },
    ],
    positions(close, { fast, slow }) {
      const f = sma(close, fast);
      const s = sma(close, slow);
      return close.map((_, i) => (f[i] > s[i] ? 1 : 0));
    },
  },
  momentum: {
    label: 'Time-Series Momentum',
    blurb: 'Invested while the trailing return over the lookback window is positive.',
    params: [
      { key: 'lookback', label: 'Lookback (days)', min: 20, max: 252, step: 1, value: 252 },
    ],
    positions(close, { lookback }) {
      return close.map((c, i) => (i >= lookback && c > close[i - lookback] ? 1 : 0));
    },
  },
  volatility: {
    label: 'Calm-Regime Filter',
    blurb: 'A transparent stand-in for regime detection: invested only while recent realized volatility is below a threshold.',
    params: [
      { key: 'window', label: 'Vol window (days)', min: 10, max: 60, step: 5, value: 20 },
      { key: 'threshold', label: 'Max annualized vol (%)', min: 10, max: 40, step: 1, value: 22 },
    ],
    positions(close, { window, threshold }) {
      const r = dailyReturns(close);
      const limit = threshold / 100;
      return close.map((_, i) => {
        if (i < window) return 0;
        const slice = r.slice(i - window + 1, i + 1);
        const mean = slice.reduce((a, b) => a + b, 0) / window;
        const variance = slice.reduce((a, b) => a + (b - mean) ** 2, 0) / (window - 1);
        return Math.sqrt(variance * TRADING_DAYS) < limit ? 1 : 0;
      });
    },
  },
};

export function defaultParams(key) {
  return Object.fromEntries(STRATEGIES[key].params.map((p) => [p.key, p.value]));
}

// Runs one strategy over [from, to] (inclusive ISO dates). Indicators are
// computed on the full history first, so the window's first days aren't
// starved of lookback data.
export function backtest({ dates, close }, key, params = defaultParams(key), { from, to, costBps = 5 } = {}) {
  const pos = STRATEGIES[key].positions(close, params);
  // findIndex returns -1 when `from` is past the data; don't let that clamp to 1.
  const start = from ? dates.findIndex((d) => d >= from) : 1;
  const lo = Math.max(1, start);
  const hi = to ? dates.findLastIndex((d) => d <= to) : dates.length - 1;
  if (start < 0 || hi <= lo) throw new Error('Pick a date range with at least two trading days.');

  const cost = costBps / 10_000;
  const equity = [1];
  const daily = [];
  let trades = 0;
  let invested = 0;
  let prev = 0; // start the window in cash, so entering counts as a trade
  for (let i = lo; i <= hi; i++) {
    const held = pos[i - 1]; // decided at yesterday's close
    const turnover = Math.abs(held - prev);
    if (turnover) trades++;
    const r = held * (close[i] / close[i - 1] - 1) - turnover * cost;
    daily.push(r);
    equity.push(equity.at(-1) * (1 + r));
    invested += held;
    prev = held;
  }

  return {
    dates: dates.slice(lo - 1, hi + 1),
    equity,
    stats: summarize(equity, daily, dates[lo - 1], dates[hi], { trades, exposure: invested / daily.length }),
  };
}

export function summarize(equity, daily, first, last, extra = {}) {
  const years = (Date.parse(last) - Date.parse(first)) / (365.25 * DAY);
  const total = equity.at(-1) - 1;
  const mean = daily.reduce((a, b) => a + b, 0) / daily.length;
  const sd = Math.sqrt(daily.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, daily.length - 1));
  let peak = -Infinity;
  let maxDrawdown = 0;
  for (const e of equity) {
    peak = Math.max(peak, e);
    maxDrawdown = Math.min(maxDrawdown, e / peak - 1);
  }
  return {
    totalReturn: total,
    cagr: years > 0 ? (1 + total) ** (1 / years) - 1 : 0,
    volatility: sd * Math.sqrt(TRADING_DAYS),
    sharpe: sd > 0 ? (mean / sd) * Math.sqrt(TRADING_DAYS) : 0, // risk-free rate taken as 0
    maxDrawdown,
    ...extra,
  };
}
