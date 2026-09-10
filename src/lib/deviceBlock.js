import { getDb } from './mongodb';

/**
 * Extracts specific hardware model, smartphone brand or desktop device type.
 */
export function detectDeviceModel(uaString = '', clientModel = '') {
  if (clientModel && clientModel !== 'K' && clientModel !== 'unknown' && clientModel !== 'undefined') {
    return clientModel;
  }
  const ua = String(uaString || '');

  // iOS check
  if (/iPhone/i.test(ua)) return 'Apple iPhone';
  if (/iPad/i.test(ua)) return 'Apple iPad';
  if (/iPod/i.test(ua)) return 'Apple iPod';
  if (/Macintosh|Mac OS X/i.test(ua)) return 'Apple Mac / MacBook';
  if (/Windows NT 10\.0/i.test(ua)) return 'Windows 10/11 PC';
  if (/Windows NT/i.test(ua)) return 'Windows PC';
  if (/Linux/i.test(ua) && !/Android/i.test(ua)) return 'Linux PC';

  // Android Model Extraction
  // Look for: Linux; Android <version>; <model> (Build|;|)|AppleWebKit
  const match = ua.match(/Android\s+[\d\.]+;\s*([^;)\/]+?)(?:\s+Build|\s*;|\s*\)|\s*AppleWebKit)/i);
  let rawModel = match ? match[1].trim() : '';

  // Clean raw model
  rawModel = rawModel.replace(/Build\/.*$/i, '').replace(/[\r\n\t]/g, '').trim();

  // If model is just "K" (Chrome Android 10+ user-agent reduction placeholder) or empty
  if (!rawModel || rawModel === 'K' || rawModel === 'Mobile') {
    if (/Mobile/i.test(ua)) return 'Android Smartphone';
    if (/Tablet/i.test(ua)) return 'Android Tablet';
    return 'Android Device';
  }

  // Model brand identification and formatting
  if (/^SM-|^GT-|^SCH-|^SGH-|^SHV-|^Galaxy/i.test(rawModel)) {
    return `Samsung Galaxy (${rawModel})`;
  }
  if (/^Pixel/i.test(rawModel)) {
    return `Google ${rawModel}`;
  }
  if (/^Redmi|^POCO|^Mi\s|^220|^210|^230|^240|^M20|^M21|^2106|^2201/i.test(rawModel)) {
    return `Xiaomi / Redmi (${rawModel})`;
  }
  if (/^CPH|^RMX|^OnePlus|^NE2|^KB2|^IN2/i.test(rawModel)) {
    if (/^RMX/i.test(rawModel)) return `Realme (${rawModel})`;
    if (/^CPH/i.test(rawModel)) return `Oppo / OnePlus (${rawModel})`;
    return `OnePlus (${rawModel})`;
  }
  if (/^V2|^V1|^vivo/i.test(rawModel)) {
    return `Vivo (${rawModel})`;
  }
  if (/^moto|^XT/i.test(rawModel)) {
    return `Motorola (${rawModel})`;
  }
  if (/^Infinix|^X6/i.test(rawModel)) {
    return `Infinix (${rawModel})`;
  }
  if (/^TECNO|^KG|^BD/i.test(rawModel)) {
    return `Tecno (${rawModel})`;
  }
  if (/^HUAWEI|^HONOR|^VOG-|^ELE-/i.test(rawModel)) {
    return `Huawei / Honor (${rawModel})`;
  }
  if (/^Xperia|^SO-/i.test(rawModel)) {
    return `Sony Xperia (${rawModel})`;
  }

  return rawModel;
}

/**
 * Parses user agent string into human-friendly OS, Device Model & Browser / App details.
 */
