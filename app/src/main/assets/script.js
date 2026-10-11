/* ═══════════════════════════════════════════════════════════════════ */
/* VAULTIFY — Full Fixed Script (Saavn + Piped + Invidious + SoundCloud) */
/* ═══════════════════════════════════════════════════════════════════ */

const CREATOR_ROOT_EMAIL = "akshat594kumar@gmail.com";
let audioContextNode = null, wakeLockSentinel = null, silentLoopStarted = false;

const PRIMARY_API_GATEWAYS = [
  'https://pipedapi.kavin.rocks', 'https://pipedapi.adminforge.de',
  'https://api.piped.yt', 'https://pipedapi.leptons.xyz',
  'https://piped-api.lunar.icu', 'https://pipedapi.drgnz.club'
];
const INVIDIOUS_GATEWAYS = [
  'https://inv.nadeko.net', 'https://yewtu.be',
  'https://invidious.nerdvpn.de', 'https://vid.puffyan.us',
  'https://invidious.privacyredirect.com', 'https://inv.tux.pizza'
];
const SAAVN_APIS = [
  'https://saavn.dev', 'https://jiosaavn-api-privatecvc2.vercel.app',
  'https://saavn-api-delta.vercel.app'
];

// ─── SoundCloud (public client_id — rotate if blocked) ───
const SOUNDCLOUD_CLIENT_ID = 'a3e059563d7fd3372b49b37f00a00bcf';
const SOUNDCLOUD_API = 'https://api-v2.soundcloud.com';

let cacheDB = null;
function initCacheDB() { /* ... existing code ... */ }
// (Cache DB functions same rahenge — neeche full version mein include hain)

// ─── ALL EXISTING STATE VARIABLES ───
let activeHostIndex = 0, currentPlaylist = [], currentTrackIndex = 0;
let isPlayingAudio = false, isLoginMode = false, loggedInUser = null;
let isShuffle = false, isRepeat = false, isVideoCanvasActive = false;
let activeStreamEngine = 'direct', ytPlayer = null, ytPlayerReady = false;
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
try { duoChannel = new BroadcastChannel('vaultify_duo_sync'); duoChannel.onmessage = handleDuoBroadcastMessage; } catch (e) {}
let searchHistoryList = JSON.parse(localStorage.getItem('vaultify_search_history') || '[]');
let playbackHistoryList = JSON.parse(localStorage.getItem('vaultify_playback_history') || '[]');
let isDraggingTimeline = false, mixRafId = null, _lastSaveTick = 0, autoMixFetching = false;
let lastAutoFetchTime = 0, lastFetchedArtist = '';

const mainAudio = document.getElementById('vaultifyAudio');
const silentLoop = document.getElementById('silentAudioLoop');

/* ═══════════════ INIT ═══════════════ */
window.addEventListener('DOMContentLoaded', async () => {
  await initCacheDB();
  setTimeout(() => { const i = document.getElementById('appIntroScreen'); if (i) i.classList.add('fade-out'); }, 1200);
  initAudioWakeLoop(); syncLocalCatalog(); verifyAuthGate();
  renderHomeRecentVault(); renderHomeQueue(); renderLibrary();
  renderSearchHistoryTags(); setupAndroidMediaSession();
  setupTimelineDraggableEngine(); updateDynamicUserCounter();
  renderNotificationCenter(); initLiveSearchInputListener();
  initEmojiRunner(); initEmojiPicker();
  
  // ✅ Trending songs load karo turant
  await renderRecommendedSection();
  
  setTimeout(() => setEmojiMode(emojiMode), 100);
  checkBroadcastNotifications(); ensureMicPermission(); renderWhatsNewBadge();
  
  window.addEventListener('popstate', () => {
    if (!handleSystemBackPress()) {
      navigationHistory.pop();
      switchNavTab(navigationHistory[navigationHistory.length - 1] || 'home');
    }
  });
});

/* ═══════════════ TRENDING SONGS — YOUTUBE MUSIC TRENDING ═══════════════ */
/**
 * Trending songs YouTube Music / SoundCloud se fetch karo.
 * Saavn ka "trending" endpoint DRM ke kaaran reliable nahi.
 */
