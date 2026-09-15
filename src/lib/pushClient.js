function urlBase64ToUint8Array(value) {
  const padding = '='.repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = window.atob(base64);
  return Uint8Array.from([...raw].map((char) => char.charCodeAt(0)));
}

let nativeActionListenerReady = false;

function isPortalNative() {
  if (typeof window === 'undefined') return false;
  return /JackpotPortalNative/i.test(navigator.userAgent || '');
}

function isDistributorNative() {
  if (typeof window === 'undefined') return false;
  return /JackpotDistributorNative/i.test(navigator.userAgent || '');
}

function isNativePlatform() {
  if (typeof window === 'undefined') return false;
  if (window.Capacitor?.isNativePlatform?.() === true) return true;
  // Capacitor WebView UA markers (player / staff Portal / distributor APKs).
  return /JackpotRoyalsNative|JackpotPortalNative|JackpotDistributorNative/i.test(
    navigator.userAgent || ''
  );
}

export function isIosDevice() {
  if (typeof window === 'undefined') return false;
  const ua = window.navigator.userAgent || '';
  return (
    /iPad|iPhone|iPod/.test(ua) ||
    (window.navigator.platform === 'MacIntel' && window.navigator.maxTouchPoints > 1)
  );
}

export function isAndroidDevice() {
  if (typeof window === 'undefined') return false;
  return /Android/i.test(window.navigator.userAgent || '');
}

export function isStandaloneDisplay() {
  if (typeof window === 'undefined') return false;
  if (isNativePlatform()) return true;
  try {
    if (window.navigator.standalone === true) return true;
  } catch {
    /* ignore */
  }
  try {
    if (window.matchMedia?.('(display-mode: standalone)').matches) return true;
    if (window.matchMedia?.('(display-mode: fullscreen)').matches) return true;
    if (window.matchMedia?.('(display-mode: minimal-ui)').matches) return true;
  } catch {
    /* ignore */
  }
  return false;
}

export function supportsWebPush() {
  if (isNativePlatform()) return true;
  // iOS only exposes PushManager after the site is added to the Home Screen
  // and opened from that icon (standalone). Asking earlier always fails.
  if (isIosDevice() && !isStandaloneDisplay()) return false;
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

/** UI helper: should we show an Enable Lock Screen banner? */
export function getWebPushPromptState() {
  if (typeof window === 'undefined') {
    return { show: false, reason: 'ssr' };
  }
  if (isNativePlatform()) {
    return { show: false, reason: 'native' };
  }
  if (isIosDevice() && !isStandaloneDisplay()) {
    return { show: true, reason: 'ios-needs-homescreen', canEnable: false };
  }
  if (!supportsWebPush()) {
    return { show: false, reason: 'unsupported' };
  }
  const permission = typeof Notification !== 'undefined' ? Notification.permission : 'default';
  if (permission === 'granted') {
    return { show: false, reason: 'granted', canEnable: false, permission };
  }
  if (permission === 'denied') {
    return { show: true, reason: 'denied', canEnable: false, permission };
  }
  return { show: true, reason: 'prompt', canEnable: true, permission: permission || 'default' };
}

function detectClientKind() {
  if (isNativePlatform()) return 'native';
  if (isIosDevice()) return isStandaloneDisplay() ? 'ios-pwa' : 'ios-browser';
  if (isAndroidDevice()) return isStandaloneDisplay() ? 'android-pwa' : 'android-chrome';
  return 'desktop';
}

export async function getExistingPushSubscription() {
  if (isNativePlatform()) return null;
  if (!supportsWebPush()) return null;
  const registration = await navigator.serviceWorker.ready;
  return registration.pushManager.getSubscription();
}

let latestNativeToken = null;
if (typeof window !== 'undefined') {
  try {
    latestNativeToken = localStorage.getItem('jackpot_cached_native_token') || null;
  } catch {}

  // Auto-sync token to backend if session exists
  const autoSyncNativeToken = async (token) => {
    if (!token || typeof window === 'undefined') return;
    latestNativeToken = token;
    try {
      localStorage.setItem('jackpot_cached_native_token', token);
    } catch {}

    let userEmail = '';
    let audience = 'player';
    let distributorId = '';

    try {
      const adminSess = localStorage.getItem('jackpot_admin_session');
      if (adminSess && adminSess !== 'null') {
        const parsed = JSON.parse(adminSess);
        if (parsed?.email) {
          userEmail = parsed.email;
          audience = 'staff';
        }
      }
    } catch {}

    if (!userEmail) {
      try {
        const distSess = localStorage.getItem('jackpot_distributor_session');
        if (distSess && distSess !== 'null') {
          const parsed = JSON.parse(distSess);
          if (parsed?.email) {
            userEmail = parsed.email;
            audience = 'distributor';
            distributorId = parsed.id || parsed.distributorId || '';
          }
        }
      } catch {}
    }

    if (!userEmail) {
      try {
        const userSess = localStorage.getItem('jackpot_session');
        if (userSess && userSess !== 'null') {
          const parsed = JSON.parse(userSess);
          if (parsed?.email) {
            userEmail = parsed.email;
            audience = 'player';
          }
        }
      } catch {}
    }

    if (!userEmail && (isPortalNative() || (typeof window !== 'undefined' && window.location.pathname.startsWith('/admin')))) {
      userEmail = process.env.NEXT_PUBLIC_ADMIN_EMAIL || '';
      audience = 'staff';
    }

    if (userEmail) {
      try {
        await fetch('/api/push-subscriptions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: String(userEmail).trim().toLowerCase(),
            nativeToken: token,
            platform: window.Capacitor?.getPlatform?.() || 'android',
            audience,
            distributorId,
            userAgent: navigator.userAgent,
            clientKind: 'native',
            standalone: true
          })
        });
      } catch {}
    }
  };

  const initEarlyPushListeners = async () => {
    const Cap = window.Capacitor;
    const Push = Cap?.Plugins?.PushNotifications;
    if (!Push) return;
    try {
      try {
        Push.addListener('registration', (result) => {
          if (result?.value) {
            autoSyncNativeToken(result.value);
          }
        });
      } catch {}

      try {
        Push.addListener('registrationError', (err) => {
          console.warn('Native push registration error:', err);
        });
      } catch {}

      const perm = await Push.checkPermissions().catch(() => null);
      if (perm?.receive === 'granted') {
        await Push.register().catch(() => {});
      }
    } catch {}
  };

  if (document.readyState === 'loading') {
    window.addEventListener('DOMContentLoaded', initEarlyPushListeners);
  } else {
    initEarlyPushListeners();
  }
}