export function parseUserAgent(uaString = '', isApp = false, appType = '', clientModel = '') {
  const ua = String(uaString || '');
  let os = 'Unknown OS';
  let browser = 'Web Browser';
  let deviceName = detectDeviceModel(ua, clientModel);
  let isInstalledApp = Boolean(isApp);

  // Check if UA indicates WebView / APK / TWA / App
  const isWebView = /;\s*wv\)|Version\/4\.0.*Chrome\/|JackpotRoyalsApp|JackpotApp|com\.jackpotroyals/i.test(ua);
  if (isWebView || isApp || appType === 'PWA_APP' || appType === 'ANDROID_APK' || appType === 'APP') {
    isInstalledApp = true;
  }

  // OS Detection
  if (/iPhone|iPad|iPod/i.test(ua)) os = 'iOS (iPhone/iPad)';
  else if (/Android/i.test(ua)) os = 'Android';
  else if (/Macintosh|Mac OS X/i.test(ua)) os = 'macOS';
  else if (/Windows/i.test(ua)) os = 'Windows';
  else if (/Linux/i.test(ua)) os = 'Linux';

  // Browser vs App Detection
  if (isInstalledApp) {
    browser = isWebView ? 'Jackpot Royals App (APK)' : 'Jackpot Royals App (Installed)';
  } else {
    if (/Edg/i.test(ua)) browser = 'Edge Browser';
    else if (/Brave/i.test(ua)) browser = 'Brave Browser';
    else if (/OPR|Opera/i.test(ua)) browser = 'Opera Browser';
    else if (/Firefox|FxiOS/i.test(ua)) browser = 'Firefox Browser';
    else if (/CriOS/i.test(ua)) browser = 'Chrome (iOS)';
    else if (/Chrome/i.test(ua) && !/Chromium|Edg/i.test(ua)) browser = 'Chrome Browser';
    else if (/Safari/i.test(ua) && !/Chrome/i.test(ua)) browser = 'Safari Browser';
    else browser = 'Web Browser';
  }

  return {
    os,
    browser,
    deviceName,
    isApp: isInstalledApp,
    appType: isInstalledApp ? 'APP' : 'BROWSER',
    raw: ua
  };
}

/**
 * Maps an individual role key to its badge metadata.
 */
export function getSingleRoleInfo(role = '') {
  const r = String(role || '').toLowerCase().trim();
  switch (r) {
    case 'admin':
    case 'super_admin':
    case 'owner':
      return { role: 'admin', title: 'Super Admin (Owner)', emoji: '👑', color: '#facc15' };
    case 'financial_admin':
    case 'financial':
    case 'finance':
      return { role: 'financial_admin', title: 'Financial Admin', emoji: '💳', color: '#38bdf8' };
    case 'coins_admin':
    case 'coins':
      return { role: 'coins_admin', title: 'Coins Staff', emoji: '🪙', color: '#a855f7' };
    case 'support_admin':
    case 'support':
      return { role: 'support_admin', title: 'Support Agent', emoji: '🎧', color: '#4ade80' };
    case 'operation_admin':
    case 'operation':
    case 'operations':
      return { role: 'operation_admin', title: 'Operations Admin', emoji: '⚙️', color: '#fb923c' };
    case 'distributor':
      return { role: 'distributor', title: 'Distributor Office', emoji: '🏢', color: '#fb923c' };
    case 'distributor_staff':
      return { role: 'distributor_staff', title: 'Distributor Staff', emoji: '👔', color: '#f472b6' };
    case 'agent':
    case 'affiliate':
    case 'affiliate_agent':
      return { role: 'agent', title: 'Affiliate Agent', emoji: '💼', color: '#818cf8' };
    default:
      return null;
  }
}

/**
 * Returns human-friendly Post / Role title and badges for single or multiple assigned roles.
 */
export function getRolePostTitle(role = '') {
  const roleStr = Array.isArray(role) ? role.join(',') : String(role || '');
  const rawParts = roleStr.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
  
  const matchedRoles = [];
  for (const part of rawParts) {
    const info = getSingleRoleInfo(part);
    if (info && !matchedRoles.some(m => m.role === info.role)) {
      matchedRoles.push(info);
    }
  }

  // If no staff/admin roles matched, return Player Account
  if (matchedRoles.length === 0) {
    return {
      title: 'Player Account',
      emoji: '🎮',
      color: '#94a3b8',
      roles: ['player'],
      badges: [{ role: 'player', title: 'Player Account', emoji: '🎮', color: '#94a3b8' }]
    };
  }

  // If super admin is present, it takes top priority
  const hasAdmin = matchedRoles.find(m => m.role === 'admin');
  const primary = hasAdmin || matchedRoles[0];

  return {
    title: matchedRoles.map(m => m.title).join(' & '),
    emoji: primary.emoji,
    color: primary.color,
    roles: matchedRoles.map(m => m.role),
    badges: matchedRoles
  };
}

