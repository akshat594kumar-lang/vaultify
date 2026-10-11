/* VAULTIFY — FINAL (Autoplay Always On + Same Language Related) */

const CREATOR_ROOT_EMAIL = "akshat594kumar@gmail.com";
let audioContextNode = null, wakeLockSentinel = null, silentLoopStarted = false;
let eqNodes = null, eqSourceNode = null;

const PRIMARY_API_GATEWAYS = [
  'https://pipedapi.kavin.rocks','https://pipedapi.adminforge.de',
  'https://api.piped.yt','https://pipedapi.leptons.xyz',
  'https://piped-api.lunar.icu','https://pipedapi.drgnz.club',
  'https://api.piped.privacydev.net','https://pipedapi.nosebs.ru',
  'https://pipedapi.reallyaweso.me','https://pipedapi.orangenet.cc',
  'https://pipedapi.ducks.party','https://pipedapi.smnz.de'
];
const INVIDIOUS_GATEWAYS = [
  'https://inv.nadeko.net','https://yewtu.be','https://invidious.nerdvpn.de',
  'https://vid.puffyan.us','https://invidious.privacyredirect.com',
  'https://invidious.reallyaweso.me','https://inv.tux.pizza','https://invidious.flokinet.to',
  'https://iv.melmac.space','https://invidious.lunar.icu'
];
const SAAVN_APIS = [
  'https://saavn.dev','https://jiosaavn-api-privatecvc2.vercel.app','https://saavn-api-delta.vercel.app'
];

/* ═══════════ LANGUAGE DETECTION ═══════════ */
const HINDI_CHARS = /[\u0900-\u097F]/;
const URDU_CHARS = /[\u0600-\u06FF]/;
const PUNJABI_CHARS = /[\u0A00-\u0A7F]/;

function detectLanguage(text){
  if(!text) return 'english';
  if(HINDI_CHARS.test(text)) return 'hindi';
  if(URDU_CHARS.test(text)) return 'urdu';
  if(PUNJABI_CHARS.test(text)) return 'punjabi';
  const lower = text.toLowerCase();
  const hindiKeywords = ['arijit','atif','shreya','sonu','kishore','lata','asha','rafi','kumar sanu','udit','alka','sunidhi','neha kakkar','honey singh','badshah','yo yo','diljit','guru randhawa','jass manak','karan aujla','ap dhillon','sidhu moose','divine','emiway','raftaar','nucleya','jubin','darshan raval','armaan malik','sonakshi','tony kakkar','atif aslam','rahat fateh','nusrat','coke studio','bollywood','hindi','desi','punjabi'];
  const englishKeywords = ['taylor swift','ed sheeran','drake','justin bieber','ariana grande','billie eilish','post malone','the weeknd','eminem','rihanna','adele','bruno mars','coldplay','imagine dragons','maroon 5','edm','pop','rock','hip hop','english','western'];
  let hindiScore = 0, englishScore = 0;
  hindiKeywords.forEach(k => { if(lower.includes(k)) hindiScore++; });
  englishKeywords.forEach(k => { if(lower.includes(k)) englishScore++; });
  if(hindiScore > englishScore) return 'hindi';
  if(englishScore > hindiScore) return 'english';
  return 'hindi';
}

function getLanguageQueries(lang){
  if(lang === 'hindi') return ['trending hindi songs 2026','best bollywood hits','arijit singh top songs','atif aslam best','punjabi hits 2026','new hindi songs'];
  if(lang === 'urdu') return ['trending pakistani songs 2026','atif aslam hits','coke studio pakistan','nusrat fateh ali','rahat fateh ali khan'];
  if(lang === 'punjabi') return ['punjabi hits 2026','diljit dosanjh songs','ap dhillon hits','karan aujla','sidhu moose wala'];
  return ['top english hits 2026','billboard hot 100','taylor swift songs','ed sheeran hits','pop hits 2026','top 50 global'];
}

let cacheDB=null;
function initCacheDB(){return new Promise(r=>{try{const req=indexedDB.open('vaultify_cache',2);req.onupgradeneeded=e=>{const db=e.target.result;if(!db.objectStoreNames.contains('songs'))db.createObjectStore('songs',{keyPath:'id'})};req.onsuccess=e=>{cacheDB=e.target.result;r(cacheDB)};req.onerror=()=>r(null)}catch(e){r(null)}})}
function cacheGet(id){return new Promise(r=>{if(!cacheDB)return r(null);try{const rq=cacheDB.transaction('songs','readonly').objectStore('songs').get(id);rq.onsuccess=()=>{const x=rq.result;if(!x)return r(null);try{if(x.blob instanceof Blob)x.url=URL.createObjectURL(x.blob)}catch(e){}r(x)};rq.onerror=()=>r(null)}catch(e){r(null)}})}
function cachePut(id,blob,meta){return new Promise(r=>{if(!cacheDB)return r(false);try{const tx=cacheDB.transaction('songs','readwrite');tx.objectStore('songs').put({id,blob,title:meta.title,artist:meta.artist,cover:meta.cover,cachedAt:Date.now()});tx.oncomplete=()=>r(true);tx.onerror=()=>r(false)}catch(e){r(false)}})}
function cacheDelete(id){return new Promise(r=>{if(!cacheDB)return r(false);try{const tx=cacheDB.transaction('songs','readwrite');tx.objectStore('songs').delete(id);tx.oncomplete=()=>r(true)}catch(e){r(false)}})}
function cacheAll(){return new Promise(r=>{if(!cacheDB)return r([]);try{const rq=cacheDB.transaction('songs','readonly').objectStore('songs').getAll();rq.onsuccess=()=>r(rq.result||[]);rq.onerror=()=>r([])}catch(e){r([])}})}

async function requestHardwareWakeLock(){try{if('wakeLock' in navigator&&(!wakeLockSentinel||wakeLockSentinel.released)){wakeLockSentinel=await navigator.wakeLock.request('screen');wakeLockSentinel.addEventListener('release',()=>{wakeLockSentinel=null})}}catch(e){}}

function initForegroundAudioBridge(){
  try{
    if(!audioContextNode)audioContextNode=new(window.AudioContext||window.webkitAudioContext)();
    if(audioContextNode.state==='suspended')audioContextNode.resume();
    if(!audioContextNode._oscStarted){const osc=audioContextNode.createOscillator();const gain=audioContextNode.createGain();osc.frequency.value=30;gain.gain.value=0.0001;osc.connect(gain);gain.connect(audioContextNode.destination);osc.start();audioContextNode._oscStarted=true}
    if(!eqNodes)initEqChain();
  }catch(e){}
}
function initEqChain(){
  try{
    if(!audioContextNode)audioContextNode=new(window.AudioContext||window.webkitAudioContext)();
    if(eqNodes)return;
    const freqs=[60,230,910,4000,14000];
    const filters=freqs.map(f=>{const b=audioContextNode.createBiquadFilter();b.type='peaking';b.frequency.value=f;b.Q.value=1;b.gain.value=0;return b});
    for(let i=0;i<filters.length-1;i++)filters[i].connect(filters[i+1]);
    const masterGain=audioContextNode.createGain();masterGain.gain.value=1;
    filters[filters.length-1].connect(masterGain);masterGain.connect(audioContextNode.destination);
    eqNodes={filters,masterGain};
    try{eqSourceNode=audioContextNode.createMediaElementSource(mainAudio);eqSourceNode.connect(filters[0])}catch(e){eqSourceNode=null}
  }catch(e){}
}
function applyEqNow(){
  try{
    if(!audioContextNode)initForegroundAudioBridge();
    if(!eqNodes)initEqChain();
    if(!eqNodes)return showToast('EQ not ready');
    const ids=['eq60','eq230','eq910','eq4k','eq14k'];
    ids.forEach((id,i)=>{const el=document.getElementById(id);if(el&&eqNodes.filters[i])eqNodes.filters[i].gain.value=parseFloat(el.value)||0});
    saveEqToStorage();
    showToast('✅ EQ applied');
    closeModal('modalEqualizer');
  }catch(e){showToast('EQ fail')}
}
function resetEqSliders(){['eq60','eq230','eq910','eq4k','eq14k'].forEach(id=>{const el=document.getElementById(id);if(el)el.value=0});if(eqNodes)eqNodes.filters.forEach(f=>f.gain.value=0);saveEqToStorage();showToast("EQ Reset")}
function loadEqFromStorage(){try{const saved=JSON.parse(localStorage.getItem('vaultify_eq')||'null');if(!saved)return;const ids=['eq60','eq230','eq910','eq4k','eq14k'];ids.forEach((id,i)=>{const el=document.getElementById(id);if(el)el.value=saved[i]||0})}catch(e){}}
function saveEqToStorage(){try{const ids=['eq60','eq230','eq910','eq4k','eq14k'];const vals=ids.map(id=>{const el=document.getElementById(id);return el?parseFloat(el.value)||0:0});localStorage.setItem('vaultify_eq',JSON.stringify(vals))}catch(e){}}
(function attachEqListeners(){setTimeout(()=>{['eq60','eq230','eq910','eq4k','eq14k'].forEach((id,i)=>{const el=document.getElementById(id);if(el)el.addEventListener('input',()=>{if(eqNodes&&eqNodes.filters[i])eqNodes.filters[i].gain.value=parseFloat(el.value)||0});if(el)el.addEventListener('change',saveEqToStorage)});loadEqFromStorage()},1500)})();

let activeHostIndex=0,currentPlaylist=[],currentTrackIndex=0,isPlayingAudio=false,isLoginMode=false,loggedInUser=null,isShuffle=false,isRepeat=false,isVideoCanvasActive=false,activeStreamEngine='direct',ytPlayer=null,ytPlayerReady=false;
let currentLanguage='hindi';
let appLanguage=localStorage.getItem('vaultify_app_lang')||'en';
let navigationHistory=['home'];
let emojiMode=localStorage.getItem('vaultify_emoji_mode')||'flow';
let emojiList=JSON.parse(localStorage.getItem('vaultify_emoji_list')||'["🐱","👻","🔥","🚀","⚡","💜","🎵"]');
let activeEmoji=localStorage.getItem('vaultify_active_emoji')||'🐱';
let currentEmojiIndex=0,currentLibraryTab='history';
let playlists=JSON.parse(localStorage.getItem('vaultify_playlists')||'[]');
let likedSongs=JSON.parse(localStorage.getItem('vaultify_liked')||'[]');
const trackBlobCache=new Map();
let duoChannel=null;
try{duoChannel=new BroadcastChannel('vaultify_duo_sync');duoChannel.onmessage=handleDuoBroadcastMessage}catch(e){}
let searchHistoryList=JSON.parse(localStorage.getItem('vaultify_search_history')||'[]');
let playbackHistoryList=JSON.parse(localStorage.getItem('vaultify_playback_history')||'[]');
let isDraggingTimeline=false,mixRafId=null,_lastSaveTick=0,autoMixFetching=false;
let lastAutoFetchTime=0,lastFetchedArtist='';

const mainAudio=document.getElementById('vaultifyAudio');
const silentLoop=document.getElementById('silentAudioLoop');

