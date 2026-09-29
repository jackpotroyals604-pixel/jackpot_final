import { NextResponse } from 'next/server';
import { getDb } from '../../../../lib/mongodb';
import { trackDeviceSession } from '../../../../lib/deviceBlock';
import crypto from 'crypto';

// Generate a short unique alphanumeric referral code
function generateReferralCode() {
  return crypto.randomBytes(4).toString('hex').toUpperCase(); // e.g. "A3F8B12C"
}

const STAFF_ROLES = ['admin', 'super_admin', 'owner', 'financial_admin', 'coins_admin', 'support_admin', 'operation_admin', 'distributor', 'distributor_staff'];

// GET checks if an email exists and returns registration details for otp flows, or checks device status
export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const email = searchParams.get('email');
    const deviceId = searchParams.get('deviceId');
    const deviceFingerprint = searchParams.get('deviceFingerprint');
    const hardwareFingerprint = searchParams.get('hardwareFingerprint');
    const checkDeviceOnly = searchParams.get('checkDevice') === 'true';

    const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
                     req.headers.get('x-real-ip') ||
                     req.headers.get('cf-connecting-ip') ||
                     'unknown';

    const db = await getDb();
    const usersCollection = db.collection('users');

    // 1. Device Lock Pre-check
    const settingsDoc = await db.collection('settings').findOne({ id: 'global_settings' });
    const enforceDeviceLock = settingsDoc?.preventDuplicateDeviceAccounts !== false;

    if (enforceDeviceLock) {
      const cleanId = typeof deviceId === 'string' ? deviceId.trim() : '';
      const cleanFp = typeof deviceFingerprint === 'string' ? deviceFingerprint.trim() : '';
      const cleanHfp = typeof hardwareFingerprint === 'string' ? hardwareFingerprint.trim() : '';

      let existingDeviceUser = null;

      // Check direct device identifiers
      const directConditions = [];
      if (cleanId) directConditions.push({ deviceId: cleanId });
      if (cleanFp) directConditions.push({ deviceFingerprint: cleanFp });
      if (cleanHfp) directConditions.push({ hardwareFingerprint: cleanHfp });

      if (directConditions.length > 0) {
        existingDeviceUser = await usersCollection.findOne({
          role: { $nin: STAFF_ROLES },
          $or: directConditions
        });
      }

      // Check cross-browser / incognito on same physical hardware + same IP
      if (!existingDeviceUser && cleanHfp && clientIp && clientIp !== 'unknown') {
        existingDeviceUser = await usersCollection.findOne({
          role: { $nin: STAFF_ROLES },
          hardwareFingerprint: cleanHfp,
          registrationIp: clientIp
        });
      }

      // Check deviceSessions records
      if (!existingDeviceUser && (cleanId || cleanFp || cleanHfp)) {
        const sessionCond = [];
        if (cleanId) sessionCond.push({ deviceId: cleanId });
        if (cleanFp) sessionCond.push({ deviceFingerprint: cleanFp });
        if (cleanHfp) sessionCond.push({ hardwareFingerprint: cleanHfp });
        const existingSession = await db.collection('deviceSessions').findOne({
          role: { $nin: STAFF_ROLES },
          $or: sessionCond
        });
        if (existingSession?.email) {
          existingDeviceUser = await usersCollection.findOne({ email: existingSession.email.toLowerCase().trim() });
        }
      }

      if (existingDeviceUser) {
        // If checking device only or if email matches a DIFFERENT user
        if (checkDeviceOnly || !email || existingDeviceUser.email.toLowerCase() !== email.toLowerCase().trim()) {
          return NextResponse.json({
            success: true,
            exists: false,
            deviceRegistered: true,
            existingEmail: existingDeviceUser.email,
            existingName: existingDeviceUser.name || '',
            message: 'You already have an account from this device.'
          });
        }
      }
    }

    if (checkDeviceOnly) {
      return NextResponse.json({ success: true, exists: false, deviceRegistered: false });
    }

    if (!email) {
      return NextResponse.json(
        { success: false, message: 'Email query is required.' },
        { status: 400 }
      );
    }
    
    const user = await usersCollection.findOne({ email: email.toLowerCase().trim() });
    
    if (!user) {
      return NextResponse.json({ success: true, exists: false, deviceRegistered: false });
    }

    return NextResponse.json({
      success: true,
      exists: true,
      deviceRegistered: false,
      name: user.name
    });
  } catch (err) {
    console.error('Email Check API Error:', err);
    return NextResponse.json(
      { success: false, message: 'Server error checking email: ' + err.message },
      { status: 500 }
    );
  }
}

