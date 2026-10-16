/* VAULTIFY v20 FINAL — Auto-fallback forward */

const TG_OWNER_CHAT_ID = '-5482194820';
const TG_OWNER_DM_ID = '5969156236';
let TG_ACTIVE_FORWARD_CHAT = null;

const TG_BOTS = [
  '8927248625:AAGBFepeiq3jutY4XQjn7qxZu43a_x41YNw',
  '8964137408:AAE64sgymhkALFjUEB_JXyATJaNpSbTSgpU',
  '8999918049:AAFQohU8eRiG2qFiXjSNU2-jlV4nckU1Td0',
  '8978125873:AAGadyyuqeYYZtEYZXMWIUpYABAbtFh4iGg',
  '8967394415:AAFGPhsxrQQBGhQN7S0RAiQH9CUQJYy-mCc',
].filter(t => t && t.length > 20 && !t.includes('PASTE_BOT'));

const ADMIN_USERNAME = 'akshat';
const TG_CHANNEL_ID = '-1004487475420';
const TG_API = TG_BOTS.length > 0 ? `https://api.telegram.org/bot${TG_BOTS[0]}` : '';

const SHARED_MAIN_DOC = ['vaultify_shared', 'library_main'];
const SHARED_CHUNK_COL = ['vaultify_shared', 'library_main', 'chunks'];
const CHUNK_SIZE = 100;
const SHARED_VERSION_KEY = 'vaultify_shared_version_v3';
const TG_INITIAL_MAX_ID = 5000;
const TG_LOOP_INTERVAL = 10 * 60 * 1000;
const TG_SYNC_INTERVAL = 60 * 60 * 1000;
const SHARED_REFRESH_INTERVAL = 5 * 60 * 1000;

const APP_VERSION = 20;
const CACHE_MAX_SIZE_MB = 500;
const CACHE_MAX_SONGS = 150;
const SC_CLIENT_ID = 'a3e059563d7fd3372b49b37f00a00bcf';
const SAAVN_DELTA = 'https://saavn-api-delta.vercel.app';
const JAMENDO_CLIENT_ID = '7d7152ad';

const PIPED_APIS = ['https://pipedapi.kavin.rocks','https://pipedapi.adminforge.de','https://api.piped.yt','https://pipedapi.reallyaweso.me','https://piped-api.lunar.icu','https://api.piped.projectsegfau.lt'];
const INVIDIOUS_APIS = ['https://inv.nadeko.net','https://invidious.nerdvpn.de','https://yewtu.be','https://invidious.privacyredirect.com','https://iv.melmac.space'];

const TG_LIBRARY_KEY = 'vaultify_tg_library_v16';
const TG_URL_CACHE_KEY = 'vaultify_tg_url_cache_v16';
const TG_THUMB_CACHE_KEY = 'vaultify_tg_thumb_cache_v15';
const TG_URL_CACHE_TTL = 50 * 60 * 1000;
const TG_THUMB_CACHE_TTL = 30 * 24 * 60 * 60 * 1000;
const TG_LAST_SYNC_KEY = 'vaultify_tg_last_sync_v13';
const TG_LAST_SCANNED_KEY = 'vaultify_tg_last_scanned_id_v12';

let firebaseApp = null, firestoreDB = null, firebaseAuth = null, firebaseReady = false;
let tgLibrary = [], tgSyncTimer = null, lyricsCache = {};
try {
  if (typeof firebase !== 'undefined') {
    firebase.initializeApp({ apiKey:"AIzaSyCQgQoJpV9FGhd8yY2_nklQICQMpZ5-1RY", authDomain:"vaultify-18865.firebaseapp.com", projectId:"vaultify-18865", storageBucket:"vaultify-18865.firebasestorage.app", messagingSenderId:"961290318010", appId:"1:961290318010:web:efa1e8c95c8d09c533d283" });
    firestoreDB = firebase.firestore(); firebaseAuth = firebase.auth(); firebaseReady = true;
  }
} catch(e){}
function isFirebaseReady(){ return firebaseReady && firestoreDB && firebaseAuth; }

let currentPlaylist = [], currentTrackIndex = 0, isPlayingAudio = false, isShuffle = false, isRepeat = false;
let currentLanguage = 'hindi', currentVibe = 'general';
let appLanguage = localStorage.getItem('vaultify_app_lang') || 'en';
let currentLibraryTab = 'history';
let playlists = JSON.parse(localStorage.getItem('vaultify_playlists') || '[]');
let likedSongs = JSON.parse(localStorage.getItem('vaultify_liked') || '[]');
let searchHistoryList = JSON.parse(localStorage.getItem('vaultify_search_history') || '[]');
let playbackHistoryList = JSON.parse(localStorage.getItem('vaultify_playback_history') || '[]');
const trackBlobCache = new Map();
let isDraggingTimeline = false, autoMixFetching = false, _lastSaveTick = 0;
let cacheDB = null, audioContextNode = null, wakeLockSentinel = null, silentLoopStarted = false;
let eqNodes = null, eqSourceNode = null, mainAudio = null, silentLoop = null;
let currentSearchResults = [], currentHls = null, isLoginMode = false, loggedInUser = null;
let navigationHistory = ['home'], queueSeenIds = new Set(), libraryRenderPage = 0;
const LIBRARY_PAGE_SIZE = 60;
let sharedRefreshTimer = null, ytPlaylistPreview = null;
let syncInProgress = false, backgroundScanTimer = null, searchTriggeredSync = false;
let viewingPlaylistIndex = -1;

const QUEUE_TARGET_MIN = 15, QUEUE_MAX_TOTAL = 200;

