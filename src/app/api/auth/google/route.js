import { NextResponse } from 'next/server';
import { getDb } from '../../../../lib/mongodb';
import { healOrphanedDistributorPlayer } from '../../../../lib/orphanDistributorPlayer';
import { trackDeviceSession } from '../../../../lib/deviceBlock';
import crypto from 'crypto';

function generateReferralCode() {
  return crypto.randomBytes(4).toString('hex').toUpperCase();
}

const STAFF_ROLES = ['admin', 'super_admin', 'owner', 'financial_admin', 'coins_admin', 'support_admin', 'operation_admin', 'distributor', 'distributor_staff'];

export async function POST(req) {
  try {
    const { email, name, referredBy, distributorId, agentCode, campaign, deviceId, deviceFingerprint, hardwareFingerprint } = await req.json();

    if (!email || !name) {
      return NextResponse.json(
        { success: false, message: 'Google account details missing.' },
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

    let matchedUser = await usersCollection.findOne({ email: cleanEmail });
    let isNewUser = false;

    if (matchedUser && matchedUser.status === 'SUSPENDED') {
      return NextResponse.json(
        { success: false, message: 'Your account has been suspended. Please contact customer support.' },
        { status: 403 }
      );
    }

    if (!matchedUser) {
      // Check Device Multi-Account Enforcement for NEW Google registrations
      const settingsDoc = await db.collection('settings').findOne({ id: 'global_settings' });
      const enforceDeviceLock = settingsDoc?.preventDuplicateDeviceAccounts !== false;

      if (enforceDeviceLock) {
        let existingDeviceAccount = null;

        // 1. Direct device identifiers match
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

        // 2. Cross-browser / incognito match: Same Hardware Fingerprint + Same Registration IP
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
            {
              success: false,
              deviceRegistered: true,
              existingEmail: existingDeviceAccount.email,
              existingName: existingDeviceAccount.name || '',
              message: 'You already have an account from this device.'
            },
            { status: 400 }
          );
        }
      }

      // Generate a unique referral code
      let referralCode = generateReferralCode();
      while (await usersCollection.findOne({ referralCode })) {
        referralCode = generateReferralCode();
      }

      // Resolve the referrer by referralCode and inherit distributorId/agentCode
      let resolvedReferrer = '';
      let inheritedDistributorId = '';
      let inheritedAgentCode = '';
      if (referredBy && referredBy !== 'null' && referredBy !== 'undefined') {
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

      // Automatically register brand-new Google users
      matchedUser = {
        name: name.trim(),
        email: cleanEmail,
        password: 'OAuth-Google-Login',
        role: 'user',
        coins: 100,
        referralCode,
        referredBy: resolvedReferrer,
        distributorId: (distributorId && distributorId !== 'null' && distributorId !== 'undefined') ? distributorId : (inheritedDistributorId || ''),
        agentCode: (agentCode && agentCode !== 'null' && agentCode !== 'undefined') ? agentCode : (inheritedAgentCode || ''),
        campaign: campaign || 'organic',
        deviceId: cleanDeviceId,
        deviceFingerprint: cleanFingerprint,
        hardwareFingerprint: cleanHardwareFp,
        registrationIp: clientIp,
        registrationUserAgent: userAgent,
        createdAt: new Date().toISOString()
      };
      const result = await usersCollection.insertOne(matchedUser);
      matchedUser._id = result.insertedId;
      isNewUser = true;

      trackDeviceSession(db, {
        email: cleanEmail,
        name: matchedUser.name,
        role: matchedUser.role,
        deviceId: cleanDeviceId,
        deviceFingerprint: cleanFingerprint,
        hardwareFingerprint: cleanHardwareFp,
        userAgent,
        ip: clientIp
      }).catch((e) => console.warn('trackDeviceSession on google register:', e?.message || e));
    } else {
      // Existing user logging in: update deviceId if empty
      const updateFields = {};
      if (cleanDeviceId && !matchedUser.deviceId) updateFields.deviceId = cleanDeviceId;
      if (cleanFingerprint && !matchedUser.deviceFingerprint) updateFields.deviceFingerprint = cleanFingerprint;
      if (cleanHardwareFp && !matchedUser.hardwareFingerprint) updateFields.hardwareFingerprint = cleanHardwareFp;

      if (Object.keys(updateFields).length > 0) {
        await usersCollection.updateOne(
          { _id: matchedUser._id },
          { $set: updateFields }
        );
      }
    }

    // Deleted distributor → player stays, but game accounts reset so they can re-request.
    if (!isNewUser) {
      matchedUser = await healOrphanedDistributorPlayer(db, matchedUser);
    }

    return NextResponse.json({
      success: true,
      message: isNewUser ? 'Google account registered successfully!' : 'Welcome back!',
      isNewUser,
      user: { name: matchedUser.name, email: matchedUser.email, role: matchedUser.role, coins: matchedUser.coins || 100, referralCode: matchedUser.referralCode || '', isSubscribed: matchedUser.isSubscribed || false }
    });
  } catch (err) {
    console.error('Google OAuth API Error:', err);
    return NextResponse.json(
      { success: false, message: 'Server error during Google authentication: ' + err.message },
      { status: 500 }
    );
  }
}