async function subscribeToNativePush(userEmail, { audience = 'player', distributorId = '' } = {}) {
  // Access the native plugin through the runtime bridge instead of a static
  // import so the web build never hard-depends on @capacitor/push-notifications.
  const Capacitor = typeof window !== 'undefined' ? window.Capacitor : null;
  const PushNotifications = Capacitor?.Plugins?.PushNotifications;
  if (!PushNotifications) {
    throw new Error('Native push plugin is not available on this build.');
  }

  // 1. Lenient permission check & request
  let permission = await PushNotifications.checkPermissions().catch(() => null);
  if (!permission || permission.receive !== 'granted') {
    permission = await PushNotifications.requestPermissions().catch(() => null);
  }
  if (permission?.receive !== 'granted') {
    throw new Error('Notification permission was not allowed. Please allow notifications in device settings.');
  }

  const resolvedAudience = audience === 'distributor' || isDistributorNative()
    ? 'distributor'
    : audience === 'staff' || isPortalNative()
      ? 'staff'
      : 'player';
  const channelId =
    resolvedAudience === 'distributor'
      ? 'jackpot_distributor_alerts'
      : resolvedAudience === 'staff'
        ? 'jackpot_portal_alerts'
        : 'jackpot_promotions';
  const channelName =
    resolvedAudience === 'distributor'
      ? 'Distributor Alerts'
      : resolvedAudience === 'staff'
        ? 'Portal Alerts'
        : 'Promotions';
  const channelDescription =
    resolvedAudience === 'distributor'
      ? 'Jackpot Distributor request alerts'
      : resolvedAudience === 'staff'
        ? 'Jackpot Portal request alerts'
        : 'Jackpot Royals offers and promotions';

  if (Capacitor?.getPlatform?.() === 'android') {
    try {
      await PushNotifications.createChannel({
        id: channelId,
        name: channelName,
        description: channelDescription,
        importance: 5, // High importance (sound + heads-up)
        visibility: 1, // Lock screen visible
        vibration: true,
        sound: 'default'
      });
    } catch (cErr) {
      console.warn('Channel creation error:', cErr);
    }
  }

  let token = latestNativeToken || null;
  if (!token) {
    try {
      token = localStorage.getItem('jackpot_cached_native_token');
    } catch {}
  }

  let resolveToken;
  let rejectToken;
  const tokenPromise = new Promise((resolve, reject) => {
    resolveToken = resolve;
    rejectToken = reject;
  });

  let registrationHandle = null;
  try {
    registrationHandle = await PushNotifications.addListener('registration', (result) => {
      if (result?.value) {
        latestNativeToken = result.value;
        try {
          localStorage.setItem('jackpot_cached_native_token', result.value);
        } catch {}
        resolveToken(result.value);
      }
    });
  } catch {}

  let errorHandle = null;
  try {
    errorHandle = await PushNotifications.addListener('registrationError', (err) => {
      if (token) {
        resolveToken(token);
      } else {
        rejectToken(new Error(err?.error || 'This native build is not connected to Firebase/APNs yet.'));
      }
    });
  } catch {}

  try {
    await PushNotifications.register();
  } catch (regErr) {
    if (!token) {
      try {
        if (typeof registrationHandle?.remove === 'function') await registrationHandle.remove();
      } catch {}
      try {
        if (typeof errorHandle?.remove === 'function') await errorHandle.remove();
      } catch {}
      throw regErr;
    }
  }

  const timeoutMs = token ? 1500 : 8000;
  const timeout = window.setTimeout(() => {
    const existing = latestNativeToken || (typeof localStorage !== 'undefined' && localStorage.getItem('jackpot_cached_native_token'));
    if (existing) {
      resolveToken(existing);
    } else {
      rejectToken(new Error('Push registration timed out. Please verify Google Play Services and internet connection.'));
    }
  }, timeoutMs);

  try {
    token = await tokenPromise;
  } catch (regErr) {
    const fallback = latestNativeToken || (typeof localStorage !== 'undefined' && localStorage.getItem('jackpot_cached_native_token'));
    if (fallback) {
      token = fallback;
    } else {
      throw regErr;
    }
  } finally {
    window.clearTimeout(timeout);
    try {
      if (typeof registrationHandle?.remove === 'function') await registrationHandle.remove();
    } catch {}
    try {
      if (typeof errorHandle?.remove === 'function') await errorHandle.remove();
    } catch {}
  }

  const response = await fetch('/api/push-subscriptions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: String(userEmail || '').trim().toLowerCase(),
      nativeToken: token,
      platform: Capacitor?.getPlatform?.() || 'android',
      audience: resolvedAudience,
      distributorId: resolvedAudience === 'distributor' ? String(distributorId || '').trim() : '',
      userAgent: navigator.userAgent,
      clientKind: 'native',
      standalone: true
    })
  });
  const data = await response.json();
  if (!response.ok || !data.success) {
    throw new Error(data.message || 'Could not register this device.');
  }

  if (!nativeActionListenerReady) {
    nativeActionListenerReady = true;
    try {
      PushNotifications.addListener('pushNotificationActionPerformed', ({ notification }) => {
        const isDist = isDistributorNative();
        const isPort = isPortalNative();
        const fallback =
          resolvedAudience === 'distributor' || isDist
            ? '/distributor'
            : resolvedAudience === 'staff' || isPort
              ? '/admin'
              : '/lobby';
        let targetUrl =
          notification?.data?.url ||
          notification?.data?.adminUrl ||
          notification?.data?.distributorUrl ||
          fallback;

        if (/\/ledger|\/payout|\/deposit|\/withdraw/i.test(targetUrl)) {
          targetUrl = (resolvedAudience === 'distributor' || isDist) ? '/distributor/ledger' : '/admin/ledger';
        }

        window.location.assign(targetUrl);
      });
    } catch {}
  }

  return { nativeToken: token, success: true };
}