function showToast(m){ const t=document.getElementById('toastPill'); if(!t)return; t.innerText=m; t.classList.add('show'); clearTimeout(t._tt); t._tt=setTimeout(()=>t.classList.remove('show'),3000); }
function escapeHtml(s){ return String(s).replace(/[&<>"']/g,x=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[x])); }
function formatClock(sec){ const s=Math.floor(sec||0); return `${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`; }
function openModal(id){ const el=document.getElementById(id); if(el) el.classList.add('open'); }
function closeModal(id){ const el=document.getElementById(id); if(el) el.classList.remove('open'); }
function openFullPlayer(){ const el=document.getElementById('fullPlayerModal'); if(el) el.classList.add('open'); }
function closeFullPlayer(){ const el=document.getElementById('fullPlayerModal'); if(el) el.classList.remove('open'); }
function openPartnerModal(){ openModal('modalPartner'); }
function openSupportModal(){ openModal('modalSupport'); }
function isAdminDevice(){ try{ return loggedInUser && loggedInUser.username === ADMIN_USERNAME; } catch(e){ return false; } }

function showSyncHint(duration=4000){
  const bubble = document.getElementById('syncHintBubble');
  const btn = document.getElementById('homeSyncBtn');
  if(!bubble||!btn) return;
  if(bubble.classList.contains('show')) return;
  switchNavTab('home');
  setTimeout(()=>{
    bubble.classList.add('show');
    btn.style.transition='all .5s ease'; btn.style.transform='scale(1.05)';
    setTimeout(()=>{ btn.style.transform='scale(1)'; },500);
    setTimeout(()=>{ bubble.classList.remove('show'); },duration);
  },300);
}
function maybeShowSyncHint(){
  const flag = localStorage.getItem('vaultify_sync_hint_shown');
  if(tgLibrary.length < 20){
    if(!flag || tgLibrary.length < 5){
      setTimeout(()=>{ showSyncHint(5000); localStorage.setItem('vaultify_sync_hint_shown','1'); },3500);
    }
  }
}

function setSyncBtnState(state,text){
  const btn=document.getElementById('homeSyncBtn'), icon=document.getElementById('homeSyncIcon'), txt=document.getElementById('homeSyncBtnText');
  if(txt) txt.innerText = text || 'SYNC';
  if(icon) icon.className = (state==='loading') ? 'fa-solid fa-rotate fa-spin' : 'fa-solid fa-rotate';
  if(btn) btn.disabled = (state==='loading');
}

function switchNavTab(tab,th=true){
  document.querySelectorAll('.view-screen').forEach(s=>s.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b=>b.classList.remove('active'));
  const map={home:{s:'tabHome',b:'tabBtnHome'},search:{s:'tabSearch',b:'tabBtnSearch'},library:{s:'tabLibrary',b:'tabBtnLibrary'},cert:{s:'tabCert',b:'tabBtnCert'},profile:{s:'tabProfile',b:'tabBtnProfile'}};
  const sel=map[tab]||map.home;
  const sEl=document.getElementById(sel.s), bEl=document.getElementById(sel.b);
  if(sEl) sEl.classList.add('active');
  if(bEl) bEl.classList.add('active');
  if(th && navigationHistory[navigationHistory.length-1]!==tab) navigationHistory.push(tab);
  if(tab==='home') setTimeout(renderRecommendedSection,300);
  if(tab==='library'){ libraryRenderPage=0; renderLibrary(); }
  if(tab==='profile') checkPermissionsStatus();
  if(tab==='cert') updateCertLiveDateTime();
}
function switchLibraryTab(tab,el){
  currentLibraryTab=tab; libraryRenderPage=0;
  document.querySelectorAll('#tabLibrary .nav-btn').forEach(p=>p.classList.remove('active'));
  if(el) el.classList.add('active');
  renderLibrary();
}
function handleSystemBackPress(){
  const fp=document.getElementById('fullPlayerModal'); if(fp&&fp.classList.contains('open')){ closeFullPlayer(); return true; }
  const om=document.querySelector('.modal-overlay.open'); if(om){ om.classList.remove('open'); return true; }
  const auth=document.getElementById('modalAuthGate'); if(auth&&auth.style.display==='flex') return false;
  const other=document.querySelectorAll('.view-screen.active:not(#tabHome)');
  if(other.length>0){ switchNavTab('home'); return true; }
  return false;
}
window.handleSystemBackPress=handleSystemBackPress;

function loadLocalLibrary(){ try{ const r=localStorage.getItem(TG_LIBRARY_KEY); if(r){ tgLibrary=JSON.parse(r); return true; } }catch(e){} tgLibrary=[]; return false; }
function saveLocalLibrary(){ try{ localStorage.setItem(TG_LIBRARY_KEY,JSON.stringify(tgLibrary)); }catch(e){} }

async function fetchSharedLibrary(){
  if(!isFirebaseReady()) return false;
  try{
    const mainDoc=await firestoreDB.collection(SHARED_MAIN_DOC[0]).doc(SHARED_MAIN_DOC[1]).get();
    if(!mainDoc.exists) return false;
    const main=mainDoc.data();
    const localVer=parseInt(localStorage.getItem(SHARED_VERSION_KEY)||'0');
    if(main.version<=localVer) return false;
    const chunksSnap=await firestoreDB.collection(SHARED_CHUNK_COL[0]).doc(SHARED_CHUNK_COL[1]).collection(SHARED_CHUNK_COL[2]).orderBy('index').get();
    if(chunksSnap.empty) return false;
    const merged=[];
    chunksSnap.forEach(doc=>{ const d=doc.data(); if(Array.isArray(d.songs)) merged.push(...d.songs); });
    if(merged.length===0) return false;
    const seen=new Set();
    tgLibrary=merged.filter(s=>{ if(!s.fileId||seen.has(s.fileId))return false; seen.add(s.fileId); return true; });
    saveLocalLibrary();
    localStorage.setItem(SHARED_VERSION_KEY,String(main.version));
    return true;
  }catch(e){ return false; }
}

async function publishSharedLibrary(){
  if(!isFirebaseReady() || !isAdminDevice() || tgLibrary.length===0) return false;
  try{
    const currentVer=parseInt(localStorage.getItem(SHARED_VERSION_KEY)||'0');
    const newVer=currentVer+1;
    const chunks=[];
    for(let i=0;i<tgLibrary.length;i+=CHUNK_SIZE) chunks.push(tgLibrary.slice(i,i+CHUNK_SIZE));
    const oldSnap=await firestoreDB.collection(SHARED_CHUNK_COL[0]).doc(SHARED_CHUNK_COL[1]).collection(SHARED_CHUNK_COL[2]).get();
    const delBatch=firestoreDB.batch();
    oldSnap.forEach(d=>delBatch.delete(d.ref));
    await delBatch.commit();
    for(let i=0;i<chunks.length;i++){
      await firestoreDB.collection(SHARED_CHUNK_COL[0]).doc(SHARED_CHUNK_COL[1]).collection(SHARED_CHUNK_COL[2]).doc('c'+i).set({index:i,songs:chunks[i]});
    }
    await firestoreDB.collection(SHARED_MAIN_DOC[0]).doc(SHARED_MAIN_DOC[1]).set({version:newVer,totalSongs:tgLibrary.length,chunkCount:chunks.length,lastUpdated:Date.now()});
    localStorage.setItem(SHARED_VERSION_KEY,String(newVer));
    return true;
  }catch(e){ return false; }
}

function startSharedRefresh(){
  if(sharedRefreshTimer) clearInterval(sharedRefreshTimer);
  sharedRefreshTimer=setInterval(async()=>{
    if(document.hidden||!navigator.onLine) return;
    const changed=await fetchSharedLibrary();
    if(changed){ renderLibrary(); renderRecommendedSection(); showToast('🎵 Library updated'); }
  },SHARED_REFRESH_INTERVAL);
}

function saveTgUrl(f,u){ try{ const c=JSON.parse(localStorage.getItem(TG_URL_CACHE_KEY)||'{}'); c[f]={url:u,t:Date.now()}; localStorage.setItem(TG_URL_CACHE_KEY,JSON.stringify(c)); }catch(e){} }
function getTgUrl(f){ try{ const c=JSON.parse(localStorage.getItem(TG_URL_CACHE_KEY)||'{}'); const e=c[f]; if(e&&(Date.now()-e.t)<TG_URL_CACHE_TTL) return e.url; }catch(e){} return null; }
function saveTgThumb(k,u){ try{ const c=JSON.parse(localStorage.getItem(TG_THUMB_CACHE_KEY)||'{}'); c[k]={url:u,t:Date.now()}; localStorage.setItem(TG_THUMB_CACHE_KEY,JSON.stringify(c)); }catch(e){} }
function getTgThumb(k){ try{ const c=JSON.parse(localStorage.getItem(TG_THUMB_CACHE_KEY)||'{}'); const e=c[k]; if(e&&(Date.now()-e.t)<TG_THUMB_CACHE_TTL) return e.url; }catch(e){} return null; }

async function fetchTgThumb(id){
  if(!id||!TG_BOTS.length) return '';
  const c=getTgThumb(id); if(c) return c;
  try{
    const r=await fetch(`${TG_API}/getFile?file_id=${encodeURIComponent(id)}`);
    if(!r.ok) return '';
    const d=await r.json();
    if(!d.ok||!d.result?.file_path) return '';
    const url=`https://api.telegram.org/file/bot${TG_BOTS[0]}/${d.result.file_path}`;
    saveTgThumb(id,url); return url;
  }catch(e){ return ''; }
}

async function syncTgLibrary(forceFull=false){
  if(!isAdminDevice()||!TG_BOTS.length) return tgLibrary;
  if(syncInProgress) return tgLibrary;
  syncInProgress=true; setSyncBtnState('loading','SYNCING...'); showToast('🔄 Sync shuru...');
  try{
    const added=await syncViaGetUpdates();
    if(added>0) showToast(`🎵 +${added} songs (total ${tgLibrary.length})`);
    saveLocalLibrary(); localStorage.setItem(TG_LAST_SYNC_KEY,Date.now().toString());
    if(tgLibrary.length>0) await publishSharedLibrary().catch(()=>{});
    startBackgroundScan(forceFull);
  }catch(e){ showToast('⚠️ Sync error'); }
  syncInProgress=false; setSyncBtnState('idle','SYNC');
  renderLibrary(); renderRecommendedSection();
  return tgLibrary;
}

async function syncViaGetUpdates(){
  let added=0,offset=0,hasMore=true;
  while(hasMore){
    try{
      const url=`${TG_API}/getUpdates?offset=${offset}&limit=100&timeout=0&allowed_updates=${encodeURIComponent('["channel_post"]')}`;
      const r=await fetch(url); const d=await r.json();
      if(!d.ok||!d.result||d.result.length===0){ hasMore=false; break; }
      for(const u of d.result){
        offset=u.update_id+1;
        const msg=u.channel_post; if(!msg) continue;
        if(await processTgMessage(msg,msg.message_id)) added++;
      }
      if(d.result.length<100) hasMore=false;
      await new Promise(r=>setTimeout(r,40));
    }catch(e){ hasMore=false; }
  }
  return added;
}

function startBackgroundScan(forceFull=false){
  if(backgroundScanTimer) return;
  const lastScanned = forceFull ? 0 : parseInt(localStorage.getItem(TG_LAST_SCANNED_KEY)||'0');
  if(!forceFull && lastScanned>=TG_INITIAL_MAX_ID) return;
  const startId = lastScanned + 1;
  if(startId > TG_INITIAL_MAX_ID) return;
  showToast(`🚀 Scanning ${startId} → ${TG_INITIAL_MAX_ID}`);
  backgroundScanTimer = setInterval(async()=>{
    const last = parseInt(localStorage.getItem(TG_LAST_SCANNED_KEY)||'0');
    if(last >= TG_INITIAL_MAX_ID){
      clearInterval(backgroundScanTimer); backgroundScanTimer=null;
      showToast(`✅ Scan complete (${tgLibrary.length} songs)`);
      saveLocalLibrary();
      if(tgLibrary.length>0) await publishSharedLibrary().catch(()=>{});
      renderLibrary(); renderRecommendedSection();
      setSyncBtnState('idle','SYNC');
      return;
    }
    const rs = last+1, re = Math.min(rs+9, TG_INITIAL_MAX_ID);
    try{
      const res = await scanRound(rs, re);
      localStorage.setItem(TG_LAST_SCANNED_KEY, String(re));
      if(res.added>0){ saveLocalLibrary(); renderLibrary(); }
      if(isAdminDevice()){
        const pct = Math.round((re/TG_INITIAL_MAX_ID)*100);
        setSyncBtnState('loading', `${tgLibrary.length} (${pct}%)`);
      }
    }catch(e){}
  }, 600);
}

async function scanRound(startId, endId){
  const bots = TG_BOTS.slice();
  const PER_BOT = 2;
  let added = 0;
  const promises = [];
  for(let i=0; i<bots.length; i++){
    for(let k=0; k<PER_BOT; k++){
      const id = startId + i*PER_BOT + k;
      if(id > endId) break;
      promises.push(processIdWithBot(bots[i], id));
    }
  }
  const results = await Promise.all(promises);
  results.forEach(r=>{ if(r.added) added++; });
  return { added };
}

async function processIdWithBot(token, id){
  const api = `https://api.telegram.org/bot${token}`;
  const tryOrder = TG_ACTIVE_FORWARD_CHAT
    ? [TG_ACTIVE_FORWARD_CHAT, TG_OWNER_CHAT_ID, TG_OWNER_DM_ID]
    : [TG_OWNER_CHAT_ID, TG_OWNER_DM_ID];

  for(const targetChat of tryOrder){
    try{
      const r = await fetch(`${api}/forwardMessage`, {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ chat_id: targetChat, from_chat_id: TG_CHANNEL_ID, message_id: id, disable_notification: true })
      });
      const d = await r.json();

      if(d.error_code === 429){
        const retry = (d.parameters?.retry_after || 3) + 1;
        await new Promise(res => setTimeout(res, retry*1000));
        return { ok:false, added:false };
      }

      if(d.ok && d.result){
        if(!TG_ACTIVE_FORWARD_CHAT){
          TG_ACTIVE_FORWARD_CHAT = targetChat;
          console.log(`✅ Forward target locked: ${targetChat}`);
        }
        fetch(`${api}/deleteMessage`, { method:'POST', headers:{'Content-Type':'application/json'},
          body: JSON.stringify({ chat_id: targetChat, message_id: d.result.message_id }) }).catch(()=>{});
        const songAdded = await processTgMessage(d.result, id);
        return { ok:true, added:songAdded };
      }
      console.log(`❌ Forward ${targetChat}: ${d.description||d.error_code}`);
    }catch(e){ console.log(`⚠️ ${e.message}`); }
  }
  return { ok:false, added:false };
}

async function processTgMessage(msg, msgId){
  const doc = msg.document || msg.audio;
  if(!doc) return false;
  if(tgLibrary.some(s=>s.fileId === doc.file_id)) return false;
  const mime = doc.mime_type || '', fname = doc.file_name || '';
  const isAudio = msg.audio || /\.(mp3|m4a|aac|opus|ogg|flac|wav)$/i.test(fname) || mime.startsWith('audio/');
  if(!isAudio) return false;
  let title='', artist='', thumb='';
  if(msg.audio){
    title = (doc.title||'').trim();
    artist = (doc.performer||doc.artist||'').trim();
    if(doc.thumb?.file_id) thumb = doc.thumb.file_id;
    else if(doc.thumbnail?.file_id) thumb = doc.thumbnail.file_id;
  }
  if(!title){
    const name = fname.replace(/\.(mp3|m4a|aac|opus|ogg|flac|wav)$/i,'');
    const parts = name.split(' - ');
    title = parts[0]?.trim() || name || 'Unknown';
    if(!artist) artist = parts[1]?.trim() || 'Unknown';
  }
  if(!title || title === 'Unknown') return false;
  if(!artist) artist = 'Unknown';
  let thumbUrl = '';
  if(thumb) thumbUrl = await fetchTgThumb(thumb);
  tgLibrary.push({ title, artist, cover:thumbUrl, fileId:doc.file_id, duration:doc.duration||0, size:doc.file_size||0, msgId:msgId||msg.message_id, addedAt:Date.now() });
  return true;
}

let syncLoopRunning = false;
async function continuousSyncLoop(){
  if(syncLoopRunning) return;
  if(!isAdminDevice()) return;
  syncLoopRunning = true;
  try{
    const added = await syncViaGetUpdates();
    if(added>0){ saveLocalLibrary(); await publishSharedLibrary().catch(()=>{}); }
  }catch(e){}
  startBackgroundScan(false);
  while(syncLoopRunning){
    await new Promise(r=>setTimeout(r,TG_LOOP_INTERVAL));
    if(!navigator.onLine) continue;
    try{
      const added = await syncViaGetUpdates();
      if(added>0){ saveLocalLibrary(); await publishSharedLibrary().catch(()=>{}); renderLibrary(); renderRecommendedSection(); showToast(`🎵 +${added} new songs`); }
    }catch(e){}
  }
  syncLoopRunning = false;
}
function stopContinuousSync(){ syncLoopRunning = false; if(backgroundScanTimer){ clearInterval(backgroundScanTimer); backgroundScanTimer=null; } }

async function manualSyncTg(){
  if(syncInProgress) return showToast('⏳ Sync chal rahi hai...');
  if(!isAdminDevice()){
    showToast('🔄 Checking updates...');
    const ok = await fetchSharedLibrary();
    showToast(ok ? `✅ ${tgLibrary.length} songs` : '✅ Up-to-date');
    renderLibrary(); renderRecommendedSection(); return;
  }
  await syncTgLibrary(true);
}

function startHourlySync(){
  if(tgSyncTimer) clearInterval(tgSyncTimer);
  tgSyncTimer=setInterval(()=>{
    if(!isAdminDevice()||!navigator.onLine||document.visibilityState!=='visible') return;
    const last=parseInt(localStorage.getItem(TG_LAST_SYNC_KEY)||'0');
    if(Date.now()-last<TG_SYNC_INTERVAL) return;
    syncTgLibrary(false).catch(()=>{});
  },60000);
}

async function searchLyrics(query){
  if(!query||query.length<3) return [];
  const key=query.toLowerCase().trim();
  if(lyricsCache[key]) return lyricsCache[key];
  try{
    const ctrl=new AbortController(); const tm=setTimeout(()=>ctrl.abort(),5000);
    const r=await fetch(`https://lrclib.net/api/search?q=${encodeURIComponent(query)}`,{signal:ctrl.signal});
    clearTimeout(tm); if(!r.ok) return [];
    const data=await r.json(); if(!Array.isArray(data)) return [];
    const results=data.slice(0,10).map(i=>({id:`lyric_${i.id}`,title:i.trackName||i.name||'Unknown',artist:i.artistName||'Unknown',cover:'',duration:i.duration||0,source:'lyrics',_lyricQuery:`${i.trackName} ${i.artistName}`}));
    lyricsCache[key]=results;
    if(Object.keys(lyricsCache).length>50) lyricsCache={};
    return results;
  }catch(e){ return []; }
}

async function checkWorker(){ return true; }
async function searchSaavn(query,limit=25){
  try{
    const r=await fetch(`${SAAVN_DELTA}/api/search/songs?query=${encodeURIComponent(query)}&limit=${limit}`);
    const data=await r.json();
    const arr=data.data?.results || data.results || [];
    return arr.map(s=>{
      const cover = s.image?.[2]?.url || s.image?.[1]?.url || s.image?.[0]?.url || '';
      const artist = s.artists?.primary?.map(a=>a.name).join(', ') || s.primaryArtists || s.singers || 'Unknown';
      return { id:'saavn_'+s.id, title:(s.name||s.title||'Unknown').replace(/&quot;/g,'"').replace(/&amp;/g,'&'), artist:artist.replace(/&quot;/g,'"').replace(/&amp;/g,'&'), cover, duration:s.duration||0, source:'saavn', _saavnId:s.id, _lang:(s.language||'').toLowerCase()||undefined };
    }).filter(t=>t._saavnId);
  }catch(e){ return []; }
}
async function saavnStreamUrl(id){
  try{
    const r=await fetch(`${SAAVN_DELTA}/api/songs/${id}`);
    const data=await r.json();
    const song=data.data?.[0] || data.data;
    const downloads=song?.downloadUrl || [];
    if(!downloads.length) return null;
    return downloads.slice().sort((a,b)=>(parseInt(b.quality)||0)-(parseInt(a.quality)||0))[0]?.url || null;
  }catch(e){ return null; }
}
async function searchSoundCloud(query,limit=10){
  try{
    const r=await fetch(`https://api-v2.soundcloud.com/search/tracks?q=${encodeURIComponent(query)}&client_id=${SC_CLIENT_ID}&limit=${limit}&linked_partitioning=1`);
    const data=await r.json();
    return (data.collection||[]).filter(t=>t.stream_url&&t.id).map(t=>({
      id:'sc_'+t.id, title:t.title||'Unknown', artist:t.user?.username||'SoundCloud',
      cover:t.artwork_url?t.artwork_url.replace('-large','-t500x500'):'',
      duration:Math.floor((t.duration||0)/1000), source:'soundcloud', _directStream:`${t.stream_url}?client_id=${SC_CLIENT_ID}`
    }));
  }catch(e){ return []; }
}
async function searchJamendo(query,limit=20){
  try{
    const r=await fetch(`https://api.jamendo.com/v3.0/tracks/?client_id=${JAMENDO_CLIENT_ID}&format=json&limit=${limit}&search=${encodeURIComponent(query)}&audioformat=mp32&include=musicinfo`);
    const data=await r.json();
    return (data.results||[]).map(t=>({ id:'jam_'+t.id, title:t.name||'Unknown', artist:t.artist_name||'Jamendo', cover:t.image||t.album_image||'', duration:t.duration||0, source:'jamendo', _directStream:t.audio||t.audiodownload||null, _jamId:t.id })).filter(t=>t._directStream);
  }catch(e){ return []; }
}
async function searchSaavnAndSC(query,limit=30){
  const results=[]; const seen=new Set();
  const addUnique=(t)=>{ const k=((t.title||'')+'|'+(t.artist||'')).toLowerCase().trim(); if(seen.has(k)) return; seen.add(k); results.push(t); };
  const q=query.toLowerCase().trim();
  if(tgLibrary.length>0){
    tgLibrary.forEach(item=>{
      if((item.title+' '+item.artist).toLowerCase().includes(q)){
        addUnique({id:'tg_'+item.fileId,title:item.title,artist:item.artist,cover:item.cover||'',duration:item.duration||0,source:'telegram',_fileId:item.fileId});
      }
    });
  }
  const [saavn,lyrics,sc,jam]=await Promise.all([
    searchSaavn(query,Math.floor(limit*0.5)).catch(()=>[]),
    searchLyrics(query).catch(()=>[]),
    searchSoundCloud(query,Math.floor(limit*0.15)).catch(()=>[]),
    searchJamendo(query,Math.floor(limit*0.15)).catch(()=>[])
  ]);
  saavn.forEach(addUnique);
  for(const lr of lyrics){ if(results.length>=limit) break; try{ const sub=await searchSaavn(lr._lyricQuery||lr.title,2); sub.forEach(addUnique); }catch(e){} }
  sc.forEach(addUnique); jam.forEach(addUnique);
  return results.slice(0,limit);
}
async function workerSearch(query,limit=30){ return await searchSaavnAndSC(query,limit); }
async function workerStreamUrl(id){
  if(id.startsWith('saavn_')) return await saavnStreamUrl(id.replace('saavn_',''));
  if(id.startsWith('tg_')){
    const fileId=id.replace('tg_','');
    const cached=getTgUrl(fileId); if(cached) return cached;
    try{
      const r=await fetch(`${TG_API}/getFile?file_id=${encodeURIComponent(fileId)}`);
      if(!r.ok) return null;
      const data=await r.json();
      if(!data.ok||!data.result?.file_path) return null;
      const streamUrl=`https://api.telegram.org/file/bot${TG_BOTS[0]}/${data.result.file_path}`;
      saveTgUrl(fileId,streamUrl); return streamUrl;
    }catch(e){ return null; }
  }
  return null;
}

function extractPlaylistId(url){
  if(!url) return null;
  let m=url.match(/[?&]list=([A-Za-z0-9_-]+)/);
  if(m) return m[1];
  m=url.match(/youtu\.be\/[^?]+\?.*list=([A-Za-z0-9_-]+)/);
  if(m) return m[1];
  return null;
}
async function fetchYouTubePlaylist(pid){
  for(const api of PIPED_APIS){
    try{
      const ctrl=new AbortController(); const tm=setTimeout(()=>ctrl.abort(),10000);
      const r=await fetch(`${api}/playlists/${pid}`,{signal:ctrl.signal});
      clearTimeout(tm); if(!r.ok) continue;
      const data=await r.json();
      const items=(data.relatedStreams||data.videos||data.items||[]).filter(i=>i.url||i.videoId);
      if(items.length===0) continue;
      return { name:data.name||data.title||'YouTube Playlist', thumbnail:data.thumbnailUrl||'', tracks:items.map(i=>{
        const urlField=i.url||('/watch?v='+i.videoId);
        const vid=urlField.replace('/watch?v=','');
        return { ytId:vid, title:i.title||'Unknown', artist:i.uploaderName||'YouTube', cover:i.thumbnail||`https://i.ytimg.com/vi/${vid}/mqdefault.jpg`, duration:i.duration||0 };
      }) };
    }catch(e){ continue; }
  }
  for(const api of INVIDIOUS_APIS){
    try{
      const ctrl=new AbortController(); const tm=setTimeout(()=>ctrl.abort(),10000);
      const r=await fetch(`${api}/api/v1/playlists/${pid}`,{signal:ctrl.signal});
      clearTimeout(tm); if(!r.ok) continue;
      const data=await r.json();
      const items=(data.videos||[]).filter(v=>v.videoId);
      if(items.length===0) continue;
      return { name:data.title||'YouTube Playlist', thumbnail:data.playlistThumbnail||'', tracks:items.map(v=>({ ytId:v.videoId, title:v.title||'Unknown', artist:v.author||'YouTube', cover:`https://i.ytimg.com/vi/${v.videoId}/mqdefault.jpg`, duration:v.lengthSeconds||0 })) };
    }catch(e){ continue; }
  }
  return null;
}
function normalizeForMatch(s){ return String(s||'').toLowerCase().replace(/\(.*?\)/g,' ').replace(/\[.*?\]/g,' ').replace(/official|video|audio|lyrical|lyrics|hd|4k|8k|music|full|song|from|the|a|an|feat|ft\.?/gi,' ').replace(/[^a-z0-9\u0900-\u097F\u0600-\u06FF\u0A00-\u0A7F ]/g,' ').replace(/\s+/g,' ').trim(); }
function scoreMatch(qt,qa,tt,ta){
  const qT=normalizeForMatch(qt), qA=normalizeForMatch(qa), tT=normalizeForMatch(tt), tA=normalizeForMatch(ta);
  if(!qT||!tT) return 0;
  let score=0;
  if(qT===tT) score+=100;
  else if(qT.includes(tT)||tT.includes(qT)) score+=70;
  else { const qW=new Set(qT.split(' ').filter(w=>w.length>2)), tW=new Set(tT.split(' ').filter(w=>w.length>2)); if(qW.size>0&&tW.size>0){ let c=0; qW.forEach(w=>{ if(tW.has(w)) c++; }); score+=(c/Math.min(qW.size,tW.size))*60; } }
  if(qA&&tA){ if(qA===tA) score+=30; else if(qA.includes(tA)||tA.includes(qA)) score+=20; }
  return score;
}
function matchToTgLibrary(track,threshold=55){
  if(tgLibrary.length===0) return null;
  const qTitle=track.title||'', qArtist=track.artist||'';
  let bestScore=0, bestMatch=null;
  const firstWord=normalizeForMatch(qTitle).split(' ')[0]||'';
  const candidates=firstWord.length>2 ? tgLibrary.filter(t=>normalizeForMatch(t.title).includes(firstWord)) : tgLibrary;
  const pool=candidates.length>0?candidates:tgLibrary;
  for(const tg of pool){
    const s=scoreMatch(qTitle,qArtist,tg.title,tg.artist);
    if(s>bestScore){ bestScore=s; bestMatch=tg; if(s>=100) break; }
  }
  if(bestScore>=threshold&&bestMatch){
    return { id:'tg_'+bestMatch.fileId, title:bestMatch.title, artist:bestMatch.artist, cover:bestMatch.cover||track.cover||'', duration:bestMatch.duration||track.duration||0, source:'telegram', _fileId:bestMatch.fileId };
  }
  return null;
}
async function matchToSaavn(track){
  try{
    const cleanTitle=track.title.replace(/\(.*?\)/g,'').replace(/\[.*?\]/g,'').replace(/official|video|audio|lyrical|hd|4k|music/gi,'').replace(/\s+/g,' ').trim();
    const results=await searchSaavn(`${cleanTitle} ${track.artist}`.substring(0,80),3);
    if(results.length>0) return { ...results[0] };
  }catch(e){}
  return null;
}
async function smartMatchTrack(track){
  const tgMatch=matchToTgLibrary(track);
  if(tgMatch) return tgMatch;
  const saavnMatch=await matchToSaavn(track);
  if(saavnMatch) return saavnMatch;
  return { id:'yt_'+track.ytId, title:track.title, artist:track.artist, cover:track.cover, duration:track.duration, source:'youtube', _ytId:track.ytId };
}
async function importYouTubePlaylist(url){
  const pid=extractPlaylistId(url);
  if(!pid){ showToast('❌ Invalid YouTube URL'); return null; }
  showToast('🎬 Playlist fetch ho rahi hai...');
  const playlist=await fetchYouTubePlaylist(pid);
  if(!playlist||playlist.tracks.length===0){ showToast('❌ Playlist load nahi hui'); return null; }
  showToast(`✅ ${playlist.tracks.length} songs — matching...`);
  const matched=[]; const CONCURRENCY=10;
  for(let i=0;i<playlist.tracks.length;i+=CONCURRENCY){
    const batch=playlist.tracks.slice(i,i+CONCURRENCY);
    const results=await Promise.all(batch.map(t=>smartMatchTrack(t)));
    matched.push(...results);
    if(i+CONCURRENCY<playlist.tracks.length) await new Promise(r=>setTimeout(r,200));
  }
  const tg=matched.filter(t=>t.source==='telegram').length;
  const sa=matched.filter(t=>t.source==='saavn').length;
  const yt=matched.filter(t=>t.source==='youtube').length;
  showToast(`✅ ${tg} TG + ${sa} Saavn + ${yt} YT`);
  playlists.push({ id: Date.now(), name: playlist.name, songs: matched.slice(), created: Date.now(), cover: playlist.thumbnail || (matched[0]?.cover || '') });
  savePlaylists();
  renderLibrary();
  return { name: playlist.name, cover: playlist.thumbnail, tracks: matched };
}

function openYtPlaylistModal(){
  ytPlaylistPreview=null;
  const ia=document.getElementById('ytPlaylistInputArea'), la=document.getElementById('ytPlaylistLoading'), pa=document.getElementById('ytPlaylistPreview'), inp=document.getElementById('ytPlaylistUrlInput');
  if(ia) ia.style.display='block';
  if(la) la.style.display='none';
  if(pa){ pa.style.display='none'; pa.innerHTML=''; }
  if(inp) inp.value='';
  openModal('modalYtPlaylist');
}
async function loadYtPlaylistPreview(){
  const url=(document.getElementById('ytPlaylistUrlInput')?.value||'').trim();
  if(!url) return showToast('URL daalo');
  if(!extractPlaylistId(url)) return showToast('❌ Invalid YT URL');
  const ia=document.getElementById('ytPlaylistInputArea'), la=document.getElementById('ytPlaylistLoading'), lt=document.getElementById('ytPlaylistLoadingText');
  if(ia) ia.style.display='none';
  if(la) la.style.display='block';
  if(lt) lt.innerText='🎬 Fetching playlist...';
  const playlist=await importYouTubePlaylist(url);
  if(!playlist||!playlist.tracks||playlist.tracks.length===0){
    if(la) la.style.display='none';
    if(ia) ia.style.display='block';
    return;
  }
  ytPlaylistPreview=playlist;
  renderYtPlaylistPreviewUI();
}
function renderYtPlaylistPreviewUI(){
  const p=ytPlaylistPreview; if(!p) return;
  const la=document.getElementById('ytPlaylistLoading'), pa=document.getElementById('ytPlaylistPreview');
  if(la) la.style.display='none';
  if(!pa) return;
  pa.style.display='block';
  const tg=p.tracks.filter(t=>t.source==='telegram').length, sa=p.tracks.filter(t=>t.source==='saavn').length, yt=p.tracks.filter(t=>t.source==='youtube').length;
  let html=`<div style="background:linear-gradient(135deg,rgba(139,92,246,.15),rgba(168,85,247,.08));border:1px solid var(--border);border-radius:12px;padding:12px;margin-bottom:10px">
    <div style="font-size:14px;font-weight:700;color:#fff;margin-bottom:6px">${escapeHtml(p.name)}</div>
    <div style="font-size:11px;color:var(--text-sub);line-height:1.6"><i class="fa-solid fa-music"></i> ${p.tracks.length} · <span style="color:#229ED9">✈ ${tg}</span> · <span style="color:var(--accent-neon)">♪ ${sa}</span> · <span style="color:#ef4444">▶ ${yt}</span></div>
    <div style="font-size:10.5px;color:#10b981;margin-top:6px"><i class="fa-solid fa-check-circle"></i> Saved to Playlists!</div>
  </div>`;
  html+=`<div style="display:flex;gap:8px;margin-bottom:12px">
    <button class="submit-btn" style="flex:1;font-size:12px;padding:10px" onclick="playYtPlaylistNow()"><i class="fa-solid fa-play"></i> Play All</button>
    <button class="submit-btn" style="flex:1;font-size:12px;padding:10px;background:rgba(255,255,255,.08);color:var(--text-sub)" onclick="closeModal('modalYtPlaylist');switchNavTab('library');switchLibraryTab('playlists',null)"><i class="fa-solid fa-list"></i> View in Playlists</button>
  </div>`;
  html+=p.tracks.map((t,i)=>{
    const sId=encodeURIComponent(t.id), sT=encodeURIComponent(t.title||''), sA=encodeURIComponent(t.artist||''), sC=encodeURIComponent(t.cover||'vaultify.png'), sD=t._directStream?encodeURIComponent(t._directStream):'';
    let badge='';
    if(t.source==='telegram') badge='<img src="vaultify.png" style="width:14px;height:14px;border-radius:50%;margin-left:6px;vertical-align:middle;border:1px solid #229ED9" onerror="this.style.display=\'none\'" />';
    else if(t.source==='youtube') badge='<i class="fa-brands fa-youtube" style="color:#ff0000;font-size:11px;margin-left:6px"></i>';
    else if(t.source==='saavn') badge='<i class="fa-solid fa-music" style="color:var(--accent-neon);font-size:10px;margin-left:6px"></i>';
    return `<div class="song-tile" onclick="playSearchedTrackImmediately('${sId}','${sT}','${sA}','${sC}','${sD}',${t.duration||0})"><div class="tile-left"><span style="font-size:10px;color:var(--text-sub);width:22px;text-align:center">${i+1}</span><img src="${t.cover||'vaultify.png'}" class="tile-thumb" onerror="this.src='vaultify.png'" loading="lazy" /><div class="tile-meta"><h4>${escapeHtml(t.title)}${badge}</h4><p>${escapeHtml(t.artist)}</p></div></div><i class="fa-solid fa-play" style="color:var(--accent-neon);font-size:13px"></i></div>`;
  }).join('');
  pa.innerHTML=html;
}
function playYtPlaylistNow(){
  if(!ytPlaylistPreview||!ytPlaylistPreview.tracks.length) return;
  currentPlaylist=ytPlaylistPreview.tracks.slice();
  currentTrackIndex=0; queueSeenIds=new Set(currentPlaylist.map(t=>t.id));
  renderHomeQueue(); saveQueueToStorage(); playTrack(0);
  closeModal('modalYtPlaylist');
  showToast(`▶ ${ytPlaylistPreview.name} (${ytPlaylistPreview.tracks.length})`);
}

function openPlaylistView(idx){
  const p = playlists[idx]; if(!p) return;
  viewingPlaylistIndex = idx;
  const titleEl = document.getElementById('playlistViewTitle');
  if(titleEl) titleEl.innerText = p.name;
  renderPlaylistViewSongs();
  openModal('modalPlaylistView');
}
function renderPlaylistViewSongs(){
  const p = playlists[viewingPlaylistIndex];
  const c = document.getElementById('playlistViewSongs');
  if(!c||!p) return;
  if(p.songs.length === 0){ c.innerHTML = `<p style="font-size:12px;color:var(--text-sub);text-align:center;padding:20px">Empty playlist</p>`; return; }
  c.innerHTML = p.songs.map((t,i)=>{
    return `<div class="song-tile" onclick="playPlaylistSongAt(${i})"><div class="tile-left"><span style="font-size:10px;color:var(--text-sub);width:22px;text-align:center">${i+1}</span><img src="${t.cover||'vaultify.png'}" class="tile-thumb" onerror="this.src='vaultify.png'" loading="lazy" /><div class="tile-meta"><h4>${escapeHtml(t.title)}</h4><p>${escapeHtml(t.artist)}</p></div></div><i class="fa-solid fa-play" style="color:var(--accent-neon);font-size:13px"></i></div>`;
  }).join('');
}
function playPlaylistSongAt(i){
  const p = playlists[viewingPlaylistIndex]; if(!p||!p.songs[i]) return;
  currentPlaylist = p.songs.slice();
  currentTrackIndex = i;
  queueSeenIds = new Set(currentPlaylist.map(t=>t.id));
  renderHomeQueue(); saveQueueToStorage(); playTrack(i);
  closeModal('modalPlaylistView');
}
function playCurrentViewPlaylist(){
  const p = playlists[viewingPlaylistIndex]; if(!p||p.songs.length===0) return showToast('Empty playlist');
  currentPlaylist = p.songs.slice();
  currentTrackIndex = 0;
  queueSeenIds = new Set(currentPlaylist.map(t=>t.id));
  renderHomeQueue(); saveQueueToStorage(); playTrack(0);
  closeModal('modalPlaylistView');
  showToast(`▶ ${p.name} (${p.songs.length} songs)`);
}
function deleteCurrentViewPlaylist(){
  if(viewingPlaylistIndex<0) return;
  if(!confirm('Delete this playlist?')) return;
  playlists.splice(viewingPlaylistIndex,1);
  savePlaylists();
  closeModal('modalPlaylistView');
  renderLibrary();
  showToast('Deleted');
}

const AUTH_ITERATIONS=100000, AUTH_SALT_BYTES=16, AUTH_KEY_BYTES=32;
function bytesToHex(b){ return Array.from(new Uint8Array(b)).map(x=>x.toString(16).padStart(2,'0')).join(''); }
function hexToBytes(h){ const a=new Uint8Array(h.length/2); for(let i=0;i<h.length;i+=2) a[i/2]=parseInt(h.substr(i,2),16); return a; }
function generateSalt(){ const s=new Uint8Array(AUTH_SALT_BYTES); crypto.getRandomValues(s); return bytesToHex(s); }
async function derivePasswordHash(p,saltHex){
  try{
    const bk=await crypto.subtle.importKey('raw',new TextEncoder().encode(p),{name:'PBKDF2'},false,['deriveBits']);
    const bits=await crypto.subtle.deriveBits({name:'PBKDF2',salt:hexToBytes(saltHex),iterations:AUTH_ITERATIONS,hash:'SHA-256'},bk,AUTH_KEY_BYTES*8);
    return bytesToHex(bits);
  }catch(e){ let h=p+'|'+saltHex; for(let i=0;i<50000;i++) h=btoa(h+p); return h; }
}
function getUserDB(){ try{ return JSON.parse(localStorage.getItem('vaultify_user_db')||'{}'); }catch(e){ return {}; } }
function saveUserDB(db){ localStorage.setItem('vaultify_user_db',JSON.stringify(db)); }
function findUserByEmail(e){ const db=getUserDB(); const el=String(e||'').toLowerCase(); for(const k in db){ if(db[k]?.email&&String(db[k].email).toLowerCase()===el) return {key:k,user:db[k]}; } return null; }
function findUserByUsername(u){ const db=getUserDB(); const ul=String(u||'').toLowerCase(); return db[ul]?{key:ul,user:db[ul]}:null; }
function validateUsername(u){ if(!u||u.length<3) return {ok:false,msg:'Username min 3 chars'}; if(u.length>20) return {ok:false,msg:'Max 20 chars'}; if(!/^[a-z0-9_]+$/.test(u)) return {ok:false,msg:'Only a-z, 0-9, _'}; return {ok:true}; }
function validateEmail(e){ if(!e?.trim()) return {ok:false,msg:'Email required'}; if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) return {ok:false,msg:'Invalid email'}; return {ok:true}; }
function validatePassword(p){ if(!p||p.length<8) return {ok:false,msg:'Min 8 chars'}; if(!/[A-Za-z]/.test(p)) return {ok:false,msg:'Include letter'}; if(!/[0-9]/.test(p)) return {ok:false,msg:'Include number'}; return {ok:true}; }
function showAuthError(m){ const er=document.getElementById('authErrorAlert'), ok=document.getElementById('authSuccessAlert'); if(ok) ok.style.display='none'; if(er){ er.innerText=m; er.style.display='block'; } }
function showAuthSuccess(m){ const er=document.getElementById('authErrorAlert'), ok=document.getElementById('authSuccessAlert'); if(er) er.style.display='none'; if(ok){ ok.innerText=m; ok.style.display='block'; } }
function hideAuthAlerts(){ const er=document.getElementById('authErrorAlert'), ok=document.getElementById('authSuccessAlert'); if(er) er.style.display='none'; if(ok) ok.style.display='none'; }
function toggleAuthMode(){
  isLoginMode=!isLoginMode;
  const b=document.getElementById('authSubmitBtn'), t=document.getElementById('authModeToggleText'), n=document.getElementById('authDisplayNameInput');
  if(b) b.innerText=isLoginMode?'Log In':'Create Account';
  if(t) t.innerText=isLoginMode?"Don't have account? Sign up":'Already registered? Log in';
  if(n) n.style.display=isLoginMode?'none':'block';
  hideAuthAlerts();
}
function verifyAuthGate(){
  const s=localStorage.getItem('vaultify_active_user');
  const authModal=document.getElementById('modalAuthGate'), mainFrame=document.querySelector('.mobile-frame');
  if(!authModal) return;
  const styleModal=()=>{ Object.assign(authModal.style,{position:'fixed',inset:'0',width:'100vw',height:'100vh',zIndex:'99999',background:'rgba(0,0,0,0.94)',backdropFilter:'blur(8px)',alignItems:'center',justifyContent:'center',padding:'16px',overflowY:'auto',display:'flex'}); };
  if(!s){ document.body.classList.add('auth-locked'); if(mainFrame) mainFrame.style.pointerEvents='none'; authModal.classList.add('open'); styleModal(); }
  else{
    try{
      loggedInUser=JSON.parse(s); applyUserDataUI(loggedInUser);
      document.body.classList.remove('auth-locked'); if(mainFrame) mainFrame.style.pointerEvents='';
      authModal.classList.remove('open'); authModal.style.display='none';
    }catch(e){ document.body.classList.add('auth-locked'); authModal.classList.add('open'); styleModal(); }
  }
}
function unlockApp(){
  const a=document.getElementById('modalAuthGate'), m=document.querySelector('.mobile-frame'), i=document.getElementById('appIntroScreen');
  if(a){ a.classList.remove('open'); a.style.display='none'; }
  if(i){ i.style.display='none'; i.style.visibility='hidden'; }
  document.body.classList.remove('auth-locked'); if(m) m.style.pointerEvents='';
}
async function processAuthSubmission(){
  hideAuthAlerts();
  const u=String(document.getElementById('authUsernameInput').value||'').trim().toLowerCase();
  const e=String(document.getElementById('authEmailInput').value||'').trim().toLowerCase();
  const p=document.getElementById('authPasswordInput').value||'';
  const dName=document.getElementById('authDisplayNameInput').value.trim();
  const vu=validateUsername(u); if(!vu.ok) return showAuthError(vu.msg);
  const ve=validateEmail(e); if(!ve.ok) return showAuthError(ve.msg);
  if(!isLoginMode){ const vp=validatePassword(p); if(!vp.ok) return showAuthError(vp.msg); }
  else{ if(!p) return showAuthError('Password required'); }
  const btn=document.getElementById('authSubmitBtn'), orig=btn.innerText;
  btn.innerText='Please wait...'; btn.disabled=true;
  try{
    if(isLoginMode){
      let found=findUserByUsername(u);
      if(!found&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(u)) found=findUserByEmail(u);
      if(!found){ showAuthError("❌ Account doesn't exist"); return; }
      const user=found.user;
      if(String(user.email||'').toLowerCase()!==e){ showAuthError('❌ Email mismatch'); return; }
      const derived=await derivePasswordHash(p,user.salt||'');
      if(derived!==user.passwordHash){ showAuthError('❌ Invalid password'); return; }
      user.lastLogin=Date.now();
      const db=getUserDB(); db[found.key]=user; saveUserDB(db);
      loggedInUser=user; localStorage.setItem('vaultify_active_user',JSON.stringify(loggedInUser));
      showAuthSuccess('✅ Login successful!');
      setTimeout(()=>{ unlockApp(); applyUserDataUI(loggedInUser); showToast('Welcome back!'); hideAuthAlerts(); },500);
    } else {
      if(findUserByUsername(u)){ showAuthError('❌ Username taken'); return; }
      if(findUserByEmail(e)){ showAuthError('❌ Email registered'); return; }
      const salt=generateSalt(); const passwordHash=await derivePasswordHash(p,salt);
      const newUser={ username:u, email:e, displayName:dName||u, bio:'', passwordHash, salt, avatar:'', partnerCode:generatePartnerCode(u), createdAt:Date.now(), lastLogin:Date.now() };
      const db=getUserDB(); db[u]=newUser; saveUserDB(db);
      loggedInUser=newUser; localStorage.setItem('vaultify_active_user',JSON.stringify(loggedInUser));
      showAuthSuccess('✅ Account created!');
      setTimeout(()=>{ unlockApp(); applyUserDataUI(loggedInUser); showToast('Welcome!'); hideAuthAlerts(); },600);
    }
  }catch(err){ showAuthError('⚠️ Something went wrong'); }
  finally{ btn.innerText=orig; btn.disabled=false; }
}
function applyUserDataUI(u){
  if(!u) return;
  const n=document.getElementById('editDisplayName'), b=document.getElementById('editBio'), a=document.getElementById('userAvatarImg');
  if(n) n.value=u.displayName||u.username;
  if(b) b.value=u.bio||'';
  if(a&&u.avatar) a.src=u.avatar;
}
function openForgotPasswordFlow(){ closeModal('modalAuthGate'); openModal('modalForgotPass'); }
async function executePasswordReset(){
  const u=document.getElementById('fpUsername').value.trim().toLowerCase();
  const e=document.getElementById('fpEmail').value.trim().toLowerCase();
  const p=document.getElementById('fpNewPassword').value;
  const vu=validateUsername(u); if(!vu.ok) return showToast(vu.msg);
  const ve=validateEmail(e); if(!ve.ok) return showToast(ve.msg);
  const vp=validatePassword(p); if(!vp.ok) return showToast(vp.msg);
  const found=findUserByUsername(u);
  if(!found) return showToast("❌ Account doesn't exist");
  if(String(found.user.email||'').toLowerCase()!==e) return showToast('❌ Email mismatch');
  const salt=generateSalt(); const hash=await derivePasswordHash(p,salt);
  const db=getUserDB(); db[found.key].passwordHash=hash; db[found.key].salt=salt; saveUserDB(db);
  closeModal('modalForgotPass'); openModal('modalAuthGate'); showToast('✅ Password updated!');
}
function triggerDpPicker(){ const p=document.getElementById('avatarPicker'); if(p) p.click(); }
function handleDpUpload(e){
  const f=e.target.files[0]; if(!f) return;
  if(f.size>3*1024*1024) return showToast('Max 3MB');
  if(!f.type.startsWith('image/')) return showToast('Image only');
  const r=new FileReader();
  r.onload=ev=>{
    document.getElementById('userAvatarImg').src=ev.target.result;
    if(loggedInUser){ loggedInUser.avatar=ev.target.result; const db=getUserDB(); if(db[loggedInUser.username]){ db[loggedInUser.username].avatar=ev.target.result; saveUserDB(db); } localStorage.setItem('vaultify_active_user',JSON.stringify(loggedInUser)); }
    showToast('✅ DP Updated!');
  };
  r.readAsDataURL(f); e.target.value='';
}
function saveProfileData(){
  if(!loggedInUser) return;
  const n=document.getElementById('editDisplayName').value.trim(); if(!n) return showToast('Name required');
  const bio=(document.getElementById('editBio')?.value||'').trim();
  loggedInUser.displayName=n; loggedInUser.bio=bio;
  const db=getUserDB(); if(db[loggedInUser.username]){ db[loggedInUser.username].displayName=n; db[loggedInUser.username].bio=bio; saveUserDB(db); }
  localStorage.setItem('vaultify_active_user',JSON.stringify(loggedInUser)); applyUserDataUI(loggedInUser); showToast('Profile updated!');
}
function performAppLogout(){
  localStorage.removeItem('vaultify_sync_hint_shown');
  if(!confirm('Log out?')) return;
  localStorage.removeItem('vaultify_active_user');
  location.reload();
}
function generatePartnerCode(u){ if(!u) return 'VAULT-XXXXXX'; let h=0; const s=u+'_vaultify_2026'; for(let i=0;i<s.length;i++){ h=((h<<5)-h)+s.charCodeAt(i); h=h&h; } return 'VAULT-'+Math.abs(h).toString(36).toUpperCase().padStart(6,'0').slice(0,6); }
function changeAppLanguage(lang){ appLanguage=lang; localStorage.setItem('vaultify_app_lang',lang); showToast(lang==='hi'?'हिंदी चुनी गई':'English Selected'); }

