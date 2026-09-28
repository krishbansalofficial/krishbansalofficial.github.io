import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { STRATEGIES, backtest, decodePrices } from '../public/js/backtest-engine.js';

// A tiny synthetic market: flat, then +10%, then -10%.
const toy = {
  dates: ['2020-01-01', '2020-01-02', '2020-01-03', '2020-01-04'],
  close: [100, 100, 110, 99],
};

describe('backtest engine', () => {
  it('decodes the compact price file into ISO dates', () => {
    const { dates, close } = decodePrices({ start: '2020-01-03', gaps: [0, 3, 1], close: [1, 2, 3] });
    assert.deepEqual(dates, ['2020-01-03', '2020-01-06', '2020-01-07']);
    assert.deepEqual(close, [1, 2, 3]);
  });

  it('buy & hold tracks the price exactly when trading is free', () => {
    const { equity, stats } = backtest(toy, 'buyhold', {}, { costBps: 0 });
    assert.ok(Math.abs(equity.at(-1) - 0.99) < 1e-12);
    assert.ok(Math.abs(stats.maxDrawdown - -0.1) < 1e-12);
    assert.equal(stats.trades, 1);
    assert.equal(stats.exposure, 1);
  });

  it('charges costs on every position change', () => {
    const free = backtest(toy, 'buyhold', {}, { costBps: 0 });
    const paid = backtest(toy, 'buyhold', {}, { costBps: 100 });
    // Buy & hold trades once (the entry), so 100 bps costs exactly 1% of equity.
    assert.ok(Math.abs(paid.equity.at(-1) - free.equity.at(-1) * 0.99) < 1e-12);
  });

  it('never trades on the close a signal was computed from', () => {
    // A cheating strategy that is long exactly on the days the price rises.
    // Because positions only earn the *next* day's return, it can't profit.
    STRATEGIES.peek = {
      label: 'peek', params: [],
      positions: (close) => close.map((c, i) => (i > 0 && c > close[i - 1] ? 1 : 0)),
    };
    try {
      const { equity } = backtest(toy, 'peek', {}, { costBps: 0 });
      // Long only on day 3 (decided at day 2's up-close), which then falls 10%.
      assert.ok(Math.abs(equity.at(-1) - 0.9) < 1e-12);
    } finally {
      delete STRATEGIES.peek;
    }
  });

  it('rejects an empty date range', () => {
    assert.throws(() => backtest(toy, 'buyhold', {}, { from: '2021-01-01' }), /date range/);
  });

  it('matches the resume: SPY buy & hold drew down 24.5% from Jan 2021 to May 2026', () => {
    const prices = decodePrices(JSON.parse(readFileSync(new URL('../public/data/spy.json', import.meta.url), 'utf8')));
    const { stats } = backtest(prices, 'buyhold', {}, { from: '2021-01-01', to: '2026-05-31' });
    assert.equal(stats.maxDrawdown.toFixed(3), '-0.245');
  });
});
