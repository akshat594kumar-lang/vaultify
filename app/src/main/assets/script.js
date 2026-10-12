/* ═══════════════════════════════════════════════════════════════ */
/* VAULTIFY — MAIN ENTRY                                            */
/* Boot, initialise everything, wire up remaining UI               */
/* ═══════════════════════════════════════════════════════════════ */

/* ═══════════ NOTIFICATION CENTER ═══════════ */
function getStoredNotifications() {
  return JSON.parse(localStorage.getItem('vaultify_notifications_list') || '[]');
}

function pushNotification(n) {
  const l = getStoredNotifications();
  l.unshift({
    ...n,
    id: Date.now(),
    time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    unread: true
  });
  if (l.length > 60) l.pop();
  localStorage.setItem('vaultify_notifications_list', JSON.stringify(l));
  renderNotificationCenter();
}

function renderNotificationCenter() {
  const list = getStoredNotifications();
  const container = document.getElementById('notificationListContainer');
  const badge = document.getElementById('notifBadgeCount');

  if (badge) {
    const unreadCount = list.filter(n => n.unread).length;
    if (unreadCount > 0) {
      badge.innerText = unreadCount;
      badge.style.display = 'flex';
    } else {
      badge.style.display = 'none';
    }
  }

  if (!container) return;

  if (list.length === 0) {
    container.innerHTML = `
      <div style="text-align:center;padding:40px 20px;color:var(--text-sub);">
        <i class="fa-solid fa-bell-slash" style="font-size:36px;margin-bottom:12px;opacity:0.5;"></i>
        <p style="font-size:13px;font-weight:600;">No notifications yet</p>
        <p style="font-size:11px;margin-top:4px;">We'll let you know when something new happens.</p>
      </div>`;
    return;
  }

  container.innerHTML = list.map(n => `
    <div style="display:flex;align-items:flex-start;gap:12px;padding:12px;margin-bottom:8px;background:${n.unread ? 'rgba(139,92,246,0.12)' : 'rgba(255,255,255,0.03)'};border:1px solid ${n.unread ? 'var(--accent-neon)' : 'var(--border)'};border-radius:14px;">
      <div style="width:38px;height:38px;border-radius:50%;background:${n.iconColor || 'var(--accent-neon)'}20;display:flex;align-items:center;justify-content:center;flex-shrink:0;">
        <i class="${n.icon || 'fa-solid fa-bell'}" style="color:${n.iconColor || 'var(--accent-neon)'};font-size:16px;"></i>
      </div>
      <div style="flex:1;min-width:0;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:2px;">
          <span style="font-size:13px;font-weight:700;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:70%;">${escapeHtml(n.title)}</span>
          <span style="font-size:10px;color:var(--text-sub);flex-shrink:0;margin-left:8px;">${n.time}</span>
        </div>
        <div style="font-size:11.5px;color:var(--text-sub);line-height:1.4;word-break:break-word;">${escapeHtml(n.message)}</div>
      </div>
      ${n.unread ? '<div style="width:8px;height:8px;border-radius:50%;background:var(--accent-neon);flex-shrink:0;margin-top:6px;"></div>' : ''}
    </div>
  `).join('');
}

function openNotificationModal() {
  const l = getStoredNotifications();
  l.forEach(n => n.unread = false);
  localStorage.setItem('vaultify_notifications_list', JSON.stringify(l));
  renderNotificationCenter();
  openModal('modalNotifications');
}

function clearAllNotifications() {
  localStorage.removeItem('vaultify_notifications_list');
  renderNotificationCenter();
  showToast('Cleared!');
}

/* ═══════════ PERMISSIONS ═══════════ */
function checkPermissionsStatus() {
  const banner = document.getElementById('permWarningBanner');
  const text = document.getElementById('permWarningText');
  const mic = document.getElementById('micPermStatus');
  const notif = document.getElementById('notifPermStatus');

  if (!window.AndroidNativeBridge) {
    if (banner) banner.classList.remove('show');
    return;
  }

  let missing = [];
  try {
    const hasMic = window.AndroidNativeBridge.hasMicPermission();
    const hasNotif = window.AndroidNativeBridge.hasNotificationPermission();
    if (mic) {
      mic.innerText = hasMic ? 'Granted' : 'Denied';
      mic.style.color = hasMic ? '#10b981' : '#ef4444';
    }
    if (notif) {
      notif.innerText = hasNotif ? 'Granted' : 'Denied';
      notif.style.color = hasNotif ? '#10b981' : '#ef4444';
    }
    if (!hasMic) missing.push('Microphone');
    if (!hasNotif) missing.push('Notifications');
  } catch (e) {}

  if (missing.length > 0 && banner && text) {
    text.innerText = `${missing.join(' & ')} permission needed. Tap to enable.`;
    banner.classList.add('show');
  } else if (banner) {
    banner.classList.remove('show');
  }
}