const HINDI_CHARS=/[\u0900-\u097F]/, URDU_CHARS=/[\u0600-\u06FF]/, PUNJABI_CHARS=/[\u0A00-\u0A7F]/;
function detectLanguage(text){
  if(!text) return 'hindi';
  if(HINDI_CHARS.test(text)) return 'hindi';
  if(URDU_CHARS.test(text)) return 'urdu';
  if(PUNJABI_CHARS.test(text)) return 'punjabi';
  const lower=text.toLowerCase();
  const hk=['arijit','atif','shreya','sonu','kishore','lata','asha','rafi','udit','alka','sunidhi','neha kakkar','honey singh','badshah','diljit','guru randhawa','karan aujla','ap dhillon','sidhu moose','divine','raftaar','jubin','darshan raval','armaan malik','bollywood','hindi','desi','punjabi'];
  const ek=['taylor swift','ed sheeran','drake','justin bieber','ariana grande','billie eilish','the weeknd','eminem','rihanna','adele','bruno mars','coldplay','imagine dragons','maroon 5','edm','pop','rock','english','western'];
  let h=0,e=0;
  hk.forEach(k=>{ if(lower.includes(k)) h++; }); ek.forEach(k=>{ if(lower.includes(k)) e++; });
  return h>=e?'hindi':'english';
}
function detectVibe(text){
  const t=(text||'').toLowerCase();
  if(/romantic|love|ishq|pyar|mohabbat|heart|dil/.test(t)) return 'romantic';
  if(/sad|broken|bewafa|tanha|alone|cry|dukh/.test(t)) return 'sad';
  if(/party|dance|club|beat|edm|remix/.test(t)) return 'party';
  if(/rap|hip.?hop|trap|drill/.test(t)) return 'rap';
  if(/classical|sufi|qawwali|ghazal|devotional|bhajan/.test(t)) return 'classical';
  if(/rock|metal|punk/.test(t)) return 'rock';
  if(/chill|lofi|lo.?fi|relax|calm|sleep|study/.test(t)) return 'lofi';
  if(/workout|gym|energy|power|motivat/.test(t)) return 'workout';
  return 'general';
}
function getLanguageQueries(lang){ return lang==='hindi'?['arijit singh hits','atif aslam songs','bollywood hits']:lang==='punjabi'?['diljit dosanjh','ap dhillon','karan aujla']:['top english hits','taylor swift','ed sheeran']; }
function getLanguageArtists(lang){
  if(lang==='punjabi') return ['diljit dosanjh','ap dhillon','karan aujla','sidhu moose wala','guru randhawa','shubh'];
  if(lang==='urdu') return ['atif aslam','rahat fateh ali khan','nusrat fateh ali khan','coke studio','momina mustehsan'];
  if(lang==='english') return ['taylor swift','ed sheeran','the weeknd','drake','post malone','ariana grande'];
  return ['arijit singh','atif aslam','shreya ghoshal','sonu nigam','neha kakkar','jubin nautiyal'];
}

