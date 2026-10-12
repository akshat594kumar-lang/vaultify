/* ═══════════════════════════════════════════════════════════════ */
/* VAULTIFY — MUSIC SYSTEM (SAAVN ONLY)                            */
/* YouTube gateways dead hain, isliye Saavn use kar rahe hain      */
/* Background play 100% working                                    */
/* ═══════════════════════════════════════════════════════════════ */

const SAAVN_APIS = [
  'https://saavn.dev',
  'https://jiosaavn-api-privatecvc2.vercel.app',
  'https://saavn-api-delta.vercel.app'
];

/* ═══════════ STATE ═══════════ */
let currentPlaylist = [];
let currentTrackIndex = 0;
let isPlayingAudio = false;
let isShuffle = false;
let isRepeat = false;
let currentLanguage = 'hindi';
let appLanguage = localStorage.getItem('vaultify_app_lang') || 'en';
let currentLibraryTab = 'history';
let playlists = JSON.parse(localStorage.getItem('vaultify_playlists') || '[]');
let likedSongs = JSON.parse(localStorage.getItem('vaultify_liked') || '[]');
let searchHistoryList = JSON.parse(localStorage.getItem('vaultify_search_history') || '[]');
let playbackHistoryList = JSON.parse(localStorage.getItem('vaultify_playback_history') || '[]');

const trackBlobCache = new Map();

let isDraggingTimeline = false;
let autoMixFetching = false;
let lastAutoFetchTime = 0;
let lastFetchedArtist = '';
let _lastSaveTick = 0;

let cacheDB = null;
let audioContextNode = null;
let wakeLockSentinel = null;
let silentLoopStarted = false;
let eqNodes = null;
let eqSourceNode = null;

const mainAudio = document.getElementById('vaultifyAudio');
const silentLoop = document.getElementById('silentAudioLoop');

/* ═══════════ LANGUAGE DETECTION ═══════════ */
const HINDI_CHARS = /[\u0900-\u097F]/;
const URDU_CHARS = /[\u0600-\u06FF]/;
const PUNJABI_CHARS = /[\u0A00-\u0A7F]/;

function detectLanguage(text) {
  if (!text) return 'hindi';
  if (HINDI_CHARS.test(text)) return 'hindi';
  if (URDU_CHARS.test(text)) return 'urdu';
  if (PUNJABI_CHARS.test(text)) return 'punjabi';
  const lower = text.toLowerCase();
  const hindiKeywords = ['arijit', 'atif', 'shreya', 'sonu', 'kishore', 'lata', 'asha', 'rafi', 'kumar sanu', 'udit', 'alka', 'sunidhi', 'neha kakkar', 'honey singh', 'badshah', 'diljit', 'guru randhawa', 'jass manak', 'karan aujla', 'ap dhillon', 'sidhu moose', 'divine', 'emiway', 'raftaar', 'jubin', 'darshan raval', 'armaan malik', 'sonakshi', 'tony kakkar', 'rahat fateh', 'nusrat', 'coke studio', 'bollywood', 'hindi', 'desi', 'punjabi', 'pal pal', 'aur', 'vital signs'];
  const englishKeywords = ['taylor swift', 'ed sheeran', 'drake', 'justin bieber', 'ariana grande', 'billie eilish', 'post malone', 'the weeknd', 'eminem', 'rihanna', 'adele', 'bruno mars', 'coldplay', 'imagine dragons', 'maroon 5', 'edm', 'pop', 'rock', 'english', 'western'];
  let h = 0, e = 0;
  hindiKeywords.forEach(k => { if (lower.includes(k)) h++; });
  englishKeywords.forEach(k => { if (lower.includes(k)) e++; });
  return h >= e ? 'hindi' : 'english';
}

function getLanguageQueries(lang) {
  if (lang === 'hindi') return ['arijit singh hits', 'atif aslam songs', 'bollywood hits 2026', 'punjabi hits', 'new hindi songs', 'romantic hindi'];
  if (lang === 'urdu') return ['atif aslam hits', 'coke studio pakistan', 'nusrat fateh ali', 'rahat fateh ali khan', 'aur band'];
  if (lang === 'punjabi') return ['diljit dosanjh', 'ap dhillon', 'karan aujla', 'sidhu moose wala', 'punjabi hits'];
  return ['top english hits', 'taylor swift', 'ed sheeran', 'pop hits', 'billboard'];
}

/* ═══════════ CACHE (IndexedDB) ═══════════ */
function initCacheDB() {
  return new Promise(resolve => {
    try {
      const req = indexedDB.open('vaultify_cache', 2);
      req.onupgradeneeded = e => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains('songs')) {
          db.createObjectStore('songs', { keyPath: 'id' });
        }
      };
      req.onsuccess = e => {
        cacheDB = e.target.result;
        resolve(cacheDB);
      };
      req.onerror = () => resolve(null);
    } catch (e) {
      resolve(null);
    }
  });
}

function cacheGet(id) {
  return new Promise(resolve => {
    if (!cacheDB) return resolve(null);
    try {
      const rq = cacheDB.transaction('songs', 'readonly').objectStore('songs').get(id);
      rq.onsuccess = () => {
        const x = rq.result;
        if (!x) return resolve(null);
        try {
          if (x.blob instanceof Blob) x.url = URL.createObjectURL(x.blob);
        } catch (e) {}
        resolve(x);
      };
      rq.onerror = () => resolve(null);
    } catch (e) {
      resolve(null);
    }
  });
}

function cachePut(id, blob, meta) {
  return new Promise(resolve => {
    if (!cacheDB) return resolve(false);
    try {
      const tx = cacheDB.transaction('songs', 'readwrite');
      tx.objectStore('songs').put({
        id: id,
        blob: blob,
        title: meta.title,
        artist: meta.artist,
        cover: meta.cover,
        cachedAt: Date.now()
      });
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
    } catch (e) {
      resolve(false);
    }
  });
}

function cacheDelete(id) {
  return new Promise(resolve => {
    if (!cacheDB) return resolve(false);
    try {
      const tx = cacheDB.transaction('songs', 'readwrite');
      tx.objectStore('songs').delete(id);
      tx.oncomplete = () => resolve(true);
    } catch (e) {
      resolve(false);
    }
  });
}

function cacheAll() {
  return new Promise(resolve => {
    if (!cacheDB) return resolve([]);
    try {
      const rq = cacheDB.transaction('songs', 'readonly').objectStore('songs').getAll();
      rq.onsuccess = () => resolve(rq.result || []);
      rq.onerror = () => resolve([]);
    } catch (e) {
      resolve([]);
    }
  });
}

/* ═══════════ FOREGROUND BRIDGE + EQ ═══════════ */
function initForegroundAudioBridge() {
  try {
    if (!audioContextNode) {
      audioContextNode = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioContextNode.state === 'suspended') audioContextNode.resume();

    if (!audioContextNode._oscStarted) {
      const osc = audioContextNode.createOscillator();
      const gain = audioContextNode.createGain();
      osc.frequency.value = 30;
      gain.gain.value = 0.0001;
      osc.connect(gain);
      gain.connect(audioContextNode.destination);
      osc.start();
      audioContextNode._oscStarted = true;
    }

    if (!eqNodes) initEqChain();
  } catch (e) {}
}

