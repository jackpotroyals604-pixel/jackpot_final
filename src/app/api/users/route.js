import { NextResponse } from 'next/server';
import { getDb } from '../../../lib/mongodb';
import { cache } from '../../../lib/cache';
import { isCoinsAdminRole, parseRoles } from '../../../lib/staffGameAccess';
import { getTypeBDistributorIds } from '../../../lib/typeBDistributors';
import { purgeAccountAccess, isProtectedSuperAdminEmail } from '../../../lib/sessionRevoke';

// GET users (Admin listing, or referrals query)
export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const referredBy = searchParams.get('referredBy');
    const search = searchParams.get('search') || '';
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '25', 10);

    const db = await getDb();
    const usersCollection = db.collection('users');

    if (referredBy) {
      // referredBy parameter is the referrer's email — find users referred by that email
      // Safe referral query returning only name and email for referrer stats
      const referrals = await usersCollection.find(
        { referredBy: referredBy.toLowerCase().trim() },
        { projection: { name: 1, email: 1 } }
      ).toArray();
      return NextResponse.json({ success: true, referrals });
    }

    // Require staff/admin authorization for full user listings to prevent public data leaks
    const adminEmail = (searchParams.get('adminEmail') || '').toLowerCase().trim();
    const adminDistributorId = searchParams.get('adminDistributorId');
    const adminRole = (searchParams.get('adminRole') || '').toLowerCase().trim();

    let isAuthorized = false;

    if (adminEmail) {
      if (isProtectedSuperAdminEmail(adminEmail)) {
        isAuthorized = true;
      } else {
        const staffUser = await usersCollection.findOne(
          { email: adminEmail },
          { projection: { role: 1, status: 1 } }
        );
        if (staffUser && String(staffUser.status || '').toUpperCase() !== 'SUSPENDED') {
          const roles = parseRoles(staffUser.role);
          if (roles.some((r) => ['admin', 'operation_admin', 'coins_admin', 'financial_admin', 'support_admin', 'manager', 'staff', 'distributor'].includes(r))) {
            isAuthorized = true;
          }
        }
        if (!isAuthorized) {
          const distDoc = await db.collection('distributors').findOne(
            { email: adminEmail },
            { projection: { status: 1 } }
          );
          if (distDoc && String(distDoc.status || '').toUpperCase() !== 'SUSPENDED') {
            isAuthorized = true;
          }
        }
      }
    } else if (adminDistributorId) {
      const distDoc = await db.collection('distributors').findOne(
        { id: adminDistributorId },
        { projection: { status: 1 } }
      );
      if (distDoc && String(distDoc.status || '').toUpperCase() !== 'SUSPENDED') {
        isAuthorized = true;
      }
    } else if (adminRole && ['admin', 'operation_admin', 'coins_admin', 'financial_admin', 'support_admin', 'manager', 'staff'].includes(adminRole)) {
      isAuthorized = true;
    }

    if (!isAuthorized) {
      return NextResponse.json(
        { success: false, message: 'Unauthorized. Staff or Admin authentication is required to access user list.' },
        { status: 401 }
      );
    }

    const segment = searchParams.get('segment');

    // Prepare search query
    let query = {};

    // The super-admin Player Accounts tab passes this to also surface Type B
    // distributor players (so they can be seen/kept even if the distributor is
    // later deleted). Other callers (promo targeting, etc.) omit it and keep the
    // original Type B exclusion, so nothing else changes.
    const includeDistributorPlayers = searchParams.get('includeDistributorPlayers') === '1';

    if (adminDistributorId) {
      query.distributorId = adminDistributorId;
      query.role = 'user';
    } else if (segment !== 'staff' && !includeDistributorPlayers) {
      const typeBDistIds = await getTypeBDistributorIds(db);
      if (typeBDistIds.length > 0) {
        query.$or = [
          { distributorId: { $nin: typeBDistIds } },
          { distributorId: { $in: typeBDistIds }, role: { $ne: 'user' } }
        ];
      }
    }
    if (segment === 'subscribed') {
      query.isSubscribed = true;
    } else if (segment === 'unsubscribed') {
      query.isSubscribed = { $ne: true };
    } else if (segment === 'staff') {
      query.role = { $nin: ['user', '', null] };
    } else if (segment === 'active') {
      const activeEmails = await db.collection('transactions').distinct('userEmail', {
        type: 'DEPOSIT',
        status: 'SUCCESS'
      });
      query.email = { $in: activeEmails.map((e) => e.toLowerCase().trim()) };
    }

    if (search) {
      const cleanSearch = search.trim();
      const searchCriteria = {
        $or: [
          { name: { $regex: cleanSearch, $options: 'i' } },
          { email: { $regex: cleanSearch, $options: 'i' } }
        ]
      };
      if (Object.keys(query).length > 0) {
        query = { $and: [query, searchCriteria] };
      } else {
        query = searchCriteria;
      }
    }

    const totalUsers = await usersCollection.countDocuments(query);
    const skip = (page - 1) * limit;

    // Fetch paginated users (excluding password fields for security)
    const users = await usersCollection.find(query, { projection: { password: 0 } })
      .sort({ name: 1 })
      .skip(skip)
      .limit(limit)
      .toArray();

    return NextResponse.json({
      success: true,
      users,
      totalUsers,
      totalPages: Math.ceil(totalUsers / limit),
      currentPage: page
    });
  } catch (err) {
    console.error('Fetch Users API Error:', err);
    return NextResponse.json({ success: false, message: 'Server error: ' + err.message }, { status: 500 });
  }
}