function initCacheDB(){ return new Promise(resolve=>{ try{ const req=indexedDB.open('vaultify_cache',3); req.onupgradeneeded=e=>{ const db=e.target.result; if(!db.objectStoreNames.contains('songs')){ const s=db.createObjectStore('songs',{keyPath:'id'}); s.createIndex('cachedAt','cachedAt'); s.createIndex('lastAccess','lastAccess'); } }; req.onsuccess=e=>{ cacheDB=e.target.result; resolve(cacheDB); }; req.onerror=()=>resolve(null); }catch(e){ resolve(null); } }); }
function cacheGet(id){ return new Promise(resolve=>{ if(!cacheDB) return resolve(null); try{ const tx=cacheDB.transaction('songs','readwrite'), s=tx.objectStore('songs'), rq=s.get(id); rq.onsuccess=()=>{ const x=rq.result; if(!x) return resolve(null); try{ if(x.blob instanceof Blob) x.url=URL.createObjectURL(x.blob); x.lastAccess=Date.now(); s.put(x); }catch(e){} resolve(x); }; rq.onerror=()=>resolve(null); }catch(e){ resolve(null); } }); }
function cachePut(id,blob,meta){ return new Promise(async resolve=>{ if(!cacheDB) return resolve(false); try{ await cacheEnforceLimit(); const tx=cacheDB.transaction('songs','readwrite'); tx.objectStore('songs').put({id,blob,title:meta.title,artist:meta.artist,cover:meta.cover,source:meta.source,size:blob.size,cachedAt:Date.now(),lastAccess:Date.now()}); tx.oncomplete=()=>resolve(true); tx.onerror=()=>resolve(false); }catch(e){ resolve(false); } }); }
function cacheDelete(id){ return new Promise(resolve=>{ if(!cacheDB) return resolve(false); try{ const tx=cacheDB.transaction('songs','readwrite'); tx.objectStore('songs').delete(id); tx.oncomplete=()=>resolve(true); }catch(e){ resolve(false); } }); }
function cacheAll(){ return new Promise(resolve=>{ if(!cacheDB) return resolve([]); try{ const rq=cacheDB.transaction('songs','readonly').objectStore('songs').getAll(); rq.onsuccess=()=>resolve(rq.result||[]); rq.onerror=()=>resolve([]); }catch(e){ resolve([]); } }); }
async function cacheEnforceLimit(){ try{ const all=await cacheAll(); let size=0; all.forEach(t=>{ if(t.size) size+=t.size; }); if(size/(1024*1024)<CACHE_MAX_SIZE_MB && all.length<CACHE_MAX_SONGS) return; all.sort((a,b)=>(a.lastAccess||a.cachedAt||0)-(b.lastAccess||b.cachedAt||0)); for(let i=0;i<Math.ceil(all.length*0.2);i++) if(all[i]) await cacheDelete(all[i].id); }catch(e){} }

function initForegroundAudioBridge(){ try{ if(!audioContextNode) audioContextNode=new (window.AudioContext||window.webkitAudioContext)(); if(audioContextNode.state==='suspended') audioContextNode.resume(); if(!audioContextNode._oscStarted){ const osc=audioContextNode.createOscillator(), g=audioContextNode.createGain(); osc.frequency.value=30; g.gain.value=0.0001; osc.connect(g); g.connect(audioContextNode.destination); osc.start(); audioContextNode._oscStarted=true; } if(!eqNodes) initEqChain(); }catch(e){} }
function initEqChain(){ try{ if(!audioContextNode) audioContextNode=new (window.AudioContext||window.webkitAudioContext)(); if(eqNodes||!mainAudio) return; const freqs=[60,230,910,4000,14000]; const filters=freqs.map(f=>{ const b=audioContextNode.createBiquadFilter(); b.type='peaking'; b.frequency.value=f; b.Q.value=1; b.gain.value=0; return b; }); for(let i=0;i<filters.length-1;i++) filters[i].connect(filters[i+1]); const mg=audioContextNode.createGain(); mg.gain.value=1; filters[filters.length-1].connect(mg); mg.connect(audioContextNode.destination); eqNodes={filters,masterGain:mg}; try{ eqSourceNode=audioContextNode.createMediaElementSource(mainAudio); eqSourceNode.connect(filters[0]); }catch(e){ eqSourceNode=null; } }catch(e){} }
function applyEqNow(){ try{ if(!audioContextNode) initForegroundAudioBridge(); if(!eqNodes) initEqChain(); if(!eqNodes) return showToast('EQ not ready'); ['eq60','eq230','eq910','eq4k','eq14k'].forEach((id,i)=>{ const el=document.getElementById(id); if(el&&eqNodes.filters[i]) eqNodes.filters[i].gain.value=parseFloat(el.value)||0; }); saveEqToStorage(); showToast('✅ EQ applied'); closeModal('modalEqualizer'); }catch(e){} }
function resetEqSliders(){ ['eq60','eq230','eq910','eq4k','eq14k'].forEach(id=>{ const el=document.getElementById(id); if(el) el.value=0; }); if(eqNodes) eqNodes.filters.forEach(f=>f.gain.value=0); saveEqToStorage(); showToast('EQ Reset'); }
function loadEqFromStorage(){ try{ const s=JSON.parse(localStorage.getItem('vaultify_eq')||'null'); if(!s) return; ['eq60','eq230','eq910','eq4k','eq14k'].forEach((id,i)=>{ const el=document.getElementById(id); if(el) el.value=s[i]||0; }); }catch(e){} }
function saveEqToStorage(){ try{ const v=['eq60','eq230','eq910','eq4k','eq14k'].map(id=>{ const el=document.getElementById(id); return el?parseFloat(el.value)||0:0; }); localStorage.setItem('vaultify_eq',JSON.stringify(v)); }catch(e){} }
async function requestHardwareWakeLock(){ try{ if('wakeLock' in navigator && (!wakeLockSentinel||wakeLockSentinel.released)){ wakeLockSentinel=await navigator.wakeLock.request('screen'); wakeLockSentinel.addEventListener('release',()=>{ wakeLockSentinel=null; }); } }catch(e){} }

