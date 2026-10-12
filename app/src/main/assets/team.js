/* ═══════════════════════════════════════════════════════════════ */
/* VAULTIFY — TEAM MODE (2+ USERS SYNC)                            */
/* Firestore collection: team_sync/{code}                          */
/* ═══════════════════════════════════════════════════════════════ */

let teamChannel = null;
let teamListeners = [];
let myTeamCode = null;
let teamMode = 'idle'; // idle | hosting | joined
let teamMembers = [];

function generateTeamCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = 'TEAM-';
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

/* ═══════════ HOST A TEAM SESSION ═══════════ */
async function hostTeamSession() {
  if (!isFirebaseReady()) return showToast('Firebase not ready');
  if (!loggedInUser) return showToast('Login karo pehle');

  const code = generateTeamCode();
  myTeamCode = code;
  teamMode = 'hosting';

  try {
    const docRef = firestoreDB.collection('team_sync').doc(code);
    await docRef.set({
      host: {
        username: loggedInUser.username,
        displayName: loggedInUser.displayName || loggedInUser.username,
        avatar: loggedInUser.avatar || ''
      },
      members: [{
        username: loggedInUser.username,
        displayName: loggedInUser.displayName || loggedInUser.username,
        avatar: loggedInUser.avatar || '',
        joinedAt: Date.now(),
        isHost: true
      }],
      createdAt: Date.now(),
      lastUpdate: Date.now(),
      currentTrack: null,
      isPlaying: false,
      position: 0,
      maxMembers: 10
    });

    showToast(`✅ Team started: ${code}`);
    const codeEl = document.getElementById('myTeamCodeDisplay');
    if (codeEl) codeEl.innerText = code;

    listenTeamSession(code);
  } catch (e) {
    console.error(e);
    showToast('❌ Team start failed');
  }
}

/* ═══════════ JOIN A TEAM SESSION ═══════════ */
async function joinTeamSession(code) {
  if (!isFirebaseReady()) return showToast('Firebase not ready');
  if (!loggedInUser) return showToast('Login karo pehle');
  if (!code) return showToast('Enter team code');

  code = code.trim().toUpperCase();
  if (!code.startsWith('TEAM-')) code = 'TEAM-' + code;

  try {
    const docRef = firestoreDB.collection('team_sync').doc(code);
    const doc = await docRef.get();

    if (!doc.exists) return showToast('❌ Team code invalid');
    const data = doc.data();
    const members = data.members || [];

    if (members.length >= (data.maxMembers || 10)) {
      return showToast('❌ Team full');
    }

    if (members.some(m => m.username === loggedInUser.username)) {
      return showToast('❌ Already in team');
    }

    const newMember = {
      username: loggedInUser.username,
      displayName: loggedInUser.displayName || loggedInUser.username,
      avatar: loggedInUser.avatar || '',
      joinedAt: Date.now(),
      isHost: false
    };

    await docRef.update({
      members: members.concat([newMember]),
      lastUpdate: Date.now()
    });

    myTeamCode = code;
    teamMode = 'joined';
    showToast('✅ Joined team!');
    listenTeamSession(code);
  } catch (e) {
    console.error(e);
    showToast('❌ Join failed');
  }
}

