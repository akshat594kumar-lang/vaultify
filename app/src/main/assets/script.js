
/* ═══════════════════════════════════════════════════════════════ */
/* VAULTIFY — FINAL (Saavn CDN playback + Playlist search)         */
/* ═══════════════════════════════════════════════════════════════ */

const MASTER_PLAYLIST_ID = 'PLWhIBP58b-Tr5kaNCUOYXuoNQLRaBDFeF';

const APP_VERSION = 2;
const CACHE_MAX_SIZE_MB = 500;
const CACHE_MAX_SONGS = 150;
const SC_CLIENT_ID = 'a3e059563d7fd3372b49b37f00a00bcf';
const SAAVN_DELTA = 'https://saavn-api-delta.vercel.app';
const PIPED_APIS = [
  'https://pipedapi.kavin.rocks',
  'https://pipedapi.adminforge.de',
  'https://api.piped.yt',
  'https://pipedapi.reallyaweso.me'
];
const INVIDIOUS_APIS = [
  'https://inv.nadeko.net',
  'https://invidious.nerdvpn.de',
  'https://yewtu.be'
];
const PLAYLIST_CACHE_KEY = 'vaultify_master_playlist_v2';
const PLAYLIST_CACHE_TTL = 6 * 60 * 60 * 1000;
const SAAVN_URL_CACHE_KEY = 'vaultify_saavn_url_cache_v1';
const SAAVN_URL_CACHE_TTL = 3 * 60 * 60 * 1000; // 3 hours (Saavn URLs expire)

let firebaseApp = null, firestoreDB = null, firebaseAuth = null, firebaseReady = false;
let workerReady = true;
let masterPlaylist = [];
let masterPlaylistLoaded = false;
let masterPlaylistLoading = false;
let saavnUrlCache = {}; // { "title|artist": { url, timestamp } }

try {
  if (typeof firebase !== 'undefined') {
    firebaseApp = firebase.initializeApp({
      apiKey: "AIzaSyCQgQoJpV9FGhd8yY2_nklQICQMpZ5-1RY",
      authDomain: "vaultify-18865.firebaseapp.com",
      projectId: "vaultify-18865",
      storageBucket: "vaultify-18865.firebasestorage.app",
      messagingSenderId: "961290318010",
      appId: "1:961290318010:web:efa1e8c95c8d09c533d283"
    });
    firestoreDB = firebase.firestore();
    firebaseAuth = firebase.auth();
    firebaseReady = true;
  }
} catch (e) {}

function isFirebaseReady() { return firebaseReady && firestoreDB && firebaseAuth; }

/* ═══════════ STATE ═══════════ */
let currentPlaylist = [];
let currentTrackIndex = 0;
let isPlayingAudio = false;
let isShuffle = false;
let isRepeat = false;
let appLanguage = localStorage.getItem('vaultify_app_lang') || 'en';
let currentLibraryTab = 'history';
let playlists = JSON.parse(localStorage.getItem('vaultify_playlists') || '[]');
let likedSongs = JSON.parse(localStorage.getItem('vaultify_liked') || '[]');
let searchHistoryList = JSON.parse(localStorage.getItem('vaultify_search_history') || '[]');
let playbackHistoryList = JSON.parse(localStorage.getItem('vaultify_playback_history') || '[]');
const trackBlobCache = new Map();
let isDraggingTimeline = false;
let autoMixFetching = false;
let lastAutoFetchTime = 0;
let _lastSaveTick = 0;
let cacheDB = null;
let audioContextNode = null;
let wakeLockSentinel = null;
let silentLoopStarted = false;
let eqNodes = null;
let eqSourceNode = null;
let mainAudio = null;
let silentLoop = null;
let currentSearchResults = [];
let currentHls = null;
let isLoginMode = false;
let loggedInUser = null;
let navigationHistory = ['home'];

/* ═══════════ HELPERS ═══════════ */
function showToast(msg) {
  const t = document.getElementById('toastPill');
  if (!t) return;
  t.innerText = msg;
  t.classList.add('show');
  clearTimeout(t._tt);
  t._tt = setTimeout(() => t.classList.remove('show'), 2500);
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, x => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[x]));
}

function formatClock(sec) {
  const s = Math.floor(sec || 0);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r < 10 ? '0' : ''}${r}`;
}

function openModal(id) { const el = document.getElementById(id); if (el) el.classList.add('open'); }
function closeModal(id) { const el = document.getElementById(id); if (el) el.classList.remove('open'); }
function openFullPlayer() { const el = document.getElementById('fullPlayerModal'); if (el) el.classList.add('open'); }
function closeFullPlayer() { const el = document.getElementById('fullPlayerModal'); if (el) el.classList.remove('open'); }
function openPartnerModal() { openModal('modalPartner'); }
function openSupportModal() { openModal('modalSupport'); }

function switchNavTab(tab, th = true) {
  document.querySelectorAll('.view-screen').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  const map = {
    home: { screen: 'tabHome', btn: 'tabBtnHome' },
    search: { screen: 'tabSearch', btn: 'tabBtnSearch' },
    library: { screen: 'tabLibrary', btn: 'tabBtnLibrary' },
    cert: { screen: 'tabCert', btn: 'tabBtnCert' },
    profile: { screen: 'tabProfile', btn: 'tabBtnProfile' }
  };
  const sel = map[tab] || map.home;
  const sEl = document.getElementById(sel.screen);
  const bEl = document.getElementById(sel.btn);
  if (sEl) sEl.classList.add('active');
  if (bEl) bEl.classList.add('active');
  if (th && navigationHistory[navigationHistory.length - 1] !== tab) navigationHistory.push(tab);
  if (tab === 'home') setTimeout(renderRecommendedSection, 300);
  if (tab === 'library') renderLibrary();
  if (tab === 'profile') checkPermissionsStatus();
  if (tab === 'cert') updateCertLiveDateTime();
}

function switchLibraryTab(tab, el) {
  currentLibraryTab = tab;
  document.querySelectorAll('#tabLibrary .nav-btn').forEach(p => p.classList.remove('active'));
  if (el) el.classList.add('active');
  renderLibrary();
}

function handleSystemBackPress() {
  const fp = document.getElementById('fullPlayerModal');
  if (fp && fp.classList.contains('open')) { closeFullPlayer(); return true; }
  const om = document.querySelector('.modal-overlay.open');
  if (om) { om.classList.remove('open'); return true; }
  const auth = document.getElementById('modalAuthGate');
  if (auth && auth.style.display === 'flex') return false;
  const other = document.querySelectorAll('.view-screen.active:not(#tabHome)');
  if (other.length > 0) { switchNavTab('home'); return true; }
  return false;
}
window.handleSystemBackPress = handleSystemBackPress;

/* ═══════════════════════════════════════════════════════════════ */
/* 🎯 SAAVN URL CACHE (fast instant playback)                      */
/* ═══════════════════════════════════════════════════════════════ */
function loadSaavnUrlCache() {
  try {
    const raw = localStorage.getItem(SAAVN_URL_CACHE_KEY);
    if (!raw) return;
    const cached = JSON.parse(raw);
    const now = Date.now();
    for (const k in cached) {
      if (cached[k] && (now - cached[k].timestamp) < SAAVN_URL_CACHE_TTL) {
        saavnUrlCache[k] = cached[k];
      }
    }
  } catch (e) {}
}

function saveSaavnUrlCache() {
  try {
    localStorage.setItem(SAAVN_URL_CACHE_KEY, JSON.stringify(saavnUrlCache));
  } catch (e) {}
}

function saavnCacheKey(title, artist) {
  return ((title || '') + '|' + (artist || '')).toLowerCase().trim().substring(0, 100);
}

function getCachedSaavnUrl(title, artist) {
  const key = saavnCacheKey(title, artist);
  const entry = saavnUrlCache[key];
  if (!entry) return null;
  if (Date.now() - entry.timestamp > SAAVN_URL_CACHE_TTL) return null;
  return entry.url;
}

function setCachedSaavnUrl(title, artist, url) {
  const key = saavnCacheKey(title, artist);
  saavnUrlCache[key] = { url, timestamp: Date.now() };
  saveSaavnUrlCache();
}

/* ═══════════════════════════════════════════════════════════════ */
/* 🎵 SAAVN SEARCH — find stream URL for a track                   */
/* ═══════════════════════════════════════════════════════════════ */
async function findSaavnStreamUrl(title, artist) {
  // 1. Check cache first (instant)
  const cached = getCachedSaavnUrl(title, artist);
  if (cached) return cached;

  // 2. Build smart query
  const cleanTitle = (title || '')
    .replace(/\(.*?\)/g, '')
    .replace(/\[.*?\]/g, '')
    .replace(/official|video|audio|lyrical|lyrics|song|full|hd|4k|music|feat|ft\.?/gi, '')
    .replace(/[^\w\s\u0900-\u097F\u0600-\u06FF\u0A00-\u0A7F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const cleanArtist = (artist || '')
    .replace(/vevo|official|topic|channel|records|music|entertainment|productions|studios|the|records?|label/gi, '')
    .replace(/[-_,]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const queries = [];
  if (cleanTitle) queries.push(cleanTitle);
  if (cleanTitle && cleanArtist) queries.push(cleanTitle + ' ' + cleanArtist);
  if (cleanArtist) queries.push(cleanArtist);

  for (const q of queries) {
    try {
      const url = `${SAAVN_DELTA}/api/search/songs?query=${encodeURIComponent(q)}&limit=5`;
      const ctrl = new AbortController();
      const tm = setTimeout(() => ctrl.abort(), 6000);
      const r = await fetch(url, { signal: ctrl.signal });
      clearTimeout(tm);
      if (!r.ok) continue;
      const data = await r.json();
      const arr = data.data?.results || data.results || [];
      if (!arr.length) continue;

      // Best match = first result (Saavn returns best match first)
      for (const s of arr) {
        if (!s.id) continue;
        const streamUrl = await getSaavnSongUrl(s.id);
        if (streamUrl) {
          setCachedSaavnUrl(title, artist, streamUrl);
          return streamUrl;
        }
      }
    } catch (e) { continue; }
  }

  return null;
}

async function getSaavnSongUrl(songId) {
  try {
    const url = `${SAAVN_DELTA}/api/songs/${songId}`;
    const ctrl = new AbortController();
    const tm = setTimeout(() => ctrl.abort(), 6000);
    const r = await fetch(url, { signal: ctrl.signal });
    clearTimeout(tm);
    if (!r.ok) return null;
    const data = await r.json();
    const song = data.data?.[0] || data.data;
    const downloads = song?.downloadUrl || [];
    if (!downloads.length) return null;

    // Prefer 320kbps, fall back to highest available
    const sorted = downloads.slice().sort((a, b) => (parseInt(b.quality) || 0) - (parseInt(a.quality) || 0));
    // Prefer m4a/128/320 over others
    const preferred = sorted.find(d => (d.quality || '').includes('320')) ||
                      sorted.find(d => (d.quality || '').includes('160')) ||
                      sorted[0];
    const u = preferred?.url || preferred?.link || sorted[0]?.url || sorted[0]?.link;
    return u || null;
  } catch (e) { return null; }
}

/* ═══════════════════════════════════════════════════════════════ */
/* 🎯 MASTER PLAYLIST                                              */
/* ═══════════════════════════════════════════════════════════════ */
function loadMasterPlaylistFromCache() {
  try {
    const raw = localStorage.getItem(PLAYLIST_CACHE_KEY);
    if (!raw) return false;
    const cached = JSON.parse(raw);
    if (!cached || !cached.tracks || !cached.tracks.length) return false;
    if (cached.playlistId !== MASTER_PLAYLIST_ID) return false;
    masterPlaylist = cached.tracks;
    masterPlaylistLoaded = true;
    return true;
  } catch (e) { return false; }
}

function saveMasterPlaylistToCache() {
  try {
    localStorage.setItem(PLAYLIST_CACHE_KEY, JSON.stringify({
      tracks: masterPlaylist,
      timestamp: Date.now(),
      playlistId: MASTER_PLAYLIST_ID
    }));
  } catch (e) {}
}

async function fetchMasterPlaylist(forceRefresh = false) {
  if (masterPlaylistLoading) {
    let wait = 0;
    while (masterPlaylistLoading && wait < 15000) {
      await new Promise(r => setTimeout(r, 300));
      wait += 300;
    }
    return masterPlaylist;
  }

  if (!forceRefresh && masterPlaylistLoaded && masterPlaylist.length > 0) return masterPlaylist;

  masterPlaylistLoading = true;

  for (const api of PIPED_APIS) {
    try {
      const ctrl = new AbortController();
      const tm = setTimeout(() => ctrl.abort(), 10000);
      const r = await fetch(`${api}/playlists/${MASTER_PLAYLIST_ID}`, { signal: ctrl.signal });
      clearTimeout(tm);
      if (!r.ok) continue;
      const data = await r.json();
      const items = data.relatedStreams || data.videos || [];
      if (!items.length) continue;
      const tracks = items
        .filter(v => v.url && v.url.includes('watch?v='))
        .map(v => {
          const vid = v.url.replace('/watch?v=', '').split('&')[0];
          return {
            id: 'yt_' + vid,
            title: v.title || 'Unknown',
            artist: v.uploaderName || v.uploader || 'YouTube',
            cover: v.thumbnail || `https://i.ytimg.com/vi/${vid}/mqdefault.jpg`,
            duration: v.duration || 0,
            source: 'youtube',
            _ytId: vid
          };
        });
      if (tracks.length > 0) {
        masterPlaylist = tracks;
        masterPlaylistLoaded = true;
        masterPlaylistLoading = false;
        saveMasterPlaylistToCache();
        return masterPlaylist;
      }
    } catch (e) { continue; }
  }

  for (const api of INVIDIOUS_APIS) {
    try {
      const ctrl = new AbortController();
      const tm = setTimeout(() => ctrl.abort(), 10000);
      const r = await fetch(`${api}/api/v1/playlists/${MASTER_PLAYLIST_ID}`, { signal: ctrl.signal });
      clearTimeout(tm);
      if (!r.ok) continue;
      const data = await r.json();
      const videos = data.videos || [];
      if (!videos.length) continue;
      const tracks = videos.map(v => ({
        id: 'yt_' + v.videoId,
        title: v.title || 'Unknown',
        artist: v.author || 'YouTube',
        cover: `https://i.ytimg.com/vi/${v.videoId}/mqdefault.jpg`,
        duration: v.lengthSeconds || 0,
        source: 'youtube',
        _ytId: v.videoId
      }));
      if (tracks.length > 0) {
        masterPlaylist = tracks;
        masterPlaylistLoaded = true;
        masterPlaylistLoading = false;
        saveMasterPlaylistToCache();
        return masterPlaylist;
      }
    } catch (e) { continue; }
  }

  masterPlaylistLoading = false;
  try {
    const raw = localStorage.getItem(PLAYLIST_CACHE_KEY);
    if (raw) {
      const cached = JSON.parse(raw);
      if (cached && cached.tracks && cached.tracks.length && cached.playlistId === MASTER_PLAYLIST_ID) {
        masterPlaylist = cached.tracks;
        masterPlaylistLoaded = true;
        return masterPlaylist;
      }
    }
  } catch (e) {}
  return [];
}