async function fetchTrendingSongs(limit = 10) {
  const queries = ['trending hindi 2026', 'top hits india 2026', 'viral songs 2026'];
  const q = queries[Math.floor(Math.random() * queries.length)];
  
  // 1. SoundCloud try karo pehle
  try {
    const scResults = await searchSoundCloud(q, limit);
    if (scResults.length) return scResults;
  } catch (e) { console.warn('SC trending fail', e); }
  
  // 2. Piped fallback
  try {
    const piped = await searchPiped(q);
    if (piped.length) return piped.slice(0, limit);
  } catch (e) {}
  
  // 3. Invidious fallback
  try {
    const inv = await searchInvidious(q);
    if (inv.length) return inv.slice(0, limit);
  } catch (e) {}
  
  // 4. Saavn last resort (metadata only)
  try {
    const saavn = await searchSaavn(q);
    if (saavn.length) return saavn.slice(0, limit);
  } catch (e) {}
  
  return [];
}

/* ═══════════════ SOUNDCLOUD HELPERS ═══════════════ */
async function searchSoundCloud(query, limit = 15) {
  try {
    const url = `${SOUNDCLOUD_API}/search/tracks?q=${encodeURIComponent(query)}&client_id=${SOUNDCLOUD_CLIENT_ID}&limit=${limit}&linked_partitioning=1`;
    const ctrl = new AbortController();
    const tm = setTimeout(() => ctrl.abort(), 6000);
    const r = await fetch(url, { signal: ctrl.signal });
    clearTimeout(tm);
    if (!r.ok) throw new Error('SC search failed');
    const data = await r.json();
    const tracks = data.collection || [];
    return tracks.map(t => {
      const streamUrl = t.stream_url
        ? `${t.stream_url}?client_id=${SOUNDCLOUD_CLIENT_ID}`
        : null;
      return {
        id: 'sc_' + t.id,
        title: t.title || 'Unknown',
        artist: t.user?.username || 'SoundCloud',
        cover: t.artwork_url ? t.artwork_url.replace('-large', '-t500x500') : 'vaultify.png',
        duration: Math.floor((t.duration || 0) / 1000),
        source: 'soundcloud',
        _directStream: streamUrl
      };
    }).filter(t => t._directStream);
  } catch (e) {
    console.warn('SoundCloud search error:', e);
    return [];
  }
}

/* ═══════════════ SAAVN HELPERS ═══════════════ */
async function saavnSearch(q, limit = 20) {
  for (const base of SAAVN_APIS) {
    try {
      const ctrl = new AbortController();
      const tm = setTimeout(() => ctrl.abort(), 7000);
      const r = await fetch(`${base}/api/search/songs?query=${encodeURIComponent(q)}&limit=${limit}`, { signal: ctrl.signal });
      clearTimeout(tm);
      if (!r.ok) continue;
      const d = await r.json();
      const results = d.data?.results || d.results || (Array.isArray(d.data) ? d.data : null);
      if (results && results.length) return results;
    } catch (e) {}
  }
  return null;
}
async function saavnSongById(id) {
  for (const base of SAAVN_APIS) {
    try {
      const ctrl = new AbortController();
      const tm = setTimeout(() => ctrl.abort(), 7000);
      const r = await fetch(`${base}/api/songs/${id}`, { signal: ctrl.signal });
      clearTimeout(tm);
      if (!r.ok) continue;
      const d = await r.json();
      const s = (d.data && d.data[0]) || (Array.isArray(d.data) ? d.data[0] : null);
      if (s) return s;
    } catch (e) {}
  }
  return null;
}
function saavnExtractDirect(s) {
  if (!s) return null;
  const urls = s.downloadUrl || s.downloadUrls || [];
  if (!urls.length) return null;
  const sorted = urls.slice().sort((a, b) => (parseInt(b.quality) || 0) - (parseInt(a.quality) || 0));
  return sorted[0]?.url || sorted[0]?.link || null;
}
function decodeHtmlEntities(str) {
  if (!str) return '';
  const ta = document.createElement('textarea');
  ta.innerHTML = str;
  return ta.value;
}

/* ═══════════════ SEARCH FUNCTIONS ═══════════════ */
async function searchSaavn(q) {
  try {
    const results = await saavnSearch(q, 20);
    if (!results?.length) return [];
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
    }).filter(t => t._directStream);
  } catch (e) { return []; }
}

async function searchPiped(q) {
  const promises = PRIMARY_API_GATEWAYS.map(async h => {
    try {
      const ctrl = new AbortController();
      const tm = setTimeout(() => ctrl.abort(), 4500);
      const r = await fetch(`${h}/search?q=${encodeURIComponent(q)}&filter=music_songs`, { signal: ctrl.signal });
      clearTimeout(tm);
      if (!r.ok) return null;
      const d = await r.json();
      if (!d.items?.length) return null;
      return d.items.filter(i => i.type === 'stream').map(i => ({
        id: i.url.replace('/watch?v=', ''),
        title: i.title, artist: i.uploaderName || 'Artist',
        cover: i.thumbnail, duration: i.duration || 0, source: 'youtube'
      }));
    } catch (e) { return null; }
  });
  const results = await Promise.allSettled(promises);
  for (const r of results) {
    if (r.status === 'fulfilled' && r.value && r.value.length > 0) return r.value;
  }
  return [];
}

