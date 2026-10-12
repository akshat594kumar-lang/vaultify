/* ═══════════════════════════════════════════════════════════════ */
/* VAULTIFY — AUTH SYSTEM                                          */
/* Login, signup, profile, DP, logout                              */
/* Uses LOCALSTORAGE for account data (not Firebase Auth)           */
/* ═══════════════════════════════════════════════════════════════ */

const AUTH_ITERATIONS = 100000;
const AUTH_SALT_BYTES = 16;
const AUTH_KEY_BYTES = 32;

let isLoginMode = false;
let loggedInUser = null;

/* ═══════════ CRYPTO HELPERS ═══════════ */
function bytesToHex(bytes) {
  return Array.from(new Uint8Array(bytes)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function hexToBytes(hex) {
  const a = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) a[i / 2] = parseInt(hex.substr(i, 2), 16);
  return a;
}

function generateSalt() {
  const s = new Uint8Array(AUTH_SALT_BYTES);
  crypto.getRandomValues(s);
  return bytesToHex(s);
}

async function derivePasswordHash(password, saltHex) {
  try {
    const enc = new TextEncoder();
    const baseKey = await crypto.subtle.importKey('raw', enc.encode(password), { name: 'PBKDF2' }, false, ['deriveBits']);
    const salt = hexToBytes(saltHex);
    const bits = await crypto.subtle.deriveBits({
      name: 'PBKDF2',
      salt: salt,
      iterations: AUTH_ITERATIONS,
      hash: 'SHA-256'
    }, baseKey, AUTH_KEY_BYTES * 8);
    return bytesToHex(bits);
  } catch (e) {
    let h = password + '|' + saltHex;
    for (let i = 0; i < 50000; i++) h = btoa(h + password);
    return h;
  }
}

/* ═══════════ USER DB ═══════════ */
function getUserDB() {
  try {
    return JSON.parse(localStorage.getItem('vaultify_user_db') || '{}');
  } catch (e) {
    return {};
  }
}

function saveUserDB(db) {
  localStorage.setItem('vaultify_user_db', JSON.stringify(db));
}

function findUserByEmail(email) {
  const db = getUserDB();
  const el = String(email || '').trim().toLowerCase();
  if (!el) return null;
  for (const key in db) {
    if (db[key] && db[key].email && String(db[key].email).toLowerCase() === el) {
      return { key: key, user: db[key] };
    }
  }
  return null;
}

function findUserByUsername(username) {
  const db = getUserDB();
  const ul = String(username || '').trim().toLowerCase();
  if (!ul) return null;
  if (db[ul]) return { key: ul, user: db[ul] };
  return null;
}

/* ═══════════ VALIDATION ═══════════ */
function validateUsername(u) {
  if (!u || u.length < 3) return { ok: false, msg: 'Username must be at least 3 characters.' };
  if (u.length > 20) return { ok: false, msg: 'Username must be under 20 characters.' };
  if (!/^[a-z0-9_]+$/.test(u)) return { ok: false, msg: 'Only letters, numbers, _ allowed.' };
  return { ok: true };
}

function validateEmail(e) {
  if (!e || !e.trim()) return { ok: false, msg: 'Email is required.' };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) return { ok: false, msg: 'Please enter a valid email.' };
  return { ok: true };
}

function validatePassword(p) {
  if (!p || p.length < 8) return { ok: false, msg: 'Password must be at least 8 characters.' };
  if (!/[A-Za-z]/.test(p)) return { ok: false, msg: 'Password must include a letter.' };
  if (!/[0-9]/.test(p)) return { ok: false, msg: 'Password must include a number.' };
  return { ok: true };
}

/* ═══════════ AUTH MODAL HELPERS ═══════════ */
function showAuthError(msg) {
  const er = document.getElementById('authErrorAlert');
  const ok = document.getElementById('authSuccessAlert');
  if (ok) ok.style.display = 'none';
  if (er) { er.innerText = msg; er.style.display = 'block'; }
}

function showAuthSuccess(msg) {
  const er = document.getElementById('authErrorAlert');
  const ok = document.getElementById('authSuccessAlert');
  if (er) er.style.display = 'none';
  if (ok) { ok.innerText = msg; ok.style.display = 'block'; }
}

function hideAuthAlerts() {
  const er = document.getElementById('authErrorAlert');
  const ok = document.getElementById('authSuccessAlert');
  if (er) er.style.display = 'none';
  if (ok) ok.style.display = 'none';
}

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

