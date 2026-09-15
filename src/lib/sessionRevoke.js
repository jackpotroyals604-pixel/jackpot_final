import { cache } from './cache';

const revokeKey = (email) => `session_revoked_${String(email || '').toLowerCase().trim()}`;

/** Env-configured super admin emails (not stored in the users collection). */
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

export function getEnvSuperAdminEmail() {
  const emails = getEnvSuperAdminEmails();
  return emails[0] || '';
}

/** True for the env super admin or the legacy hard-coded admin identity. */
export function isProtectedSuperAdminEmail(email) {
  const clean = String(email || '').toLowerCase().trim();
  if (!clean) return false;
  return getEnvSuperAdminEmails().includes(clean);
}

/** Mark an email so active localStorage sessions are forced to log out. */
export function revokeSession(email, ttlSeconds = 60 * 60 * 24 * 30) {
  const clean = String(email || '').toLowerCase().trim();
  if (!clean || isProtectedSuperAdminEmail(clean)) return;
  cache.set(revokeKey(clean), { revokedAt: Date.now() }, ttlSeconds);
}

/** Clear revoke flag so Undo restore can log in immediately. */
export function clearSessionRevoke(email) {
  const clean = String(email || '').toLowerCase().trim();
  if (!clean) return;
  cache.del(revokeKey(clean));
}

export function isSessionRevoked(email) {
  const clean = String(email || '').toLowerCase().trim();
  if (!clean || isProtectedSuperAdminEmail(clean)) return false;
  return Boolean(cache.get(revokeKey(clean)));
}

/**
 * Wipe in-game credentials + account requests so the player must Request / Create again.
 */
export async function wipePlayerGameAccess(db, email) {
  const cleanEmail = String(email || '').toLowerCase().trim();
  if (!cleanEmail) return;
  await Promise.all([
    db.collection('gameAccounts').deleteMany({ userEmail: cleanEmail }),
    db.collection('accountRequests').deleteMany({ userEmail: cleanEmail })
  ]);
}

/**
 * Collect unique game titles for a player (accounts + requests) before wipe,
 * so Super Admin Undo can re-queue HQ PENDING requests.
 */
export async function collectPlayerGameTitles(db, email) {
  const cleanEmail = String(email || '').toLowerCase().trim();
  if (!cleanEmail) return [];

  const [accounts, requests] = await Promise.all([
    db.collection('gameAccounts')
      .find({ userEmail: cleanEmail })
      .project({ gameTitle: 1 })
      .toArray(),
    db.collection('accountRequests')
      .find({
        userEmail: cleanEmail,
        status: { $nin: ['REJECTED', 'FAILED'] }
      })
      .project({ gameTitle: 1 })
      .toArray()
  ]);

  const seen = new Set();
  const titles = [];
  for (const row of [...accounts, ...requests]) {
    const title = String(row.gameTitle || '').trim();
    if (!title) continue;
    const key = title.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    titles.push(title);
  }
  return titles;
}

/**
 * Create HQ PENDING account requests (no distributor) so they show in Super Admin Requests.
 */
export async function createHqPendingAccountRequests(db, email, gameTitles = [], userName = '') {
  const cleanEmail = String(email || '').toLowerCase().trim();
  const titles = Array.isArray(gameTitles)
    ? gameTitles.map((t) => String(t || '').trim()).filter(Boolean)
    : [];
  if (!cleanEmail || titles.length === 0) return 0;

  const requestsCollection = db.collection('accountRequests');
  const now = Date.now();
  const docs = titles.map((gameTitle, idx) => ({
    id: `${now}${idx}${Math.floor(Math.random() * 1000)}`,
    gameTitle,
    userEmail: cleanEmail,
    userName: userName || '',
    status: 'PENDING',
    date: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    distributorId: '',
    distributorType: '',
    distributorName: '',
    note: 'Create new account — distributor deleted player, Super Admin Undo → HQ'
  }));

  if (docs.length > 0) {
    await requestsCollection.insertMany(docs);
  }
  return docs.length;
}

/**
 * Persist deleted user + revoke live sessions + drop push tokens.
 * Safe to call when userDoc is null (still revokes by email).
 * Never revokes the env/legacy super admin.
 *
 * @param {object} [options]
 * @param {'admin'|'distributor'|'system'} [options.deletedBy='admin']
 * @param {boolean} [options.wipeGameAccess=false] — distributor deletes wipe games so Undo → new create
 * @param {string[]} [options.restoreGameTitles] — games to re-queue for HQ on Undo
 */
export async function purgeAccountAccess(db, email, userDoc = null, options = {}) {
  const cleanEmail = String(email || '').toLowerCase().trim();
  if (!cleanEmail || isProtectedSuperAdminEmail(cleanEmail)) return;

  const deletedBy = options.deletedBy || 'admin';
  const wipeGameAccess = options.wipeGameAccess === true;
  const restoreGameTitles = Array.isArray(options.restoreGameTitles)
    ? options.restoreGameTitles
    : [];

  revokeSession(cleanEmail);

  try {
    const deletedCollection = db.collection('deletedUsers');
    await deletedCollection.createIndex({ deletedAt: 1 }, { expireAfterSeconds: 2592000 });
    if (userDoc) {
      const { _id, ...rest } = userDoc;
      await deletedCollection.updateOne(
        { email: cleanEmail },
        {
          $set: {
            ...rest,
            email: cleanEmail,
            deletedAt: new Date().toISOString(),
            deletedBy,
            wipeGameAccess,
            restoreGameTitles
          }
        },
        { upsert: true }
      );
    } else {
      await deletedCollection.updateOne(
        { email: cleanEmail },
        {
          $set: {
            email: cleanEmail,
            deletedAt: new Date().toISOString(),
            deletedBy,
            wipeGameAccess,
            restoreGameTitles
          }
        },
        { upsert: true }
      );
    }
  } catch (err) {
    console.error('purgeAccountAccess deletedUsers:', err);
  }

  if (wipeGameAccess) {
    try {
      await wipePlayerGameAccess(db, cleanEmail);
    } catch (err) {
      console.error('purgeAccountAccess wipeGameAccess:', err);
    }
  }

  try {
    await db.collection('pushSubscriptions').deleteMany({
      userEmail: cleanEmail
    });
  } catch (err) {
    console.error('purgeAccountAccess pushSubscriptions:', err);
  }
}