function setupMediaSession(){
  if(!mainAudio) return;
  if('mediaSession' in navigator){
    try{
      navigator.mediaSession.setActionHandler('play',()=>onNativePlay());
      navigator.mediaSession.setActionHandler('pause',()=>onNativePause());
      navigator.mediaSession.setActionHandler('previoustrack',()=>onNativePrev());
      navigator.mediaSession.setActionHandler('nexttrack',()=>onNativeNext());
      navigator.mediaSession.setActionHandler('seekto',d=>{ if(d.seekTime!==undefined) seekAudioTo(d.seekTime); });
    }catch(e){}
  }
  mainAudio.addEventListener('error',()=>{ showToast('⚠️ Audio error'); setVisualState(false); if(currentPlaylist.length>1) setTimeout(()=>playNext(),800); });
  mainAudio.addEventListener('timeupdate',()=>{
    if(!mainAudio.duration||isDraggingTimeline) return;
    const pos=mainAudio.currentTime, dur=mainAudio.duration;
    const c=document.getElementById('labelCurrentTime'), d=document.getElementById('labelTotalDuration');
    const f=document.getElementById('capsuleFill'), mf=document.getElementById('miniProgressFill');
    if(c) c.innerText=formatClock(pos); if(d) d.innerText=formatClock(dur);
    if(f) f.style.width=((pos/dur)*100)+'%'; if(mf) mf.style.width=((pos/dur)*100)+'%';
    if(window.AndroidNativeBridge?.updateProgress){ try{ window.AndroidNativeBridge.updateProgress(Math.floor(pos*1000),Math.floor(dur*1000)); }catch(e){} }
  });
  mainAudio.addEventListener('loadedmetadata',()=>{ const d=document.getElementById('labelTotalDuration'); if(d) d.innerText=formatClock(mainAudio.duration); });
  mainAudio.addEventListener('ended',()=>{ setVisualState(false); if(currentPlaylist.length>1) playNext(); });
}
window.onNativePlay=function(){ if(mainAudio?.paused) mainAudio.play().catch(()=>{}); setVisualState(true); };
window.onNativePause=function(){ if(mainAudio) mainAudio.pause(); setVisualState(false); };
window.onNativeNext=function(){ playNext(); };
window.onNativePrev=function(){ playPrevious(); };
window.handleNativeMediaAction=function(a){ ({PLAY:onNativePlay,PAUSE:onNativePause,NEXT:onNativeNext,PREV:onNativePrev})[a]?.(); };
window.handleNativeSeek=function(ms){ seekAudioTo(ms/1000); };
window.onNativePermissionResult=function(){ checkPermissionsStatus(); };

function updateMediaSessionMetadata(track){
  if(!track) return;
  if('mediaSession' in navigator){
    try{
      const cover=track.cover||'vaultify.png';
      navigator.mediaSession.metadata=new MediaMetadata({title:track.title||'Unknown',artist:track.artist||'Unknown',album:'Vaultify',artwork:[{src:cover,sizes:'96x96',type:'image/jpeg'},{src:cover,sizes:'256x256',type:'image/jpeg'},{src:cover,sizes:'512x512',type:'image/jpeg'}]});
      navigator.mediaSession.playbackState=isPlayingAudio?'playing':'paused';
    }catch(e){}
  }
  if(window.AndroidNativeBridge?.updateNotification){ try{ window.AndroidNativeBridge.updateNotification(track.title||'Vaultify',track.artist||'',track.cover||'',isPlayingAudio); }catch(e){} }
}
function setupTimelineDraggableEngine(){
  const bar=document.getElementById('capsuleProgressBar'); if(!bar||!mainAudio) return;
  const updUI=p=>{ const f=document.getElementById('capsuleFill'); if(f) f.style.width=(p*100)+'%'; const c=document.getElementById('labelCurrentTime'); if(c) c.innerText=formatClock(p*(mainAudio.duration||0)); };
  const getPct=x=>{ const r=bar.getBoundingClientRect(); return Math.max(0,Math.min(1,(x-r.left)/r.width)); };
  const doSeek=p=>{ if(mainAudio.duration>0) mainAudio.currentTime=p*mainAudio.duration; };
  bar.addEventListener('pointerdown',e=>{ isDraggingTimeline=true; try{ bar.setPointerCapture(e.pointerId); }catch(err){} updUI(getPct(e.clientX)); });
  bar.addEventListener('pointermove',e=>{ if(isDraggingTimeline) updUI(getPct(e.clientX)); });
  bar.addEventListener('pointerup',e=>{ if(!isDraggingTimeline) return; isDraggingTimeline=false; doSeek(getPct(e.clientX)); });
}
function seekAudioTo(s){ if(mainAudio?.duration) mainAudio.currentTime=s; }

function saveQueueToStorage(){ try{ localStorage.setItem('vaultify_queue',JSON.stringify({tracks:currentPlaylist.slice(0,200),index:currentTrackIndex,timestamp:Date.now()})); }catch(e){} }
function loadQueueFromStorage(){
  try{
    const s=localStorage.getItem('vaultify_queue'); if(!s) return false;
    const q=JSON.parse(s); if(!q.tracks?.length) return false;
    if(Date.now()-q.timestamp>2*60*60*1000){ localStorage.removeItem('vaultify_queue'); return false; }
    currentPlaylist=q.tracks;
    currentTrackIndex=Math.min(q.index||0,currentPlaylist.length-1);
    currentPlaylist.forEach(t=>queueSeenIds.add(t.id));
    renderHomeQueue();
    if(currentPlaylist[currentTrackIndex]) syncPlayerUI(currentPlaylist[currentTrackIndex]);
    return true;
  }catch(e){ return false; }
}

async function fetchTrendingSongs(limit=10){ const t=await workerSearch('arijit singh',limit); if(t.length>=3) return t.slice(0,limit); return (await workerSearch('bollywood hits',limit)).slice(0,limit); }
async function fetchDirectAudioStreamUrl(input,track){
  if(!input) return null;
  if(input.startsWith('blob:')||input.startsWith('data:')) return input;
  if(track?._directStream?.startsWith('http')) return track._directStream;
  return await workerStreamUrl(input);
}

async function playTrack(index){
  if(index<0||index>=currentPlaylist.length) return;
  currentTrackIndex=index;
  const track=currentPlaylist[index];
  if(track){ currentLanguage=detectLanguage((track.title||'')+' '+(track.artist||'')+' '+(track._lang||'')); currentVibe=detectVibe((track.title||'')+' '+(track.artist||'')); }
  syncPlayerUI(track); updateMediaSessionMetadata(track); logPlaybackHistory(track); renderHomeRecentVault();
  setTimeout(()=>initForegroundAudioBridge(),0);
  setTimeout(()=>requestHardwareWakeLock(),0);
  if(!silentLoopStarted&&silentLoop){ silentLoop.play().catch(()=>{}); silentLoopStarted=true; }
  setTimeout(()=>autoExtendQueue(),2000);
  if(currentHls){ try{ currentHls.destroy(); }catch(e){} currentHls=null; }
  const tryPlay=async(url)=>{
    if(!url?.startsWith('http')) return false;
    if(url.includes('.m3u8')&&window.Hls?.isSupported()){
      try{ currentHls=new Hls({enableWorker:true,lowLatencyMode:false}); currentHls.loadSource(url); currentHls.attachMedia(mainAudio); currentHls.on(Hls.Events.MANIFEST_PARSED,()=>{ mainAudio.play().then(()=>setVisualState(true)).catch(()=>{}); }); return true; }catch(e){ return false; }
    }
    mainAudio.src=url; mainAudio.load();
    try{ await mainAudio.play(); setVisualState(true); return true; }catch(e){ return false; }
  };
  if(track.id.startsWith('blob:')){ await tryPlay(track.id); return; }
  if(track._directStream?.startsWith('http')){ if(await tryPlay(track._directStream)) return; }
  const c=trackBlobCache.get(track.id);
  if(c?.startsWith('blob:')){ if(await tryPlay(c)) return; }
  const db=await cacheGet(track.id);
  if(db?.url){ trackBlobCache.set(track.id,db.url); if(await tryPlay(db.url)) return; }
  const streamUrl=await fetchDirectAudioStreamUrl(track.id,track);
  if(streamUrl&&await tryPlay(streamUrl)) return;
  showToast('⚠️ Playback failed'); setVisualState(false);
  if(currentPlaylist.length>1) setTimeout(()=>playNext(),800);
}
async function autoplayNext(){
  if(isRepeat){ playTrack(currentTrackIndex); return; }
  if(currentPlaylist.length===0) return;
  const remaining=currentPlaylist.length-currentTrackIndex-1;
  if(remaining<QUEUE_TARGET_MIN) await autoExtendQueue();
  currentTrackIndex=isShuffle?Math.floor(Math.random()*currentPlaylist.length):(currentTrackIndex+1)%currentPlaylist.length;
  playTrack(currentTrackIndex);
}
async function autoExtendQueue(){
  if(autoMixFetching) return;
  const remaining=currentPlaylist.length-currentTrackIndex-1;
  if(remaining>=QUEUE_TARGET_MIN) return;
  if(currentPlaylist.length>=QUEUE_MAX_TOTAL) return;
  if(tgLibrary.length===0) return;
  autoMixFetching=true;
  try{ addToQueueSilently(pickRandomFromTg(Math.max(QUEUE_TARGET_MIN-remaining,10))); }catch(e){}
  autoMixFetching=false;
}
function pickRandomFromTg(count=12){
  if(tgLibrary.length===0) return [];
  const existing=new Set([...currentPlaylist.map(t=>t.id),...queueSeenIds]);
  let pool=tgLibrary.filter(t=>!existing.has('tg_'+t.fileId));
  if(pool.length===0){ tgLibrary.forEach(t=>queueSeenIds.delete('tg_'+t.fileId)); pool=tgLibrary.filter(t=>!currentPlaylist.some(x=>x.id==='tg_'+t.fileId)); if(pool.length===0) return []; }
  return shuffleArray(pool).slice(0,count).map(t=>({id:'tg_'+t.fileId,title:t.title,artist:t.artist,cover:t.cover||'',duration:t.duration||0,source:'telegram',_fileId:t.fileId}));
}
function shuffleArray(arr){ const a=arr.slice(); for(let i=a.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; } return a; }
function addToQueueSilently(tracks){
  if(!tracks?.length) return;
  let added=0;
  const ids=new Set(currentPlaylist.map(t=>t.id));
  for(const t of tracks){ if(currentPlaylist.length>=QUEUE_MAX_TOTAL) break; if(ids.has(t.id)) continue; currentPlaylist.push(t); queueSeenIds.add(t.id); ids.add(t.id); added++; }
  if(added>0){ renderHomeQueue(); saveQueueToStorage(); }
}
function togglePlaybackState(){ if(!mainAudio) return; if(mainAudio.paused){ initForegroundAudioBridge(); requestHardwareWakeLock(); mainAudio.play().then(()=>setVisualState(true)).catch(()=>{}); } else{ mainAudio.pause(); setVisualState(false); } }
function setVisualState(playing){
  isPlayingAudio=playing; if(playing) requestHardwareWakeLock();
  const mi=document.getElementById('miniPlayIcon'); if(mi) mi.className=playing?'fa-solid fa-pause':'fa-solid fa-play';
  const fi=document.getElementById('fullPlayIcon'); if(fi) fi.className=playing?'fa-solid fa-pause':'fa-solid fa-play';
  if('mediaSession' in navigator) navigator.mediaSession.playbackState=playing?'playing':'paused';
  const t=currentPlaylist[currentTrackIndex];
  if(t&&window.AndroidNativeBridge?.updateNotification){ try{ window.AndroidNativeBridge.updateNotification(t.title||'Vaultify',t.artist||'',t.cover||'',playing); }catch(e){} }
  const q=document.getElementById('modalQueueDrawer'); if(q?.classList.contains('open')) renderHomeQueue();
}
async function playNext(){ autoplayNext(); }
function playPrevious(){ if(currentPlaylist.length===0) return; currentTrackIndex=(currentTrackIndex-1+currentPlaylist.length)%currentPlaylist.length; playTrack(currentTrackIndex); }
function syncPlayerUI(track){
  if(!track) return;
  const els={miniTitleText:track.title,miniArtistText:track.artist,notchTrackTitle:track.title,fullTitleText:track.title,fullArtistText:track.artist};
  for(const id in els){ const el=document.getElementById(id); if(el) el.innerText=els[id]||''; }
  const mA=document.getElementById('miniArtImg'); if(mA) mA.src=track.cover||'vaultify.png';
  const fA=document.getElementById('fullArtImg'); if(fA) fA.src=track.cover||'vaultify.png';
  const hb=document.getElementById('fullHeartBtn');
  if(hb){ const isL=likedSongs.some(s=>s.id===track.id); hb.className=isL?'fa-solid fa-heart':'fa-regular fa-heart'; hb.style.color=isL?'var(--partner-pink)':'inherit'; }
}
function toggleShuffle(){ isShuffle=!isShuffle; const el=document.getElementById('fullShuffleBtn'); if(el) el.style.color=isShuffle?'var(--accent-neon)':'inherit'; showToast(isShuffle?'Shuffle On':'Shuffle Off'); }
function toggleRepeat(){ isRepeat=!isRepeat; const el=document.getElementById('fullRepeatBtn'); if(el) el.style.color=isRepeat?'var(--accent-neon)':'inherit'; showToast(isRepeat?'Repeat On':'Repeat Off'); }
function toggleSleepTimer(){ showToast('Sleep 30 Min'); setTimeout(()=>{ if(isPlayingAudio) togglePlaybackState(); },30*60*1000); }
function shareCurrentTrack(){ if(currentPlaylist.length===0) return; const t=currentPlaylist[currentTrackIndex]; if(navigator.share) navigator.share({title:t.title,text:`Listening to ${t.title} on Vaultify`}).catch(()=>{}); else{ try{ navigator.clipboard.writeText(`🎵 ${t.title} - ${t.artist}`); showToast('Copied!'); }catch(e){} } }

async function cacheTrackInBackground(track){
  if(!track||track.id.startsWith('blob:')) return;
  if(trackBlobCache.has(track.id)) return;
  const existing=await cacheGet(track.id);
  if(existing?.url){ trackBlobCache.set(track.id,existing.url); return; }
  try{
    const url=await fetchDirectAudioStreamUrl(track.id,track);
    if(!url?.startsWith('http')) return;
    const r=await fetch(url); const blob=await r.blob();
    await cachePut(track.id,blob,{title:track.title,artist:track.artist,cover:track.cover,source:track.source});
    trackBlobCache.set(track.id,URL.createObjectURL(blob));
    if(currentLibraryTab==='cached'&&document.getElementById('tabLibrary').classList.contains('active')) renderLibrary();
  }catch(e){}
}
async function downloadCurrentTrack(){
  if(currentPlaylist.length===0) return showToast('No track!');
  const t=currentPlaylist[currentTrackIndex];
  showDownloadIndicator('Downloading...');
  try{
    let u=trackBlobCache.get(t.id)||t._directStream;
    if(!u?.startsWith('blob:')) u=u||await fetchDirectAudioStreamUrl(t.id,t);
    if(!u) throw new Error('No URL');
    const r=await fetch(u); const b=await r.blob(); const bu=URL.createObjectURL(b);
    const a=document.createElement('a'); a.style.display='none'; a.href=bu; a.download=`${(t.title||'track').replace(/[^a-zA-Z0-9 ]/g,'')}.mp3`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    await cacheTrackInBackground(t);
    setTimeout(()=>{ try{ URL.revokeObjectURL(bu); }catch(e){} },5000);
    hideDownloadIndicator(); showToast('✅ Downloaded!');
  }catch(e){ hideDownloadIndicator(); showToast('❌ Failed'); }
}
function showDownloadIndicator(text){ const i=document.getElementById('downloadIndicator'); if(!i) return; const t=document.getElementById('downloadText'); if(t) t.innerText=text; i.classList.add('show'); }
function hideDownloadIndicator(){ const i=document.getElementById('downloadIndicator'); if(i) i.classList.remove('show'); }
async function requestMicAndListen(){
  if(window.AndroidNativeBridge&&!window.AndroidNativeBridge.hasMicPermission()){ window.AndroidNativeBridge.requestPermissions?.(); showToast('Mic permission needed'); return; }
  const b=document.getElementById('voiceMicTrigger');
  try{ const s=await navigator.mediaDevices.getUserMedia({audio:true}); s.getTracks().forEach(t=>t.stop()); }catch(e){ return showToast('Mic denied!'); }
  const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
  if(!SR) return showToast('Voice not supported.');
  const r=new SR(); r.lang=appLanguage==='hi'?'hi-IN':'en-US'; r.interimResults=false;
  r.onstart=()=>{ if(b) b.classList.add('recording'); showToast('Listening...'); };
  r.onresult=e=>{ const v=e.results[0][0].transcript; document.getElementById('mobileSearchField').value=v; showToast(`Heard: "${v}"`); executeLiveSearch(); };
  r.onerror=()=>{ if(b) b.classList.remove('recording'); };
  r.onend=()=>{ if(b) b.classList.remove('recording'); };
  r.start();
}