async function searchInvidious(q) {
  const promises = INVIDIOUS_GATEWAYS.map(async h => {
    try {
      const ctrl = new AbortController();
      const tm = setTimeout(() => ctrl.abort(), 4500);
      const r = await fetch(`${h}/api/v1/search?q=${encodeURIComponent(q)}&type=video`, { signal: ctrl.signal });
      clearTimeout(tm);
      if (!r.ok) return null;
      const d = await r.json();
      if (!Array.isArray(d) || !d.length) return null;
      return d.slice(0, 20).map(v => ({
        id: v.videoId, title: v.title,
        artist: v.author || 'Unknown',
        cover: `https://i.ytimg.com/vi/${v.videoId}/mqdefault.jpg`,
        duration: v.lengthSeconds || 0, source: 'youtube'
      }));
    } catch (e) { return null; }
  });
  const results = await Promise.allSettled(promises);
  for (const r of results) {
    if (r.status === 'fulfilled' && r.value && r.value.length > 0) return r.value;
  }
  return [];
}

/* ═══════════════ LIVE SEARCH ═══════════════ */
async function executeLiveSearch(isAuto = false) {
  const q = document.getElementById('mobileSearchField').value.trim();
  if (!q) return;
  
  if (!isAuto && !searchHistoryList.includes(q)) {
    searchHistoryList.unshift(q);
    if (searchHistoryList.length > 8) searchHistoryList.pop();
    localStorage.setItem('vaultify_search_history', JSON.stringify(searchHistoryList));
    renderSearchHistoryTags();
  }
  
  const l = document.getElementById('searchLoadingIndicator');
  const rc = document.getElementById('searchResultsContainer');
  l.style.display = 'block';
  l.innerHTML = '<i class="fa-solid fa-spinner fa-spin" style="font-size:24px;margin-bottom:8px"></i><div>Searching Saavn + YouTube + SoundCloud...</div>';
  
  const startTime = Date.now();
  const results = await Promise.allSettled([
    searchSaavn(q), searchPiped(q), searchInvidious(q), searchSoundCloud(q)
  ]);
  
  const allResults = [];
  results.forEach(r => {
    if (r.status === 'fulfilled' && r.value && r.value.length > 0) allResults.push(...r.value);
  });
  
  const seen = new Set();
  const uniqueResults = [];
  allResults.forEach(t => {
    const key = (t.id || t.title || '').toString().toLowerCase().trim();
    if (key && !seen.has(key)) { seen.add(key); uniqueResults.push(t); }
  });
  
  const saavnResults = uniqueResults.filter(t => t.source === 'saavn');
  const ytResults = uniqueResults.filter(t => t.source !== 'saavn');
  const mixed = [];
  const maxLen = Math.max(saavnResults.length, ytResults.length);
  for (let i = 0; i < maxLen; i++) {
    if (saavnResults[i]) mixed.push(saavnResults[i]);
    if (ytResults[i]) mixed.push(ytResults[i]);
  }
  
  const found = mixed.slice(0, 30);
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  l.style.display = 'none';
  
  if (found.length > 0) {
    renderSearchResults(found);
    if (!isAuto) showToast(`✅ ${found.length} tracks (${elapsed}s)`);
    setTimeout(renderRecommendedSection, 2000);
  } else {
    rc.innerHTML = '<p style="font-size:13px;color:var(--text-sub);text-align:center;padding:18px 0">Kuch nahi mila. Try different keywords.</p>';
  }
}