window.addEventListener('DOMContentLoaded',async()=>{
  await initCacheDB();
  setTimeout(()=>{const i=document.getElementById('appIntroScreen');if(i)i.classList.add('fade-out')},1200);
  initAudioWakeLoop();syncLocalCatalog();verifyAuthGate();
  renderHomeRecentVault();renderHomeQueue();renderLibrary();renderSearchHistoryTags();
  setupAndroidMediaSession();setupTimelineDraggableEngine();
  renderNotificationCenter();
  initLiveSearchInputListener();initEmojiRunner();initEmojiPicker();
  checkPermissionsStatus();
  setTimeout(initEqChain,800);
  await renderRecommendedSection();
  setTimeout(()=>setEmojiMode(emojiMode),100);
  window.addEventListener('popstate',()=>{if(!handleSystemBackPress()){navigationHistory.pop();switchNavTab(navigationHistory[navigationHistory.length-1]||'home')}});
});

function handleSystemBackPress(){
  const fp=document.getElementById('fullPlayerModal');
  if(fp&&fp.classList.contains('open')){closeFullPlayer();return true}
  const om=document.querySelector('.modal-overlay.open');
  if(om){om.classList.remove('open');return true}
  const otherScreens=document.querySelectorAll('.view-screen.active:not(#tabHome)');
  if(otherScreens.length>0){switchNavTab('home');return true}
  return false;
}
window.handleSystemBackPress=handleSystemBackPress;

function initAudioWakeLoop(){
  silentLoop.src="data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA";
  const start=()=>{initForegroundAudioBridge();requestHardwareWakeLock();if(!silentLoopStarted){silentLoop.play().catch(()=>{});silentLoopStarted=true}};
  document.body.addEventListener('touchstart',start,{once:true});
  document.body.addEventListener('click',start,{once:true});
  document.addEventListener('visibilitychange',()=>{
    if(document.hidden&&isPlayingAudio){
      if(activeStreamEngine==='direct'&&mainAudio.paused)mainAudio.play().catch(()=>{});
      else if(activeStreamEngine==='yt_engine'&&ytPlayerReady&&ytPlayer){try{ytPlayer.playVideo()}catch(e){}}
    }
    if(!document.hidden&&'wakeLock' in navigator)requestHardwareWakeLock();
  });
}
setInterval(()=>{if(!isPlayingAudio)return;_lastSaveTick+=1000;if(_lastSaveTick>=10000){_lastSaveTick=0;savePlaybackState()}},1000);

function showDownloadIndicator(text){const i=document.getElementById('downloadIndicator');if(!i)return;const t=document.getElementById('downloadText');if(t)t.innerText=text;i.classList.add('show')}
function hideDownloadIndicator(){const i=document.getElementById('downloadIndicator');if(i)i.classList.remove('show')}

window.onYouTubeIframeAPIReady=function(){try{ytPlayer=new YT.Player('ytEngineSlot',{height:'10',width:'10',videoId:'',playerVars:{autoplay:0,controls:0,playsinline:1},events:{onReady:()=>{ytPlayerReady=true},onStateChange:onYTStateChange}})}catch(e){}};
function onYTStateChange(e){if(e.data===YT.PlayerState.PLAYING)setVisualState(true);else if(e.data===YT.PlayerState.PAUSED)setVisualState(false);else if(e.data===YT.PlayerState.ENDED){autoplayNext()}}

function setupAndroidMediaSession(){
  if('mediaSession' in navigator){
    try{
      navigator.mediaSession.setActionHandler('play',()=>onNativePlay());
      navigator.mediaSession.setActionHandler('pause',()=>onNativePause());
      navigator.mediaSession.setActionHandler('previoustrack',()=>onNativePrev());
      navigator.mediaSession.setActionHandler('nexttrack',()=>onNativeNext());
      navigator.mediaSession.setActionHandler('seekto',d=>{if(d.seekTime!==undefined)seekAudioTo(d.seekTime)});
    }catch(e){}
  }
  mainAudio.addEventListener('ended',()=>autoplayNext());
  mainAudio.addEventListener('error',()=>{if(currentPlaylist[currentTrackIndex])fallbackToYouTubeBridge(currentPlaylist[currentTrackIndex].id)});
  mainAudio.addEventListener('timeupdate',()=>{
    if(!mainAudio.duration||isDraggingTimeline)return;
    const pos=mainAudio.currentTime,dur=mainAudio.duration;
    const curEl=document.getElementById('labelCurrentTime');
    const durEl=document.getElementById('labelTotalDuration');
    const fill=document.getElementById('capsuleFill');
    const miniFill=document.getElementById('miniProgressFill');
    if(curEl)curEl.innerText=formatClock(pos);
    if(durEl)durEl.innerText=formatClock(dur);
    if(fill)fill.style.width=((pos/dur)*100)+'%';
    if(miniFill)miniFill.style.width=((pos/dur)*100)+'%';
    if(window.AndroidNativeBridge&&window.AndroidNativeBridge.updateProgress){try{window.AndroidNativeBridge.updateProgress(Math.floor(pos*1000),Math.floor(dur*1000))}catch(e){}}
  });
  mainAudio.addEventListener('loadedmetadata',()=>{const durEl=document.getElementById('labelTotalDuration');if(durEl)durEl.innerText=formatClock(mainAudio.duration)});
}

window.onNativePlay=function(){
  if(activeStreamEngine==='direct'&&mainAudio.paused){mainAudio.play().catch(()=>{})}
  else if(activeStreamEngine==='yt_engine'&&ytPlayerReady&&ytPlayer){try{ytPlayer.playVideo()}catch(e){}}
  setVisualState(true);
};
window.onNativePause=function(){
  if(activeStreamEngine==='direct'){mainAudio.pause()}
  else if(activeStreamEngine==='yt_engine'&&ytPlayerReady&&ytPlayer){try{ytPlayer.pauseVideo()}catch(e){}}
  setVisualState(false);
};
window.onNativeNext=function(){playNext()};
window.onNativePrev=function(){playPrevious()};
window.handleNativeMediaAction=function(action){switch(action){case 'PLAY':onNativePlay();break;case 'PAUSE':onNativePause();break;case 'NEXT':onNativeNext();break;case 'PREV':onNativePrev();break;}};
window.handleNativeSeek=function(positionMs){seekAudioTo(positionMs/1000)};
window.onNativePermissionResult=function(){checkPermissionsStatus()};

function checkPermissionsStatus(){
  const banner=document.getElementById('permWarningBanner');
  const text=document.getElementById('permWarningText');
  const micStatus=document.getElementById('micPermStatus');
  const notifStatus=document.getElementById('notifPermStatus');
  if(!window.AndroidNativeBridge){if(banner)banner.classList.remove('show');return}
  let missing=[];
  try{
    const hasMic=window.AndroidNativeBridge.hasMicPermission();
    const hasNotif=window.AndroidNativeBridge.hasNotificationPermission();
    if(micStatus)micStatus.innerText=hasMic?'Granted':'Denied';
    if(notifStatus)notifStatus.innerText=hasNotif?'Granted':'Denied';
    if(micStatus)micStatus.style.color=hasMic?'#10b981':'#ef4444';
    if(notifStatus)notifStatus.style.color=hasNotif?'#10b981':'#ef4444';
    if(!hasMic)missing.push('Microphone');
    if(!hasNotif)missing.push('Notifications');
  }catch(e){}
  if(missing.length>0&&banner&&text){text.innerText=`${missing.join(' & ')} permission needed. Tap to enable.`;banner.classList.add('show')}
  else if(banner){banner.classList.remove('show')}
}
function handlePermissionBannerClick(){if(window.AndroidNativeBridge&&window.AndroidNativeBridge.requestPermissions){window.AndroidNativeBridge.requestPermissions()}else showToast('Open Profile > Permissions')}
function requestPermsFromNative(){if(window.AndroidNativeBridge&&window.AndroidNativeBridge.requestPermissions){window.AndroidNativeBridge.requestPermissions()}else showToast('Open app settings');setTimeout(checkPermissionsStatus,800)}
function openAppSettingsNative(){if(window.AndroidNativeBridge&&window.AndroidNativeBridge.openAppSettings){window.AndroidNativeBridge.openAppSettings()}else showToast('Native settings not available')}

function updateMediaSessionMetadata(track){
  if(!track)return;
  if('mediaSession' in navigator){
    try{
      const cover=track.cover||'vaultify.png';
      navigator.mediaSession.metadata=new MediaMetadata({title:track.title||'Unknown',artist:track.artist||'Unknown',album:'Vaultify',artwork:[{src:cover,sizes:'96x96',type:'image/jpeg'},{src:cover,sizes:'256x256',type:'image/jpeg'},{src:cover,sizes:'512x512',type:'image/jpeg'}]});
      navigator.mediaSession.playbackState=isPlayingAudio?'playing':'paused';
    }catch(e){}
  }
  if(window.AndroidNativeBridge&&window.AndroidNativeBridge.updateNotification){try{window.AndroidNativeBridge.updateNotification(track.title||'Vaultify',track.artist||'',track.cover||'',isPlayingAudio)}catch(e){}}
}

function setupTimelineDraggableEngine(){
  const bar=document.getElementById('capsuleProgressBar');if(!bar)return;
  const getDuration=()=>{if(activeStreamEngine==='direct')return mainAudio.duration||0;if(ytPlayerReady&&ytPlayer&&ytPlayer.getDuration)return ytPlayer.getDuration();return 0};
  const updateUI=pct=>{const fill=document.getElementById('capsuleFill');if(fill)fill.style.width=(pct*100)+'%';const curEl=document.getElementById('labelCurrentTime');if(curEl)curEl.innerText=formatClock(pct*getDuration())};
  const getPct=x=>{const r=bar.getBoundingClientRect();return Math.max(0,Math.min(1,(x-r.left)/r.width))};
  const doSeek=pct=>{const dur=getDuration();if(dur<=0)return;const t=pct*dur;if(activeStreamEngine==='direct'&&mainAudio.duration)mainAudio.currentTime=t;else if(ytPlayerReady&&ytPlayer&&ytPlayer.seekTo)ytPlayer.seekTo(t,true)};
  bar.addEventListener('pointerdown',e=>{isDraggingTimeline=true;try{bar.setPointerCapture(e.pointerId)}catch(err){}updateUI(getPct(e.clientX))});
  bar.addEventListener('pointermove',e=>{if(isDraggingTimeline)updateUI(getPct(e.clientX))});
  bar.addEventListener('pointerup',e=>{if(!isDraggingTimeline)return;isDraggingTimeline=false;doSeek(getPct(e.clientX))});
  bar.addEventListener('pointercancel',()=>{isDraggingTimeline=false});
  bar.addEventListener('click',e=>{if(isDraggingTimeline)return;doSeek(getPct(e.clientX))});
}
function seekAudioTo(s){if(activeStreamEngine==='direct'&&mainAudio.duration)mainAudio.currentTime=s;else if(ytPlayerReady&&ytPlayer&&ytPlayer.seekTo)ytPlayer.seekTo(s,true)}

function toggleVideoCanvasView(){
  isVideoCanvasActive=!isVideoCanvasActive;
  const img=document.getElementById('fullArtImg');
  const v=document.getElementById('syncMutedVideoEngine');
  if(isVideoCanvasActive&&currentPlaylist[currentTrackIndex]){
    const t=currentPlaylist[currentTrackIndex];
    img.style.display='none';
    if(t.id&&t.id.length===11&&/^[a-zA-Z0-9_-]+$/.test(t.id)){v.style.display='block';v.muted=true;v.src=`https://www.youtube.com/embed/${t.id}?autoplay=1&mute=1`;v.play().catch(()=>{})}
    showToast("Video Mode");
  }else{v.style.display='none';v.pause();v.src='';img.style.display='block';showToast("Audio Mode")}
}