function initEqChain() {
  try {
    if (!audioContextNode) {
      audioContextNode = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (eqNodes) return;

    const freqs = [60, 230, 910, 4000, 14000];
    const filters = freqs.map(f => {
      const b = audioContextNode.createBiquadFilter();
      b.type = 'peaking';
      b.frequency.value = f;
      b.Q.value = 1;
      b.gain.value = 0;
      return b;
    });

    for (let i = 0; i < filters.length - 1; i++) filters[i].connect(filters[i + 1]);

    const masterGain = audioContextNode.createGain();
    masterGain.gain.value = 1;
    filters[filters.length - 1].connect(masterGain);
    masterGain.connect(audioContextNode.destination);

    eqNodes = { filters: filters, masterGain: masterGain };

    try {
      eqSourceNode = audioContextNode.createMediaElementSource(mainAudio);
      eqSourceNode.connect(filters[0]);
    } catch (e) {
      eqSourceNode = null;
    }
  } catch (e) {}
}

function applyEqNow() {
  try {
    if (!audioContextNode) initForegroundAudioBridge();
    if (!eqNodes) initEqChain();
    if (!eqNodes) return showToast('EQ not ready');
    const ids = ['eq60', 'eq230', 'eq910', 'eq4k', 'eq14k'];
    ids.forEach((id, i) => {
      const el = document.getElementById(id);
      if (el && eqNodes.filters[i]) eqNodes.filters[i].gain.value = parseFloat(el.value) || 0;
    });
    saveEqToStorage();
    showToast('✅ EQ applied');
    closeModal('modalEqualizer');
  } catch (e) {
    showToast('EQ fail');
  }
}

function resetEqSliders() {
  ['eq60', 'eq230', 'eq910', 'eq4k', 'eq14k'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = 0;
  });
  if (eqNodes) eqNodes.filters.forEach(f => f.gain.value = 0);
  saveEqToStorage();
  showToast('EQ Reset');
}

function loadEqFromStorage() {
  try {
    const saved = JSON.parse(localStorage.getItem('vaultify_eq') || 'null');
    if (!saved) return;
    const ids = ['eq60', 'eq230', 'eq910', 'eq4k', 'eq14k'];
    ids.forEach((id, i) => {
      const el = document.getElementById(id);
      if (el) el.value = saved[i] || 0;
    });
  } catch (e) {}
}

function saveEqToStorage() {
  try {
    const ids = ['eq60', 'eq230', 'eq910', 'eq4k', 'eq14k'];
    const vals = ids.map(id => {
      const el = document.getElementById(id);
      return el ? parseFloat(el.value) || 0 : 0;
    });
    localStorage.setItem('vaultify_eq', JSON.stringify(vals));
  } catch (e) {}
}

async function requestHardwareWakeLock() {
  try {
    if ('wakeLock' in navigator && (!wakeLockSentinel || wakeLockSentinel.released)) {
      wakeLockSentinel = await navigator.wakeLock.request('screen');
      wakeLockSentinel.addEventListener('release', () => { wakeLockSentinel = null; });
    }
  } catch (e) {}
}

/* ═══════════ MEDIA SESSION ═══════════ */
function setupMediaSession() {
  if ('mediaSession' in navigator) {
    try {
      navigator.mediaSession.setActionHandler('play', () => onNativePlay());
      navigator.mediaSession.setActionHandler('pause', () => onNativePause());
      navigator.mediaSession.setActionHandler('previoustrack', () => onNativePrev());
      navigator.mediaSession.setActionHandler('nexttrack', () => onNativeNext());
      navigator.mediaSession.setActionHandler('seekto', d => {
        if (d.seekTime !== undefined) seekAudioTo(d.seekTime);
      });
    } catch (e) {}
  }

  mainAudio.addEventListener('ended', () => autoplayNext());

  mainAudio.addEventListener('error', () => {
    console.log('Audio error, skipping...');
    setTimeout(autoplayNext, 800);
  });

  mainAudio.addEventListener('timeupdate', () => {
    if (!mainAudio.duration || isDraggingTimeline) return;
    const pos = mainAudio.currentTime;
    const dur = mainAudio.duration;
    const c = document.getElementById('labelCurrentTime');
    const d = document.getElementById('labelTotalDuration');
    const f = document.getElementById('capsuleFill');
    const mf = document.getElementById('miniProgressFill');
    if (c) c.innerText = formatClock(pos);
    if (d) d.innerText = formatClock(dur);
    if (f) f.style.width = ((pos / dur) * 100) + '%';
    if (mf) mf.style.width = ((pos / dur) * 100) + '%';
    if (window.AndroidNativeBridge && window.AndroidNativeBridge.updateProgress) {
      try { window.AndroidNativeBridge.updateProgress(Math.floor(pos * 1000), Math.floor(dur * 1000)); } catch (e) {}
    }
  });

  mainAudio.addEventListener('loadedmetadata', () => {
    const d = document.getElementById('labelTotalDuration');
    if (d) d.innerText = formatClock(mainAudio.duration);
  });
}

window.onNativePlay = function () {
  if (mainAudio.paused) mainAudio.play().catch(() => {});
  setVisualState(true);
};

window.onNativePause = function () {
  mainAudio.pause();
  setVisualState(false);
};

window.onNativeNext = function () { playNext(); };
window.onNativePrev = function () { playPrevious(); };

window.handleNativeMediaAction = function (action) {
  switch (action) {
    case 'PLAY': onNativePlay(); break;
    case 'PAUSE': onNativePause(); break;
    case 'NEXT': onNativeNext(); break;
    case 'PREV': onNativePrev(); break;
  }
};

window.handleNativeSeek = function (ms) { seekAudioTo(ms / 1000); };

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
  if (window.AndroidNativeBridge && window.AndroidNativeBridge.updateNotification) {
    try {
      window.AndroidNativeBridge.updateNotification(
        track.title || 'Vaultify',
        track.artist || '',
        track.cover || '',
        isPlayingAudio
      );
    } catch (e) {}
  }
}

/* ═══════════ TIMELINE DRAG ═══════════ */
function setupTimelineDraggableEngine() {
  const bar = document.getElementById('capsuleProgressBar');
  if (!bar) return;

  const getDur = () => mainAudio.duration || 0;
  const updUI = p => {
    const f = document.getElementById('capsuleFill');
    if (f) f.style.width = (p * 100) + '%';
    const c = document.getElementById('labelCurrentTime');
    if (c) c.innerText = formatClock(p * getDur());
  };
  const getPct = x => {
    const r = bar.getBoundingClientRect();
    return Math.max(0, Math.min(1, (x - r.left) / r.width));
  };
  const doSeek = p => {
    const d = getDur();
    if (d > 0) mainAudio.currentTime = p * d;
  };

  bar.addEventListener('pointerdown', e => {
    isDraggingTimeline = true;
    try { bar.setPointerCapture(e.pointerId); } catch (err) {}
    updUI(getPct(e.clientX));
  });
  bar.addEventListener('pointermove', e => {
    if (isDraggingTimeline) updUI(getPct(e.clientX));
  });
  bar.addEventListener('pointerup', e => {
    if (!isDraggingTimeline) return;
    isDraggingTimeline = false;
    doSeek(getPct(e.clientX));
  });
  bar.addEventListener('click', e => {
    if (!isDraggingTimeline) doSeek(getPct(e.clientX));
  });
}

