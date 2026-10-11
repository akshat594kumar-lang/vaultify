/* ═══════════════════════════════════════════════════════════════════ */
/* VAULTIFY — Global Engine (International Search + Fast DP Fix)       */
/* ═══════════════════════════════════════════════════════════════════ */

const CREATOR_ROOT_EMAIL = "akshat594kumar@gmail.com";
let audioContextNode = null, wakeLockSentinel = null, silentLoopStarted = false;

// Global Fast Stream Gateways (SimpleTune Architecture)
const INVIDIOUS_MIRRORS = [
  'https://inv.tux.pizza',
  'https://invidious.nerdvpn.de',
  'https://invidious.jing.rocks',
  'https://yt.drgnz.club',
  'https://invidious.private.coffee'
];

const PIPED_MIRRORS = [
  'https://pipedapi.kavin.rocks',
  'https://api.piped.privacydev.net',
  'https://pipedapi.drgnz.club'
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

let currentPlaylist = [], currentTrackIndex = 0, isPlayingAudio = false, isLoginMode = false, loggedInUser = null, isShuffle = false, isRepeat = false, isVideoCanvasActive = false, activeStreamEngine = 'direct', ytPlayer = null, ytPlayerReady = false;
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
let isDraggingTimeline = false, mixRafId = null, _lastSaveTick = 0;
let lastAutoFetchTime = 0;

const mainAudio = document.getElementById('vaultifyAudio') || new Audio();
const silentLoop = document.getElementById('silentAudioLoop') || new Audio();

window.addEventListener('DOMContentLoaded', async () => {
  await initCacheDB();
  setTimeout(() => { const i = document.getElementById('appIntroScreen'); if(i) i.classList.add('fade-out'); }, 600);
  initAudioWakeLoop(); syncLocalCatalog(); verifyAuthGate(); renderHomeRecentVault(); renderHomeQueue(); renderLibrary(); renderSearchHistoryTags();
  setupAndroidMediaSession(); setupTimelineDraggableEngine(); updateDynamicUserCounter(); renderNotificationCenter();
  initLiveSearchInputListener(); initEmojiRunner(); initEmojiPicker(); renderRecommendedSection();
  setTimeout(() => setEmojiMode(emojiMode), 100); ensureMicPermission();
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

/* ═══════════════ GLOBAL MUSIC SEARCH (INTERNATIONAL + REGIONAL) ═══════════════ */
// 1. YouTube Music Global Search (Har gaana milega — Drake, AUR, Sid Sriram, Pakistani, English)
async function searchYouTubeGlobal(q){
  for(const h of INVIDIOUS_MIRRORS){
    try {
      const ctrl = new AbortController();
      const tm = setTimeout(() => ctrl.abort(), 4000);
      const r = await fetch(`${h}/api/v1/search?q=${encodeURIComponent(q)}&type=video`, { signal: ctrl.signal });
      clearTimeout(tm);
      if(!r.ok) continue;
      const d = await r.json();
      if(Array.isArray(d) && d.length){
        return d.slice(0, 25).map(v => ({
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

// 2. iTunes Global Search (Ultra fast for pure International tracks metadata)
async function searchITunesGlobal(q){
  try {
    const ctrl = new AbortController();
    const tm = setTimeout(() => ctrl.abort(), 3500);
    const r = await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(q)}&media=music&entity=song&limit=15`, { signal: ctrl.signal });
    clearTimeout(tm);
    if(!r.ok) return [];
    const d = await r.json();
    if(d.results && d.results.length){
      return d.results.map(s => ({
        id: 'itunes_' + s.trackId,
        title: s.trackName,
        artist: s.artistName,
        cover: s.artworkUrl100 ? s.artworkUrl100.replace('100x100bb', '300x300bb') : 'vaultify.png',
        duration: Math.floor(s.trackTimeMillis / 1000) || 0,
        source: 'itunes',
        _directStream: s.previewUrl || ''
      }));
    }
  } catch(e){}
  return [];
}

// 3. JioSaavn (Bollywood aur Indian specific backup)
async function searchSaavn(q){
  try {
    const ctrl = new AbortController();
    const tm = setTimeout(() => ctrl.abort(), 3500);
    const r = await fetch(`https://saavn.me/api/search/songs?query=${encodeURIComponent(q)}&limit=15`, { signal: ctrl.signal });
    clearTimeout(tm);
    if(!r.ok) return [];
    const d = await r.json();
    const results = d.data?.results || [];
    return results.map(s => {
      const urls = s.downloadUrl || [];
      const best = urls.length ? urls[urls.length - 1].url : null;
      return {
        id: 'saavn_' + s.id,
        title: s.name,
        artist: s.primaryArtists || 'Unknown',
        cover: s.image?.[2]?.url || s.image?.[1]?.url || 'vaultify.png',
        duration: s.duration || 0,
        source: 'saavn',
        _directStream: best
      };
    });
  } catch(e){ return []; }
}

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
  l.innerHTML = '<i class="fa-solid fa-spinner fa-spin" style="font-size:24px;margin-bottom:8px"></i><div>Finding Global & Regional Tracks...</div>';

  const startTime = Date.now();
  // Dono YouTube Global aur Saavn/iTunes ko parallel search karo
  const results = await Promise.allSettled([
    searchYouTubeGlobal(q),
    searchSaavn(q),
    searchITunesGlobal(q)
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
  } else {
    rc.innerHTML = '<p style="font-size:13px;color:var(--text-sub);text-align:center;padding:18px 0">Koi gaana nahi mila. Check spelling.</p>';
  }
}

function renderSearchResults(tracks){
  const c = document.getElementById('searchResultsContainer');
  c.innerHTML = tracks.map(t => {
    const safeId = encodeURIComponent(t.id), safeTitle = encodeURIComponent(t.title || '');
    const safeArtist = encodeURIComponent(t.artist || ''), safeCover = encodeURIComponent(t.cover || 'vaultify.png');
    const safeDirect = t._directStream ? encodeURIComponent(t._directStream) : '';
    return `<div class="song-tile" onclick="playSearchedTrackImmediately('${safeId}','${safeTitle}','${safeArtist}','${safeCover}','${safeDirect}')">
      <div class="tile-left">
        <img src="${t.cover}" class="tile-thumb" onerror="this.src='vaultify.png'" />
        <div class="tile-meta">
          <h4>${escapeHtml(t.title)}</h4>
          <p>${escapeHtml(t.artist)}</p>
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
function clearSearchHistory(){ searchHistoryList = []; localStorage.removeItem('vaultify_search_history'); renderSearchHistoryTags(); }

/* ═══════════════ GLOBAL STREAM URL EXTRACTOR ═══════════════ */
async function fetchDirectAudioStreamUrl(input, title, artist){
  if(!input) return null;
  if(input.startsWith('blob:') || input.startsWith('data:')) return input;

  let vid = input;
  // Agar iTunes ya Saavn ka ID ho toh direct YouTube video me map karo
  if(input.startsWith('itunes_') || input.startsWith('saavn_')){
    const cleanQ = `${title} ${artist} audio`;
    const ytMatch = await searchYouTubeGlobal(cleanQ);
    if(ytMatch.length && ytMatch[0].id) vid = ytMatch[0].id;
    else return null;
  }

  // Fast Invidious Direct Opus/AAC Audio Extraction
  for(const h of INVIDIOUS_MIRRORS){
    try {
      const ctrl = new AbortController();
      const tm = setTimeout(() => ctrl.abort(), 3500);
      const r = await fetch(`${h}/api/v1/videos/${vid}`, { signal: ctrl.signal });
      clearTimeout(tm);
      if(!r.ok) continue;
      const d = await r.json();
      const af = (d.adaptiveFormats || []).filter(f => f.type?.includes('audio'));
      af.sort((a,b) => (b.bitrate || 0) - (a.bitrate || 0));
      if(af[0]?.url) return af[0].url;
    } catch(e){}
  }

  // Piped Direct CDN Fallback
  for(const h of PIPED_MIRRORS){
    try {
      const ctrl = new AbortController();
      const tm = setTimeout(() => ctrl.abort(), 3500);
      const r = await fetch(`${h}/streams/${vid}`, { signal: ctrl.signal });
      clearTimeout(tm);
      if(r.ok){
        const d = await r.json();
        if(d.audioStreams?.length){
          const best = d.audioStreams.sort((a,b) => (b.bitrate || 0) - (a.bitrate || 0))[0];
          if(best?.url) return best.url;
        }
      }
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

  if(!streamUrl){
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
    setTimeout(() => cacheTrackInBackground(track), 8000);
  } catch(e){
    fallbackToYouTubeBridge(track.id);
  }
}

function fallbackToYouTubeBridge(vid){
  if(!vid) { showToast('❌ Audio stream unavailable'); return; }
  activeStreamEngine = 'yt_engine';
  try { mainAudio.pause(); } catch(e){}
  if(ytPlayerReady && ytPlayer && ytPlayer.loadVideoById){
    ytPlayer.loadVideoById(vid);
    ytPlayer.playVideo();
    setVisualState(true);
    showToast("▶ YouTube Audio Engine");
  } else {
    showToast("Connecting audio stream...");
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
    showToast('🔄 Loading similar tracks...');
    const related = await fetchRelatedSongs(currentTrack);
    if(related.length){ related.forEach(t => currentPlaylist.push(t)); renderHomeQueue(); }
    else { showToast('❌ End of list'); return; }
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
  if(!track || track.id.startsWith('blob:')) return;
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
  try {
    let u = trackBlobCache.get(t.id) || t._directStream;
    if(!u || !u.startsWith('blob:')) u = u || await fetchDirectAudioStreamUrl(t.id, t.title, t.artist);
    if(!u) throw new Error("No URL");
    const r = await fetch(u); const b = await r.blob(); const bu = URL.createObjectURL(b);
    const a = document.createElement('a'); a.style.display = 'none'; a.href = bu;
    a.download = `${(t.title || 'track').replace(/[^a-zA-Z0-9 ]/g, '')}.mp3`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    showToast("✅ Downloaded!");
  } catch(e){ showToast("❌ Download failed"); }
}

async function fetchRelatedSongs(seedTrack){
  if(!seedTrack) return [];
  const now = Date.now();
  if(now - lastAutoFetchTime < 6000) return [];
  lastAutoFetchTime = now;
  let artist = (seedTrack.artist || '').replace(/vevo|official|records|channel|music|topic/gi, '').trim();
  const q = artist && artist.length > 2 ? `${artist} songs` : `${seedTrack.title || 'trending'} songs`;
  const existingIds = new Set(currentPlaylist.map(t => t.id));
  const ytResults = await searchYouTubeGlobal(q);
  return ytResults.filter(t => !existingIds.has(t.id)).slice(0, 8);
}

/* ═══════════════ DP UPLOAD FIX (AUTO CANVAS COMPRESSOR) ═══════════════ */
function triggerDpPicker(){ 
  const p = document.getElementById('avatarPicker'); 
  if(p) p.click(); 
}

function handleDpUpload(e){
  const f = e.target.files[0];
  if(!f) return;

  const reader = new FileReader();
  reader.onload = ev => {
    const img = new Image();
    img.onload = () => {
      // 150x150 me compress karo taaki localStorage crash na ho
      const canvas = document.createElement('canvas');
      canvas.width = 150;
      canvas.height = 150;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, 150, 150);

      // Compact JPEG format
      const compressedDataUrl = canvas.toDataURL('image/jpeg', 0.85);

      const avatarEl = document.getElementById('userAvatarImg');
      if(avatarEl) avatarEl.src = compressedDataUrl;

      if(loggedInUser){
        loggedInUser.avatar = compressedDataUrl;
        const db = getUserDB();
        if(db[loggedInUser.username]){
          db[loggedInUser.username].avatar = compressedDataUrl;
          saveUserDB(db);
        }
        localStorage.setItem('vaultify_active_user', JSON.stringify(loggedInUser));
      }
      showToast("✅ DP Updated Successfully!");
    };
    img.src = ev.target.result;
  };
  reader.readAsDataURL(f);
}

/* ═══════════════ HOME, QUEUE & UI ═══════════════ */
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
      }, 1500);
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

// 100% Unique International + Viral Recommendations on Home
async function renderRecommendedSection(){
  const c = document.getElementById('recommendedContainer');
  if(!c) return;
  
  let q = "AUR viral pop songs 2026";
  if(playbackHistoryList.length > 0 && playbackHistoryList[0].artist){
    q = `${playbackHistoryList[0].artist} hit songs`;
  }
  const results = await searchYouTubeGlobal(q);
  if(!results || !results.length){
    c.innerHTML = `<p style="font-size:11.5px;color:var(--text-sub);text-align:center;padding:10px 0">Listen to music to generate suggestions.</p>`;
    return;
  }

  c.innerHTML = results.slice(0, 8).map(t => {
    const safeId = encodeURIComponent(t.id), safeTitle = encodeURIComponent(t.title || '');
    const safeArtist = encodeURIComponent(t.artist || ''), safeCover = encodeURIComponent(t.cover || '');
    return `<div class="song-tile" onclick="playSearchedTrackImmediately('${safeId}','${safeTitle}','${safeArtist}','${safeCover}','')">
      <div class="tile-left">
        <img src="${t.cover}" class="tile-thumb" onerror="this.src='vaultify.png'" />
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
function formatClock(sec){ const s = Math.floor(sec || 0); const m = Math.floor(s / 60); const r = s % 60; return `${m}:${r < 10 ? '0' : ''}${r}`; }
function showToast(msg){ const t = document.getElementById('toastPill'); if(!t) return; t.innerText = msg; t.classList.add('show'); clearTimeout(t._tt); t._tt = setTimeout(() => t.classList.remove('show'), 2500); }
function escapeHtml(s){ return String(s).replace(/[&<>"']/g, x => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[x])); }

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
    c.innerHTML = cached.map(t => `<div class="song-tile" onclick="playCached('${t.id.replace(/'/g, "\\'")}')">
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
}

function deletePlaylist(i){
  playlists.splice(i, 1);
  localStorage.setItem('vaultify_playlists', JSON.stringify(playlists));
  renderLibrary();
}

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
  localStorage.setItem('vaultify_playlists', JSON.stringify(playlists));
  showToast(`Added to ${playlists[i].name}`);
  closeModal('modalAddToPlaylist');
}

function createPlaylistAndAdd(){
  const n = document.getElementById('newPlaylistName').value.trim();
  if(!n) return showToast("Enter playlist name");
  const t = currentPlaylist[currentTrackIndex];
  playlists.push({ id: Date.now(), name: n, songs: t ? [t] : [], created: Date.now() });
  localStorage.setItem('vaultify_playlists', JSON.stringify(playlists));
  document.getElementById('newPlaylistName').value = '';
  showToast(`Created: ${n}`);
  closeModal('modalAddToPlaylist');
  if(currentLibraryTab === 'playlists') renderLibrary();
}

/* ═══════════════ AUTH SYSTEM ═══════════════ */
function getUserDB(){ try { return JSON.parse(localStorage.getItem('vaultify_user_db') || '{}'); } catch(e){ return {}; } }
function saveUserDB(db){ localStorage.setItem('vaultify_user_db', JSON.stringify(db)); }

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
}

async function processAuthSubmission(){
  const u = String(document.getElementById('authUsernameInput').value || '').trim().toLowerCase();
  const e = String(document.getElementById('authEmailInput').value || '').trim().toLowerCase();
  const p = document.getElementById('authPasswordInput').value || '';
  const dName = document.getElementById('authDisplayNameInput').value.trim();

  if(!u || !p) return showToast("Username aur password bharo");

  const db = getUserDB();
  if(isLoginMode){
    if(db[u] && db[u].password === p){
      loggedInUser = db[u];
      localStorage.setItem('vaultify_active_user', JSON.stringify(loggedInUser));
      unlockApp(); applyUserDataUI(loggedInUser); updateDynamicUserCounter();
      showToast("✅ Logged in!");
    } else {
      showToast("❌ Incorrect credentials");
    }
  } else {
    if(db[u]) return showToast("❌ Username already taken");
    const newUser = { username: u, email: e, displayName: dName || u, bio: '', password: p, avatar: '', createdAt: Date.now() };
    db[u] = newUser;
    saveUserDB(db);
    loggedInUser = newUser;
    localStorage.setItem('vaultify_active_user', JSON.stringify(loggedInUser));
    unlockApp(); applyUserDataUI(loggedInUser); updateDynamicUserCounter();
    showToast("✅ Account created!");
  }
}

function applyUserDataUI(user){
  if(!user) return;
  const certName = document.getElementById('certOwnerDisplayName');
  const certHandle = document.getElementById('certOwnerHandle');
  const editName = document.getElementById('editDisplayName');
  const editBio = document.getElementById('editBio');
  const avatar = document.getElementById('userAvatarImg');
  if(certName) certName.innerText = user.displayName || user.username;
  if(certHandle) certHandle.innerText = '@' + user.username;
  if(editName) editName.value = user.displayName || user.username;
  if(editBio) editBio.value = user.bio || '';
  if(avatar && user.avatar) avatar.src = user.avatar;
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

/* ═══════════════ RUNNER & UI THEMES ═══════════════ */
function initEmojiRunner(){
  const i = document.getElementById('notchRunnerIcon'); if(!i) return;
  i.innerText = activeEmoji;
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

function setEmojiMode(mode){ emojiMode = mode; localStorage.setItem('vaultify_emoji_mode', mode); initEmojiRunner(); }
function applyThemeScheme(c){
  document.body.className = '';
  if(c !== 'theme-violet') document.body.classList.add(c);
  localStorage.setItem('vaultify_theme', c);
  showToast(`Theme changed!`);
}

function renderNotificationCenter(){
  const list = JSON.parse(localStorage.getItem('vaultify_notifications_list') || '[]');
  const c = document.getElementById('notificationListContainer');
  if(!c) return;
  if(list.length === 0){ c.innerHTML = `<p style="font-size:12px;color:var(--text-sub);text-align:center;padding:24px 0">No notifications.</p>`; return; }
  c.innerHTML = list.map(n => `<div style="background:rgba(255,255,255,.04);border:1px solid var(--border);border-radius:12px;padding:12px;margin-bottom:10px">
    <div style="font-size:13px;font-weight:700;color:#fff">${escapeHtml(n.title)}</div>
    <div style="font-size:11.5px;color:var(--text-sub);line-height:1.4">${escapeHtml(n.message)}</div>
  </div>`).join('');
}

function openNotificationModal(){ openModal('modalNotifications'); }
function clearAllNotifications(){ localStorage.removeItem('vaultify_notifications_list'); renderNotificationCenter(); showToast("Cleared!"); }
function syncLocalCatalog(){ const c = JSON.parse(localStorage.getItem('vaultify_custom_tracks') || '[]'); currentPlaylist = [...c]; }

function handleDuoBroadcastMessage(e){
  const d = e.data; if(!d) return;
  if(d.type === 'SYNC_PLAY' && d.track){
    currentPlaylist.splice(currentTrackIndex + 1, 0, d.track);
    renderHomeQueue();
    playTrack(currentTrackIndex + 1, false);
  } else if(d.type === 'SYNC_TOGGLE'){ togglePlaybackState(false); }
}

// Global Window Exports
Object.assign(window, {
  switchNavTab, switchLibraryTab, openModal, closeModal, openFullPlayer, closeFullPlayer,
  openNotificationModal, clearAllNotifications, executeLiveSearch,
  clearSearchHistory, playSearchedTrackImmediately, playSingleTrackObject,
  playCached, removeCache, openPlaylist, deletePlaylist, playTrack, togglePlaybackState,
  playNext, playPrevious, toggleShuffle, toggleRepeat, toggleSleepTimer, shareCurrentTrack,
  downloadCurrentTrack, toggleLikeCurrent, unlikeSong, toggleVideoCanvasView,
  openAddToPlaylistModal, addToPlaylist, createPlaylistAndAdd,
  setEmojiMode, applyThemeScheme, handleDpUpload, triggerDpPicker, saveProfileData, performAppLogout,
  toggleAuthMode, processAuthSubmission, showToast,
  onNativePlay, onNativePause, onNativeNext, onNativePrev
});
