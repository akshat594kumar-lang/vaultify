/* ═══════════════════════════════════════════════════════════════════ */
/* VAULTIFY — Final Script (Integrated Local Python + Saavn + YT)      */
/* PART 1 OF 4: Initialization, Core States, IndexedDB, MediaSession   */
/* ═══════════════════════════════════════════════════════════════════ */

const CREATOR_ROOT_EMAIL = "akshat594kumar@gmail.com";
const LOCAL_PY_URL = "http://127.0.0.1:8080";
let isPythonEngineReady = false;
let audioContextNode = null, wakeLockSentinel = null, silentLoopStarted = false;

// Active Gateways
const PRIMARY_API_GATEWAYS = [
  'https://pipedapi.drgnz.club',
  'https://api.piped.privacydev.net',
  'https://piped-api.lunar.icu'
];

const INVIDIOUS_GATEWAYS = [
  'https://inv.tux.pizza',
  'https://invidious.nerdvpn.de',
  'https://invidious.private.coffee',
  'https://yt.drgnz.club',
  'https://invidious.jing.rocks'
];

const SAAVN_APIS = [
  'https://saavn.me',
  'https://jiosaavn-api-privatecvc2.vercel.app',
  'https://saavn-api-delta.vercel.app'
];

let cacheDB = null;
function initCacheDB(){
  return new Promise(resolve => {
    try {
      const req = indexedDB.open('vaultify_cache', 2);
      req.onupgradeneeded = e => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains('songs')) db.createObjectStore('songs', { keyPath: 'id' });
      };
      req.onsuccess = e => { cacheDB = e.target.result; resolve(cacheDB); };
      req.onerror = () => resolve(null);
    } catch(e) { resolve(null); }
  });
}

function cacheGet(id){
  return new Promise(res => {
    if(!cacheDB) return res(null);
    try {
      const rq = cacheDB.transaction('songs', 'readonly').objectStore('songs').get(id);
      rq.onsuccess = () => {
        const r = rq.result;
        if(!r) return res(null);
        try { if(r.blob instanceof Blob) r.url = URL.createObjectURL(r.blob); } catch(e){}
        res(r);
      };
      rq.onerror = () => res(null);
    } catch(e) { res(null); }
  });
}

function cachePut(id, blob, meta){
  return new Promise(res => {
    if(!cacheDB) return res(false);
    try {
      const tx = cacheDB.transaction('songs', 'readwrite');
      tx.objectStore('songs').put({ id, blob, title: meta.title, artist: meta.artist, cover: meta.cover, cachedAt: Date.now() });
      tx.oncomplete = () => res(true);
      tx.onerror = () => res(false);
    } catch(e) { res(false); }
  });
}

function cacheDelete(id){
  return new Promise(res => {
    if(!cacheDB) return res(false);
    try {
      const tx = cacheDB.transaction('songs', 'readwrite');
      tx.objectStore('songs').delete(id);
      tx.oncomplete = () => res(true);
      tx.onerror = () => res(false);
    } catch(e) { res(false); }
  });
}

function cacheAll(){
  return new Promise(res => {
    if(!cacheDB) return res([]);
    try {
      const rq = cacheDB.transaction('songs', 'readonly').objectStore('songs').getAll();
      rq.onsuccess = () => res(rq.result || []);
      rq.onerror = () => res([]);
    } catch(e) { res([]); }
  });
}

async function requestHardwareWakeLock(){
  try {
    if('wakeLock' in navigator && (!wakeLockSentinel || wakeLockSentinel.released)){
      wakeLockSentinel = await navigator.wakeLock.request('screen');
      wakeLockSentinel.addEventListener('release', () => { wakeLockSentinel = null; });
    }
  } catch(e){}
}

function initForegroundAudioBridge(){
  try {
    if(!audioContextNode) audioContextNode = new (window.AudioContext || window.webkitAudioContext)();
    if(audioContextNode.state === 'suspended') audioContextNode.resume();
    if(!audioContextNode._oscStarted){
      const osc = audioContextNode.createOscillator();
      const gain = audioContextNode.createGain();
      osc.frequency.value = 30;
      gain.gain.value = 0.0001;
      osc.connect(gain);
      gain.connect(audioContextNode.destination);
      osc.start();
      audioContextNode._oscStarted = true;
    }
  } catch(e){}
}

let activeHostIndex = 0, currentPlaylist = [], currentTrackIndex = 0, isPlayingAudio = false, isLoginMode = false, loggedInUser = null, isShuffle = false, isRepeat = false, isVideoCanvasActive = false, activeStreamEngine = 'direct', ytPlayer = null, ytPlayerReady = false;
let appLanguage = localStorage.getItem('vaultify_app_lang') || 'en';
let navigationHistory = ['home'];
let emojiMode = localStorage.getItem('vaultify_emoji_mode') || 'flow';
let emojiList = JSON.parse(localStorage.getItem('vaultify_emoji_list') || '["🐱","👻","🔥","🚀","⚡","💜","🎵"]');
let activeEmoji = localStorage.getItem('vaultify_active_emoji') || '🐱';
let currentEmojiIndex = 0, currentLibraryTab = 'history';
let playlists = JSON.parse(localStorage.getItem('vaultify_playlists') || '[]');
let likedSongs = JSON.parse(localStorage.getItem('vaultify_liked') || '[]');
const trackBlobCache = new Map();
let duoChannel = null;
try { duoChannel = new BroadcastChannel('vaultify_duo_sync'); duoChannel.onmessage = handleDuoBroadcastMessage; } catch(e){}
let searchHistoryList = JSON.parse(localStorage.getItem('vaultify_search_history') || '[]');
let playbackHistoryList = JSON.parse(localStorage.getItem('vaultify_playback_history') || '[]');
let isDraggingTimeline = false, mixRafId = null, _lastSaveTick = 0, autoMixFetching = false;
let lastAutoFetchTime = 0, lastFetchedArtist = '';

const mainAudio = document.getElementById('vaultifyAudio') || new Audio();
const silentLoop = document.getElementById('silentAudioLoop') || new Audio();

// In-App Background Python Server Warmup Listener
async function probeLocalPythonEngine(){
  for(let i = 0; i < 20; i++){
    try {
      const r = await fetch(`${LOCAL_PY_URL}/health`);
      if(r.ok){
        isPythonEngineReady = true;
        console.log("⚡ Local Python (yt-dlp) engine operational!");
        const intro = document.getElementById('appIntroScreen');
        if(intro) intro.classList.add('fade-out');
        return;
      }
    } catch(e){}
    await new Promise(res => setTimeout(res, 600));
  }
  const fallbackIntro = document.getElementById('appIntroScreen');
  if(fallbackIntro) fallbackIntro.classList.add('fade-out');
}

window.addEventListener('DOMContentLoaded', async () => {
  await initCacheDB();
  probeLocalPythonEngine();
  setTimeout(() => { const i = document.getElementById('appIntroScreen'); if(i) i.classList.add('fade-out'); }, 2000);
  initAudioWakeLoop(); syncLocalCatalog(); verifyAuthGate(); renderHomeRecentVault(); renderHomeQueue(); renderLibrary(); renderSearchHistoryTags();
  setupAndroidMediaSession(); setupTimelineDraggableEngine(); updateDynamicUserCounter(); renderNotificationCenter();
  initLiveSearchInputListener(); initEmojiRunner(); initEmojiPicker(); renderRecommendedSection();
  setTimeout(() => setEmojiMode(emojiMode), 100); checkBroadcastNotifications(); ensureMicPermission();
  renderWhatsNewBadge();
  window.addEventListener('popstate', () => { if(!handleSystemBackPress()){ navigationHistory.pop(); switchNavTab(navigationHistory[navigationHistory.length - 1] || 'home'); } });
});

function handleSystemBackPress(){
  const fp = document.getElementById('fullPlayerModal');
  if(fp && fp.classList.contains('open')){ closeFullPlayer(); return true; }
  const om = document.querySelector('.modal-overlay.open');
  if(om){ om.classList.remove('open'); return true; }
  const otherScreens = document.querySelectorAll('.view-screen.active:not(#tabHome)');
  if(otherScreens.length > 0){ switchNavTab('home'); return true; }
  return false;
}
window.handleSystemBackPress = handleSystemBackPress;

async function ensureMicPermission(){ try { const s = await navigator.mediaDevices.getUserMedia({ audio: true }); s.getTracks().forEach(t => t.stop()); } catch(e){} }

function initAudioWakeLoop(){
  silentLoop.src = "data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA";
  const start = () => { initForegroundAudioBridge(); requestHardwareWakeLock(); if(!silentLoopStarted){ silentLoop.play().catch(()=>{}); silentLoopStarted = true; } };
  document.body.addEventListener('touchstart', start, { once: true });
  document.body.addEventListener('click', start, { once: true });
  document.addEventListener('visibilitychange', () => {
    if(document.hidden && isPlayingAudio){
      if(activeStreamEngine === 'direct' && mainAudio.paused) mainAudio.play().catch(()=>{});
      else if(activeStreamEngine === 'yt_engine' && ytPlayerReady && ytPlayer){ try { ytPlayer.playVideo(); } catch(e){} }
    }
    if(!document.hidden && 'wakeLock' in navigator) requestHardwareWakeLock();
  });
}
setInterval(() => { if(!isPlayingAudio) return; _lastSaveTick += 1000; if(_lastSaveTick >= 10000){ _lastSaveTick = 0; savePlaybackState(); } }, 1000);

function showDownloadIndicator(text){ const i = document.getElementById('downloadIndicator'); if(!i) return; const t = document.getElementById('downloadText'); if(t) t.innerText = text; i.classList.add('show'); }
function hideDownloadIndicator(){ const i = document.getElementById('downloadIndicator'); if(i) i.classList.remove('show'); }

window.onYouTubeIframeAPIReady = function(){
  try {
    ytPlayer = new YT.Player('ytEngineSlot', {
      height: '10', width: '10', videoId: '',
      playerVars: { autoplay: 0, controls: 0, playsinline: 1 },
      events: {
        onReady: () => { ytPlayerReady = true; },
        onStateChange: onYTStateChange
      }
    });
  } catch(e){}
};

function onYTStateChange(e){
  if(e.data === YT.PlayerState.PLAYING) setVisualState(true);
  else if(e.data === YT.PlayerState.PAUSED) setVisualState(false);
  else if(e.data === YT.PlayerState.ENDED){ if(isRepeat) playTrack(currentTrackIndex); else playNext(); }
}

function setupAndroidMediaSession(){
  if('mediaSession' in navigator){
    try {
      navigator.mediaSession.setActionHandler('play', () => { onNativePlay(); });
      navigator.mediaSession.setActionHandler('pause', () => { onNativePause(); });
      navigator.mediaSession.setActionHandler('previoustrack', () => { onNativePrev(); });
      navigator.mediaSession.setActionHandler('nexttrack', () => { onNativeNext(); });
      navigator.mediaSession.setActionHandler('seekto', d => { if(d.seekTime !== undefined) seekAudioTo(d.seekTime); });
    } catch(e){}
  }
  mainAudio.addEventListener('ended', () => { if(isRepeat) playTrack(currentTrackIndex); else playNext(); });
  mainAudio.addEventListener('error', () => { if(currentPlaylist[currentTrackIndex]) fallbackToYouTubeBridge(currentPlaylist[currentTrackIndex].id); });
  mainAudio.addEventListener('timeupdate', () => {
    if(!mainAudio.duration || isDraggingTimeline) return;
    const pos = mainAudio.currentTime, dur = mainAudio.duration;
    const curEl = document.getElementById('labelCurrentTime');
    const durEl = document.getElementById('labelTotalDuration');
    const fill = document.getElementById('capsuleFill');
    const miniFill = document.getElementById('miniProgressFill');
    if(curEl) curEl.innerText = formatClock(pos);
    if(durEl) durEl.innerText = formatClock(dur);
    if(fill) fill.style.width = ((pos / dur) * 100) + '%';
    if(miniFill) miniFill.style.width = ((pos / dur) * 100) + '%';
  });
  mainAudio.addEventListener('loadedmetadata', () => {
    const durEl = document.getElementById('labelTotalDuration');
    if(durEl) durEl.innerText = formatClock(mainAudio.duration);
  });
}