async function refreshMasterPlaylistInBackground() {
  try {
    const raw = localStorage.getItem(PLAYLIST_CACHE_KEY);
    if (!raw) { fetchMasterPlaylist(true); return; }
    const cached = JSON.parse(raw);
    if (!cached || !cached.timestamp) { fetchMasterPlaylist(true); return; }
    if (cached.playlistId !== MASTER_PLAYLIST_ID) { fetchMasterPlaylist(true); return; }
    const age = Date.now() - cached.timestamp;
    if (age < PLAYLIST_CACHE_TTL) return;
    await fetchMasterPlaylist(true);
  } catch (e) {}
}

async function manualRefreshPlaylist() {
  showToast('🔄 Refreshing playlist...');
  try {
    const fresh = await fetchMasterPlaylist(true);
    if (fresh && fresh.length > 0) {
      showToast(`✅ ${fresh.length} songs loaded`);
      renderRecommendedSection();
    } else {
      showToast('❌ Refresh failed');
    }
  } catch (e) {
    showToast('❌ Refresh failed');
  }
}

/* ═══════════ Search within Master Playlist ═══════════ */
function searchInMasterPlaylist(query) {
  if (!query || !masterPlaylist.length) return [];
  const q = query.toLowerCase().trim();
  const tokens = q.split(/\s+/).filter(t => t.length > 0);

  return masterPlaylist
    .map(t => {
      const haystack = ((t.title || '') + ' ' + (t.artist || '')).toLowerCase();
      let score = 0;
      tokens.forEach(tok => {
        if (haystack.includes(tok)) score++;
        if ((t.title || '').toLowerCase().startsWith(tok)) score += 2;
      });
      return { t, score };
    })
    .filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .map(x => x.t);
}

/* ═══════════ API Search ═══════════ */
async function checkWorker() { workerReady = true; return true; }

async function workerSearch(query, limit = 25) {
  if (!masterPlaylistLoaded) await fetchMasterPlaylist();
  const inPlaylist = searchInMasterPlaylist(query);
  if (inPlaylist.length > 0) return inPlaylist.slice(0, limit);
  return masterPlaylist.slice().sort(() => Math.random() - 0.5).slice(0, Math.min(limit, masterPlaylist.length));
}

/* ═══════════ Fallback: YT stream via Piped/Invidious/Cobalt ═══════════ */
async function workerStreamUrl(id) {
  if (id.startsWith('saavn_')) {
    return await getSaavnSongUrl(id.replace('saavn_', ''));
  }

  if (id.startsWith('yt_')) {
    const ytId = id.replace('yt_', '');

    // Piped
    for (const api of PIPED_APIS) {
      try {
        const ctrl = new AbortController();
        const tm = setTimeout(() => ctrl.abort(), 8000);
        const r = await fetch(`${api}/streams/${ytId}`, { signal: ctrl.signal });
        clearTimeout(tm);
        if (!r.ok) continue;
        const data = await r.json();
        const streams = (data.audioStreams || []).filter(s => s.url || s.proxyUrl);
        if (!streams.length) continue;
        streams.sort((a, b) => {
          const aM4a = (a.mimeType || '').includes('mp4') ? 1 : 0;
          const bM4a = (b.mimeType || '').includes('mp4') ? 1 : 0;
          if (aM4a !== bM4a) return bM4a - aM4a;
          return (b.bitrate || 0) - (a.bitrate || 0);
        });
        const s = streams[0];
        if (s.proxyUrl) {
          let pUrl = s.proxyUrl;
          if (pUrl.startsWith('/')) pUrl = api + pUrl;
          return pUrl;
        }
        if (s.url && s.url.startsWith('http')) return s.url;
      } catch (e) { continue; }
    }

    // Invidious
    for (const api of INVIDIOUS_APIS) {
      try {
        const ctrl = new AbortController();
        const tm = setTimeout(() => ctrl.abort(), 8000);
        const r = await fetch(`${api}/api/v1/videos/${ytId}`, { signal: ctrl.signal });
        clearTimeout(tm);
        if (!r.ok) continue;
        const data = await r.json();
        const formats = (data.adaptiveFormats || []).filter(f => (f.type || '').includes('audio') && f.url);
        if (!formats.length) continue;
        formats.sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0));
        if (formats[0].url) return formats[0].url;
      } catch (e) { continue; }
    }

    // Cobalt
    const cobaltUrl = await fetchCobaltAudio(ytId);
    if (cobaltUrl) return cobaltUrl;
  }

  return null;
}

