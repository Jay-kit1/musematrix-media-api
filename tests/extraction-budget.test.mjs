import assert from 'node:assert/strict';
import test from 'node:test';
import budget from '../lib/extraction-budget.js';

const complete = { items: [{ type: '视频', mediaMode: 'combined' }] };
const select = results => results.get('primary')?.result || results.get('shared');

test('a complete primary result skips the delayed alternate', async () => {
  let calls = 0;
  const result = await budget.chooseFallback({
    primary: async () => ({ result: complete }),
    alternates: { shared: async () => { calls++; } },
    signal: AbortSignal.timeout(1000),
    combine: select
  });
  assert.equal(result, complete);
  assert.equal(calls, 0);
});

test('a usable alternate returns despite a stalled primary and cancels unused work', async () => {
  let stopped = false;
  const controller = new AbortController();
  const result = await budget.chooseFallback({
    primary: signal => new Promise(resolve => {
      signal.addEventListener('abort', () => { stopped = true; resolve(null); }, { once: true });
    }),
    alternates: { shared: async () => complete },
    signal: controller.signal,
    staggerMs: 0,
    graceMs: 5,
    combine: select
  });
  assert.equal(result, complete);
  assert.equal(stopped, true);
});

test('an expired budget ends the fallback even when upstream never settles', { timeout: 1000 }, async () => {
  const controller = new AbortController();
  const result = await budget.chooseFallback({
    primary: () => new Promise(() => {}),
    alternates: { shared: () => {
      queueMicrotask(() => controller.abort());
      return new Promise(() => {});
    } },
    signal: controller.signal,
    staggerMs: 0,
    combine: select
  });
  assert.equal(result, null);
});
