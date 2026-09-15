import webpush from 'web-push';
import { createPrivateKey } from 'crypto';
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';

const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:support@jackpotroyals.com';

function configureWebPush() {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) return false;

  webpush.setVapidDetails(VAPID_SUBJECT, publicKey, privateKey);
  return true;
}

export function getVapidPublicKey() {
  return process.env.VAPID_PUBLIC_KEY || '';
}

function normalizeServiceAccount(sa) {
  if (sa && typeof sa.private_key === 'string') {
    // Node/OpenSSL 3 rejects keys whose newlines are still escaped as "\n".
    sa.private_key = sa.private_key.replace(/\\n/g, '\n');
  }
  return sa;
}

function serviceAccountHasValidKey(sa) {
  const key = sa?.private_key || sa?.privateKey;
  if (!key) return true; // individual-var form is validated by cert() later
  try {
    createPrivateKey(key);
    return true;
  } catch {
    return false;
  }
}

function getFirebaseMessaging() {
  if (getApps().length > 0) return getMessaging(getApps()[0]);

  // Collect every configured credential source, then pick the FIRST one whose
  // private key actually parses. This protects us when e.g. the base64 env var
  // got corrupted on paste but the plain JSON var is still good.
  const candidates = [];

  if (process.env.FIREBASE_SERVICE_ACCOUNT_B64) {
    try {
      const decoded = Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_B64, 'base64').toString('utf8');
      candidates.push(normalizeServiceAccount(JSON.parse(decoded)));
    } catch (error) {
      console.error('Invalid FIREBASE_SERVICE_ACCOUNT_B64:', error.message);
    }
  }
  if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    try {
      candidates.push(normalizeServiceAccount(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON)));
    } catch (error) {
      console.error('Invalid FIREBASE_SERVICE_ACCOUNT_JSON:', error.message);
    }
  }
  if (
    process.env.FIREBASE_PROJECT_ID &&
    process.env.FIREBASE_CLIENT_EMAIL &&
    process.env.FIREBASE_PRIVATE_KEY
  ) {
    candidates.push({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')
    });
  }

  if (candidates.length === 0) return null;
  const serviceAccount = candidates.find(serviceAccountHasValidKey) || candidates[0];

  const app = initializeApp({ credential: cert(serviceAccount) });
  return getMessaging(app);
}