async function fetchCobaltAudio(videoId) {
  const COBALT = [
    'https://api.cobalt.tools',
    'https://co.wuk.sh',
    'https://cobalt-api.kwiatekmiki.com'
  ];
  const ytUrl = `https://www.youtube.com/watch?v=${videoId}`;
  for (const api of COBALT) {
    try {
      const ctrl = new AbortController();
      const tm = setTimeout(() => ctrl.abort(), 8000);
      const r = await fetch(`${api}/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({ url: ytUrl, downloadMode: 'audio', audioFormat: 'mp3', audioBitrate: '128' }),
        signal: ctrl.signal
      });
      clearTimeout(tm);
      if (!r.ok) continue;
      const data = await r.json();
      if (data.url) return data.url;
      if (data.status === 'redirect' && data.url) return data.url;
      if (data.status === 'tunnel' && data.url) return data.url;
    } catch (e) { continue; }
  }
  return null;
}

/* ═══════════ AUTH ═══════════ */
const AUTH_ITERATIONS = 100000, AUTH_SALT_BYTES = 16, AUTH_KEY_BYTES = 32;

function bytesToHex(bytes) { return Array.from(new Uint8Array(bytes)).map(b => b.toString(16).padStart(2, '0')).join(''); }
function hexToBytes(hex) { const a = new Uint8Array(hex.length / 2); for (let i = 0; i < hex.length; i += 2) a[i / 2] = parseInt(hex.substr(i, 2), 16); return a; }
function generateSalt() { const s = new Uint8Array(AUTH_SALT_BYTES); crypto.getRandomValues(s); return bytesToHex(s); }

async function derivePasswordHash(password, saltHex) {
  try {
    const enc = new TextEncoder();
    const bk = await crypto.subtle.importKey('raw', enc.encode(password), { name: 'PBKDF2' }, false, ['deriveBits']);
    const salt = hexToBytes(saltHex);
    const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: AUTH_ITERATIONS, hash: 'SHA-256' }, bk, AUTH_KEY_BYTES * 8);
    return bytesToHex(bits);
  } catch (e) { let h = password + '|' + saltHex; for (let i = 0; i < 50000; i++) h = btoa(h + password); return h; }
}

function getUserDB() { try { return JSON.parse(localStorage.getItem('vaultify_user_db') || '{}'); } catch (e) { return {}; } }
function saveUserDB(db) { localStorage.setItem('vaultify_user_db', JSON.stringify(db)); }
function findUserByEmail(email) { const db = getUserDB(); const el = String(email || '').trim().toLowerCase(); if (!el) return null; for (const key in db) { if (db[key] && db[key].email && String(db[key].email).toLowerCase() === el) return { key, user: db[key] }; } return null; }
function findUserByUsername(username) { const db = getUserDB(); const ul = String(username || '').trim().toLowerCase(); if (!ul) return null; if (db[ul]) return { key: ul, user: db[ul] }; return null; }
function validateUsername(u) { if (!u || u.length < 3) return { ok: false, msg: 'Username min 3 chars' }; if (u.length > 20) return { ok: false, msg: 'Max 20 chars' }; if (!/^[a-z0-9_]+$/.test(u)) return { ok: false, msg: 'Only a-z, 0-9, _ allowed' }; return { ok: true }; }
function validateEmail(e) { if (!e || !e.trim()) return { ok: false, msg: 'Email required' }; if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) return { ok: false, msg: 'Invalid email' }; return { ok: true }; }
function validatePassword(p) { if (!p || p.length < 8) return { ok: false, msg: 'Min 8 chars' }; if (!/[A-Za-z]/.test(p)) return { ok: false, msg: 'Include letter' }; if (!/[0-9]/.test(p)) return { ok: false, msg: 'Include number' }; return { ok: true }; }

function showAuthError(msg) { const er = document.getElementById('authErrorAlert'); const ok = document.getElementById('authSuccessAlert'); if (ok) ok.style.display = 'none'; if (er) { er.innerText = msg; er.style.display = 'block'; } }
function showAuthSuccess(msg) { const er = document.getElementById('authErrorAlert'); const ok = document.getElementById('authSuccessAlert'); if (er) er.style.display = 'none'; if (ok) { ok.innerText = msg; ok.style.display = 'block'; } }
function hideAuthAlerts() { const er = document.getElementById('authErrorAlert'); const ok = document.getElementById('authSuccessAlert'); if (er) er.style.display = 'none'; if (ok) ok.style.display = 'none'; }

function toggleAuthMode() {
  isLoginMode = !isLoginMode;
  const btn = document.getElementById('authSubmitBtn');
  const toggle = document.getElementById('authModeToggleText');
  const nameInput = document.getElementById('authDisplayNameInput');
  if (btn) btn.innerText = isLoginMode ? 'Log In' : 'Create Account';
  if (toggle) toggle.innerText = isLoginMode ? "Don't have account? Sign up" : 'Already registered? Log in';
  if (nameInput) nameInput.style.display = isLoginMode ? 'none' : 'block';
  hideAuthAlerts();
}

function verifyAuthGate() {
  const s = localStorage.getItem('vaultify_active_user');
  const authModal = document.getElementById('modalAuthGate');
  const mainFrame = document.querySelector('.mobile-frame');
  if (!authModal) return;

  const applyModalStyle = () => {
    authModal.style.position = 'fixed';
    authModal.style.inset = '0';
    authModal.style.width = '100vw';
    authModal.style.height = '100vh';
    authModal.style.zIndex = '99999';
    authModal.style.background = 'rgba(0,0,0,0.94)';
    authModal.style.backdropFilter = 'blur(8px)';
    authModal.style.webkitBackdropFilter = 'blur(8px)';
    authModal.style.alignItems = 'center';
    authModal.style.justifyContent = 'center';
    authModal.style.padding = '16px';
    authModal.style.overflowY = 'auto';
    authModal.style.display = 'flex';
  };

  if (!s) {
    document.body.classList.add('auth-locked');
    if (mainFrame) mainFrame.style.pointerEvents = 'none';
    authModal.classList.add('open');
    applyModalStyle();
  } else {
    try {
      loggedInUser = JSON.parse(s);
      applyUserDataUI(loggedInUser);
      document.body.classList.remove('auth-locked');
      if (mainFrame) mainFrame.style.pointerEvents = '';
      authModal.classList.remove('open');
      authModal.style.display = 'none';
    } catch (e) {
      document.body.classList.add('auth-locked');
      authModal.classList.add('open');
      applyModalStyle();
    }
  }
}

function unlockApp() {
  const authModal = document.getElementById('modalAuthGate');
  const mainFrame = document.querySelector('.mobile-frame');
  const intro = document.getElementById('appIntroScreen');
  if (authModal) { authModal.classList.remove('open'); authModal.style.display = 'none'; }
  if (intro) { intro.style.display = 'none'; intro.style.visibility = 'hidden'; }
  document.body.classList.remove('auth-locked');
  if (mainFrame) mainFrame.style.pointerEvents = '';
}

async function processAuthSubmission() {
  hideAuthAlerts();
  const u = String(document.getElementById('authUsernameInput').value || '').trim().toLowerCase();
  const e = String(document.getElementById('authEmailInput').value || '').trim().toLowerCase();
  const p = document.getElementById('authPasswordInput').value || '';
  const dName = document.getElementById('authDisplayNameInput').value.trim();
  const vu = validateUsername(u); if (!vu.ok) return showAuthError(vu.msg);
  const ve = validateEmail(e); if (!ve.ok) return showAuthError(ve.msg);
  if (!isLoginMode) { const vp = validatePassword(p); if (!vp.ok) return showAuthError(vp.msg); }
  else { if (!p) return showAuthError('Password required'); }
  const submitBtn = document.getElementById('authSubmitBtn');
  const originalText = submitBtn.innerText;
  submitBtn.innerText = 'Please wait...'; submitBtn.disabled = true;
  try {
    if (isLoginMode) {
      let found = findUserByUsername(u);
      if (!found && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(u)) found = findUserByEmail(u);
      if (!found) { showAuthError("❌ Account doesn't exist"); return; }
      const user = found.user;
      if (String(user.email || '').toLowerCase() !== e) { showAuthError('❌ Email mismatch'); return; }
      const derived = await derivePasswordHash(p, user.salt || '');
      if (derived !== user.passwordHash) { showAuthError('❌ Invalid password'); return; }
      user.lastLogin = Date.now();
      const db = getUserDB(); db[found.key] = user; saveUserDB(db);
      loggedInUser = user; localStorage.setItem('vaultify_active_user', JSON.stringify(loggedInUser));
      showAuthSuccess('✅ Login successful!');
      setTimeout(() => { unlockApp(); applyUserDataUI(loggedInUser); showToast(`Welcome back, ${loggedInUser.displayName || loggedInUser.username}!`); hideAuthAlerts(); }, 500);
    } else {
      if (findUserByUsername(u)) { showAuthError('❌ Username taken'); return; }
      if (findUserByEmail(e)) { showAuthError('❌ Email registered'); return; }
      const salt = generateSalt();
      const passwordHash = await derivePasswordHash(p, salt);
      const partnerCode = generatePartnerCode(u);
      const newUser = { username: u, email: e, displayName: dName || u, bio: '', passwordHash, salt, avatar: '', partnerCode, createdAt: Date.now(), lastLogin: Date.now() };
      const db = getUserDB(); db[u] = newUser; saveUserDB(db);
      loggedInUser = newUser; localStorage.setItem('vaultify_active_user', JSON.stringify(loggedInUser));
      showAuthSuccess('✅ Account created!');
      setTimeout(() => { unlockApp(); applyUserDataUI(loggedInUser); showToast(`Welcome, ${loggedInUser.displayName}!`); hideAuthAlerts(); }, 600);
    }
  } catch (err) { showAuthError('⚠️ Something went wrong'); }
  finally { submitBtn.innerText = originalText; submitBtn.disabled = false; }
}

function applyUserDataUI(user) {
  if (!user) return;
  const editName = document.getElementById('editDisplayName');
  const editBio = document.getElementById('editBio');
  const avatar = document.getElementById('userAvatarImg');
  if (editName) editName.value = user.displayName || user.username;
  if (editBio) editBio.value = user.bio || '';
  if (avatar && user.avatar) avatar.src = user.avatar;
  if (typeof syncUserPartnerCode === 'function') syncUserPartnerCode();
}

function openForgotPasswordFlow() { closeModal('modalAuthGate'); openModal('modalForgotPass'); }

async function executePasswordReset() {
  const u = document.getElementById('fpUsername').value.trim().toLowerCase();
  const e = document.getElementById('fpEmail').value.trim().toLowerCase();
  const p = document.getElementById('fpNewPassword').value;
  const vu = validateUsername(u); if (!vu.ok) return showToast(vu.msg);
  const ve = validateEmail(e); if (!ve.ok) return showToast(ve.msg);
  const vp = validatePassword(p); if (!vp.ok) return showToast(vp.msg);
  const found = findUserByUsername(u);
  if (!found) return showToast("❌ Account doesn't exist");
  if (String(found.user.email || '').toLowerCase() !== e) return showToast('❌ Email mismatch');
  const newSalt = generateSalt();
  const newHash = await derivePasswordHash(p, newSalt);
  const db = getUserDB(); db[found.key].passwordHash = newHash; db[found.key].salt = newSalt; saveUserDB(db);
  closeModal('modalForgotPass'); openModal('modalAuthGate'); showToast('✅ Password updated!');
}

function triggerDpPicker() { const picker = document.getElementById('avatarPicker'); if (picker) picker.click(); }

function handleDpUpload(e) {
  const f = e.target.files[0];
  if (!f) return;
  if (f.size > 3 * 1024 * 1024) { showToast('Max 3MB'); return; }
  if (!f.type.startsWith('image/')) { showToast('Image only'); return; }
  const r = new FileReader();
  r.onload = ev => {
    const b = ev.target.result;
    document.getElementById('userAvatarImg').src = b;
    if (loggedInUser) {
      loggedInUser.avatar = b;
      const db = getUserDB();
      if (db[loggedInUser.username]) { db[loggedInUser.username].avatar = b; saveUserDB(db); }
      localStorage.setItem('vaultify_active_user', JSON.stringify(loggedInUser));
    }
    showToast('✅ DP Updated!');
  };
  r.readAsDataURL(f);
  e.target.value = '';
}

function saveProfileData() {
  if (!loggedInUser) return;
  const n = document.getElementById('editDisplayName').value.trim();
  if (!n) return showToast('Name required');
  const bio = (document.getElementById('editBio')?.value || '').trim();
  loggedInUser.displayName = n; loggedInUser.bio = bio;
  const db = getUserDB();
  if (db[loggedInUser.username]) { db[loggedInUser.username].displayName = n; db[loggedInUser.username].bio = bio; saveUserDB(db); }
  localStorage.setItem('vaultify_active_user', JSON.stringify(loggedInUser));
  applyUserDataUI(loggedInUser); showToast('Profile updated!');
}

function performAppLogout() { if (!confirm('Log out from this device?')) return; localStorage.removeItem('vaultify_active_user'); location.reload(); }

function generatePartnerCode(username) {
  if (!username) return 'VAULT-XXXXXX';
  let hash = 0;
  const seed = username + '_vaultify_2026';
  for (let i = 0; i < seed.length; i++) { hash = ((hash << 5) - hash) + seed.charCodeAt(i); hash = hash & hash; }
  const code = Math.abs(hash).toString(36).toUpperCase().padStart(6, '0').slice(0, 6);
  return 'VAULT-' + code;
}

function syncUserPartnerCode() {
  if (!loggedInUser) return;
  const db = getUserDB();
  const user = db[loggedInUser.username];
  if (!user) return;
  if (!user.partnerCode) { user.partnerCode = generatePartnerCode(loggedInUser.username); db[loggedInUser.username] = user; saveUserDB(db); }
  loggedInUser.partnerCode = user.partnerCode;
  localStorage.setItem('vaultify_active_user', JSON.stringify(loggedInUser));
}

function changeAppLanguage(lang) { appLanguage = lang; localStorage.setItem('vaultify_app_lang', lang); showToast(lang === 'hi' ? 'हिंदी चुनी गई' : 'English Selected'); }

/* ═══════════ CACHE (IndexedDB for offline) ═══════════ */
function initCacheDB() {
  return new Promise(resolve => {
    try {
      const req = indexedDB.open('vaultify_cache', 3);
      req.onupgradeneeded = e => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains('songs')) {
          const store = db.createObjectStore('songs', { keyPath: 'id' });
          store.createIndex('cachedAt', 'cachedAt', { unique: false });
          store.createIndex('lastAccess', 'lastAccess', { unique: false });
        }
      };
      req.onsuccess = e => { cacheDB = e.target.result; resolve(cacheDB); };
      req.onerror = () => resolve(null);
    } catch (e) { resolve(null); }
  });
}

function cacheGet(id) {
  return new Promise(resolve => {
    if (!cacheDB) return resolve(null);
    try {
      const tx = cacheDB.transaction('songs', 'readwrite');
      const store = tx.objectStore('songs');
      const rq = store.get(id);
      rq.onsuccess = () => {
        const x = rq.result;
        if (!x) return resolve(null);
        try {
          if (x.blob instanceof Blob) x.url = URL.createObjectURL(x.blob);
          x.lastAccess = Date.now();
          store.put(x);
        } catch (e) {}
        resolve(x);
      };
      rq.onerror = () => resolve(null);
    } catch (e) { resolve(null); }
  });
}

function cachePut(id, blob, meta) {
  return new Promise(async resolve => {
    if (!cacheDB) return resolve(false);
    try {
      await cacheEnforceLimit();
      const tx = cacheDB.transaction('songs', 'readwrite');
      tx.objectStore('songs').put({
        id, blob,
        title: meta.title, artist: meta.artist, cover: meta.cover, source: meta.source,
        size: blob.size, cachedAt: Date.now(), lastAccess: Date.now()
      });
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
    } catch (e) { resolve(false); }
  });
}

function cacheDelete(id) {
  return new Promise(resolve => {
    if (!cacheDB) return resolve(false);
    try {
      const tx = cacheDB.transaction('songs', 'readwrite');
      tx.objectStore('songs').delete(id);
      tx.oncomplete = () => resolve(true);
    } catch (e) { resolve(false); }
  });
}

function cacheAll() {
  return new Promise(resolve => {
    if (!cacheDB) return resolve([]);
    try {
      const rq = cacheDB.transaction('songs', 'readonly').objectStore('songs').getAll();
      rq.onsuccess = () => resolve(rq.result || []);
      rq.onerror = () => resolve([]);
    } catch (e) { resolve([]); }
  });
}

async function cacheEnforceLimit() {
  try {
    const all = await cacheAll();
    let totalSize = 0;
    all.forEach(t => { if (t.size) totalSize += t.size; });
    const totalMB = totalSize / (1024 * 1024);
    if (totalMB < CACHE_MAX_SIZE_MB && all.length < CACHE_MAX_SONGS) return;
    all.sort((a, b) => (a.lastAccess || a.cachedAt || 0) - (b.lastAccess || b.cachedAt || 0));
    const toDelete = Math.ceil(all.length * 0.2);
    for (let i = 0; i < toDelete; i++) { if (all[i]) await cacheDelete(all[i].id); }
  } catch (e) {}
}

/* ═══════════ AUDIO ═══════════ */
function initForegroundAudioBridge() {
  try {
    if (!audioContextNode) audioContextNode = new (window.AudioContext || window.webkitAudioContext)();
    if (audioContextNode.state === 'suspended') audioContextNode.resume();
    if (!audioContextNode._oscStarted) {
      const osc = audioContextNode.createOscillator();
      const gain = audioContextNode.createGain();
      osc.frequency.value = 30;
      gain.gain.value = 0.0001;
      osc.connect(gain);
      gain.connect(audioContextNode.destination);
      osc.start();
      audioContextNode._oscStarted = true;
    }
    if (!eqNodes) initEqChain();
  } catch (e) {}
}

function initEqChain() {
  try {
    if (!audioContextNode) audioContextNode = new (window.AudioContext || window.webkitAudioContext)();
    if (eqNodes || !mainAudio) return;
    const freqs = [60, 230, 910, 4000, 14000];
    const filters = freqs.map(f => {
      const b = audioContextNode.createBiquadFilter();
      b.type = 'peaking';
      b.frequency.value = f;
      b.Q.value = 1;
      b.gain.value = 0;
      return b;
    });
    for (let i = 0; i < filters.length - 1; i++) filters[i].connect(filters[i + 1]);
    const masterGain = audioContextNode.createGain();
    masterGain.gain.value = 1;
    filters[filters.length - 1].connect(masterGain);
    masterGain.connect(audioContextNode.destination);
    eqNodes = { filters, masterGain };
    try {
      eqSourceNode = audioContextNode.createMediaElementSource(mainAudio);
      eqSourceNode.connect(filters[0]);
    } catch (e) { eqSourceNode = null; }
  } catch (e) {}
}

function applyEqNow() {
  try {
    if (!audioContextNode) initForegroundAudioBridge();
    if (!eqNodes) initEqChain();
    if (!eqNodes) return showToast('EQ not ready');
    const ids = ['eq60', 'eq230', 'eq910', 'eq4k', 'eq14k'];
    ids.forEach((id, i) => { const el = document.getElementById(id); if (el && eqNodes.filters[i]) eqNodes.filters[i].gain.value = parseFloat(el.value) || 0; });
    saveEqToStorage(); showToast('✅ EQ applied'); closeModal('modalEqualizer');
  } catch (e) {}
}

function resetEqSliders() {
  ['eq60', 'eq230', 'eq910', 'eq4k', 'eq14k'].forEach(id => { const el = document.getElementById(id); if (el) el.value = 0; });
  if (eqNodes) eqNodes.filters.forEach(f => f.gain.value = 0);
  saveEqToStorage(); showToast('EQ Reset');
}

function loadEqFromStorage() {
  try {
    const saved = JSON.parse(localStorage.getItem('vaultify_eq') || 'null');
    if (!saved) return;
    const ids = ['eq60', 'eq230', 'eq910', 'eq4k', 'eq14k'];
    ids.forEach((id, i) => { const el = document.getElementById(id); if (el) el.value = saved[i] || 0; });
  } catch (e) {}
}

function saveEqToStorage() {
  try {
    const ids = ['eq60', 'eq230', 'eq910', 'eq4k', 'eq14k'];
    const vals = ids.map(id => { const el = document.getElementById(id); return el ? parseFloat(el.value) || 0 : 0; });
    localStorage.setItem('vaultify_eq', JSON.stringify(vals));
  } catch (e) {}
}

async function requestHardwareWakeLock() {
  try {
    if ('wakeLock' in navigator && (!wakeLockSentinel || wakeLockSentinel.released)) {
      wakeLockSentinel = await navigator.wakeLock.request('screen');
      wakeLockSentinel.addEventListener('release', () => { wakeLockSentinel = null; });
    }
  } catch (e) {}
}

function setupMediaSession() {
  if (!mainAudio) return;
  if ('mediaSession' in navigator) {
    try {
      navigator.mediaSession.setActionHandler('play', () => onNativePlay());
      navigator.mediaSession.setActionHandler('pause', () => onNativePause());
      navigator.mediaSession.setActionHandler('previoustrack', () => onNativePrev());
      navigator.mediaSession.setActionHandler('nexttrack', () => onNativeNext());
      navigator.mediaSession.setActionHandler('seekto', d => { if (d.seekTime !== undefined) seekAudioTo(d.seekTime); });
    } catch (e) {}
  }

  mainAudio.addEventListener('error', () => {
    // Silent auto-recover: try next song
    setVisualState(false);
    setTimeout(() => { if (currentPlaylist.length > 1) playNext(); }, 500);
  });

  mainAudio.addEventListener('timeupdate', () => {
    if (!mainAudio.duration || isDraggingTimeline) return;
    const pos = mainAudio.currentTime, dur = mainAudio.duration;
    const c = document.getElementById('labelCurrentTime');
    const d = document.getElementById('labelTotalDuration');
    const f = document.getElementById('capsuleFill');
    const mf = document.getElementById('miniProgressFill');
    if (c) c.innerText = formatClock(pos);
    if (d) d.innerText = formatClock(dur);
    if (f) f.style.width = ((pos / dur) * 100) + '%';
    if (mf) mf.style.width = ((pos / dur) * 100) + '%';
    if (window.AndroidNativeBridge && window.AndroidNativeBridge.updateProgress) {
      try { window.AndroidNativeBridge.updateProgress(Math.floor(pos * 1000), Math.floor(dur * 1000)); } catch (e) {}
    }
  });

  mainAudio.addEventListener('loadedmetadata', () => {
    const d = document.getElementById('labelTotalDuration');
    if (d) d.innerText = formatClock(mainAudio.duration);
  });

  mainAudio.addEventListener('ended', () => {
    setVisualState(false);
    if (currentPlaylist.length > 1) playNext();
  });
}

window.onNativePlay = function () { if (mainAudio && mainAudio.paused) mainAudio.play().catch(() => {}); setVisualState(true); };
window.onNativePause = function () { if (mainAudio) mainAudio.pause(); setVisualState(false); };
window.onNativeNext = function () { playNext(); };
window.onNativePrev = function () { playPrevious(); };
window.handleNativeMediaAction = function (action) {
  switch (action) {
    case 'PLAY': onNativePlay(); break;
    case 'PAUSE': onNativePause(); break;
    case 'NEXT': onNativeNext(); break;
    case 'PREV': onNativePrev(); break;
  }
};
window.handleNativeSeek = function (ms) { seekAudioTo(ms / 1000); };
window.onNativePermissionResult = function () { checkPermissionsStatus(); };

function updateMediaSessionMetadata(track) {
  if (!track) return;
  if ('mediaSession' in navigator) {
    try {
      const cover = track.cover || 'vaultify.png';
      navigator.mediaSession.metadata = new MediaMetadata({
        title: track.title || 'Unknown',
        artist: track.artist || 'Unknown',
        album: 'Vaultify',
        artwork: [{ src: cover, sizes: '96x96', type: 'image/jpeg' }, { src: cover, sizes: '256x256', type: 'image/jpeg' }, { src: cover, sizes: '512x512', type: 'image/jpeg' }]
      });
      navigator.mediaSession.playbackState = isPlayingAudio ? 'playing' : 'paused';
    } catch (e) {}
  }
  if (window.AndroidNativeBridge && window.AndroidNativeBridge.updateNotification) {
    try { window.AndroidNativeBridge.updateNotification(track.title || 'Vaultify', track.artist || '', track.cover || '', isPlayingAudio); } catch (e) {}
  }
}

function setupTimelineDraggableEngine() {
  const bar = document.getElementById('capsuleProgressBar');
  if (!bar || !mainAudio) return;
  const getDur = () => mainAudio.duration || 0;
  const updUI = p => {
    const f = document.getElementById('capsuleFill');
    if (f) f.style.width = (p * 100) + '%';
    const c = document.getElementById('labelCurrentTime');
    if (c) c.innerText = formatClock(p * getDur());
  };
  const getPct = x => {
    const r = bar.getBoundingClientRect();
    return Math.max(0, Math.min(1, (x - r.left) / r.width));
  };
  const doSeek = p => { const d = getDur(); if (d > 0) mainAudio.currentTime = p * d; };
  bar.addEventListener('pointerdown', e => { isDraggingTimeline = true; try { bar.setPointerCapture(e.pointerId); } catch (err) {} updUI(getPct(e.clientX)); });
  bar.addEventListener('pointermove', e => { if (isDraggingTimeline) updUI(getPct(e.clientX)); });
  bar.addEventListener('pointerup', e => { if (!isDraggingTimeline) return; isDraggingTimeline = false; doSeek(getPct(e.clientX)); });
  bar.addEventListener('click', e => { if (!isDraggingTimeline) doSeek(getPct(e.clientX)); });
}

function seekAudioTo(s) { if (mainAudio && mainAudio.duration) mainAudio.currentTime = s; }

/* ═══════════ QUEUE ═══════════ */
function saveQueueToStorage() {
  try {
    localStorage.setItem('vaultify_queue', JSON.stringify({
      tracks: currentPlaylist.slice(0, 100),
      index: currentTrackIndex,
      timestamp: Date.now()
    }));
  } catch (e) {}
}

function loadQueueFromStorage() {
  try {
    const saved = localStorage.getItem('vaultify_queue');
    if (!saved) return false;
    const queueData = JSON.parse(saved);
    if (!queueData.tracks || !queueData.tracks.length) return false;
    if (Date.now() - queueData.timestamp > 2 * 60 * 60 * 1000) { localStorage.removeItem('vaultify_queue'); return false; }
    currentPlaylist = queueData.tracks;
    currentTrackIndex = Math.min(queueData.index || 0, currentPlaylist.length - 1);
    renderHomeQueue();
    if (currentPlaylist[currentTrackIndex]) syncPlayerUI(currentPlaylist[currentTrackIndex]);
    return true;
  } catch (e) { return false; }
}

/* ═══════════ SEARCH ═══════════ */
async function searchAll(q) { return await workerSearch(q, 25); }

async function fetchTrendingSongs(limit = 10) {
  if (!masterPlaylistLoaded) await fetchMasterPlaylist();
  return masterPlaylist.slice(0, limit);
}

/* ═══════════════════════════════════════════════════════════════ */
/* 🎯 PLAY TRACK — Saavn CDN primary (instant, JioSaavn-style)     */
/* ═══════════════════════════════════════════════════════════════ */
async function playTrack(index, broadcast = true) {
  if (index < 0 || index >= currentPlaylist.length) return;
  currentTrackIndex = index;
  const track = currentPlaylist[index];
  if (!track) return;

  syncPlayerUI(track);
  updateMediaSessionMetadata(track);
  logPlaybackHistory(track);
  renderHomeRecentVault();

  setTimeout(() => initForegroundAudioBridge(), 0);
  setTimeout(() => requestHardwareWakeLock(), 0);
  if (!silentLoopStarted && silentLoop) { silentLoop.play().catch(() => {}); silentLoopStarted = true; }
  setTimeout(() => autoExtendQueue(track), 2000);

  if (currentHls) { try { currentHls.destroy(); } catch (e) {} currentHls = null; }

  const tryPlay = async (url) => {
    if (!url) return false;
    if (url.includes('.m3u8') && window.Hls && Hls.isSupported()) {
      try {
        currentHls = new Hls({ enableWorker: true, lowLatencyMode: false });
        currentHls.loadSource(url);
        currentHls.attachMedia(mainAudio);
        currentHls.on(Hls.Events.MANIFEST_PARSED, () => { mainAudio.play().then(() => setVisualState(true)).catch(() => {}); });
        return true;
      } catch (e) { return false; }
    }
    mainAudio.src = url;
    mainAudio.load();
    try { await mainAudio.play(); setVisualState(true); return true; } catch (e) { return false; }
  };

  // ═══ 1. Cached blob (instant) ═══
  const cached = trackBlobCache.get(track.id);
  if (cached && cached.startsWith('blob:')) {
    if (await tryPlay(cached)) return;
  }

  // ═══ 2. IndexedDB cached ═══
  const db = await cacheGet(track.id);
  if (db && db.url) {
    trackBlobCache.set(track.id, db.url);
    if (await tryPlay(db.url)) return;
  }

  // ═══ 3. SAAVN CDN PRIMARY (fast + reliable) ═══
  try {
    const saavnUrl = await findSaavnStreamUrl(track.title, track.artist);
    if (saavnUrl && await tryPlay(saavnUrl)) return;
  } catch (e) {}

  // ═══ 4. YouTube fallback (if track is YT) ═══
  if (track.id.startsWith('yt_')) {
    const ytUrl = await workerStreamUrl(track.id);
    if (ytUrl && await tryPlay(ytUrl)) return;
  }

  // ═══ 5. Direct stream (if exists) ═══
  if (track._directStream && track._directStream.startsWith('http')) {
    if (await tryPlay(track._directStream)) return;
  }

  // ═══ 6. Auto-skip to next ═══
  if (currentPlaylist.length > 1) {
    setTimeout(() => playNext(), 800);
  }
}

/* ═══════════ AUTOPLAY ═══════════ */
async function autoplayNext() {
  if (isRepeat) { playTrack(currentTrackIndex); return; }
  if (currentPlaylist.length === 0) return;
  const remaining = currentPlaylist.length - currentTrackIndex - 1;
  if (remaining < 3) {
    const ct = currentPlaylist[currentTrackIndex];
    if (ct) {
      const related = await fetchRelatedSongs(ct);
      if (related.length) {
        related.forEach(t => { if (!currentPlaylist.some(x => x.id === t.id)) currentPlaylist.push(t); });
        renderHomeQueue();
        saveQueueToStorage();
      }
    }
  }
  if (isShuffle) currentTrackIndex = Math.floor(Math.random() * currentPlaylist.length);
  else currentTrackIndex = (currentTrackIndex + 1) % currentPlaylist.length;
  playTrack(currentTrackIndex);
}

async function autoExtendQueue(track) {
  if (autoMixFetching || !track) return;
  const remaining = currentPlaylist.length - currentTrackIndex - 1;
  if (remaining >= 3) return;
  autoMixFetching = true;
  try {
    const related = await fetchRelatedSongs(track);
    if (related.length) {
      related.forEach(t => { if (!currentPlaylist.some(x => x.id === t.id)) currentPlaylist.push(t); });
      renderHomeQueue();
      saveQueueToStorage();
    }
  } catch (e) {}
  autoMixFetching = false;
}

async function fetchRelatedSongs(seedTrack) {
  if (!seedTrack) return [];
  const now = Date.now();
  if (now - lastAutoFetchTime < 3000) return [];
  lastAutoFetchTime = now;
  if (!masterPlaylistLoaded) await fetchMasterPlaylist();

  const existingIds = new Set(currentPlaylist.map(t => t.id));
  playbackHistoryList.forEach(t => existingIds.add(t.id));
  existingIds.add(seedTrack.id);

  const shuffled = masterPlaylist.slice().sort(() => Math.random() - 0.5);
  const results = [];
  for (const t of shuffled) {
    if (results.length >= 10) break;
    if (existingIds.has(t.id)) continue;
    existingIds.add(t.id);
    results.push(t);
  }
  return results;
}

function togglePlaybackState(broadcast = true) {
  if (!mainAudio) return;
  if (mainAudio.paused) {
    initForegroundAudioBridge();
    requestHardwareWakeLock();
    mainAudio.play().then(() => setVisualState(true)).catch(() => {});
  } else {
    mainAudio.pause();
    setVisualState(false);
  }
}

function setVisualState(playing) {
  isPlayingAudio = playing;
  if (playing) requestHardwareWakeLock();
  const mi = document.getElementById('miniPlayIcon');
  if (mi) mi.className = playing ? 'fa-solid fa-pause' : 'fa-solid fa-play';
  const fi = document.getElementById('fullPlayIcon');
  if (fi) fi.className = playing ? 'fa-solid fa-pause' : 'fa-solid fa-play';
  if ('mediaSession' in navigator) navigator.mediaSession.playbackState = playing ? 'playing' : 'paused';
  const t = currentPlaylist[currentTrackIndex];
  if (t && window.AndroidNativeBridge && window.AndroidNativeBridge.updateNotification) {
    try { window.AndroidNativeBridge.updateNotification(t.title || 'Vaultify', t.artist || '', t.cover || '', playing); } catch (e) {}
  }
  const q = document.getElementById('modalQueueDrawer');
  if (q && q.classList.contains('open')) renderHomeQueue();
}

async function playNext() { autoplayNext(); }

function playPrevious() {
  if (currentPlaylist.length === 0) return;
  currentTrackIndex = (currentTrackIndex - 1 + currentPlaylist.length) % currentPlaylist.length;
  playTrack(currentTrackIndex);
}

function syncPlayerUI(track) {
  if (!track) return;
  const els = { miniTitleText: track.title, miniArtistText: track.artist, notchTrackTitle: track.title, fullTitleText: track.title, fullArtistText: track.artist };
  for (const id in els) { const el = document.getElementById(id); if (el) el.innerText = els[id] || ''; }
  const mA = document.getElementById('miniArtImg'); if (mA) mA.src = track.cover || 'vaultify.png';
  const fA = document.getElementById('fullArtImg'); if (fA) fA.src = track.cover || 'vaultify.png';
  const hb = document.getElementById('fullHeartBtn');
  if (hb) {
    const isL = likedSongs.some(s => s.id === track.id);
    hb.className = isL ? 'fa-solid fa-heart' : 'fa-regular fa-heart';
    hb.style.color = isL ? 'var(--partner-pink)' : 'inherit';
  }
}

function toggleShuffle() { isShuffle = !isShuffle; const el = document.getElementById('fullShuffleBtn'); if (el) el.style.color = isShuffle ? 'var(--accent-neon)' : 'inherit'; showToast(isShuffle ? 'Shuffle On' : 'Shuffle Off'); }
function toggleRepeat() { isRepeat = !isRepeat; const el = document.getElementById('fullRepeatBtn'); if (el) el.style.color = isRepeat ? 'var(--accent-neon)' : 'inherit'; showToast(isRepeat ? 'Repeat On' : 'Repeat Off'); }
function toggleSleepTimer() { showToast('Sleep 30 Min'); setTimeout(() => { if (isPlayingAudio) togglePlaybackState(); }, 30 * 60 * 1000); }
function shareCurrentTrack() {
  if (currentPlaylist.length === 0) return;
  const t = currentPlaylist[currentTrackIndex];
  if (navigator.share) navigator.share({ title: t.title, text: `Listening to ${t.title} on Vaultify` }).catch(() => {});
  else { try { navigator.clipboard.writeText(`🎵 ${t.title} - ${t.artist}`); showToast('Copied!'); } catch (e) { showToast('Share not supported'); } }
}

/* ═══════════ CACHE + DOWNLOAD ═══════════ */
async function cacheTrackInBackground(track) {
  if (!track) return;
  if (track.id.startsWith('blob:')) return;
  if (trackBlobCache.has(track.id)) return;
  const existing = await cacheGet(track.id);
  if (existing?.url) { trackBlobCache.set(track.id, existing.url); return; }
  try {
    let url = await findSaavnStreamUrl(track.title, track.artist);
    if (!url) url = await workerStreamUrl(track.id);
    if (!url || !url.startsWith('http')) return;
    const r = await fetch(url);
    const blob = await r.blob();
    await cachePut(track.id, blob, { title: track.title, artist: track.artist, cover: track.cover, source: track.source });
    const bu = URL.createObjectURL(blob);
    trackBlobCache.set(track.id, bu);
    if (currentLibraryTab === 'cached' && document.getElementById('tabLibrary').classList.contains('active')) renderLibrary();
  } catch (e) {}
}

async function downloadCurrentTrack() {
  if (currentPlaylist.length === 0) return showToast('No track!');
  const t = currentPlaylist[currentTrackIndex];
  showDownloadIndicator('Downloading...');
  try {
    let u = trackBlobCache.get(t.id);
    if (!u) u = await findSaavnStreamUrl(t.title, t.artist);
    if (!u) u = await workerStreamUrl(t.id);
    if (!u) throw new Error('No URL');
    const r = await fetch(u);
    const b = await r.blob();
    const bu = URL.createObjectURL(b);
    const a = document.createElement('a');
    a.style.display = 'none';
    a.href = bu;
    a.download = `${(t.title || 'track').replace(/[^a-zA-Z0-9 ]/g, '')}.mp3`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    await cacheTrackInBackground(t);
    setTimeout(() => { try { URL.revokeObjectURL(bu); } catch (e) {} }, 5000);
    hideDownloadIndicator(); showToast('✅ Downloaded!');
  } catch (e) { hideDownloadIndicator(); showToast('❌ Failed'); }
}

function showDownloadIndicator(text) { const i = document.getElementById('downloadIndicator'); if (!i) return; const t = document.getElementById('downloadText'); if (t) t.innerText = text; i.classList.add('show'); }
function hideDownloadIndicator() { const i = document.getElementById('downloadIndicator'); if (i) i.classList.remove('show'); }

/* ═══════════ MIC ═══════════ */
async function requestMicAndListen() {
  if (window.AndroidNativeBridge && !window.AndroidNativeBridge.hasMicPermission()) {
    if (window.AndroidNativeBridge.requestPermissions) window.AndroidNativeBridge.requestPermissions();
    showToast('Mic permission needed'); return;
  }
  const b = document.getElementById('voiceMicTrigger');
  try { const s = await navigator.mediaDevices.getUserMedia({ audio: true }); s.getTracks().forEach(t => t.stop()); }
  catch (e) { return showToast('Mic permission denied!'); }
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) return showToast('Voice not supported.');
  const r = new SR();
  r.lang = appLanguage === 'hi' ? 'hi-IN' : 'en-US';
  r.interimResults = false;
  r.onstart = () => { if (b) b.classList.add('recording'); showToast('Listening...'); };
  r.onresult = e => { const v = e.results[0][0].transcript; document.getElementById('mobileSearchField').value = v; showToast(`Heard: "${v}"`); executeLiveSearch(); };
  r.onerror = () => { if (b) b.classList.remove('recording'); };
  r.onend = () => { if (b) b.classList.remove('recording'); };
  r.start();
}

/* ═══════════ HISTORY ═══════════ */
function logPlaybackHistory(track) {
  playbackHistoryList = playbackHistoryList.filter(t => t.id !== track.id);
  playbackHistoryList.unshift(track);
  if (playbackHistoryList.length > 20) playbackHistoryList.pop();
  localStorage.setItem('vaultify_playback_history', JSON.stringify(playbackHistoryList));
  if (currentLibraryTab === 'history') renderLibrary();
  saveQueueToStorage();
}

function clearRecentlyPlayed() {
  if (!confirm('Clear recently played?')) return;
  playbackHistoryList = [];
  localStorage.removeItem('vaultify_playback_history');
  renderHomeRecentVault();
  renderLibrary();
  showToast('✅ Cleared');
}

function renderHomeRecentVault() {
  const c = document.getElementById('homeRecentGrid');
  if (!c) return;
  const r = playbackHistoryList.slice(0, 10);
  if (r.length === 0) {
    c.innerHTML = `<div style="min-width:100%;font-size:12.5px;color:var(--text-sub);text-align:center;padding:16px 0;background:rgba(255,255,255,.03);border-radius:14px;border:1px dashed var(--border)">No recently played.</div>`;
    return;
  }
  c.innerHTML = r.map(t => {
    const sI = encodeURIComponent(t.id), sT = encodeURIComponent(t.title || '');
    const sA = encodeURIComponent(t.artist || ''), sC = encodeURIComponent(t.cover || '');
    return `<div class="history-card-turnable" onclick="playSingleTrackObject('${sI}','${sT}','${sA}','${sC}')">
      <div style="width:120px;height:120px;border-radius:12px;overflow:hidden;position:relative;background:linear-gradient(135deg,rgba(139,92,246,.3),rgba(168,85,247,.15));box-shadow:0 4px 16px rgba(0,0,0,.4)">
        <img src="${t.cover || 'vaultify.png'}" onerror="this.src='vaultify.png'" style="width:100%;height:100%;object-fit:cover" />
        <div style="position:absolute;bottom:6px;right:6px;width:28px;height:28px;border-radius:50%;background:var(--accent-neon);display:flex;align-items:center;justify-content:center;box-shadow:0 2px 8px rgba(0,0,0,.5)">
          <i class="fa-solid fa-play" style="color:#fff;font-size:11px;margin-left:2px"></i>
        </div>
      </div>
      <div style="margin-top:8px;font-size:12px;font-weight:600;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escapeHtml(t.title)}</div>
      <div style="font-size:10.5px;color:var(--text-sub);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:2px">${escapeHtml(t.artist)}</div>
    </div>`;
  }).join('');
}

function playSingleTrackObject(idEnc, title, artist, cover) {
  const id = decodeURIComponent(idEnc);
  const t = { id, title: decodeURIComponent(title), artist: decodeURIComponent(artist), cover: decodeURIComponent(cover) };
  currentPlaylist = [t];
  currentTrackIndex = 0;
  renderHomeQueue();
  saveQueueToStorage();
  playTrack(0);
}

function renderHomeQueue() {
  const el = document.getElementById('homeQueueContainer');
  const c = document.getElementById('queueCountSubtitle');
  if (c) c.innerText = `${currentPlaylist.length} tracks`;
  if (!el) return;
  if (currentPlaylist.length === 0) {
    el.innerHTML = `<div style="font-size:12px;color:var(--text-sub);text-align:center;padding:12px 0">Empty queue.</div>`;
    return;
  }
  let h = '';
  const np = currentPlaylist[currentTrackIndex];
  const un = currentPlaylist.slice(currentTrackIndex + 1, currentTrackIndex + 20);
  if (np) {
    h += `<div style="font-size:10px;text-transform:uppercase;letter-spacing:1.5px;font-weight:700;margin:12px 0 6px;color:var(--accent-neon)">▶ Now Playing</div>`;
    h += renderQueueTile(np, currentTrackIndex, true);
  }
  if (un.length > 0) {
    h += `<div style="font-size:10px;text-transform:uppercase;letter-spacing:1.5px;font-weight:700;margin:12px 0 6px;color:var(--text-sub)">🎵 Up Next (${un.length})</div>`;
    un.forEach((t, i) => { h += renderQueueTile(t, currentTrackIndex + 1 + i, false); });
  }
  el.innerHTML = h;
}

function renderQueueTile(t, i, ic) {
  const isC = trackBlobCache.has(t.id);
  return `<div class="song-tile ${ic ? 'playing' : ''}" onclick="playTrack(${i});closeModal('modalQueueDrawer');"><div class="tile-left"><img src="${t.cover || 'vaultify.png'}" class="tile-thumb" onerror="this.src='vaultify.png'" /><div class="tile-meta"><h4>${escapeHtml(t.title)}${isC ? ' <i class="fa-solid fa-check-circle" style="color:#10b981;font-size:10px"></i>' : ''}</h4><p>${escapeHtml(t.artist)}</p></div></div><i class="${ic && isPlayingAudio ? 'fa-solid fa-volume-high' : 'fa-solid fa-play'}" style="color:var(--accent-neon);font-size:13px"></i></div>`;
}

/* ═══════════ SEARCH UI ═══════════ */
async function executeLiveSearch(isAuto = false) {
  const q = document.getElementById('mobileSearchField').value.trim();
  if (!q) return;
  if (!isAuto && !searchHistoryList.includes(q)) {
    searchHistoryList.unshift(q);
    if (searchHistoryList.length > 8) searchHistoryList.pop();
    localStorage.setItem('vaultify_search_history', JSON.stringify(searchHistoryList));
    renderSearchHistoryTags();
  }
  const l = document.getElementById('searchLoadingIndicator');
  const rc = document.getElementById('searchResultsContainer');
  l.style.display = 'block';
  l.innerHTML = '<i class="fa-solid fa-spinner fa-spin" style="font-size:24px;margin-bottom:8px"></i><div>Searching...</div>';
  rc.innerHTML = '';

  if (!masterPlaylistLoaded) await fetchMasterPlaylist();

  const found = searchInMasterPlaylist(q).slice(0, 30);
  l.style.display = 'none';

  if (found.length > 0) {
    renderSearchResults(found);
    if (!isAuto) showToast(`✅ ${found.length} results`);
  } else {
    const random = masterPlaylist.slice().sort(() => Math.random() - 0.5).slice(0, 20);
    if (random.length > 0) {
      renderSearchResults(random);
      showToast(`Kuch match nahi, playlist se random songs`);
    } else {
      rc.innerHTML = '<p style="font-size:13px;color:var(--text-sub);text-align:center;padding:18px 0">Kuch nahi mila...</p>';
    }
  }
  setTimeout(renderRecommendedSection, 2000);
}

function renderSearchResults(tracks) {
  const c = document.getElementById('searchResultsContainer');
  currentSearchResults = tracks;
  if (tracks.length === 0) { c.innerHTML = '<p style="font-size:13px;color:var(--text-sub);text-align:center;padding:18px 0">No results.</p>'; return; }
  c.innerHTML = tracks.map(t => {
    const sId = encodeURIComponent(t.id), sT = encodeURIComponent(t.title || '');
    const sA = encodeURIComponent(t.artist || ''), sC = encodeURIComponent(t.cover || 'vaultify.png');
    const sD = t._directStream ? encodeURIComponent(t._directStream) : '';
    const sDur = t.duration || 0;
    return `<div class="song-tile" onclick="playSearchedTrackImmediately('${sId}','${sT}','${sA}','${sC}','${sD}',${sDur})"><div class="tile-left"><img src="${t.cover || 'vaultify.png'}" class="tile-thumb" onerror="this.src='vaultify.png'" /><div class="tile-meta"><h4>${escapeHtml(t.title)}</h4><p>${escapeHtml(t.artist)}</p></div></div><i class="fa-solid fa-play" style="color:var(--accent-neon);font-size:15px"></i></div>`;
  }).join('');
}

function playSearchedTrackImmediately(idEnc, title, artist, cover, directEnc, duration) {
  const id = decodeURIComponent(idEnc);
  const t = { id, title: decodeURIComponent(title), artist: decodeURIComponent(artist), cover: decodeURIComponent(cover), duration: duration || 0 };
  const rD = directEnc ? decodeURIComponent(directEnc) : '';
  if (rD) t._directStream = rD;

  const seen = new Set();
  seen.add((t.title || '').toLowerCase().trim() + '|' + (t.artist || '').toLowerCase().trim());

  const newQueue = [t];
  currentSearchResults.forEach(r => {
    if (r.id === t.id) return;
    const key = (r.title || '').toLowerCase().trim() + '|' + (r.artist || '').toLowerCase().trim();
    if (seen.has(key)) return;
    seen.add(key);
    newQueue.push(r);
  });

  currentPlaylist = newQueue;
  currentTrackIndex = 0;
  renderHomeQueue();
  saveQueueToStorage();
  playTrack(0);
}

let liveSearchDebounceTimer = null;
let liveSearchRequestId = 0;

function initLiveSearchInputListener() {
  const f = document.getElementById('mobileSearchField');
  if (!f) return;
  f.addEventListener('input', () => {
    clearTimeout(liveSearchDebounceTimer);
    const q = f.value.trim();
    if (q.length >= 2) {
      liveSearchDebounceTimer = setTimeout(() => { if (f.value.trim() === q) instantSearch(q); }, 400);
    } else if (q.length === 0) {
      const rc = document.getElementById('searchResultsContainer');
      if (rc) rc.innerHTML = '<p style="font-size:13px;color:var(--text-sub);padding:16px 0;text-align:center">Type song name to search.</p>';
    }
  });
  f.addEventListener('keydown', e => { if (e.key === 'Enter') { clearTimeout(liveSearchDebounceTimer); e.preventDefault(); executeLiveSearch(false); } });
}

async function instantSearch(q) {
  const myId = ++liveSearchRequestId;
  const l = document.getElementById('searchLoadingIndicator');
  const rc = document.getElementById('searchResultsContainer');
  if (l) { l.style.display = 'block'; l.innerHTML = '<i class="fa-solid fa-spinner fa-spin" style="font-size:20px;margin-bottom:6px"></i><div style="font-size:12px">Searching...</div>'; }

  if (!masterPlaylistLoaded) await fetchMasterPlaylist();
  const found = searchInMasterPlaylist(q).slice(0, 25);
  if (myId !== liveSearchRequestId) return;
  if (l) l.style.display = 'none';

  if (found.length > 0) renderSearchResults(found);
  else {
    const random = masterPlaylist.slice().sort(() => Math.random() - 0.5).slice(0, 20);
    if (random.length > 0) renderSearchResults(random);
    else if (rc) rc.innerHTML = '<p style="font-size:13px;color:var(--text-sub);text-align:center;padding:18px 0">Kuch nahi mila...</p>';
  }
}

function renderSearchHistoryTags() {
  const b = document.getElementById('searchHistoryBox');
  const tb = document.getElementById('searchHistoryTags');
  if (!b) return;
  if (searchHistoryList.length === 0) { b.style.display = 'none'; return; }
  b.style.display = 'block';
  tb.innerHTML = searchHistoryList.map(tag => `<span style="font-size:11px;background:rgba(255,255,255,.06);padding:5px 10px;border-radius:10px;border:1px solid var(--border);cursor:pointer" onclick="document.getElementById('mobileSearchField').value='${escapeHtml(tag).replace(/'/g, "\\'")}';executeLiveSearch();">${escapeHtml(tag)}</span>`).join('');
}

function clearSearchHistory() { searchHistoryList = []; localStorage.removeItem('vaultify_search_history'); renderSearchHistoryTags(); renderRecommendedSection(); }

/* ═══════════ RECOMMENDED ═══════════ */
async function renderRecommendedSection() {
  const c = document.getElementById('recommendedContainer');
  if (!c) return;
  if (!masterPlaylistLoaded) await fetchMasterPlaylist();
  const found = masterPlaylist.slice().sort(() => Math.random() - 0.5).slice(0, 8);
  const h = document.querySelector('.recommended-header span');
  if (h) h.innerText = 'From Your Playlist';
  if (found.length === 0) { c.innerHTML = `<p style="font-size:11.5px;color:var(--text-sub);text-align:center;padding:10px 0">No suggestions.</p>`; return; }
  c.innerHTML = found.map(t => {
    const sI = encodeURIComponent(t.id), sT = encodeURIComponent(t.title || '');
    const sA = encodeURIComponent(t.artist || ''), sC = encodeURIComponent(t.cover || '');
    const sD = t._directStream ? encodeURIComponent(t._directStream) : '';
    const sDur = t.duration || 0;
    return `<div class="song-tile" onclick="playSearchedTrackImmediately('${sI}','${sT}','${sA}','${sC}','${sD}',${sDur})"><div class="tile-left"><img src="${t.cover || 'vaultify.png'}" class="tile-thumb" onerror="this.src='vaultify.png'" /><div class="tile-meta"><h4>${escapeHtml(t.title)}</h4><p>${escapeHtml(t.artist)}</p></div></div><i class="fa-solid fa-wand-magic-sparkles" style="color:var(--accent-neon);font-size:13px"></i></div>`;
  }).join('');
}

/* ═══════════ LIBRARY ═══════════ */
async function renderLibrary() {
  const c = document.getElementById('libraryContent');
  if (!c) return;
  if (currentLibraryTab === 'history') {
    if (playbackHistoryList.length === 0) { c.innerHTML = `<p style="font-size:13px;color:var(--text-sub);text-align:center;padding:18px 0">No history yet.</p>`; return; }
    let html = `<div style="display:flex;justify-content:flex-end;margin-bottom:8px"><span style="font-size:11px;color:#ef4444;cursor:pointer;padding:4px 8px" onclick="clearRecentlyPlayed()">Clear History</span></div>`;
    html += playbackHistoryList.map(t => { const sI = encodeURIComponent(t.id), sT = encodeURIComponent(t.title || ''); const sA = encodeURIComponent(t.artist || ''), sC = encodeURIComponent(t.cover || ''); return `<div class="song-tile" onclick="playSingleTrackObject('${sI}','${sT}','${sA}','${sC}')"><div class="tile-left"><img src="${t.cover || 'vaultify.png'}" class="tile-thumb" onerror="this.src='vaultify.png'" /><div class="tile-meta"><h4>${escapeHtml(t.title)}</h4><p>${escapeHtml(t.artist)}</p></div></div><i class="fa-solid fa-play" style="color:var(--accent-neon);font-size:13px"></i></div>`; }).join('');
    c.innerHTML = html;
  } else if (currentLibraryTab === 'liked') {
    if (likedSongs.length === 0) { c.innerHTML = `<p style="font-size:13px;color:var(--text-sub);text-align:center;padding:18px 0">No liked songs yet.</p>`; return; }
    c.innerHTML = likedSongs.map(t => { const sI = encodeURIComponent(t.id), sT = encodeURIComponent(t.title || ''); const sA = encodeURIComponent(t.artist || ''), sC = encodeURIComponent(t.cover || ''); return `<div class="song-tile" onclick="playSingleTrackObject('${sI}','${sT}','${sA}','${sC}')"><div class="tile-left"><img src="${t.cover || 'vaultify.png'}" class="tile-thumb" onerror="this.src='vaultify.png'" /><div class="tile-meta"><h4>${escapeHtml(t.title)}</h4><p>${escapeHtml(t.artist)}</p></div></div><i class="fa-solid fa-heart" style="color:var(--partner-pink);font-size:14px" onclick="event.stopPropagation();unlikeSong('${t.id.replace(/'/g, "\\'")}')"></i></div>`; }).join('');
  } else if (currentLibraryTab === 'playlists') {
    let html = `<div style="background:var(--bg-card);border:1px solid var(--border);border-radius:14px;padding:12px;margin-bottom:10px;display:flex;align-items:center;gap:12px;cursor:pointer" onclick="openModal('modalAddToPlaylist')"><div style="width:56px;height:56px;border-radius:10px;background:linear-gradient(135deg,var(--accent),var(--accent-neon));display:flex;align-items:center;justify-content:center;font-size:24px;color:#fff;flex-shrink:0"><i class="fa-solid fa-plus"></i></div><div style="flex:1"><div style="font-size:14px;font-weight:700;color:#fff">Create New Playlist</div></div></div>`;
    html += playlists.map((p, i) => `<div style="background:var(--bg-card);border:1px solid var(--border);border-radius:14px;padding:12px;margin-bottom:10px;display:flex;align-items:center;gap:12px;cursor:pointer" onclick="openPlaylist(${i})"><div style="width:56px;height:56px;border-radius:10px;background:linear-gradient(135deg,var(--accent),var(--accent-neon));display:flex;align-items:center;justify-content:center;font-size:24px;color:#fff;flex-shrink:0"><i class="fa-solid fa-list"></i></div><div style="flex:1;overflow:hidden"><div style="font-size:14px;font-weight:700;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escapeHtml(p.name)}</div><div style="font-size:11px;color:var(--text-sub);margin-top:2px">${p.songs.length} songs</div></div><i class="fa-solid fa-trash" style="color:#ef4444;font-size:14px" onclick="event.stopPropagation();deletePlaylist(${i})"></i></div>`).join('');
    c.innerHTML = html;
  } else if (currentLibraryTab === 'cached') {
    const cached = await cacheAll();
    if (cached.length === 0) { c.innerHTML = `<p style="font-size:13px;color:var(--text-sub);text-align:center;padding:18px 0">No cached songs yet.</p>`; return; }
    let totalSize = 0;
    cached.forEach(t => { try { if (t.size) totalSize += t.size; } catch (e) {} });
    let html = `<div style="font-size:11px;color:var(--text-sub);margin-bottom:8px"><i class="fa-solid fa-database"></i> ${cached.length} songs · ~${(totalSize / (1024 * 1024)).toFixed(1)}MB</div>`;
    html += cached.map(t => `<div class="song-tile" onclick="playCached('${t.id.replace(/'/g, "\\'")}')"><div class="tile-left"><img src="${t.cover || 'vaultify.png'}" class="tile-thumb" onerror="this.src='vaultify.png'" /><div class="tile-meta"><h4>${escapeHtml(t.title || 'Unknown')}</h4><p>${escapeHtml(t.artist || '')}</p></div></div><i class="fa-solid fa-trash" style="color:#ef4444;font-size:13px" onclick="event.stopPropagation();removeCache('${t.id.replace(/'/g, "\\'")}')"></i></div>`).join('');
    c.innerHTML = html;
  }
}

async function playCached(id) {
  const c = await cacheGet(id);
  if (c && c.url) {
    const t = { id, title: c.title, artist: c.artist, cover: c.cover, _directStream: c.url };
    currentPlaylist = [t];
    currentTrackIndex = 0;
    renderHomeQueue();
    playTrack(0);
  }
}

async function removeCache(id) {
  const u = trackBlobCache.get(id);
  if (u && u.startsWith('blob:')) { try { URL.revokeObjectURL(u); } catch (e) {} }
  trackBlobCache.delete(id);
  await cacheDelete(id);
  renderLibrary();
  showToast('Removed');
}

function openPlaylist(i) {
  const p = playlists[i];
  if (!p) return showToast('Playlist empty');
  if (p.songs.length === 0) return showToast('Empty playlist');
  currentPlaylist = p.songs.slice();
  renderHomeQueue();
  saveQueueToStorage();
  playTrack(0);
  closeModal('modalAddToPlaylist');
  showToast(`▶ ${p.name}`);
}

function deletePlaylist(i) { if (!confirm('Delete this playlist?')) return; playlists.splice(i, 1); savePlaylists(); renderLibrary(); }
function savePlaylists() { localStorage.setItem('vaultify_playlists', JSON.stringify(playlists)); }

function toggleLikeCurrent() {
  if (currentPlaylist.length === 0) return showToast('No track');
  const t = currentPlaylist[currentTrackIndex];
  const idx = likedSongs.findIndex(s => s.id === t.id);
  if (idx >= 0) { likedSongs.splice(idx, 1); showToast('Removed from Liked'); }
  else { likedSongs.unshift(t); showToast('❤️ Added to Liked'); }
  localStorage.setItem('vaultify_liked', JSON.stringify(likedSongs));
  const hb = document.getElementById('fullHeartBtn');
  const isL = likedSongs.some(s => s.id === t.id);
  hb.className = isL ? 'fa-solid fa-heart' : 'fa-regular fa-heart';
  hb.style.color = isL ? 'var(--partner-pink)' : 'inherit';
  if (currentLibraryTab === 'liked') renderLibrary();
}

function unlikeSong(id) { likedSongs = likedSongs.filter(s => s.id !== id); localStorage.setItem('vaultify_liked', JSON.stringify(likedSongs)); renderLibrary(); }

function openAddToPlaylistModal() {
  if (currentPlaylist.length === 0) return showToast('No track');
  const c = document.getElementById('playlistSelectList');
  if (playlists.length === 0) c.innerHTML = `<p style="font-size:12px;color:var(--text-sub);text-align:center;padding:8px 0">No playlists yet.</p>`;
  else c.innerHTML = playlists.map((p, i) => `<div class="song-tile" onclick="addToPlaylist(${i})"><div class="tile-left"><div style="width:38px;height:38px;border-radius:8px;background:linear-gradient(135deg,var(--accent),var(--accent-neon));display:flex;align-items:center;justify-content:center;font-size:16px;color:#fff;flex-shrink:0"><i class="fa-solid fa-list"></i></div><div class="tile-meta"><h4>${escapeHtml(p.name)}</h4><p>${p.songs.length} songs</p></div></div><i class="fa-solid fa-plus" style="color:var(--accent-neon)"></i></div>`).join('');
  openModal('modalAddToPlaylist');
}

function addToPlaylist(i) {
  const t = currentPlaylist[currentTrackIndex];
  if (!playlists[i].songs.some(s => s.id === t.id)) playlists[i].songs.push(t);
  savePlaylists();
  showToast(`Added to ${playlists[i].name}`);
  closeModal('modalAddToPlaylist');
  if (currentLibraryTab === 'playlists') renderLibrary();
}

function createPlaylistAndAdd() {
  const n = document.getElementById('newPlaylistName').value.trim();
  if (!n) return showToast('Enter name');
  const t = currentPlaylist[currentTrackIndex];
  playlists.push({ id: Date.now(), name: n, songs: t ? [t] : [], created: Date.now() });
  savePlaylists();
  document.getElementById('newPlaylistName').value = '';
  showToast(`Created: ${n}`);
  closeModal('modalAddToPlaylist');
  if (currentLibraryTab === 'playlists') renderLibrary();
}

/* ═══════════ NOTIFICATIONS ═══════════ */
function getStoredNotifications() { return JSON.parse(localStorage.getItem('vaultify_notifications_list') || '[]'); }
function pushNotification(n) {
  const l = getStoredNotifications();
  l.unshift({ ...n, id: Date.now(), time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), unread: true });
  if (l.length > 60) l.pop();
  localStorage.setItem('vaultify_notifications_list', JSON.stringify(l));
  renderNotificationCenter();
}

function renderNotificationCenter() {
  const list = getStoredNotifications();
  const container = document.getElementById('notificationListContainer');
  const badge = document.getElementById('notifBadgeCount');
  if (badge) { const u = list.filter(n => n.unread).length; if (u > 0) { badge.innerText = u; badge.style.display = 'flex'; } else badge.style.display = 'none'; }
  if (!container) return;
  if (list.length === 0) { container.innerHTML = `<div style="text-align:center;padding:40px 20px;color:var(--text-sub);"><i class="fa-solid fa-bell-slash" style="font-size:36px;margin-bottom:12px;opacity:0.5;"></i><p style="font-size:13px;font-weight:600;">No notifications yet</p></div>`; return; }
  container.innerHTML = list.map(n => `<div style="display:flex;align-items:flex-start;gap:12px;padding:12px;margin-bottom:8px;background:${n.unread ? 'rgba(139,92,246,0.12)' : 'rgba(255,255,255,0.03)'};border:1px solid ${n.unread ? 'var(--accent-neon)' : 'var(--border)'};border-radius:14px;"><div style="width:38px;height:38px;border-radius:50%;background:${n.iconColor || 'var(--accent-neon)'}20;display:flex;align-items:center;justify-content:center;flex-shrink:0;"><i class="${n.icon || 'fa-solid fa-bell'}" style="color:${n.iconColor || 'var(--accent-neon)'};font-size:16px;"></i></div><div style="flex:1;min-width:0;"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:2px;"><span style="font-size:13px;font-weight:700;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:70%;">${escapeHtml(n.title)}</span><span style="font-size:10px;color:var(--text-sub);flex-shrink:0;margin-left:8px;">${n.time}</span></div><div style="font-size:11.5px;color:var(--text-sub);line-height:1.4;word-break:break-word;">${escapeHtml(n.message)}</div></div>${n.unread ? '<div style="width:8px;height:8px;border-radius:50%;background:var(--accent-neon);flex-shrink:0;margin-top:6px;"></div>' : ''}</div>`).join('');
}

function openNotificationModal() {
  const l = getStoredNotifications(); l.forEach(n => n.unread = false);
  localStorage.setItem('vaultify_notifications_list', JSON.stringify(l));
  renderNotificationCenter();
  openModal('modalNotifications');
}

function clearAllNotifications() { localStorage.removeItem('vaultify_notifications_list'); renderNotificationCenter(); showToast('Cleared!'); }

/* ═══════════ PERMISSIONS ═══════════ */
function checkPermissionsStatus() {
  const banner = document.getElementById('permWarningBanner');
  const text = document.getElementById('permWarningText');
  const mic = document.getElementById('micPermStatus');
  const notif = document.getElementById('notifPermStatus');
  if (!window.AndroidNativeBridge) { if (banner) banner.classList.remove('show'); return; }
  let missing = [];
  try {
    const hasMic = window.AndroidNativeBridge.hasMicPermission();
    const hasNotif = window.AndroidNativeBridge.hasNotificationPermission();
    if (mic) { mic.innerText = hasMic ? 'Granted' : 'Denied'; mic.style.color = hasMic ? '#10b981' : '#ef4444'; }
    if (notif) { notif.innerText = hasNotif ? 'Granted' : 'Denied'; notif.style.color = hasNotif ? '#10b981' : '#ef4444'; }
    if (!hasMic) missing.push('Microphone');
    if (!hasNotif) missing.push('Notifications');
  } catch (e) {}
  if (missing.length > 0 && banner && text) { text.innerText = `${missing.join(' & ')} permission needed. Tap to enable.`; banner.classList.add('show'); }
  else if (banner) banner.classList.remove('show');
}

function handlePermissionBannerClick() { if (window.AndroidNativeBridge && window.AndroidNativeBridge.requestPermissions) window.AndroidNativeBridge.requestPermissions(); else showToast('Open Profile > Permissions'); }
function requestPermsFromNative() { if (window.AndroidNativeBridge && window.AndroidNativeBridge.requestPermissions) window.AndroidNativeBridge.requestPermissions(); setTimeout(checkPermissionsStatus, 800); }
function openAppSettingsNative() { if (window.AndroidNativeBridge && window.AndroidNativeBridge.openAppSettings) window.AndroidNativeBridge.openAppSettings(); else showToast('Settings not available'); }
function openEqualizer() { if (window.AndroidNativeBridge && window.AndroidNativeBridge.openSystemEqualizer) { window.AndroidNativeBridge.openSystemEqualizer(); showToast('🎚️ System EQ'); } else showToast('System EQ not available'); }

/* ═══════════ EMOJI ═══════════ */
let emojiMode = localStorage.getItem('vaultify_emoji_mode') || 'flow';
let emojiList = JSON.parse(localStorage.getItem('vaultify_emoji_list') || '["🐱","👻","🔥","🚀","⚡","💜","🎵"]');
let activeEmoji = localStorage.getItem('vaultify_active_emoji') || '🐱';
let currentEmojiIndex = 0;
let mixRafId = null;

function initEmojiRunner() {
  const i = document.getElementById('notchRunnerIcon');
  if (!i) return;
  i.classList.remove('mode-flow', 'mode-mix');
  i.style.left = '';
  i.style.transform = '';
  i.style.animation = '';
  i.innerText = activeEmoji;

  if (emojiMode === 'mix') {
    i.classList.add('mode-mix');
    animateMixEmoji();
  } else {
    i.classList.add('mode-flow');
    if (mixRafId) { cancelAnimationFrame(mixRafId); mixRafId = null; }
  }

  const flowBtn = document.getElementById('modeFlowBtn');
  const mixBtn = document.getElementById('modeMixBtn');
  if (flowBtn && mixBtn) {
    if (emojiMode === 'flow') {
      flowBtn.style.background = 'linear-gradient(135deg,var(--accent-neon),var(--accent))';
      flowBtn.style.color = '#020005';
      mixBtn.style.background = 'rgba(255,255,255,.08)';
      mixBtn.style.color = 'var(--text-sub)';
    } else {
      mixBtn.style.background = 'linear-gradient(135deg,var(--accent-neon),var(--accent))';
      mixBtn.style.color = '#020005';
      flowBtn.style.background = 'rgba(255,255,255,.08)';
      flowBtn.style.color = 'var(--text-sub)';
    }
  }
}

function animateMixEmoji() {
  if (mixRafId) cancelAnimationFrame(mixRafId);
  const i = document.getElementById('notchRunnerIcon');
  const n = document.querySelector('.notch-island');
  if (!i || !n) return;
  let p = 0, d = 1;
  i.style.animation = 'none';
  i.style.left = '8px';
  const step = () => {
    if (emojiMode !== 'mix') { mixRafId = null; return; }
    const mx = (n.clientWidth || 290) - 40;
    p += d * 1.5;
    if (p >= mx) { p = mx; d = -1; cycleEmoji(); }
    else if (p <= 0) { p = 0; d = 1; cycleEmoji(); }
    i.style.left = (8 + p) + 'px';
    mixRafId = requestAnimationFrame(step);
  };
  mixRafId = requestAnimationFrame(step);
}

function cycleEmoji() {
  const l = emojiList.length > 0 ? emojiList : ['🐱'];
  currentEmojiIndex = (currentEmojiIndex + 1) % l.length;
  const i = document.getElementById('notchRunnerIcon');
  if (!i) return;
  i.innerText = l[currentEmojiIndex];
  i.style.filter = 'drop-shadow(0 0 10px var(--accent-neon))';
  setTimeout(() => { i.style.filter = ''; }, 200);
}

function initEmojiPicker() {
  const r = document.getElementById('emojiPickerRow');
  if (!r) return;
  r.innerHTML = emojiList.map(e => `<div class="emoji-chip ${e === activeEmoji ? 'active' : ''}" data-emoji="${e}">${e}</div>`).join('');
  r.querySelectorAll('.emoji-chip').forEach(c => {
    c.addEventListener('click', () => {
      activeEmoji = c.dataset.emoji;
      localStorage.setItem('vaultify_active_emoji', activeEmoji);
      r.querySelectorAll('.emoji-chip').forEach(x => x.classList.remove('active'));
      c.classList.add('active');
      const icon = document.getElementById('notchRunnerIcon');
      if (icon) icon.innerText = activeEmoji;
      showToast(`Runner: ${activeEmoji}`);
    });
  });
}

function addCustomEmoji() {
  const i = document.getElementById('customEmojiInput');
  const v = i.value.trim();
  if (!v) return showToast('Enter emoji');
  if (emojiList.includes(v)) return showToast('Already added');
  emojiList.push(v);
  localStorage.setItem('vaultify_emoji_list', JSON.stringify(emojiList));
  i.value = '';
  initEmojiPicker();
  showToast(`Added: ${v}`);
}

function setEmojiMode(mode) {
  emojiMode = mode;
  localStorage.setItem('vaultify_emoji_mode', mode);
  if (mixRafId) { cancelAnimationFrame(mixRafId); mixRafId = null; }
  initEmojiRunner();
  showToast(mode === 'flow' ? 'Flow mode' : 'Mix mode');
}

function toggleAmbientMotion() { const e = document.getElementById('gradientFlowBg'); const b = document.getElementById('gradientToggleBtn'); if (!e || !b) return; const o = e.classList.toggle('disabled'); b.innerText = o ? 'Disabled' : 'Enabled'; showToast(`Motion ${o ? 'off' : 'on'}`); }
function toggleRunnerVisibility() { const i = document.getElementById('notchRunnerIcon'); const b = document.getElementById('runnerToggleBtn'); if (!i || !b) return; const h = i.style.display === 'none'; i.style.display = h ? '' : 'none'; b.innerText = h ? 'Enabled' : 'Disabled'; showToast(`Runner ${h ? 'on' : 'off'}`); }

function applyThemeScheme(c) {
  document.body.className = '';
  if (c !== 'theme-violet') document.body.classList.add(c);
  localStorage.setItem('vaultify_theme', c);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) {
    if (c === 'theme-midnight-oled' || c === 'theme-black-white') meta.content = '#000000';
    else if (c === 'theme-royal-gold') meta.content = '#d4af37';
    else meta.content = '#8b5cf6';
  }
  showToast(`Theme changed!`);
}

(function restoreTheme() { const saved = localStorage.getItem('vaultify_theme'); if (saved && saved !== 'theme-violet') document.body.classList.add(saved); })();

/* ═══════════ IP COUNTER ═══════════ */
async function getPublicIP() {
  try {
    const ctrl = new AbortController();
    const tm = setTimeout(() => ctrl.abort(), 5000);
    const r = await fetch('https://api.ipify.org?format=json', { signal: ctrl.signal });
    clearTimeout(tm);
    if (!r.ok) return null;
    const d = await r.json();
    return d.ip;
  } catch (e) { return null; }
}

function getDeviceId() {
  let id = localStorage.getItem('vaultify_device_id');
  if (!id) { id = 'dev_' + Math.random().toString(36).substr(2, 16) + '_' + Date.now(); localStorage.setItem('vaultify_device_id', id); }
  return id;
}

async function initIPCounter() {
  if (!isFirebaseReady()) return;
  try {
    const ip = await getPublicIP();
    if (!ip) return;
    const deviceId = getDeviceId();
    const ua = navigator.userAgent || 'unknown';
    const now = Date.now();
    const docRef = firestoreDB.collection('app_config').doc('user_ips');
    const doc = await docRef.get();
    let data = doc.exists ? doc.data() : { ips: {}, devices: {} };
    if (!data.ips) data.ips = {}; if (!data.devices) data.devices = {};
    if (!data.ips[ip]) data.ips[ip] = { firstSeen: now, lastSeen: now, deviceCount: 1, deviceIds: [deviceId] };
    else { data.ips[ip].lastSeen = now; if (!data.ips[ip].deviceIds) data.ips[ip].deviceIds = []; if (!data.ips[ip].deviceIds.includes(deviceId)) { data.ips[ip].deviceIds.push(deviceId); data.ips[ip].deviceCount = data.ips[ip].deviceIds.length; } }
    if (!data.devices[deviceId]) data.devices[deviceId] = { ip, ua: ua.substring(0, 100), firstSeen: now, lastSeen: now };
    else { data.devices[deviceId].lastSeen = now; data.devices[deviceId].ip = ip; }
    const ipList = Object.keys(data.ips); const devList = Object.keys(data.devices);
    const dayAgo = now - 24 * 60 * 60 * 1000;
    data.totalIPs = ipList.length; data.totalDevices = devList.length;
    data.activeDevices24h = devList.filter(k => data.devices[k].lastSeen >= dayAgo).length;
    data.lastUpdated = now;
    await docRef.set(data);
    renderIPStats(data);
  } catch (e) {}
}

function listenIPStats(callback) {
  if (!isFirebaseReady()) return;
  try { firestoreDB.collection('app_config').doc('user_ips').onSnapshot(doc => { if (doc.exists && typeof callback === 'function') callback(doc.data()); }); } catch (e) {}
}

function renderIPStats(stats) {
  const el = document.getElementById('ipStatsDisplay');
  if (el && stats) {
    el.innerHTML = `<div style="font-size:11px;color:var(--text-sub);line-height:1.8">
      <div>🌐 Total IPs: <b style="color:#fff">${stats.totalIPs || 0}</b></div>
      <div>📱 Total devices: <b style="color:#fff">${stats.totalDevices || 0}</b></div>
      <div>🟢 Active 24h: <b style="color:#10b981">${stats.activeDevices24h || 0}</b></div>
    </div>`;
  }
  const cnt = document.getElementById('certUserCount');
  if (cnt && stats) {
    const total = stats.activeDevices24h || stats.totalDevices || 1;
    cnt.innerText = `${total} User${total > 1 ? 's' : ''}`;
  }
}

/* ═══════════ PLAYBACK SAVE ═══════════ */
async function savePlaybackState() {
  try {
    if (!currentPlaylist[currentTrackIndex] || !mainAudio) return;
    const t = currentPlaylist[currentTrackIndex];
    const pos = mainAudio.currentTime || 0;
    localStorage.setItem('vaultify_playback_state', JSON.stringify({ wasPlaying: isPlayingAudio, lastTrackId: t.id, lastTrackTitle: t.title, lastTrackArtist: t.artist, lastTrackCover: t.cover, lastPosition: Math.floor(pos * 1000), lastIndex: currentTrackIndex, playlistJson: JSON.stringify(currentPlaylist.slice(0, 50)), timestamp: Date.now() }));
  } catch (e) {}
}

setInterval(() => { if (!isPlayingAudio) return; _lastSaveTick += 1000; if (_lastSaveTick >= 10000) { _lastSaveTick = 0; savePlaybackState(); } }, 1000);

/* ═══════════ EQ FIX ═══════════ */
setTimeout(() => {
  ['eq60', 'eq230', 'eq910', 'eq4k', 'eq14k'].forEach((id, i) => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener('input', () => {
        if (eqNodes && eqNodes.filters[i]) eqNodes.filters[i].gain.value = parseFloat(el.value) || 0;
      });
      el.addEventListener('change', saveEqToStorage);
    }
  });
  loadEqFromStorage();
}, 2000);

