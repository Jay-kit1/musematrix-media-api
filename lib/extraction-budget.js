const { setTimeout: delay } = require("node:timers/promises");

// Some operations, including OS DNS lookups, cannot be canceled. Stop waiting
// for them, and consume a late rejection without changing the request result.
async function waitWithin(operation, signal) {
  signal.throwIfAborted();
  let onAbort;
  try {
    return await Promise.race([
      new Promise((_, reject) => {
        onAbort = () => reject(signal.reason);
        signal.addEventListener("abort", onAbort, { once: true });
      }),
      Promise.resolve().then(operation)
    ]);
  } finally {
    signal.removeEventListener("abort", onAbort);
  }
}

function hasCompleteVideo(result) {
  return result?.items?.some(item => item.type === "视频" && item.mediaMode === "combined");
}

async function chooseFallback({ primary, alternates, combine, signal, graceMs = 900, staggerMs = 650 }) {
  const controller = new AbortController();
  const work = AbortSignal.any([signal, controller.signal]);
  const pending = new Map();
  const results = new Map();
  let timer;
  const start = (name, run) => {
    pending.set(name, waitWithin(() => run(work), work).then(
      value => ({ name, value }),
      () => ({ name, value: null })
    ));
  };
  try {
    start("primary", primary);
    let launch = delay(staggerMs, { name: "launch" }, { signal: work }).catch(() => ({ name: "launch" }));
    while (pending.size || launch) {
      const next = await Promise.race([ ...pending.values(), ...(launch ? [launch] : []), ...(timer ? [timer] : []) ]);
      if (next.name === "grace") break;
      if (next.name === "launch") {
        launch = null;
        for (const [name, run] of Object.entries(alternates)) start(name, run);
        continue;
      }
      pending.delete(next.name);
      results.set(next.name, next.value);
      if (next.name === "primary" && hasCompleteVideo(next.value?.result)) {
        // Let an already running audio fallback supplement TikTok briefly.
        if (!pending.has("tiktok") || next.value.result.items.some(item => item.type === "音频")) break;
      }
      if (next.name === "primary" && launch) {
        launch = null;
        for (const [name, run] of Object.entries(alternates)) start(name, run);
      }
      const complete = hasCompleteVideo(next.value?.result || next.value);
      if (complete && !timer) {
        timer = delay(graceMs, { name: "grace" }, { signal: work }).catch(() => ({ name: "grace" }));
      }
      if (complete && !pending.has("primary") && !pending.has("tiktok")) break;
    }
    return combine(results);
  } finally {
    controller.abort();
  }
}

module.exports = { waitWithin, chooseFallback, hasCompleteVideo };