export async function sendPromotionPush(db, promotion, targetEmails) {
  if (!Array.isArray(targetEmails) || targetEmails.length === 0) {
    return { sent: 0, failed: 0, skipped: true };
  }

  const normalizedEmails = [...new Set(
    targetEmails.map((email) => String(email || '').trim().toLowerCase()).filter(Boolean)
  )];
  const subscriptions = await db.collection('pushSubscriptions')
    .find({ userEmail: { $in: normalizedEmails } })
    .toArray();

  if (subscriptions.length === 0) {
    return { sent: 0, failed: 0, skipped: false };
  }
  const webSubscriptions = subscriptions.filter(
    (record) => record.type !== 'native' && record.subscription
  );
  const nativeSubscriptions = subscriptions.filter(
    (record) => record.type === 'native' && record.nativeToken
  );

  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || process.env.SITE_URL || 'https://jackpotroyals.com')
    .replace(/\/$/, '');
  const remoteImage = /^https?:\/\//i.test(promotion.image || '') ? promotion.image : undefined;

  // Calm lock-screen copy for web (Chrome often hides flashy marketing as "Possible spam").
  // Full promo title/message still open inside the lobby when they tap through.
  const webTitle = 'Jackpot Royals';
  const webBody = 'A new offer is waiting in your lobby.';
  const webPayload = JSON.stringify({
    title: webTitle,
    body: webBody,
    icon: `${siteUrl}/icon-192.png`,
    badge: `${siteUrl}/icon-192.png`,
    tag: `promotion-${promotion.id}`,
    promotionId: promotion.id,
    url: `/lobby?promotion=${encodeURIComponent(promotion.id)}`
  });

  // Apple PWA (Home Screen) + Android Chrome/PWA web push — both need delivery for lock screen.
  // Native APK still gets FCM below.
  const promoWebSubscriptions = webSubscriptions.filter((record) => {
    const endpoint = String(record.endpoint || record.subscription?.endpoint || '');
    return Boolean(endpoint);
  });

  let sent = 0;
  let failed = 0;
  const expiredEndpoints = [];

  if (configureWebPush()) {
    for (let index = 0; index < promoWebSubscriptions.length; index += 100) {
      const batch = promoWebSubscriptions.slice(index, index + 100);
      const results = await Promise.allSettled(
        batch.map((record) => webpush.sendNotification(record.subscription, webPayload))
      );

      results.forEach((result, resultIndex) => {
        if (result.status === 'fulfilled') {
          sent += 1;
          return;
        }

        failed += 1;
        const statusCode = result.reason?.statusCode;
        if (statusCode === 404 || statusCode === 410) {
          expiredEndpoints.push(batch[resultIndex].endpoint);
        }
        console.error('Promotion web push delivery failed:', statusCode || result.reason?.message);
      });
    }
  }

  const messaging = getFirebaseMessaging();
  if (messaging) {
    for (let index = 0; index < nativeSubscriptions.length; index += 500) {
      const batch = nativeSubscriptions.slice(index, index + 500);
      const response = await messaging.sendEachForMulticast({
        tokens: batch.map((record) => record.nativeToken),
        notification: {
          title: promotion.title || 'Jackpot Royals',
          body: promotion.message || 'A new offer is available.',
          ...(remoteImage ? { imageUrl: remoteImage } : {})
        },
        data: {
          url: `/lobby?promotion=${encodeURIComponent(promotion.id)}`,
          promotionId: String(promotion.id)
        },
        android: {
          priority: 'high',
          notification: {
            channelId: 'jackpot_promotions',
            sound: 'default'
          }
        }
      });

      sent += response.successCount;
      failed += response.failureCount;
      response.responses.forEach((result, resultIndex) => {
        const code = result.error?.code;
        if (
          code === 'messaging/registration-token-not-registered' ||
          code === 'messaging/invalid-registration-token'
        ) {
          expiredEndpoints.push(batch[resultIndex].endpoint);
        }
      });
    }
  }

  if (expiredEndpoints.length > 0) {
    await db.collection('pushSubscriptions').deleteMany({
      endpoint: { $in: expiredEndpoints }
    });
  }

  return { sent, failed, skipped: false };
}

const STAFF_PUSH_ROLES = [
  'admin',
  'financial_admin',
  'coins_admin',
  'support_admin',
  'operation_admin'
];

function parseStaffRoles(role) {
  return String(role || '')
    .toLowerCase()
    .split(',')
    .map((r) => r.trim())
    .filter(Boolean);
}

export function getEnvSuperAdminEmails() {
  const list = [
    process.env.ADMIN_EMAIL,
    process.env.NEXT_PUBLIC_ADMIN_EMAIL
  ];
  return Array.from(
    new Set(
      list.map((e) => String(e || '').toLowerCase().trim()).filter(Boolean)
    )
  );
}

export function isEnvSuperAdminEmail(email) {
  const clean = String(email || '').toLowerCase().trim();
  if (!clean) return false;
  return getEnvSuperAdminEmails().includes(clean);
}

function staffCanReceiveAlert(roles, kind, { gameTitle, gameTitleLower, skipGameTitles, gamesById, allowedGameIds } = {}) {
  // Super / ops: every HQ alert kind
  if (roles.includes('admin') || roles.includes('operation_admin')) {
    return true;
  }

  // OR across assigned roles — multi-role staff get each role's alerts only
  if (roles.includes('financial_admin') && kind === 'game') {
    return true;
  }
  if (roles.includes('support_admin') && kind === 'support') {
    return true;
  }
  if (roles.includes('coins_admin') && kind === 'coins') {
    // Coins staff: only their allowed games when a real game title is present
    if (!gameTitleLower || skipGameTitles.has(String(gameTitle || ''))) return true;
    const allowedIds = Array.isArray(allowedGameIds) ? allowedGameIds.map(String) : [];
    if (allowedIds.length === 0) return true;
    if (!gamesById) return false;
    return allowedIds.some((id) => String(gamesById.get(id) || '').toLowerCase() === gameTitleLower);
  }
  return false;
}