/* ═══════════ CERTIFICATE LIVE DATE + TIME ═══════════ */
function updateCertLiveDateTime() {
  try {
    const dateEl = document.getElementById('certLiveDate');
    const timeEl = document.getElementById('certLiveTime');
    if (!dateEl || !timeEl) return;
    const now = new Date();
    const dd = String(now.getDate()).padStart(2, '0');
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const yyyy = now.getFullYear();
    dateEl.textContent = dd + '/' + mm + '/' + yyyy;
    let h = now.getHours();
    const ampm = h >= 12 ? 'PM' : 'AM';
    h = h % 12; if (h === 0) h = 12;
    const hh = String(h).padStart(2, '0');
    const mi = String(now.getMinutes()).padStart(2, '0');
    const ss = String(now.getSeconds()).padStart(2, '0');
    timeEl.textContent = hh + ':' + mi + ':' + ss + ' ' + ampm;
  } catch (e) {}
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', updateCertLiveDateTime);
} else {
  updateCertLiveDateTime();
}
setTimeout(updateCertLiveDateTime, 100);
setTimeout(updateCertLiveDateTime, 500);
setTimeout(updateCertLiveDateTime, 1500);
setInterval(updateCertLiveDateTime, 1000);

/* ═══════════ BOOT ═══════════ */
window.addEventListener('DOMContentLoaded', () => {
  mainAudio = document.getElementById('vaultifyAudio');
  silentLoop = document.getElementById('silentAudioLoop');

  setTimeout(() => {
    const i = document.getElementById('appIntroScreen');
    if (i) {
      i.classList.add('fade-out');
      i.style.opacity = '0';
      i.style.transition = 'opacity 0.6s ease';
      setTimeout(() => {
        i.style.display = 'none';
        i.style.visibility = 'hidden';
        i.style.pointerEvents = 'none';
        i.style.zIndex = '-1';
      }, 700);
    }
  }, 1500);

  initCacheDB();
  loadSaavnUrlCache();
  setupMediaSession();
  setupTimelineDraggableEngine();
  initLiveSearchInputListener();
  verifyAuthGate();
  renderHomeRecentVault();
  renderHomeQueue();
  renderLibrary();
  renderSearchHistoryTags();
  renderNotificationCenter();

  setTimeout(initEqChain, 800);
  setTimeout(loadEqFromStorage, 1500);

  setTimeout(() => { initEmojiRunner(); initEmojiPicker(); setEmojiMode(emojiMode); }, 500);

  setTimeout(checkPermissionsStatus, 800);
  setInterval(checkPermissionsStatus, 5000);

  setTimeout(() => { if (isFirebaseReady()) { initIPCounter(); listenIPStats(renderIPStats); } }, 3000);

  loadMasterPlaylistFromCache();
  setTimeout(async () => {
    await checkWorker();
    await fetchMasterPlaylist();
    renderRecommendedSection();
    loadQueueFromStorage();
  }, 1500);
  setTimeout(refreshMasterPlaylistInBackground, 5000);

  const start = () => {
    initForegroundAudioBridge();
    requestHardwareWakeLock();
    if (!silentLoopStarted && silentLoop) { silentLoop.play().catch(() => {}); silentLoopStarted = true; }
  };
  document.body.addEventListener('touchstart', start, { once: true });
  document.body.addEventListener('click', start, { once: true });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && isPlayingAudio && mainAudio && mainAudio.paused) { mainAudio.play().catch(() => {}); }
    if (!document.hidden && 'wakeLock' in navigator) requestHardwareWakeLock();
  });

  window.addEventListener('popstate', (e) => {
    e.preventDefault();
    if (!handleSystemBackPress()) {
      try {
        if (window.AndroidNativeBridge && window.AndroidNativeBridge.minimizeApp) window.AndroidNativeBridge.minimizeApp();
        else history.pushState(null, '', location.href);
      } catch (err) { history.pushState(null, '', location.href); }
    }
    history.pushState(null, '', location.href);
  });

  history.pushState(null, '', location.href);
});