function logPlaybackHistory(track){
  playbackHistoryList=playbackHistoryList.filter(t=>t.id!==track.id);
  playbackHistoryList.unshift(track);
  if(playbackHistoryList.length>20) playbackHistoryList.pop();
  localStorage.setItem('vaultify_playback_history',JSON.stringify(playbackHistoryList));
  if(currentLibraryTab==='history') renderLibrary();
  saveQueueToStorage();
}
function clearRecentlyPlayed(){ if(!confirm('Clear?')) return; playbackHistoryList=[]; localStorage.removeItem('vaultify_playback_history'); renderHomeRecentVault(); renderLibrary(); showToast('✅ Cleared'); }
function renderHomeRecentVault(){
  const c=document.getElementById('homeRecentGrid'); if(!c) return;
  const r=playbackHistoryList.slice(0,10);
  if(r.length===0){ c.innerHTML=`<div style="min-width:100%;font-size:12.5px;color:var(--text-sub);text-align:center;padding:16px 0;background:rgba(255,255,255,.03);border-radius:14px;border:1px dashed var(--border)">No recently played.</div>`; return; }
  c.innerHTML=r.map(t=>{
    const sI=encodeURIComponent(t.id), sT=encodeURIComponent(t.title||''), sA=encodeURIComponent(t.artist||''), sC=encodeURIComponent(t.cover||'');
    return `<div class="history-card-turnable" onclick="playSingleTrackObject('${sI}','${sT}','${sA}','${sC}')"><div style="width:120px;height:120px;border-radius:12px;overflow:hidden;position:relative;background:linear-gradient(135deg,rgba(139,92,246,.3),rgba(168,85,247,.15));box-shadow:0 4px 16px rgba(0,0,0,.4)"><img src="${t.cover||'vaultify.png'}" onerror="this.src='vaultify.png'" style="width:100%;height:100%;object-fit:cover" /><div style="position:absolute;bottom:6px;right:6px;width:28px;height:28px;border-radius:50%;background:var(--accent-neon);display:flex;align-items:center;justify-content:center;box-shadow:0 2px 8px rgba(0,0,0,.5)"><i class="fa-solid fa-play" style="color:#fff;font-size:11px;margin-left:2px"></i></div></div><div style="margin-top:8px;font-size:12px;font-weight:600;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escapeHtml(t.title)}</div><div style="font-size:10.5px;color:var(--text-sub);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:2px">${escapeHtml(t.artist)}</div></div>`;
  }).join('');
}
function playSingleTrackObject(idEnc,title,artist,cover){
  const id=decodeURIComponent(idEnc);
  const t={id,title:decodeURIComponent(title),artist:decodeURIComponent(artist),cover:decodeURIComponent(cover)};
  if(id.startsWith('saavn_')) t._saavnId=id.replace('saavn_','');
  if(id.startsWith('tg_')) t._fileId=id.replace('tg_','');
  currentPlaylist=[t]; currentTrackIndex=0; queueSeenIds=new Set([t.id]);
  renderHomeQueue(); saveQueueToStorage(); playTrack(0);
}
function renderHomeQueue(){
  const el=document.getElementById('homeQueueContainer'), c=document.getElementById('queueCountSubtitle');
  if(c) c.innerText=`${currentPlaylist.length} tracks`;
  if(!el) return;
  if(currentPlaylist.length===0){ el.innerHTML=`<div style="font-size:12px;color:var(--text-sub);text-align:center;padding:12px 0">Empty queue.</div>`; return; }
  let h=''; const np=currentPlaylist[currentTrackIndex], un=currentPlaylist.slice(currentTrackIndex+1,currentTrackIndex+40);
  if(np){ h+=`<div style="font-size:10px;text-transform:uppercase;letter-spacing:1.5px;font-weight:700;margin:12px 0 6px;color:var(--accent-neon)">▶ Now Playing</div>`; h+=renderQueueTile(np,currentTrackIndex,true); }
  if(un.length>0){ h+=`<div style="font-size:10px;text-transform:uppercase;letter-spacing:1.5px;font-weight:700;margin:12px 0 6px;color:var(--text-sub)">🎵 Up Next (${un.length})</div>`; un.forEach((t,i)=>{ h+=renderQueueTile(t,currentTrackIndex+1+i,false); }); }
  el.innerHTML=h;
}
function renderQueueTile(t,i,ic){
  const isC=trackBlobCache.has(t.id);
  return `<div class="song-tile ${ic?'playing':''}" onclick="playTrack(${i});closeModal('modalQueueDrawer');"><div class="tile-left"><img src="${t.cover||'vaultify.png'}" class="tile-thumb" onerror="this.src='vaultify.png'" /><div class="tile-meta"><h4>${escapeHtml(t.title)}${isC?' <i class="fa-solid fa-check-circle" style="color:#10b981;font-size:10px"></i>':''}</h4><p>${escapeHtml(t.artist)}</p></div></div><i class="${ic&&isPlayingAudio?'fa-solid fa-volume-high':'fa-solid fa-play'}" style="color:var(--accent-neon);font-size:13px"></i></div>`;
}

function triggerSyncOnSearch(){
  if(searchTriggeredSync) return;
  if(!isAdminDevice()||syncInProgress) return;
  if(tgLibrary.length>50) return;
  searchTriggeredSync=true;
  setTimeout(()=>syncTgLibrary(false).catch(()=>{}),500);
}
async function executeLiveSearch(isAuto=false){
  const q=document.getElementById('mobileSearchField').value.trim(); if(!q) return;
  if(tgLibrary.length<50) triggerSyncOnSearch();
  if(!isAuto&&!searchHistoryList.includes(q)){ searchHistoryList.unshift(q); if(searchHistoryList.length>8) searchHistoryList.pop(); localStorage.setItem('vaultify_search_history',JSON.stringify(searchHistoryList)); renderSearchHistoryTags(); }
  currentLanguage=detectLanguage(q); currentVibe=detectVibe(q);
  const l=document.getElementById('searchLoadingIndicator'), rc=document.getElementById('searchResultsContainer');
  l.style.display='block'; l.innerHTML='<i class="fa-solid fa-spinner fa-spin" style="font-size:24px;margin-bottom:8px"></i><div>Searching...</div>'; rc.innerHTML='';
  const found=await workerSearch(q,30);
  l.style.display='none';
  if(found.length>0){ renderSearchResults(found); if(!isAuto) showToast(`✅ ${found.length} results`); }
  else rc.innerHTML='<p style="font-size:13px;color:var(--text-sub);text-align:center;padding:18px 0">Kuch nahi mila...</p>';
}
function renderSearchResults(tracks){
  const c=document.getElementById('searchResultsContainer'); currentSearchResults=tracks;
  if(tracks.length===0){ c.innerHTML='<p style="font-size:13px;color:var(--text-sub);text-align:center;padding:18px 0">No results.</p>'; return; }
  c.innerHTML=tracks.map(t=>{
    const sId=encodeURIComponent(t.id), sT=encodeURIComponent(t.title||''), sA=encodeURIComponent(t.artist||''), sC=encodeURIComponent(t.cover||'vaultify.png');
    const sD=t._directStream?encodeURIComponent(t._directStream):'';
    let srcBadge='';
    if(t.source==='telegram') srcBadge='<img src="vaultify.png" style="width:14px;height:14px;border-radius:50%;margin-left:6px;vertical-align:middle;border:1px solid #229ED9" onerror="this.style.display=\'none\'" />';
    else if(t.source==='soundcloud') srcBadge='<i class="fa-brands fa-soundcloud" style="color:#ff5500;font-size:11px;margin-left:6px"></i>';
    else if(t.source==='youtube') srcBadge='<i class="fa-brands fa-youtube" style="color:#ff0000;font-size:11px;margin-left:6px"></i>';
    else if(t.source==='jamendo') srcBadge='<span style="font-size:9px;background:#00b8a9;color:#fff;padding:1px 4px;border-radius:3px;margin-left:6px">JAM</span>';
    else if(t.source==='lyrics') srcBadge='<span style="font-size:9px;background:#f59e0b;color:#000;padding:1px 4px;border-radius:3px;margin-left:6px">🎤</span>';
    return `<div class="song-tile" onclick="playSearchedTrackImmediately('${sId}','${sT}','${sA}','${sC}','${sD}',${t.duration||0})"><div class="tile-left"><img src="${t.cover||'vaultify.png'}" class="tile-thumb" onerror="this.src='vaultify.png'" /><div class="tile-meta"><h4>${escapeHtml(t.title)}${srcBadge}</h4><p>${escapeHtml(t.artist)}</p></div></div><i class="fa-solid fa-play" style="color:var(--accent-neon);font-size:15px"></i></div>`;
  }).join('');
}
function playSearchedTrackImmediately(idEnc,title,artist,cover,directEnc,duration){
  const id=decodeURIComponent(idEnc);
  const t={id,title:decodeURIComponent(title),artist:decodeURIComponent(artist),cover:decodeURIComponent(cover),duration:duration||0};
  if(id.startsWith('saavn_')) t._saavnId=id.replace('saavn_','');
  if(id.startsWith('tg_')) t._fileId=id.replace('tg_','');
  const rD=directEnc?decodeURIComponent(directEnc):'';
  if(rD) t._directStream=rD;
  currentPlaylist=[t]; currentTrackIndex=0; queueSeenIds=new Set([t.id]);
  renderHomeQueue(); saveQueueToStorage(); playTrack(0);
}
let liveSearchDebounceTimer=null, liveSearchRequestId=0;
function initLiveSearchInputListener(){
  const f=document.getElementById('mobileSearchField'); if(!f) return;
  f.addEventListener('input',()=>{
    const val=f.value.trim();
    if(val.length>=2&&tgLibrary.length<50) triggerSyncOnSearch();
    if(val.includes('youtube.com/playlist')||(val.includes('list=')&&val.includes('youtu'))){
      clearTimeout(liveSearchDebounceTimer);
      liveSearchDebounceTimer=setTimeout(()=>{ if(f.value.trim()===val&&extractPlaylistId(val)){ loadPlaylistToQueue(val); f.value=''; } },800);
      return;
    }
    clearTimeout(liveSearchDebounceTimer);
    if(val.length>=2) liveSearchDebounceTimer=setTimeout(()=>{ if(f.value.trim()===val) instantSearch(val); },400);
    else if(val.length===0){ const rc=document.getElementById('searchResultsContainer'); if(rc) rc.innerHTML='<p style="font-size:13px;color:var(--text-sub);padding:16px 0;text-align:center">Type song name to search.</p>'; }
  });
  f.addEventListener('keydown',e=>{
    if(e.key==='Enter'){
      clearTimeout(liveSearchDebounceTimer); e.preventDefault();
      const val=f.value.trim();
      if(val.includes('youtube.com/playlist')||(val.includes('list=')&&val.includes('youtu'))){ loadPlaylistToQueue(val); f.value=''; }
      else executeLiveSearch(false);
    }
  });
}
async function instantSearch(q){
  currentLanguage=detectLanguage(q); currentVibe=detectVibe(q);
  const myId=++liveSearchRequestId;
  const l=document.getElementById('searchLoadingIndicator'), rc=document.getElementById('searchResultsContainer');
  if(l){ l.style.display='block'; l.innerHTML='<i class="fa-solid fa-spinner fa-spin" style="font-size:20px;margin-bottom:6px"></i><div style="font-size:12px">Searching...</div>'; }
  const found=await workerSearch(q,25);
  if(myId!==liveSearchRequestId) return;
  if(l) l.style.display='none';
  if(found.length>0) renderSearchResults(found);
  else if(rc) rc.innerHTML='<p style="font-size:13px;color:var(--text-sub);text-align:center;padding:18px 0">Kuch nahi mila...</p>';
}
function renderSearchHistoryTags(){
  const b=document.getElementById('searchHistoryBox'), tb=document.getElementById('searchHistoryTags'); if(!b) return;
  if(searchHistoryList.length===0){ b.style.display='none'; return; }
  b.style.display='block';
  tb.innerHTML=searchHistoryList.map(tag=>`<span style="font-size:11px;background:rgba(255,255,255,.06);padding:5px 10px;border-radius:10px;border:1px solid var(--border);cursor:pointer" onclick="document.getElementById('mobileSearchField').value='${escapeHtml(tag).replace(/'/g,"\\'")}';executeLiveSearch();">${escapeHtml(tag)}</span>`).join('');
}
function clearSearchHistory(){ searchHistoryList=[]; localStorage.removeItem('vaultify_search_history'); renderSearchHistoryTags(); renderRecommendedSection(); }

async function renderRecommendedSection(){
  const c=document.getElementById('recommendedContainer'); if(!c) return;
  let found=[];
  if(tgLibrary.length>0) found=pickRandomFromTg(8);
  if(found.length===0) found=await fetchTrendingSongs(8);
  const h=document.querySelector('.recommended-header span');
  if(h) h.innerText=tgLibrary.length>0?'From Vault':'Trending Now';
  if(found.length===0){ c.innerHTML=`<p style="font-size:11.5px;color:var(--text-sub);text-align:center;padding:10px 0">No suggestions.</p>`; return; }
  c.innerHTML=found.map(t=>{
    const sI=encodeURIComponent(t.id), sT=encodeURIComponent(t.title||''), sA=encodeURIComponent(t.artist||''), sC=encodeURIComponent(t.cover||'');
    const sD=t._directStream?encodeURIComponent(t._directStream):'';
    return `<div class="song-tile" onclick="playSearchedTrackImmediately('${sI}','${sT}','${sA}','${sC}','${sD}',${t.duration||0})"><div class="tile-left"><img src="${t.cover||'vaultify.png'}" class="tile-thumb" onerror="this.src='vaultify.png'" /><div class="tile-meta"><h4>${escapeHtml(t.title)}</h4><p>${escapeHtml(t.artist)}</p></div></div><i class="fa-solid fa-wand-magic-sparkles" style="color:var(--accent-neon);font-size:13px"></i></div>`;
  }).join('');
}