/**
 * Keep only staff devices that should see this alert:
 * - role match for alertKind
 * - coins_admin additionally limited to allowedGameIds when gameTitle is set
 */
async function filterStaffSubscriptionsForAlert(db, subscriptions, { gameTitle, alertKind } = {}) {
  if (!subscriptions.length) return subscriptions;

  const kind = String(alertKind || (gameTitle ? 'game' : 'general')).toLowerCase();
  const skipGameTitles = new Set(['Lobby', 'Referral Reward', 'Distributor Payout', 'Platform Fees', '']);

  const emails = Array.from(
    new Set(
      subscriptions
        .map((s) => String(s.userEmail || '').toLowerCase().trim())
        .filter(Boolean)
    )
  );

  const users = emails.length
    ? await db
        .collection('users')
        .find(
          { email: { $in: emails }, $or: [{ distributorId: { $exists: false } }, { distributorId: '' }, { distributorId: null }] },
          { projection: { email: 1, role: 1, allowedGameIds: 1, distributorId: 1 } }
        )
        .toArray()
    : [];
  const userByEmail = new Map(
    users.map((u) => [String(u.email || '').toLowerCase().trim(), u])
  );

  // Preload game titles once for coins_admin allow-lists
  const coinsAdminsNeedingGames = users.filter((u) => {
    const roles = parseStaffRoles(u.role);
    return roles.includes('coins_admin') && !roles.includes('admin') && !roles.includes('operation_admin');
  });
  let gamesById = null;
  if (gameTitle && !skipGameTitles.has(String(gameTitle)) && coinsAdminsNeedingGames.length > 0) {
    const games = await db.collection('games').find({}, { projection: { id: 1, title: 1 } }).toArray();
    gamesById = new Map(games.map((g) => [String(g.id), g.title]));
  }

  const gameTitleLower = String(gameTitle || '').toLowerCase().trim();

  return subscriptions.filter((record) => {
    const email = String(record.userEmail || '').toLowerCase().trim();
    if (!email) return false;
    if (isEnvSuperAdminEmail(email)) return true;

    const user = userByEmail.get(email);
    if (!user) return false;
    // Distributor-office staff must never receive Jackpot Portal (HQ) pushes
    if (user.distributorId) return false;

    const roles = parseStaffRoles(user.role);
    return staffCanReceiveAlert(roles, kind, {
      gameTitle,
      gameTitleLower,
      skipGameTitles,
      gamesById,
      allowedGameIds: user.allowedGameIds
    });
  });
}

/**
 * Helper to replace raw email addresses in push notification text with the player's Full Name.
 * Ensures player email addresses are never exposed in mobile push notifications.
 */
export async function sanitizeNotificationBody(db, body) {
  if (!body || typeof body !== 'string') return body || '';

  const emailRegex = /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g;
  const matches = body.match(emailRegex);

  if (!matches || matches.length === 0) {
    return body;
  }

  let cleanBody = body;
  for (const emailStr of matches) {
    const cleanEmail = emailStr.toLowerCase().trim();
    try {
      const user = await db.collection('users').findOne(
        { email: cleanEmail },
        { projection: { name: 1, email: 1 } }
      );

      let displayName = '';
      if (user && user.name && user.name.trim() !== '' && user.name.trim() !== '-' && user.name.trim() !== '—') {
        displayName = user.name.trim();
      } else {
        displayName = cleanEmail;
      }

      cleanBody = cleanBody.replace(emailStr, displayName);
    } catch (err) {
      console.error('Error resolving player name for notification:', err);
      cleanBody = cleanBody.replace(emailStr, cleanEmail);
    }
  }

  return cleanBody;
}

/**
 * Lock-screen / native alerts for the Jackpot Portal (admin + staff) APK.
 * Only devices registered with audience: 'staff' receive these — the player APK
 * subscriptions are never touched.
 * Recipients are filtered by staff role + optional game access.
 */
