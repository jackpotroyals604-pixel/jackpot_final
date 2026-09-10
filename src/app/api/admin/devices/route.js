import { NextResponse } from 'next/server';
import { getDb } from '../../../../lib/mongodb';
import { blockDevicePermanently, unlinkDeviceRecord, unblockDevice, trackDeviceSession, parseUserAgent, getRolePostTitle } from '../../../../lib/deviceBlock';

function isSuperAdminUser(adminRole, adminEmail) {
  if (adminRole === 'admin') return true;
  const clean = String(adminEmail || '').toLowerCase().trim();
  if (!clean) return false;
  const allowed = [
    (process.env.ADMIN_EMAIL || '').toLowerCase().trim(),
    (process.env.NEXT_PUBLIC_ADMIN_EMAIL || '').toLowerCase().trim(),
    'admin@jackpot.com'
  ].filter(Boolean);
  return allowed.includes(clean);
}

// GET list of active & blocked devices (Super Admin Only)
export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const adminRole = searchParams.get('adminRole') || '';
    const adminEmail = searchParams.get('adminEmail') || '';

    if (!isSuperAdminUser(adminRole, adminEmail)) {
      return NextResponse.json({ success: false, message: 'Access denied. Super Admin access required.' }, { status: 403 });
    }

    const search = searchParams.get('search') || '';
    const roleFilter = searchParams.get('role') || '';
    const statusFilter = searchParams.get('status') || '';
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '50', 10);

    const db = await getDb();
    const sessionsCollection = db.collection('deviceSessions');
    const blockedCollection = db.collection('blockedDevices');

    // 1. Automatically register/update the Super Admin's current device session
    const ip = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'Current Session';
    const userAgent = req.headers.get('user-agent') || '';
    const envAdminEmail = (process.env.ADMIN_EMAIL || process.env.NEXT_PUBLIC_ADMIN_EMAIL || 'admin@jackpot.com').toLowerCase().trim();
    const adminEmailClean = String(adminEmail || envAdminEmail).toLowerCase().trim();

    await trackDeviceSession(db, {
      email: adminEmailClean,
      name: 'Super Admin (Owner)',
      role: 'admin',
      deviceId: `super-admin-${Buffer.from(adminEmailClean).toString('hex').slice(0, 10)}`,
      userAgent,
      ip
    }).catch(() => {});

    // 2. Fetch live users and distributors to keep session roles 100% in sync with real assigned roles
    const [allUsers, allDists] = await Promise.all([
      db.collection('users').find(
        { email: { $exists: true, $ne: '' } },
        { projection: { email: 1, name: 1, role: 1, deviceId: 1, deviceFingerprint: 1, userAgent: 1, lastActive: 1, createdAt: 1 } }
      ).toArray(),
      db.collection('distributors').find(
        { email: { $exists: true, $ne: '' } },
        { projection: { email: 1, name: 1, role: 1, lastActive: 1, createdAt: 1 } }
      ).toArray()
    ]);

    const roleMap = new Map();
    const nameMap = new Map();

    allUsers.forEach((u) => {
      if (u.email) {
        const em = u.email.toLowerCase().trim();
        roleMap.set(em, u.role || 'player');
        if (u.name) nameMap.set(em, u.name);
      }
    });

    allDists.forEach((d) => {
      if (d.email) {
        const em = d.email.toLowerCase().trim();
        roleMap.set(em, d.role || 'distributor');
        if (d.name) nameMap.set(em, d.name);
      }
    });

    if (envAdminEmail) {
      roleMap.set(envAdminEmail, 'admin');
      nameMap.set(envAdminEmail, 'Super Admin (Owner)');
    }

    // 3. Sync registered users/distributors into deviceSessions if not present or role outdated
    try {
      const syncOps = [];
      for (const u of allUsers) {
        if (!u.email) continue;
        const cleanEmail = u.email.toLowerCase().trim();
        const postInfo = getRolePostTitle(u.role || 'player');
        
        const userFields = {
          name: u.name || cleanEmail.split('@')[0],
          role: u.role || 'player',
          postTitle: postInfo.title,
          postEmoji: postInfo.emoji,
          postColor: postInfo.color
        };
        if (u.deviceId) userFields.deviceId = u.deviceId;
        if (u.deviceFingerprint) userFields.deviceFingerprint = u.deviceFingerprint;

        syncOps.push(
          sessionsCollection.updateOne(
            { email: cleanEmail },
            {
              $set: userFields,
              $setOnInsert: {
                deviceId: u.deviceId || `dev-${Buffer.from(cleanEmail).toString('hex').slice(0, 14)}`,
                deviceFingerprint: u.deviceFingerprint || '',
                os: u.userAgent ? parseUserAgent(u.userAgent).os : 'Android Smartphone',
                browser: u.userAgent ? parseUserAgent(u.userAgent).browser : 'Chrome Browser',
                ip: 'Active',
                lastActive: u.lastActive ? new Date(u.lastActive) : (u.createdAt ? new Date(u.createdAt) : new Date()),
                createdAt: u.createdAt ? new Date(u.createdAt) : new Date(),
                status: 'ACTIVE'
              }
            },
            { upsert: true }
          )
        );
      }

      for (const d of allDists) {
        if (!d.email) continue;
        const cleanEmail = d.email.toLowerCase().trim();
        const postInfo = getRolePostTitle('distributor');

        syncOps.push(
          sessionsCollection.updateOne(
            { email: cleanEmail },
            {
              $set: {
                name: d.name || 'Distributor Office',
                role: 'distributor',
                postTitle: postInfo.title,
                postEmoji: postInfo.emoji,
                postColor: postInfo.color
              },
              $setOnInsert: {
                deviceId: `dist-${Buffer.from(cleanEmail).toString('hex').slice(0, 14)}`,
                deviceFingerprint: '',
                os: 'Computer / PC',
                browser: 'Chrome Browser',
                ip: 'Active',
                lastActive: d.lastActive ? new Date(d.lastActive) : (d.createdAt ? new Date(d.createdAt) : new Date()),
                createdAt: d.createdAt ? new Date(d.createdAt) : new Date(),
                status: 'ACTIVE'
              }
            },
            { upsert: true }
          )
        );
      }

      if (syncOps.length > 0) {
        Promise.all(syncOps).catch(() => {});
      }
    } catch (syncErr) {
      console.error('Device sync error:', syncErr);
    }

    // 4. Get list of permanently blocked device IDs and fingerprints
    const blockedList = await blockedCollection.find({}).toArray();
    const blockedDeviceIds = new Set(blockedList.map((b) => b.deviceId).filter(Boolean));
    const blockedFingerprints = new Set(blockedList.map((b) => b.deviceFingerprint).filter(Boolean));

    // 5. Load all device sessions sorted by lastActive
    const allSessions = await sessionsCollection.find({}).sort({ lastActive: -1 }).toArray();
    const now = new Date();
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    // 6. Enrich devices with live role, badges, and device details
    const rawDevices = allSessions.map((session) => {
      const emailKey = session.email?.toLowerCase().trim();
      const isBlocked = blockedDeviceIds.has(session.deviceId) || blockedFingerprints.has(session.deviceFingerprint);
      const uaParsed = session.userAgent ? parseUserAgent(session.userAgent, session.isApp, session.appType, session.deviceModel) : null;

      // Real live role from live database users / distributors
      const liveRole = (emailKey === envAdminEmail || emailKey === adminEmailClean)
        ? 'admin'
        : (roleMap.get(emailKey) || session.role || 'player');

      const postInfo = getRolePostTitle(liveRole);

      const deviceName = session.deviceName || uaParsed?.deviceName || (session.os?.includes('Windows') ? 'Windows PC' : (session.os?.includes('Mac') ? 'MacBook / Mac' : 'Android Smartphone'));
      const os = uaParsed?.os || session.os || 'Android';
      const isApp = session.isApp !== undefined ? Boolean(session.isApp) : (uaParsed?.isApp || false);
      const browser = session.browser || uaParsed?.browser || (isApp ? 'Jackpot Royals App (Installed)' : 'Chrome Browser');

      return {
        ...session,
        id: session._id?.toString(),
        name: nameMap.get(emailKey) || session.name || emailKey.split('@')[0],
        role: liveRole,
        rolesList: postInfo.roles,
        postTitle: postInfo.title,
        postEmoji: postInfo.emoji,
        postColor: postInfo.color,
        badges: postInfo.badges,
        deviceName,
        os,
        browser,
        isApp,
        isBlocked,
        status: isBlocked ? 'PERMANENTLY_BLOCKED' : (session.status || 'ACTIVE')
      };
    });

    // 7. Deduplicate sessions per unique device per user
    // (Prevents duplicate entries when user has both client did_ and server dev- fallback or repeated session docs)
    const deduplicatedMap = new Map();
    for (const dev of rawDevices) {
      const emailKey = String(dev.email || '').toLowerCase().trim();
      const devId = String(dev.deviceId || '').trim();
      const devName = String(dev.deviceName || dev.os || '').toLowerCase().replace(/[^a-z0-9]/g, '');
      const appKey = dev.isApp ? 'app' : 'browser';

      // Deduplication key: email + normalized device hardware + app/browser mode
      const key = `${emailKey}__${devName}__${appKey}`;

      const existing = deduplicatedMap.get(key);
      if (!existing) {
        deduplicatedMap.set(key, dev);
      } else {
        const isCurrentRealDid = devId.startsWith('did_') || devId.startsWith('fp_');
        const isExistingRealDid = String(existing.deviceId || '').startsWith('did_') || String(existing.deviceId || '').startsWith('fp_');
        
        const devDate = dev.lastActive ? new Date(dev.lastActive).getTime() : 0;
        const existingDate = existing.lastActive ? new Date(existing.lastActive).getTime() : 0;

        if ((isCurrentRealDid && !isExistingRealDid) || (isCurrentRealDid === isExistingRealDid && devDate > existingDate)) {
          deduplicatedMap.set(key, dev);
        }
      }
    }

    const devices = Array.from(deduplicatedMap.values());

    // 8. Compute Global Stats
    const stats = {
      totalDevices: devices.length,
      activeToday: devices.filter((d) => !d.isBlocked && d.lastActive && new Date(d.lastActive) >= oneDayAgo).length,
      staffDevices: devices.filter((d) => d.rolesList && !d.rolesList.includes('player') && d.rolesList.length > 0).length,
      blockedCount: blockedList.length
    };

    // 9. Apply Role Filter accurately
    let filteredDevices = devices;
    if (roleFilter) {
      const rf = roleFilter.toLowerCase().trim();
      filteredDevices = filteredDevices.filter((d) => {
        const rList = d.rolesList || [];
        const rStr = String(d.role || '').toLowerCase();

        if (rf === 'financial_admin' || rf === 'finance') {
          return rList.includes('financial_admin') || rStr.includes('financial');
        }
        if (rf === 'coins_admin' || rf === 'coins') {
          return rList.includes('coins_admin') || rStr.includes('coins');
        }
        if (rf === 'support_admin' || rf === 'support') {
          return rList.includes('support_admin') || rStr.includes('support');
        }
        if (rf === 'operation_admin' || rf === 'operation') {
          return rList.includes('operation_admin') || rStr.includes('operation');
        }
        if (rf === 'admin' || rf === 'super_admin') {
          return rList.includes('admin') || rStr.includes('admin') || d.email?.toLowerCase() === envAdminEmail || d.email?.toLowerCase() === adminEmailClean;
        }
        if (rf === 'distributor') {
          return rList.includes('distributor') || rStr.includes('distributor');
        }
        if (rf === 'distributor_staff') {
          return rList.includes('distributor_staff') || rStr.includes('distributor_staff');
        }
        if (rf === 'agent' || rf === 'affiliate') {
          return rList.includes('agent') || rStr.includes('agent') || rStr.includes('affiliate');
        }
        if (rf === 'player' || rf === 'user') {
          return rList.includes('player') && !rList.some((r) => ['admin', 'financial_admin', 'coins_admin', 'support_admin', 'operation_admin', 'distributor', 'distributor_staff', 'agent'].includes(r));
        }
        if (rf === 'staff') {
          return rList.some((r) => ['financial_admin', 'coins_admin', 'support_admin', 'distributor_staff', 'operation_admin'].includes(r));
        }
        return rList.includes(rf) || rStr.includes(rf);
      });
    }

    // 10. Apply Search Filter
    if (search.trim()) {
      const sLower = search.trim().toLowerCase();
      filteredDevices = filteredDevices.filter((d) => {
        const em = String(d.email || '').toLowerCase();
        const nm = String(d.name || '').toLowerCase();
        const pt = String(d.postTitle || '').toLowerCase();
        const ro = String(d.role || '').toLowerCase();
        const did = String(d.deviceId || '').toLowerCase();
        const ipAddr = String(d.ip || '').toLowerCase();
        const devName = String(d.deviceName || '').toLowerCase();
        const osName = String(d.os || '').toLowerCase();
        const brName = String(d.browser || '').toLowerCase();

        return (
          em.includes(sLower) ||
          nm.includes(sLower) ||
          pt.includes(sLower) ||
          ro.includes(sLower) ||
          did.includes(sLower) ||
          ipAddr.includes(sLower) ||
          devName.includes(sLower) ||
          osName.includes(sLower) ||
          brName.includes(sLower)
        );
      });
    }

    // 11. Apply Status Filter
    if (statusFilter === 'BLOCKED') {
      filteredDevices = filteredDevices.filter((d) => d.isBlocked);
    } else if (statusFilter === 'ACTIVE') {
      filteredDevices = filteredDevices.filter((d) => !d.isBlocked);
    }

    // 12. Pagination
    const totalCount = filteredDevices.length;
    const skip = (page - 1) * limit;
    const paginatedDevices = filteredDevices.slice(skip, skip + limit);

    return NextResponse.json({
      success: true,
      devices: paginatedDevices,
      totalCount,
      totalPages: Math.ceil(totalCount / limit) || 1,
      stats
    });
  } catch (err) {
    console.error('Fetch devices API error:', err);
    return NextResponse.json({ success: false, message: 'Server error: ' + err.message }, { status: 500 });
  }
}