window.addEventListener('beforeunload', savePlaybackState);
window.addEventListener('pagehide', savePlaybackState);

/* ═══════════ EXPORTS ═══════════ */
Object.assign(window, {
  showToast, escapeHtml, formatClock, openModal, closeModal, openFullPlayer, closeFullPlayer,
  openPartnerModal, openSupportModal, switchNavTab, switchLibraryTab,
  handleSystemBackPress, isFirebaseReady, getDeviceId, getPublicIP,
  verifyAuthGate, unlockApp, toggleAuthMode, processAuthSubmission, applyUserDataUI,
  openForgotPasswordFlow, executePasswordReset, triggerDpPicker, handleDpUpload,
  saveProfileData, performAppLogout, generatePartnerCode, syncUserPartnerCode, changeAppLanguage,
  searchAll, fetchTrendingSongs,
  executeLiveSearch, instantSearch, renderSearchResults, playSearchedTrackImmediately,
  playTrack, playNext, playPrevious, autoplayNext, togglePlaybackState, setVisualState,
  syncPlayerUI, toggleShuffle, toggleRepeat, toggleSleepTimer, shareCurrentTrack,
  downloadCurrentTrack, toggleLikeCurrent, unlikeSong, openPlaylist, deletePlaylist,
  openAddToPlaylistModal, addToPlaylist, createPlaylistAndAdd, renderLibrary,
  renderHomeQueue, renderHomeRecentVault, renderRecommendedSection,
  renderSearchHistoryTags, clearSearchHistory, playSingleTrackObject, playCached, removeCache,
  requestMicAndListen, resetEqSliders, applyEqNow, savePlaybackState,
  showDownloadIndicator, hideDownloadIndicator, cacheGet, cacheAll, clearRecentlyPlayed,
  getStoredNotifications, pushNotification, renderNotificationCenter,
  openNotificationModal, clearAllNotifications, checkPermissionsStatus,
  handlePermissionBannerClick, requestPermsFromNative, openAppSettingsNative,
  openEqualizer, initEmojiRunner, initEmojiPicker,
  addCustomEmoji, setEmojiMode, toggleAmbientMotion, toggleRunnerVisibility,
  applyThemeScheme, initIPCounter, listenIPStats, renderIPStats,
  prefetchStream, checkWorker, workerSearch, workerStreamUrl, fetchCobaltAudio,
  saveQueueToStorage, loadQueueFromStorage, updateCertLiveDateTime,
  fetchMasterPlaylist, manualRefreshPlaylist, searchInMasterPlaylist,
  findSaavnStreamUrl
});