export async function sendStaffPush(
  db,
  { title, body, url = '/admin', tag = 'staff-alert', gameTitle = '', alertKind = '' } = {}
) {
  try {
    const adminEmails = getEnvSuperAdminEmails();

    const allSubscriptions = await db.collection('pushSubscriptions')
      .find({
        $or: [
          { audience: 'staff' },
          { userEmail: { $in: adminEmails } }
        ]
      })
      .toArray();

    const subscriptions = await filterStaffSubscriptionsForAlert(db, allSubscriptions, {
      gameTitle,
      alertKind
    });

    if (subscriptions.length === 0) {
      return { sent: 0, failed: 0, skipped: true };
    }

    const webSubscriptions = subscriptions.filter(
      (record) => record.type !== 'native' && record.subscription
    );
    const nativeSubscriptions = subscriptions.filter(
      (record) => record.type === 'native' && record.nativeToken
    );

    const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || process.env.SITE_URL || 'https://jackpotroyals.com')
      .replace(/\/$/, '');
    const sanitizedBody = await sanitizeNotificationBody(db, body);
    const safeTitle = String(title || 'Jackpot Portal').slice(0, 80);
    const safeBody = String(sanitizedBody || 'New request waiting in the portal.').slice(0, 180);
    const safeUrl = String(url || '/admin');
    const payload = JSON.stringify({
      title: safeTitle,
      body: safeBody,
      icon: `${siteUrl}/icon-192.png`,
      badge: `${siteUrl}/icon-192.png`,
      tag,
      url: safeUrl
    });

    let sent = 0;
    let failed = 0;
    const expiredEndpoints = [];

    if (configureWebPush()) {
      for (const record of webSubscriptions) {
        try {
          await webpush.sendNotification(record.subscription, payload);
          sent += 1;
        } catch (error) {
          failed += 1;
          const statusCode = error?.statusCode;
          if (statusCode === 404 || statusCode === 410) {
            expiredEndpoints.push(record.endpoint);
          }
        }
      }
    }

    const messaging = getFirebaseMessaging();
    if (messaging && nativeSubscriptions.length > 0) {
      for (let index = 0; index < nativeSubscriptions.length; index += 500) {
        const batch = nativeSubscriptions.slice(index, index + 500);
        const response = await messaging.sendEachForMulticast({
          tokens: batch.map((record) => record.nativeToken),
          notification: {
            title: safeTitle,
            body: safeBody
          },
          data: {
            url: safeUrl,
            tag: String(tag)
          },
          android: {
            priority: 'high',
            notification: {
              channelId: 'jackpot_portal_alerts',
              sound: 'default'
            }
          }
        });

        sent += response.successCount;
        failed += response.failureCount;
        response.responses.forEach((result, resultIndex) => {
          const code = result.error?.code;
          if (
            code === 'messaging/registration-token-not-registered' ||
            code === 'messaging/invalid-registration-token'
          ) {
            expiredEndpoints.push(batch[resultIndex].endpoint);
          }
        });
      }
    }

    if (expiredEndpoints.length > 0) {
      await db.collection('pushSubscriptions').deleteMany({
        endpoint: { $in: expiredEndpoints }
      });
    }

    return { sent, failed, skipped: false };
  } catch (error) {
    console.error('Staff push error:', error);
    return { sent: 0, failed: 0, skipped: true, error: error.message };
  }
}

export function isStaffRole(role) {
  const roles = String(role || '')
    .toLowerCase()
    .split(',')
    .map((r) => r.trim())
    .filter(Boolean);
  return roles.some((r) => STAFF_PUSH_ROLES.includes(r));
}

/** Fire-and-forget helper so API handlers never block on push delivery. */
export function notifyStaffAsync(db, alert) {
  Promise.resolve()
    .then(() => sendStaffPush(db, alert))
    .catch((err) => console.error('notifyStaffAsync failed:', err));
}

