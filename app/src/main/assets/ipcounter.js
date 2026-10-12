/* ═══════════════════════════════════════════════════════════════ */
/* VAULTIFY — IP COUNTER                                          */
/* Tracks unique IPs + devices using the app                       */
/* Uses Firestore collection: app_config/user_ips                  */
/* ═══════════════════════════════════════════════════════════════ */

let currentIPAddress = null;
let currentDeviceHash = null;

async function initIPCounter() {
  if (!isFirebaseReady()) {
    console.warn('IP Counter: Firebase not ready');
    return;
  }

  try {
    const ip = await getPublicIP();
    if (!ip) {
      console.warn('IP Counter: could not get IP');
      return;
    }

    currentIPAddress = ip;
    const deviceId = getDeviceId();
    const userAgent = navigator.userAgent || 'unknown';

    // Create a hash combining IP + device + UA
    currentDeviceHash = await hashString(ip + '|' + deviceId + '|' + userAgent);

    await registerIPInFirestore(ip, deviceId, userAgent);
    startIPHeartbeat();
  } catch (e) {
    console.warn('IP Counter init error:', e);
  }
}

async function hashString(str) {
  try {
    const enc = new TextEncoder();
    const buf = await crypto.subtle.digest('SHA-256', enc.encode(str));
    return Array.from(new Uint8Array(buf))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('')
      .substring(0, 32);
  } catch (e) {
    // Fallback simple hash
    let h = 0;
    for (let i = 0; i < str.length; i++) {
      h = ((h << 5) - h) + str.charCodeAt(i);
      h = h & h;
    }
    return Math.abs(h).toString(36);
  }
}

async function registerIPInFirestore(ip, deviceId, userAgent) {
  if (!firestoreDB) return;

  try {
    const docRef = firestoreDB.collection('app_config').doc('user_ips');
    const doc = await docRef.get();

    const now = Date.now();
    let data = doc.exists ? doc.data() : { ips: {}, devices: {} };

    if (!data.ips) data.ips = {};
    if (!data.devices) data.devices = {};

    // Track by IP
    if (!data.ips[ip]) {
      data.ips[ip] = {
        firstSeen: now,
        lastSeen: now,
        deviceCount: 1,
        deviceIds: [deviceId]
      };
    } else {
      data.ips[ip].lastSeen = now;
      if (!data.ips[ip].deviceIds) data.ips[ip].deviceIds = [];
      if (!data.ips[ip].deviceIds.includes(deviceId)) {
        data.ips[ip].deviceIds.push(deviceId);
        data.ips[ip].deviceCount = data.ips[ip].deviceIds.length;
      }
    }

    // Track by device
    if (!data.devices[deviceId]) {
      data.devices[deviceId] = {
        ip: ip,
        ua: userAgent.substring(0, 100),
        firstSeen: now,
        lastSeen: now
      };
    } else {
      data.devices[deviceId].lastSeen = now;
      data.devices[deviceId].ip = ip;
    }

    // Compute stats
    const ipList = Object.keys(data.ips);
    const deviceList = Object.keys(data.devices);

    // Active in last 24h
    const dayAgo = now - 24 * 60 * 60 * 1000;
    const activeIPs = ipList.filter(k => data.ips[k].lastSeen >= dayAgo);
    const activeDevices = deviceList.filter(k => data.devices[k].lastSeen >= dayAgo);

    data.totalIPs = ipList.length;
    data.totalDevices = deviceList.length;
    data.activeIPs24h = activeIPs.length;
    data.activeDevices24h = activeDevices.length;
    data.lastUpdated = now;

    await docRef.set(data, { merge: false });
    console.log(`📊 IP Count: ${data.totalIPs} IPs, ${data.totalDevices} devices`);
  } catch (e) {
    console.warn('Firestore IP register error:', e);
  }
}

let ipHeartbeatTimer = null;

function startIPHeartbeat() {
  // Update last seen every 10 minutes
  if (ipHeartbeatTimer) clearInterval(ipHeartbeatTimer);
  ipHeartbeatTimer = setInterval(async () => {
    if (!isFirebaseReady() || !currentIPAddress) return;
    try {
      const docRef = firestoreDB.collection('app_config').doc('user_ips');
      const doc = await docRef.get();
      if (!doc.exists) return;
      const data = doc.data();
      const now = Date.now();

      if (data.ips && data.ips[currentIPAddress]) {
        data.ips[currentIPAddress].lastSeen = now;
      }
      const deviceId = getDeviceId();
      if (data.devices && data.devices[deviceId]) {
        data.devices[deviceId].lastSeen = now;
      }
      data.lastUpdated = now;
      await docRef.set(data);
    } catch (e) {}
  }, 10 * 60 * 1000);
}

async function getIPStats() {
  if (!isFirebaseReady()) return null;
  try {
    const doc = await firestoreDB.collection('app_config').doc('user_ips').get();
    if (!doc.exists) return { totalIPs: 0, totalDevices: 0, activeIPs24h: 0 };
    return doc.data();
  } catch (e) {
    return null;
  }
}

function listenIPStats(callback) {
  if (!isFirebaseReady()) return null;
  try {
    return firestoreDB.collection('app_config').doc('user_ips')
      .onSnapshot(doc => {
        if (doc.exists && typeof callback === 'function') {
          callback(doc.data());
        }
      }, err => console.warn('IP stats listener error:', err));
  } catch (e) {
    return null;
  }
}

/* ═══════════ EXPORT TO WINDOW ═══════════ */
window.initIPCounter = initIPCounter;
window.getIPStats = getIPStats;
window.listenIPStats = listenIPStats;
window.hashString = hashString;