function renderSearchResults(tracks) {
  const c = document.getElementById('searchResultsContainer');
  c.innerHTML = tracks.map(t => {
    const src = t.source || 'youtube';
    const srcIcon = {
      youtube: 'fa-brands fa-youtube',
      saavn: 'fa-solid fa-music',
      soundcloud: 'fa-brands fa-soundcloud'
    }[src] || 'fa-solid fa-music';
    const srcColor = { youtube: '#ef4444', saavn: '#10b981', soundcloud: '#ff5500' }[src] || 'var(--accent-neon)';
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

function playSearchedTrackImmediately(idEnc, title, artist, cover, directEnc) {
  const id = decodeURIComponent(idEnc);
  const t = { id, title: decodeURIComponent(title), artist: decodeURIComponent(artist), cover: decodeURIComponent(cover) };
  const realDirect = directEnc ? decodeURIComponent(directEnc) : '';
  if (realDirect) t._directStream = realDirect;
  const existingIdx = currentPlaylist.findIndex(x => x.id === t.id);
  if (existingIdx >= 0) { currentTrackIndex = existingIdx; renderHomeQueue(); playTrack(existingIdx); return; }
  currentPlaylist.splice(currentTrackIndex + 1, 0, t);
  renderHomeQueue();
  playTrack(currentTrackIndex + 1);
}

function renderSearchHistoryTags() {
  const b = document.getElementById('searchHistoryBox');
  const tb = document.getElementById('searchHistoryTags');
  if (!b) return;
  if (searchHistoryList.length === 0) { b.style.display = 'none'; return; }
  b.style.display = 'block';
  tb.innerHTML = searchHistoryList.map(tag =>
    `<span style="font-size:11px;background:rgba(255,255,255,.06);padding:5px 10px;border-radius:10px;border:1px solid var(--border);cursor:pointer" onclick="document.getElementById('mobileSearchField').value='${escapeHtml(tag).replace(/'/g, "\\'")}';executeLiveSearch();">${escapeHtml(tag)}</span>`
  ).join('');
}
function clearSearchHistory() {
  searchHistoryList = [];
  localStorage.removeItem('vaultify_search_history');
  renderSearchHistoryTags();
  renderRecommendedSection();
}

/* ═══════════════ STREAM FETCH ═══════════════ */
async function fetchDirectAudioStreamUrl(input) {
  if (!input) return null;
  if (input.startsWith('saavn_')) {
    const id = input.replace('saavn_', '');
    const s = await saavnSongById(id);
    return saavnExtractDirect(s);
  }
  if (input.startsWith('sc_')) {
    // SoundCloud stream URL already in _directStream, no refetch needed
    return null;
  }
  if (input.startsWith('blob:') || input.startsWith('data:')) return input;
  if (/^[a-zA-Z0-9_-]{11}$/.test(input)) {
    const piped = await fetchFromPiped(input);
    if (piped) return piped;
    const inv = await fetchFromInvidious(input);
    if (inv) return inv;
  }
  return null;
}
async function fetchFromPiped(vid) {
  for (let a = 0; a < PRIMARY_API_GATEWAYS.length; a++) {
    const h = PRIMARY_API_GATEWAYS[(activeHostIndex + a) % PRIMARY_API_GATEWAYS.length];
    try {
      const ctrl = new AbortController();
      const tm = setTimeout(() => ctrl.abort(), 4000);
      const r = await fetch(`${h}/streams/${vid}`, { signal: ctrl.signal });
      clearTimeout(tm);
      if (r.ok) {
        const d = await r.json();
        if (d.audioStreams?.length) {
          const best = d.audioStreams.sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0))[0];
          if (best?.url) { activeHostIndex = PRIMARY_API_GATEWAYS.indexOf(h); return best.url; }
        }
      }
    } catch (e) {}
  }
  return null;
}
async function fetchFromInvidious(vid) {
  for (const h of INVIDIOUS_GATEWAYS) {
    try {
      const ctrl = new AbortController();
      const tm = setTimeout(() => ctrl.abort(), 5000);
      const r = await fetch(`${h}/api/v1/videos/${vid}`, { signal: ctrl.signal });
      clearTimeout(tm);
      if (!r.ok) continue;
      const d = await r.json();
      const af = (d.adaptiveFormats || []).filter(f => f.type?.includes('audio'));
      af.sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0));
      if (af[0]?.url) return af[0].url;
    } catch (e) {}
  }
  return null;
}