function distributorStaffCanReceiveAlert(
  roles,
  kind,
  { gameTitle, gameTitleLower, skipGameTitles, gamesById, allowedGameIds } = {}
) {
  // Owner-equivalent / full-office tags
  if (
    roles.includes('admin') ||
    roles.includes('operation_admin') ||
    roles.includes('distributor') ||
    roles.includes('distributor_staff')
  ) {
    return true;
  }

  if (roles.includes('financial_admin') && kind === 'game') {
    return true;
  }
  if (roles.includes('support_admin') && kind === 'support') {
    return true;
  }
  if (roles.includes('coins_admin') && kind === 'coins') {
    if (!gameTitleLower || skipGameTitles.has(String(gameTitle || ''))) return true;
    const allowedIds = Array.isArray(allowedGameIds) ? allowedGameIds.map(String) : [];
    if (allowedIds.length === 0) return true;
    if (!gamesById) return false;
    return allowedIds.some((id) => String(gamesById.get(id) || '').toLowerCase() === gameTitleLower);
  }
  return false;
}

/**
 * Distributor APK: only staff whose role/games match the alert.
 * Owner account (role distributor / no restricted staff role) gets everything.
 */
async function filterDistributorSubscriptionsForAlert(
  db,
  subscriptions,
  { distributorId, gameTitle, alertKind } = {}
) {
  if (!subscriptions.length) return subscriptions;

  const distId = String(distributorId || '').trim();
  const kind = String(alertKind || (gameTitle ? 'game' : 'general')).toLowerCase();
  const skipGameTitles = new Set(['Lobby', 'Referral Reward', 'Distributor Payout', 'Platform Fees', '']);

  const emails = Array.from(
    new Set(
      subscriptions
        .map((s) => String(s.userEmail || '').toLowerCase().trim())
        .filter(Boolean)
    )
  );

  const users = emails.length
    ? await db
        .collection('users')
        .find(
          { email: { $in: emails }, distributorId: distId },
          { projection: { email: 1, role: 1, allowedGameIds: 1 } }
        )
        .toArray()
    : [];
  const userByEmail = new Map(
    users.map((u) => [String(u.email || '').toLowerCase().trim(), u])
  );

  // Distributor master accounts live in `distributors`, not always as staff users
  const distributorDocs = emails.length
    ? await db
        .collection('distributors')
        .find({ id: distId, email: { $in: emails } }, { projection: { email: 1 } })
        .toArray()
    : [];
  const ownerEmails = new Set(
    distributorDocs.map((d) => String(d.email || '').toLowerCase().trim()).filter(Boolean)
  );

  let gamesById = null;
  const needsGameMap =
    gameTitle &&
    !skipGameTitles.has(String(gameTitle)) &&
    users.some((u) => {
      const roles = parseStaffRoles(u.role);
      return roles.includes('coins_admin') && !roles.includes('admin') && !roles.includes('operation_admin');
    });
  if (needsGameMap) {
    const games = await db.collection('games').find({}, { projection: { id: 1, title: 1 } }).toArray();
    gamesById = new Map(games.map((g) => [String(g.id), g.title]));
  }

  const gameTitleLower = String(gameTitle || '').toLowerCase().trim();

  return subscriptions.filter((record) => {
    const email = String(record.userEmail || '').toLowerCase().trim();
    if (!email) return false;

    // Distributor owner / login email → all alerts for this office
    if (ownerEmails.has(email)) return true;

    const user = userByEmail.get(email);
    if (!user) return false;

    const roles = parseStaffRoles(user.role);
    return distributorStaffCanReceiveAlert(roles, kind, {
      gameTitle,
      gameTitleLower,
      skipGameTitles,
      gamesById,
      allowedGameIds: user.allowedGameIds
    });
  });
}

/**
 * Lock-screen alerts for the Jackpot Distributor APK.
 * Only devices registered with audience: 'distributor' and matching distributorId,
 * further filtered by that staff member's role + game access.
 */