async function saavnSearch(q,limit=20){
  for(const base of SAAVN_APIS){
    try{
      const ctrl=new AbortController();const tm=setTimeout(()=>ctrl.abort(),6000);
      const r=await fetch(`${base}/api/search/songs?query=${encodeURIComponent(q)}&limit=${limit}`,{signal:ctrl.signal});
      clearTimeout(tm);if(!r.ok)continue;
      const d=await r.json();
      const results=d.data?.results||d.results||(Array.isArray(d.data)?d.data:null);
      if(results&&results.length)return results;
    }catch(e){}
  }
  return null;
}
async function saavnSongById(id){
  for(const base of SAAVN_APIS){
    try{
      const ctrl=new AbortController();const tm=setTimeout(()=>ctrl.abort(),6000);
      const r=await fetch(`${base}/api/songs/${id}`,{signal:ctrl.signal});clearTimeout(tm);
      if(!r.ok)continue;
      const d=await r.json();
      const s=(d.data&&d.data[0])||(Array.isArray(d.data)?d.data[0]:null);
      if(s)return s;
    }catch(e){}
  }
  return null;
}
function saavnExtractDirect(s){if(!s)return null;const urls=s.downloadUrl||s.downloadUrls||[];if(!urls.length)return null;const sorted=urls.slice().sort((a,b)=>(parseInt(b.quality)||0)-(parseInt(a.quality)||0));return sorted[0]?.url||sorted[0]?.link||null}
function decodeHtmlEntities(str){if(!str)return'';const ta=document.createElement('textarea');ta.innerHTML=str;return ta.value}

async function searchSaavn(q){
  try{
    const results=await saavnSearch(q,20);
    if(!results?.length)return[];
    return results.map(s=>{
      const direct=saavnExtractDirect(s);
      return{id:'saavn_'+s.id,title:decodeHtmlEntities(s.name||s.title||'Unknown'),artist:(s.artists?.primary?.map(a=>a.name).join(', '))||s.primaryArtists||'Unknown',cover:s.image?.[2]?.url||s.image?.[1]?.url||'',duration:s.duration||0,source:'saavn',_directStream:direct};
    }).filter(t=>t._directStream);
  }catch(e){return[]}
}

async function searchPiped(q){
  const promises=PRIMARY_API_GATEWAYS.map(async h=>{
    try{
      const ctrl=new AbortController();const tm=setTimeout(()=>ctrl.abort(),4000);
      const r=await fetch(`${h}/search?q=${encodeURIComponent(q)}&filter=music_songs`,{signal:ctrl.signal});clearTimeout(tm);
      if(!r.ok)return null;
      const d=await r.json();
      if(!d.items?.length)return null;
      return d.items.filter(i=>i.type==='stream').map(i=>({id:i.url.replace('/watch?v=',''),title:i.title,artist:i.uploaderName||'Artist',cover:i.thumbnail,duration:i.duration||0,source:'youtube'}));
    }catch(e){return null}
  });
  const results=await Promise.allSettled(promises);
  for(const r of results){if(r.status==='fulfilled'&&r.value&&r.value.length>0)return r.value}
  return[];
}

async function searchInvidious(q){
  const promises=INVIDIOUS_GATEWAYS.map(async h=>{
    try{
      const ctrl=new AbortController();const tm=setTimeout(()=>ctrl.abort(),4000);
      const r=await fetch(`${h}/api/v1/search?q=${encodeURIComponent(q)}&type=video`,{signal:ctrl.signal});clearTimeout(tm);
      if(!r.ok)return null;
      const d=await r.json();
      if(!Array.isArray(d)||!d.length)return null;
      return d.slice(0,20).map(v=>({id:v.videoId,title:v.title,artist:v.author||'Unknown',cover:`https://i.ytimg.com/vi/${v.videoId}/mqdefault.jpg`,duration:v.lengthSeconds||0,source:'youtube'}));
    }catch(e){return null}
  });
  const results=await Promise.allSettled(promises);
  for(const r of results){if(r.status==='fulfilled'&&r.value&&r.value.length>0)return r.value}
  return[];
}

async function searchAll(q){
  const results=await Promise.allSettled([searchPiped(q),searchInvidious(q),searchSaavn(q)]);
  const all=[];const seen=new Set();
  results.forEach(r=>{if(r.status==='fulfilled'&&r.value)r.value.forEach(t=>{const k=(t.id||t.title||'').toString().toLowerCase().trim();if(k&&!seen.has(k)){seen.add(k);all.push(t)}})});
  return all;
}

async function fetchTrendingSongs(limit=10){
  const queries=getLanguageQueries(currentLanguage);
  const shuffled=queries.sort(()=>Math.random()-0.5);
  for(const q of shuffled){
    const piped=await searchPiped(q);
    if(piped.length)return piped.slice(0,limit);
    const inv=await searchInvidious(q);
    if(inv.length)return inv.slice(0,limit);
  }
  return await searchSaavn('trending '+currentLanguage);
}

