/* ═══════════════════════════════════════════════════════════════ */
/* VAULTIFY — DIRECT RENDER API (No Cloudflare Worker)             */
/* ═══════════════════════════════════════════════════════════════ */

const RENDER_API = 'https://jiosaavn-api-rdna.onrender.com';

// No Cloudflare workers — direct connection
const CLOUDFLARE_WORKERS = [RENDER_API];

let activeWorkerIndex = 0;
let failedWorkers = new Set();

function getActiveWorker() {
  return RENDER_API;
}

async function proxyFetch(endpoint, options = {}) {
  const timeout = options.timeout || 30000;
  const url = RENDER_API + endpoint;
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
    const r = await fetch(`${RENDER_API}/`, { signal: ctrl.signal });
    clearTimeout(tm);
    return r.ok;
  } catch (e) {
    return false;
  }
}

window.RENDER_API = RENDER_API;
window.CLOUDFLARE_WORKERS = CLOUDFLARE_WORKERS;
window.getActiveWorker = getActiveWorker;
window.proxyFetch = proxyFetch;
window.checkWorkerHealth = checkWorkerHealth;
