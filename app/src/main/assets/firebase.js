/* ═══════════════════════════════════════════════════════════════ */
/* VAULTIFY — FIREBASE CORE                                       */
/* Firebase init + shared utilities                                */
/* ═══════════════════════════════════════════════════════════════ */

const FIREBASE_CONFIG = {
  apiKey: "AIzaSyCQgQoJpV9FGhd8yY2_nklQICQMpZ5-1RY",
  authDomain: "vaultify-18865.firebaseapp.com",
  projectId: "vaultify-18865",
  storageBucket: "vaultify-18865.firebasestorage.app",
  messagingSenderId: "961290318010",
  appId: "1:961290318010:web:efa1e8c95c8d09c533d283"
};

const CREATOR_ROOT_EMAIL = "akshat594kumar@gmail.com";
const APP_VERSION = 1;
const VERSION_URL = "https://akshat594kumar-lang.github.io/vaultify/version.json";

let firebaseApp = null;
let firestoreDB = null;
let firebaseAuth = null;
let firebaseReady = false;

try {
  if (typeof firebase !== 'undefined') {
    firebaseApp = firebase.initializeApp(FIREBASE_CONFIG);
    firestoreDB = firebase.firestore();
    firebaseAuth = firebase.auth();
    firebaseReady = true;
    console.log('✅ Firebase initialized');
  } else {
    console.warn('⚠️ Firebase SDK not loaded');
  }
} catch (e) {
  console.error('Firebase init error:', e);
}

/* ═══════════ SHARED HELPERS ═══════════ */
function isFirebaseReady() {
  return firebaseReady && firestoreDB && firebaseAuth;
}

function isOwner() {
  return firebaseAuth && firebaseAuth.currentUser &&
         firebaseAuth.currentUser.email &&
         firebaseAuth.currentUser.email.toLowerCase() === CREATOR_ROOT_EMAIL.toLowerCase();
}

function getCurrentUser() {
  return firebaseAuth ? firebaseAuth.currentUser : null;
}

async function checkAppVersion() {
  if (!firestoreDB) return;
  try {
    const doc = await firestoreDB.collection('app_config').doc('version').get();
    if (doc.exists) {
      const data = doc.data();
      if (data.version && data.version > APP_VERSION) {
        if (typeof pushNotification === 'function') {
          pushNotification({
            title: '🎉 Update Available',
            message: data.message || 'New version available',
            icon: 'fa-solid fa-rocket',
            iconColor: '#fbbf24'
          });
        }
      }
    }
  } catch (e) {
    console.warn('Version check failed:', e);
  }
}

/* ═══════════ DEVICE ID (for IP tracking) ═══════════ */
function getDeviceId() {
  let deviceId = localStorage.getItem('vaultify_device_id');
  if (!deviceId) {
    deviceId = 'dev_' + Math.random().toString(36).substr(2, 16) + '_' + Date.now();
    localStorage.setItem('vaultify_device_id', deviceId);
  }
  return deviceId;
}

async function getPublicIP() {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const response = await fetch('https://api.ipify.org?format=json', {
      signal: controller.signal
    });
    clearTimeout(timeout);
    if (!response.ok) throw new Error('IP fetch failed');
    const data = await response.json();
    return data.ip;
  } catch (e) {
    console.warn('IP fetch error:', e);
    return null;
  }
}

/* ═══════════ EXPORT TO WINDOW ═══════════ */
window.FIREBASE_CONFIG = FIREBASE_CONFIG;
window.CREATOR_ROOT_EMAIL = CREATOR_ROOT_EMAIL;
window.APP_VERSION = APP_VERSION;
window.isFirebaseReady = isFirebaseReady;
window.isOwner = isOwner;
window.getCurrentUser = getCurrentUser;
window.checkAppVersion = checkAppVersion;
window.getDeviceId = getDeviceId;
window.getPublicIP = getPublicIP;
window.firebaseApp = firebaseApp;
window.firestoreDB = firestoreDB;
window.firebaseAuth = firebaseAuth;