window.onNativePlay = function(){
  if(activeStreamEngine === 'direct' && mainAudio.paused) mainAudio.play().catch(()=>{});
  else if(activeStreamEngine === 'yt_engine' && ytPlayerReady && ytPlayer){ try { ytPlayer.playVideo(); } catch(e){} }
  setVisualState(true);
};
window.onNativePause = function(){
  if(activeStreamEngine === 'direct') mainAudio.pause();
  else if(activeStreamEngine === 'yt_engine' && ytPlayerReady && ytPlayer){ try { ytPlayer.pauseVideo(); } catch(e){} }
  setVisualState(false);
};
window.onNativeNext = function(){ playNext(); };
window.onNativePrev = function(){ playPrevious(); };

function updateMediaSessionMetadata(track){
  if(!track) return;
  let cover = track.cover || 'vaultify.png';
  if(cover && !cover.startsWith('http') && !cover.startsWith('blob:') && !cover.startsWith('data:')){
    cover = window.location.origin + '/' + cover.replace(/^\.?\//, '');
  }

  if('mediaSession' in navigator){
    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: track.title || 'Unknown',
        artist: track.artist || 'Vaultify',
        album: 'Vaultify',
        artwork: [
          { src: cover, sizes: '96x96', type: 'image/jpeg' },
          { src: cover, sizes: '256x256', type: 'image/jpeg' },
          { src: cover, sizes: '512x512', type: 'image/jpeg' }
        ]
      });
      navigator.mediaSession.playbackState = isPlayingAudio ? 'playing' : 'paused';
    } catch(e){}
  }
  if(window.AndroidNativeBridge && window.AndroidNativeBridge.updateNotification){
    try { window.AndroidNativeBridge.updateNotification(track.title || 'Vaultify', track.artist || '', cover, isPlayingAudio); } catch(e){}
  }
}

function setupTimelineDraggableEngine(){
  const bar = document.getElementById('capsuleProgressBar');
  if(!bar) return;
  const getDuration = () => {
    if(activeStreamEngine === 'direct') return mainAudio.duration || 0;
    if(ytPlayerReady && ytPlayer && ytPlayer.getDuration) return ytPlayer.getDuration();
    return 0;
  };
  const updateUI = pct => {
    const fill = document.getElementById('capsuleFill');
    if(fill) fill.style.width = (pct * 100) + '%';
    const curEl = document.getElementById('labelCurrentTime');
    if(curEl) curEl.innerText = formatClock(pct * getDuration());
  };
  const getPct = x => {
    const r = bar.getBoundingClientRect();
    return Math.max(0, Math.min(1, (x - r.left) / r.width));
  };
  const doSeek = pct => {
    const dur = getDuration();
    if(dur <= 0) return;
    const t = pct * dur;
    if(activeStreamEngine === 'direct' && mainAudio.duration) mainAudio.currentTime = t;
    else if(ytPlayerReady && ytPlayer && ytPlayer.seekTo) ytPlayer.seekTo(t, true);
  };
  bar.addEventListener('pointerdown', e => { isDraggingTimeline = true; try { bar.setPointerCapture(e.pointerId); } catch(err){} updateUI(getPct(e.clientX)); });
  bar.addEventListener('pointermove', e => { if(isDraggingTimeline) updateUI(getPct(e.clientX)); });
  bar.addEventListener('pointerup', e => { if(!isDraggingTimeline) return; isDraggingTimeline = false; doSeek(getPct(e.clientX)); });
  bar.addEventListener('pointercancel', () => { isDraggingTimeline = false; });
  bar.addEventListener('click', e => { if(isDraggingTimeline) return; doSeek(getPct(e.clientX)); });
}
function seekAudioTo(s){
  if(activeStreamEngine === 'direct' && mainAudio.duration) mainAudio.currentTime = s;
  else if(ytPlayerReady && ytPlayer && ytPlayer.seekTo) ytPlayer.seekTo(s, true);
}

function toggleVideoCanvasView(){
  isVideoCanvasActive = !isVideoCanvasActive;
  const img = document.getElementById('fullArtImg');
  const v = document.getElementById('syncMutedVideoEngine');
  if(isVideoCanvasActive && currentPlaylist[currentTrackIndex]){
    const t = currentPlaylist[currentTrackIndex];
    img.style.display = 'none';
    if(t.id.startsWith('http') || t.id.startsWith('blob:')){
      v.style.display = 'block'; v.muted = true; v.src = t.id; v.currentTime = mainAudio.currentTime;
      if(isPlayingAudio) v.play().catch(()=>{});
    }
    showToast("Video Sync");
  } else {
    v.style.display = 'none'; v.pause(); v.src = ''; img.style.display = 'block';
    showToast("Audio Mode");
  }
}
/*═══════════════ END OF PART 1 ═══════════════ */
/* ═══════════════════════════════════════════════════════════════════ */
/* PART 2 OF 4: Search Engines & Resolution (Saavn + Python + Gateways) */
/* ═══════════════════════════════════════════════════════════════════ */

/* ═══════════════ SAAVN HELPERS ═══════════════ */
async function saavnSearch(q, limit = 20){
  const cleanQ = encodeURIComponent(q.trim());
  for(const base of SAAVN_APIS){
    try {
      const ctrl = new AbortController();
      const tm = setTimeout(() => ctrl.abort(), 5500);
      let r = await fetch(`${base}/api/search/songs?query=${cleanQ}&limit=${limit}`, { signal: ctrl.signal });
      if(!r.ok) r = await fetch(`${base}/search/songs?query=${cleanQ}&limit=${limit}`, { signal: ctrl.signal });
      clearTimeout(tm);
      if(!r.ok) continue;
      const d = await r.json();
      const results = d.data?.results || d.results || (Array.isArray(d.data) ? d.data : null);
      if(results && results.length) return results;
    } catch(e){}
  }
  return null;
}

async function saavnSongById(id){
  for(const base of SAAVN_APIS){
    try {
      const ctrl = new AbortController();
      const tm = setTimeout(() => ctrl.abort(), 6000);
      let r = await fetch(`${base}/api/songs/${id}`, { signal: ctrl.signal });
      if(!r.ok) r = await fetch(`${base}/songs?id=${id}`, { signal: ctrl.signal });
      clearTimeout(tm);
      if(!r.ok) continue;
      const d = await r.json();
      const s = (d.data && d.data[0]) || (Array.isArray(d.data) ? d.data[0] : null);
      if(s) return s;
    } catch(e){}
  }
  return null;
}

function saavnExtractDirect(s){
  if(!s) return null;
  const urls = s.downloadUrl || s.downloadUrls || [];
  if(!urls.length) return null;
  const sorted = urls.slice().sort((a,b) => (parseInt(b.quality) || 0) - (parseInt(a.quality) || 0));
  return sorted[0]?.url || sorted[0]?.link || null;
}
function decodeHtmlEntities(str){
  if(!str) return '';
  const ta = document.createElement('textarea');
  ta.innerHTML = str;
  return ta.value;
}

/* ═══════════════ LOCAL PYTHON EXTRACTOR ═══════════════ */
async function queryLocalPythonStream(query){
  if(!isPythonEngineReady) return null;
  try {
    const ctrl = new AbortController();
    const tm = setTimeout(() => ctrl.abort(), 9000);
    const r = await fetch(`${LOCAL_PY_URL}/stream?q=${encodeURIComponent(query)}`, { signal: ctrl.signal });
    clearTimeout(tm);
    if(r.ok){
      const data = await r.json();
      if(data && data.url){
        return {
          id: data.id || 'py_' + Date.now(),
          title: data.title || query,
          artist: data.artist || 'Artist',
          cover: data.cover || 'vaultify.png',
          duration: data.duration || 0,
          source: 'local_python',
          _directStream: data.url
        };
      }
    }
  } catch(e){
    console.warn("Local Python extraction timeout or error:", e);
  }
  return null;
}

/* ═══════════════ PARALLEL SEARCH ═══════════════ */
async function searchSaavn(q){
  try {
    const results = await saavnSearch(q, 20);
    if(!results?.length) return [];
    return results.map(s => {
      const direct = saavnExtractDirect(s);
      return {
        id: 'saavn_' + s.id,
        title: decodeHtmlEntities(s.name || s.title || 'Unknown'),
        artist: (s.artists?.primary?.map(a => a.name).join(', ')) || s.primaryArtists || 'Unknown',
        cover: s.image?.[2]?.url || s.image?.[1]?.url || '',
        duration: s.duration || 0,
        source: 'saavn',
        _directStream: direct
      };
    });
  } catch(e){ return []; }
}

async function searchPiped(q){
  const promises = PRIMARY_API_GATEWAYS.map(async h => {
    try {
      const ctrl = new AbortController();
      const tm = setTimeout(() => ctrl.abort(), 4000);
      const r = await fetch(`${h}/search?q=${encodeURIComponent(q)}&filter=music_songs`, { signal: ctrl.signal });
      clearTimeout(tm);
      if(!r.ok) return null;
      const d = await r.json();
      if(!d.items?.length) return null;
      return d.items.filter(i => i.type === 'stream').map(i => ({
        id: i.url.replace('/watch?v=', ''),
        title: i.title,
        artist: i.uploaderName || 'Artist',
        cover: i.thumbnail,
        duration: i.duration || 0,
        source: 'youtube'
      }));
    } catch(e){ return null; }
  });
  const results = await Promise.allSettled(promises);
  for(const r of results){
    if(r.status === 'fulfilled' && r.value && r.value.length > 0) return r.value;
  }
  return [];
}

async function searchInvidious(q){
  for(const h of INVIDIOUS_GATEWAYS){
    try {
      const ctrl = new AbortController();
      const tm = setTimeout(() => ctrl.abort(), 4500);
      const r = await fetch(`${h}/api/v1/search?q=${encodeURIComponent(q)}&type=video`, { signal: ctrl.signal });
      clearTimeout(tm);
      if(!r.ok) continue;
      const d = await r.json();
      if(Array.isArray(d) && d.length){
        return d.slice(0, 20).map(v => ({
          id: v.videoId,
          title: v.title,
          artist: v.author || 'Artist',
          cover: `https://i.ytimg.com/vi/${v.videoId}/mqdefault.jpg`,
          duration: v.lengthSeconds || 0,
          source: 'youtube'
        }));
      }
    } catch(e){}
  }
  return [];
}

