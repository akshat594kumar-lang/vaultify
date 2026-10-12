/* ═══════════════════════════════════════════════════════════════ */
/* VAULTIFY — PROXY CONFIGURATION                                  */
/* vaultify-2 worker — iTunes/YouTube search + JioSaavn stream     */
/* ═══════════════════════════════════════════════════════════════ */

const CLOUDFLARE_WORKERS = [
  "https://vaultify-2.akshat594kumar.workers.dev"
];

const FALLBACK_PROXIES = [];
const SOUNDCLOUD_CLIENT_ID = "a3e059563d7fd3372b49b37f00a00bcf";

let activeWorkerIndex = 0;
let failedWorkers = new Set();

function getActiveWorker() {
  if (failedWorkers.size >= CLOUDFLARE_WORKERS.length) failedWorkers.clear();
  for (let i = 0; i < CLOUDFLARE_WORKERS.length; i++) {
    const idx = (activeWorkerIndex + i) % CLOUDFLARE_WORKERS.length;
    const worker = CLOUDFLARE_WORKERS[idx];
    if (!failedWorkers.has(worker)) {
      activeWorkerIndex = idx;
      return worker;
    }
  }
  return CLOUDFLARE_WORKERS[0];
}

function markWorkerFailed(url) {
  if (url && CLOUDFLARE_WORKERS.includes(url)) {
    failedWorkers.add(url);
    activeWorkerIndex = (activeWorkerIndex + 1) % CLOUDFLARE_WORKERS.length;
  }
}

async function proxyFetch(endpoint, options = {}) {
  const timeout = options.timeout || 30000;
  const maxAttempts = CLOUDFLARE_WORKERS.length;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const worker = getActiveWorker();
    const url = worker + endpoint;
    try {
      const ctrl = new AbortController();
      const tm = setTimeout(() => ctrl.abort(), timeout);
      const r = await fetch(url, { ...options, signal: ctrl.signal });
      clearTimeout(tm);
      if (r.ok) {
        if (failedWorkers.has(worker)) failedWorkers.delete(worker);
        return r;
      }
      if (r.status === 429 || r.status >= 500) {
        markWorkerFailed(worker);
        continue;
      }
      return r;
    } catch (e) {
      markWorkerFailed(worker);
      continue;
    }
  }
  throw new Error('Worker unavailable');
}

async function checkWorkerHealth() {
  try {
    const worker = getActiveWorker();
    const ctrl = new AbortController();
    const tm = setTimeout(() => ctrl.abort(), 5000);
    const r = await fetch(`${worker}/ping`, { signal: ctrl.signal });
    clearTimeout(tm);
    if (r.ok) {
      const data = await r.json();
      return data.status === 'ok';
    }
  } catch (e) {
    markWorkerFailed(getActiveWorker());
  }
  return false;
}

window.CLOUDFLARE_WORKERS = CLOUDFLARE_WORKERS;
window.FALLBACK_PROXIES = FALLBACK_PROXIES;
window.SOUNDCLOUD_CLIENT_ID = SOUNDCLOUD_CLIENT_ID;
window.getActiveWorker = getActiveWorker;
window.markWorkerFailed = markWorkerFailed;
window.proxyFetch = proxyFetch;
window.checkWorkerHealth = checkWorkerHealth;