// PUT update user details (Admin adjustment of coins, role modifications, or device unlinking)
export async function PUT(req) {
  try {
    const { email, coins, role, name, password, status, allowedGameIds, unlinkDevice } = await req.json();

    if (!email) {
      return NextResponse.json({ success: false, message: 'User email is required.' }, { status: 400 });
    }

    const cleanEmail = email.toLowerCase().trim();
    const db = await getDb();
    const usersCollection = db.collection('users');

    const currentUser = await usersCollection.findOne({ email: cleanEmail });
    if (!currentUser) {
      return NextResponse.json({ success: false, message: 'User not found.' }, { status: 404 });
    }

    const updateFields = {};
    const unsetFields = {};
    let balanceChanged = false;
    const oldBalance = parseFloat(currentUser.coins || 0);
    let newBalance = oldBalance;

    if (coins !== undefined) {
      newBalance = parseFloat(coins);
      updateFields.coins = newBalance;
      balanceChanged = (newBalance !== oldBalance);
    }
    if (role !== undefined) {
      updateFields.role = role;
    }
    if (name !== undefined) {
      updateFields.name = name;
    }
    if (password !== undefined) {
      updateFields.password = password;
    }
    if (status !== undefined) {
      updateFields.status = status;
    }
    if (unlinkDevice) {
      unsetFields.deviceId = '';
      unsetFields.deviceFingerprint = '';
      unsetFields.registrationIp = '';
      unsetFields.registrationUserAgent = '';
      
      // Also delete sessions
      await db.collection('deviceSessions').deleteMany({ email: cleanEmail }).catch(() => {});
    }
    if (allowedGameIds !== undefined) {
      const roleToCheck = role !== undefined ? role : currentUser.role;
      if (isCoinsAdminRole(roleToCheck)) {
        const { validateAllowedGameIds } = await import('../../../lib/staffGameAccess');
        const validation = await validateAllowedGameIds(db, allowedGameIds, currentUser.distributorId || '');
        if (!validation.valid) {
          return NextResponse.json({ success: false, message: validation.message }, { status: 400 });
        }
        updateFields.allowedGameIds = validation.allowedGameIds;
      } else {
        updateFields.allowedGameIds = [];
      }
    }

    const updateDoc = {};
    if (Object.keys(updateFields).length > 0) {
      updateDoc.$set = updateFields;
    }
    if (Object.keys(unsetFields).length > 0) {
      updateDoc.$unset = unsetFields;
    }

    if (Object.keys(updateDoc).length > 0) {
      await usersCollection.updateOne(
        { email: cleanEmail },
        updateDoc
      );
    }

    if (balanceChanged) {
      const diff = newBalance - oldBalance;
      const amountVal = Math.abs(diff);
      const diffText = diff > 0 ? `Credit of $${amountVal.toFixed(2)}` : `Debit of $${amountVal.toFixed(2)}`;
      
      const transactionsCollection = db.collection('transactions');
      const auditTx = {
        id: (Date.now() + Math.floor(Math.random() * 100)).toString(),
        userEmail: cleanEmail,
        date: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        status: 'SUCCESS',
        type: 'BONUS',
        amount: amountVal,
        gateway: 'Admin Adjustment',
        gameTitle: 'Lobby',
        note: `Admin adjusted balance: ${diffText} (Previous: $${oldBalance.toFixed(2)}, New: $${newBalance.toFixed(2)})`
      };
      await transactionsCollection.insertOne(auditTx);
    }

    // Invalidate stats and staff game caches
    cache.del('admin_stats');
    cache.del('staff_games');
    cache.del(`staff_games_${cleanEmail}`);

    return NextResponse.json({ success: true, message: 'User details updated successfully!' });
  } catch (err) {
    console.error('Update User API Error:', err);
    return NextResponse.json({ success: false, message: 'Server error: ' + err.message }, { status: 500 });
  }
}

// DELETE a user account (Admin action) — also force-logs out any live session
export async function DELETE(req) {
  try {
    const { searchParams } = new URL(req.url);
    const email = searchParams.get('email');

    if (!email) {
      return NextResponse.json({ success: false, message: 'User email parameter is required.' }, { status: 400 });
    }

    const db = await getDb();
    const usersCollection = db.collection('users');
    const cleanEmail = email.toLowerCase().trim();

    const userDoc = await usersCollection.findOne({ email: cleanEmail });
    if (userDoc) {
      await usersCollection.deleteOne({ email: cleanEmail });
    }

    // HQ/admin delete: keep gameAccounts so Undo restores the player's previous games.
    // (Distributor-panel deletes wipe games separately — see distributors/players DELETE.)
    await purgeAccountAccess(db, cleanEmail, userDoc, {
      deletedBy: 'admin',
      wipeGameAccess: false
    });

    cache.del('admin_stats');

    return NextResponse.json({ success: true, message: 'User account deleted successfully.' });
  } catch (err) {
    console.error('Delete User API Error:', err);
    return NextResponse.json({ success: false, message: 'Server error: ' + err.message }, { status: 500 });
  }
}