/* ═══════════ LISTEN TO TEAM SESSION ═══════════ */
function listenTeamSession(code) {
  if (!isFirebaseReady()) return;

  teamListeners.forEach(unsub => {
    try { unsub(); } catch (e) {}
  });
  teamListeners = [];

  const docRef = firestoreDB.collection('team_sync').doc(code);

  const unsub = docRef.onSnapshot(doc => {
    if (!doc.exists) {
      showToast('Team closed');
      leaveTeamSession();
      return;
    }

    const data = doc.data();
    teamMembers = data.members || [];

    updateTeamUI(data);

    // Sync play state
    if (data.lastUpdate && data.lastUpdate > (window._lastTeamSync || 0)) {
      window._lastTeamSync = data.lastUpdate;

      if (data.currentTrack && data.currentTrack.id !== (currentPlaylist[currentTrackIndex]?.id)) {
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
  }, err => console.warn('Team listener error:', err));

  teamListeners.push(unsub);
}

/* ═══════════ SYNC TO TEAM ═══════════ */
async function syncToTeam() {
  if (!teamMode || teamMode === 'idle') return;
  if (!myTeamCode || !isFirebaseReady()) return;

  try {
    const track = currentPlaylist[currentTrackIndex];
    const docRef = firestoreDB.collection('team_sync').doc(myTeamCode);
    await docRef.update({
      currentTrack: track || null,
      isPlaying: isPlayingAudio,
      position: mainAudio.currentTime || 0,
      lastUpdate: Date.now(),
      lastSyncBy: loggedInUser ? loggedInUser.username : 'unknown'
    });
  } catch (e) {
    console.warn('Team sync failed:', e);
  }
}

/* ═══════════ UI UPDATE ═══════════ */
function updateTeamUI(data) {
  const countEl = document.getElementById('teamMemberCount');
  const listEl = document.getElementById('teamMembersList');

  const members = data.members || [];
  if (countEl) countEl.innerText = members.length;

  if (listEl) {
    listEl.innerHTML = members.map(m => `
      <div style="display:flex;align-items:center;gap:10px;padding:8px 10px;background:rgba(255,255,255,.04);border-radius:10px;margin-bottom:6px">
        <img src="${m.avatar || 'vaultify.png'}" style="width:32px;height:32px;border-radius:50%;object-fit:cover;border:1px solid var(--border)" onerror="this.src='vaultify.png'" />
        <div style="flex:1;overflow:hidden">
          <div style="font-size:12px;font-weight:700;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escapeHtml(m.displayName || m.username)}</div>
          ${m.isHost ? '<div style="font-size:9.5px;color:#fbbf24;margin-top:2px">👑 Host</div>' : '<div style="font-size:9.5px;color:var(--text-sub);margin-top:2px">Member</div>'}
        </div>
      </div>
    `).join('');
  }
}

/* ═══════════ LEAVE TEAM ═══════════ */
async function leaveTeamSession() {
  if (!myTeamCode || !isFirebaseReady()) {
    teamMode = 'idle';
    return;
  }

  try {
    const docRef = firestoreDB.collection('team_sync').doc(myTeamCode);
    const doc = await docRef.get();
    if (!doc.exists) return;

    const data = doc.data();
    const isHost = data.host && loggedInUser && data.host.username === loggedInUser.username;

    if (isHost) {
      // Host leaves → close whole team
      await docRef.delete();
    } else {
      // Member leaves → remove from list
      const members = (data.members || []).filter(m => m.username !== loggedInUser.username);
      await docRef.update({ members: members, lastUpdate: Date.now() });
    }
  } catch (e) {}

  teamListeners.forEach(unsub => {
    try { unsub(); } catch (e) {}
  });
  teamListeners = [];
  teamMode = 'idle';
  myTeamCode = null;
  showToast('Left team');
}

/* ═══════════ PANEL OPEN ═══════════ */
function openTeamPanel() {
  const codeEl = document.getElementById('myTeamCodeDisplay');
  if (codeEl && myTeamCode) codeEl.innerText = myTeamCode;
  openModal('modalTeam');
}

/* ═══════════ COPY TEAM CODE ═══════════ */
function copyTeamCode() {
  const el = document.getElementById('myTeamCodeDisplay');
  if (!el) return;
  const code = el.innerText;
  if (!code || code === 'TEAM-XXXXXX') return showToast('No code yet');
  navigator.clipboard.writeText(code).then(() => showToast('✅ Code copied!')).catch(() => showToast('Copy failed'));
}

/* ═══════════ HOOK SYNC ═══════════ */
function hookTeamSync() {
  const origPlay = window.playTrack;
  window.playTrack = async function (index, broadcast) {
    await origPlay(index, broadcast);
    if (teamMode !== 'idle') syncToTeam();
  };
  const origToggle = window.togglePlaybackState;
  window.togglePlaybackState = function (broadcast) {
    origToggle(broadcast);
    if (teamMode !== 'idle') syncToTeam();
  };
}

/* ═══════════ EXPORT TO WINDOW ═══════════ */
window.hostTeamSession = hostTeamSession;
window.joinTeamSession = joinTeamSession;
window.syncToTeam = syncToTeam;
window.leaveTeamSession = leaveTeamSession;
window.openTeamPanel = openTeamPanel;
window.copyTeamCode = copyTeamCode;
window.generateTeamCode = generateTeamCode;

window.addEventListener('DOMContentLoaded', () => {
  setTimeout(hookTeamSync, 2500);
});