function handlePermissionBannerClick() {
  if (window.AndroidNativeBridge && window.AndroidNativeBridge.requestPermissions) {
    window.AndroidNativeBridge.requestPermissions();
  } else {
    showToast('Open Profile > Permissions to enable');
  }
}

function requestPermsFromNative() {
  if (window.AndroidNativeBridge && window.AndroidNativeBridge.requestPermissions) {
    window.AndroidNativeBridge.requestPermissions();
  } else {
    showToast('Open app settings');
  }
  setTimeout(checkPermissionsStatus, 800);
}

function openAppSettingsNative() {
  if (window.AndroidNativeBridge && window.AndroidNativeBridge.openAppSettings) {
    window.AndroidNativeBridge.openAppSettings();
  } else {
    showToast('Native settings not available');
  }
}

function openEqualizer() {
  if (window.AndroidNativeBridge && window.AndroidNativeBridge.openSystemEqualizer) {
    window.AndroidNativeBridge.openSystemEqualizer();
    showToast('🎚️ System EQ');
  } else {
    showToast('System EQ not available');
  }
}

window.onNativePermissionResult = function () {
  checkPermissionsStatus();
};

/* ═══════════ SUPPORT MAIL ═══════════ */
function sendSupportMail() {
  const n = document.getElementById('supName').value.trim() || (loggedInUser?.displayName || 'User');
  const e = document.getElementById('supEmail').value.trim() || (loggedInUser?.email || '');
  const m = document.getElementById('supMsg').value.trim();
  if (!m) return showToast('Message likho');

  const subject = `Vaultify Support - ${n}`;
  const body = `Name: ${n}\nEmail: ${e}\nUser: ${loggedInUser?.username || 'guest'}\n\nProblem:\n${m}`;
  const mailto = `mailto:akshat594kumar@gmail.com?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

  try {
    window.location.href = mailto;
    showToast('📧 Mail app khul raha hai');
  } catch (err) {
    navigator.clipboard.writeText(`To: akshat594kumar@gmail.com\n\n${body}`)
      .then(() => showToast('✅ Email copied'))
      .catch(() => showToast('❌ Failed'));
  }
}

/* ═══════════ EMOJI RUNNER ═══════════ */
let emojiMode = localStorage.getItem('vaultify_emoji_mode') || 'flow';
let emojiList = JSON.parse(localStorage.getItem('vaultify_emoji_list') || '["🐱","👻","🔥","🚀","⚡","💜","🎵"]');
let activeEmoji = localStorage.getItem('vaultify_active_emoji') || '🐱';
let currentEmojiIndex = 0;
let mixRafId = null;

function initEmojiRunner() {
  const i = document.getElementById('notchRunnerIcon');
  if (!i) return;
  i.classList.remove('mode-flow', 'mode-mix');

  if (emojiMode === 'mix') {
    i.classList.add('mode-mix');
    animateMixEmoji();
  } else {
    i.classList.add('mode-flow');
    if (mixRafId) {
      cancelAnimationFrame(mixRafId);
      mixRafId = null;
    }
    i.style.left = '';
    i.style.transform = '';
  }
  i.innerText = activeEmoji;
}

function animateMixEmoji() {
  if (mixRafId) cancelAnimationFrame(mixRafId);
  const i = document.getElementById('notchRunnerIcon');
  const n = document.querySelector('.notch-island');
  if (!i || !n) return;

  let p = 0, d = 1;
  const step = () => {
    if (emojiMode !== 'mix') {
      mixRafId = null;
      return;
    }
    const mx = n.clientWidth - 32;
    p += d * 0.8;
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
  r.innerHTML = emojiList.map(e =>
    `<div class="emoji-chip ${e === activeEmoji ? 'active' : ''}" data-emoji="${e}">${e}</div>`
  ).join('');
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
  initEmojiRunner();
}

/* ═══════════ UI TOGGLES ═══════════ */
function toggleAmbientMotion() {
  const e = document.getElementById('gradientFlowBg');
  const b = document.getElementById('gradientToggleBtn');
  const o = e.classList.toggle('disabled');
  b.innerText = o ? 'Disabled' : 'Enabled';
  showToast(`Motion ${o ? 'off' : 'on'}`);
}

function toggleRunnerVisibility() {
  const i = document.getElementById('notchRunnerIcon');
  const b = document.getElementById('runnerToggleBtn');
  const h = i.style.display === 'none';
  i.style.display = h ? '' : 'none';
  b.innerText = h ? 'Enabled' : 'Disabled';
  showToast(`Runner ${h ? 'on' : 'off'}`);
}

function applyThemeScheme(c) {
  document.body.className = '';
  if (c !== 'theme-violet') document.body.classList.add(c);
  localStorage.setItem('vaultify_theme', c);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = (c === 'theme-midnight-oled') ? '#000000' : (c === 'theme-royal-gold' ? '#d4af37' : '#8b5cf6');
  showToast(`Theme changed!`);
}

(function restoreTheme() {
  const saved = localStorage.getItem('vaultify_theme');
  if (saved && saved !== 'theme-violet') document.body.classList.add(saved);
})();

/* ═══════════ PARTNER UI WIRING ═══════════ */
function partnerHostBtnClick() {
  if (!loggedInUser) return showToast('Login karo pehle');
  hostPartnerSession();
}

function partnerJoinBtnClick() {
  const inp = document.getElementById('partnerJoinInput');
  if (!inp) return;
  const code = inp.value.trim();
  if (!code) return showToast('Enter partner code');
  joinPartnerSession(code);
}

/* ═══════════ TEAM UI WIRING ═══════════ */
function teamHostBtnClick() {
  if (!loggedInUser) return showToast('Login karo pehle');
  hostTeamSession();
}

function teamJoinBtnClick() {
  const inp = document.getElementById('teamJoinInput');
  if (!inp) return;
  const code = inp.value.trim();
  if (!code) return showToast('Enter team code');
  joinTeamSession(code);
}

/* ═══════════ IP DISPLAY ═══════════ */
function renderIPStats(stats) {
  const el = document.getElementById('ipStatsDisplay');
  if (!el || !stats) return;
  el.innerHTML = `
    <div style="font-size:11px;color:var(--text-sub);line-height:1.6">
      <div>🌐 Total IPs: <b style="color:#fff">${stats.totalIPs || 0}</b></div>
      <div>📱 Total devices: <b style="color:#fff">${stats.totalDevices || 0}</b></div>
      <div>🟢 Active 24h: <b style="color:#10b981">${stats.activeDevices24h || 0}</b></div>
    </div>
  `;
}

/* ═══════════ BOOT ═══════════ */
window.addEventListener('DOMContentLoaded', async () => {
  // 1. Firebase + Auth
  setTimeout(() => {
    if (typeof verifyAuthGate === 'function') verifyAuthGate();
  }, 100);

  // 2. IP Counter (after Firebase ready)
  setTimeout(() => {
    if (typeof initIPCounter === 'function' && typeof isFirebaseReady === 'function' && isFirebaseReady()) {
      initIPCounter();
      if (typeof listenIPStats === 'function') {
        listenIPStats(renderIPStats);
      }
    }
  }, 3000);

  // 3. App version check
  setTimeout(() => {
    if (typeof checkAppVersion === 'function') checkAppVersion();
  }, 4000);

  // 4. Partner + Team wiring
  setTimeout(() => {
    if (typeof syncUserPartnerCode === 'function') syncUserPartnerCode();
  }, 2000);

  // 5. Emoji runner
  setTimeout(() => {
    initEmojiRunner();
    initEmojiPicker();
    setEmojiMode(emojiMode);
  }, 1500);

  // 6. Notifications + permissions
  setTimeout(() => {
    renderNotificationCenter();
    checkPermissionsStatus();
  }, 1000);
  setInterval(checkPermissionsStatus, 5000);
});

/* ═══════════ EXPORT TO WINDOW ═══════════ */
window.pushNotification = pushNotification;
window.renderNotificationCenter = renderNotificationCenter;
window.openNotificationModal = openNotificationModal;
window.clearAllNotifications = clearAllNotifications;
window.checkPermissionsStatus = checkPermissionsStatus;
window.handlePermissionBannerClick = handlePermissionBannerClick;
window.requestPermsFromNative = requestPermsFromNative;
window.openAppSettingsNative = openAppSettingsNative;
window.openEqualizer = openEqualizer;
window.sendSupportMail = sendSupportMail;
window.initEmojiRunner = initEmojiRunner;
window.initEmojiPicker = initEmojiPicker;
window.addCustomEmoji = addCustomEmoji;
window.setEmojiMode = setEmojiMode;
window.toggleAmbientMotion = toggleAmbientMotion;
window.toggleRunnerVisibility = toggleRunnerVisibility;
window.applyThemeScheme = applyThemeScheme;
window.partnerHostBtnClick = partnerHostBtnClick;
window.partnerJoinBtnClick = partnerJoinBtnClick;
window.teamHostBtnClick = teamHostBtnClick;
window.teamJoinBtnClick = teamJoinBtnClick;
window.renderIPStats = renderIPStats;
window.checkAppVersion = checkAppVersion;