/**
 * Check if a device ID or fingerprint is permanently blocked in blockedDevices collection.
 */
export async function isDeviceBlocked(db, deviceId, deviceFingerprint) {
  if (!deviceId && !deviceFingerprint) return false;

  const cleanId = typeof deviceId === 'string' ? deviceId.trim() : '';
  const cleanFp = typeof deviceFingerprint === 'string' ? deviceFingerprint.trim() : '';

  if (!cleanId && !cleanFp) return false;

  const conditions = [];
  if (cleanId) conditions.push({ deviceId: cleanId });
  if (cleanFp) conditions.push({ deviceFingerprint: cleanFp });

  const blocked = await db.collection('blockedDevices').findOne({
    $or: conditions
  });

  return Boolean(blocked);
}

/**
 * Permanently block a device ID and fingerprint. Irreversible operation.
 */
export async function blockDevicePermanently(db, { deviceId, deviceFingerprint, blockedBy, reason }) {
  const cleanId = typeof deviceId === 'string' ? deviceId.trim() : '';
  const cleanFp = typeof deviceFingerprint === 'string' ? deviceFingerprint.trim() : '';

  if (!cleanId && !cleanFp) {
    throw new Error('Device ID or Fingerprint is required to block a device.');
  }

  const record = {
    deviceId: cleanId,
    deviceFingerprint: cleanFp,
    blockedBy: blockedBy || 'super_admin',
    reason: reason || 'Permanently blocked by Super Admin',
    isPermanent: true,
    blockedAt: new Date()
  };

  await db.collection('blockedDevices').updateOne(
    { $or: [{ deviceId: cleanId }, { deviceFingerprint: cleanFp }].filter((c) => Object.values(c)[0]) },
    { $set: record },
    { upsert: true }
  );

  // Update status in deviceSessions collection
  const updateFilter = [];
  if (cleanId) updateFilter.push({ deviceId: cleanId });
  if (cleanFp) updateFilter.push({ deviceFingerprint: cleanFp });

  await db.collection('deviceSessions').updateMany(
    { $or: updateFilter },
    { $set: { status: 'PERMANENTLY_BLOCKED', blockedAt: new Date() } }
  );

  return record;
}

/**
 * Log or update an active device session in MongoDB.
 */
export async function trackDeviceSession(db, { email, name, role, deviceId, deviceFingerprint, userAgent, ip, isApp, appType, deviceModel }) {
  if (!email) return;

  const cleanEmail = email.toLowerCase().trim();
  const cleanFp = typeof deviceFingerprint === 'string' ? deviceFingerprint.trim() : '';
  let cleanId = typeof deviceId === 'string' ? deviceId.trim() : '';

  if (!cleanId) {
    if (cleanFp) {
      cleanId = `fp-${cleanFp.slice(0, 16)}`;
    } else {
      // Deterministic fallback ID based on user and user-agent
      cleanId = `dev-${Buffer.from(`${cleanEmail}:${userAgent || 'web'}`).toString('hex').slice(0, 16)}`;
    }
  }

  const uaParsed = parseUserAgent(userAgent, isApp, appType, deviceModel);
  const postInfo = getRolePostTitle(role);

  const sessionDoc = {
    email: cleanEmail,
    name: name || cleanEmail.split('@')[0],
    role: role || 'player',
    postTitle: postInfo.title,
    postEmoji: postInfo.emoji,
    postColor: postInfo.color,
    deviceId: cleanId,
    deviceFingerprint: cleanFp,
    deviceName: uaParsed.deviceName,
    os: uaParsed.os,
    browser: uaParsed.browser,
    isApp: uaParsed.isApp,
    appType: uaParsed.appType,
    userAgent: uaParsed.raw,
    ip: ip || 'Unknown',
    lastActive: new Date(),
    status: 'ACTIVE'
  };

  const lookupKey = cleanId ? { email: cleanEmail, deviceId: cleanId } : { email: cleanEmail };

  await db.collection('deviceSessions').updateOne(
    lookupKey,
    {
      $set: sessionDoc,
      $setOnInsert: { createdAt: new Date() }
    },
    { upsert: true }
  );

  // If real client fingerprint ID is present, remove old server fallback session records
  if (cleanId.startsWith('did_') || cleanId.startsWith('fp_')) {
    db.collection('deviceSessions').deleteMany({
      email: cleanEmail,
      deviceId: { $regex: '^dev-' }
    }).catch(() => {});
  }
}

