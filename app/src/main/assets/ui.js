/* ═══════════════════════════════════════════════════════════════ */
/* VAULTIFY — UI HELPERS                                           */
/* Toast, modals, nav tabs, format helpers                         */
/* ═══════════════════════════════════════════════════════════════ */

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
  return String(s).replace(/[&<>"']/g, x => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[x]));
}

function formatClock(sec) {
  const s = Math.floor(sec || 0);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r < 10 ? '0' : ''}${r}`;
}

function openModal(id) {
  const el = document.getElementById(id);
  if (el) el.classList.add('open');
}

function closeModal(id) {
  const el = document.getElementById(id);
  if (el) el.classList.remove('open');
}

function openFullPlayer() {
  document.getElementById('fullPlayerModal').classList.add('open');
}

function closeFullPlayer() {
  document.getElementById('fullPlayerModal').classList.remove('open');
}

function openPartnerModal() {
  if (typeof openPartnerPanel === 'function') {
    openPartnerPanel();
  } else {
    openModal('modalPartner');
  }
}

function openSupportModal() {
  openModal('modalSupport');
}

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

  if (th && navigationHistory[navigationHistory.length - 1] !== tab) {
    navigationHistory.push(tab);
  }

  if (tab === 'home' && typeof renderRecommendedSection === 'function') {
    setTimeout(renderRecommendedSection, 300);
  }
  if (tab === 'library' && typeof renderLibrary === 'function') {
    renderLibrary();
  }
  if (tab === 'profile' && typeof checkPermissionsStatus === 'function') {
    checkPermissionsStatus();
  }
}

function switchLibraryTab(tab, el) {
  window.currentLibraryTab = tab;
  document.querySelectorAll('#tabLibrary .nav-btn').forEach(p => p.classList.remove('active'));
  if (el) el.classList.add('active');
  if (typeof renderLibrary === 'function') renderLibrary();
}

function handleSystemBackPress() {
  const fp = document.getElementById('fullPlayerModal');
  if (fp && fp.classList.contains('open')) {
    closeFullPlayer();
    return true;
  }
  const om = document.querySelector('.modal-overlay.open');
  if (om) {
    om.classList.remove('open');
    return true;
  }
  const other = document.querySelectorAll('.view-screen.active:not(#tabHome)');
  if (other.length > 0) {
    switchNavTab('home');
    return true;
  }
  return false;
}
window.handleSystemBackPress = handleSystemBackPress;

function notify(title, message, icon, color) {
  if (typeof pushNotification === 'function') {
    pushNotification({
      title: title,
      message: message,
      icon: icon || 'fa-solid fa-bell',
      iconColor: color || 'var(--accent-neon)'
    });
  }
}

/* ═══════════ EXPORT TO WINDOW ═══════════ */
window.showToast = showToast;
window.escapeHtml = escapeHtml;
window.formatClock = formatClock;
window.openModal = openModal;
window.closeModal = closeModal;
window.openFullPlayer = openFullPlayer;
window.closeFullPlayer = closeFullPlayer;
window.openPartnerModal = openPartnerModal;
window.openSupportModal = openSupportModal;
window.switchNavTab = switchNavTab;
window.switchLibraryTab = switchLibraryTab;
window.notify = notify;
