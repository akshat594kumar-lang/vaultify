/* ═══════════════════════════════════════════════════════════════ */
/* VAULTIFY — PROXY CONFIGURATION                                  */
/* ═══════════════════════════════════════════════════════════════ */

const CLOUDFLARE_WORKERS = [
  "https://vaultify-2.akshat594kumar.workers.dev"
];

const FALLBACK_PROXIES = [];
const SOUNDCLOUD_CLIENT_ID = "a3e059563d7fd3372b49b37f00a00bcf";

function getActiveWorker() { return CLOUDFLARE_WORKERS[0]; }
function markWorkerFailed() {}

async function proxyFetch(endpoint, options = {}) {
  const timeout = options.timeout || 30000;
  const url = CLOUDFLARE_WORKERS[0] + endpoint;
  const ctrl = new AbortController();
  const tm = setTimeout(() => ctrl.abort(), timeout);
  try {
    const r = await fetch(url, { ...options, signal: ctrl.signal });
    clearTimeout(tm);
    return r;
  } catch (e) {
    clearTimeout(tm);
    throw e;
  }
}

async function checkWorkerHealth() {
  try {
    const ctrl = new AbortController();
    const tm = setTimeout(() => ctrl.abort(), 5000);
    const r = await fetch(`${CLOUDFLARE_WORKERS[0]}/ping`, { signal: ctrl.signal });
    clearTimeout(tm);
    if (r.ok) {
      const data = await r.json();
      return data.status === 'ok';
    }
  } catch (e) {}
  return false;
}

window.CLOUDFLARE_WORKERS = CLOUDFLARE_WORKERS;
window.getActiveWorker = getActiveWorker;
window.proxyFetch = proxyFetch;
window.checkWorkerHealth = checkWorkerHealth;