// Multi-engine search prioritizer
async function executeLiveSearch(isAuto = false){
  const q = document.getElementById('mobileSearchField').value.trim();
  if(!q) return;

  if(!isAuto && !searchHistoryList.includes(q)){
    searchHistoryList.unshift(q);
    if(searchHistoryList.length > 8) searchHistoryList.pop();
    localStorage.setItem('vaultify_search_history', JSON.stringify(searchHistoryList));
    renderSearchHistoryTags();
  }

  const l = document.getElementById('searchLoadingIndicator');
  const rc = document.getElementById('searchResultsContainer');

  l.style.display = 'block';
  l.innerHTML = '<i class="fa-solid fa-spinner fa-spin" style="font-size:24px;margin-bottom:8px"></i><div>Searching local python & cloud...</div>';

  const startTime = Date.now();
  const results = await Promise.allSettled([
    searchSaavn(q),
    searchInvidious(q),
    searchPiped(q)
  ]);

  const allResults = [];
  results.forEach(r => {
    if(r.status === 'fulfilled' && r.value && r.value.length > 0) allResults.push(...r.value);
  });

  const seen = new Set();
  const uniqueResults = [];
  allResults.forEach(t => {
    const key = (t.title || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    if(key && !seen.has(key)){
      seen.add(key);
      uniqueResults.push(t);
    }
  });

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  l.style.display = 'none';

  if(uniqueResults.length > 0){
    renderSearchResults(uniqueResults.slice(0, 30));
    if(!isAuto) showToast(`✅ ${uniqueResults.length} tracks (${elapsed}s)`);
    setTimeout(renderRecommendedSection, 2000);
  } else {
    rc.innerHTML = '<p style="font-size:13px;color:var(--text-sub);text-align:center;padding:18px 0">Kuch nahi mila. Try different keywords.</p>';
  }
}

function renderSearchResults(tracks){
  const c = document.getElementById('searchResultsContainer');
  c.innerHTML = tracks.map(t => {
    const src = t.source || 'youtube';
    const srcIcon = { youtube: 'fa-brands fa-youtube', saavn: 'fa-solid fa-music', local_python: 'fa-brands fa-python' }[src] || 'fa-solid fa-music';
    const srcColor = { youtube: '#ef4444', saavn: '#10b981', local_python: '#38bdf8' }[src] || 'var(--accent-neon)';
    const safeId = encodeURIComponent(t.id), safeTitle = encodeURIComponent(t.title || '');
    const safeArtist = encodeURIComponent(t.artist || ''), safeCover = encodeURIComponent(t.cover || 'vaultify.png');
    const safeDirect = t._directStream ? encodeURIComponent(t._directStream) : '';
    return `<div class="song-tile" onclick="playSearchedTrackImmediately('${safeId}','${safeTitle}','${safeArtist}','${safeCover}','${safeDirect}')">
      <div class="tile-left">
        <img src="${t.cover || 'vaultify.png'}" class="tile-thumb" onerror="this.src='vaultify.png'" />
        <div class="tile-meta">
          <h4>${escapeHtml(t.title)}</h4>
          <p><i class="${srcIcon}" style="color:${srcColor};font-size:10px;margin-right:4px"></i>${escapeHtml(t.artist)}</p>
        </div>
      </div>
      <i class="fa-solid fa-play" style="color:var(--accent-neon);font-size:15px"></i>
    </div>`;
  }).join('');
}

function playSearchedTrackImmediately(idEnc, title, artist, cover, directEnc){
  const id = decodeURIComponent(idEnc);
  const t = { id, title: decodeURIComponent(title), artist: decodeURIComponent(artist), cover: decodeURIComponent(cover) };
  const realDirect = directEnc ? decodeURIComponent(directEnc) : '';
  if(realDirect) t._directStream = realDirect;
  const existingIdx = currentPlaylist.findIndex(x => x.id === t.id);
  if(existingIdx >= 0){ currentTrackIndex = existingIdx; renderHomeQueue(); playTrack(existingIdx); return; }
  currentPlaylist.splice(currentTrackIndex + 1, 0, t);
  renderHomeQueue();
  playTrack(currentTrackIndex + 1);
}

function renderSearchHistoryTags(){
  const b = document.getElementById('searchHistoryBox'); const tb = document.getElementById('searchHistoryTags');
  if(!b) return;
  if(searchHistoryList.length === 0){ b.style.display = 'none'; return; }
  b.style.display = 'block';
  tb.innerHTML = searchHistoryList.map(tag => `<span style="font-size:11px;background:rgba(255,255,255,.06);padding:5px 10px;border-radius:10px;border:1px solid var(--border);cursor:pointer" onclick="document.getElementById('mobileSearchField').value='${escapeHtml(tag).replace(/'/g, "\\'")}';executeLiveSearch();">${escapeHtml(tag)}</span>`).join('');
}
function clearSearchHistory(){ searchHistoryList = []; localStorage.removeItem('vaultify_search_history'); renderSearchHistoryTags(); renderRecommendedSection(); }
/* ═══════════════ END OF PART 2 ═══════════════ */
/* ═══════════════════════════════════════════════════════════════════ */
/* PART 3 OF 4: Playback Engine, Python Stream Failover & Queue System  */
/* ═══════════════════════════════════════════════════════════════════ */

async function fetchDirectAudioStreamUrl(input, title = '', artist = ''){
  if(!input) return null;
  if(input.startsWith('saavn_')){
    const id = input.replace('saavn_', '');
    const s = await saavnSongById(id);
    const direct = saavnExtractDirect(s);
    if(direct) return direct;
  }
  if(input.startsWith('blob:') || input.startsWith('data:')) return input;

  // Local Python yt-dlp first preference for instant extraction
  if(isPythonEngineReady && (title || /^[a-zA-Z0-9_-]{11}$/.test(input))){
    const pyExtract = await queryLocalPythonStream(title ? `${title} ${artist}` : input);
    if(pyExtract && pyExtract._directStream) return pyExtract._directStream;
  }

  if(/^[a-zA-Z0-9_-]{11}$/.test(input)){
    const inv = await fetchFromInvidious(input); if(inv) return inv;
    const piped = await fetchFromPiped(input); if(piped) return piped;
  }
  return null;
}

async function fetchFromPiped(vid){
  for(let a = 0; a < PRIMARY_API_GATEWAYS.length; a++){
    const h = PRIMARY_API_GATEWAYS[(activeHostIndex + a) % PRIMARY_API_GATEWAYS.length];
    try {
      const ctrl = new AbortController(); const tm = setTimeout(() => ctrl.abort(), 4000);
      const r = await fetch(`${h}/streams/${vid}`, { signal: ctrl.signal }); clearTimeout(tm);
      if(r.ok){
        const d = await r.json();
        if(d.audioStreams?.length){
          const best = d.audioStreams.sort((a,b) => (b.bitrate || 0) - (a.bitrate || 0))[0];
          if(best?.url){ activeHostIndex = PRIMARY_API_GATEWAYS.indexOf(h); return best.url; }
        }
      }
    } catch(e){}
  }
  return null;
}

async function fetchFromInvidious(vid){
  for(const h of INVIDIOUS_GATEWAYS){
    try {
      const ctrl = new AbortController(); const tm = setTimeout(() => ctrl.abort(), 4500);
      const r = await fetch(`${h}/api/v1/videos/${vid}`, { signal: ctrl.signal }); clearTimeout(tm);
      if(!r.ok) continue;
      const d = await r.json();
      const af = (d.adaptiveFormats || []).filter(f => f.type?.includes('audio'));
      af.sort((a,b) => (b.bitrate || 0) - (a.bitrate || 0));
      if(af[0]?.url) return af[0].url;
    } catch(e){}
  }
  return null;
}

// Master Play Engine
async function playTrack(index, broadcast = true){
  if(index < 0 || index >= currentPlaylist.length) return;
  currentTrackIndex = index;
  const track = currentPlaylist[index];
  syncPlayerUI(track); updateMediaSessionMetadata(track); logPlaybackHistory(track); renderHomeRecentVault();
  showToast(`Playing: ${(track.title || '').slice(0, 26)}`);

  setTimeout(() => initForegroundAudioBridge(), 0);
  setTimeout(() => requestHardwareWakeLock(), 0);
  if(!silentLoopStarted){ silentLoop.play().catch(()=>{}); silentLoopStarted = true; }
  if(broadcast && duoChannel) duoChannel.postMessage({ type: 'SYNC_PLAY', track });

  let streamUrl = null;
  if(track._directStream && track._directStream.startsWith('http')) streamUrl = track._directStream;
  if(!streamUrl){ const c = trackBlobCache.get(track.id); if(c && c.startsWith('blob:')) streamUrl = c; }
  if(!streamUrl){ const dbCached = await cacheGet(track.id); if(dbCached && dbCached.url){ streamUrl = dbCached.url; trackBlobCache.set(track.id, streamUrl); } }
  if(!streamUrl) streamUrl = await fetchDirectAudioStreamUrl(track.id, track.title, track.artist);

  // Agar direct stream nahi mili, local python ya youtube bridge
  if(!streamUrl){
    if(track.id.startsWith('saavn_')){
      const cleanTitle = (track.title || '').replace(/[\(\[].*?[\)\]]/g, '').trim();
      const cleanQuery = `${cleanTitle} ${track.artist || ''} audio`;

      // Check Local Python Server
      if(isPythonEngineReady){
        const pyResult = await queryLocalPythonStream(cleanQuery);
        if(pyResult && pyResult._directStream){
          mainAudio.src = pyResult._directStream;
          mainAudio.load();
          await mainAudio.play();
          setVisualState(true);
          return;
        }
      }

      const ytResults = await searchInvidious(cleanQuery);
      if(ytResults.length && ytResults[0].id){
        fallbackToYouTubeBridge(ytResults[0].id);
        return;
      }
    }
    fallbackToYouTubeBridge(track.id);
    return;
  }

  activeStreamEngine = 'direct';
  try { if(ytPlayerReady && ytPlayer && ytPlayer.stopVideo) ytPlayer.stopVideo(); } catch(e){}
  mainAudio.src = streamUrl;
  mainAudio.load();

  try {
    await mainAudio.play();
    setVisualState(true);
    setTimeout(() => cacheTrackInBackground(track), 10000);
  } catch(e){
    fallbackToYouTubeBridge(track.id);
  }
}

function fallbackToYouTubeBridge(vid){
  if(!vid) { showToast('❌ Audio bridge unavailable'); return; }
  let targetId = vid;
  if(targetId.startsWith('saavn_')) return;

  activeStreamEngine = 'yt_engine';
  try { mainAudio.pause(); } catch(e){}
  if(ytPlayerReady && ytPlayer && ytPlayer.loadVideoById){
    ytPlayer.loadVideoById(targetId);
    ytPlayer.playVideo();
    setVisualState(true);
    showToast("▶ YouTube Audio Engine");
  } else {
    showToast("Connecting audio bridge...");
  }
}

function togglePlaybackState(broadcast = true){
  if(activeStreamEngine === 'direct'){
    if(mainAudio.paused){ initForegroundAudioBridge(); requestHardwareWakeLock(); mainAudio.play().then(() => setVisualState(true)).catch(()=>{}); }
    else { mainAudio.pause(); setVisualState(false); }
  } else {
    if(ytPlayerReady && ytPlayer){
      try {
        const s = ytPlayer.getPlayerState();
        if(s === YT.PlayerState.PLAYING){ ytPlayer.pauseVideo(); setVisualState(false); }
        else { ytPlayer.playVideo(); setVisualState(true); }
      } catch(e){}
    }
  }
  if(broadcast && duoChannel) duoChannel.postMessage({ type: 'SYNC_TOGGLE' });
}

function setVisualState(playing){
  isPlayingAudio = playing;
  if(playing) requestHardwareWakeLock();
  const mi = document.getElementById('miniPlayIcon'); if(mi) mi.className = playing ? 'fa-solid fa-pause' : 'fa-solid fa-play';
  const fi = document.getElementById('fullPlayIcon'); if(fi) fi.className = playing ? 'fa-solid fa-pause' : 'fa-solid fa-play';
  if('mediaSession' in navigator) navigator.mediaSession.playbackState = playing ? 'playing' : 'paused';
  const t = currentPlaylist[currentTrackIndex];
  if(t && window.AndroidNativeBridge && window.AndroidNativeBridge.updateNotification){
    try { window.AndroidNativeBridge.updateNotification(t.title || 'Vaultify', t.artist || '', t.cover || '', playing); } catch(e){}
  }
  if(document.getElementById('modalQueueDrawer')?.classList.contains('open')) renderHomeQueue();
}

async function playNext(){
  if(currentPlaylist.length === 0) return;
  const remaining = currentPlaylist.length - currentTrackIndex - 1;
  if(remaining === 0){
    const currentTrack = currentPlaylist[currentTrackIndex];
    showToast('🔄 Loading similar songs...');
    autoMixFetching = false;
    const related = await fetchRelatedSongs(currentTrack);
    if(related.length){ related.forEach(t => currentPlaylist.push(t)); renderHomeQueue(); }
    else { showToast('❌ No more songs'); return; }
  }
  if(isShuffle) currentTrackIndex = Math.floor(Math.random() * currentPlaylist.length);
  else currentTrackIndex = (currentTrackIndex + 1) % currentPlaylist.length;
  playTrack(currentTrackIndex);
}

function playPrevious(){
  if(currentPlaylist.length === 0) return;
  currentTrackIndex = (currentTrackIndex - 1 + currentPlaylist.length) % currentPlaylist.length;
  playTrack(currentTrackIndex);
}

function syncPlayerUI(track){
  const els = { miniTitleText: track.title, miniArtistText: track.artist, notchTrackTitle: track.title, fullTitleText: track.title, fullArtistText: track.artist };
  for(const id in els){ const el = document.getElementById(id); if(el) el.innerText = els[id]; }
  const miniArt = document.getElementById('miniArtImg'); if(miniArt) miniArt.src = track.cover || 'vaultify.png';
  const fullArt = document.getElementById('fullArtImg'); if(fullArt) fullArt.src = track.cover || 'vaultify.png';
  const hb = document.getElementById('fullHeartBtn');
  if(hb){
    const isLiked = likedSongs.some(s => s.id === track.id);
    hb.className = isLiked ? 'fa-solid fa-heart' : 'fa-regular fa-heart';
    hb.style.color = isLiked ? 'var(--partner-pink)' : 'inherit';
  }
}

function toggleShuffle(){ isShuffle = !isShuffle; const el = document.getElementById('fullShuffleBtn'); if(el) el.style.color = isShuffle ? 'var(--accent-neon)' : 'inherit'; showToast(isShuffle ? "Shuffle On" : "Shuffle Off"); }
function toggleRepeat(){ isRepeat = !isRepeat; const el = document.getElementById('fullRepeatBtn'); if(el) el.style.color = isRepeat ? 'var(--accent-neon)' : 'inherit'; showToast(isRepeat ? "Repeat On" : "Repeat Off"); }
function toggleSleepTimer(){ showToast("Sleep 30 Min"); setTimeout(() => { if(isPlayingAudio) togglePlaybackState(); }, 30 * 60 * 1000); }

function shareCurrentTrack(){
  if(currentPlaylist.length === 0) return;
  const t = currentPlaylist[currentTrackIndex];
  if(navigator.share) navigator.share({ title: t.title, text: `Listening to ${t.title} on Vaultify` }).catch(()=>{});
  else {
    try { navigator.clipboard.writeText(`🎵 ${t.title} - ${t.artist}`); showToast("Copied link!"); } catch(e){ showToast("Share not supported"); }
  }
}

async function cacheTrackInBackground(track){
  if(!track || track.id.startsWith('saavn_') || track.id.startsWith('blob:')) return;
  if(trackBlobCache.has(track.id)) return;
  const existing = await cacheGet(track.id);
  if(existing?.url){ trackBlobCache.set(track.id, existing.url); return; }
  const url = await fetchDirectAudioStreamUrl(track.id, track.title, track.artist);
  if(!url || !url.startsWith('http')) return;
  try {
    const r = await fetch(url); const blob = await r.blob();
    await cachePut(track.id, blob, { title: track.title, artist: track.artist, cover: track.cover });
    trackBlobCache.set(track.id, URL.createObjectURL(blob));
  } catch(e){}
}

async function downloadCurrentTrack(){
  if(currentPlaylist.length === 0) return showToast("No track selected!");
  const t = currentPlaylist[currentTrackIndex];
  showDownloadIndicator('Downloading...');
  try {
    let u = trackBlobCache.get(t.id) || t._directStream;
    if(!u || !u.startsWith('blob:')) u = u || await fetchDirectAudioStreamUrl(t.id, t.title, t.artist);
    if(!u) throw new Error("No URL");
    const r = await fetch(u); const b = await r.blob(); const bu = URL.createObjectURL(b);
    const a = document.createElement('a'); a.style.display = 'none'; a.href = bu;
    a.download = `${(t.title || 'track').replace(/[^a-zA-Z0-9 ]/g, '')}.mp3`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    hideDownloadIndicator(); showToast("✅ Downloaded!");
  } catch(e){ hideDownloadIndicator(); showToast("❌ Download failed"); }
}

async function fetchRelatedSongs(seedTrack){
  if(!seedTrack) return [];
  const now = Date.now();
  if(now - lastAutoFetchTime < 8000) return [];
  lastAutoFetchTime = now;
  let artist = (seedTrack.artist || '').replace(/vevo|official|records|channel|music|topic/gi, '').trim();
  const q = artist && artist.length > 2 ? `${artist} songs` : `${seedTrack.title || 'trending'} songs`;
  const existingIds = new Set(currentPlaylist.map(t => t.id));
  let results = [];
  try {
    const saavnResults = await saavnSearch(q, 15);
    if(saavnResults?.length){
      results = saavnResults.map(s => {
        const direct = saavnExtractDirect(s);
        return {
          id: 'saavn_' + s.id,
          title: decodeHtmlEntities(s.name || s.title || 'Unknown'),
          artist: (s.artists?.primary?.map(a => a.name).join(', ')) || s.primaryArtists || 'Unknown',
          cover: s.image?.[2]?.url || s.image?.[1]?.url || '',
          duration: s.duration || 0,
          source: 'saavn',
          _directStream: direct
        };
      }).filter(t => !existingIds.has(t.id));
    }
  } catch(e){}
  return results.slice(0, 8);
}
/* ═══════════════ END OF PART 3 ═══════════════ */
/* ═══════════════════════════════════════════════════════════════════ */
/* PART 4 OF 4: Auth Gate, Duo Broadcast, UI Runners, Profile & Export */
/* ═══════════════════════════════════════════════════════════════════ */

async function requestMicAndListen(){
  const b = document.getElementById('voiceMicTrigger');
  try { const s = await navigator.mediaDevices.getUserMedia({ audio: true }); s.getTracks().forEach(t => t.stop()); }
  catch(e){ return showToast("Mic permission denied!"); }
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if(!SR) return showToast("Voice recognition not supported.");
  const r = new SR();
  r.lang = appLanguage === 'hi' ? 'hi-IN' : 'en-US';
  r.interimResults = false;
  r.onstart = () => { if(b) b.classList.add('recording'); showToast("Listening..."); };
  r.onresult = e => {
    const v = e.results[0][0].transcript;
    document.getElementById('mobileSearchField').value = v;
    showToast(`Heard: "${v}"`);
    executeLiveSearch();
  };
  r.onerror = () => { if(b) b.classList.remove('recording'); };
  r.onend = () => { if(b) b.classList.remove('recording'); };
  r.start();
}

let liveSearchDebounceTimer = null;
function initLiveSearchInputListener(){
  const f = document.getElementById('mobileSearchField');
  if(!f) return;
  f.addEventListener('input', () => {
    clearTimeout(liveSearchDebounceTimer);
    const q = f.value.trim();
    if(q.length >= 3){
      liveSearchDebounceTimer = setTimeout(() => {
        if(f.value.trim() === q) executeLiveSearch(true);
      }, 2500);
    }
  });
  f.addEventListener('keydown', e => {
    if(e.key === 'Enter'){
      clearTimeout(liveSearchDebounceTimer);
      e.preventDefault();
      executeLiveSearch(false);
    }
  });
}

function logPlaybackHistory(track){
  playbackHistoryList = playbackHistoryList.filter(t => t.id !== track.id);
  playbackHistoryList.unshift(track);
  if(playbackHistoryList.length > 20) playbackHistoryList.pop();
  localStorage.setItem('vaultify_playback_history', JSON.stringify(playbackHistoryList));
  if(currentLibraryTab === 'history') renderLibrary();
}

function renderHomeRecentVault(){
  const c = document.getElementById('homeRecentGrid');
  if(!c) return;
  const r = playbackHistoryList.slice(0, 6);
  if(r.length === 0){
    c.innerHTML = `<div style="grid-column:span 2;font-size:12.5px;color:var(--text-sub);text-align:center;padding:16px 0;background:rgba(255,255,255,.03);border-radius:14px;border:1px dashed var(--border)">No recently played songs.</div>`;
    return;
  }
  c.innerHTML = r.map(t => {
    const safeId = encodeURIComponent(t.id), safeTitle = encodeURIComponent(t.title || '');
    const safeArtist = encodeURIComponent(t.artist || ''), safeCover = encodeURIComponent(t.cover || '');
    return `<div class="history-card" onclick="playSingleTrackObject('${safeId}','${safeTitle}','${safeArtist}','${safeCover}')">
      <div class="history-art"><img src="${t.cover || 'vaultify.png'}" onerror="this.src='vaultify.png'" /></div>
      <div class="history-card-meta">
        <div class="history-card-title">${escapeHtml(t.title)}</div>
        <div class="history-card-artist">${escapeHtml(t.artist)}</div>
      </div>
    </div>`;
  }).join('');
}

function playSingleTrackObject(idEnc, title, artist, cover){
  const id = decodeURIComponent(idEnc);
  const t = { id, title: decodeURIComponent(title), artist: decodeURIComponent(artist), cover: decodeURIComponent(cover) };
  const existingIdx = currentPlaylist.findIndex(x => x.id === t.id);
  if(existingIdx >= 0){ currentTrackIndex = existingIdx; renderHomeQueue(); playTrack(existingIdx); return; }
  currentPlaylist.splice(currentTrackIndex + 1, 0, t);
  renderHomeQueue();
  playTrack(currentTrackIndex + 1);
}

async function renderRecommendedSection(){
  const c = document.getElementById('recommendedContainer');
  if(!c) return;
  let q = "trending songs 2026 hindi";
  if(playbackHistoryList.length > 0 && playbackHistoryList[0].artist){
    q = `${playbackHistoryList[0].artist} hit songs`;
  }
  const saavnResults = await saavnSearch(q, 10);
  if(!saavnResults || !saavnResults.length){
    c.innerHTML = `<p style="font-size:11.5px;color:var(--text-sub);text-align:center;padding:10px 0">Listen to tracks to personalize recommendations.</p>`;
    return;
  }
  const found = saavnResults.map(s => {
    const direct = saavnExtractDirect(s);
    return {
      id: 'saavn_' + s.id,
      title: decodeHtmlEntities(s.name || ''),
      artist: (s.artists?.primary?.map(a => a.name).join(', ')) || 'Unknown',
      cover: s.image?.[2]?.url || '',
      source: 'saavn',
      _directStream: direct
    };
  }).slice(0, 6);

  c.innerHTML = found.map(t => {
    const safeId = encodeURIComponent(t.id), safeTitle = encodeURIComponent(t.title || '');
    const safeArtist = encodeURIComponent(t.artist || ''), safeCover = encodeURIComponent(t.cover || '');
    const safeDirect = t._directStream ? encodeURIComponent(t._directStream) : '';
    return `<div class="song-tile" onclick="playSearchedTrackImmediately('${safeId}','${safeTitle}','${safeArtist}','${safeCover}','${safeDirect}')">
      <div class="tile-left">
        <img src="${t.cover || 'vaultify.png'}" class="tile-thumb" onerror="this.src='vaultify.png'" />
        <div class="tile-meta">
          <h4>${escapeHtml(t.title)}</h4>
          <p>${escapeHtml(t.artist)}</p>
        </div>
      </div>
      <i class="fa-solid fa-play" style="color:var(--accent-neon);font-size:13px"></i>
    </div>`;
  }).join('');
}

function renderHomeQueue(){
  const el = document.getElementById('homeQueueContainer'); const c = document.getElementById('queueCountSubtitle');
  if(c) c.innerText = `${currentPlaylist.length} tracks`;
  if(!el) return;
  if(currentPlaylist.length === 0){ el.innerHTML = `<div style="font-size:12px;color:var(--text-sub);text-align:center;padding:12px 0">Queue is empty.</div>`; return; }
  let h = '';
  const np = currentPlaylist[currentTrackIndex];
  const un = currentPlaylist.slice(currentTrackIndex + 1, currentTrackIndex + 20);
  if(np){ h += `<div style="font-size:10px;text-transform:uppercase;letter-spacing:1.5px;font-weight:700;margin:12px 0 6px;color:var(--accent-neon)">▶ Now Playing</div>`; h += renderQueueTile(np, currentTrackIndex, true); }
  if(un.length > 0){ h += `<div style="font-size:10px;text-transform:uppercase;letter-spacing:1.5px;font-weight:700;margin:12px 0 6px;color:var(--text-sub)">🎵 Up Next (${un.length})</div>`; un.forEach((t, i) => { h += renderQueueTile(t, currentTrackIndex + 1 + i, false); }); }
  el.innerHTML = h;
}

function renderQueueTile(t, i, ic){
  const isCached = trackBlobCache.has(t.id);
  return `<div class="song-tile ${ic ? 'playing' : ''}" onclick="playTrack(${i});closeModal('modalQueueDrawer');">
    <div class="tile-left">
      <img src="${t.cover || 'vaultify.png'}" class="tile-thumb" onerror="this.src='vaultify.png'" />
      <div class="tile-meta">
        <h4>${escapeHtml(t.title)}${isCached ? ' <i class="fa-solid fa-check-circle" style="color:#10b981;font-size:10px"></i>' : ''}</h4>
        <p>${escapeHtml(t.artist)}</p>
      </div>
    </div>
    <i class="${ic && isPlayingAudio ? 'fa-solid fa-volume-high' : 'fa-solid fa-play'}" style="color:var(--accent-neon);font-size:13px"></i>
  </div>`;
}

function switchNavTab(tab, th = true){
  document.querySelectorAll('.view-screen').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  const m = { home: { s: 'tabHome', b: 'tabBtnHome' }, search: { s: 'tabSearch', b: 'tabBtnSearch' }, library: { s: 'tabLibrary', b: 'tabBtnLibrary' }, cert: { s: 'tabCert', b: 'tabBtnCert' }, profile: { s: 'tabProfile', b: 'tabBtnProfile' } };
  const sel = m[tab] || m.home;
  const sEl = document.getElementById(sel.s); if(sEl) sEl.classList.add('active');
  const bEl = document.getElementById(sel.b); if(bEl) bEl.classList.add('active');
  if(th && navigationHistory[navigationHistory.length - 1] !== tab) navigationHistory.push(tab);
  if(tab === 'home') setTimeout(renderRecommendedSection, 300);
  if(tab === 'library') renderLibrary();
}

function openFullPlayer(){ document.getElementById('fullPlayerModal').classList.add('open'); }
function closeFullPlayer(){ document.getElementById('fullPlayerModal').classList.remove('open'); }
function openModal(id){ const el = document.getElementById(id); if(el) el.classList.add('open'); }
function closeModal(id){ const el = document.getElementById(id); if(el) el.classList.remove('open'); }
function openPartnerModal(){ syncUserPartnerCode(); renderPartnerRequests(); openModal('modalPartner'); }
function openSupportModal(){ openModal('modalSupport'); }
function formatClock(sec){ const s = Math.floor(sec || 0); const m = Math.floor(s / 60); const r = s % 60; return `${m}:${r < 10 ? '0' : ''}${r}`; }
function showToast(msg){ const t = document.getElementById('toastPill'); if(!t) return; t.innerText = msg; t.classList.add('show'); clearTimeout(t._tt); t._tt = setTimeout(() => t.classList.remove('show'), 2500); }
function escapeHtml(s){ return String(s).replace(/[&<>"']/g, x => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[x])); }

function sendSupportMail(){
  const n = document.getElementById('supName').value.trim() || (loggedInUser?.displayName || 'User');
  const e = document.getElementById('supEmail').value.trim() || (loggedInUser?.email || '');
  const m = document.getElementById('supMsg').value.trim();
  if(!m) return showToast('Message likho pehle');
  const subject = `Vaultify Support - ${n}`;
  const body = `Name: ${n}\nEmail: ${e}\nUser: ${loggedInUser?.username || 'guest'}\n\nProblem:\n${m}`;
  const mailtoUrl = `mailto:akshat594kumar@gmail.com?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  try {
    window.location.href = mailtoUrl;
    pushNotification({ title: 'Support', message: 'Mail app open ho raha hai...', icon: 'fa-solid fa-headset', iconColor: '#10b981' });
    showToast('📧 Mail app khul raha hai');
  } catch(err){
    navigator.clipboard.writeText(`To: akshat594kumar@gmail.com\n\n${body}`);
    showToast('📧 Support details copied');
  }
}

async function savePlaybackState(){
  try {
    if(!currentPlaylist[currentTrackIndex]) return;
    const t = currentPlaylist[currentTrackIndex];
    const pos = activeStreamEngine === 'direct' ? mainAudio.currentTime : 0;
    localStorage.setItem('vaultify_playback_state', JSON.stringify({ wasPlaying: isPlayingAudio, lastTrackId: t.id, lastTrackTitle: t.title, lastTrackArtist: t.artist, lastTrackCover: t.cover, lastPosition: Math.floor(pos * 1000), lastIndex: currentTrackIndex, playlistJson: JSON.stringify(currentPlaylist.slice(0, 50)), timestamp: Date.now() }));
  } catch(e){}
}
window.addEventListener('beforeunload', savePlaybackState);
window.addEventListener('pagehide', savePlaybackState);

function switchLibraryTab(tab, el){
  currentLibraryTab = tab;
  document.querySelectorAll('#tabLibrary .nav-btn').forEach(p => p.classList.remove('active'));
  if(el) el.classList.add('active');
  renderLibrary();
}

async function renderLibrary(){
  const c = document.getElementById('libraryContent');
  if(!c) return;
  if(currentLibraryTab === 'history'){
    if(playbackHistoryList.length === 0){ c.innerHTML = `<p style="font-size:13px;color:var(--text-sub);text-align:center;padding:18px 0">No history yet.</p>`; return; }
    c.innerHTML = playbackHistoryList.map(t => {
      const safeId = encodeURIComponent(t.id), safeTitle = encodeURIComponent(t.title || '');
      const safeArtist = encodeURIComponent(t.artist || ''), safeCover = encodeURIComponent(t.cover || '');
      return `<div class="song-tile" onclick="playSingleTrackObject('${safeId}','${safeTitle}','${safeArtist}','${safeCover}')">
        <div class="tile-left"><img src="${t.cover || 'vaultify.png'}" class="tile-thumb" onerror="this.src='vaultify.png'" /><div class="tile-meta"><h4>${escapeHtml(t.title)}</h4><p>${escapeHtml(t.artist)}</p></div></div>
        <i class="fa-solid fa-play" style="color:var(--accent-neon);font-size:13px"></i>
      </div>`;
    }).join('');
  } else if(currentLibraryTab === 'liked'){
    if(likedSongs.length === 0){ c.innerHTML = `<p style="font-size:13px;color:var(--text-sub);text-align:center;padding:18px 0">No liked songs yet.</p>`; return; }
    c.innerHTML = likedSongs.map(t => {
      const safeId = encodeURIComponent(t.id), safeTitle = encodeURIComponent(t.title || '');
      const safeArtist = encodeURIComponent(t.artist || ''), safeCover = encodeURIComponent(t.cover || '');
      return `<div class="song-tile" onclick="playSingleTrackObject('${safeId}','${safeTitle}','${safeArtist}','${safeCover}')">
        <div class="tile-left"><img src="${t.cover || 'vaultify.png'}" class="tile-thumb" onerror="this.src='vaultify.png'" /><div class="tile-meta"><h4>${escapeHtml(t.title)}</h4><p>${escapeHtml(t.artist)}</p></div></div>
        <i class="fa-solid fa-heart" style="color:var(--partner-pink);font-size:14px" onclick="event.stopPropagation();unlikeSong('${t.id.replace(/'/g, "\\'")}')"></i>
      </div>`;
    }).join('');
  } else if(currentLibraryTab === 'playlists'){
    let html = `<div style="background:var(--bg-card);border:1px solid var(--border);border-radius:14px;padding:12px;margin-bottom:10px;display:flex;align-items:center;gap:12px;cursor:pointer" onclick="openModal('modalAddToPlaylist')">
      <div style="width:56px;height:56px;border-radius:10px;background:linear-gradient(135deg,var(--accent),var(--accent-neon));display:flex;align-items:center;justify-content:center;font-size:24px;color:#fff;flex-shrink:0"><i class="fa-solid fa-plus"></i></div>
      <div style="flex:1"><div style="font-size:14px;font-weight:700;color:#fff">Create New Playlist</div><div style="font-size:11px;color:var(--text-sub);margin-top:2px">Organize your songs</div></div>
    </div>`;
    html += playlists.map((p, i) => `<div style="background:var(--bg-card);border:1px solid var(--border);border-radius:14px;padding:12px;margin-bottom:10px;display:flex;align-items:center;gap:12px;cursor:pointer" onclick="openPlaylist(${i})">
      <div style="width:56px;height:56px;border-radius:10px;background:linear-gradient(135deg,var(--accent),var(--accent-neon));display:flex;align-items:center;justify-content:center;font-size:24px;color:#fff;flex-shrink:0"><i class="fa-solid fa-list"></i></div>
      <div style="flex:1;overflow:hidden"><div style="font-size:14px;font-weight:700;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escapeHtml(p.name)}</div><div style="font-size:11px;color:var(--text-sub);margin-top:2px">${p.songs.length} songs</div></div>
      <i class="fa-solid fa-trash" style="color:#ef4444;font-size:14px" onclick="event.stopPropagation();deletePlaylist(${i})"></i>
    </div>`).join('');
    c.innerHTML = html;
  } else if(currentLibraryTab === 'cached'){
    const cached = await cacheAll();
    if(cached.length === 0){ c.innerHTML = `<p style="font-size:13px;color:var(--text-sub);text-align:center;padding:18px 0">No cached songs yet.</p>`; return; }
    let totalSize = 0; cached.forEach(t => { try { if(t.blob && t.blob.size) totalSize += t.blob.size; } catch(e){} });
    c.innerHTML = `<div style="font-size:11px;color:var(--text-sub);margin-bottom:8px"><i class="fa-solid fa-database"></i> ${cached.length} songs · ~${(totalSize / (1024 * 1024)).toFixed(1)}MB</div>`;
    c.innerHTML += cached.map(t => `<div class="song-tile" onclick="playCached('${t.id.replace(/'/g, "\\'")}')">
      <div class="tile-left"><img src="${t.cover || 'vaultify.png'}" class="tile-thumb" onerror="this.src='vaultify.png'" /><div class="tile-meta"><h4>${escapeHtml(t.title || 'Unknown')}</h4><p>${escapeHtml(t.artist || '')}</p></div></div>
      <i class="fa-solid fa-trash" style="color:#ef4444;font-size:13px" onclick="event.stopPropagation();removeCache('${t.id.replace(/'/g, "\\'")}')"></i>
    </div>`).join('');
  }
}

async function playCached(id){
  const c = await cacheGet(id);
  if(c && c.url){
    const t = { id, title: c.title, artist: c.artist, cover: c.cover, _directStream: c.url };
    const idx = currentPlaylist.findIndex(x => x.id === t.id);
    if(idx >= 0){ currentTrackIndex = idx; renderHomeQueue(); playTrack(idx); return; }
    currentPlaylist.splice(currentTrackIndex + 1, 0, t);
    renderHomeQueue();
    playTrack(currentTrackIndex + 1);
  }
}

async function removeCache(id){
  const u = trackBlobCache.get(id);
  if(u && u.startsWith('blob:')){ try { URL.revokeObjectURL(u); } catch(e){} }
  trackBlobCache.delete(id);
  await cacheDelete(id);
  renderLibrary();
  showToast("Removed from cache");
}

function openPlaylist(i){
  const p = playlists[i];
  if(!p || p.songs.length === 0) return showToast("Empty playlist");
  currentPlaylist = p.songs.slice();
  renderHomeQueue();
  playTrack(0);
  showToast(`▶ ${p.name}`);
}

function deletePlaylist(i){
  if(!confirm("Delete this playlist?")) return;
  playlists.splice(i, 1);
  savePlaylists();
  renderLibrary();
}

function savePlaylists(){ localStorage.setItem('vaultify_playlists', JSON.stringify(playlists)); }

function toggleLikeCurrent(){
  if(currentPlaylist.length === 0) return showToast("No track playing");
  const t = currentPlaylist[currentTrackIndex];
  const idx = likedSongs.findIndex(s => s.id === t.id);
  if(idx >= 0){ likedSongs.splice(idx, 1); showToast("Removed from Liked"); }
  else { likedSongs.unshift(t); showToast("❤️ Added to Liked"); }
  localStorage.setItem('vaultify_liked', JSON.stringify(likedSongs));
  const hb = document.getElementById('fullHeartBtn');
  const isLiked = likedSongs.some(s => s.id === t.id);
  if(hb){ hb.className = isLiked ? 'fa-solid fa-heart' : 'fa-regular fa-heart'; hb.style.color = isLiked ? 'var(--partner-pink)' : 'inherit'; }
  if(currentLibraryTab === 'liked') renderLibrary();
}

function unlikeSong(id){
  likedSongs = likedSongs.filter(s => s.id !== id);
  localStorage.setItem('vaultify_liked', JSON.stringify(likedSongs));
  renderLibrary();
}

function openAddToPlaylistModal(){
  if(currentPlaylist.length === 0) return showToast("No track playing");
  const c = document.getElementById('playlistSelectList');
  if(playlists.length === 0) c.innerHTML = `<p style="font-size:12px;color:var(--text-sub);text-align:center;padding:8px 0">No playlists yet.</p>`;
  else c.innerHTML = playlists.map((p, i) => `<div class="song-tile" onclick="addToPlaylist(${i})"><div class="tile-left"><div style="width:38px;height:38px;border-radius:8px;background:linear-gradient(135deg,var(--accent),var(--accent-neon));display:flex;align-items:center;justify-content:center;font-size:16px;color:#fff;flex-shrink:0"><i class="fa-solid fa-list"></i></div><div class="tile-meta"><h4>${escapeHtml(p.name)}</h4><p>${p.songs.length} songs</p></div></div><i class="fa-solid fa-plus" style="color:var(--accent-neon)"></i></div>`).join('');
  openModal('modalAddToPlaylist');
}

function addToPlaylist(i){
  const t = currentPlaylist[currentTrackIndex];
  if(!playlists[i].songs.some(s => s.id === t.id)) playlists[i].songs.push(t);
  savePlaylists();
  showToast(`Added to ${playlists[i].name}`);
  closeModal('modalAddToPlaylist');
  if(currentLibraryTab === 'playlists') renderLibrary();
}

function createPlaylistAndAdd(){
  const n = document.getElementById('newPlaylistName').value.trim();
  if(!n) return showToast("Enter playlist name");
  const t = currentPlaylist[currentTrackIndex];
  playlists.push({ id: Date.now(), name: n, songs: t ? [t] : [], created: Date.now() });
  savePlaylists();
  document.getElementById('newPlaylistName').value = '';
  showToast(`Created: ${n}`);
  closeModal('modalAddToPlaylist');
  if(currentLibraryTab === 'playlists') renderLibrary();
}

/* ═══════════════ BROADCAST & USER SYSTEM ═══════════════ */
function isOwner(){ return loggedInUser && loggedInUser.email && loggedInUser.email.toLowerCase() === CREATOR_ROOT_EMAIL.toLowerCase(); }

async function broadcastNotification(title, message){
  if(!isOwner()) return showToast('❌ Only owner can broadcast');
  if(!title || !message) return showToast('Title aur message daalo');
  const broadcast = { title, message, timestamp: Date.now(), from: CREATOR_ROOT_EMAIL, id: 'bc_' + Date.now() };
  const allBroadcasts = JSON.parse(localStorage.getItem('vaultify_broadcasts') || '[]');
  allBroadcasts.unshift(broadcast);
  if(allBroadcasts.length > 30) allBroadcasts.pop();
  localStorage.setItem('vaultify_broadcasts', JSON.stringify(allBroadcasts));
  localStorage.setItem('vaultify_latest_broadcast', JSON.stringify(broadcast));
  if(duoChannel){ try { duoChannel.postMessage({ type: 'GLOBAL_BROADCAST', broadcast }); } catch(e){} }
  showToast('✅ Broadcast sent');
}

function sendBroadcastFromForm(){
  if(!isOwner()) return showToast('❌ Only owner can broadcast');
  const t = document.getElementById('bcTitle').value.trim();
  const m = document.getElementById('bcMessage').value.trim();
  if(!t || !m) return showToast('Fill all fields');
  broadcastNotification(t, m);
  document.getElementById('bcTitle').value = '';
  document.getElementById('bcMessage').value = '';
  closeModal('modalBroadcast');
}

function checkIncomingBroadcasts(){
  const latest = localStorage.getItem('vaultify_latest_broadcast');
  const lastSeen = localStorage.getItem('vaultify_last_seen_broadcast');
  if(latest && latest !== lastSeen){
    try {
      const bc = JSON.parse(latest);
      if(!isOwner()) pushNotification({ title: '📢 ' + bc.title, message: bc.message, icon: 'fa-solid fa-bullhorn', iconColor: '#10b981' });
      localStorage.setItem('vaultify_last_seen_broadcast', latest);
    } catch(e){}
  }
  renderWhatsNewBadge();
}

function getBroadcastHistory(){ return JSON.parse(localStorage.getItem('vaultify_broadcasts') || '[]'); }

function renderWhatsNewBadge(){
  const history = getBroadcastHistory();
  const lastSeen = localStorage.getItem('vaultify_whatsnew_seen');
  const badge = document.getElementById('whatsNewBadge');
  if(!badge) return;
  const unread = history.filter(b => !lastSeen || b.id !== lastSeen).length;
  if(unread > 0){ badge.innerText = unread; badge.style.display = 'flex'; }
  else { badge.style.display = 'none'; }
}

function openWhatsNewModal(){
  const history = getBroadcastHistory();
  const container = document.getElementById('whatsNewList');
  if(container){
    if(history.length === 0) container.innerHTML = '<p style="font-size:12px;color:var(--text-sub);text-align:center;padding:20px 0">No updates yet.</p>';
    else {
      container.innerHTML = history.map(b => `<div style="background:rgba(16,185,129,.08);border:1px solid rgba(16,185,129,.3);border-radius:12px;padding:12px;margin-bottom:10px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
          <div style="font-size:13px;font-weight:700;color:#10b981"><i class="fa-solid fa-bullhorn"></i> ${escapeHtml(b.title)}</div>
          <span style="font-size:10px;color:var(--text-sub)">${new Date(b.timestamp).toLocaleDateString()}</span>
        </div>
        <div style="font-size:11.5px;color:var(--text-sub);line-height:1.5">${escapeHtml(b.message)}</div>
      </div>`).join('');
    }
  }
  if(history.length > 0) localStorage.setItem('vaultify_whatsnew_seen', history[0].id);
  renderWhatsNewBadge();
  openModal('modalWhatsNew');
}

function getStoredNotifications(){ return JSON.parse(localStorage.getItem('vaultify_notifications_list') || '[]'); }
function pushNotification(n){
  const l = getStoredNotifications();
  l.unshift({ ...n, id: Date.now(), time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), unread: true });
  if(l.length > 60) l.pop();
  localStorage.setItem('vaultify_notifications_list', JSON.stringify(l));
  renderNotificationCenter();
}

function renderNotificationCenter(){
  const list = getStoredNotifications();
  const c = document.getElementById('notificationListContainer');
  const b = document.getElementById('notifBadgeCount');
  if(b){ const u = list.filter(n => n.unread).length; if(u > 0){ b.innerText = u; b.style.display = 'flex'; } else b.style.display = 'none'; }
  if(!c) return;
  if(list.length === 0){ c.innerHTML = `<p style="font-size:12px;color:var(--text-sub);text-align:center;padding:24px 0">No notifications.</p>`; return; }
  c.innerHTML = list.map(n => `<div style="background:rgba(255,255,255,.04);border:1px solid var(--border);border-radius:12px;padding:12px;margin-bottom:10px">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
      <div style="font-size:13px;font-weight:700;color:#fff"><i class="${n.icon || 'fa-solid fa-bell'}" style="color:${n.iconColor || 'var(--accent-neon)'};margin-right:6px"></i>${escapeHtml(n.title)}</div>
      <span style="font-size:10px;color:var(--text-sub)">${n.time}</span>
    </div>
    <div style="font-size:11.5px;color:var(--text-sub);line-height:1.4">${escapeHtml(n.message)}</div>
  </div>`).join('');
}

function openNotificationModal(){
  const l = getStoredNotifications();
  l.forEach(n => n.unread = false);
  localStorage.setItem('vaultify_notifications_list', JSON.stringify(l));
  renderNotificationCenter();
  openModal('modalNotifications');
}
function clearAllNotifications(){ localStorage.removeItem('vaultify_notifications_list'); renderNotificationCenter(); showToast("Cleared!"); }
function checkBroadcastNotifications(){ setInterval(checkIncomingBroadcasts, 5000); checkIncomingBroadcasts(); }
function syncLocalCatalog(){ const c = JSON.parse(localStorage.getItem('vaultify_custom_tracks') || '[]'); currentPlaylist = [...c]; }

/* ═══════════════ AUTH LOGIC ═══════════════ */
const AUTH_ITERATIONS = 100000, AUTH_SALT_BYTES = 16, AUTH_KEY_BYTES = 32;
function bytesToHex(bytes){ return Array.from(new Uint8Array(bytes)).map(b => b.toString(16).padStart(2, '0')).join(''); }
function hexToBytes(hex){ const a = new Uint8Array(hex.length / 2); for(let i = 0; i < hex.length; i += 2) a[i / 2] = parseInt(hex.substr(i, 2), 16); return a; }
function generateSalt(){ const s = new Uint8Array(AUTH_SALT_BYTES); crypto.getRandomValues(s); return bytesToHex(s); }

async function derivePasswordHash(password, saltHex){
  try {
    const enc = new TextEncoder();
    const baseKey = await crypto.subtle.importKey('raw', enc.encode(password), { name: 'PBKDF2' }, false, ['deriveBits']);
    const salt = hexToBytes(saltHex);
    const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: AUTH_ITERATIONS, hash: 'SHA-256' }, baseKey, AUTH_KEY_BYTES * 8);
    return bytesToHex(bits);
  } catch(e){
    let h = password + '|' + saltHex;
    for(let i = 0; i < 50000; i++){ h = btoa(h + password); }
    return h;
  }
}

function getUserDB(){ try { return JSON.parse(localStorage.getItem('vaultify_user_db') || '{}'); } catch(e){ return {}; } }
function saveUserDB(db){ localStorage.setItem('vaultify_user_db', JSON.stringify(db)); }

function findUserByEmail(email){
  const db = getUserDB(); const el = String(email || '').trim().toLowerCase(); if(!el) return null;
  for(const key in db){ if(db[key] && db[key].email && String(db[key].email).toLowerCase() === el) return { key, user: db[key] }; }
  return null;
}
function findUserByUsername(username){
  const db = getUserDB(); const ul = String(username || '').trim().toLowerCase(); if(!ul) return null;
  if(db[ul]) return { key: ul, user: db[ul] }; return null;
}

function verifyAuthGate(){
  const s = localStorage.getItem('vaultify_active_user');
  const authModal = document.getElementById('modalAuthGate');
  const mainFrame = document.querySelector('.mobile-frame');
  if(!authModal) return;
  if(!s){
    document.body.classList.add('auth-locked');
    if(mainFrame) mainFrame.style.pointerEvents = 'none';
    authModal.classList.add('open'); authModal.style.display = 'flex';
  } else {
    try {
      loggedInUser = JSON.parse(s);
      applyUserDataUI(loggedInUser);
      document.body.classList.remove('auth-locked');
      if(mainFrame) mainFrame.style.pointerEvents = '';
      authModal.classList.remove('open'); authModal.style.display = 'none';
    } catch(e){
      document.body.classList.add('auth-locked'); authModal.classList.add('open'); authModal.style.display = 'flex';
    }
  }
}

function unlockApp(){
  const authModal = document.getElementById('modalAuthGate');
  const mainFrame = document.querySelector('.mobile-frame');
  if(authModal){ authModal.classList.remove('open'); authModal.style.display = 'none'; }
  document.body.classList.remove('auth-locked');
  if(mainFrame) mainFrame.style.pointerEvents = '';
}

function toggleAuthMode(){
  isLoginMode = !isLoginMode;
  document.getElementById('authSubmitBtn').innerText = isLoginMode ? 'Log In' : 'Create Account';
  document.getElementById('authModeToggleText').innerText = isLoginMode ? "Don't have account? Sign up" : 'Already registered? Log in';
  document.getElementById('authDisplayNameInput').style.display = isLoginMode ? 'none' : 'block';
  hideAuthAlerts();
}

function showAuthError(msg){ const er = document.getElementById('authErrorAlert'); if(er){ er.innerText = msg; er.style.display = 'block'; } }
function showAuthSuccess(msg){ const ok = document.getElementById('authSuccessAlert'); if(ok){ ok.innerText = msg; ok.style.display = 'block'; } }
function hideAuthAlerts(){
  const er = document.getElementById('authErrorAlert'); const ok = document.getElementById('authSuccessAlert');
  if(er) er.style.display = 'none'; if(ok) ok.style.display = 'none';
}

function validateUsername(u){
  if(!u || u.length < 3) return { ok: false, msg: "Username must be at least 3 characters." };
  if(u.length > 20) return { ok: false, msg: "Username must be under 20 characters." };
  if(!/^[a-z0-9_]+$/.test(u)) return { ok: false, msg: "Only letters, numbers, _ allowed." };
  return { ok: true };
}
function validateEmail(e){
  if(!e || !e.trim()) return { ok: false, msg: "Email is required." };
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) return { ok: false, msg: "Please enter a valid email." };
  return { ok: true };
}
function validatePassword(p){
  if(!p || p.length < 8) return { ok: false, msg: "Password must be at least 8 characters." };
  return { ok: true };
}

async function processAuthSubmission(){
  hideAuthAlerts();
  const u = String(document.getElementById('authUsernameInput').value || '').trim().toLowerCase();
  const e = String(document.getElementById('authEmailInput').value || '').trim().toLowerCase();
  const p = document.getElementById('authPasswordInput').value || '';
  const dName = document.getElementById('authDisplayNameInput').value.trim();

  const vu = validateUsername(u); if(!vu.ok) return showAuthError(vu.msg);
  const ve = validateEmail(e); if(!ve.ok) return showAuthError(ve.msg);
  if(!isLoginMode){ const vp = validatePassword(p); if(!vp.ok) return showAuthError(vp.msg); }

  const submitBtn = document.getElementById('authSubmitBtn');
  submitBtn.disabled = true;

  try {
    if(isLoginMode){
      let found = findUserByUsername(u);
      if(!found && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(u)) found = findUserByEmail(u);
      if(!found){ showAuthError("❌ User not found."); return; }
      const user = found.user;
      const derived = await derivePasswordHash(p, user.salt || '');
      if(derived !== user.passwordHash){ showAuthError("❌ Invalid password."); return; }
      user.lastLogin = Date.now();
      const db = getUserDB(); db[found.key] = user; saveUserDB(db);
      loggedInUser = user; localStorage.setItem('vaultify_active_user', JSON.stringify(loggedInUser));
      showAuthSuccess("✅ Logged in!");
      setTimeout(() => { unlockApp(); applyUserDataUI(loggedInUser); updateDynamicUserCounter(); }, 400);
    } else {
      if(findUserByUsername(u)){ showAuthError("❌ Username taken."); return; }
      const salt = generateSalt();
      const passwordHash = await derivePasswordHash(p, salt);
      const partnerCode = generatePartnerCode(u);
      const newUser = { username: u, email: e, displayName: dName || u, bio: '', passwordHash, salt, avatar: '', partnerCode, partnerRequests: [], partnerRequestsSent: [], notifications: [], createdAt: Date.now(), lastLogin: Date.now() };
      const db = getUserDB(); db[u] = newUser; saveUserDB(db);
      loggedInUser = newUser; localStorage.setItem('vaultify_active_user', JSON.stringify(loggedInUser));
      showAuthSuccess("✅ Account created!");
      setTimeout(() => { unlockApp(); applyUserDataUI(loggedInUser); updateDynamicUserCounter(); }, 400);
    }
  } catch(err){ showAuthError("⚠️ Error occurred."); }
  finally { submitBtn.disabled = false; }
}

function applyUserDataUI(user){
  if(!user) return;
  const certName = document.getElementById('certOwnerDisplayName');
  const certHandle = document.getElementById('certOwnerHandle');
  const editName = document.getElementById('editDisplayName');
  const editBio = document.getElementById('editBio');
  const partnerCode = document.getElementById('myPartnerCodeDisplay');
  const avatar = document.getElementById('userAvatarImg');
  if(certName) certName.innerText = user.displayName || user.username;
  if(certHandle) certHandle.innerText = '@' + user.username;
  if(editName) editName.value = user.displayName || user.username;
  if(editBio) editBio.value = user.bio || '';
  if(partnerCode) partnerCode.innerText = user.partnerCode || generatePartnerCode(user.username);
  if(avatar && user.avatar) avatar.src = user.avatar;
  updateDynamicUserCounter();
  syncUserPartnerCode();
  renderPartnerRequests();
  const chatBox = document.getElementById('activePartnerChat');
  if(chatBox) chatBox.style.display = user.partnerUsername ? 'block' : 'none';
  const creatorBox = document.getElementById('broadcastBox');
  if(creatorBox) creatorBox.style.display = isOwner() ? 'block' : 'none';
}

function openForgotPasswordFlow(){ closeModal('modalAuthGate'); openModal('modalForgotPass'); }

async function executePasswordReset(){
  const u = document.getElementById('fpUsername').value.trim().toLowerCase();
  const e = document.getElementById('fpEmail').value.trim().toLowerCase();
  const p = document.getElementById('fpNewPassword').value;
  const found = findUserByUsername(u);
  if(!found) return showToast("❌ Account not found.");
  if(String(found.user.email || '').toLowerCase() !== e) return showToast("❌ Email mismatch.");
  const newSalt = generateSalt();
  const newHash = await derivePasswordHash(p, newSalt);
  const db = getUserDB();
  db[found.key].passwordHash = newHash;
  db[found.key].salt = newSalt;
  saveUserDB(db);
  closeModal('modalForgotPass');
  openModal('modalAuthGate');
  showToast("✅ Password updated!");
}

function triggerDpPicker(){ const p = document.getElementById('avatarPicker'); if(p) p.click(); }
function handleDpUpload(e){
  const f = e.target.files[0];
  if(!f) return;
  if(f.size > 2 * 1024 * 1024) return showToast("Max size 2MB");
  const r = new FileReader();
  r.onload = ev => {
    const b = ev.target.result;
    document.getElementById('userAvatarImg').src = b;
    if(loggedInUser){
      loggedInUser.avatar = b;
      const db = getUserDB();
      if(db[loggedInUser.username]){ db[loggedInUser.username].avatar = b; saveUserDB(db); }
      localStorage.setItem('vaultify_active_user', JSON.stringify(loggedInUser));
    }
    showToast("✅ DP Updated!");
  };
  r.readAsDataURL(f);
}

function saveProfileData(){
  if(!loggedInUser) return;
  const n = document.getElementById('editDisplayName').value.trim();
  if(!n) return showToast("Name required");
  const bio = (document.getElementById('editBio')?.value || '').trim();
  loggedInUser.displayName = n; loggedInUser.bio = bio;
  const db = getUserDB();
  if(db[loggedInUser.username]){ db[loggedInUser.username].displayName = n; db[loggedInUser.username].bio = bio; saveUserDB(db); }
  localStorage.setItem('vaultify_active_user', JSON.stringify(loggedInUser));
  applyUserDataUI(loggedInUser);
  showToast("Profile saved!");
}

function performAppLogout(){
  if(!confirm("Log out from this device?")) return;
  localStorage.removeItem('vaultify_active_user');
  location.reload();
}

function updateDynamicUserCounter(){
  const db = JSON.parse(localStorage.getItem('vaultify_user_db') || '{}');
  const c = Object.keys(db).length;
  const el = document.getElementById('realUserCountDisplay');
  if(el) el.innerText = `${c} User${c === 1 ? '' : 's'}`;
}

function generatePartnerCode(username){
  if(!username) return 'VAULT-XXXXXX';
  let hash = 0;
  const seed = username + '_vaultify_2026';
  for(let i = 0; i < seed.length; i++){ hash = ((hash << 5) - hash) + seed.charCodeAt(i); hash = hash & hash; }
  return 'VAULT-' + Math.abs(hash).toString(36).toUpperCase().padStart(6, '0').slice(0, 6);
}

function syncUserPartnerCode(){
  if(!loggedInUser) return;
  const db = getUserDB();
  const user = db[loggedInUser.username];
  if(!user) return;
  if(!user.partnerCode){ user.partnerCode = generatePartnerCode(loggedInUser.username); db[loggedInUser.username] = user; saveUserDB(db); }
  loggedInUser.partnerCode = user.partnerCode;
  const el = document.getElementById('myPartnerCodeDisplay');
  if(el) el.innerText = user.partnerCode;
}

function copyPartnerCode(){
  const el = document.getElementById('myPartnerCodeDisplay');
  if(!el) return;
  navigator.clipboard.writeText(el.innerText).then(() => showToast('✅ Copied!')).catch(() => showToast('Copy failed'));
}

function searchPartnerProfile(){
  const query = document.getElementById('partnerCodeInput').value.trim();
  if(!query) return showToast("Enter username or code");
  const db = getUserDB();
  const lq = query.toLowerCase();
  let found = db[lq] || null;
  if(!found){
    for(const k in db){ if(db[k]?.partnerCode?.toLowerCase() === lq){ found = db[k]; break; } }
  }
  if(!found){ document.getElementById('partnerProfileCard').style.display = 'none'; return showToast("❌ Not found"); }
  const card = document.getElementById('partnerProfileCard');
  document.getElementById('partnerAvatar').src = found.avatar || 'vaultify.png';
  document.getElementById('partnerDisplayName').innerText = found.displayName || found.username;
  document.getElementById('partnerUsername').innerText = '@' + found.username;
  document.getElementById('partnerBio').innerText = found.bio || 'No bio available.';
  card.style.display = 'block';
  card.dataset.targetUser = found.username;
}

function pairPartner(){
  const card = document.getElementById('partnerProfileCard');
  if(!card?.dataset.targetUser) return;
  sendPartnerRequest(card.dataset.targetUser);
}

function sendPartnerRequest(targetUsername){
  if(!loggedInUser) return showToast("Login first");
  const db = getUserDB();
  const target = db[targetUsername];
  if(!target) return showToast("User not found");
  if(!target.partnerRequests) target.partnerRequests = [];
  if(target.partnerRequests.some(r => r.from === loggedInUser.username)) return showToast("⏳ Request already sent");
  target.partnerRequests.push({ from: loggedInUser.username, fromName: loggedInUser.displayName || loggedInUser.username, status: 'pending' });
  db[targetUsername] = target;
  saveUserDB(db);
  showToast(`✅ Sent to ${target.displayName || target.username}`);
}

function acceptPartnerRequest(fromUsername){
  if(!loggedInUser) return;
  const db = getUserDB();
  const me = db[loggedInUser.username];
  const from = db[fromUsername];
  if(!me || !from) return;
  me.partnerUsername = fromUsername;
  me.partnerDisplayName = from.displayName || from.username;
  from.partnerUsername = loggedInUser.username;
  from.partnerDisplayName = me.displayName || me.username;
  me.partnerRequests = (me.partnerRequests || []).filter(r => r.from !== fromUsername);
  db[loggedInUser.username] = me; db[fromUsername] = from; saveUserDB(db);
  loggedInUser = me; localStorage.setItem('vaultify_active_user', JSON.stringify(loggedInUser));
  showToast(`💕 Connected with ${from.displayName || from.username}`);
  renderPartnerRequests();
  document.getElementById('activePartnerChat').style.display = 'block';
}

function declinePartnerRequest(fromUsername){
  if(!loggedInUser) return;
  const db = getUserDB();
  const me = db[loggedInUser.username];
  if(!me) return;
  me.partnerRequests = (me.partnerRequests || []).filter(r => r.from !== fromUsername);
  db[loggedInUser.username] = me; saveUserDB(db);
  loggedInUser = me; localStorage.setItem('vaultify_active_user', JSON.stringify(loggedInUser));
  renderPartnerRequests();
}

function renderPartnerRequests(){
  const c = document.getElementById('partnerRequestsBox');
  if(!c || !loggedInUser) return;
  const me = getUserDB()[loggedInUser.username];
  if(!me || !me.partnerRequests?.length){ c.innerHTML = '<p style="font-size:11px;color:var(--text-sub);text-align:center;padding:8px 0">No pending requests.</p>'; return; }
  c.innerHTML = me.partnerRequests.map(r => `<div style="display:flex;align-items:center;justify-content:space-between;padding:8px;background:rgba(236,72,153,.08);border-radius:10px;margin-bottom:6px">
    <div style="font-size:12px;font-weight:700">${escapeHtml(r.fromName)}</div>
    <div>
      <button onclick="acceptPartnerRequest('${r.from}')" style="background:#10b981;border:none;color:#fff;padding:4px 8px;border-radius:6px;cursor:pointer"><i class="fa-solid fa-check"></i></button>
      <button onclick="declinePartnerRequest('${r.from}')" style="background:#ef4444;border:none;color:#fff;padding:4px 8px;border-radius:6px;cursor:pointer"><i class="fa-solid fa-xmark"></i></button>
    </div>
  </div>`).join('');
}

function sendDuoChatMessage(){
  const i = document.getElementById('duoChatInput'); const m = i.value.trim();
  if(!m) return;
  const l = document.getElementById('duoChatLog');
  l.innerHTML += `<div class="duo-chat-bubble me">${escapeHtml(m)}</div>`;
  i.value = ''; l.scrollTop = l.scrollHeight;
  if(duoChannel) duoChannel.postMessage({ type: 'DUO_CHAT', text: m, user: loggedInUser?.displayName || 'Partner' });
}

function handleDuoBroadcastMessage(e){
  const d = e.data; if(!d) return;
  if(d.type === 'DUO_CHAT'){
    const l = document.getElementById('duoChatLog');
    if(l){ l.innerHTML += `<div class="duo-chat-bubble partner"><strong>${escapeHtml(d.user)}:</strong> ${escapeHtml(d.text)}</div>`; l.scrollTop = l.scrollHeight; }
  } else if(d.type === 'SYNC_PLAY' && d.track){
    currentPlaylist.splice(currentTrackIndex + 1, 0, d.track);
    renderHomeQueue();
    playTrack(currentTrackIndex + 1, false);
  } else if(d.type === 'SYNC_TOGGLE'){ togglePlaybackState(false); }
}

/* ═══════════════ RUNNER & UI THEMES ═══════════════ */
function initEmojiRunner(){
  const i = document.getElementById('notchRunnerIcon'); if(!i) return;
  i.classList.remove('mode-flow', 'mode-mix');
  if(emojiMode === 'mix'){ i.classList.add('mode-mix'); animateMixEmoji(); }
  else { i.classList.add('mode-flow'); if(mixRafId){ cancelAnimationFrame(mixRafId); mixRafId = null; } i.style.left = ''; }
  i.innerText = activeEmoji;
}

function animateMixEmoji(){
  if(mixRafId) cancelAnimationFrame(mixRafId);
  const i = document.getElementById('notchRunnerIcon'); const n = document.querySelector('.notch-island');
  if(!i || !n) return;
  let p = 0, d = 1;
  const step = () => {
    if(emojiMode !== 'mix'){ mixRafId = null; return; }
    const mx = n.clientWidth - 32; p += d * 0.8;
    if(p >= mx){ p = mx; d = -1; cycleEmoji(); } else if(p <= 0){ p = 0; d = 1; cycleEmoji(); }
    i.style.left = (8 + p) + 'px';
    mixRafId = requestAnimationFrame(step);
  };
  mixRafId = requestAnimationFrame(step);
}

function cycleEmoji(){
  const l = emojiList.length > 0 ? emojiList : ['🐱'];
  currentEmojiIndex = (currentEmojiIndex + 1) % l.length;
  const i = document.getElementById('notchRunnerIcon'); if(!i) return;
  i.innerText = l[currentEmojiIndex];
}

function initEmojiPicker(){
  const r = document.getElementById('emojiPickerRow'); if(!r) return;
  r.innerHTML = emojiList.map(e => `<div class="emoji-chip ${e === activeEmoji ? 'active' : ''}" data-emoji="${e}">${e}</div>`).join('');
  r.querySelectorAll('.emoji-chip').forEach(c => {
    c.addEventListener('click', () => {
      activeEmoji = c.dataset.emoji;
      localStorage.setItem('vaultify_active_emoji', activeEmoji);
      r.querySelectorAll('.emoji-chip').forEach(x => x.classList.remove('active'));
      c.classList.add('active');
      const icon = document.getElementById('notchRunnerIcon'); if(icon) icon.innerText = activeEmoji;
      showToast(`Runner: ${activeEmoji}`);
    });
  });
}

function addCustomEmoji(){
  const i = document.getElementById('customEmojiInput'); const v = i.value.trim();
  if(!v || emojiList.includes(v)) return;
  emojiList.push(v);
  localStorage.setItem('vaultify_emoji_list', JSON.stringify(emojiList));
  i.value = ''; initEmojiPicker(); showToast(`Added: ${v}`);
}

function setEmojiMode(mode){ emojiMode = mode; localStorage.setItem('vaultify_emoji_mode', mode); initEmojiRunner(); }
function toggleAmbientMotion(){ const e = document.getElementById('gradientFlowBg'); const b = document.getElementById('gradientToggleBtn'); const o = e.classList.toggle('disabled'); b.innerText = o ? 'Disabled' : 'Enabled'; }
function toggleRunnerVisibility(){ const i = document.getElementById('notchRunnerIcon'); const b = document.getElementById('runnerToggleBtn'); const h = i.style.display === 'none'; i.style.display = h ? '' : 'none'; b.innerText = h ? 'Enabled' : 'Disabled'; }

function applyThemeScheme(c){
  document.body.className = '';
  if(c !== 'theme-violet') document.body.classList.add(c);
  localStorage.setItem('vaultify_theme', c);
  showToast(`Theme changed!`);
}

function resetEqSliders(){ ['eq60','eq230','eq910','eq4k','eq14k'].forEach(id => { const el = document.getElementById(id); if(el) el.value = 0; }); showToast("EQ Reset"); }
function changeAppLanguage(lang){ appLanguage = lang; localStorage.setItem('vaultify_app_lang', lang); showToast(lang === 'hi' ? "हिंदी चुनी गई" : "English Selected"); }
(function restoreTheme(){ const saved = localStorage.getItem('vaultify_theme'); if(saved && saved !== 'theme-violet') document.body.classList.add(saved); })();

// Global Window Exports
Object.assign(window, {
  switchNavTab, switchLibraryTab, openModal, closeModal, openFullPlayer, closeFullPlayer,
  openPartnerModal, openSupportModal, openNotificationModal, clearAllNotifications, executeLiveSearch,
  clearSearchHistory, requestMicAndListen, playSearchedTrackImmediately, playSingleTrackObject,
  playCached, removeCache, openPlaylist, deletePlaylist, playTrack, togglePlaybackState,
  playNext, playPrevious, toggleShuffle, toggleRepeat, toggleSleepTimer, shareCurrentTrack,
  downloadCurrentTrack, toggleLikeCurrent, unlikeSong, toggleVideoCanvasView,
  openAddToPlaylistModal, addToPlaylist, createPlaylistAndAdd, resetEqSliders,
  toggleAmbientMotion, toggleRunnerVisibility, addCustomEmoji, setEmojiMode,
  applyThemeScheme, changeAppLanguage, handleDpUpload, saveProfileData, performAppLogout,
  toggleAuthMode, processAuthSubmission, openForgotPasswordFlow, executePasswordReset,
  searchPartnerProfile, pairPartner, sendDuoChatMessage, showToast, sendSupportMail, triggerDpPicker,
  acceptPartnerRequest, declinePartnerRequest, sendPartnerRequest, syncUserPartnerCode,
  renderPartnerRequests, generatePartnerCode, copyPartnerCode,
  onNativePlay, onNativePause, onNativeNext, onNativePrev,
  broadcastNotification, openWhatsNewModal, checkIncomingBroadcasts, getBroadcastHistory,
  renderWhatsNewBadge, sendBroadcastFromForm
});
/* ═══════════════ END OF PART 4 (FULL SCRIPT COMPLETE) ═══════════════ */