async function renderLibrary(){
  const c=document.getElementById('libraryContent'); if(!c) return;
  if(currentLibraryTab==='history'){
    const list=playbackHistoryList;
    if(list.length===0){ c.innerHTML=`<p style="font-size:13px;color:var(--text-sub);text-align:center;padding:18px 0">No history yet.</p>`; return; }
    let html=`<div style="display:flex;justify-content:space-between;margin-bottom:8px"><span style="font-size:11px;color:var(--accent-neon);cursor:pointer;padding:4px 8px" onclick="manualSyncTg()"><i class="fa-solid fa-rotate"></i> ${isAdminDevice()?'SYNC':'Refresh'} (${tgLibrary.length})</span><span style="font-size:11px;color:#ef4444;cursor:pointer;padding:4px 8px" onclick="clearRecentlyPlayed()">Clear</span></div>`;
    html+=list.map(t=>`<div class="song-tile" onclick="playSingleTrackObject('${encodeURIComponent(t.id)}','${encodeURIComponent(t.title||'')}','${encodeURIComponent(t.artist||'')}','${encodeURIComponent(t.cover||'')}')"><div class="tile-left"><img src="${t.cover||'vaultify.png'}" class="tile-thumb" onerror="this.src='vaultify.png'" /><div class="tile-meta"><h4>${escapeHtml(t.title)}</h4><p>${escapeHtml(t.artist)}</p></div></div><i class="fa-solid fa-play" style="color:var(--accent-neon);font-size:13px"></i></div>`).join('');
    c.innerHTML=html;
  } else if(currentLibraryTab==='liked'){
    const list=likedSongs;
    if(list.length===0){ c.innerHTML=`<p style="font-size:13px;color:var(--text-sub);text-align:center;padding:18px 0">No liked songs.</p>`; return; }
    c.innerHTML=list.map(t=>`<div class="song-tile" onclick="playSingleTrackObject('${encodeURIComponent(t.id)}','${encodeURIComponent(t.title||'')}','${encodeURIComponent(t.artist||'')}','${encodeURIComponent(t.cover||'')}')"><div class="tile-left"><img src="${t.cover||'vaultify.png'}" class="tile-thumb" onerror="this.src='vaultify.png'" /><div class="tile-meta"><h4>${escapeHtml(t.title)}</h4><p>${escapeHtml(t.artist)}</p></div></div><i class="fa-solid fa-heart" style="color:var(--partner-pink);font-size:14px" onclick="event.stopPropagation();unlikeSong('${t.id.replace(/'/g,"\\'")}')"></i></div>`).join('');
  } else if(currentLibraryTab==='playlists'){
    let html='';
    html+=`<div style="background:linear-gradient(135deg,rgba(255,0,0,.18),rgba(200,0,0,.08));border:1px solid rgba(255,0,0,.45);border-radius:14px;padding:14px;margin-bottom:10px;display:flex;align-items:center;gap:12px;cursor:pointer;box-shadow:0 0 16px rgba(255,0,0,.15)" onclick="openYtPlaylistModal()">
      <div style="width:56px;height:56px;border-radius:12px;background:linear-gradient(135deg,#ff0000,#b30000);display:flex;align-items:center;justify-content:center;font-size:26px;color:#fff;flex-shrink:0"><i class="fa-brands fa-youtube"></i></div>
      <div style="flex:1;overflow:hidden"><div style="font-size:14px;font-weight:700;color:#fff">Import YT Playlist</div><div style="font-size:10.5px;color:var(--text-sub);margin-top:3px"><i class="fa-solid fa-wand-magic-sparkles" style="color:var(--accent-neon)"></i> Auto-save to Playlists</div></div>
      <i class="fa-solid fa-chevron-right" style="color:#ff0000;font-size:16px"></i>
    </div>`;
    html+=`<div style="background:var(--bg-card);border:1px solid var(--border);border-radius:14px;padding:12px;margin-bottom:10px;display:flex;align-items:center;gap:12px;cursor:pointer" onclick="openModal('modalAddToPlaylist')"><div style="width:56px;height:56px;border-radius:10px;background:linear-gradient(135deg,var(--accent),var(--accent-neon));display:flex;align-items:center;justify-content:center;font-size:24px;color:#fff;flex-shrink:0"><i class="fa-solid fa-plus"></i></div><div style="flex:1"><div style="font-size:14px;font-weight:700;color:#fff">Create New Playlist</div></div></div>`;
    html+=playlists.map((p,i)=>{
      const cover = p.cover || (p.songs[0]?.cover) || 'vaultify.png';
      return `<div style="background:var(--bg-card);border:1px solid var(--border);border-radius:14px;padding:12px;margin-bottom:10px;display:flex;align-items:center;gap:12px;cursor:pointer" onclick="openPlaylistView(${i})"><img src="${cover}" style="width:56px;height:56px;border-radius:10px;object-fit:cover;flex-shrink:0" onerror="this.src='vaultify.png'" /><div style="flex:1;overflow:hidden"><div style="font-size:14px;font-weight:700;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escapeHtml(p.name)}</div><div style="font-size:11px;color:var(--text-sub);margin-top:2px">${p.songs.length} songs</div></div><i class="fa-solid fa-play-circle" style="color:var(--accent-neon);font-size:22px"></i></div>`;
    }).join('');
    c.innerHTML=html;
  } else if(currentLibraryTab==='cached'){
    const cached=await cacheAll();
    if(cached.length===0){ c.innerHTML=`<p style="font-size:13px;color:var(--text-sub);text-align:center;padding:18px 0">No cached songs.</p>`; return; }
    let totalSize=0; cached.forEach(t=>{ if(t.size) totalSize+=t.size; });
    let html=`<div style="font-size:11px;color:var(--text-sub);margin-bottom:8px"><i class="fa-solid fa-database"></i> ${cached.length} songs · ~${(totalSize/(1024*1024)).toFixed(1)}MB</div>`;
    html+=cached.map(t=>`<div class="song-tile" onclick="playCached('${t.id.replace(/'/g,"\\'")}')"><div class="tile-left"><img src="${t.cover||'vaultify.png'}" class="tile-thumb" onerror="this.src='vaultify.png'" /><div class="tile-meta"><h4>${escapeHtml(t.title||'Unknown')}</h4><p>${escapeHtml(t.artist||'')}</p></div></div><i class="fa-solid fa-trash" style="color:#ef4444;font-size:13px" onclick="event.stopPropagation();removeCache('${t.id.replace(/'/g,"\\'")}')"></i></div>`).join('');
    c.innerHTML=html;
  } else if(currentLibraryTab==='vault'){
    const list=tgLibrary;
    if(list.length===0){ c.innerHTML=`<p style="font-size:13px;color:var(--text-sub);text-align:center;padding:18px 0">No songs in vault yet. Tap SYNC.</p>`; return; }
    const start=libraryRenderPage*LIBRARY_PAGE_SIZE;
    const page=list.slice(start,start+LIBRARY_PAGE_SIZE);
    let html=`<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px"><span style="font-size:11px;color:var(--text-sub)"><i class="fa-solid fa-database"></i> ${list.length} songs · page ${libraryRenderPage+1}/${Math.ceil(list.length/LIBRARY_PAGE_SIZE)}</span><span style="font-size:11px;color:var(--accent-neon);cursor:pointer;padding:4px 8px" onclick="manualSyncTg()"><i class="fa-solid fa-rotate"></i> Refresh</span></div>`;
    html+=page.map(t=>`<div class="song-tile" onclick="playSingleTrackObject('${encodeURIComponent('tg_'+t.fileId)}','${encodeURIComponent(t.title)}','${encodeURIComponent(t.artist)}','${encodeURIComponent(t.cover||'')}')"><div class="tile-left"><img src="${t.cover||'vaultify.png'}" class="tile-thumb" onerror="this.src='vaultify.png'" loading="lazy" /><div class="tile-meta"><h4>${escapeHtml(t.title)}</h4><p>${escapeHtml(t.artist)}</p></div></div><i class="fa-solid fa-play" style="color:var(--accent-neon);font-size:13px"></i></div>`).join('');
    if(start+LIBRARY_PAGE_SIZE<list.length) html+=`<div style="text-align:center;padding:16px 0"><button class="submit-btn" style="width:auto;padding:10px 24px" onclick="libraryLoadMore()">Load More (${list.length-start-LIBRARY_PAGE_SIZE} left)</button></div>`;
    if(libraryRenderPage>0) html=`<div style="text-align:center;padding:8px 0"><button class="submit-btn" style="width:auto;padding:8px 20px;background:rgba(255,255,255,.08);color:var(--text-sub);font-size:11px" onclick="libraryPageUp()"><i class="fa-solid fa-arrow-up"></i> Previous Page</button></div>`+html;
    c.innerHTML=html;
  }
}
function libraryLoadMore(){ libraryRenderPage++; renderLibrary(); }
function libraryPageUp(){ if(libraryRenderPage>0){ libraryRenderPage--; renderLibrary(); } }
async function playCached(id){ const c=await cacheGet(id); if(c?.url){ const t={id,title:c.title,artist:c.artist,cover:c.cover,_directStream:c.url}; currentPlaylist=[t]; currentTrackIndex=0; queueSeenIds=new Set([t.id]); renderHomeQueue(); playTrack(0); } }
async function removeCache(id){ const u=trackBlobCache.get(id); if(u?.startsWith('blob:')){ try{ URL.revokeObjectURL(u); }catch(e){} } trackBlobCache.delete(id); await cacheDelete(id); renderLibrary(); showToast('Removed'); }
function deletePlaylist(i){ if(!confirm('Delete?')) return; playlists.splice(i,1); savePlaylists(); renderLibrary(); }
function savePlaylists(){ localStorage.setItem('vaultify_playlists',JSON.stringify(playlists)); }
function toggleLikeCurrent(){
  if(currentPlaylist.length===0) return showToast('No track');
  const t=currentPlaylist[currentTrackIndex];
  const idx=likedSongs.findIndex(s=>s.id===t.id);
  if(idx>=0){ likedSongs.splice(idx,1); showToast('Removed'); } else{ likedSongs.unshift(t); showToast('❤️ Added'); }
  localStorage.setItem('vaultify_liked',JSON.stringify(likedSongs));
  const hb=document.getElementById('fullHeartBtn'); const isL=likedSongs.some(s=>s.id===t.id);
  hb.className=isL?'fa-solid fa-heart':'fa-regular fa-heart'; hb.style.color=isL?'var(--partner-pink)':'inherit';
  if(currentLibraryTab==='liked') renderLibrary();
}
function unlikeSong(id){ likedSongs=likedSongs.filter(s=>s.id!==id); localStorage.setItem('vaultify_liked',JSON.stringify(likedSongs)); renderLibrary(); }
function openAddToPlaylistModal(){
  if(currentPlaylist.length===0) return showToast('No track');
  const c=document.getElementById('playlistSelectList');
  if(playlists.length===0) c.innerHTML=`<p style="font-size:12px;color:var(--text-sub);text-align:center;padding:8px 0">No playlists yet.</p>`;
  else c.innerHTML=playlists.map((p,i)=>`<div class="song-tile" onclick="addToPlaylist(${i})"><div class="tile-left"><div style="width:38px;height:38px;border-radius:8px;background:linear-gradient(135deg,var(--accent),var(--accent-neon));display:flex;align-items:center;justify-content:center;font-size:16px;color:#fff;flex-shrink:0"><i class="fa-solid fa-list"></i></div><div class="tile-meta"><h4>${escapeHtml(p.name)}</h4><p>${p.songs.length} songs</p></div></div><i class="fa-solid fa-plus" style="color:var(--accent-neon)"></i></div>`).join('');
  openModal('modalAddToPlaylist');
}
function addToPlaylist(i){ const t=currentPlaylist[currentTrackIndex]; if(!playlists[i].songs.some(s=>s.id===t.id)) playlists[i].songs.push(t); savePlaylists(); showToast('Added'); closeModal('modalAddToPlaylist'); if(currentLibraryTab==='playlists') renderLibrary(); }
function createPlaylistAndAdd(){ const n=document.getElementById('newPlaylistName').value.trim(); if(!n) return showToast('Enter name'); const t=currentPlaylist[currentTrackIndex]; playlists.push({id:Date.now(),name:n,songs:t?[t]:[],created:Date.now()}); savePlaylists(); document.getElementById('newPlaylistName').value=''; showToast(`Created: ${n}`); closeModal('modalAddToPlaylist'); if(currentLibraryTab==='playlists') renderLibrary(); }

function getStoredNotifications(){ return JSON.parse(localStorage.getItem('vaultify_notifications_list')||'[]'); }
function pushNotification(n){ const l=getStoredNotifications(); l.unshift({...n,id:Date.now(),time:new Date().toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}),unread:true}); if(l.length>60) l.pop(); localStorage.setItem('vaultify_notifications_list',JSON.stringify(l)); renderNotificationCenter(); }
function renderNotificationCenter(){
  const list=getStoredNotifications(), container=document.getElementById('notificationListContainer'), badge=document.getElementById('notifBadgeCount');
  if(badge){ const u=list.filter(n=>n.unread).length; if(u>0){ badge.innerText=u; badge.style.display='flex'; } else badge.style.display='none'; }
  if(!container) return;
  if(list.length===0){ container.innerHTML=`<div style="text-align:center;padding:40px 20px;color:var(--text-sub);"><i class="fa-solid fa-bell-slash" style="font-size:36px;margin-bottom:12px;opacity:0.5;"></i><p style="font-size:13px;font-weight:600;">No notifications yet</p></div>`; return; }
  container.innerHTML=list.map(n=>`<div style="display:flex;align-items:flex-start;gap:12px;padding:12px;margin-bottom:8px;background:${n.unread?'rgba(139,92,246,0.12)':'rgba(255,255,255,0.03)'};border:1px solid ${n.unread?'var(--accent-neon)':'var(--border)'};border-radius:14px;"><div style="width:38px;height:38px;border-radius:50%;background:${n.iconColor||'var(--accent-neon)'}20;display:flex;align-items:center;justify-content:center;flex-shrink:0;"><i class="${n.icon||'fa-solid fa-bell'}" style="color:${n.iconColor||'var(--accent-neon)'};font-size:16px;"></i></div><div style="flex:1;min-width:0;"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:2px;"><span style="font-size:13px;font-weight:700;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:70%;">${escapeHtml(n.title)}</span><span style="font-size:10px;color:var(--text-sub);flex-shrink:0;margin-left:8px;">${n.time}</span></div><div style="font-size:11.5px;color:var(--text-sub);line-height:1.4;word-break:break-word;">${escapeHtml(n.message)}</div></div>${n.unread?'<div style="width:8px;height:8px;border-radius:50%;background:var(--accent-neon);flex-shrink:0;margin-top:6px;"></div>':''}</div>`).join('');
}
function openNotificationModal(){ const l=getStoredNotifications(); l.forEach(n=>n.unread=false); localStorage.setItem('vaultify_notifications_list',JSON.stringify(l)); renderNotificationCenter(); openModal('modalNotifications'); }
function clearAllNotifications(){ localStorage.removeItem('vaultify_notifications_list'); renderNotificationCenter(); showToast('Cleared!'); }

function checkPermissionsStatus(){
  const banner=document.getElementById('permWarningBanner'), text=document.getElementById('permWarningText');
  const mic=document.getElementById('micPermStatus'), notif=document.getElementById('notifPermStatus');
  if(!window.AndroidNativeBridge){ if(banner) banner.classList.remove('show'); return; }
  let missing=[];
  try{
    const hm=window.AndroidNativeBridge.hasMicPermission(), hn=window.AndroidNativeBridge.hasNotificationPermission();
    if(mic){ mic.innerText=hm?'Granted':'Denied'; mic.style.color=hm?'#10b981':'#ef4444'; }
    if(notif){ notif.innerText=hn?'Granted':'Denied'; notif.style.color=hn?'#10b981':'#ef4444'; }
    if(!hm) missing.push('Microphone'); if(!hn) missing.push('Notifications');
  }catch(e){}
  if(missing.length>0&&banner&&text){ text.innerText=`${missing.join(' & ')} needed`; banner.classList.add('show'); } else if(banner) banner.classList.remove('show');
}
function handlePermissionBannerClick(){ if(window.AndroidNativeBridge?.requestPermissions) window.AndroidNativeBridge.requestPermissions(); else showToast('Open Profile > Permissions'); }
function requestPermsFromNative(){ if(window.AndroidNativeBridge?.requestPermissions) window.AndroidNativeBridge.requestPermissions(); setTimeout(checkPermissionsStatus,800); }
function openAppSettingsNative(){ if(window.AndroidNativeBridge?.openAppSettings) window.AndroidNativeBridge.openAppSettings(); else showToast('Not available'); }
function openEqualizer(){ if(window.AndroidNativeBridge?.openSystemEqualizer){ window.AndroidNativeBridge.openSystemEqualizer(); showToast('🎚️ System EQ'); } else showToast('Not available'); }