/* ═══════════ AUTH GATE ═══════════ */
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
      window.loggedInUser = loggedInUser;
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
  if (authModal) {
    authModal.classList.remove('open');
    authModal.style.display = 'none';
  }
  document.body.classList.remove('auth-locked');
  if (mainFrame) mainFrame.style.pointerEvents = '';
}

/* ═══════════ PROCESS SUBMISSION ═══════════ */
async function processAuthSubmission() {
  hideAuthAlerts();

  const u = String(document.getElementById('authUsernameInput').value || '').trim().toLowerCase();
  const e = String(document.getElementById('authEmailInput').value || '').trim().toLowerCase();
  const p = document.getElementById('authPasswordInput').value || '';
  const dName = document.getElementById('authDisplayNameInput').value.trim();

  const vu = validateUsername(u);
  if (!vu.ok) return showAuthError(vu.msg);
  const ve = validateEmail(e);
  if (!ve.ok) return showAuthError(ve.msg);

  if (!isLoginMode) {
    const vp = validatePassword(p);
    if (!vp.ok) return showAuthError(vp.msg);
  } else {
    if (!p) return showAuthError('Password is required.');
  }

  const submitBtn = document.getElementById('authSubmitBtn');
  const originalText = submitBtn.innerText;
  submitBtn.innerText = 'Please wait...';
  submitBtn.disabled = true;

  try {
    if (isLoginMode) {
      let found = findUserByUsername(u);
      if (!found && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(u)) found = findUserByEmail(u);
      if (!found) { showAuthError("❌ This account doesn't exist."); return; }

      const user = found.user;
      if (String(user.email || '').toLowerCase() !== e) {
        showAuthError('❌ Email mismatch.');
        return;
      }
      const derived = await derivePasswordHash(p, user.salt || '');
      if (derived !== user.passwordHash) {
        showAuthError('❌ Invalid password.');
        return;
      }
      user.lastLogin = Date.now();
      const db = getUserDB();
      db[found.key] = user;
      saveUserDB(db);

      loggedInUser = user;
      window.loggedInUser = user;
      localStorage.setItem('vaultify_active_user', JSON.stringify(loggedInUser));
      showAuthSuccess('✅ Login successful!');
      setTimeout(() => {
        unlockApp();
        applyUserDataUI(loggedInUser);
        showToast(`Welcome back, ${loggedInUser.displayName || loggedInUser.username}!`);
        hideAuthAlerts();
      }, 500);
    } else {
      if (findUserByUsername(u)) { showAuthError('❌ Username already taken.'); return; }
      if (findUserByEmail(e)) { showAuthError('❌ This email is already registered.'); return; }

      const salt = generateSalt();
      const passwordHash = await derivePasswordHash(p, salt);
      const partnerCode = generatePartnerCode(u);

      const newUser = {
        username: u,
        email: e,
        displayName: dName || u,
        bio: '',
        passwordHash: passwordHash,
        salt: salt,
        avatar: '',
        partnerCode: partnerCode,
        createdAt: Date.now(),
        lastLogin: Date.now(),
        version: 3
      };

      const db = getUserDB();
      db[u] = newUser;
      saveUserDB(db);

      loggedInUser = newUser;
      window.loggedInUser = newUser;
      localStorage.setItem('vaultify_active_user', JSON.stringify(loggedInUser));
      showAuthSuccess('✅ Account created!');
      setTimeout(() => {
        unlockApp();
        applyUserDataUI(loggedInUser);
        showToast(`Welcome, ${loggedInUser.displayName}!`);
        hideAuthAlerts();
      }, 600);
    }
  } catch (err) {
    console.error(err);
    showAuthError('⚠️ Something went wrong.');
  } finally {
    submitBtn.innerText = originalText;
    submitBtn.disabled = false;
  }
}

/* ═══════════ APPLY USER DATA ═══════════ */
function applyUserDataUI(user) {
  if (!user) return;
  const editName = document.getElementById('editDisplayName');
  const editBio = document.getElementById('editBio');
  const avatar = document.getElementById('userAvatarImg');
  if (editName) editName.value = user.displayName || user.username;
  if (editBio) editBio.value = user.bio || '';
  if (avatar && user.avatar) avatar.src = user.avatar;
}

/* ═══════════ FORGOT PASSWORD ═══════════ */
function openForgotPasswordFlow() {
  closeModal('modalAuthGate');
  openModal('modalForgotPass');
}

