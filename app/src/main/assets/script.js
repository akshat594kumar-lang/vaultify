/* ═══════════════════════════════════════════════════ */
/* PARTNER SYSTEM — Random Code + Search + Requests    */
/* ═══════════════════════════════════════════════════ */

// Har user ka unique partner code generate karo
function generatePartnerCode(username) {
  if (!username) return 'VAULT-XXXXXX';
  // Deterministic hash se 6-char code
  let hash = 0;
  const seed = username + '_vaultify_2026';
  for (let i = 0; i < seed.length; i++) {
    hash = ((hash << 5) - hash) + seed.charCodeAt(i);
    hash = hash & hash;
  }
  const code = Math.abs(hash).toString(36).toUpperCase().padStart(6, '0').slice(0, 6);
  return 'VAULT-' + code;
}

// User ke partner code ko sync karo
function syncUserPartnerCode() {
  if (!loggedInUser) return;
  const db = getUserDB();
  const user = db[loggedInUser.username];
  if (!user) return;
  if (!user.partnerCode) {
    user.partnerCode = generatePartnerCode(loggedInUser.username);
    db[loggedInUser.username] = user;
    saveUserDB(db);
    loggedInUser.partnerCode = user.partnerCode;
    localStorage.setItem('vaultify_active_user', JSON.stringify(loggedInUser));
  } else {
    loggedInUser.partnerCode = user.partnerCode;
  }
  const el = document.getElementById('myPartnerCodeDisplay');
  if (el) el.innerText = user.partnerCode;
}

// Partner search — username, display name, ya code se
function searchPartnerProfile() {
  const query = document.getElementById('partnerCodeInput').value.trim();
  if (!query) return showToast("Enter username or code");
  
  const db = getUserDB();
  const lq = query.toLowerCase();
  let found = null;
  let foundKey = null;
  
  // Search by exact username
  if (db[lq]) {
    found = db[lq];
    foundKey = lq;
  } else {
    // Search by display name (case-insensitive)
    for (const key in db) {
      const u = db[key];
      if (u.displayName && u.displayName.toLowerCase() === lq) {
        found = u;
        foundKey = key;
        break;
      }
    }
    // Search by partner code
    if (!found) {
      for (const key in db) {
        const u = db[key];
        if (u.partnerCode && u.partnerCode.toLowerCase() === query.toLowerCase()) {
          found = u;
          foundKey = key;
          break;
        }
      }
    }
  }
  
  if (!found) {
    const card = document.getElementById('partnerProfileCard');
    if (card) card.style.display = 'none';
    return showToast("❌ User not found");
  }
  
  if (found.username === loggedInUser.username) {
    return showToast("❌ Ye tumhari hi ID hai");
  }
  
  // Show profile card
  const card = document.getElementById('partnerProfileCard');
  if (!card) return;
  
  const avatarEl = document.getElementById('partnerAvatar');
  const nameEl = document.getElementById('partnerDisplayName');
  const userEl = document.getElementById('partnerUsername');
  const bioEl = document.getElementById('partnerBio');
  
  if (avatarEl) avatarEl.src = found.avatar || 'vaultify.png';
  if (nameEl) nameEl.innerText = found.displayName || found.username;
  if (userEl) userEl.innerText = '@' + found.username + ' · ' + (found.partnerCode || '');
  if (bioEl) bioEl.innerText = found.bio || 'No bio available.';
  
  // Connect button update
  const connectBtn = document.getElementById('partnerConnectBtn');
  if (connectBtn) {
    // Already connected?
    if (loggedInUser.partnerUsername === found.username) {
      connectBtn.innerHTML = '<i class="fa-solid fa-check"></i> Already Connected';
      connectBtn.style.background = 'linear-gradient(135deg,#10b981,#059669)';
      connectBtn.disabled = true;
    } else {
      connectBtn.innerHTML = '<i class="fa-solid fa-link"></i> Connect';
      connectBtn.style.background = 'linear-gradient(135deg,#ec4899,#a855f7)';
      connectBtn.disabled = false;
      connectBtn.onclick = () => sendPartnerRequest(found.username);
    }
  }
  
  card.style.display = 'block';
  card.dataset.targetUser = found.username;
  showToast(`✅ Found ${found.displayName || found.username}`);
}