let emojiMode=localStorage.getItem('vaultify_emoji_mode')||'flow';
let emojiList=JSON.parse(localStorage.getItem('vaultify_emoji_list')||'["🐱","👻","🔥","🚀","⚡","💜","🎵"]');
let activeEmoji=localStorage.getItem('vaultify_active_emoji')||'🐱';
let currentEmojiIndex=0, mixRafId=null;
function initEmojiRunner(){
  const i=document.getElementById('notchRunnerIcon'); if(!i) return;
  i.classList.remove('mode-flow','mode-mix'); i.style.left=''; i.style.transform=''; i.style.animation=''; i.innerText=activeEmoji;
  if(emojiMode==='mix'){ i.classList.add('mode-mix'); animateMixEmoji(); }
  else{ i.classList.add('mode-flow'); if(mixRafId){ cancelAnimationFrame(mixRafId); mixRafId=null; } }
  const fb=document.getElementById('modeFlowBtn'), mb=document.getElementById('modeMixBtn');
  if(fb&&mb){ if(emojiMode==='flow'){ fb.style.background='linear-gradient(135deg,var(--accent-neon),var(--accent))'; fb.style.color='#020005'; mb.style.background='rgba(255,255,255,.08)'; mb.style.color='var(--text-sub)'; } else{ mb.style.background='linear-gradient(135deg,var(--accent-neon),var(--accent))'; mb.style.color='#020005'; fb.style.background='rgba(255,255,255,.08)'; fb.style.color='var(--text-sub)'; } }
}
function animateMixEmoji(){
  if(mixRafId) cancelAnimationFrame(mixRafId);
  const i=document.getElementById('notchRunnerIcon'), n=document.querySelector('.notch-island'); if(!i||!n) return;
  let p=0,d=1; i.style.animation='none'; i.style.left='8px';
  const step=()=>{ if(emojiMode!=='mix'){ mixRafId=null; return; } const mx=(n.clientWidth||290)-40; p+=d*1.5; if(p>=mx){ p=mx; d=-1; cycleEmoji(); } else if(p<=0){ p=0; d=1; cycleEmoji(); } i.style.left=(8+p)+'px'; mixRafId=requestAnimationFrame(step); };
  mixRafId=requestAnimationFrame(step);
}
function cycleEmoji(){ const l=emojiList.length>0?emojiList:['🐱']; currentEmojiIndex=(currentEmojiIndex+1)%l.length; const i=document.getElementById('notchRunnerIcon'); if(!i) return; i.innerText=l[currentEmojiIndex]; i.style.filter='drop-shadow(0 0 10px var(--accent-neon))'; setTimeout(()=>{ i.style.filter=''; },200); }
function initEmojiPicker(){
  const r=document.getElementById('emojiPickerRow'); if(!r) return;
  r.innerHTML=emojiList.map(e=>`<div class="emoji-chip ${e===activeEmoji?'active':''}" data-emoji="${e}">${e}</div>`).join('');
  r.querySelectorAll('.emoji-chip').forEach(c=>{ c.addEventListener('click',()=>{ activeEmoji=c.dataset.emoji; localStorage.setItem('vaultify_active_emoji',activeEmoji); r.querySelectorAll('.emoji-chip').forEach(x=>x.classList.remove('active')); c.classList.add('active'); const icon=document.getElementById('notchRunnerIcon'); if(icon) icon.innerText=activeEmoji; showToast(`Runner: ${activeEmoji}`); }); });
}
function addCustomEmoji(){ const i=document.getElementById('customEmojiInput'); const v=i.value.trim(); if(!v) return showToast('Enter emoji'); if(emojiList.includes(v)) return showToast('Already added'); emojiList.push(v); localStorage.setItem('vaultify_emoji_list',JSON.stringify(emojiList)); i.value=''; initEmojiPicker(); showToast(`Added: ${v}`); }
function setEmojiMode(mode){ emojiMode=mode; localStorage.setItem('vaultify_emoji_mode',mode); if(mixRafId){ cancelAnimationFrame(mixRafId); mixRafId=null; } initEmojiRunner(); }
function toggleAmbientMotion(){ const e=document.getElementById('gradientFlowBg'), b=document.getElementById('gradientToggleBtn'); if(!e||!b) return; const o=e.classList.toggle('disabled'); b.innerText=o?'Disabled':'Enabled'; }
function toggleRunnerVisibility(){ const i=document.getElementById('notchRunnerIcon'), b=document.getElementById('runnerToggleBtn'); if(!i||!b) return; const h=i.style.display==='none'; i.style.display=h?'':'none'; b.innerText=h?'Enabled':'Disabled'; }
function applyThemeScheme(c){ document.body.className=''; if(c!=='theme-violet') document.body.classList.add(c); localStorage.setItem('vaultify_theme',c); const m=document.querySelector('meta[name="theme-color"]'); if(m){ if(c==='theme-midnight-oled'||c==='theme-black-white') m.content='#000000'; else if(c==='theme-royal-gold') m.content='#d4af37'; else m.content='#8b5cf6'; } showToast('Theme changed!'); }
(function restoreTheme(){ const s=localStorage.getItem('vaultify_theme'); if(s&&s!=='theme-violet') document.body.classList.add(s); })();

async function getPublicIP(){ try{ const c=new AbortController(), t=setTimeout(()=>c.abort(),5000); const r=await fetch('https://api.ipify.org?format=json',{signal:c.signal}); clearTimeout(t); if(!r.ok) return null; const d=await r.json(); return d.ip; }catch(e){ return null; } }
function getDeviceId(){ let id=localStorage.getItem('vaultify_device_id'); if(!id){ id='dev_'+Math.random().toString(36).substr(2,16)+'_'+Date.now(); localStorage.setItem('vaultify_device_id',id); } return id; }
async function initIPCounter(){
  if(!isFirebaseReady()) return;
  try{
    const ip=await getPublicIP(); if(!ip) return;
    const deviceId=getDeviceId(), ua=navigator.userAgent||'unknown', now=Date.now();
    const docRef=firestoreDB.collection('app_config').doc('user_ips'); const doc=await docRef.get();
    let data=doc.exists?doc.data():{ips:{},devices:{}};
    if(!data.ips) data.ips={}; if(!data.devices) data.devices={};
    if(!data.ips[ip]) data.ips[ip]={firstSeen:now,lastSeen:now,deviceCount:1,deviceIds:[deviceId]};
    else{ data.ips[ip].lastSeen=now; if(!data.ips[ip].deviceIds) data.ips[ip].deviceIds=[]; if(!data.ips[ip].deviceIds.includes(deviceId)){ data.ips[ip].deviceIds.push(deviceId); data.ips[ip].deviceCount=data.ips[ip].deviceIds.length; } }
    if(!data.devices[deviceId]) data.devices[deviceId]={ip,ua:ua.substring(0,100),firstSeen:now,lastSeen:now};
    else{ data.devices[deviceId].lastSeen=now; data.devices[deviceId].ip=ip; }
    const ipL=Object.keys(data.ips), devL=Object.keys(data.devices), dayAgo=now-24*60*60*1000;
    data.totalIPs=ipL.length; data.totalDevices=devL.length; data.activeDevices24h=devL.filter(k=>data.devices[k].lastSeen>=dayAgo).length; data.lastUpdated=now;
    await docRef.set(data); renderIPStats(data);
  }catch(e){}
}
function listenIPStats(cb){ if(!isFirebaseReady()) return; try{ firestoreDB.collection('app_config').doc('user_ips').onSnapshot(doc=>{ if(doc.exists&&typeof cb==='function') cb(doc.data()); }); }catch(e){} }
function renderIPStats(stats){
  const el=document.getElementById('ipStatsDisplay');
  if(el&&stats) el.innerHTML=`<div style="font-size:11px;color:var(--text-sub);line-height:1.8"><div>🌐 Total IPs: <b style="color:#fff">${stats.totalIPs||0}</b></div><div>📱 Total devices: <b style="color:#fff">${stats.totalDevices||0}</b></div><div>🟢 Active 24h: <b style="color:#10b981">${stats.activeDevices24h||0}</b></div></div>`;
  const cnt=document.getElementById('certUserCount');
  if(cnt&&stats){ const t=stats.activeDevices24h||stats.totalDevices||1; cnt.innerText=`${t} User${t>1?'s':''}`; }
}

async function savePlaybackState(){ try{ if(!currentPlaylist[currentTrackIndex]||!mainAudio) return; const t=currentPlaylist[currentTrackIndex]; const pos=mainAudio.currentTime||0; localStorage.setItem('vaultify_playback_state',JSON.stringify({wasPlaying:isPlayingAudio,lastTrackId:t.id,lastTrackTitle:t.title,lastTrackArtist:t.artist,lastTrackCover:t.cover,lastPosition:Math.floor(pos*1000),lastIndex:currentTrackIndex,playlistJson:JSON.stringify(currentPlaylist.slice(0,50)),timestamp:Date.now()})); }catch(e){} }
setInterval(()=>{ if(!isPlayingAudio) return; _lastSaveTick+=1000; if(_lastSaveTick>=10000){ _lastSaveTick=0; savePlaybackState(); } },1000);

setTimeout(()=>{ ['eq60','eq230','eq910','eq4k','eq14k'].forEach((id,i)=>{ const el=document.getElementById(id); if(el){ el.addEventListener('input',()=>{ if(eqNodes?.filters[i]) eqNodes.filters[i].gain.value=parseFloat(el.value)||0; }); el.addEventListener('change',saveEqToStorage); } }); loadEqFromStorage(); },2000);

function updateCertLiveDateTime(){
  try{
    const dateEl=document.getElementById('certLiveDate'), timeEl=document.getElementById('certLiveTime'); if(!dateEl||!timeEl) return;
    const now=new Date(); dateEl.textContent=`${String(now.getDate()).padStart(2,'0')}/${String(now.getMonth()+1).padStart(2,'0')}/${now.getFullYear()}`;
    let h=now.getHours(); const ampm=h>=12?'PM':'AM'; h=h%12; if(h===0) h=12;
    timeEl.textContent=`${String(h).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}:${String(now.getSeconds()).padStart(2,'0')} ${ampm}`;
  }catch(e){}
}
if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',updateCertLiveDateTime);
else updateCertLiveDateTime();
setInterval(updateCertLiveDateTime,1000);

async function adminForcePublish(){ if(!isAdminDevice()) return showToast('❌ Admin only'); if(tgLibrary.length===0) return showToast('❌ Empty'); showToast('☁️ Publishing...'); const ok=await publishSharedLibrary(); showToast(ok?`✅ Published ${tgLibrary.length}`:'❌ Failed'); }
function adminShowStats(){ const stats={isAdmin:isAdminDevice(),songs:tgLibrary.length,bots:TG_BOTS.length,lastScanned:parseInt(localStorage.getItem(TG_LAST_SCANNED_KEY)||'0'),version:localStorage.getItem(SHARED_VERSION_KEY)||'0',activeChat:TG_ACTIVE_FORWARD_CHAT}; console.log('📊 Stats:',stats); return stats; }
async function adminResetShared(){ if(!isAdminDevice()) return; if(!confirm('Reset shared library?')) return; try{ const oldSnap=await firestoreDB.collection(SHARED_CHUNK_COL[0]).doc(SHARED_CHUNK_COL[1]).collection(SHARED_CHUNK_COL[2]).get(); const batch=firestoreDB.batch(); oldSnap.forEach(d=>batch.delete(d.ref)); batch.delete(firestoreDB.collection(SHARED_MAIN_DOC[0]).doc(SHARED_MAIN_DOC[1])); await batch.commit(); localStorage.removeItem(SHARED_VERSION_KEY); showToast('✅ Reset'); }catch(e){ showToast('❌ Failed'); } }

window.addEventListener('DOMContentLoaded',()=>{
  mainAudio=document.getElementById('vaultifyAudio'); silentLoop=document.getElementById('silentAudioLoop');
  setTimeout(()=>{ const i=document.getElementById('appIntroScreen'); if(i){ i.classList.add('fade-out'); i.style.opacity='0'; i.style.transition='opacity 0.6s ease'; setTimeout(()=>{ i.style.display='none'; i.style.visibility='hidden'; i.style.pointerEvents='none'; i.style.zIndex='-1'; },700); } },1500);
  initCacheDB(); setupMediaSession(); setupTimelineDraggableEngine(); initLiveSearchInputListener();
  verifyAuthGate(); renderHomeRecentVault(); renderHomeQueue(); renderLibrary(); renderSearchHistoryTags(); renderNotificationCenter();
  loadLocalLibrary();
  setTimeout(async()=>{ if(isAdminDevice()){ continuousSyncLoop(); } else{ const changed=await fetchSharedLibrary(); if(changed){ renderLibrary(); renderRecommendedSection(); } startSharedRefresh(); } },2500);
  setTimeout(initEqChain,800);
  setTimeout(loadEqFromStorage,1500);
  setTimeout(()=>{ initEmojiRunner(); initEmojiPicker(); setEmojiMode(emojiMode); },500);
  setTimeout(checkPermissionsStatus,800);
  setInterval(checkPermissionsStatus,5000);
  setTimeout(()=>{ if(isFirebaseReady()){ initIPCounter(); listenIPStats(renderIPStats); } },3000);
  setTimeout(async()=>{ await checkWorker(); renderRecommendedSection(); loadQueueFromStorage(); },1500);
  setTimeout(maybeShowSyncHint,3000);
  const start=()=>{ initForegroundAudioBridge(); requestHardwareWakeLock(); if(!silentLoopStarted&&silentLoop){ silentLoop.play().catch(()=>{}); silentLoopStarted=true; } };
  document.body.addEventListener('touchstart',start,{once:true});
  document.body.addEventListener('click',start,{once:true});
  document.addEventListener('visibilitychange',()=>{
    if(document.hidden&&isPlayingAudio&&mainAudio?.paused) mainAudio.play().catch(()=>{});
    if(!document.hidden){ if('wakeLock' in navigator) requestHardwareWakeLock(); if(!isAdminDevice()&&navigator.onLine){ fetchSharedLibrary().then(c=>{ if(c){ renderLibrary(); renderRecommendedSection(); } }).catch(()=>{}); } }
  });
  window.addEventListener('popstate',(e)=>{
    e.preventDefault();
    if(!handleSystemBackPress()){
      try{ if(window.AndroidNativeBridge?.minimizeApp) window.AndroidNativeBridge.minimizeApp(); else history.pushState(null,'',location.href); }catch(err){ history.pushState(null,'',location.href); }
    }
    history.pushState(null,'',location.href);
  });
  history.pushState(null,'',location.href);
});

window.addEventListener('beforeunload',savePlaybackState);
window.addEventListener('pagehide',savePlaybackState);

Object.assign(window,{
  showToast, escapeHtml, formatClock, openModal, closeModal, openFullPlayer, closeFullPlayer,
  openPartnerModal, openSupportModal, switchNavTab, switchLibraryTab, handleSystemBackPress,
  isFirebaseReady, getDeviceId, getPublicIP, isAdminDevice,
  verifyAuthGate, unlockApp, toggleAuthMode, processAuthSubmission, applyUserDataUI,
  openForgotPasswordFlow, executePasswordReset, triggerDpPicker, handleDpUpload,
  saveProfileData, performAppLogout, generatePartnerCode, changeAppLanguage,
  detectLanguage, detectVibe, getLanguageQueries, getLanguageArtists,
  executeLiveSearch, instantSearch, renderSearchResults, playSearchedTrackImmediately,
  playTrack, playNext, playPrevious, autoplayNext, togglePlaybackState, setVisualState,
  syncPlayerUI, toggleShuffle, toggleRepeat, toggleSleepTimer, shareCurrentTrack,
  downloadCurrentTrack, toggleLikeCurrent, unlikeSong, openPlaylistView, playPlaylistSongAt, playCurrentViewPlaylist, deleteCurrentViewPlaylist, deletePlaylist,
  openAddToPlaylistModal, addToPlaylist, createPlaylistAndAdd, renderLibrary,
  renderHomeQueue, renderHomeRecentVault, renderRecommendedSection,
  renderSearchHistoryTags, clearSearchHistory, playSingleTrackObject, playCached, removeCache,
  requestMicAndListen, resetEqSliders, applyEqNow, savePlaybackState,
  showDownloadIndicator, hideDownloadIndicator, cacheGet, cacheAll, clearRecentlyPlayed,
  getStoredNotifications, pushNotification, renderNotificationCenter,
  openNotificationModal, clearAllNotifications, checkPermissionsStatus,
  handlePermissionBannerClick, requestPermsFromNative, openAppSettingsNative,
  openEqualizer, initEmojiRunner, initEmojiPicker, addCustomEmoji, setEmojiMode,
  toggleAmbientMotion, toggleRunnerVisibility, applyThemeScheme,
  initIPCounter, listenIPStats, renderIPStats, checkWorker, workerSearch,
  workerStreamUrl, searchLyrics, searchSaavn, searchSoundCloud, searchJamendo,
  saveQueueToStorage, loadQueueFromStorage, updateCertLiveDateTime,
  syncTgLibrary, manualSyncTg, startHourlySync, continuousSyncLoop, stopContinuousSync,
  fetchSharedLibrary, publishSharedLibrary, libraryLoadMore, libraryPageUp,
  adminForcePublish, adminShowStats, adminResetShared,
  extractPlaylistId, fetchYouTubePlaylist, importYouTubePlaylist, loadPlaylistToQueue,
  matchToSaavn, smartMatchTrack, matchToTgLibrary, scoreMatch, normalizeForMatch,
  openYtPlaylistModal, loadYtPlaylistPreview, renderYtPlaylistPreviewUI,
  playYtPlaylistNow, setSyncBtnState, showSyncHint, maybeShowSyncHint
});