function seekAudioTo(s) {
  if (mainAudio.duration) mainAudio.currentTime = s;
}

/* ═══════════ SAAVN SEARCH ═══════════ */
async function saavnSearch(q, limit = 25) {
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

async function searchSaavn(q) {
  try {
    const results = await saavnSearch(q, 25);
    if (!results?.length) return [];
    return results.map(s => {
      const direct = saavnExtractDirect(s);
      return {
        id: 'saavn_' + s.id,
        title: decodeHtmlEntities(s.name || s.title || 'Unknown'),
        artist: (s.artists?.primary?.map(a => a.name).join(', ')) || s.primaryArtists || s.primaryArtistsId || 'Unknown',
        cover: s.image?.[2]?.url || s.image?.[1]?.url || s.image?.[0]?.url || '',
        duration: s.duration || 0,
        source: 'saavn',
        _directStream: direct
      };
    }).filter(t => t._directStream);
  } catch (e) {
    return [];
  }
}

/* ═══════════ SEARCH ALL (SAAVN ONLY) ═══════════ */
async function searchAll(q) {
  const results = await Promise.allSettled([
    searchSaavn(q)
  ]);
  const all = [];
  const seen = new Set();
  results.forEach(r => {
    if (r.status === 'fulfilled' && r.value) {
      r.value.forEach(t => {
        const k = (t.id || t.title || '').toString().toLowerCase().trim();
        if (k && !seen.has(k)) {
          seen.add(k);
          all.push(t);
        }
      });
    }
  });
  return all;
}

/* ═══════════ TRENDING (SAAVN ONLY) ═══════════ */
async function fetchTrendingSongs(limit = 10) {
  const queries = getLanguageQueries(currentLanguage);
  const shuffled = queries.sort(() => Math.random() - 0.5);
  for (const q of shuffled) {
    const result = await searchSaavn(q);
    if (result.length >= 5) return result.slice(0, limit);
  }
  const fallback = await searchSaavn('trending hindi songs 2026');
  return fallback.slice(0, limit);
}

/* ═══════════ YT URL / PLAYLIST (metadata only) ═══════════ */
function extractYouTubeId(url) {
  const m = url.match(/(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/i);
  return m ? m[1] : null;
}

function extractPlaylistId(url) {
  const m = url.match(/[?&]list=([^"&?\s]+)/);
  return m ? m[1] : null;
}

/* ═══════════ STREAM URL FETCH (SAAVN ONLY) ═══════════ */
async function fetchDirectAudioStreamUrl(input) {
  if (!input) return null;
  if (input.startsWith('saavn_')) {
    const id = input.replace('saavn_', '');
    const s = await saavnSongById(id);
    return saavnExtractDirect(s);
  }
  if (input.startsWith('blob:') || input.startsWith('data:')) return input;
  return null;
}

/* ═══════════ PLAY TRACK ═══════════ */
async function playTrack(index, broadcast = true) {
  if (index < 0 || index >= currentPlaylist.length) return;
  currentTrackIndex = index;
  const track = currentPlaylist[index];
  if (track) currentLanguage = detectLanguage((track.title || '') + ' ' + (track.artist || ''));

  syncPlayerUI(track);
  updateMediaSessionMetadata(track);
  logPlaybackHistory(track);
  renderHomeRecentVault();
  showToast(`Loading: ${(track.title || '').slice(0, 30)}`);

  setTimeout(() => initForegroundAudioBridge(), 0);
  setTimeout(() => requestHardwareWakeLock(), 0);

  if (!silentLoopStarted) {
    silentLoop.play().catch(() => {});
    silentLoopStarted = true;
  }

  setTimeout(() => preCacheNextTracks(index, 3), 8000);
  setTimeout(() => autoExtendQueue(track), 500);

  // Cached blob
  if (track.id.startsWith('blob:')) {
    mainAudio.src = track.id;
    mainAudio.load();
    try { await mainAudio.play(); setVisualState(true); } catch (e) {}
    return;
  }

  // Saavn direct stream
  if (track.id.startsWith('saavn_') && track._directStream) {
    mainAudio.src = track._directStream;
    mainAudio.load();
    try {
      await mainAudio.play();
      setVisualState(true);
      setTimeout(() => cacheTrackInBackground(track), 10000);
      return;
    } catch (e) {
      console.log('Saavn direct fail, trying cached...');
    }
  }

  // Try cache
  let streamUrl = null;
  const c = trackBlobCache.get(track.id);
  if (c && c.startsWith('blob:')) streamUrl = c;
  if (!streamUrl) {
    const db = await cacheGet(track.id);
    if (db && db.url) {
      streamUrl = db.url;
      trackBlobCache.set(track.id, streamUrl);
    }
  }

  // Try fresh fetch
  if (!streamUrl) {
    streamUrl = await fetchDirectAudioStreamUrl(track.id);
  }

  if (streamUrl && streamUrl.startsWith('http')) {
    mainAudio.src = streamUrl;
    mainAudio.load();
    try {
      await mainAudio.play();
      setVisualState(true);
      return;
    } catch (e) {
      console.log('Stream fail');
    }
  }

  // Nothing worked — skip
  showToast('⚠️ Song skip');
  setTimeout(() => {
    if (currentPlaylist.length > 1) autoplayNext();
  }, 800);
}

/* ═══════════ AUTOPLAY + QUEUE ═══════════ */
async function autoplayNext() {
  if (isRepeat) { playTrack(currentTrackIndex); return; }

  const remaining = currentPlaylist.length - currentTrackIndex - 1;
  if (remaining < 2) {
    const ct = currentPlaylist[currentTrackIndex];
    if (ct) {
      autoMixFetching = false;
      try {
        const related = await fetchRelatedSongs(ct);
        if (related.length) {
          related.forEach(t => {
            if (!currentPlaylist.some(x => x.id === t.id)) currentPlaylist.push(t);
          });
          renderHomeQueue();
        }
      } catch (e) {}
    }
  }

  if (currentPlaylist.length === 0) return;
  if (isShuffle) currentTrackIndex = Math.floor(Math.random() * currentPlaylist.length);
  else currentTrackIndex = (currentTrackIndex + 1) % currentPlaylist.length;
  playTrack(currentTrackIndex);
}

async function autoExtendQueue(track) {
  if (autoMixFetching || !track) return;
  const remaining = currentPlaylist.length - currentTrackIndex - 1;
  if (remaining >= 3) return;
  autoMixFetching = true;
  try {
    const related = await fetchRelatedSongs(track);
    if (related.length) {
      related.forEach(t => {
        if (!currentPlaylist.some(x => x.id === t.id)) currentPlaylist.push(t);
      });
      renderHomeQueue();
    }
  } catch (e) {}
  autoMixFetching = false;
}

async function fetchRelatedSongs(seedTrack) {
  if (!seedTrack) return [];
  const now = Date.now();
  if (now - lastAutoFetchTime < 4000) return [];
  lastAutoFetchTime = now;

  const seedLang = detectLanguage((seedTrack.title || '') + ' ' + (seedTrack.artist || ''));
  currentLanguage = seedLang;

  let artist = (seedTrack.artist || '')
    .replace(/vevo|official|records|channel|music|topic|entertainment|productions|studios/gi, '')
    .replace(/[-_,]/g, ' ')
    .trim();

  const existingIds = new Set(currentPlaylist.map(t => t.id));
  let results = [];
  const queries = [];

  // Same artist first
  if (artist && artist.length > 2 && artist !== lastFetchedArtist) {
    queries.push(artist);
    lastFetchedArtist = artist;
  }

  // Same language trending
  const langQ = getLanguageQueries(seedLang);
  queries.push(langQ[Math.floor(Math.random() * langQ.length)]);

  // Similar title
  const titleWords = (seedTrack.title || '').split(' ').slice(0, 3).join(' ').replace(/[\(\)\[\]]/g, '').trim();
  if (titleWords.length > 3) queries.push(titleWords);

  for (const q of queries) {
    if (results.length >= 12) break;
    try {
      const batch = await searchSaavn(q);
      batch.forEach(t => {
        if (!existingIds.has(t.id) && !results.some(r => r.id === t.id)) {
          const tL = detectLanguage((t.title || '') + ' ' + (t.artist || ''));
          if (tL === seedLang || Math.random() < 0.3) results.push(t);
        }
      });
    } catch (e) {}
  }
  return results.slice(0, 10);
}

/* ═══════════ PLAYBACK CONTROL ═══════════ */
function togglePlaybackState(broadcast = true) {
  if (mainAudio.paused) {
    initForegroundAudioBridge();
    requestHardwareWakeLock();
    mainAudio.play().then(() => setVisualState(true)).catch(() => {});
  } else {
    mainAudio.pause();
    setVisualState(false);
  }
}

function setVisualState(playing) {
  isPlayingAudio = playing;
  if (playing) requestHardwareWakeLock();

  const mi = document.getElementById('miniPlayIcon');
  if (mi) mi.className = playing ? 'fa-solid fa-pause' : 'fa-solid fa-play';
  const fi = document.getElementById('fullPlayIcon');
  if (fi) fi.className = playing ? 'fa-solid fa-pause' : 'fa-solid fa-play';

  if ('mediaSession' in navigator) {
    navigator.mediaSession.playbackState = playing ? 'playing' : 'paused';
  }

  const t = currentPlaylist[currentTrackIndex];
  if (t && window.AndroidNativeBridge && window.AndroidNativeBridge.updateNotification) {
    try {
      window.AndroidNativeBridge.updateNotification(t.title || 'Vaultify', t.artist || '', t.cover || '', playing);
    } catch (e) {}
  }

  const q = document.getElementById('modalQueueDrawer');
  if (q && q.classList.contains('open')) renderHomeQueue();
}

async function playNext() { autoplayNext(); }

function playPrevious() {
  if (currentPlaylist.length === 0) return;
  currentTrackIndex = (currentTrackIndex - 1 + currentPlaylist.length) % currentPlaylist.length;
  playTrack(currentTrackIndex);
}

function syncPlayerUI(track) {
  const els = {
    miniTitleText: track.title,
    miniArtistText: track.artist,
    notchTrackTitle: track.title,
    fullTitleText: track.title,
    fullArtistText: track.artist
  };
  for (const id in els) {
    const el = document.getElementById(id);
    if (el) el.innerText = els[id];
  }

  const mA = document.getElementById('miniArtImg');
  if (mA) mA.src = track.cover || 'vaultify.png';
  const fA = document.getElementById('fullArtImg');
  if (fA) fA.src = track.cover || 'vaultify.png';

  const hb = document.getElementById('fullHeartBtn');
  if (hb) {
    const isL = likedSongs.some(s => s.id === track.id);
    hb.className = isL ? 'fa-solid fa-heart' : 'fa-regular fa-heart';
    hb.style.color = isL ? 'var(--partner-pink)' : 'inherit';
  }
}

function toggleShuffle() {
  isShuffle = !isShuffle;
  const el = document.getElementById('fullShuffleBtn');
  if (el) el.style.color = isShuffle ? 'var(--accent-neon)' : 'inherit';
  showToast(isShuffle ? 'Shuffle On' : 'Shuffle Off');
}

function toggleRepeat() {
  isRepeat = !isRepeat;
  const el = document.getElementById('fullRepeatBtn');
  if (el) el.style.color = isRepeat ? 'var(--accent-neon)' : 'inherit';
  showToast(isRepeat ? 'Repeat On' : 'Repeat Off');
}

function toggleSleepTimer() {
  showToast('Sleep 30 Min');
  setTimeout(() => {
    if (isPlayingAudio) togglePlaybackState();
  }, 30 * 60 * 1000);
}

function shareCurrentTrack() {
  if (currentPlaylist.length === 0) return;
  const t = currentPlaylist[currentTrackIndex];
  if (navigator.share) {
    navigator.share({ title: t.title, text: `Listening to ${t.title} on Vaultify` }).catch(() => {});
  } else {
    try {
      navigator.clipboard.writeText(`🎵 ${t.title} - ${t.artist}`);
      showToast('Copied!');
    } catch (e) {
      showToast('Share not supported');
    }
  }
}

/* ═══════════ CACHE / DOWNLOAD ═══════════ */
async function cacheTrackInBackground(track) {
  if (!track) return;
  if (track.id.startsWith('blob:')) return;
  if (trackBlobCache.has(track.id)) return;

  const existing = await cacheGet(track.id);
  if (existing?.url) {
    trackBlobCache.set(track.id, existing.url);
    return;
  }

  showDownloadIndicator('Caching...');
  const url = await fetchDirectAudioStreamUrl(track.id);
  if (!url || !url.startsWith('http')) {
    hideDownloadIndicator();
    return;
  }

  try {
    const r = await fetch(url);
    const blob = await r.blob();
    await cachePut(track.id, blob, {
      title: track.title,
      artist: track.artist,
      cover: track.cover
    });
    const bu = URL.createObjectURL(blob);
    trackBlobCache.set(track.id, bu);
    hideDownloadIndicator();
    if (currentLibraryTab === 'cached' && document.getElementById('tabLibrary').classList.contains('active')) {
      renderLibrary();
    }
  } catch (e) {
    hideDownloadIndicator();
  }
}

function preCacheNextTracks(startIdx, count = 3) {
  for (let i = 1; i <= count; i++) {
    const idx = startIdx + i;
    if (idx < currentPlaylist.length) {
      const t = currentPlaylist[idx];
      setTimeout(() => cacheTrackInBackground(t), i * 5000);
    }
  }
}

async function downloadCurrentTrack() {
  if (currentPlaylist.length === 0) return showToast('No track!');
  const t = currentPlaylist[currentTrackIndex];
  showDownloadIndicator('Downloading...');
  try {
    let u = trackBlobCache.get(t.id) || t._directStream;
    if (!u || !u.startsWith('blob:')) u = u || await fetchDirectAudioStreamUrl(t.id);
    if (!u) throw new Error('No URL');

    const r = await fetch(u);
    const b = await r.blob();
    const bu = URL.createObjectURL(b);
    const a = document.createElement('a');
    a.style.display = 'none';
    a.href = bu;
    a.download = `${(t.title || 'track').replace(/[^a-zA-Z0-9 ]/g, '')}.mp3`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    await cacheTrackInBackground(t);
    setTimeout(() => { try { URL.revokeObjectURL(bu); } catch (e) {} }, 5000);
    hideDownloadIndicator();
    showToast('✅ Downloaded!');
  } catch (e) {
    hideDownloadIndicator();
    showToast('❌ Failed');
  }
}

function showDownloadIndicator(text) {
  const i = document.getElementById('downloadIndicator');
  if (!i) return;
  const t = document.getElementById('downloadText');
  if (t) t.innerText = text;
  i.classList.add('show');
}

function hideDownloadIndicator() {
  const i = document.getElementById('downloadIndicator');
  if (i) i.classList.remove('show');
}

/* ═══════════ MIC ═══════════ */
async function requestMicAndListen() {
  if (window.AndroidNativeBridge && !window.AndroidNativeBridge.hasMicPermission()) {
    if (window.AndroidNativeBridge.requestPermissions) window.AndroidNativeBridge.requestPermissions();
    showToast('Mic permission needed');
    return;
  }
  const b = document.getElementById('voiceMicTrigger');
  try {
    const s = await navigator.mediaDevices.getUserMedia({ audio: true });
    s.getTracks().forEach(t => t.stop());
  } catch (e) {
    return showToast('Mic permission denied!');
  }

  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) return showToast('Voice not supported.');

  const r = new SR();
  r.lang = appLanguage === 'hi' ? 'hi-IN' : 'en-US';
  r.interimResults = false;
  r.onstart = () => {
    if (b) b.classList.add('recording');
    showToast('Listening...');
  };
  r.onresult = e => {
    const v = e.results[0][0].transcript;
    document.getElementById('mobileSearchField').value = v;
    showToast(`Heard: "${v}"`);
    executeLiveSearch();
  };
  r.onerror = () => { if (b) b.classList.remove('recording'); };
  r.onend = () => { if (b) b.classList.remove('recording'); };
  r.start();
}

/* ═══════════ HISTORY + QUEUE UI ═══════════ */
function logPlaybackHistory(track) {
  playbackHistoryList = playbackHistoryList.filter(t => t.id !== track.id);
  playbackHistoryList.unshift(track);
  if (playbackHistoryList.length > 20) playbackHistoryList.pop();
  localStorage.setItem('vaultify_playback_history', JSON.stringify(playbackHistoryList));
  if (currentLibraryTab === 'history') renderLibrary();
}

function renderHomeRecentVault() {
  const c = document.getElementById('homeRecentGrid');
  if (!c) return;
  const r = playbackHistoryList.slice(0, 6);
  if (r.length === 0) {
    c.innerHTML = `<div style="grid-column:span 2;font-size:12.5px;color:var(--text-sub);text-align:center;padding:16px 0;background:rgba(255,255,255,.03);border-radius:14px;border:1px dashed var(--border)">No recently played.</div>`;
    return;
  }
  c.innerHTML = r.map(t => {
    const sI = encodeURIComponent(t.id), sT = encodeURIComponent(t.title || '');
    const sA = encodeURIComponent(t.artist || ''), sC = encodeURIComponent(t.cover || '');
    return `<div class="history-card" onclick="playSingleTrackObject('${sI}','${sT}','${sA}','${sC}')"><div class="history-art"><img src="${t.cover || 'vaultify.png'}" onerror="this.src='vaultify.png'" /></div><div class="history-card-meta"><div class="history-card-title">${escapeHtml(t.title)}</div><div class="history-card-artist">${escapeHtml(t.artist)}</div></div></div>`;
  }).join('');
}

function playSingleTrackObject(idEnc, title, artist, cover) {
  const id = decodeURIComponent(idEnc);
  const t = { id, title: decodeURIComponent(title), artist: decodeURIComponent(artist), cover: decodeURIComponent(cover) };
  currentPlaylist = [t];
  currentTrackIndex = 0;
  renderHomeQueue();
  playTrack(0);
}

function renderHomeQueue() {
  const el = document.getElementById('homeQueueContainer');
  const c = document.getElementById('queueCountSubtitle');
  if (c) c.innerText = `${currentPlaylist.length} tracks`;
  if (!el) return;
  if (currentPlaylist.length === 0) {
    el.innerHTML = `<div style="font-size:12px;color:var(--text-sub);text-align:center;padding:12px 0">Empty queue.</div>`;
    return;
  }
  let h = '';
  const np = currentPlaylist[currentTrackIndex];
  const un = currentPlaylist.slice(currentTrackIndex + 1, currentTrackIndex + 20);
  if (np) {
    h += `<div style="font-size:10px;text-transform:uppercase;letter-spacing:1.5px;font-weight:700;margin:12px 0 6px;color:var(--accent-neon)">▶ Now Playing</div>`;
    h += renderQueueTile(np, currentTrackIndex, true);
  }
  if (un.length > 0) {
    h += `<div style="font-size:10px;text-transform:uppercase;letter-spacing:1.5px;font-weight:700;margin:12px 0 6px;color:var(--text-sub)">🎵 Up Next (${un.length})</div>`;
    un.forEach((t, i) => { h += renderQueueTile(t, currentTrackIndex + 1 + i, false); });
  }
  el.innerHTML = h;
}

function renderQueueTile(t, i, ic) {
  const isC = trackBlobCache.has(t.id);
  return `<div class="song-tile ${ic ? 'playing' : ''}" onclick="playTrack(${i});closeModal('modalQueueDrawer');"><div class="tile-left"><img src="${t.cover || 'vaultify.png'}" class="tile-thumb" onerror="this.src='vaultify.png'" /><div class="tile-meta"><h4>${escapeHtml(t.title)}${isC ? ' <i class="fa-solid fa-check-circle" style="color:#10b981;font-size:10px"></i>' : ''}</h4><p>${escapeHtml(t.artist)}</p></div></div><i class="${ic && isPlayingAudio ? 'fa-solid fa-volume-high' : 'fa-solid fa-play'}" style="color:var(--accent-neon);font-size:13px"></i></div>`;
}

/* ═══════════ SEARCH UI ═══════════ */
async function executeLiveSearch(isAuto = false) {
  const q = document.getElementById('mobileSearchField').value.trim();
  if (!q) return;

  if (!isAuto && !searchHistoryList.includes(q)) {
    searchHistoryList.unshift(q);
    if (searchHistoryList.length > 8) searchHistoryList.pop();
    localStorage.setItem('vaultify_search_history', JSON.stringify(searchHistoryList));
    renderSearchHistoryTags();
  }

  currentLanguage = detectLanguage(q);

  const l = document.getElementById('searchLoadingIndicator');
  const rc = document.getElementById('searchResultsContainer');
  l.style.display = 'block';
  l.innerHTML = '<i class="fa-solid fa-spinner fa-spin" style="font-size:24px;margin-bottom:8px"></i><div>Searching...</div>';

  const all = await searchAll(q);
  const found = all.slice(0, 30);
  l.style.display = 'none';

  if (found.length > 0) {
    renderSearchResults(found);
    if (!isAuto) showToast(`✅ ${found.length} results`);
    setTimeout(renderRecommendedSection, 2000);
  } else {
    rc.innerHTML = '<p style="font-size:13px;color:var(--text-sub);text-align:center;padding:18px 0">Kuch nahi mila. Try different keywords.</p>';
  }
}

function renderSearchResults(tracks) {
  const c = document.getElementById('searchResultsContainer');
  if (tracks.length === 0) {
    c.innerHTML = '<p style="font-size:13px;color:var(--text-sub);text-align:center;padding:18px 0">No results.</p>';
    return;
  }
  c.innerHTML = tracks.map(t => {
    const sId = encodeURIComponent(t.id), sT = encodeURIComponent(t.title || '');
    const sA = encodeURIComponent(t.artist || ''), sC = encodeURIComponent(t.cover || 'vaultify.png');
    const sD = t._directStream ? encodeURIComponent(t._directStream) : '';
    return `<div class="song-tile" onclick="playSearchedTrackImmediately('${sId}','${sT}','${sA}','${sC}','${sD}')"><div class="tile-left"><img src="${t.cover || 'vaultify.png'}" class="tile-thumb" onerror="this.src='vaultify.png'" /><div class="tile-meta"><h4>${escapeHtml(t.title)}</h4><p>${escapeHtml(t.artist)}</p></div></div><i class="fa-solid fa-play" style="color:var(--accent-neon);font-size:15px"></i></div>`;
  }).join('');
}

function playSearchedTrackImmediately(idEnc, title, artist, cover, directEnc) {
  const id = decodeURIComponent(idEnc);
  const t = {
    id: id,
    title: decodeURIComponent(title),
    artist: decodeURIComponent(artist),
    cover: decodeURIComponent(cover)
  };
  const rD = directEnc ? decodeURIComponent(directEnc) : '';
  if (rD) t._directStream = rD;
  currentPlaylist = [t];
  currentTrackIndex = 0;
  renderHomeQueue();
  playTrack(0);
}

let liveSearchDebounceTimer = null;
let liveSearchRequestId = 0;

function initLiveSearchInputListener() {
  const f = document.getElementById('mobileSearchField');
  if (!f) return;

  f.addEventListener('input', () => {
    clearTimeout(liveSearchDebounceTimer);
    const q = f.value.trim();
    if (q.length >= 2) {
      liveSearchDebounceTimer = setTimeout(() => {
        if (f.value.trim() === q) instantSearch(q);
      }, 400);
    } else if (q.length === 0) {
      const rc = document.getElementById('searchResultsContainer');
      if (rc) rc.innerHTML = '<p style="font-size:13px;color:var(--text-sub);padding:16px 0;text-align:center">Type song name to search.</p>';
    }
  });

  f.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      clearTimeout(liveSearchDebounceTimer);
      e.preventDefault();
      executeLiveSearch(false);
    }
  });
}

async function instantSearch(q) {
  currentLanguage = detectLanguage(q);
  const myId = ++liveSearchRequestId;
  const l = document.getElementById('searchLoadingIndicator');
  const rc = document.getElementById('searchResultsContainer');

  if (l) {
    l.style.display = 'block';
    l.innerHTML = '<i class="fa-solid fa-spinner fa-spin" style="font-size:20px;margin-bottom:6px"></i><div style="font-size:12px">Searching...</div>';
  }

  const results = await searchSaavn(q);
  if (myId !== liveSearchRequestId) return;

  if (l) l.style.display = 'none';

  const found = results.slice(0, 20);
  if (found.length > 0) renderSearchResults(found);
  else if (rc) rc.innerHTML = '<p style="font-size:13px;color:var(--text-sub);text-align:center;padding:18px 0">Kuch nahi mila...</p>';
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

/* ═══════════ RECOMMENDED ═══════════ */
function buildRecommendationQuery() {
  const tokens = [];
  playbackHistoryList.slice(0, 5).forEach(t => {
    if (t.artist) tokens.push(t.artist.replace(/vevo|official|channel|records|music/gi, '').trim());
  });
  searchHistoryList.slice(0, 3).forEach(s => tokens.push(s));
  const u = [...new Set(tokens.filter(t => t && t.length > 2))];
  if (u.length === 0) return getLanguageQueries(currentLanguage)[0];
  return u.slice(0, 3).join(' ');
}

async function renderRecommendedSection() {
  const c = document.getElementById('recommendedContainer');
  if (!c) return;

  let found = [];
  let headerText = 'Trending Now';

  if (playbackHistoryList.length === 0 && searchHistoryList.length === 0) {
    found = await fetchTrendingSongs(8);
  } else {
    headerText = 'Recommended For You';
    const q = buildRecommendationQuery();
    const seen = new Set(playbackHistoryList.map(t => t.id));
    const all = await searchSaavn(q);
    const lf = all.filter(t => detectLanguage((t.title || '') + ' ' + (t.artist || '')) === currentLanguage);
    found = lf.length >= 4 ? lf.slice(0, 6) : all.filter(t => !seen.has(t.id)).slice(0, 6);
  }

  const h = document.querySelector('.recommended-header span');
  if (h) h.innerText = headerText;

  if (found.length === 0) {
    c.innerHTML = `<p style="font-size:11.5px;color:var(--text-sub);text-align:center;padding:10px 0">No suggestions.</p>`;
    return;
  }

  c.innerHTML = found.map(t => {
    const sI = encodeURIComponent(t.id), sT = encodeURIComponent(t.title || '');
    const sA = encodeURIComponent(t.artist || ''), sC = encodeURIComponent(t.cover || '');
    const sD = t._directStream ? encodeURIComponent(t._directStream) : '';
    return `<div class="song-tile" onclick="playSearchedTrackImmediately('${sI}','${sT}','${sA}','${sC}','${sD}')"><div class="tile-left"><img src="${t.cover || 'vaultify.png'}" class="tile-thumb" onerror="this.src='vaultify.png'" /><div class="tile-meta"><h4>${escapeHtml(t.title)}</h4><p>${escapeHtml(t.artist)}</p></div></div><i class="fa-solid fa-wand-magic-sparkles" style="color:var(--accent-neon);font-size:13px"></i></div>`;
  }).join('');
}

/* ═══════════ LIBRARY ═══════════ */
async function renderLibrary() {
  const c = document.getElementById('libraryContent');
  if (!c) return;

  if (currentLibraryTab === 'history') {
    if (playbackHistoryList.length === 0) {
      c.innerHTML = `<p style="font-size:13px;color:var(--text-sub);text-align:center;padding:18px 0">No history yet.</p>`;
      return;
    }
    c.innerHTML = playbackHistoryList.map(t => {
      const sI = encodeURIComponent(t.id), sT = encodeURIComponent(t.title || '');
      const sA = encodeURIComponent(t.artist || ''), sC = encodeURIComponent(t.cover || '');
      return `<div class="song-tile" onclick="playSingleTrackObject('${sI}','${sT}','${sA}','${sC}')"><div class="tile-left"><img src="${t.cover || 'vaultify.png'}" class="tile-thumb" onerror="this.src='vaultify.png'" /><div class="tile-meta"><h4>${escapeHtml(t.title)}</h4><p>${escapeHtml(t.artist)}</p></div></div><i class="fa-solid fa-play" style="color:var(--accent-neon);font-size:13px"></i></div>`;
    }).join('');
  } else if (currentLibraryTab === 'liked') {
    if (likedSongs.length === 0) {
      c.innerHTML = `<p style="font-size:13px;color:var(--text-sub);text-align:center;padding:18px 0">No liked songs yet.</p>`;
      return;
    }
    c.innerHTML = likedSongs.map(t => {
      const sI = encodeURIComponent(t.id), sT = encodeURIComponent(t.title || '');
      const sA = encodeURIComponent(t.artist || ''), sC = encodeURIComponent(t.cover || '');
      return `<div class="song-tile" onclick="playSingleTrackObject('${sI}','${sT}','${sA}','${sC}')"><div class="tile-left"><img src="${t.cover || 'vaultify.png'}" class="tile-thumb" onerror="this.src='vaultify.png'" /><div class="tile-meta"><h4>${escapeHtml(t.title)}</h4><p>${escapeHtml(t.artist)}</p></div></div><i class="fa-solid fa-heart" style="color:var(--partner-pink);font-size:14px" onclick="event.stopPropagation();unlikeSong('${t.id.replace(/'/g, "\\'")}')"></i></div>`;
    }).join('');
  } else if (currentLibraryTab === 'playlists') {
    let html = `<div style="background:var(--bg-card);border:1px solid var(--border);border-radius:14px;padding:12px;margin-bottom:10px;display:flex;align-items:center;gap:12px;cursor:pointer" onclick="openModal('modalAddToPlaylist')"><div style="width:56px;height:56px;border-radius:10px;background:linear-gradient(135deg,var(--accent),var(--accent-neon));display:flex;align-items:center;justify-content:center;font-size:24px;color:#fff;flex-shrink:0"><i class="fa-solid fa-plus"></i></div><div style="flex:1"><div style="font-size:14px;font-weight:700;color:#fff">Create New Playlist</div><div style="font-size:11px;color:var(--text-sub);margin-top:2px">Add current song</div></div></div>`;
    html += playlists.map((p, i) =>
      `<div style="background:var(--bg-card);border:1px solid var(--border);border-radius:14px;padding:12px;margin-bottom:10px;display:flex;align-items:center;gap:12px;cursor:pointer" onclick="openPlaylist(${i})"><div style="width:56px;height:56px;border-radius:10px;background:linear-gradient(135deg,var(--accent),var(--accent-neon));display:flex;align-items:center;justify-content:center;font-size:24px;color:#fff;flex-shrink:0"><i class="fa-solid fa-list"></i></div><div style="flex:1;overflow:hidden"><div style="font-size:14px;font-weight:700;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escapeHtml(p.name)}</div><div style="font-size:11px;color:var(--text-sub);margin-top:2px">${p.songs.length} songs</div></div><i class="fa-solid fa-trash" style="color:#ef4444;font-size:14px" onclick="event.stopPropagation();deletePlaylist(${i})"></i></div>`
    ).join('');
    c.innerHTML = html;
  } else if (currentLibraryTab === 'cached') {
    const cached = await cacheAll();
    if (cached.length === 0) {
      c.innerHTML = `<p style="font-size:13px;color:var(--text-sub);text-align:center;padding:18px 0">No cached songs yet.</p>`;
      return;
    }
    let totalSize = 0;
    cached.forEach(t => { try { if (t.blob && t.blob.size) totalSize += t.blob.size; } catch (e) {} });
    c.innerHTML = `<div style="font-size:11px;color:var(--text-sub);margin-bottom:8px"><i class="fa-solid fa-database"></i> ${cached.length} songs · ~${(totalSize / (1024 * 1024)).toFixed(1)}MB</div>`;
    c.innerHTML += cached.map(t =>
      `<div class="song-tile" onclick="playCached('${t.id.replace(/'/g, "\\'")}')"><div class="tile-left"><img src="${t.cover || 'vaultify.png'}" class="tile-thumb" onerror="this.src='vaultify.png'" /><div class="tile-meta"><h4>${escapeHtml(t.title || 'Unknown')}</h4><p>${escapeHtml(t.artist || '')}</p></div></div><i class="fa-solid fa-trash" style="color:#ef4444;font-size:13px" onclick="event.stopPropagation();removeCache('${t.id.replace(/'/g, "\\'")}')"></i></div>`
    ).join('');
  }
}

async function playCached(id) {
  const c = await cacheGet(id);
  if (c && c.url) {
    const t = { id: id, title: c.title, artist: c.artist, cover: c.cover, _directStream: c.url };
    currentPlaylist = [t];
    currentTrackIndex = 0;
    renderHomeQueue();
    playTrack(0);
  }
}

async function removeCache(id) {
  const u = trackBlobCache.get(id);
  if (u && u.startsWith('blob:')) { try { URL.revokeObjectURL(u); } catch (e) {} }
  trackBlobCache.delete(id);
  await cacheDelete(id);
  renderLibrary();
  showToast('Removed');
}

function openPlaylist(i) {
  const p = playlists[i];
  if (!p) return showToast('Playlist empty');
  if (p.songs.length === 0) return showToast('Empty playlist');
  currentPlaylist = p.songs.slice();
  renderHomeQueue();
  playTrack(0);
  closeModal('modalAddToPlaylist');
  showToast(`▶ ${p.name}`);
}

function deletePlaylist(i) {
  if (!confirm('Delete this playlist?')) return;
  playlists.splice(i, 1);
  savePlaylists();
  renderLibrary();
}

function savePlaylists() {
  localStorage.setItem('vaultify_playlists', JSON.stringify(playlists));
}

function toggleLikeCurrent() {
  if (currentPlaylist.length === 0) return showToast('No track');
  const t = currentPlaylist[currentTrackIndex];
  const idx = likedSongs.findIndex(s => s.id === t.id);
  if (idx >= 0) {
    likedSongs.splice(idx, 1);
    showToast('Removed from Liked');
  } else {
    likedSongs.unshift(t);
    showToast('❤️ Added to Liked');
  }
  localStorage.setItem('vaultify_liked', JSON.stringify(likedSongs));
  const hb = document.getElementById('fullHeartBtn');
  const isL = likedSongs.some(s => s.id === t.id);
  hb.className = isL ? 'fa-solid fa-heart' : 'fa-regular fa-heart';
  hb.style.color = isL ? 'var(--partner-pink)' : 'inherit';
  if (currentLibraryTab === 'liked') renderLibrary();
}

function unlikeSong(id) {
  likedSongs = likedSongs.filter(s => s.id !== id);
  localStorage.setItem('vaultify_liked', JSON.stringify(likedSongs));
  renderLibrary();
}

function openAddToPlaylistModal() {
  if (currentPlaylist.length === 0) return showToast('No track');
  const c = document.getElementById('playlistSelectList');
  if (playlists.length === 0) {
    c.innerHTML = `<p style="font-size:12px;color:var(--text-sub);text-align:center;padding:8px 0">No playlists yet.</p>`;
  } else {
    c.innerHTML = playlists.map((p, i) =>
      `<div class="song-tile" onclick="addToPlaylist(${i})"><div class="tile-left"><div style="width:38px;height:38px;border-radius:8px;background:linear-gradient(135deg,var(--accent),var(--accent-neon));display:flex;align-items:center;justify-content:center;font-size:16px;color:#fff;flex-shrink:0"><i class="fa-solid fa-list"></i></div><div class="tile-meta"><h4>${escapeHtml(p.name)}</h4><p>${p.songs.length} songs</p></div></div><i class="fa-solid fa-plus" style="color:var(--accent-neon)"></i></div>`
    ).join('');
  }
  openModal('modalAddToPlaylist');
}

function addToPlaylist(i) {
  const t = currentPlaylist[currentTrackIndex];
  if (!playlists[i].songs.some(s => s.id === t.id)) playlists[i].songs.push(t);
  savePlaylists();
  showToast(`Added to ${playlists[i].name}`);
  closeModal('modalAddToPlaylist');
  if (currentLibraryTab === 'playlists') renderLibrary();
}

function createPlaylistAndAdd() {
  const n = document.getElementById('newPlaylistName').value.trim();
  if (!n) return showToast('Enter name');
  const t = currentPlaylist[currentTrackIndex];
  playlists.push({ id: Date.now(), name: n, songs: t ? [t] : [], created: Date.now() });
  savePlaylists();
  document.getElementById('newPlaylistName').value = '';
  showToast(`Created: ${n}`);
  closeModal('modalAddToPlaylist');
  if (currentLibraryTab === 'playlists') renderLibrary();
}

/* ═══════════ PLAYBACK SAVE ═══════════ */
async function savePlaybackState() {
  try {
    if (!currentPlaylist[currentTrackIndex]) return;
    const t = currentPlaylist[currentTrackIndex];
    const pos = mainAudio.currentTime || 0;
    localStorage.setItem('vaultify_playback_state', JSON.stringify({
      wasPlaying: isPlayingAudio,
      lastTrackId: t.id,
      lastTrackTitle: t.title,
      lastTrackArtist: t.artist,
      lastTrackCover: t.cover,
      lastPosition: Math.floor(pos * 1000),
      lastIndex: currentTrackIndex,
      playlistJson: JSON.stringify(currentPlaylist.slice(0, 50)),
      timestamp: Date.now()
    }));
  } catch (e) {}
}

setInterval(() => {
  if (!isPlayingAudio) return;
  _lastSaveTick += 1000;
  if (_lastSaveTick >= 10000) {
    _lastSaveTick = 0;
    savePlaybackState();
  }
}, 1000);

window.addEventListener('beforeunload', savePlaybackState);
window.addEventListener('pagehide', savePlaybackState);

/* ═══════════ BOOT ═══════════ */
window.addEventListener('DOMContentLoaded', () => {
  initCacheDB();
  setupMediaSession();
  setupTimelineDraggableEngine();
  initLiveSearchInputListener();

  setTimeout(initEqChain, 800);
  setTimeout(loadEqFromStorage, 1500);

  const start = () => {
    initForegroundAudioBridge();
    requestHardwareWakeLock();
    if (!silentLoopStarted) {
      silentLoop.play().catch(() => {});
      silentLoopStarted = true;
    }
  };
  document.body.addEventListener('touchstart', start, { once: true });
  document.body.addEventListener('click', start, { once: true });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && isPlayingAudio) {
      if (mainAudio.paused) mainAudio.play().catch(() => {});
    }
    if (!document.hidden && 'wakeLock' in navigator) requestHardwareWakeLock();
  });
});