export async function sendDistributorPush(
  db,
  {
    distributorId,
    title,
    body,
    url = '/distributor',
    tag = 'distributor-alert',
    gameTitle = '',
    alertKind = ''
  } = {}
) {
  try {
    const distId = String(distributorId || '').trim();
    if (!distId) {
      return { sent: 0, failed: 0, skipped: true };
    }

    const allSubscriptions = await db.collection('pushSubscriptions')
      .find({ audience: 'distributor', distributorId: distId })
      .toArray();

    const subscriptions = await filterDistributorSubscriptionsForAlert(db, allSubscriptions, {
      distributorId: distId,
      gameTitle,
      alertKind
    });

    if (subscriptions.length === 0) {
      return { sent: 0, failed: 0, skipped: true };
    }

    const webSubscriptions = subscriptions.filter(
      (record) => record.type !== 'native' && record.subscription
    );
    const nativeSubscriptions = subscriptions.filter(
      (record) => record.type === 'native' && record.nativeToken
    );

    const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || process.env.SITE_URL || 'https://jackpotroyals.com')
      .replace(/\/$/, '');
    const sanitizedBody = await sanitizeNotificationBody(db, body);
    const safeTitle = String(title || 'Jackpot Distributor').slice(0, 80);
    const safeBody = String(sanitizedBody || 'New request waiting in your portal.').slice(0, 180);
    const safeUrl = String(url || '/distributor');
    const payload = JSON.stringify({
      title: safeTitle,
      body: safeBody,
      icon: `${siteUrl}/icon-192.png`,
      badge: `${siteUrl}/icon-192.png`,
      tag,
      url: safeUrl
    });

    let sent = 0;
    let failed = 0;
    const expiredEndpoints = [];

    if (configureWebPush()) {
      for (const record of webSubscriptions) {
        try {
          await webpush.sendNotification(record.subscription, payload);
          sent += 1;
        } catch (error) {
          failed += 1;
          const statusCode = error?.statusCode;
          if (statusCode === 404 || statusCode === 410) {
            expiredEndpoints.push(record.endpoint);
          }
        }
      }
    }

    const messaging = getFirebaseMessaging();
    if (messaging && nativeSubscriptions.length > 0) {
      for (let index = 0; index < nativeSubscriptions.length; index += 500) {
        const batch = nativeSubscriptions.slice(index, index + 500);
        const response = await messaging.sendEachForMulticast({
          tokens: batch.map((record) => record.nativeToken),
          notification: {
            title: safeTitle,
            body: safeBody
          },
          data: {
            url: safeUrl,
            tag: String(tag)
          },
          android: {
            priority: 'high',
            notification: {
              channelId: 'jackpot_distributor_alerts',
              sound: 'default'
            }
          }
        });

        sent += response.successCount;
        failed += response.failureCount;
        response.responses.forEach((result, resultIndex) => {
          const code = result.error?.code;
          if (
            code === 'messaging/registration-token-not-registered' ||
            code === 'messaging/invalid-registration-token'
          ) {
            expiredEndpoints.push(batch[resultIndex].endpoint);
          }
        });
      }
    }

    if (expiredEndpoints.length > 0) {
      await db.collection('pushSubscriptions').deleteMany({
        endpoint: { $in: expiredEndpoints }
      });
    }

    return { sent, failed, skipped: false };
  } catch (error) {
    console.error('Distributor push error:', error);
    return { sent: 0, failed: 0, skipped: true, error: error.message };
  }
}

export function notifyDistributorAsync(db, alert) {
  Promise.resolve()
    .then(() => sendDistributorPush(db, alert))
    .catch((err) => console.error('notifyDistributorAsync failed:', err));
}

/**
 * Route ops alerts to the correct APK only:
 * - Has distributorId → Distributor APK (that office + their role-filtered staff)
 * - No distributorId → Jackpot Portal / HQ staff (role-filtered)
 * Never dual-send distributor traffic to the Portal APK.
 */
export function notifyStaffAndDistributorAsync(db, alert, distributorId) {
  const distId = String(distributorId || '').trim();
  Promise.resolve()
    .then(() => {
      if (distId) {
        const distUrl =
          alert?.distributorUrl ||
          (alert?.url ? alert.url.replace(/^\/admin/, '/distributor') : '/distributor');
        notifyDistributorAsync(db, {
          ...alert,
          distributorId: distId,
          url: distUrl,
          gameTitle: alert?.gameTitle || '',
          alertKind: alert?.alertKind || ''
        });
        return;
      }

      notifyStaffAsync(db, {
        ...alert,
        url: alert?.adminUrl || alert?.url || '/admin'
      });
    })
    .catch((err) => console.error('notifyStaffAndDistributorAsync failed:', err));
}