/**
 * Unlinks / clears device binding from user(s) and sessions in MongoDB.
 * Frees the device so new accounts can be registered from it without triggering the duplicate account error.
 */
export async function unlinkDeviceRecord(db, { email, deviceId, deviceFingerprint }) {
  const cleanEmail = email ? String(email).toLowerCase().trim() : '';
  const cleanId = deviceId ? String(deviceId).trim() : '';
  const cleanFp = deviceFingerprint ? String(deviceFingerprint).trim() : '';

  if (!cleanEmail && !cleanId && !cleanFp) {
    throw new Error('Email, Device ID, or Fingerprint is required to unlink a device.');
  }

  // If email is provided, fetch user first to capture their deviceId and deviceFingerprint
  let targetUser = null;
  if (cleanEmail) {
    targetUser = await db.collection('users').findOne({ email: cleanEmail });
  }

  const effectiveDeviceId = cleanId || (targetUser?.deviceId ? String(targetUser.deviceId).trim() : '');
  const effectiveFingerprint = cleanFp || (targetUser?.deviceFingerprint ? String(targetUser.deviceFingerprint).trim() : '');

  const userConditions = [];
  if (cleanEmail) userConditions.push({ email: cleanEmail });
  if (effectiveDeviceId) userConditions.push({ deviceId: effectiveDeviceId });
  if (effectiveFingerprint) userConditions.push({ deviceFingerprint: effectiveFingerprint });

  // 1. Unset deviceId & deviceFingerprint in users collection
  const usersResult = await db.collection('users').updateMany(
    { $or: userConditions },
    {
      $unset: {
        deviceId: '',
        deviceFingerprint: '',
        registrationIp: '',
        registrationUserAgent: ''
      }
    }
  );

  // 2. Remove from deviceSessions collection
  const sessionConditions = [];
  if (cleanEmail) sessionConditions.push({ email: cleanEmail });
  if (effectiveDeviceId) sessionConditions.push({ deviceId: effectiveDeviceId });
  if (effectiveFingerprint) sessionConditions.push({ deviceFingerprint: effectiveFingerprint });

  const sessionResult = await db.collection('deviceSessions').deleteMany({
    $or: sessionConditions
  });

  // 3. Also remove from blockedDevices if present
  if (effectiveDeviceId || effectiveFingerprint) {
    const blockConditions = [];
    if (effectiveDeviceId) blockConditions.push({ deviceId: effectiveDeviceId });
    if (effectiveFingerprint) blockConditions.push({ deviceFingerprint: effectiveFingerprint });
    await db.collection('blockedDevices').deleteMany({
      $or: blockConditions
    });
  }

  return {
    success: true,
    matchedUsers: usersResult.matchedCount,
    modifiedUsers: usersResult.modifiedCount,
    deletedSessions: sessionResult.deletedCount,
    unlinkedEmail: cleanEmail,
    effectiveDeviceId,
    effectiveFingerprint
  };
}

/**
 * Unblocks a permanently blocked device.
 */
export async function unblockDevice(db, { deviceId, deviceFingerprint }) {
  const cleanId = deviceId ? String(deviceId).trim() : '';
  const cleanFp = deviceFingerprint ? String(deviceFingerprint).trim() : '';

  if (!cleanId && !cleanFp) {
    throw new Error('Device ID or Fingerprint is required to unblock a device.');
  }

  const conditions = [];
  if (cleanId) conditions.push({ deviceId: cleanId });
  if (cleanFp) conditions.push({ deviceFingerprint: cleanFp });

  const deleteResult = await db.collection('blockedDevices').deleteMany({
    $or: conditions
  });

  await db.collection('deviceSessions').updateMany(
    { $or: conditions },
    { $set: { status: 'ACTIVE' }, $unset: { blockedAt: '' } }
  );

  return {
    success: true,
    unblockedCount: deleteResult.deletedCount
  };
}