async function subscribeToWebPush(userEmail, { audience = 'player', distributorId = '' } = {}) {
  if (typeof window !== 'undefined' && window.location.protocol !== 'https:' && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
    throw new Error('Push notifications require HTTPS (SSL secure URL). Please open the site using https://');
  }

  if (isIosDevice() && !isStandaloneDisplay()) {
    throw new Error(
      'On iPhone, tap Share (⬆) → Add to Home Screen, open Jackpot from that icon, then enable notifications.'
    );
  }
  if (
    typeof window === 'undefined' ||
    !('serviceWorker' in navigator) ||
    !('PushManager' in window) ||
    !('Notification' in window)
  ) {
    throw new Error('Push notifications are not supported in this browser. Please open in Chrome / Edge or install the Jackpot Portal APK.');
  }

  // Ensure SW is controlling this page before PushManager.subscribe (required on iOS PWA).
  let registration;
  try {
    registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
    registration = await navigator.serviceWorker.ready;
  } catch (err) {
    throw new Error('Could not start notification service. Close the app and open it again from the Home Screen icon.');
  }

  const keyResponse = await fetch('/api/push-subscriptions', { cache: 'no-store' });
  const keyData = await keyResponse.json();
  if (!keyResponse.ok || !keyData.publicKey) {
    throw new Error(keyData.message || 'Push notifications are not configured yet.');
  }

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    throw new Error('Notification permission was not allowed. Check Settings → Notifications for Jackpot Royals.');
  }

  const appServerKey = urlBase64ToUint8Array(keyData.publicKey);
  let subscription = await registration.pushManager.getSubscription();

  // iOS is fragile if we unsubscribe every time — reuse a valid subscription.
  // Chrome/Android: refresh subscription when missing only; recreate on subscribe failure.
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: appServerKey
    });
  }

  const resolvedAudience =
    audience === 'distributor' ? 'distributor' : audience === 'staff' ? 'staff' : 'player';

  const postBody = {
    email: String(userEmail || '').trim().toLowerCase(),
    subscription: subscription.toJSON(),
    audience: resolvedAudience,
    distributorId: resolvedAudience === 'distributor' ? String(distributorId || '').trim() : '',
    userAgent: navigator.userAgent,
    clientKind: detectClientKind(),
    standalone: isStandaloneDisplay()
  };

  let response = await fetch('/api/push-subscriptions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(postBody)
  });
  let data = await response.json();

  // Stale VAPID / dead endpoint — recreate once (skip aggressive unsubscribe-first on iOS).
  if (!response.ok || !data.success) {
    try {
      await subscription.unsubscribe();
    } catch {
      /* ignore */
    }
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: appServerKey
    });
    postBody.subscription = subscription.toJSON();
    response = await fetch('/api/push-subscriptions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(postBody)
    });
    data = await response.json();
  }

  if (!response.ok || !data.success) {
    throw new Error(data.message || 'Could not enable notifications.');
  }

  // Confirm lock-screen path works (local smoke test — does not use remote push).
  try {
    if (registration.showNotification) {
      await registration.showNotification('Jackpot Royals', {
        body: 'Lock screen notifications are on. You will get offers here.',
        icon: '/icon-192.png',
        badge: '/icon-192.png',
        tag: 'jr-push-enabled',
        data: { url: '/lobby' }
      });
    }
  } catch {
    /* some iOS builds only allow remote push display */
  }

  return subscription;
}