function extractYouTubeId(url){
  const m=url.match(/(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/i);
  return m?m[1]:null;
}
function extractPlaylistId(url){
  const m=url.match(/[?&]list=([^"&?\s]+)/);
  return m?m[1]:null;
}

async function executeLiveSearch(isAuto=false){
  const q=document.getElementById('mobileSearchField').value.trim();
  if(!q)return;
  if(!isAuto&&!searchHistoryList.includes(q)){
    searchHistoryList.unshift(q);
    if(searchHistoryList.length>8)searchHistoryList.pop();
    localStorage.setItem('vaultify_search_history',JSON.stringify(searchHistoryList));
    renderSearchHistoryTags();
  }
  currentLanguage = detectLanguage(q);
  const l=document.getElementById('searchLoadingIndicator');
  const rc=document.getElementById('searchResultsContainer');
  l.style.display='block';
  l.innerHTML='<i class="fa-solid fa-spinner fa-spin" style="font-size:24px;margin-bottom:8px"></i><div>Searching...</div>';
  const ytId=extractYouTubeId(q);
  if(ytId){
    const meta=await getYouTubeVideoMeta(ytId);
    if(meta){l.style.display='none';playSearchedTrackImmediately(encodeURIComponent(meta.id),encodeURIComponent(meta.title),encodeURIComponent(meta.artist),encodeURIComponent(meta.cover),'');return}
  }
  const plId=extractPlaylistId(q);
  if(plId){
    const pl=await fetchPlaylistItems(plId);
    if(pl&&pl.length){showToast(`Loaded ${pl.length} playlist songs`);l.style.display='none';renderSearchResults(pl);return}
  }
  const allResults=await searchAll(q);
  const found=allResults.slice(0,30);
  l.style.display='none';
  if(found.length>0){
    renderSearchResults(found);
    if(!isAuto)showToast(`✅ ${found.length} results`);
    setTimeout(renderRecommendedSection,2000);
  }else{
    rc.innerHTML='<p style="font-size:13px;color:var(--text-sub);text-align:center;padding:18px 0">Kuch nahi mila. Try different keywords.</p>';
  }
}

async function getYouTubeVideoMeta(vid){
  try{
    for(const h of INVIDIOUS_GATEWAYS){
      try{
        const ctrl=new AbortController();const tm=setTimeout(()=>ctrl.abort(),3500);
        const r=await fetch(`${h}/api/v1/videos/${vid}`,{signal:ctrl.signal});clearTimeout(tm);
        if(!r.ok)continue;
        const d=await r.json();
        return{id:vid,title:d.title,artist:d.author||'YouTube',cover:`https://i.ytimg.com/vi/${vid}/mqdefault.jpg`,duration:d.lengthSeconds||0,source:'youtube'};
      }catch(e){}
    }
    for(const h of PRIMARY_API_GATEWAYS){
      try{
        const ctrl=new AbortController();const tm=setTimeout(()=>ctrl.abort(),3500);
        const r=await fetch(`${h}/streams/${vid}`,{signal:ctrl.signal});clearTimeout(tm);
        if(!r.ok)continue;
        const d=await r.json();
        return{id:vid,title:d.title,artist:d.uploader||'YouTube',cover:d.thumbnailUrl,source:'youtube'};
      }catch(e){}
    }
  }catch(e){}
  return{id:vid,title:'YouTube Track',artist:'YouTube',cover:`https://i.ytimg.com/vi/${vid}/mqdefault.jpg`,source:'youtube'};
}

async function fetchPlaylistItems(playlistId){
  for(const h of INVIDIOUS_GATEWAYS){
    try{
      const ctrl=new AbortController();const tm=setTimeout(()=>ctrl.abort(),5000);
      const r=await fetch(`${h}/api/v1/playlists/${playlistId}`,{signal:ctrl.signal});clearTimeout(tm);
      if(!r.ok)continue;
      const d=await r.json();
      if(!d.videos)continue;
      return d.videos.map(v=>({id:v.videoId,title:v.title,artist:v.author||'Unknown',cover:`https://i.ytimg.com/vi/${v.videoId}/mqdefault.jpg`,duration:v.lengthSeconds||0,source:'youtube'}));
    }catch(e){}
  }
  return null;
}

function renderSearchResults(tracks){
  const c=document.getElementById('searchResultsContainer');
  c.innerHTML=tracks.map(t=>{
    const safeId=encodeURIComponent(t.id),safeTitle=encodeURIComponent(t.title||'');
    const safeArtist=encodeURIComponent(t.artist||''),safeCover=encodeURIComponent(t.cover||'vaultify.png');
    const safeDirect=t._directStream?encodeURIComponent(t._directStream):'';
    return `<div class="song-tile" onclick="playSearchedTrackImmediately('${safeId}','${safeTitle}','${safeArtist}','${safeCover}','${safeDirect}')"><div class="tile-left"><img src="${t.cover || 'vaultify.png'}" class="tile-thumb" onerror="this.src='vaultify.png'" /><div class="tile-meta"><h4>${escapeHtml(t.title)}</h4><p>${escapeHtml(t.artist)}</p></div></div><i class="fa-solid fa-play" style="color:var(--accent-neon);font-size:15px"></i></div>`;
  }).join('');
}

function playSearchedTrackImmediately(idEnc,title,artist,cover,directEnc){
  const id=decodeURIComponent(idEnc);
  const t={id,title:decodeURIComponent(title),artist:decodeURIComponent(artist),cover:decodeURIComponent(cover)};
  const realDirect=directEnc?decodeURIComponent(directEnc):'';
  if(realDirect)t._directStream=realDirect;
  currentPlaylist=[t];currentTrackIndex=0;
  renderHomeQueue();
  playTrack(0);
}

let liveSearchDebounceTimer=null;
let liveSearchRequestId=0;
function initLiveSearchInputListener(){
  const f=document.getElementById('mobileSearchField');
  if(!f)return;
  f.addEventListener('input',()=>{
    clearTimeout(liveSearchDebounceTimer);
    const q=f.value.trim();
    if(q.length>=2){
      liveSearchDebounceTimer=setTimeout(()=>{if(f.value.trim()===q)instantSearch(q)},350);
    }else if(q.length===0){
      const rc=document.getElementById('searchResultsContainer');
      if(rc)rc.innerHTML='<p style="font-size:13px;color:var(--text-sub);padding:16px 0;text-align:center">Type song name or paste YouTube link.</p>';
    }
  });
  f.addEventListener('keydown',(e)=>{
    if(e.key==='Enter'){clearTimeout(liveSearchDebounceTimer);e.preventDefault();executeLiveSearch(false)}
  });
}
async function instantSearch(q){
  currentLanguage = detectLanguage(q);
  const myId=++liveSearchRequestId;
  const l=document.getElementById('searchLoadingIndicator');
  const rc=document.getElementById('searchResultsContainer');
  if(l){l.style.display='block';l.innerHTML='<i class="fa-solid fa-spinner fa-spin" style="font-size:20px;margin-bottom:6px"></i><div style="font-size:12px">Searching...</div>'}
  const results=await Promise.allSettled([searchPiped(q),searchInvidious(q),searchSaavn(q)]);
  if(myId!==liveSearchRequestId)return;
  if(l)l.style.display='none';
  const all=[];const seen=new Set();
  results.forEach(r=>{if(r.status==='fulfilled'&&r.value)r.value.forEach(t=>{const k=(t.id||t.title||'').toString().toLowerCase().trim();if(k&&!seen.has(k)){seen.add(k);all.push(t)}})});
  const found=all.slice(0,20);
  if(found.length>0){renderSearchResults(found)}
  else{if(rc)rc.innerHTML='<p style="font-size:13px;color:var(--text-sub);text-align:center;padding:18px 0">Kuch nahi mila...</p>'}
}

function renderSearchHistoryTags(){
  const b=document.getElementById('searchHistoryBox');const tb=document.getElementById('searchHistoryTags');if(!b)return;
  if(searchHistoryList.length===0){b.style.display='none';return}
  b.style.display='block';
  tb.innerHTML=searchHistoryList.map(tag=>`<span style="font-size:11px;background:rgba(255,255,255,.06);padding:5px 10px;border-radius:10px;border:1px solid var(--border);cursor:pointer" onclick="document.getElementById('mobileSearchField').value='${escapeHtml(tag).replace(/'/g,"\\'")}';executeLiveSearch();">${escapeHtml(tag)}</span>`).join('');
}
function clearSearchHistory(){searchHistoryList=[];localStorage.removeItem('vaultify_search_history');renderSearchHistoryTags();renderRecommendedSection()}

async function fetchDirectAudioStreamUrl(input){
  if(!input)return null;
  if(input.startsWith('saavn_')){const id=input.replace('saavn_','');const s=await saavnSongById(id);return saavnExtractDirect(s)}
  if(input.startsWith('blob:')||input.startsWith('data:'))return input;
  if(/^[a-zA-Z0-9_-]{11}$/.test(input)){
    const piped=await fetchFromPiped(input);if(piped)return piped;
    const inv=await fetchFromInvidious(input);if(inv)return inv;
  }
  return null;
}
async function fetchFromPiped(vid){
  for(let a=0;a<PRIMARY_API_GATEWAYS.length;a++){
    const h=PRIMARY_API_GATEWAYS[(activeHostIndex+a)%PRIMARY_API_GATEWAYS.length];
    try{
      const ctrl=new AbortController();const tm=setTimeout(()=>ctrl.abort(),3500);
      const r=await fetch(`${h}/streams/${vid}`,{signal:ctrl.signal});clearTimeout(tm);
      if(r.ok){const d=await r.json();if(d.audioStreams?.length){const best=d.audioStreams.sort((a,b)=>(b.bitrate||0)-(a.bitrate||0))[0];if(best?.url){activeHostIndex=PRIMARY_API_GATEWAYS.indexOf(h);return best.url}}}
    }catch(e){}
  }
  return null;
}
async function fetchFromInvidious(vid){
  for(const h of INVIDIOUS_GATEWAYS){
    try{
      const ctrl=new AbortController();const tm=setTimeout(()=>ctrl.abort(),4500);
      const r=await fetch(`${h}/api/v1/videos/${vid}`,{signal:ctrl.signal});clearTimeout(tm);
      if(!r.ok)continue;
      const d=await r.json();
      const af=(d.adaptiveFormats||[]).filter(f=>f.type?.includes('audio'));
      af.sort((a,b)=>(b.bitrate||0)-(a.bitrate||0));
      if(af[0]?.url)return af[0].url;
    }catch(e){}
  }
  return null;
}

async function playTrack(index,broadcast=true){
  if(index<0||index>=currentPlaylist.length)return;
  currentTrackIndex=index;
  const track=currentPlaylist[index];
  if(track) currentLanguage = detectLanguage((track.title||'') + ' ' + (track.artist||''));
  syncPlayerUI(track);updateMediaSessionMetadata(track);logPlaybackHistory(track);renderHomeRecentVault();
  showToast(`Loading: ${(track.title||'').slice(0,30)}`);
  setTimeout(()=>initForegroundAudioBridge(),0);
  setTimeout(()=>requestHardwareWakeLock(),0);
  if(!silentLoopStarted){silentLoop.play().catch(()=>{});silentLoopStarted=true}
  if(broadcast&&duoChannel)duoChannel.postMessage({type:'SYNC_PLAY',track});
  setTimeout(()=>preCacheNextTracks(index,3),8000);
  /* AUTOPLAY ALWAYS ON — instant fill queue */
  setTimeout(()=>autoExtendQueue(track),500);
  let streamUrl=null;
  if(track._directStream&&track._directStream.startsWith('http'))streamUrl=track._directStream;
  if(!streamUrl){const c=trackBlobCache.get(track.id);if(c&&c.startsWith('blob:'))streamUrl=c}
  if(!streamUrl){const dbCached=await cacheGet(track.id);if(dbCached&&dbCached.url){streamUrl=dbCached.url;trackBlobCache.set(track.id,streamUrl)}}
  if(!streamUrl)streamUrl=await fetchDirectAudioStreamUrl(track.id);
  if(!streamUrl){fallbackToYouTubeBridge(track.id);return}
  activeStreamEngine='direct';
  try{if(ytPlayerReady&&ytPlayer&&ytPlayer.stopVideo)ytPlayer.stopVideo()}catch(e){}
  mainAudio.src=streamUrl;
  mainAudio.load();
  try{await mainAudio.play();setVisualState(true);setTimeout(()=>cacheTrackInBackground(track),12000)}catch(e){fallbackToYouTubeBridge(track.id)}
}

/* ═══════════ AUTOPLAY — Always ON ═══════════ */
async function autoplayNext(){
  if(isRepeat){playTrack(currentTrackIndex);return}
  /* Ensure at least 3 songs in queue ahead */
  const remaining = currentPlaylist.length - currentTrackIndex - 1;
  if(remaining < 2){
    const currentTrack = currentPlaylist[currentTrackIndex];
    if(currentTrack){
      autoMixFetching = false;
      try{
        const related = await fetchRelatedSongs(currentTrack);
        if(related.length){
          related.forEach(t=>{if(!currentPlaylist.some(x=>x.id===t.id))currentPlaylist.push(t)});
          renderHomeQueue();
        }
      }catch(e){}
    }
  }
  if(currentPlaylist.length === 0) return;
  if(isShuffle) currentTrackIndex = Math.floor(Math.random()*currentPlaylist.length);
  else currentTrackIndex = (currentTrackIndex+1) % currentPlaylist.length;
  playTrack(currentTrackIndex);
}

async function autoExtendQueue(track){
  if(autoMixFetching||!track)return;
  const remaining=currentPlaylist.length-currentTrackIndex-1;
  if(remaining>=3)return;
  autoMixFetching=true;
  try{
    const related=await fetchRelatedSongs(track);
    if(related.length){
      related.forEach(t=>{if(!currentPlaylist.some(x=>x.id===t.id))currentPlaylist.push(t)});
      renderHomeQueue();
    }
  }catch(e){}
  autoMixFetching=false;
}

/* ═══════════ RELATED SONGS — SAME LANGUAGE/VIBE ═══════════ */
async function fetchRelatedSongs(seedTrack){
  if(!seedTrack)return[];
  const now=Date.now();
  if(now-lastAutoFetchTime<4000)return[];
  lastAutoFetchTime=now;

  const seedLang = detectLanguage((seedTrack.title||'') + ' ' + (seedTrack.artist||''));
  currentLanguage = seedLang;

  let artist=(seedTrack.artist||'')
    .replace(/vevo|official|records|channel|music|topic|entertainment|productions|studios/gi,'')
    .replace(/[-_]/g,' ')
    .trim();

  const existingIds=new Set(currentPlaylist.map(t=>t.id));
  let results=[];
  const queries = [];

  /* Query 1: Same artist */
  if(artist && artist.length > 2 && artist !== lastFetchedArtist){
    queries.push(`${artist} songs`);
    queries.push(`${artist} top hits`);
    lastFetchedArtist = artist;
  }

  /* Query 2: Same language trending */
  const langQ = getLanguageQueries(seedLang);
  queries.push(langQ[Math.floor(Math.random()*langQ.length)]);

  /* Query 3: Similar title */
  const titleWords=(seedTrack.title||'').split(' ').slice(0,3).join(' ').replace(/[\(\)\[\]]/g,'').trim();
  if(titleWords.length > 3) queries.push(`${titleWords} similar`);

  /* Fetch all queries */
  for(const q of queries){
    if(results.length >= 12) break;
    try{
      const batch = await searchAll(q);
      batch.forEach(t => {
        if(!existingIds.has(t.id) && !results.some(r=>r.id===t.id)){
          /* Ensure same language */
          const tLang = detectLanguage((t.title||'') + ' ' + (t.artist||''));
          if(tLang === seedLang || Math.random() < 0.3){
            results.push(t);
          }
        }
      });
    }catch(e){}
  }

  return results.slice(0,10);
}

function fallbackToYouTubeBridge(vid){
  if(!vid||!/^[a-zA-Z0-9_-]{11}$/.test(vid)){showToast('❌ Play fail');return}
  activeStreamEngine='yt_engine';
  try{mainAudio.pause()}catch(e){}
  if(ytPlayerReady&&ytPlayer&&ytPlayer.loadVideoById){ytPlayer.loadVideoById(vid);ytPlayer.playVideo();setVisualState(true)}
  else{showToast("YT Engine loading...");setTimeout(()=>{if(ytPlayerReady&&ytPlayer&&ytPlayer.loadVideoById){ytPlayer.loadVideoById(vid);ytPlayer.playVideo();setVisualState(true)}else showToast('❌ Play failed')},1500)}
}
function togglePlaybackState(broadcast=true){
  if(activeStreamEngine==='direct'){
    if(mainAudio.paused){initForegroundAudioBridge();requestHardwareWakeLock();mainAudio.play().then(()=>setVisualState(true)).catch(()=>{})}
    else{mainAudio.pause();setVisualState(false)}
  }else{
    if(ytPlayerReady&&ytPlayer){try{const s=ytPlayer.getPlayerState();if(s===YT.PlayerState.PLAYING){ytPlayer.pauseVideo();setVisualState(false)}else{ytPlayer.playVideo();setVisualState(true)}}catch(e){}}
  }
  if(broadcast&&duoChannel)duoChannel.postMessage({type:'SYNC_TOGGLE'});
}
function setVisualState(playing){
  isPlayingAudio=playing;
  if(playing)requestHardwareWakeLock();
  const mi=document.getElementById('miniPlayIcon');if(mi)mi.className=playing?'fa-solid fa-pause':'fa-solid fa-play';
  const fi=document.getElementById('fullPlayIcon');if(fi)fi.className=playing?'fa-solid fa-pause':'fa-solid fa-play';
  if('mediaSession' in navigator)navigator.mediaSession.playbackState=playing?'playing':'paused';
  const t=currentPlaylist[currentTrackIndex];
  if(t&&window.AndroidNativeBridge&&window.AndroidNativeBridge.updateNotification){try{window.AndroidNativeBridge.updateNotification(t.title||'Vaultify',t.artist||'',t.cover||'',playing)}catch(e){}}
  const q=document.getElementById('modalQueueDrawer');
  if(q&&q.classList.contains('open'))renderHomeQueue();
}
async function playNext(){autoplayNext()}
function playPrevious(){if(currentPlaylist.length===0)return;currentTrackIndex=(currentTrackIndex-1+currentPlaylist.length)%currentPlaylist.length;playTrack(currentTrackIndex)}
function syncPlayerUI(track){
  const els={miniTitleText:track.title,miniArtistText:track.artist,notchTrackTitle:track.title,fullTitleText:track.title,fullArtistText:track.artist};
  for(const id in els){const el=document.getElementById(id);if(el)el.innerText=els[id]}
  const miniArt=document.getElementById('miniArtImg');if(miniArt)miniArt.src=track.cover||'vaultify.png';
  const fullArt=document.getElementById('fullArtImg');if(fullArt)fullArt.src=track.cover||'vaultify.png';
  const hb=document.getElementById('fullHeartBtn');
  if(hb){const isLiked=likedSongs.some(s=>s.id===track.id);hb.className=isLiked?'fa-solid fa-heart':'fa-regular fa-heart';hb.style.color=isLiked?'var(--partner-pink)':'inherit'}
}
function toggleShuffle(){isShuffle=!isShuffle;const el=document.getElementById('fullShuffleBtn');if(el)el.style.color=isShuffle?'var(--accent-neon)':'inherit';showToast(isShuffle?"Shuffle On":"Shuffle Off")}
function toggleRepeat(){isRepeat=!isRepeat;const el=document.getElementById('fullRepeatBtn');if(el)el.style.color=isRepeat?'var(--accent-neon)':'inherit';showToast(isRepeat?"Repeat On":"Repeat Off")}
function toggleSleepTimer(){showToast("Sleep 30 Min");setTimeout(()=>{if(isPlayingAudio)togglePlaybackState()},30*60*1000)}
function shareCurrentTrack(){if(currentPlaylist.length===0)return;const t=currentPlaylist[currentTrackIndex];if(navigator.share)navigator.share({title:t.title,text:`Listening to ${t.title} on Vaultify`}).catch(()=>{});else{try{navigator.clipboard.writeText(`🎵 ${t.title} - ${t.artist}`);showToast("Copied!")}catch(e){showToast("Share not supported")}}}

async function cacheTrackInBackground(track){
  if(!track)return;
  if(track.id.startsWith('saavn_')||track.id.startsWith('blob:'))return;
  if(trackBlobCache.has(track.id))return;
  const existing=await cacheGet(track.id);
  if(existing?.url){trackBlobCache.set(track.id,existing.url);return}
  showDownloadIndicator('Caching...');
  const url=await fetchDirectAudioStreamUrl(track.id);
  if(!url||!url.startsWith('http')){hideDownloadIndicator();return}
  try{const r=await fetch(url);const blob=await r.blob();await cachePut(track.id,blob,{title:track.title,artist:track.artist,cover:track.cover});const blobUrl=URL.createObjectURL(blob);trackBlobCache.set(track.id,blobUrl);hideDownloadIndicator();if(currentLibraryTab==='cached'&&document.getElementById('tabLibrary').classList.contains('active'))renderLibrary()}catch(e){hideDownloadIndicator()}
}
function preCacheNextTracks(startIdx,count=3){for(let i=1;i<=count;i++){const idx=startIdx+i;if(idx<currentPlaylist.length){const t=currentPlaylist[idx];setTimeout(()=>cacheTrackInBackground(t),i*5000)}}}

async function downloadCurrentTrack(){
  if(currentPlaylist.length===0)return showToast("No track!");
  const t=currentPlaylist[currentTrackIndex];
  showDownloadIndicator('Downloading...');
  try{
    let u=trackBlobCache.get(t.id)||t._directStream;
    if(!u||!u.startsWith('blob:'))u=u||await fetchDirectAudioStreamUrl(t.id);
    if(!u)throw new Error("No URL");
    const r=await fetch(u);const b=await r.blob();const bu=URL.createObjectURL(b);
    const a=document.createElement('a');a.style.display='none';a.href=bu;
    a.download=`${(t.title||'track').replace(/[^a-zA-Z0-9 ]/g,'')}.mp3`;
    document.body.appendChild(a);a.click();document.body.removeChild(a);
    await cacheTrackInBackground(t);
    setTimeout(()=>{try{URL.revokeObjectURL(bu)}catch(e){}},5000);
    hideDownloadIndicator();showToast("✅ Downloaded!");
  }catch(e){hideDownloadIndicator();showToast("❌ Failed")}
}

async function requestMicAndListen(){
  if(window.AndroidNativeBridge&&!window.AndroidNativeBridge.hasMicPermission()){if(window.AndroidNativeBridge.requestPermissions)window.AndroidNativeBridge.requestPermissions();showToast('Mic permission needed');return}
  const b=document.getElementById('voiceMicTrigger');
  try{const s=await navigator.mediaDevices.getUserMedia({audio:true});s.getTracks().forEach(t=>t.stop())}catch(e){return showToast("Mic permission denied!")}
  const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
  if(!SR)return showToast("Voice not supported.");
  const r=new SR();r.lang=appLanguage==='hi'?'hi-IN':'en-US';r.interimResults=false;
  r.onstart=()=>{if(b)b.classList.add('recording');showToast("Listening...")};
  r.onresult=e=>{const v=e.results[0][0].transcript;document.getElementById('mobileSearchField').value=v;showToast(`Heard: "${v}"`);executeLiveSearch()};
  r.onerror=()=>{if(b)b.classList.remove('recording')};
  r.onend=()=>{if(b)b.classList.remove('recording')};
  r.start();
}

function logPlaybackHistory(track){playbackHistoryList=playbackHistoryList.filter(t=>t.id!==track.id);playbackHistoryList.unshift(track);if(playbackHistoryList.length>20)playbackHistoryList.pop();localStorage.setItem('vaultify_playback_history',JSON.stringify(playbackHistoryList));if(currentLibraryTab==='history')renderLibrary()}
function renderHomeRecentVault(){const c=document.getElementById('homeRecentGrid');if(!c)return;const r=playbackHistoryList.slice(0,6);if(r.length===0){c.innerHTML=`<div style="grid-column:span 2;font-size:12.5px;color:var(--text-sub);text-align:center;padding:16px 0;background:rgba(255,255,255,.03);border-radius:14px;border:1px dashed var(--border)">No recently played.</div>`;return}c.innerHTML=r.map(t=>{const safeId=encodeURIComponent(t.id),safeTitle=encodeURIComponent(t.title||'');const safeArtist=encodeURIComponent(t.artist||''),safeCover=encodeURIComponent(t.cover||'');return `<div class="history-card" onclick="playSingleTrackObject('${safeId}','${safeTitle}','${safeArtist}','${safeCover}')"><div class="history-art"><img src="${t.cover || 'vaultify.png'}" onerror="this.src='vaultify.png'" /></div><div class="history-card-meta"><div class="history-card-title">${escapeHtml(t.title)}</div><div class="history-card-artist">${escapeHtml(t.artist)}</div></div></div>`}).join('')}
function playSingleTrackObject(idEnc,title,artist,cover){const id=decodeURIComponent(idEnc);const t={id,title:decodeURIComponent(title),artist:decodeURIComponent(artist),cover:decodeURIComponent(cover)};currentPlaylist=[t];currentTrackIndex=0;renderHomeQueue();playTrack(0)}
function buildRecommendationQuery(){const tokens=[];playbackHistoryList.slice(0,5).forEach(t=>{if(t.artist)tokens.push(t.artist.replace(/vevo|official|channel|records|music/gi,'').trim())});searchHistoryList.slice(0,3).forEach(s=>tokens.push(s));const u=[...new Set(tokens.filter(t=>t&&t.length>2))];if(u.length===0)return getLanguageQueries(currentLanguage)[0];return u.slice(0,3).join(' ')+" songs"}

async function renderRecommendedSection(){
  const container=document.getElementById('recommendedContainer');
  if(!container)return;
  let found=[];let headerText='Trending Now';
  if(playbackHistoryList.length===0&&searchHistoryList.length===0){found=await fetchTrendingSongs(8)}
  else{
    headerText='Recommended For You';
    const q=buildRecommendationQuery();
    const seen=new Set(playbackHistoryList.map(t=>t.id));
    const all=await searchAll(q);
    const langFiltered = all.filter(t=>detectLanguage((t.title||'')+' '+(t.artist||''))===currentLanguage);
    found = langFiltered.length >= 4 ? langFiltered.slice(0,6) : all.filter(t=>!seen.has(t.id)).slice(0,6);
  }
  const headerEl=document.querySelector('.recommended-header span');
  if(headerEl)headerEl.innerText=headerText;
  if(found.length===0){container.innerHTML=`<p style="font-size:11.5px;color:var(--text-sub);text-align:center;padding:10px 0">No suggestions.</p>`;return}
  container.innerHTML=found.map(t=>{const safeId=encodeURIComponent(t.id),safeTitle=encodeURIComponent(t.title||'');const safeArtist=encodeURIComponent(t.artist||''),safeCover=encodeURIComponent(t.cover||'');const safeDirect=t._directStream?encodeURIComponent(t._directStream):'';return `<div class="song-tile" onclick="playSearchedTrackImmediately('${safeId}','${safeTitle}','${safeArtist}','${safeCover}','${safeDirect}')"><div class="tile-left"><img src="${t.cover || 'vaultify.png'}" class="tile-thumb" onerror="this.src='vaultify.png'" /><div class="tile-meta"><h4>${escapeHtml(t.title)}</h4><p>${escapeHtml(t.artist)}</p></div></div><i class="fa-solid fa-wand-magic-sparkles" style="color:var(--accent-neon);font-size:13px"></i></div>`}).join('');
}

function renderHomeQueue(){const el=document.getElementById('homeQueueContainer');const c=document.getElementById('queueCountSubtitle');if(c)c.innerText=`${currentPlaylist.length} tracks`;if(!el)return;if(currentPlaylist.length===0){el.innerHTML=`<div style="font-size:12px;color:var(--text-sub);text-align:center;padding:12px 0">Empty queue.</div>`;return}let h='';const np=currentPlaylist[currentTrackIndex];const un=currentPlaylist.slice(currentTrackIndex+1,currentTrackIndex+20);if(np){h+=`<div style="font-size:10px;text-transform:uppercase;letter-spacing:1.5px;font-weight:700;margin:12px 0 6px;color:var(--accent-neon)">▶ Now Playing</div>`;h+=renderQueueTile(np,currentTrackIndex,true)}if(un.length>0){h+=`<div style="font-size:10px;text-transform:uppercase;letter-spacing:1.5px;font-weight:700;margin:12px 0 6px;color:var(--text-sub)">🎵 Up Next (${un.length})</div>`;un.forEach((t,i)=>{h+=renderQueueTile(t,currentTrackIndex+1+i,false)})}el.innerHTML=h}
function renderQueueTile(t,i,ic){const isCached=trackBlobCache.has(t.id);return `<div class="song-tile ${ic ? 'playing' : ''}" onclick="playTrack(${i});closeModal('modalQueueDrawer');"><div class="tile-left"><img src="${t.cover || 'vaultify.png'}" class="tile-thumb" onerror="this.src='vaultify.png'" /><div class="tile-meta"><h4>${escapeHtml(t.title)}${isCached ? ' <i class="fa-solid fa-check-circle" style="color:#10b981;font-size:10px"></i>' : ''}</h4><p>${escapeHtml(t.artist)}</p></div></div><i class="${ic && isPlayingAudio ? 'fa-solid fa-volume-high' : 'fa-solid fa-play'}" style="color:var(--accent-neon);font-size:13px"></i></div>`}

function switchNavTab(tab,th=true){
  document.querySelectorAll('.view-screen').forEach(s=>s.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b=>b.classList.remove('active'));
  const m={home:{s:'tabHome',b:'tabBtnHome'},search:{s:'tabSearch',b:'tabBtnSearch'},library:{s:'tabLibrary',b:'tabBtnLibrary'},cert:{s:'tabCert',b:'tabBtnCert'},profile:{s:'tabProfile',b:'tabBtnProfile'}};
  const sel=m[tab]||m.home;
  const sEl=document.getElementById(sel.s);if(sEl)sEl.classList.add('active');
  const bEl=document.getElementById(sel.b);if(bEl)bEl.classList.add('active');
  if(th&&navigationHistory[navigationHistory.length-1]!==tab)navigationHistory.push(tab);
  if(tab==='home')setTimeout(renderRecommendedSection,300);
  if(tab==='library')renderLibrary();
  if(tab==='profile')checkPermissionsStatus();
}
function openFullPlayer(){document.getElementById('fullPlayerModal').classList.add('open')}
function closeFullPlayer(){document.getElementById('fullPlayerModal').classList.remove('open')}
function openModal(id){const el=document.getElementById(id);if(el)el.classList.add('open')}
function closeModal(id){const el=document.getElementById(id);if(el)el.classList.remove('open')}
function openPartnerModal(){syncUserPartnerCode();renderPartnerRequests();openModal('modalPartner')}
function openSupportModal(){openModal('modalSupport')}
function formatClock(sec){const s=Math.floor(sec||0);const m=Math.floor(s/60);const r=s%60;return `${m}:${r<10?'0':''}${r}`}
function showToast(msg){const t=document.getElementById('toastPill');if(!t)return;t.innerText=msg;t.classList.add('show');clearTimeout(t._tt);t._tt=setTimeout(()=>t.classList.remove('show'),2500)}
function escapeHtml(s){return String(s).replace(/[&<>"']/g,x=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[x]))}

function sendSupportMail(){
  const n=document.getElementById('supName').value.trim()||(loggedInUser?.displayName||'User');
  const e=document.getElementById('supEmail').value.trim()||(loggedInUser?.email||'');
  const m=document.getElementById('supMsg').value.trim();
  if(!m)return showToast('Message likho');
  const subject=`Vaultify Support - ${n}`;
  const body=`Name: ${n}\nEmail: ${e}\nUser: ${loggedInUser?.username||'guest'}\n\nProblem:\n${m}`;
  const mailtoUrl=`mailto:akshat594kumar@gmail.com?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  try{window.location.href=mailtoUrl;showToast('📧 Mail app khul raha hai')}
  catch(err){navigator.clipboard.writeText(`To: akshat594kumar@gmail.com\n\n${body}`).then(()=>showToast('✅ Email copied')).catch(()=>showToast('❌ Failed'))}
}

async function savePlaybackState(){try{if(!currentPlaylist[currentTrackIndex])return;const t=currentPlaylist[currentTrackIndex];const pos=activeStreamEngine==='direct'?mainAudio.currentTime:0;localStorage.setItem('vaultify_playback_state',JSON.stringify({wasPlaying:isPlayingAudio,lastTrackId:t.id,lastTrackTitle:t.title,lastTrackArtist:t.artist,lastTrackCover:t.cover,lastPosition:Math.floor(pos*1000),lastIndex:currentTrackIndex,playlistJson:JSON.stringify(currentPlaylist.slice(0,50)),timestamp:Date.now()}))}catch(e){}}
window.addEventListener('beforeunload',savePlaybackState);
window.addEventListener('pagehide',savePlaybackState);

function switchLibraryTab(tab,el){currentLibraryTab=tab;document.querySelectorAll('#tabLibrary .nav-btn').forEach(p=>p.classList.remove('active'));if(el)el.classList.add('active');renderLibrary()}
async function renderLibrary(){
  const c=document.getElementById('libraryContent');if(!c)return;
  if(currentLibraryTab==='history'){
    if(playbackHistoryList.length===0){c.innerHTML=`<p style="font-size:13px;color:var(--text-sub);text-align:center;padding:18px 0">No history yet.</p>`;return}
    c.innerHTML=playbackHistoryList.map((t,i)=>{const safeId=encodeURIComponent(t.id),safeTitle=encodeURIComponent(t.title||'');const safeArtist=encodeURIComponent(t.artist||''),safeCover=encodeURIComponent(t.cover||'');return `<div class="song-tile" onclick="playSingleTrackObject('${safeId}','${safeTitle}','${safeArtist}','${safeCover}')"><div class="tile-left"><img src="${t.cover || 'vaultify.png'}" class="tile-thumb" onerror="this.src='vaultify.png'" /><div class="tile-meta"><h4>${escapeHtml(t.title)}</h4><p>${escapeHtml(t.artist)}</p></div></div><i class="fa-solid fa-play" style="color:var(--accent-neon);font-size:13px"></i></div>`}).join('');
  }else if(currentLibraryTab==='liked'){
    if(likedSongs.length===0){c.innerHTML=`<p style="font-size:13px;color:var(--text-sub);text-align:center;padding:18px 0">No liked songs yet.</p>`;return}
    c.innerHTML=likedSongs.map((t,i)=>{const safeId=encodeURIComponent(t.id),safeTitle=encodeURIComponent(t.title||'');const safeArtist=encodeURIComponent(t.artist||''),safeCover=encodeURIComponent(t.cover||'');return `<div class="song-tile" onclick="playSingleTrackObject('${safeId}','${safeTitle}','${safeArtist}','${safeCover}')"><div class="tile-left"><img src="${t.cover || 'vaultify.png'}" class="tile-thumb" onerror="this.src='vaultify.png'" /><div class="tile-meta"><h4>${escapeHtml(t.title)}</h4><p>${escapeHtml(t.artist)}</p></div></div><i class="fa-solid fa-heart" style="color:var(--partner-pink);font-size:14px" onclick="event.stopPropagation();unlikeSong('${t.id.replace(/'/g,"\\'")}')"></i></div>`}).join('');
  }else if(currentLibraryTab==='playlists'){
    let html=`<div style="background:var(--bg-card);border:1px solid var(--border);border-radius:14px;padding:12px;margin-bottom:10px;display:flex;align-items:center;gap:12px;cursor:pointer" onclick="openModal('modalAddToPlaylist')"><div style="width:56px;height:56px;border-radius:10px;background:linear-gradient(135deg,var(--accent),var(--accent-neon));display:flex;align-items:center;justify-content:center;font-size:24px;color:#fff;flex-shrink:0"><i class="fa-solid fa-plus"></i></div><div style="flex:1"><div style="font-size:14px;font-weight:700;color:#fff">Create New Playlist</div><div style="font-size:11px;color:var(--text-sub);margin-top:2px">Add current song</div></div></div>`;
    html+=playlists.map((p,i)=>`<div style="background:var(--bg-card);border:1px solid var(--border);border-radius:14px;padding:12px;margin-bottom:10px;display:flex;align-items:center;gap:12px;cursor:pointer" onclick="openPlaylist(${i})"><div style="width:56px;height:56px;border-radius:10px;background:linear-gradient(135deg,var(--accent),var(--accent-neon));display:flex;align-items:center;justify-content:center;font-size:24px;color:#fff;flex-shrink:0"><i class="fa-solid fa-list"></i></div><div style="flex:1;overflow:hidden"><div style="font-size:14px;font-weight:700;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escapeHtml(p.name)}</div><div style="font-size:11px;color:var(--text-sub);margin-top:2px">${p.songs.length} songs</div></div><i class="fa-solid fa-trash" style="color:#ef4444;font-size:14px" onclick="event.stopPropagation();deletePlaylist(${i})"></i></div>`).join('');
    c.innerHTML=html;
  }else if(currentLibraryTab==='cached'){
    const cached=await cacheAll();
    if(cached.length===0){c.innerHTML=`<p style="font-size:13px;color:var(--text-sub);text-align:center;padding:18px 0">No cached songs yet.</p>`;return}
    let totalSize=0;cached.forEach(t=>{try{if(t.blob&&t.blob.size)totalSize+=t.blob.size}catch(e){}});
    c.innerHTML=`<div style="font-size:11px;color:var(--text-sub);margin-bottom:8px"><i class="fa-solid fa-database"></i> ${cached.length} songs · ~${(totalSize/(1024*1024)).toFixed(1)}MB</div>`;
    c.innerHTML+=cached.map(t=>`<div class="song-tile" onclick="playCached('${t.id.replace(/'/g,"\\'")}')"><div class="tile-left"><img src="${t.cover || 'vaultify.png'}" class="tile-thumb" onerror="this.src='vaultify.png'" /><div class="tile-meta"><h4>${escapeHtml(t.title||'Unknown')}</h4><p>${escapeHtml(t.artist||'')}</p></div></div><i class="fa-solid fa-trash" style="color:#ef4444;font-size:13px" onclick="event.stopPropagation();removeCache('${t.id.replace(/'/g,"\\'")}')"></i></div>`).join('');
  }
}
async function playCached(id){const c=await cacheGet(id);if(c&&c.url){const t={id,title:c.title,artist:c.artist,cover:c.cover,_directStream:c.url};currentPlaylist=[t];currentTrackIndex=0;renderHomeQueue();playTrack(0)}}
async function removeCache(id){const u=trackBlobCache.get(id);if(u&&u.startsWith('blob:')){try{URL.revokeObjectURL(u)}catch(e){}}trackBlobCache.delete(id);await cacheDelete(id);renderLibrary();showToast("Removed from cache")}
function openPlaylist(i){const p=playlists[i];if(!p)return showToast("Playlist empty");if(p.songs.length===0)return showToast("Empty playlist");currentPlaylist=p.songs.slice();renderHomeQueue();playTrack(0);closeModal('modalAddToPlaylist');showToast(`▶ ${p.name} (${p.songs.length} songs)`)}
function deletePlaylist(i){if(!confirm("Delete this playlist?"))return;playlists.splice(i,1);savePlaylists();renderLibrary()}
function savePlaylists(){localStorage.setItem('vaultify_playlists',JSON.stringify(playlists))}
function toggleLikeCurrent(){if(currentPlaylist.length===0)return showToast("No track");const t=currentPlaylist[currentTrackIndex];const idx=likedSongs.findIndex(s=>s.id===t.id);if(idx>=0){likedSongs.splice(idx,1);showToast("Removed from Liked")}else{likedSongs.unshift(t);showToast("❤️ Added to Liked")}localStorage.setItem('vaultify_liked',JSON.stringify(likedSongs));const hb=document.getElementById('fullHeartBtn');const isLiked=likedSongs.some(s=>s.id===t.id);hb.className=isLiked?'fa-solid fa-heart':'fa-regular fa-heart';hb.style.color=isLiked?'var(--partner-pink)':'inherit';if(currentLibraryTab==='liked')renderLibrary()}
function unlikeSong(id){likedSongs=likedSongs.filter(s=>s.id!==id);localStorage.setItem('vaultify_liked',JSON.stringify(likedSongs));renderLibrary()}
function openAddToPlaylistModal(){if(currentPlaylist.length===0)return showToast("No track");const c=document.getElementById('playlistSelectList');if(playlists.length===0)c.innerHTML=`<p style="font-size:12px;color:var(--text-sub);text-align:center;padding:8px 0">No playlists yet.</p>`;else c.innerHTML=playlists.map((p,i)=>`<div class="song-tile" onclick="addToPlaylist(${i})"><div class="tile-left"><div style="width:38px;height:38px;border-radius:8px;background:linear-gradient(135deg,var(--accent),var(--accent-neon));display:flex;align-items:center;justify-content:center;font-size:16px;color:#fff;flex-shrink:0"><i class="fa-solid fa-list"></i></div><div class="tile-meta"><h4>${escapeHtml(p.name)}</h4><p>${p.songs.length} songs</p></div></div><i class="fa-solid fa-plus" style="color:var(--accent-neon)"></i></div>`).join('');openModal('modalAddToPlaylist')}
function addToPlaylist(i){const t=currentPlaylist[currentTrackIndex];if(!playlists[i].songs.some(s=>s.id===t.id))playlists[i].songs.push(t);savePlaylists();showToast(`Added to ${playlists[i].name}`);closeModal('modalAddToPlaylist');if(currentLibraryTab==='playlists')renderLibrary()}
function createPlaylistAndAdd(){const n=document.getElementById('newPlaylistName').value.trim();if(!n)return showToast("Enter name");const t=currentPlaylist[currentTrackIndex];playlists.push({id:Date.now(),name:n,songs:t?[t]:[],created:Date.now()});savePlaylists();document.getElementById('newPlaylistName').value='';showToast(`Created: ${n}`);closeModal('modalAddToPlaylist');if(currentLibraryTab==='playlists')renderLibrary()}

function getStoredNotifications(){return JSON.parse(localStorage.getItem('vaultify_notifications_list')||'[]')}
function pushNotification(n){const l=getStoredNotifications();l.unshift({...n,id:Date.now(),time:new Date().toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}),unread:true});if(l.length>60)l.pop();localStorage.setItem('vaultify_notifications_list',JSON.stringify(l));renderNotificationCenter()}
function renderNotificationCenter(){
  const list=getStoredNotifications();
  const container=document.getElementById('notificationListContainer');
  const badge=document.getElementById('notifBadgeCount');
  if(badge){const unreadCount=list.filter(n=>n.unread).length;if(unreadCount>0){badge.innerText=unreadCount;badge.style.display='flex'}else{badge.style.display='none'}}
  if(!container)return;
  if(list.length===0){container.innerHTML=`<div style="text-align:center;padding:40px 20px;color:var(--text-sub);"><i class="fa-solid fa-bell-slash" style="font-size:36px;margin-bottom:12px;opacity:0.5;"></i><p style="font-size:13px;font-weight:600;">No notifications yet</p></div>`;return}
  container.innerHTML=list.map(n=>`<div style="display:flex;align-items:flex-start;gap:12px;padding:12px;margin-bottom:8px;background:${n.unread?'rgba(139,92,246,0.12)':'rgba(255,255,255,0.03)'};border:1px solid ${n.unread?'var(--accent-neon)':'var(--border)'};border-radius:14px;"><div style="width:38px;height:38px;border-radius:50%;background:${n.iconColor||'var(--accent-neon)'}20;display:flex;align-items:center;justify-content:center;flex-shrink:0;"><i class="${n.icon||'fa-solid fa-bell'}" style="color:${n.iconColor||'var(--accent-neon)'};font-size:16px;"></i></div><div style="flex:1;min-width:0;"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:2px;"><span style="font-size:13px;font-weight:700;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:70%;">${escapeHtml(n.title)}</span><span style="font-size:10px;color:var(--text-sub);flex-shrink:0;margin-left:8px;">${n.time}</span></div><div style="font-size:11.5px;color:var(--text-sub);line-height:1.4;word-break:break-word;">${escapeHtml(n.message)}</div></div>${n.unread?'<div style="width:8px;height:8px;border-radius:50%;background:var(--accent-neon);flex-shrink:0;margin-top:6px;"></div>':''}</div>`).join('');
}
function openNotificationModal(){const l=getStoredNotifications();l.forEach(n=>n.unread=false);localStorage.setItem('vaultify_notifications_list',JSON.stringify(l));renderNotificationCenter();openModal('modalNotifications')}
function clearAllNotifications(){localStorage.removeItem('vaultify_notifications_list');renderNotificationCenter();showToast("Cleared!")}
function syncLocalCatalog(){currentPlaylist=[];currentTrackIndex=0}

const AUTH_ITERATIONS=100000,AUTH_SALT_BYTES=16,AUTH_KEY_BYTES=32;
function bytesToHex(bytes){return Array.from(new Uint8Array(bytes)).map(b=>b.toString(16).padStart(2,'0')).join('')}
function hexToBytes(hex){const a=new Uint8Array(hex.length/2);for(let i=0;i<hex.length;i+=2)a[i/2]=parseInt(hex.substr(i,2),16);return a}
function generateSalt(){const s=new Uint8Array(AUTH_SALT_BYTES);crypto.getRandomValues(s);return bytesToHex(s)}
async function derivePasswordHash(password,saltHex){try{const enc=new TextEncoder();const baseKey=await crypto.subtle.importKey('raw',enc.encode(password),{name:'PBKDF2'},false,['deriveBits']);const salt=hexToBytes(saltHex);const bits=await crypto.subtle.deriveBits({name:'PBKDF2',salt,iterations:AUTH_ITERATIONS,hash:'SHA-256'},baseKey,AUTH_KEY_BYTES*8);return bytesToHex(bits)}catch(e){let h=password+'|'+saltHex;for(let i=0;i<50000;i++){h=btoa(h+password)}return h}}
function getUserDB(){try{return JSON.parse(localStorage.getItem('vaultify_user_db')||'{}')}catch(e){return{}}}
function saveUserDB(db){localStorage.setItem('vaultify_user_db',JSON.stringify(db))}
function findUserByEmail(email){const db=getUserDB();const el=String(email||'').trim().toLowerCase();if(!el)return null;for(const key in db){if(db[key]&&db[key].email&&String(db[key].email).toLowerCase()===el)return{key,user:db[key]}}return null}
function findUserByUsername(username){const db=getUserDB();const ul=String(username||'').trim().toLowerCase();if(!ul)return null;if(db[ul])return{key:ul,user:db[ul]};return null}
function verifyAuthGate(){const s=localStorage.getItem('vaultify_active_user');const authModal=document.getElementById('modalAuthGate');const mainFrame=document.querySelector('.mobile-frame');if(!authModal)return;if(!s){document.body.classList.add('auth-locked');if(mainFrame)mainFrame.style.pointerEvents='none';authModal.classList.add('open');authModal.style.display='flex'}else{try{loggedInUser=JSON.parse(s);applyUserDataUI(loggedInUser);document.body.classList.remove('auth-locked');if(mainFrame)mainFrame.style.pointerEvents='';authModal.classList.remove('open');authModal.style.display='none'}catch(e){document.body.classList.add('auth-locked');authModal.classList.add('open');authModal.style.display='flex'}}}
function unlockApp(){const authModal=document.getElementById('modalAuthGate');const mainFrame=document.querySelector('.mobile-frame');if(authModal){authModal.classList.remove('open');authModal.style.display='none'}document.body.classList.remove('auth-locked');if(mainFrame)mainFrame.style.pointerEvents=''}
function toggleAuthMode(){isLoginMode=!isLoginMode;document.getElementById('authSubmitBtn').innerText=isLoginMode?'Log In':'Create Account';document.getElementById('authModeToggleText').innerText=isLoginMode?"Don't have account? Sign up":'Already registered? Log in';document.getElementById('authDisplayNameInput').style.display=isLoginMode?'none':'block';hideAuthAlerts()}
function showAuthError(msg){const er=document.getElementById('authErrorAlert');const ok=document.getElementById('authSuccessAlert');if(ok)ok.style.display='none';if(er){er.innerText=msg;er.style.display='block'}}
function showAuthSuccess(msg){const er=document.getElementById('authErrorAlert');const ok=document.getElementById('authSuccessAlert');if(er)er.style.display='none';if(ok){ok.innerText=msg;ok.style.display='block'}}
function hideAuthAlerts(){const er=document.getElementById('authErrorAlert');const ok=document.getElementById('authSuccessAlert');if(er)er.style.display='none';if(ok)ok.style.display='none'}
function validateUsername(u){if(!u||u.length<3)return{ok:false,msg:"Username must be at least 3 characters."};if(u.length>20)return{ok:false,msg:"Username must be under 20 characters."};if(!/^[a-z0-9_]+$/.test(u))return{ok:false,msg:"Only letters, numbers, _ allowed."};return{ok:true}}
function validateEmail(e){if(!e||!e.trim())return{ok:false,msg:"Email is required."};if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e))return{ok:false,msg:"Please enter a valid email."};return{ok:true}}
function validatePassword(p){if(!p||p.length<8)return{ok:false,msg:"Password must be at least 8 characters."};if(!/[A-Za-z]/.test(p))return{ok:false,msg:"Password must include a letter."};if(!/[0-9]/.test(p))return{ok:false,msg:"Password must include a number."};return{ok:true}}

async function processAuthSubmission(){
  hideAuthAlerts();
  const u=String(document.getElementById('authUsernameInput').value||'').trim().toLowerCase();
  const e=String(document.getElementById('authEmailInput').value||'').trim().toLowerCase();
  const p=document.getElementById('authPasswordInput').value||'';
  const dName=document.getElementById('authDisplayNameInput').value.trim();
  const vu=validateUsername(u);if(!vu.ok)return showAuthError(vu.msg);
  const ve=validateEmail(e);if(!ve.ok)return showAuthError(ve.msg);
  if(!isLoginMode){const vp=validatePassword(p);if(!vp.ok)return showAuthError(vp.msg)}
  else{if(!p)return showAuthError("Password is required.")}
  const submitBtn=document.getElementById('authSubmitBtn');
  const originalText=submitBtn.innerText;
  submitBtn.innerText='Please wait...';submitBtn.disabled=true;
  try{
    if(isLoginMode){
      let found=findUserByUsername(u);
      if(!found&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(u))found=findUserByEmail(u);
      if(!found){showAuthError("❌ This account doesn't exist.");return}
      const user=found.user;
      if(String(user.email||'').toLowerCase()!==e){showAuthError("❌ Email mismatch.");return}
      const derived=await derivePasswordHash(p,user.salt||'');
      if(derived!==user.passwordHash){showAuthError("❌ Invalid password.");return}
      user.lastLogin=Date.now();
      const db=getUserDB();db[found.key]=user;saveUserDB(db);
      loggedInUser=user;localStorage.setItem('vaultify_active_user',JSON.stringify(loggedInUser));
      showAuthSuccess("✅ Login successful!");
      setTimeout(()=>{unlockApp();applyUserDataUI(loggedInUser);showToast(`Welcome back, ${loggedInUser.displayName||loggedInUser.username}!`);hideAuthAlerts()},500);
    }else{
      if(findUserByUsername(u)){showAuthError("❌ Username already taken.");return}
      if(findUserByEmail(e)){showAuthError("❌ This email is already registered.");return}
      const salt=generateSalt();
      const passwordHash=await derivePasswordHash(p,salt);
      const partnerCode=generatePartnerCode(u);
      const newUser={username:u,email:e,displayName:dName||u,bio:'',passwordHash,salt,avatar:'',partnerCode,partnerRequests:[],partnerRequestsSent:[],notifications:[],createdAt:Date.now(),lastLogin:Date.now(),version:3};
      const db=getUserDB();db[u]=newUser;saveUserDB(db);
      loggedInUser=newUser;localStorage.setItem('vaultify_active_user',JSON.stringify(loggedInUser));
      showAuthSuccess("✅ Account created!");
      setTimeout(()=>{unlockApp();applyUserDataUI(loggedInUser);showToast(`Welcome, ${loggedInUser.displayName}!`);hideAuthAlerts()},600);
    }
  }catch(err){showAuthError("⚠️ Something went wrong.")}
  finally{submitBtn.innerText=originalText;submitBtn.disabled=false}
}
function applyUserDataUI(user){if(!user)return;const editName=document.getElementById('editDisplayName');const editBio=document.getElementById('editBio');const avatar=document.getElementById('userAvatarImg');if(editName)editName.value=user.displayName||user.username;if(editBio)editBio.value=user.bio||'';if(avatar&&user.avatar)avatar.src=user.avatar}
function openForgotPasswordFlow(){closeModal('modalAuthGate');openModal('modalForgotPass')}
async function executePasswordReset(){const u=document.getElementById('fpUsername').value.trim().toLowerCase();const e=document.getElementById('fpEmail').value.trim().toLowerCase();const p=document.getElementById('fpNewPassword').value;const vu=validateUsername(u);if(!vu.ok)return showToast(vu.msg);const ve=validateEmail(e);if(!ve.ok)return showToast(ve.msg);const vp=validatePassword(p);if(!vp.ok)return showToast(vp.msg);const found=findUserByUsername(u);if(!found)return showToast("❌ Account doesn't exist.");if(String(found.user.email||'').toLowerCase()!==e)return showToast("❌ Email mismatch.");const newSalt=generateSalt();const newHash=await derivePasswordHash(p,newSalt);const db=getUserDB();db[found.key].passwordHash=newHash;db[found.key].salt=newSalt;saveUserDB(db);closeModal('modalForgotPass');openModal('modalAuthGate');showToast("✅ Password updated!")}
function triggerDpPicker(){const picker=document.getElementById('avatarPicker');if(picker)picker.click();else showToast('Picker not found')}
function handleDpUpload(e){const f=e.target.files[0];if(!f)return;if(f.size>3*1024*1024){showToast("Max 3MB");return}if(!f.type.startsWith('image/')){showToast("Image only");return}const r=new FileReader();r.onload=ev=>{const b=ev.target.result;document.getElementById('userAvatarImg').src=b;if(loggedInUser){loggedInUser.avatar=b;const db=getUserDB();if(db[loggedInUser.username]){db[loggedInUser.username].avatar=b;saveUserDB(db)}localStorage.setItem('vaultify_active_user',JSON.stringify(loggedInUser))}showToast("✅ DP Updated!")};r.readAsDataURL(f);e.target.value=''}
function saveProfileData(){if(!loggedInUser)return;const n=document.getElementById('editDisplayName').value.trim();if(!n)return showToast("Name required");const bio=(document.getElementById('editBio')?.value||'').trim();loggedInUser.displayName=n;loggedInUser.bio=bio;const db=getUserDB();if(db[loggedInUser.username]){db[loggedInUser.username].displayName=n;db[loggedInUser.username].bio=bio;saveUserDB(db)}localStorage.setItem('vaultify_active_user',JSON.stringify(loggedInUser));applyUserDataUI(loggedInUser);showToast("Profile updated!")}
function performAppLogout(){if(!confirm("Log out from this device?"))return;localStorage.removeItem('vaultify_active_user');location.reload()}
function generatePartnerCode(username){if(!username)return'VAULT-XXXXXX';let hash=0;const seed=username+'_vaultify_2026';for(let i=0;i<seed.length;i++){hash=((hash<<5)-hash)+seed.charCodeAt(i);hash=hash&hash}const code=Math.abs(hash).toString(36).toUpperCase().padStart(6,'0').slice(0,6);return 'VAULT-'+code}
function syncUserPartnerCode(){if(!loggedInUser)return;const db=getUserDB();const user=db[loggedInUser.username];if(!user)return;if(!user.partnerCode){user.partnerCode=generatePartnerCode(loggedInUser.username);db[loggedInUser.username]=user;saveUserDB(db)}loggedInUser.partnerCode=user.partnerCode;localStorage.setItem('vaultify_active_user',JSON.stringify(loggedInUser))}
function copyPartnerCode(){showToast('Coming soon feature')}
function searchPartnerProfile(){showToast('Coming soon')}
function sendPartnerRequest(){showToast('Coming soon')}
function acceptPartnerRequest(){showToast('Coming soon')}
function declinePartnerRequest(){showToast('Coming soon')}
function renderPartnerRequests(){}
function pairPartner(){showToast('Coming soon')}
function sendDuoChatMessage(){}
function handleDuoBroadcastMessage(e){const d=e.data;if(!d)return;if(d.type==='SYNC_PLAY'&&d.track){currentPlaylist.push(d.track);renderHomeQueue()}else if(d.type==='SYNC_TOGGLE'){togglePlaybackState(false)}}

function initEmojiRunner(){const i=document.getElementById('notchRunnerIcon');if(!i)return;i.classList.remove('mode-flow','mode-mix');if(emojiMode==='mix'){i.classList.add('mode-mix');animateMixEmoji()}else{i.classList.add('mode-flow');if(mixRafId){cancelAnimationFrame(mixRafId);mixRafId=null}i.style.left='';i.style.transform=''}i.innerText=activeEmoji}
function animateMixEmoji(){if(mixRafId)cancelAnimationFrame(mixRafId);const i=document.getElementById('notchRunnerIcon');const n=document.querySelector('.notch-island');if(!i||!n)return;let p=0,d=1;const sp=0.8;const step=()=>{if(emojiMode!=='mix'){mixRafId=null;return}const mx=n.clientWidth-32;p+=d*sp;if(p>=mx){p=mx;d=-1;cycleEmoji()}else if(p<=0){p=0;d=1;cycleEmoji()}i.style.left=(8+p)+'px';mixRafId=requestAnimationFrame(step)};mixRafId=requestAnimationFrame(step)}
function cycleEmoji(){const l=emojiList.length>0?emojiList:['🐱'];currentEmojiIndex=(currentEmojiIndex+1)%l.length;const i=document.getElementById('notchRunnerIcon');if(!i)return;i.innerText=l[currentEmojiIndex];i.style.filter='drop-shadow(0 0 10px var(--accent-neon))';setTimeout(()=>{i.style.filter=''},200)}
function initEmojiPicker(){const r=document.getElementById('emojiPickerRow');if(!r)return;r.innerHTML=emojiList.map(e=>`<div class="emoji-chip ${e===activeEmoji?'active':''}" data-emoji="${e}">${e}</div>`).join('');r.querySelectorAll('.emoji-chip').forEach(c=>{c.addEventListener('click',()=>{activeEmoji=c.dataset.emoji;localStorage.setItem('vaultify_active_emoji',activeEmoji);r.querySelectorAll('.emoji-chip').forEach(x=>x.classList.remove('active'));c.classList.add('active');const icon=document.getElementById('notchRunnerIcon');if(icon)icon.innerText=activeEmoji;showToast(`Runner: ${activeEmoji}`)})})}
function addCustomEmoji(){const i=document.getElementById('customEmojiInput');const v=i.value.trim();if(!v)return showToast("Enter emoji");if(emojiList.includes(v))return showToast("Already added");emojiList.push(v);localStorage.setItem('vaultify_emoji_list',JSON.stringify(emojiList));i.value='';initEmojiPicker();showToast(`Added: ${v}`)}
function setEmojiMode(mode){emojiMode=mode;localStorage.setItem('vaultify_emoji_mode',mode);initEmojiRunner()}
function toggleAmbientMotion(){const e=document.getElementById('gradientFlowBg');const b=document.getElementById('gradientToggleBtn');const o=e.classList.toggle('disabled');b.innerText=o?'Disabled':'Enabled';showToast(`Motion ${o?'off':'on'}`)}
function toggleRunnerVisibility(){const i=document.getElementById('notchRunnerIcon');const b=document.getElementById('runnerToggleBtn');const h=i.style.display==='none';i.style.display=h?'':'none';b.innerText=h?'Enabled':'Disabled';showToast(`Runner ${h?'on':'off'}`)}
function applyThemeScheme(c){document.body.className='';if(c!=='theme-violet')document.body.classList.add(c);localStorage.setItem('vaultify_theme',c);const meta=document.querySelector('meta[name="theme-color"]');if(meta)meta.content=(c==='theme-midnight-oled')?'#000000':(c==='theme-royal-gold'?'#d4af37':'#8b5cf6');showToast(`Theme changed!`)}
function changeAppLanguage(lang){appLanguage=lang;localStorage.setItem('vaultify_app_lang',lang);showToast(lang==='hi'?"हिंदी चुनी गई":"English Selected")}
(function restoreTheme(){const saved=localStorage.getItem('vaultify_theme');if(saved&&saved!=='theme-violet')document.body.classList.add(saved)})();

setInterval(checkPermissionsStatus,5000);

Object.assign(window,{
  switchNavTab,switchLibraryTab,openModal,closeModal,openFullPlayer,closeFullPlayer,
  openPartnerModal,openSupportModal,openNotificationModal,clearAllNotifications,executeLiveSearch,instantSearch,
  clearSearchHistory,requestMicAndListen,playSearchedTrackImmediately,playSingleTrackObject,
  playCached,removeCache,openPlaylist,deletePlaylist,playTrack,togglePlaybackState,
  playNext,playPrevious,autoplayNext,toggleShuffle,toggleRepeat,toggleSleepTimer,shareCurrentTrack,
  downloadCurrentTrack,toggleLikeCurrent,unlikeSong,toggleVideoCanvasView,
  openAddToPlaylistModal,addToPlaylist,createPlaylistAndAdd,resetEqSliders,applyEqNow,
  toggleAmbientMotion,toggleRunnerVisibility,addCustomEmoji,setEmojiMode,
  applyThemeScheme,changeAppLanguage,handleDpUpload,saveProfileData,performAppLogout,
  toggleAuthMode,processAuthSubmission,openForgotPasswordFlow,executePasswordReset,
  searchPartnerProfile,pairPartner,sendDuoChatMessage,showToast,sendSupportMail,triggerDpPicker,
  acceptPartnerRequest,declinePartnerRequest,sendPartnerRequest,syncUserPartnerCode,
  renderPartnerRequests,generatePartnerCode,copyPartnerCode,
  onNativePlay,onNativePause,onNativeNext,onNativePrev,
  handleNativeMediaAction,handleNativeSeek,
  requestPermsFromNative,openAppSettingsNative,handlePermissionBannerClick
});
