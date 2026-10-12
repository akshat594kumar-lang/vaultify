/* ═══════════════════════════════════════════════════════════════ */
/* VAULTIFY — PARTNER MODE (2 USERS SYNC)                          */
/* Firestore collection: duo_sync/{code}                          */
/* ═══════════════════════════════════════════════════════════════ */

let partnerChannel = null;
let partnerListeners = [];
let myPartnerCode = null;
let partnerMode = 'idle'; // idle | hosting | joined

function generatePartnerCodeFromUser(username) {
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

function syncUserPartnerCode() {
  if (!loggedInUser) return;
  myPartnerCode = loggedInUser.partnerCode || generatePartnerCodeFromUser(loggedInUser.username);
  const el = document.getElementById('myPartnerCodeDisplay');
  if (el) el.innerText = myPartnerCode;
}

/* ═══════════ HOST A PARTNER SESSION ═══════════ */
async function hostPartnerSession() {
  if (!isFirebaseReady()) return showToast('Firebase not ready');
  if (!loggedInUser) return showToast('Login karo pehle');

  const code = myPartnerCode || generatePartnerCodeFromUser(loggedInUser.username);
  partnerMode = 'hosting';

  try {
    const docRef = firestoreDB.collection('duo_sync').doc(code);
    await docRef.set({
      host: {
        username: loggedInUser.username,
        displayName: loggedInUser.displayName || loggedInUser.username,
        avatar: loggedInUser.avatar || ''
      },
      guest: null,
      createdAt: Date.now(),
      lastUpdate: Date.now(),
      currentTrack: null,
      isPlaying: false,
      position: 0
    });

    showToast(`✅ Session started: ${code}`);
    listenPartnerSession(code);
  } catch (e) {
    console.error(e);
    showToast('❌ Session start failed');
  }
}

/* ═══════════ JOIN A PARTNER SESSION ═══════════ */
async function joinPartnerSession(code) {
  if (!isFirebaseReady()) return showToast('Firebase not ready');
  if (!loggedInUser) return showToast('Login karo pehle');
  if (!code) return showToast('Enter partner code');

  code = code.trim().toUpperCase();

  try {
    const docRef = firestoreDB.collection('duo_sync').doc(code);
    const doc = await docRef.get();

    if (!doc.exists) return showToast('❌ Code invalid');
    const data = doc.data();

    if (data.guest) return showToast('❌ Session already full');
    if (data.host && data.host.username === loggedInUser.username) {
      return showToast('❌ Yeh tumhara hi session hai');
    }

    await docRef.update({
      guest: {
        username: loggedInUser.username,
        displayName: loggedInUser.displayName || loggedInUser.username,
        avatar: loggedInUser.avatar || ''
      },
      joinedAt: Date.now(),
      lastUpdate: Date.now()
    });

    partnerMode = 'joined';
    showToast('✅ Joined!');
    listenPartnerSession(code);
  } catch (e) {
    console.error(e);
    showToast('❌ Join failed');
  }
}

/* ═══════════ LISTEN TO SESSION ═══════════ */
function listenPartnerSession(code) {
  if (!isFirebaseReady()) return;

  // Clear previous
  partnerListeners.forEach(unsub => {
    try { unsub(); } catch (e) {}
  });
  partnerListeners = [];

  const docRef = firestoreDB.collection('duo_sync').doc(code);

  const unsub = docRef.onSnapshot(doc => {
    if (!doc.exists) return;
    const data = doc.data();

    // Update UI
    updatePartnerUI(data);

    // Sync play state (only if not the one who changed it)
    if (data.lastUpdate && data.lastUpdate > (window._lastPartnerSync || 0)) {
      window._lastPartnerSync = data.lastUpdate;

      if (data.currentTrack && data.currentTrack.id !== (currentPlaylist[currentTrackIndex]?.id)) {
        // Partner changed track
        const track = data.currentTrack;
        if (!currentPlaylist.some(t => t.id === track.id)) {
          currentPlaylist.push(track);
        }
        const idx = currentPlaylist.findIndex(t => t.id === track.id);
        if (idx >= 0) {
          currentTrackIndex = idx;
          playTrack(idx, false);
        }
      }

      if (typeof data.isPlaying === 'boolean' && data.isPlaying !== isPlayingAudio) {
        if (data.isPlaying) {
          mainAudio.play().catch(() => {});
          setVisualState(true);
        } else {
          mainAudio.pause();
          setVisualState(false);
        }
      }
    }
  }, err => console.warn('Partner listener error:', err));

  partnerListeners.push(unsub);
}

/* ═══════════ SYNC TO PARTNER ═══════════ */
async function syncToPartner() {
  if (!partnerMode || partnerMode === 'idle') return;
  if (!myPartnerCode || !isFirebaseReady()) return;

  try {
    const track = currentPlaylist[currentTrackIndex];
    const docRef = firestoreDB.collection('duo_sync').doc(myPartnerCode);
    await docRef.update({
      currentTrack: track || null,
      isPlaying: isPlayingAudio,
      position: mainAudio.currentTime || 0,
      lastUpdate: Date.now(),
      lastSyncBy: loggedInUser ? loggedInUser.username : 'unknown'
    });
  } catch (e) {
    console.warn('Sync failed:', e);
  }
}

/* ═══════════ UI UPDATE ═══════════ */
function updatePartnerUI(data) {
  const status = document.getElementById('partnerStatusText');
  const host = document.getElementById('partnerHostName');
  const guest = document.getElementById('partnerGuestName');

  if (status) {
    if (data.guest) status.innerText = '🟢 Connected';
    else status.innerText = '🟡 Waiting for partner...';
  }
  if (host && data.host) host.innerText = data.host.displayName || data.host.username;
  if (guest) {
    guest.innerText = data.guest ? (data.guest.displayName || data.guest.username) : 'Waiting...';
  }
}

/* ═══════════ LEAVE SESSION ═══════════ */
async function leavePartnerSession() {
  if (!myPartnerCode || !isFirebaseReady()) {
    partnerMode = 'idle';
    return;
  }

  try {
    const docRef = firestoreDB.collection('duo_sync').doc(myPartnerCode);
    const doc = await docRef.get();
    if (!doc.exists) return;

    const data = doc.data();
    if (data.host && loggedInUser && data.host.username === loggedInUser.username) {
      // Host leaves → delete session
      await docRef.delete();
    } else if (data.guest && loggedInUser && data.guest.username === loggedInUser.username) {
      // Guest leaves → clear guest
      await docRef.update({ guest: null, lastUpdate: Date.now() });
    }
  } catch (e) {}

  partnerListeners.forEach(unsub => {
    try { unsub(); } catch (e) {}
  });
  partnerListeners = [];
  partnerMode = 'idle';
  myPartnerCode = null;
  showToast('Left partner session');
}

/* ═══════════ PANEL OPEN ═══════════ */
function openPartnerPanel() {
  syncUserPartnerCode();
  openModal('modalPartner');
}

/* ═══════════ AUTO SYNC ON PLAY ═══════════ */
function hookPartnerSync() {
  const origPlay = window.playTrack;
  window.playTrack = async function (index, broadcast) {
    await origPlay(index, broadcast);
    if (partnerMode !== 'idle') syncToPartner();
  };
  const origToggle = window.togglePlaybackState;
  window.togglePlaybackState = function (broadcast) {
    origToggle(broadcast);
    if (partnerMode !== 'idle') syncToPartner();
  };
}

/* ═══════════ EXPORT TO WINDOW ═══════════ */
window.hostPartnerSession = hostPartnerSession;
window.joinPartnerSession = joinPartnerSession;
window.syncToPartner = syncToPartner;
window.leavePartnerSession = leavePartnerSession;
window.openPartnerPanel = openPartnerPanel;
window.syncUserPartnerCode = syncUserPartnerCode;
window.generatePartnerCodeFromUser = generatePartnerCodeFromUser;

window.addEventListener('DOMContentLoaded', () => {
  setTimeout(hookPartnerSync, 2000);
});