// POST perform device operations: block, unblock, or unlink (Super Admin Only)
export async function POST(req) {
  try {
    const { action, adminRole, adminEmail, email, deviceId, deviceFingerprint, reason } = await req.json();

    if (!isSuperAdminUser(adminRole, adminEmail)) {
      return NextResponse.json({ success: false, message: 'Access denied. Super Admin access required.' }, { status: 403 });
    }

    const db = await getDb();

    // 1. Unlink / Release Device Lock
    if (action === 'unlink' || action === 'release_lock') {
      if (!email && !deviceId && !deviceFingerprint) {
        return NextResponse.json({ success: false, message: 'Email, Device ID, or Fingerprint is required to release device lock.' }, { status: 400 });
      }

      const result = await unlinkDeviceRecord(db, { email, deviceId, deviceFingerprint });
      return NextResponse.json({
        success: true,
        message: `Device lock successfully released! ${email ? `(Email: ${email})` : ''} The user can now register or log in on this device.`,
        result
      });
    }

    // 2. Unblock Device
    if (action === 'unblock') {
      if (!deviceId && !deviceFingerprint) {
        return NextResponse.json({ success: false, message: 'Device ID or Device Fingerprint is required to unblock a device.' }, { status: 400 });
      }

      const result = await unblockDevice(db, { deviceId, deviceFingerprint });
      return NextResponse.json({
        success: true,
        message: 'Device has been successfully unblocked! Normal logins are restored for this device.',
        result
      });
    }

    // 3. Default: Permanent Block
    if (!deviceId && !deviceFingerprint) {
      return NextResponse.json({ success: false, message: 'Device ID or Device Fingerprint is required to block a device.' }, { status: 400 });
    }

    const record = await blockDevicePermanently(db, {
      deviceId,
      deviceFingerprint,
      blockedBy: adminEmail || 'super_admin',
      reason: reason || 'Permanently blocked by Super Admin'
    });

    return NextResponse.json({
      success: true,
      message: 'Device has been permanently blocked from logging in across all accounts.',
      blockedRecord: record
    });
  } catch (err) {
    console.error('Device action API error:', err);
    return NextResponse.json({ success: false, message: 'Server error: ' + err.message }, { status: 500 });
  }
}

// DELETE unlink / release device binding (Super Admin Only)
export async function DELETE(req) {
  try {
    const { searchParams } = new URL(req.url);
    const adminRole = searchParams.get('adminRole') || '';
    const adminEmail = searchParams.get('adminEmail') || '';
    const email = searchParams.get('email') || '';
    const deviceId = searchParams.get('deviceId') || '';
    const deviceFingerprint = searchParams.get('deviceFingerprint') || '';

    if (!isSuperAdminUser(adminRole, adminEmail)) {
      return NextResponse.json({ success: false, message: 'Access denied. Super Admin access required.' }, { status: 403 });
    }

    if (!email && !deviceId && !deviceFingerprint) {
      return NextResponse.json({ success: false, message: 'Email, Device ID, or Fingerprint is required to unlink a device.' }, { status: 400 });
    }

    const db = await getDb();
    const result = await unlinkDeviceRecord(db, { email, deviceId, deviceFingerprint });

    return NextResponse.json({
      success: true,
      message: `Device lock released successfully! ${email ? `(Email: ${email})` : ''}`,
      result
    });
  } catch (err) {
    console.error('Delete/unlink device API error:', err);
    return NextResponse.json({ success: false, message: 'Server error: ' + err.message }, { status: 500 });
  }
}

