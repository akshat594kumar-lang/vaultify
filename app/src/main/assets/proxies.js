/* ═══════════════════════════════════════════════════════════════ */
/* VAULTIFY — DIRECT JIOSAAVN (WebView intercepts CORS)            */
/* ═══════════════════════════════════════════════════════════════ */

const JIOSAAVN_BASE = 'https://www.jiosaavn.com/api.php';
const JIOSAAVN_CDN = 'https://aac.saavncdn.com';

async function proxyFetch(endpoint, options = {}) {
  const timeout = options.timeout || 20000;
  const url = endpoint.startsWith('http') ? endpoint : (JIOSAAVN_BASE + endpoint);
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
  // Direct API — always ready
  return true;
}

async function checkWorker() {
  return true;
}

window.JIOSAAVN_BASE = JIOSAAVN_BASE;
window.proxyFetch = proxyFetch;
window.checkWorkerHealth = checkWorkerHealth;
window.workerReady = true;