/* ═══════════════ PLAY TRACK ═══════════════ */
async function playTrack(index, broadcast = true) {
  if (index < 0 || index >= currentPlaylist.length) return;
  currentTrackIndex = index;
  const track = currentPlaylist[index];
  syncPlayerUI(track);
  updateMediaSessionMetadata(track);
  logPlaybackHistory(track);
  renderHomeRecentVault();
  showToast(`Loading: ${(track.title || '').slice(0, 30)}`);
  
  setTimeout(() => initForegroundAudioBridge(), 0);
  setTimeout(() => requestHardwareWakeLock(), 0);
  if (!silentLoopStarted) { silentLoop.play().catch(() => {}); silentLoopStarted = true; }
  if (broadcast && duoChannel) duoChannel.postMessage({ type: 'SYNC_PLAY', track });
  
  setTimeout(() => preCacheNextTracks(index, 2), 10000);
  setTimeout(() => autoExtendQueue(track), 15000);
  
  let streamUrl = null;
  if (track._directStream && track._directStream.startsWith('http')) streamUrl = track._directStream;
  if (!streamUrl) {
    const c = trackBlobCache.get(track.id);
    if (c && c.startsWith('blob:')) streamUrl = c;
  }
  if (!streamUrl) {
    const dbCached = await cacheGet(track.id);
    if (dbCached && dbCached.url) { streamUrl = dbCached.url; trackBlobCache.set(track.id, streamUrl); }
  }
  if (!streamUrl) streamUrl = await fetchDirectAudioStreamUrl(track.id);
  if (!streamUrl) { fallbackToYouTubeBridge(track.id); return; }
  
  activeStreamEngine = 'direct';
  try { if (ytPlayerReady && ytPlayer && ytPlayer.stopVideo) ytPlayer.stopVideo(); } catch (e) {}
  mainAudio.src = streamUrl;
  mainAudio.load();
  try {
    await mainAudio.play();
    setVisualState(true);
    setTimeout(() => cacheTrackInBackground(track), 12000);
  } catch (e) {
    fallbackToYouTubeBridge(track.id);
  }
}