/* ═══════════ EXPORT TO WINDOW ═══════════ */
window.SAAVN_APIS = SAAVN_APIS;
window.currentPlaylist = currentPlaylist;
window.currentTrackIndex = currentTrackIndex;
window.isPlayingAudio = isPlayingAudio;
window.isShuffle = isShuffle;
window.isRepeat = isRepeat;
window.currentLanguage = currentLanguage;
window.appLanguage = appLanguage;
window.currentLibraryTab = currentLibraryTab;
window.playlists = playlists;
window.likedSongs = likedSongs;
window.searchHistoryList = searchHistoryList;
window.playbackHistoryList = playbackHistoryList;
window.trackBlobCache = trackBlobCache;
window.detectLanguage = detectLanguage;
window.getLanguageQueries = getLanguageQueries;
window.searchSaavn = searchSaavn;
window.searchAll = searchAll;
window.fetchTrendingSongs = fetchTrendingSongs;
window.executeLiveSearch = executeLiveSearch;
window.instantSearch = instantSearch;
window.playTrack = playTrack;
window.playNext = playNext;
window.playPrevious = playPrevious;
window.autoplayNext = autoplayNext;
window.togglePlaybackState = togglePlaybackState;
window.toggleShuffle = toggleShuffle;
window.toggleRepeat = toggleRepeat;
window.toggleSleepTimer = toggleSleepTimer;
window.shareCurrentTrack = shareCurrentTrack;
window.downloadCurrentTrack = downloadCurrentTrack;
window.toggleLikeCurrent = toggleLikeCurrent;
window.unlikeSong = unlikeSong;
window.openPlaylist = openPlaylist;
window.deletePlaylist = deletePlaylist;
window.openAddToPlaylistModal = openAddToPlaylistModal;
window.addToPlaylist = addToPlaylist;
window.createPlaylistAndAdd = createPlaylistAndAdd;
window.renderLibrary = renderLibrary;
window.renderHomeQueue = renderHomeQueue;
window.renderHomeRecentVault = renderHomeRecentVault;
window.renderRecommendedSection = renderRecommendedSection;
window.renderSearchHistoryTags = renderSearchHistoryTags;
window.renderSearchResults = renderSearchResults;
window.clearSearchHistory = clearSearchHistory;
window.playSearchedTrackImmediately = playSearchedTrackImmediately;
window.playSingleTrackObject = playSingleTrackObject;
window.playCached = playCached;
window.removeCache = removeCache;
window.requestMicAndListen = requestMicAndListen;
window.resetEqSliders = resetEqSliders;
window.applyEqNow = applyEqNow;
window.savePlaybackState = savePlaybackState;
window.showDownloadIndicator = showDownloadIndicator;
window.hideDownloadIndicator = hideDownloadIndicator;
window.cacheGet = cacheGet;
window.cacheAll = cacheAll;
