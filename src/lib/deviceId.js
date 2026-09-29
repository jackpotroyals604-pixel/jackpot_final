// Client-Side Device Identification and Fingerprinting Utility
// Protects against multi-accounting and bonus fraud by persistently identifying unique devices.

const DEVICE_ID_KEY = 'jackpot_device_id';
const COOKIE_KEY = 'jackpot_did';
const FINGERPRINT_KEY = 'jackpot_device_fp';

/** Simple string hash (djb2 / murmur3 variant) for quick client hashing */
function hashString(str) {
  let h1 = 0xdeadbeef ^ 0;
  let h2 = 0x41c6ce57 ^ 0;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16);
}

/** Read a cookie by name */
function getCookie(name) {
  if (typeof document === 'undefined') return '';
  const match = document.cookie.match(new RegExp('(^|;\\s*)(' + name + ')=([^;]*)'));
  return match ? decodeURIComponent(match[3]) : '';
}

/** Set a persistent cookie with 5-year expiry */
function setCookie(name, value) {
  if (typeof document === 'undefined') return;
  const maxAge = 5 * 365 * 24 * 60 * 60; // 5 years
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${maxAge}; SameSite=Lax`;
}

/** Generate a cryptographically strong UUID */
function generateUUID() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return 'did_' + crypto.randomUUID().replace(/-/g, '');
  }
  return 'did_' + 'xxxxxxxxxxxx4xxxyxxxxxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/** Generate Canvas 2D text fingerprint */
function getCanvasFingerprint() {
  try {
    if (typeof document === 'undefined') return 'no-dom';
    const canvas = document.createElement('canvas');
    canvas.width = 200;
    canvas.height = 50;
    const ctx = canvas.getContext('2d');
    if (!ctx) return 'no-ctx';

    ctx.textBaseline = 'top';
    ctx.font = "14px 'Arial', 'Helvetica', sans-serif";
    ctx.fillStyle = '#f60';
    ctx.fillRect(125, 1, 62, 20);
    ctx.fillStyle = '#069';
    ctx.fillText('JackpotRoyals-DeviceLock:1.0', 2, 15);
    ctx.fillStyle = 'rgba(102, 204, 0, 0.7)';
    ctx.fillText('JackpotRoyals-DeviceLock:1.0', 4, 17);

    return hashString(canvas.toDataURL());
  } catch (e) {
    return 'canvas-error';
  }
}

/** Generate WebGL renderer fingerprint */
function getWebGLFingerprint() {
  try {
    if (typeof document === 'undefined') return 'no-dom';
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
    if (!gl) return 'no-webgl';
    const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
    if (!debugInfo) return 'no-debug-info';
    const vendor = gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL) || '';
    const renderer = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) || '';
    return hashString(`${vendor}~${renderer}`);
  } catch (e) {
    return 'webgl-error';
  }
}

let _cachedDeviceId = '';
const DB_NAME = 'jackpot_device_store';
const STORE_NAME = 'device_meta';

// Asynchronously sync device ID with IndexedDB (survives basic cookie / site data clears)
function syncIndexedDB(currentId) {
  if (typeof window === 'undefined' || !window.indexedDB) return;
  try {
    const req = window.indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    req.onsuccess = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) return;
      
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const getReq = store.get('deviceId');
      getReq.onsuccess = () => {
        const idbId = getReq.result;
        if (idbId && typeof idbId === 'string' && idbId.trim()) {
          _cachedDeviceId = idbId.trim();
          try {
            if (!localStorage.getItem(DEVICE_ID_KEY)) {
              localStorage.setItem(DEVICE_ID_KEY, idbId.trim());
            }
          } catch (err) {}
          try {
            if (!sessionStorage.getItem(DEVICE_ID_KEY)) {
              sessionStorage.setItem(DEVICE_ID_KEY, idbId.trim());
            }
          } catch (err) {}
          if (!getCookie(COOKIE_KEY)) {
            setCookie(COOKIE_KEY, idbId.trim());
          }
        } else if (currentId && typeof currentId === 'string') {
          try {
            store.put(currentId.trim(), 'deviceId');
          } catch (wErr) {}
        }
      };
    };
  } catch (e) {}
}

if (typeof window !== 'undefined') {
  setTimeout(() => {
    try {
      const initialId = getOrCreateDeviceId();
      syncIndexedDB(initialId);
    } catch (e) {}
  }, 30);
}

/**
 * Get or create persistent Device ID
 * Stored across localStorage, sessionStorage, persistent cookies and IndexedDB
 * for bulletproof survival against single-storage clears.
 */
export function getOrCreateDeviceId() {
  if (typeof window === 'undefined') return '';

  if (_cachedDeviceId) return _cachedDeviceId;

  let id = '';
  try {
    id = localStorage.getItem(DEVICE_ID_KEY) || '';
  } catch (e) {}

  if (!id) {
    try {
      id = sessionStorage.getItem(DEVICE_ID_KEY) || '';
    } catch (e) {}
  }

  if (!id) {
    id = getCookie(COOKIE_KEY);
  }

  if (!id) {
    id = generateUUID();
  }

  _cachedDeviceId = id;

  // Persist across all available client storage tiers
  try {
    localStorage.setItem(DEVICE_ID_KEY, id);
  } catch (e) {}
  try {
    sessionStorage.setItem(DEVICE_ID_KEY, id);
  } catch (e) {}
  setCookie(COOKIE_KEY, id);
  syncIndexedDB(id);

  return id;
}

/**
 * Normalized Hardware Fingerprint
 * Independent of browser, incognito mode, language or orientation!
 * Extracts true physical hardware specifications (GPU, screen, cores, touch, memory, audio DSP).
 */
export function getHardwareFingerprint() {
  if (typeof window === 'undefined') return '';

  try {
    const screenW = typeof window.screen !== 'undefined' ? window.screen.width : 0;
    const screenH = typeof window.screen !== 'undefined' ? window.screen.height : 0;
    const minDim = Math.min(screenW, screenH);
    const maxDim = Math.max(screenW, screenH);
    const colorDepth = window.screen?.colorDepth || 24;
    const pixelRatio = Math.round((window.devicePixelRatio || 1) * 100) / 100;
    const cores = navigator.hardwareConcurrency || 0;
    const touch = navigator.maxTouchPoints || 0;
    const memory = navigator.deviceMemory || 0;
    const tz = typeof Intl !== 'undefined' && Intl.DateTimeFormat ? Intl.DateTimeFormat().resolvedOptions().timeZone || '' : '';
    const platform = (navigator.userAgentData?.platform || navigator.platform || '').toLowerCase();

    // Extract unmasked physical GPU model
    let glVendor = '';
    let glRenderer = '';
    try {
      const canvas = document.createElement('canvas');
      const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
      if (gl) {
        const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
        if (debugInfo) {
          glVendor = gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL) || '';
          glRenderer = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) || '';
        }
      }
    } catch (e) {}

    // AudioContext DSP hardware sample rate
    let audioSignature = '';
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        const audioCtx = new AudioCtx();
        audioSignature = `${audioCtx.sampleRate || 0}`;
        audioCtx.close().catch(() => {});
      }
    } catch (e) {}

    const rawHardware = [
      `${minDim}x${maxDim}`,
      colorDepth,
      pixelRatio,
      cores,
      touch,
      memory,
      tz,
      platform,
      glVendor,
      glRenderer,
      audioSignature
    ].join('::');

    return 'hfp_' + hashString(rawHardware);
  } catch (e) {
    return '';
  }
}

/**
 * Get stable hardware/browser fingerprint hash
 */
export function getDeviceFingerprint() {
  if (typeof window === 'undefined') return '';

  try {
    const cached = sessionStorage.getItem(FINGERPRINT_KEY);
    if (cached) return cached;
  } catch (e) {}

  const screenW = typeof window.screen !== 'undefined' ? window.screen.width : 0;
  const screenH = typeof window.screen !== 'undefined' ? window.screen.height : 0;
  const minDim = Math.min(screenW, screenH);
  const maxDim = Math.max(screenW, screenH);
  const screenInfo = `${minDim}x${maxDim}x${window.screen?.colorDepth || 24}x${Math.round((window.devicePixelRatio || 1) * 100) / 100}`;

  const tz = typeof Intl !== 'undefined' && Intl.DateTimeFormat
    ? Intl.DateTimeFormat().resolvedOptions().timeZone || ''
    : '';

  const tzOffset = typeof Date !== 'undefined' ? new Date().getTimezoneOffset() : 0;
  const nav = typeof navigator !== 'undefined' ? navigator : {};

  const hardwareSignals = [
    screenInfo,
    tz,
    tzOffset,
    nav.language || '',
    nav.hardwareConcurrency || '0',
    nav.maxTouchPoints || '0',
    nav.platform || '',
    getCanvasFingerprint(),
    getWebGLFingerprint()
  ].join('||');

  const fp = 'fp_' + hashString(hardwareSignals);

  try {
    sessionStorage.setItem(FINGERPRINT_KEY, fp);
  } catch (e) {}

  return fp;
}

/**
 * Get complete device payload for registration & auth calls
 */
export function getDevicePayload() {
  if (typeof window === 'undefined') {
    return { deviceId: '', deviceFingerprint: '', hardwareFingerprint: '', isApp: false, appType: 'BROWSER', clientPlatform: '' };
  }

  const isStandalone = Boolean(
    window.matchMedia?.('(display-mode: standalone)').matches ||
    window.navigator?.standalone === true ||
    document.referrer?.includes('android-app://') ||
    (typeof window.location !== 'undefined' && (
      window.location.search?.includes('source=app') ||
      window.location.search?.includes('pwa=1')
    ))
  );

  return {
    deviceId: getOrCreateDeviceId(),
    deviceFingerprint: getDeviceFingerprint(),
    hardwareFingerprint: getHardwareFingerprint(),
    isApp: isStandalone,
    appType: isStandalone ? 'PWA_APP' : 'BROWSER',
    clientPlatform: typeof navigator !== 'undefined' ? (navigator.userAgentData?.platform || navigator.platform || '') : ''
  };
}