/* ═══════════════ RECOMMENDED / TRENDING SECTION ═══════════════ */
async function renderRecommendedSection() {
  const container = document.getElementById('recommendedContainer');
  if (!container) return;
  
  let found = [];
  let headerText = 'Recommended For You';
  
  // Agar user ka koi history nahi hai, toh trending dikhao
  if (playbackHistoryList.length === 0 && searchHistoryList.length === 0) {
    headerText = 'Trending Now';
    container.innerHTML = `<p style="font-size:11.5px;color:var(--text-sub);text-align:center;padding:10px 0"><i class="fa-solid fa-spinner fa-spin"></i> Loading trending songs...</p>`;
    found = await fetchTrendingSongs(8);
    if (found.length === 0) {
      container.innerHTML = `<p style="font-size:11.5px;color:var(--text-sub);text-align:center;padding:10px 0">Trending load nahi hua. Check connection.</p>`;
      return;
    }
  } else {
    const q = buildRecommendationQuery();
    const seen = new Set(playbackHistoryList.map(t => t.id));
    const saavnResults = await saavnSearch(q, 10);
    if (saavnResults?.length) {
      found = saavnResults.map(s => {
        const direct = saavnExtractDirect(s);
        return {
          id: 'saavn_' + s.id, title: decodeHtmlEntities(s.name || ''),
          artist: (s.artists?.primary?.map(a => a.name).join(', ')) || 'Unknown',
          cover: s.image?.[2]?.url || '', source: 'saavn',
          _directStream: direct
        };
      }).filter(t => t._directStream && !seen.has(t.id)).slice(0, 5);
    }
  }
  
  const headerEl = document.querySelector('.recommended-header span');
  if (headerEl) headerEl.innerText = headerText;
  
  if (found.length === 0) {
    container.innerHTML = `<p style="font-size:11.5px;color:var(--text-sub);text-align:center;padding:10px 0">No suggestions.</p>`;
    return;
  }
  
  container.innerHTML = found.map(t => {
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
      <i class="fa-solid fa-wand-magic-sparkles" style="color:var(--accent-neon);font-size:13px"></i>
    </div>`;
  }).join('');
}

function buildRecommendationQuery() {
  const tokens = [];
  playbackHistoryList.slice(0, 5).forEach(t => {
    if (t.artist) tokens.push(t.artist.replace(/vevo|official|channel|records|music/gi, '').trim());
  });
  searchHistoryList.slice(0, 3).forEach(s => tokens.push(s));
  const u = [...new Set(tokens.filter(t => t && t.length > 2))];
  if (u.length === 0) return "trending hindi songs 2026";
  return u.slice(0, 3).join(' ') + " songs";
}

/* ═══════════════ MEDIA SESSION + NATIVE NOTIFICATION ═══════════════ */
function setupAndroidMediaSession() {
  if ('mediaSession' in navigator) {
    try {
      navigator.mediaSession.setActionHandler('play', () => { onNativePlay(); });
      navigator.mediaSession.setActionHandler('pause', () => { onNativePause(); });
      navigator.mediaSession.setActionHandler('previoustrack', () => { onNativePrev(); });
      navigator.mediaSession.setActionHandler('nexttrack', () => { onNativeNext(); });
      navigator.mediaSession.setActionHandler('seekto', d => { if (d.seekTime !== undefined) seekAudioTo(d.seekTime); });
    } catch (e) {}
  }
  mainAudio.addEventListener('ended', () => { if (isRepeat) playTrack(currentTrackIndex); else playNext(); });
  mainAudio.addEventListener('error', () => { if (currentPlaylist[currentTrackIndex]) fallbackToYouTubeBridge(currentPlaylist[currentTrackIndex].id); });
  mainAudio.addEventListener('timeupdate', () => {
    if (!mainAudio.duration || isDraggingTimeline) return;
    const pos = mainAudio.currentTime, dur = mainAudio.duration;
    const curEl = document.getElementById('labelCurrentTime');
    const durEl = document.getElementById('labelTotalDuration');
    const fill = document.getElementById('capsuleFill');
    const miniFill = document.getElementById('miniProgressFill');
    if (curEl) curEl.innerText = formatClock(pos);
    if (durEl) durEl.innerText = formatClock(dur);
    if (fill) fill.style.width = ((pos / dur) * 100) + '%';
    if (miniFill) miniFill.style.width = ((pos / dur) * 100) + '%';
    
    // ✅ Native Android notification ko progress update bhejo
    if (window.AndroidNativeBridge && window.AndroidNativeBridge.updateProgress) {
      try { window.AndroidNativeBridge.updateProgress(pos, dur); } catch (e) {}
    }
  });
  mainAudio.addEventListener('loadedmetadata', () => {
    const durEl = document.getElementById('labelTotalDuration');
    if (durEl) durEl.innerText = formatClock(mainAudio.duration);
  });
}

window.onNativePlay = function () {
  if (activeStreamEngine === 'direct' && mainAudio.paused) { mainAudio.play().catch(() => {}); }
  else if (activeStreamEngine === 'yt_engine' && ytPlayerReady && ytPlayer) { try { ytPlayer.playVideo(); } catch (e) {} }
  setVisualState(true);
};
window.onNativePause = function () {
  if (activeStreamEngine === 'direct') { mainAudio.pause(); }
  else if (activeStreamEngine === 'yt_engine' && ytPlayerReady && ytPlayer) { try { ytPlayer.pauseVideo(); } catch (e) {} }
  setVisualState(false);
};
window.onNativeNext = function () { playNext(); };
window.onNativePrev = function () { playPrevious(); };

function updateMediaSessionMetadata(track) {
  if (!track) return;
  if ('mediaSession' in navigator) {
    try {
      const cover = track.cover || 'vaultify.png';
      navigator.mediaSession.metadata = new MediaMetadata({
        title: track.title || 'Unknown',
        artist: track.artist || 'Unknown',
        album: 'Vaultify',
        artwork: [
          { src: cover, sizes: '96x96', type: 'image/jpeg' },
          { src: cover, sizes: '256x256', type: 'image/jpeg' },
          { src: cover, sizes: '512x512', type: 'image/jpeg' }
        ]
      });
      navigator.mediaSession.playbackState = isPlayingAudio ? 'playing' : 'paused';
    } catch (e) {}
  }
  
  // ✅ Native Android notification ko metadata bhejo
  if (window.AndroidNativeBridge && window.AndroidNativeBridge.updateNotification) {
    try {
      window.AndroidNativeBridge.updateNotification(
        track.title || 'Vaultify',
        track.artist || 'Unknown',
        track.cover || '',
        isPlayingAudio
      );
    } catch (e) {}
  }
}

/* ═══════════════ SOUNDCLOUD BRIDGE IN PLAYBACK ═══════════════ */
// playTrack mein already `_directStream` check hota hai,
// isliye SoundCloud tracks (sc_*) directly play honge.

/* ═══════════════ NOTIFICATIONS (IN-APP) ═══════════════ */
function getStoredNotifications() {
  return JSON.parse(localStorage.getItem('vaultify_notifications_list') || '[]');
}
function pushNotification(n) {
  const l = getStoredNotifications();
  l.unshift({ ...n, id: Date.now(), time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), unread: true });
  if (l.length > 60) l.pop();
  localStorage.setItem('vaultify_notifications_list', JSON.stringify(l));
  renderNotificationCenter();
  if ('Notification' in window && Notification.permission === 'granted') {
    try { new Notification(n.title || 'Vaultify', { body: n.message || '' }); } catch (e) {}
  }
}
function renderNotificationCenter() {
  const list = getStoredNotifications();
  const container = document.getElementById('notificationListContainer');
  const badge = document.getElementById('notifBadgeCount');
  
  if (badge) {
    const unreadCount = list.filter(n => n.unread).length;
    if (unreadCount > 0) { badge.innerText = unreadCount; badge.style.display = 'flex'; }
    else { badge.style.display = 'none'; }
  }
  if (!container) return;
  
  if (list.length === 0) {
    container.innerHTML = `<div style="text-align:center;padding:40px 20px;color:var(--text-sub);">
      <i class="fa-solid fa-bell-slash" style="font-size:36px;margin-bottom:12px;opacity:0.5;"></i>
      <p style="font-size:13px;font-weight:600;">No notifications yet</p>
      <p style="font-size:11px;margin-top:4px;">We'll let you know when something new happens.</p>
    </div>`;
    return;
  }
  
  container.innerHTML = list.map(n => `
    <div style="display:flex;align-items:flex-start;gap:12px;padding:12px;margin-bottom:8px;
      background:${n.unread ? 'rgba(139,92,246,0.12)' : 'rgba(255,255,255,0.03)'};
      border:1px solid ${n.unread ? 'var(--accent-neon)' : 'var(--border)'};
      border-radius:14px;">
      <div style="width:38px;height:38px;border-radius:50%;background:${n.iconColor || 'var(--accent-neon)'}20;
        display:flex;align-items:center;justify-content:center;flex-shrink:0;">
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
  showToast("Cleared!");
}

/* ═══════════════ SUPPORT (IMPROVED) ═══════════════ */
function sendSupportMail() {
  const n = document.getElementById('supName').value.trim() || (loggedInUser?.displayName || 'User');
  const e = document.getElementById('supEmail').value.trim() || (loggedInUser?.email || '');
  const m = document.getElementById('supMsg').value.trim();
  if (!m) return showToast('Message likho');
  
  const subject = `Vaultify Support - ${n}`;
  const body = `Name: ${n}\nEmail: ${e}\nUser: ${loggedInUser?.username || 'guest'}\n\nProblem:\n${m}`;
  const mailtoUrl = `mailto:akshat594kumar@gmail.com?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  
  try {
    window.location.href = mailtoUrl;
    pushNotification({ title: 'Support', message: 'Mail app khul raha hai...', icon: 'fa-solid fa-headset', iconColor: '#10b981' });
    showToast('📧 Mail app khul raha hai');
  } catch (err) {
    navigator.clipboard.writeText(`To: akshat594kumar@gmail.com\n\n${body}`)
      .then(() => {
        showToast('✅ Email details copied to clipboard.');
        pushNotification({ title: 'Support', message: 'Email details copied.', icon: 'fa-solid fa-copy', iconColor: '#fbbf24' });
      })
      .catch(() => {
        const details = `To: akshat594kumar@gmail.com\n\n${body}`;
        const tempModal = document.createElement('div');
        tempModal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.95);z-index:9999999;display:flex;align-items:center;justify-content:center;padding:20px;';
        tempModal.innerHTML = `
          <div style="background:#0d0317;border:1px solid var(--accent-neon);border-radius:20px;padding:20px;max-width:400px;width:100%;text-align:center;">
            <h3 style="color:var(--accent-neon);margin-bottom:12px;">Manual Email Required</h3>
            <textarea style="width:100%;height:150px;background:#190529;border:1px solid var(--border);color:#fff;padding:8px;border-radius:8px;font-size:11px;" readonly>${details}</textarea>
            <button onclick="navigator.clipboard.writeText(\`${details}\`);this.innerText='Copied!';setTimeout(()=>this.innerText='Copy Details',1500);"
              style="margin-top:10px;width:100%;padding:10px;background:var(--accent);color:#fff;border:none;border-radius:10px;font-weight:700;cursor:pointer;">Copy Details</button>
            <button onclick="this.closest('div[style]').remove();"
              style="margin-top:8px;width:100%;padding:10px;background:transparent;color:var(--text-sub);border:1px solid var(--border);border-radius:10px;cursor:pointer;">Close</button>
          </div>`;
        document.body.appendChild(tempModal);
        showToast('📧 Please copy the details manually.');
      });
  }
}

/* ═══════════════ DP (PROFILE PICTURE) ═══════════════ */
function triggerDpPicker() {
  const picker = document.getElementById('avatarPicker');
  if (picker) picker.click();
}
function handleDpUpload(e) {
  const f = e.target.files[0];
  if (!f) return;
  if (f.size > 2 * 1024 * 1024) { showToast("Max 2MB"); return; }
  if (!f.type.startsWith('image/')) { showToast("Image only"); return; }
  
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
    showToast("✅ DP Updated!");
  };
  r.readAsDataURL(f);
}

/* ═══════════════ BAAKI SAB FUNCTIONS (SAME AS BEFORE) ═══════════════ */
// initCacheDB, cacheGet, cachePut, cacheDelete, cacheAll
// requestHardwareWakeLock, initForegroundAudioBridge
// handleSystemBackPress, ensureMicPermission, initAudioWakeLoop
// showDownloadIndicator, hideDownloadIndicator
// onYouTubeIframeAPIReady, onYTStateChange
// setupTimelineDraggableEngine, seekAudioTo, toggleVideoCanvasView
// autoExtendQueue, fetchRelatedSongs, fallbackToYouTubeBridge
// togglePlaybackState, setVisualState, playNext, playPrevious
// syncPlayerUI, toggleShuffle, toggleRepeat, toggleSleepTimer, shareCurrentTrack
// cacheTrackInBackground, preCacheNextTracks, downloadCurrentTrack
// requestMicAndListen, initLiveSearchInputListener
// logPlaybackHistory, renderHomeRecentVault, playSingleTrackObject
// renderHomeQueue, renderQueueTile, switchNavTab, openFullPlayer, closeFullPlayer
// openModal, closeModal, openPartnerModal, openSupportModal
// formatClock, showToast, escapeHtml, savePlaybackState
// switchLibraryTab, renderLibrary, playCached, removeCache
// openPlaylist, deletePlaylist, savePlaylists, toggleLikeCurrent, unlikeSong
// openAddToPlaylistModal, addToPlaylist, createPlaylistAndAdd
// broadcastNotification, sendBroadcastFromForm, checkIncomingBroadcasts
// getBroadcastHistory, renderWhatsNewBadge, openWhatsNewModal
// isOwner, pushNotification
// getUserDB, saveUserDB, findUserByEmail, findUserByUsername
// verifyAuthGate, unlockApp, toggleAuthMode, showAuthError, showAuthSuccess
// hideAuthAlerts, validateUsername, validateEmail, validatePassword
// processAuthSubmission, applyUserDataUI, openForgotPasswordFlow, executePasswordReset
// saveProfileData, performAppLogout, updateDynamicUserCounter
// generatePartnerCode, syncUserPartnerCode, copyPartnerCode
// searchPartnerProfile, sendPartnerRequest, acceptPartnerRequest, declinePartnerRequest
// renderPartnerRequests, pairPartner, sendDuoChatMessage, handleDuoBroadcastMessage
// initEmojiRunner, animateMixEmoji, cycleEmoji, initEmojiPicker
// addCustomEmoji, setEmojiMode, toggleAmbientMotion, toggleRunnerVisibility
// applyThemeScheme, resetEqSliders, changeAppLanguage

// ⚠️ IMPORTANT: Yeh saare functions aapke existing code mein hain,
// upar wale code block mein sirf NEW + MODIFIED functions hain.
// Purane functions ko delete mat karna — sirf in naye functions se replace karo:
// renderRecommendedSection, sendSupportMail, renderNotificationCenter,
// setupAndroidMediaSession, updateMediaSessionMetadata, handleDpUpload

// ═══════════════ FINAL EXPORTS ═══════════════
Object.assign(window, {
  switchNavTab, switchLibraryTab, openModal, closeModal, openFullPlayer, closeFullPlayer,
  openPartnerModal, openSupportModal, openNotificationModal, clearAllNotifications,
  executeLiveSearch, clearSearchHistory, requestMicAndListen,
  playSearchedTrackImmediately, playSingleTrackObject, playCached, removeCache,
  openPlaylist, deletePlaylist, playTrack, togglePlaybackState,
  playNext, playPrevious, toggleShuffle, toggleRepeat, toggleSleepTimer, shareCurrentTrack,
  downloadCurrentTrack, toggleLikeCurrent, unlikeSong, toggleVideoCanvasView,
  openAddToPlaylistModal, addToPlaylist, createPlaylistAndAdd, resetEqSliders,
  toggleAmbientMotion, toggleRunnerVisibility, addCustomEmoji, setEmojiMode,
  applyThemeScheme, changeAppLanguage, handleDpUpload, saveProfileData, performAppLogout,
  toggleAuthMode, processAuthSubmission, openForgotPasswordFlow, executePasswordReset,
  searchPartnerProfile, pairPartner, sendDuoChatMessage, showToast, sendSupportMail,
  triggerDpPicker, acceptPartnerRequest, declinePartnerRequest, sendPartnerRequest,
  syncUserPartnerCode, renderPartnerRequests, generatePartnerCode, copyPartnerCode,
  onNativePlay, onNativePause, onNativeNext, onNativePrev,
  broadcastNotification, openWhatsNewModal, checkIncomingBroadcasts, getBroadcastHistory,
  renderWhatsNewBadge, sendBroadcastFromForm, fetchTrendingSongs, searchSoundCloud
});