// Partner request bhejo
function sendPartnerRequest(targetUsername) {
  if (!loggedInUser) return showToast("Login karo pehle");
  if (!targetUsername) return showToast("No target");
  
  const db = getUserDB();
  const target = db[targetUsername];
  if (!target) return showToast("❌ User not found");
  
  // Target ke inbox me request add karo
  if (!target.partnerRequests) target.partnerRequests = [];
  
  // Duplicate check
  if (target.partnerRequests.some(r => r.from === loggedInUser.username)) {
    return showToast("⏳ Request already sent");
  }
  
  target.partnerRequests.push({
    from: loggedInUser.username,
    fromName: loggedInUser.displayName || loggedInUser.username,
    fromAvatar: loggedInUser.avatar || '',
    timestamp: Date.now(),
    status: 'pending'
  });
  db[targetUsername] = target;
  saveUserDB(db);
  
  // Apne outgoing list me add karo
  if (!loggedInUser.partnerRequestsSent) loggedInUser.partnerRequestsSent = [];
  loggedInUser.partnerRequestsSent.push({
    to: targetUsername,
    timestamp: Date.now(),
    status: 'pending'
  });
  const myDb = getUserDB();
  myDb[loggedInUser.username] = loggedInUser;
  saveUserDB(myDb);
  localStorage.setItem('vaultify_active_user', JSON.stringify(loggedInUser));
  
  // Broadcast message (same device me)
  if (duoChannel) {
    duoChannel.postMessage({
      type: 'PARTNER_REQUEST',
      from: loggedInUser.username,
      fromName: loggedInUser.displayName || loggedInUser.username,
      fromAvatar: loggedInUser.avatar || '',
      to: targetUsername
    });
  }
  
  showToast(`✅ Request sent to ${target.displayName || target.username}`);
}

// Partner request accept karo
function acceptPartnerRequest(fromUsername) {
  if (!loggedInUser) return;
  const db = getUserDB();
  const me = db[loggedInUser.username];
  const from = db[fromUsername];
  if (!me || !from) return;
  
  // Dono ko partner bana do
  me.partnerUsername = fromUsername;
  me.partnerDisplayName = from.displayName || from.username;
  me.partnerAvatar = from.avatar || '';
  me.partnerCode = me.partnerCode || generatePartnerCode(loggedInUser.username);
  
  from.partnerUsername = loggedInUser.username;
  from.partnerDisplayName = me.displayName || me.username;
  from.partnerAvatar = me.avatar || '';
  from.partnerCode = from.partnerCode || generatePartnerCode(fromUsername);
  
  // Requests clear
  me.partnerRequests = (me.partnerRequests || []).filter(r => r.from !== fromUsername);
  from.partnerRequestsSent = (from.partnerRequestsSent || []).filter(r => r.to !== loggedInUser.username);
  
  db[loggedInUser.username] = me;
  db[fromUsername] = from;
  saveUserDB(db);
  loggedInUser = me;
  localStorage.setItem('vaultify_active_user', JSON.stringify(loggedInUser));
  
  pushNotification({
    title: '💕 Partner Connected',
    message: `${from.displayName || from.username} ke saath sync ready!`,
    icon: 'fa-solid fa-heart',
    iconColor: '#ec4899'
  });
  
  showToast(`💕 Connected with ${from.displayName || from.username}`);
  renderPartnerRequests();
  syncUserPartnerCode();
}