export async function subscribeToPromoPush(userEmail) {
  if (isNativePlatform()) {
    const audience = isDistributorNative()
      ? 'distributor'
      : isPortalNative()
        ? 'staff'
        : 'player';
    return await subscribeToNativePush(userEmail, { audience });
  }

  return subscribeToWebPush(userEmail, { audience: 'player' });
}

/** Jackpot Portal (admin/staff) — lock-screen alerts for new requests. */
export async function subscribeToStaffPush(userEmail) {
  let email = String(userEmail || '').trim().toLowerCase();
  if (!email && typeof localStorage !== 'undefined') {
    try {
      const sess = localStorage.getItem('jackpot_admin_session');
      if (sess && sess !== 'null') {
        const parsed = JSON.parse(sess);
        if (parsed?.email) email = String(parsed.email).trim().toLowerCase();
      }
    } catch {}
  }
  if (!email) {
    email = process.env.NEXT_PUBLIC_ADMIN_EMAIL || '';
  }

  if (isNativePlatform()) {
    return await subscribeToNativePush(email, { audience: 'staff' });
  }
  return subscribeToWebPush(email, { audience: 'staff' });
}

/** Jackpot Distributor APK — lock-screen alerts for that distributor's requests. */
export async function subscribeToDistributorPush(userEmail, distributorId) {
  if (isNativePlatform()) {
    return await subscribeToNativePush(userEmail, {
      audience: 'distributor',
      distributorId
    });
  }
  return subscribeToWebPush(userEmail, {
    audience: 'distributor',
    distributorId
  });
}

export async function unsubscribeFromPromoPush(userEmail) {
  if (isNativePlatform()) return;
  const subscription = await getExistingPushSubscription();
  if (!subscription) return;

  await fetch('/api/push-subscriptions', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: String(userEmail || '').trim().toLowerCase(),
      endpoint: subscription.endpoint
    })
  });
  await subscription.unsubscribe();
}
