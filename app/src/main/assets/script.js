/* ═══════════════════════════════════════════════════════════════ */
/* VAULTIFY — SPOTIFY SEARCH + JIOSAAVN STREAM                     */
/* ═══════════════════════════════════════════════════════════════ */

const APP_VERSION = 2;
const CACHE_MAX_SIZE_MB = 500;
const CACHE_MAX_SONGS = 150;

let firebaseApp = null;
let firestoreDB = null;
let firebaseAuth = null;
let firebaseReady = false;
let workerReady = false;

try {
  if (typeof firebase !== 'undefined') {
    const FIREBASE_CONFIG = {
      apiKey: "AIzaSyCQgQoJpV9FGhd8yY2_nklQICQMpZ5-1RY",
      authDomain: "vaultify-18865.firebaseapp.com",
      projectId: "vaultify-18865",
      storageBucket: "vaultify-18865.firebasestorage.app",
      messagingSenderId: "961290318010",
      appId: "1:961290318010:web:efa1e8c95c8d09c533d283"
    };
    firebaseApp = firebase.initializeApp(FIREBASE_CONFIG);
    firestoreDB = firebase.firestore();
    firebaseAuth = firebase.auth();
    firebaseReady = true;
  }
} catch (e) {}

function isFirebaseReady() { return firebaseReady && firestoreDB && firebaseAuth; }

/* ═══════════ UI HELPERS ═══════════ */
let navigationHistory = ['home'];

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
function openFullPlayer() { document.getElementById('fullPlayerModal').classList.add('open'); }
function closeFullPlayer() { document.getElementById('fullPlayerModal').classList.remove('open'); }
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
  const other = document.querySelectorAll('.view-screen.active:not(#tabHome)');
  if (other.length > 0) { switchNavTab('home'); return true; }
  return false;
}
window.handleSystemBackPress = handleSystemBackPress;

/* ═══════════ WORKER BRIDGE ═══════════ */
async function checkWorker() {
  try {
    workerReady = await checkWorkerHealth();
    return workerReady;
  } catch (e) {
    workerReady = false;
    return false;
  }
}

async function workerSearch(query, limit = 25) {
  try {
    const r = await proxyFetch(`/search?q=${encodeURIComponent(query)}&limit=${limit}`, { timeout: 15000 });
    const data = await r.json();
    return data.results || [];
  } catch (e) { return []; }
}

async function workerStreamUrl(id, meta) {
  try {
    let url = `/stream?id=${encodeURIComponent(id)}`;
    if (meta) {
      if (meta.title) url += `&title=${encodeURIComponent(meta.title)}`;
      if (meta.artist) url += `&artist=${encodeURIComponent(meta.artist)}`;
      if (meta.duration) url += `&dur=${meta.duration}`;
    }
    const r = await proxyFetch(url, { timeout: 25000 });
    const data = await r.json();
    return data.url || null;
  } catch (e) { return null; }
}

/* ═══════════ AUTH ═══════════ */
const AUTH_ITERATIONS = 100000, AUTH_SALT_BYTES = 16, AUTH_KEY_BYTES = 32;
let isLoginMode = false;
let loggedInUser = null;

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
  if (!s) {
    document.body.classList.add('auth-locked');
    if (mainFrame) mainFrame.style.pointerEvents = 'none';
    authModal.classList.add('open');
    authModal.style.display = 'flex';
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
      authModal.style.display = 'flex';
    }
  }
}

function unlockApp() {
  const authModal = document.getElementById('modalAuthGate');
  const mainFrame = document.querySelector('.mobile-frame');
  if (authModal) { authModal.classList.remove('open'); authModal.style.display = 'none'; }
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
  const el = document.getElementById('myPartnerCodeDisplay');
  if (el) el.innerText = user.partnerCode;
}

function changeAppLanguage(lang) { appLanguage = lang; localStorage.setItem('vaultify_app_lang', lang); showToast(lang === 'hi' ? 'हिंदी चुनी गई' : 'English Selected'); }

/* ═══════════ MUSIC SYSTEM ═══════════ */
let currentPlaylist = [];
let currentTrackIndex = 0;
let isPlayingAudio = false;
let isShuffle = false;
let isRepeat = false;
let currentLanguage = 'hindi';
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
let lastFetchedArtist = '';
let _lastSaveTick = 0;
let cacheDB = null;
let audioContextNode = null;
let wakeLockSentinel = null;
let silentLoopStarted = false;
let eqNodes = null;
let eqSourceNode = null;
let mainAudio = null;
let silentLoop = null;