// Partner requests list render
function renderPartnerRequests() {
  const container = document.getElementById('partnerRequestsBox');
  if (!container) return;
  if (!loggedInUser) return;
  
  const db = getUserDB();
  const me = db[loggedInUser.username];
  if (!me || !me.partnerRequests || me.partnerRequests.length === 0) {
    container.innerHTML = '<p style="font-size:11px;color:var(--text-sub);text-align:center;padding:8px 0">No pending requests.</p>';
    return;
  }
  
  container.innerHTML = me.partnerRequests.filter(r => r.status === 'pending').map(r => `
    <div style="display:flex;align-items:center;gap:10px;padding:10px;background:rgba(236,72,153,.08);border:1px solid rgba(236,72,153,.3);border-radius:12px;margin-bottom:8px">
      <img src="${r.fromAvatar || 'vaultify.png'}" style="width:40px;height:40px;border-radius:50%;object-fit:cover;border:2px solid var(--partner-pink)" onerror="this.src='vaultify.png'" />
      <div style="flex:1;overflow:hidden">
        <div style="font-size:13px;font-weight:700;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escapeHtml(r.fromName)}</div>
        <div style="font-size:10.5px;color:#f9a8d4;margin-top:2px">wants to sync music with you</div>
      </div>
      <div style="display:flex;gap:6px">
        <button onclick="acceptPartnerRequest('${r.from}')" style="background:linear-gradient(135deg,#10b981,#059669);border:none;color:#fff;padding:6px 10px;border-radius:8px;font-size:11px;font-weight:700;cursor:pointer">
          <i class="fa-solid fa-check"></i>
        </button>
        <button onclick="declinePartnerRequest('${r.from}')" style="background:rgba(239,68,68,.15);border:1px solid #ef4444;color:#ef4444;padding:6px 10px;border-radius:8px;font-size:11px;font-weight:700;cursor:pointer">
          <i class="fa-solid fa-xmark"></i>
        </button>
      </div>
    </div>
  `).join('');
}

// Partner request decline
function declinePartnerRequest(fromUsername) {
  if (!loggedInUser) return;
  const db = getUserDB();
  const me = db[loggedInUser.username];
  if (!me) return;
  me.partnerRequests = (me.partnerRequests || []).filter(r => r.from !== fromUsername);
  db[loggedInUser.username] = me;
  saveUserDB(db);
  loggedInUser = me;
  localStorage.setItem('vaultify_active_user', JSON.stringify(loggedInUser));
  renderPartnerRequests();
  showToast('Request declined');
}

// Duo broadcast handler me partner request add karo
function handleDuoBroadcastMessage(e) {
  const d = e.data;
  if (!d) return;
  
  if (d.type === 'PARTNER_REQUEST') {
    // Same device — koi aur user request bheje
    if (loggedInUser && d.to === loggedInUser.username) {
      pushNotification({
        title: '💕 Partner Request',
        message: `${d.fromName} wants to sync music with you`,
        icon: 'fa-solid fa-heart',
        iconColor: '#ec4899'
      });
      renderPartnerRequests();
    }
  } else if (d.type === 'PARTNER_ACCEPTED') {
    if (loggedInUser && d.to === loggedInUser.username) {
      pushNotification({
        title: '💕 Partner Connected',
        message: `${d.fromName} accepted your request!`,
        icon: 'fa-solid fa-heart',
        iconColor: '#10b981'
      });
    }
  } else if (d.type === 'PARTNER_INVITE_REQ') {
    const my = loggedInUser ? `VAULT-${loggedInUser.username.toUpperCase()}` : 'VAULT-GUEST';
    if (d.targetCode === my) {
      pushNotification({
        title: 'Partner Invite',
        message: `${d.senderName} wants to sync!`,
        icon: 'fa-solid fa-heart',
        iconColor: 'var(--partner-pink)'
      });
      showToast(`Invite from ${d.senderName}!`);
    }
  } else if (d.type === 'DUO_CHAT') {
    const l = document.getElementById('duoChatLog');
    if (l) {
      l.innerHTML += `<div class="duo-chat-bubble partner"><strong>${escapeHtml(d.user)}:</strong> ${escapeHtml(d.text)}</div>`;
      l.scrollTop = l.scrollHeight;
    }
  } else if (d.type === 'SYNC_PLAY' && d.track) {
    currentPlaylist.splice(currentTrackIndex + 1, 0, d.track);
    renderHomeQueue();
    playTrack(currentTrackIndex + 1, false);
  } else if (d.type === 'SYNC_TOGGLE') {
    togglePlaybackState(false);
  }
}