async function executePasswordReset() {
  const u = document.getElementById('fpUsername').value.trim().toLowerCase();
  const e = document.getElementById('fpEmail').value.trim().toLowerCase();
  const p = document.getElementById('fpNewPassword').value;

  const vu = validateUsername(u); if (!vu.ok) return showToast(vu.msg);
  const ve = validateEmail(e); if (!ve.ok) return showToast(ve.msg);
  const vp = validatePassword(p); if (!vp.ok) return showToast(vp.msg);

  const found = findUserByUsername(u);
  if (!found) return showToast("❌ Account doesn't exist.");
  if (String(found.user.email || '').toLowerCase() !== e) return showToast('❌ Email mismatch.');

  const newSalt = generateSalt();
  const newHash = await derivePasswordHash(p, newSalt);
  const db = getUserDB();
  db[found.key].passwordHash = newHash;
  db[found.key].salt = newSalt;
  saveUserDB(db);

  closeModal('modalForgotPass');
  openModal('modalAuthGate');
  showToast('✅ Password updated!');
}

/* ═══════════ DP ═══════════ */
function triggerDpPicker() {
  const picker = document.getElementById('avatarPicker');
  if (picker) picker.click();
}

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
      if (db[loggedInUser.username]) {
        db[loggedInUser.username].avatar = b;
        saveUserDB(db);
      }
      localStorage.setItem('vaultify_active_user', JSON.stringify(loggedInUser));
    }
    showToast('✅ DP Updated!');
  };
  r.readAsDataURL(f);
  e.target.value = '';
}

/* ═══════════ PROFILE ═══════════ */
function saveProfileData() {
  if (!loggedInUser) return;
  const n = document.getElementById('editDisplayName').value.trim();
  if (!n) return showToast('Name required');
  const bio = (document.getElementById('editBio')?.value || '').trim();

  loggedInUser.displayName = n;
  loggedInUser.bio = bio;

  const db = getUserDB();
  if (db[loggedInUser.username]) {
    db[loggedInUser.username].displayName = n;
    db[loggedInUser.username].bio = bio;
    saveUserDB(db);
  }
  localStorage.setItem('vaultify_active_user', JSON.stringify(loggedInUser));
  applyUserDataUI(loggedInUser);
  showToast('Profile updated!');
}

/* ═══════════ LOGOUT ═══════════ */
function performAppLogout() {
  if (!confirm('Log out from this device?')) return;
  localStorage.removeItem('vaultify_active_user');
  location.reload();
}

/* ═══════════ PARTNER CODE ═══════════ */
function generatePartnerCode(username) {
  if (!username) return 'VAULT-XXXXXX';
  let hash = 0;
  const seed = username + '_vaultify_2026';
  for (let i = 0; i < seed.length; i++) {
    hash = ((hash << 5) - hash) + seed.charCodeAt(i);
    hash = hash & hash;
  }
  const code = Math.abs(hash).toString(36).toUpperCase().padStart(6, '0').slice(0, 6);
  return 'VAULT-' + code;
}

function changeAppLanguage(lang) {
  window.appLanguage = lang;
  localStorage.setItem('vaultify_app_lang', lang);
  showToast(lang === 'hi' ? 'हिंदी चुनी गई' : 'English Selected');
}

/* ═══════════ EXPORT TO WINDOW ═══════════ */
window.isLoginMode = isLoginMode;
window.loggedInUser = loggedInUser;
window.getUserDB = getUserDB;
window.saveUserDB = saveUserDB;
window.findUserByEmail = findUserByEmail;
window.findUserByUsername = findUserByUsername;
window.verifyAuthGate = verifyAuthGate;
window.unlockApp = unlockApp;
window.toggleAuthMode = toggleAuthMode;
window.processAuthSubmission = processAuthSubmission;
window.applyUserDataUI = applyUserDataUI;
window.openForgotPasswordFlow = openForgotPasswordFlow;
window.executePasswordReset = executePasswordReset;
window.triggerDpPicker = triggerDpPicker;
window.handleDpUpload = handleDpUpload;
window.saveProfileData = saveProfileData;
window.performAppLogout = performAppLogout;
window.generatePartnerCode = generatePartnerCode;
window.changeAppLanguage = changeAppLanguage;
window.showAuthError = showAuthError;
window.showAuthSuccess = showAuthSuccess;
window.hideAuthAlerts = hideAuthAlerts;