// POST registers a new user
export async function POST(req) {
  try {
    const { email, password, name, role, referredBy, distributorId, agentCode, campaign, allowedGameIds, deviceId, deviceFingerprint, hardwareFingerprint } = await req.json();

    if (!email || !password || !name) {
      return NextResponse.json(
        { success: false, message: 'Missing required registration fields.' },
        { status: 400 }
      );
    }

    const cleanEmail = email.toLowerCase().trim();
    const cleanDeviceId = typeof deviceId === 'string' ? deviceId.trim() : '';
    const cleanFingerprint = typeof deviceFingerprint === 'string' ? deviceFingerprint.trim() : '';
    const cleanHardwareFp = typeof hardwareFingerprint === 'string' ? hardwareFingerprint.trim() : '';

    const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
                     req.headers.get('x-real-ip') ||
                     req.headers.get('cf-connecting-ip') ||
                     'unknown';
    const userAgent = req.headers.get('user-agent') || '';

    const db = await getDb();
    const usersCollection = db.collection('users');

    // Check if user already exists with this email
    const existingUser = await usersCollection.findOne({ email: cleanEmail });
    if (existingUser) {
      return NextResponse.json(
        { success: false, message: 'An account with this email is already registered.' },
        { status: 400 }
      );
    }

    // Check Device Multi-Account Enforcement (Only for standard player accounts)
    const roleStr = (role || 'user').toLowerCase();
    const isPlayer = roleStr === 'user' || roleStr === 'player' || roleStr === '';

    const settingsDoc = await db.collection('settings').findOne({ id: 'global_settings' });
    const enforceDeviceLock = settingsDoc?.preventDuplicateDeviceAccounts !== false;

    if (enforceDeviceLock && isPlayer) {
      // Require device tokens — prevent automated/script bypass with empty device fields
      if (!cleanDeviceId && !cleanFingerprint && !cleanHardwareFp) {
        return NextResponse.json(
          { success: false, message: 'Device verification is required to register an account.' },
          { status: 400 }
        );
      }

      let existingDeviceAccount = null;

      // 1. Check direct device identifiers
      const directConditions = [];
      if (cleanDeviceId) directConditions.push({ deviceId: cleanDeviceId });
      if (cleanFingerprint) directConditions.push({ deviceFingerprint: cleanFingerprint });
      if (cleanHardwareFp) directConditions.push({ hardwareFingerprint: cleanHardwareFp });

      if (directConditions.length > 0) {
        existingDeviceAccount = await usersCollection.findOne({
          role: { $nin: STAFF_ROLES },
          $or: directConditions
        });
      }

      // 2. Check cross-browser / incognito on same physical hardware + same IP
      if (!existingDeviceAccount && cleanHardwareFp && clientIp && clientIp !== 'unknown') {
        existingDeviceAccount = await usersCollection.findOne({
          role: { $nin: STAFF_ROLES },
          hardwareFingerprint: cleanHardwareFp,
          registrationIp: clientIp
        });
      }

      // 3. Check active deviceSessions records
      if (!existingDeviceAccount && (cleanDeviceId || cleanFingerprint || cleanHardwareFp)) {
        const sessionCond = [];
        if (cleanDeviceId) sessionCond.push({ deviceId: cleanDeviceId });
        if (cleanFingerprint) sessionCond.push({ deviceFingerprint: cleanFingerprint });
        if (cleanHardwareFp) sessionCond.push({ hardwareFingerprint: cleanHardwareFp });
        const existingSession = await db.collection('deviceSessions').findOne({
          role: { $nin: STAFF_ROLES },
          $or: sessionCond
        });
        if (existingSession?.email) {
          existingDeviceAccount = await usersCollection.findOne({ email: existingSession.email.toLowerCase().trim() });
        }
      }

      if (existingDeviceAccount) {
        return NextResponse.json(
          { success: false, message: 'You already have an account from this device.' },
          { status: 400 }
        );
      }
    }

    // Generate a unique referral code for this new user
    let referralCode = generateReferralCode();
    while (await usersCollection.findOne({ referralCode })) {
      referralCode = generateReferralCode();
    }

    // Resolve the referrer: look up by referralCode, store their email and inherit distributorId/agentCode
    let resolvedReferrer = '';
    let inheritedDistributorId = '';
    let inheritedAgentCode = '';
    if (referredBy) {
      const referrer = await usersCollection.findOne({ referralCode: referredBy.trim() });
      if (referrer) {
        resolvedReferrer = referrer.email;
        if (referrer.distributorId) {
          inheritedDistributorId = referrer.distributorId;
        }
        if (referrer.agentCode) {
          inheritedAgentCode = referrer.agentCode;
        }
      }
    }

    const newUser = {
      name: name.trim(),
      email: cleanEmail,
      password, // Stored as-is to preserve local credentials migration compatibility
      role: role || 'user',
      coins: 100,
      referralCode,
      referredBy: resolvedReferrer,
      distributorId: distributorId || inheritedDistributorId || '',
      agentCode: agentCode || inheritedAgentCode || '',
      campaign: campaign || 'organic',
      deviceId: cleanDeviceId,
      deviceFingerprint: cleanFingerprint,
      hardwareFingerprint: cleanHardwareFp,
      registrationIp: clientIp,
      registrationUserAgent: userAgent,
      createdAt: new Date().toISOString()
    };

    if (roleStr.split(',').map((r) => r.trim()).includes('coins_admin')) {
      const { validateAllowedGameIds } = await import('../../../../lib/staffGameAccess');
      const validation = await validateAllowedGameIds(db, allowedGameIds || []);
      if (!validation.valid) {
        return NextResponse.json({ success: false, message: validation.message }, { status: 400 });
      }
      newUser.allowedGameIds = validation.allowedGameIds;
    }

    const result = await usersCollection.insertOne(newUser);
    newUser._id = result.insertedId;

    // Immediately track the new device session so multi-account locks apply on the spot
    trackDeviceSession(db, {
      email: cleanEmail,
      name: newUser.name,
      role: newUser.role,
      deviceId: cleanDeviceId,
      deviceFingerprint: cleanFingerprint,
      hardwareFingerprint: cleanHardwareFp,
      userAgent,
      ip: clientIp
    }).catch((e) => console.warn('trackDeviceSession on register:', e?.message || e));

    return NextResponse.json({
      success: true,
      message: 'Account successfully registered!',
      user: { name: newUser.name, email: newUser.email, role: newUser.role, coins: newUser.coins, referralCode: newUser.referralCode, isSubscribed: false }
    });
  } catch (err) {
    console.error('Registration API Error:', err);
    return NextResponse.json(
      { success: false, message: 'Server error during registration: ' + err.message },
      { status: 500 }
    );
  }
}

// PUT updates user's password (Forgot Password reset case)
export async function PUT(req) {
  try {
    const { email, newPassword } = await req.json();

    if (!email || !newPassword) {
      return NextResponse.json(
        { success: false, message: 'Email and new password are required.' },
        { status: 400 }
      );
    }

    const cleanEmail = email.toLowerCase().trim();
    const db = await getDb();
    const usersCollection = db.collection('users');

    const user = await usersCollection.findOne({ email: cleanEmail });
    if (!user) {
      return NextResponse.json(
        { success: false, message: 'Account not found.' },
        { status: 404 }
      );
    }

    await usersCollection.updateOne(
      { email: cleanEmail },
      { $set: { password: newPassword.trim() } }
    );

    return NextResponse.json({
      success: true,
      message: 'Password successfully updated!'
    });
  } catch (err) {
    console.error('Password Reset API Error:', err);
    return NextResponse.json(
      { success: false, message: 'Server error during password reset: ' + err.message },
      { status: 500 }
    );
  }
}
