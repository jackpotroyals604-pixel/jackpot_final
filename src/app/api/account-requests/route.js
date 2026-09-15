import { NextResponse } from 'next/server';
import { getDb } from '../../../lib/mongodb';
import { cache } from '../../../lib/cache';
import { applyStaffGameFilter, getStaffAllowedGameTitles, staffCanAccessGame } from '../../../lib/staffGameAccess';
import { notifyStaffAndDistributorAsync } from '../../../lib/pushNotifications';
import { publishAdminEvent } from '../../../lib/adminEvents';
import { getTypeBDistributorIds, typeBExclusionFilter } from '../../../lib/typeBDistributors';
import { healOrphanedDistributorPlayer } from '../../../lib/orphanDistributorPlayer';

// GET requests (supports filtering by email for users, or returning all for admins)
export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const email = searchParams.get('email');
    const status = searchParams.get('status');
    const search = searchParams.get('search') || '';
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '25', 10);

    const db = await getDb();
    const requestsCollection = db.collection('accountRequests');

    const adminRole = searchParams.get('adminRole');
    const adminDistributorId = searchParams.get('adminDistributorId');
    const adminEmail = searchParams.get('adminEmail');

    // 1. FAST PATH: No Search Active
    // Show PENDING requests on top + all created game accounts (READY), including
    // accounts added manually that may not have an accountRequests row.
    if (!search) {
      const statuses = status
        ? status.split(',').map((s) => s.toUpperCase().trim()).filter(Boolean)
        : [];
      const wantPending = statuses.length === 0 || statuses.includes('PENDING');
      const wantReady = statuses.length === 0 || statuses.includes('READY');

      let query = {};
      if (email) {
        query.userEmail = email.toLowerCase().trim();
      }

      // Player self-view (?email=) must see their own requests even under Type B distributors.
      // Type B exclusion only applies to global admin list views (no email, no adminDistributorId).
      let typeBDistIds = [];
      if (adminDistributorId) {
        query.distributorId = adminDistributorId;
      } else if (!email) {
        const exclusion = await typeBExclusionFilter(db);
        typeBDistIds = await getTypeBDistributorIds(db);
        Object.assign(query, exclusion);
      }

      let requestQuery = { ...query };
      if (statuses.length === 1) {
        requestQuery.status = statuses[0];
      } else if (statuses.length > 1) {
        requestQuery.status = { $in: statuses };
      }

      if (adminEmail) {
        requestQuery = await applyStaffGameFilter(db, requestQuery, adminEmail);
      }

      // Fast path for Shift Dashboard: PENDING-only — limit in Mongo, skip heavy READY synthetics
      const pendingOnlyFastPath = wantPending && !wantReady && statuses.length === 1 && statuses[0] === 'PENDING';

      const requestListProjection = {
        id: 1,
        gameTitle: 1,
        userEmail: 1,
        status: 1,
        date: 1,
        createdAt: 1,
        distributorId: 1,
        distributorType: 1,
        distributorName: 1,
        gameAccountUsername: 1,
        userName: 1
      };

      let accountQuery = {};
      if (email) {
        accountQuery.userEmail = email.toLowerCase().trim();
      }

      // Parallel: requests + gameAccounts (READY synthetics) — same data, less wait
      const fetchLimit = Math.min(Math.max(limit * 3, 50), 150);
      const [realRequestsRaw, accountsRaw] = await Promise.all([
        pendingOnlyFastPath
          ? requestsCollection
              .find(requestQuery)
              .project(requestListProjection)
              .sort({ createdAt: -1, id: -1 })
              .limit(fetchLimit)
              .toArray()
          : requestsCollection.find(requestQuery).project(requestListProjection).toArray(),
        wantReady
          ? db.collection('gameAccounts').find(accountQuery).project({
              _id: 1,
              id: 1,
              userEmail: 1,
              gameTitle: 1,
              username: 1,
              createdAt: 1
            }).toArray()
          : Promise.resolve([])
      ]);

      // Collapse multi-tap PENDING duplicates (same player + same game) — keep newest
      const pendingDupIds = [];
      const seenPendingKeys = new Set();
      const realRequests = [...realRequestsRaw]
        .sort((a, b) => String(b.id || '').localeCompare(String(a.id || '')))
        .filter((r) => {
          if (String(r.status || '').toUpperCase() !== 'PENDING') return true;
          const key = `${String(r.userEmail || '').toLowerCase().trim()}||${String(r.gameTitle || '').toLowerCase().trim()}`;
          if (seenPendingKeys.has(key)) {
            if (r.id) pendingDupIds.push(r.id);
            return false;
          }
          seenPendingKeys.add(key);
          return true;
        });

      if (pendingDupIds.length > 0 && !pendingOnlyFastPath) {
        await requestsCollection.updateMany(
          { id: { $in: pendingDupIds } },
          {
            $set: {
              status: 'REJECTED',
              rejectionReason: 'Duplicate request (auto-closed)',
              processedBy: 'system'
            }
          }
        );
        cache.del('admin_stats');
      } else if (pendingDupIds.length > 0) {
        // Don't block Shift Dashboard polls — close duplicates in background
        Promise.resolve().then(() =>
          requestsCollection.updateMany(
            { id: { $in: pendingDupIds } },
            {
              $set: {
                status: 'REJECTED',
                rejectionReason: 'Duplicate request (auto-closed)',
                processedBy: 'system'
              }
            }
          ).catch(() => {})
        );
      }

      // Build synthetic READY rows from gameAccounts when READY is requested
      let syntheticFromAccounts = [];
      if (wantReady) {
        let accounts = accountsRaw;

        // Restrict by distributor / Type B same as requests
        if (accounts.length > 0) {
          const accEmails = Array.from(new Set(accounts.map(a => (a.userEmail || '').toLowerCase().trim()).filter(Boolean)));
          const usersForAcc = await db.collection('users').find({ email: { $in: accEmails } }).project({ email: 1, distributorId: 1 }).toArray();
          const distByEmail = {};
          usersForAcc.forEach((u) => {
            if (u.email) distByEmail[u.email.toLowerCase().trim()] = u.distributorId || '';
          });

          accounts = accounts.filter((acc) => {
            const emailKey = (acc.userEmail || '').toLowerCase().trim();
            const userDistId = distByEmail[emailKey] || '';
            if (adminDistributorId) return userDistId === adminDistributorId;
            if (!email && typeBDistIds.length > 0) return !typeBDistIds.includes(userDistId);
            return true;
          });
        }

        // Staff game filter
        if (adminEmail && accounts.length > 0) {
          const allowedTitles = await getStaffAllowedGameTitles(db, adminEmail);
          if (allowedTitles) {
            const allowedSet = new Set(allowedTitles.map((t) => t.toLowerCase()));
            accounts = accounts.filter((acc) => allowedSet.has(String(acc.gameTitle || '').toLowerCase()));
          }
        }

        // Skip accounts already represented by a real READY/PENDING request for same email+game
        const covered = new Set(
          realRequests.map((r) => {
            const e = (r.userEmail || '').toLowerCase().trim();
            const g = String(r.gameTitle || '').toLowerCase().trim();
            return `${e}||${g}`;
          })
        );

        syntheticFromAccounts = accounts
          .filter((acc) => {
            const e = (acc.userEmail || '').toLowerCase().trim();
            const g = String(acc.gameTitle || '').toLowerCase().trim();
            return e && g && !covered.has(`${e}||${g}`);
          })
          .map((acc) => ({
            id: `account-${acc._id || acc.id || `${acc.userEmail}-${acc.gameTitle}`}`,
            gameTitle: acc.gameTitle,
            userEmail: (acc.userEmail || '').toLowerCase().trim(),
            status: 'READY',
            date: acc.createdAt || '',
            createdAt: acc.createdAt || new Date(0).toISOString(),
            gameAccountUsername: acc.username || '',
            isSynthetic: true,
            fromGameAccount: true
          }));
      }

      // If only PENDING was requested, drop synthetics (wantReady false already skips them)
      const combined = [
        ...(wantPending || wantReady ? realRequests : []),
        ...syntheticFromAccounts
      ];

      combined.sort((a, b) => {
        if (a.status === 'PENDING' && b.status !== 'PENDING') return -1;
        if (a.status !== 'PENDING' && b.status === 'PENDING') return 1;
        const idA = typeof a.id === 'number' ? a.id : 0;
        const idB = typeof b.id === 'number' ? b.id : 0;
        if (idA || idB) return idB - idA;
        const dateA = a.createdAt || a.date || '';
        const dateB = b.createdAt || b.date || '';
        return String(dateB).localeCompare(String(dateA));
      });

      const totalRequests = combined.length;
      const skip = (page - 1) * limit;
      const requests = combined.slice(skip, skip + limit);

      let enrichedRequests = [];
      if (requests.length > 0) {
        const uniqueEmails = Array.from(new Set(requests.map(r => r.userEmail.toLowerCase().trim())));

        if (pendingOnlyFastPath) {
          // Shift dashboard only needs player names — skip loading all gameAccounts
          const userDocs = await db.collection('users')
            .find({ email: { $in: uniqueEmails } })
            .project({ email: 1, name: 1 })
            .toArray();
          const nameByEmail = {};
          userDocs.forEach((u) => {
            if (u.email) nameByEmail[u.email.toLowerCase().trim()] = u.name || '';
          });
          enrichedRequests = requests.map((r) => {
            const emailKey = r.userEmail.toLowerCase().trim();
            return {
              ...r,
              userName: nameByEmail[emailKey] || r.userName || '',
              existingAccounts: []
            };
          });
        } else {
          const [gameAccounts, userDocs] = await Promise.all([
            db.collection('gameAccounts').find({ userEmail: { $in: uniqueEmails } }).toArray(),
            db.collection('users').find({ email: { $in: uniqueEmails } }).project({ email: 1, name: 1 }).toArray()
          ]);

          const accountsByEmail = {};
          gameAccounts.forEach(acc => {
            const emailKey = acc.userEmail.toLowerCase().trim();
            if (!accountsByEmail[emailKey]) {
              accountsByEmail[emailKey] = [];
            }
            accountsByEmail[emailKey].push({
              gameTitle: acc.gameTitle,
              username: acc.username,
              status: acc.status || 'READY'
            });
          });

          const nameByEmail = {};
          userDocs.forEach((u) => {
            if (u.email) nameByEmail[u.email.toLowerCase().trim()] = u.name || '';
          });

          enrichedRequests = requests.map(r => {
            const emailKey = r.userEmail.toLowerCase().trim();
            return {
              ...r,
              userName: nameByEmail[emailKey] || r.userName || '',
              existingAccounts: accountsByEmail[emailKey] || []
            };
          });
        }
      }

      return NextResponse.json({
        success: true,
        accountRequests: enrichedRequests,
        totalRequests,
        totalPages: Math.ceil(totalRequests / limit) || 1,
        currentPage: page
      });
    }

    // 2. SEARCH PATH: Deep Search across Users, gameAccounts and accountRequests
    const cleanSearch = search.trim();

    // Query matched users
    const matchedUsers = await db.collection('users').find({
      $or: [
        { email: { $regex: cleanSearch, $options: 'i' } },
        { name: { $regex: cleanSearch, $options: 'i' } }
      ]
    }).project({ email: 1, distributorId: 1 }).toArray();

    // Query matched game accounts
    const matchedAccounts = await db.collection('gameAccounts').find({
      $or: [
        { username: { $regex: cleanSearch, $options: 'i' } },
        { userEmail: { $regex: cleanSearch, $options: 'i' } },
        { gameTitle: { $regex: cleanSearch, $options: 'i' } }
      ]
    }).toArray();

    // Query matched requests
    const matchedRequests = await requestsCollection.find({
      $or: [
        { userEmail: { $regex: cleanSearch, $options: 'i' } },
        { gameTitle: { $regex: cleanSearch, $options: 'i' } }
      ]
    }).toArray();

    // Gather unique emails
    const uniqueEmails = new Set();
    matchedUsers.forEach(u => {
      if (u.email) uniqueEmails.add(u.email.toLowerCase().trim());
    });
    matchedAccounts.forEach(acc => {
      if (acc.userEmail) uniqueEmails.add(acc.userEmail.toLowerCase().trim());
    });
    matchedRequests.forEach(req => {
      if (req.userEmail) uniqueEmails.add(req.userEmail.toLowerCase().trim());
    });

    const emailsArray = Array.from(uniqueEmails);
    if (emailsArray.length === 0) {
      return NextResponse.json({
        success: true,
        accountRequests: [],
        totalRequests: 0,
        totalPages: 0,
        currentPage: page
      });
    }

    // Resolve distributorId for all matching emails to check permissions
    const usersForEmails = await db.collection('users').find({
      email: { $in: emailsArray }
    }).project({ email: 1, distributorId: 1 }).toArray();

    const userDistMap = {};
    usersForEmails.forEach(u => {
      userDistMap[u.email.toLowerCase().trim()] = u.distributorId || '';
    });

    // Exclude Type B distributor players unless requested by that specific distributor
    const typeBDistIds = await getTypeBDistributorIds(db);

    const filteredEmails = [];
    emailsArray.forEach(emailKey => {
      const userDistId = userDistMap[emailKey] || '';
      // When a specific player email is requested, do not hide Type B players from themselves
      if (email && emailKey === email.toLowerCase().trim()) {
        filteredEmails.push(emailKey);
        return;
      }
      if (adminDistributorId) {
        if (userDistId === adminDistributorId) {
          filteredEmails.push(emailKey);
        }
      } else if (!email) {
        if (!typeBDistIds.includes(userDistId)) {
          filteredEmails.push(emailKey);
        }
      } else {
        filteredEmails.push(emailKey);
      }
    });

    if (filteredEmails.length === 0) {
      return NextResponse.json({
        success: true,
        accountRequests: [],
        totalRequests: 0,
        totalPages: 0,
        currentPage: page
      });
    }

    // Retrieve real requests for these filtered user emails
    let realRequests = await requestsCollection.find({
      userEmail: { $in: filteredEmails }
    }).toArray();

    if (status) {
      const statuses = status.split(',').map((s) => s.toUpperCase().trim()).filter(Boolean);
      if (statuses.length > 0) {
        realRequests = realRequests.filter((r) => statuses.includes(String(r.status || '').toUpperCase()));
      }
    }

    if (adminEmail) {
      const allowedTitles = await getStaffAllowedGameTitles(db, adminEmail);
      if (allowedTitles) {
        const allowedSet = new Set(allowedTitles.map((t) => t.toLowerCase()));
        realRequests = realRequests.filter((r) => allowedSet.has(String(r.gameTitle || '').toLowerCase()));
      }
    }

    // All created game accounts for these emails (as READY rows if not already covered)
    let gameAccountsForSearch = await db.collection('gameAccounts').find({
      userEmail: { $in: filteredEmails }
    }).toArray();

    if (adminEmail && gameAccountsForSearch.length > 0) {
      const allowedTitles = await getStaffAllowedGameTitles(db, adminEmail);
      if (allowedTitles) {
        const allowedSet = new Set(allowedTitles.map((t) => t.toLowerCase()));
        gameAccountsForSearch = gameAccountsForSearch.filter((acc) =>
          allowedSet.has(String(acc.gameTitle || '').toLowerCase())
        );
      }
    }

    const covered = new Set(
      realRequests.map((r) => {
        const e = (r.userEmail || '').toLowerCase().trim();
        const g = String(r.gameTitle || '').toLowerCase().trim();
        return `${e}||${g}`;
      })
    );

    const wantReady = !status || status.toUpperCase().includes('READY');
    const syntheticRequests = [];
    if (wantReady) {
      gameAccountsForSearch.forEach((acc) => {
        const e = (acc.userEmail || '').toLowerCase().trim();
        const g = String(acc.gameTitle || '').toLowerCase().trim();
        if (!e || !g || covered.has(`${e}||${g}`)) return;
        syntheticRequests.push({
          id: `account-${acc._id || acc.id || `${acc.userEmail}-${acc.gameTitle}`}`,
          gameTitle: acc.gameTitle,
          userEmail: e,
          status: 'READY',
          date: acc.createdAt || '',
          createdAt: acc.createdAt || new Date(0).toISOString(),
          gameAccountUsername: acc.username || '',
          isSynthetic: true,
          fromGameAccount: true
        });
      });
    }

    // Also include users found by name/email who have no requests and no accounts yet
    const emailsRepresented = new Set([
      ...realRequests.map((r) => (r.userEmail || '').toLowerCase().trim()),
      ...syntheticRequests.map((r) => (r.userEmail || '').toLowerCase().trim())
    ]);
    filteredEmails.forEach((emailKey) => {
      if (!emailsRepresented.has(emailKey) && wantReady) {
        const userDoc = usersForEmails.find((u) => u.email.toLowerCase().trim() === emailKey);
        syntheticRequests.push({
          id: 'synthetic-' + emailKey + '-' + Date.now(),
          gameTitle: '—',
          userEmail: emailKey,
          status: 'READY',
          date: '—',
          createdAt: new Date().toISOString(),
          distributorId: userDoc?.distributorId || '',
          isSynthetic: true
        });
      }
    });

    // Combine and sort (PENDING statuses first, then rest)
    const combined = [...realRequests, ...syntheticRequests];
    combined.sort((a, b) => {
      if (a.status === 'PENDING' && b.status !== 'PENDING') return -1;
      if (a.status !== 'PENDING' && b.status === 'PENDING') return 1;
      const dateA = a.createdAt || a.date || '';
      const dateB = b.createdAt || b.date || '';
      return String(dateB).localeCompare(String(dateA));
    });

    const totalRequests = combined.length;
    const skip = (page - 1) * limit;
    const paginated = combined.slice(skip, skip + limit);

    // Fetch and enrich paginated users with existing game accounts
    let enrichedRequests = [];
    if (paginated.length > 0) {
      const paginatedEmails = Array.from(new Set(paginated.map(r => r.userEmail.toLowerCase().trim())));
      const [gameAccounts, userDocs] = await Promise.all([
        db.collection('gameAccounts').find({ userEmail: { $in: paginatedEmails } }).toArray(),
        db.collection('users').find({ email: { $in: paginatedEmails } }).project({ email: 1, name: 1 }).toArray()
      ]);

      const accountsByEmail = {};
      gameAccounts.forEach(acc => {
        const emailKey = acc.userEmail.toLowerCase().trim();
        if (!accountsByEmail[emailKey]) {
          accountsByEmail[emailKey] = [];
        }
        accountsByEmail[emailKey].push({
          gameTitle: acc.gameTitle,
          username: acc.username,
          status: acc.status || 'READY'
        });
      });

      const nameByEmail = {};
      userDocs.forEach((u) => {
        if (u.email) nameByEmail[u.email.toLowerCase().trim()] = u.name || '';
      });

      enrichedRequests = paginated.map(r => {
        const emailKey = r.userEmail.toLowerCase().trim();
        return {
          ...r,
          userName: nameByEmail[emailKey] || r.userName || '',
          existingAccounts: accountsByEmail[emailKey] || []
        };
      });
    }

    return NextResponse.json({
      success: true,
      accountRequests: enrichedRequests,
      totalRequests,
      totalPages: Math.ceil(totalRequests / limit),
      currentPage: page
    });
  } catch (err) {
    console.error('Fetch Account Requests API Error:', err);
    return NextResponse.json({ success: false, message: 'Server error: ' + err.message }, { status: 500 });
  }
}

// POST new request (Player submission)
export async function POST(req) {
  try {
    const { gameTitle, userEmail } = await req.json();

    if (!gameTitle || !userEmail) {
      return NextResponse.json({ success: false, message: 'Game title and email are required.' }, { status: 400 });
    }

    const db = await getDb();
    const requestsCollection = db.collection('accountRequests');

    // Retrieve player's profile to extract distributor information
    let userDoc = await db.collection('users').findOne({ email: userEmail.toLowerCase().trim() });
    // Deleted distributor → wipe old game accounts so this request can succeed
    if (userDoc) {
      userDoc = await healOrphanedDistributorPlayer(db, userDoc);
    }
    let distId = userDoc ? (userDoc.distributorId || '') : '';
    let distType = '';
    let distName = '';

    // Inherit distributor from referrer when player was referred by another player under a distributor
    if (!distId && userDoc?.referredBy) {
      const referrer = await db.collection('users').findOne({
        email: userDoc.referredBy.toLowerCase().trim()
      });
      if (referrer?.distributorId) {
        distId = referrer.distributorId;
      }
    }

    if (distId) {
      const distributor = await db.collection('distributors').findOne({ id: distId });
      if (distributor) {
        distType = distributor.type || 'A';
        distName = distributor.name || '';
      } else {
        // Stale id (e.g. inherited from referrer) — do not tag the request with a dead distributor
        distId = '';
      }
    }

    // Backfill distributorId on user profile when inherited from referrer
    if (userDoc && distId && !userDoc.distributorId) {
      await db.collection('users').updateOne(
        { email: userEmail.toLowerCase().trim() },
        { $set: { distributorId: distId } }
      );
    }

    const cleanEmail = userEmail.toLowerCase().trim();
    const cleanTitle = String(gameTitle).trim();
    const titleRegex = new RegExp(`^${cleanTitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i');

    // Block double-taps / spam: one PENDING request per player + game
    const existingPending = await requestsCollection
      .find({
        userEmail: cleanEmail,
        status: 'PENDING',
        gameTitle: titleRegex
      })
      .sort({ id: -1 })
      .toArray();

    if (existingPending.length > 0) {
      // Keep newest; cancel older duplicates from previous multi-taps
      if (existingPending.length > 1) {
        const keepId = existingPending[0].id;
        await requestsCollection.updateMany(
          {
            userEmail: cleanEmail,
            status: 'PENDING',
            gameTitle: titleRegex,
            id: { $ne: keepId }
          },
          {
            $set: {
              status: 'REJECTED',
              rejectionReason: 'Duplicate request (auto-closed)',
              processedBy: 'system'
            }
          }
        );
        cache.del('admin_stats');
      }

      return NextResponse.json({
        success: true,
        request: existingPending[0],
        alreadyExists: true,
        message: 'You already have a pending request for this game.'
      });
    }

    // Already has credentials for this game — no new request needed
    const existingAccount = await db.collection('gameAccounts').findOne({
      userEmail: cleanEmail,
      gameTitle: titleRegex
    });
    if (existingAccount) {
      return NextResponse.json({
        success: false,
        message: 'You already have an account for this game.'
      }, { status: 400 });
    }

    // Stale READY/COMPLETED requests with no live credentials (e.g. after
    // distributor-delete → Undo) must not block a fresh Request / Create.
    await requestsCollection.updateMany(
      {
        userEmail: cleanEmail,
        gameTitle: titleRegex,
        status: { $in: ['READY', 'COMPLETED'] }
      },
      {
        $set: {
          status: 'REJECTED',
          rejectionReason: 'Superseded — player re-requested account',
          processedBy: 'system'
        }
      }
    );

    const newRequest = {
      id: Date.now().toString() + Math.floor(Math.random() * 100).toString(),
      gameTitle: cleanTitle,
      userEmail: cleanEmail,
      status: 'PENDING',
      date: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      distributorId: distId,
      distributorType: distType,
      distributorName: distName
    };
    await requestsCollection.insertOne(newRequest);
    
    // Invalidate stats cache + instant SSE to Shift / Requests tabs
    cache.del('admin_stats');
    publishAdminEvent('requests', { distributorId: distId || '', gameTitle: cleanTitle });

    let playerDisplayName = cleanEmail;
    if (cleanEmail) {
      const uDoc = await db.collection('users').findOne({ email: cleanEmail }, { projection: { name: 1 } });
      if (uDoc?.name && uDoc.name.trim() && uDoc.name.trim() !== '-' && uDoc.name.trim() !== '—') {
        playerDisplayName = uDoc.name.trim();
      }
    }

    notifyStaffAndDistributorAsync(db, {
      title: 'New Account Request',
      body: `${playerDisplayName} · ${cleanTitle}`,
      adminUrl: '/admin/requests',
      distributorUrl: '/distributor/requests',
      url: '/admin/requests',
      tag: `acct-${newRequest.id}`,
      gameTitle: cleanTitle,
      alertKind: 'coins'
    }, distId);

    return NextResponse.json({ success: true, request: newRequest, message: 'Game account request submitted successfully!' });
  } catch (err) {
    console.error('Create Account Request API Error:', err);
    return NextResponse.json({ success: false, message: 'Server error: ' + err.message }, { status: 500 });
  }
}

// PUT (update status) request (Admin approval/rejection)
export async function PUT(req) {
  try {
    const body = await req.json();
    const { id, status, gameAccountUsername, gameAccountPassword, processedBy, rejectionReason, adminEmail } = body;

    if (!id || !status) {
      return NextResponse.json({ success: false, message: 'Request ID and status are required.' }, { status: 400 });
    }

    const db = await getDb();
    const requestsCollection = db.collection('accountRequests');

    const idStr = String(id);
    const idCandidates = [idStr];
    if (/^\d+$/.test(idStr)) idCandidates.push(Number(idStr));

    const requestDoc = await requestsCollection.findOne(
      idCandidates.length > 1 ? { id: { $in: idCandidates } } : { id: idStr }
    );
    if (!requestDoc) {
      return NextResponse.json({ success: false, message: 'Account request not found.' }, { status: 404 });
    }

    const actorEmail = adminEmail || processedBy;
    const hasCreds =
      String(gameAccountUsername || '').trim() !== '' &&
      String(gameAccountPassword || '').trim() !== '';

    // Run access check in parallel with credential upsert prep
    const accessPromise = actorEmail
      ? staffCanAccessGame(db, actorEmail, requestDoc.gameTitle)
      : Promise.resolve(true);

    let finalStatus = status;
    const cleanEmail = String(requestDoc.userEmail || '').toLowerCase().trim();
    const cleanTitle = String(requestDoc.gameTitle || '').trim();
    const credUser = String(gameAccountUsername || '').trim();
    const credPass = String(gameAccountPassword || '').trim();

    const upsertPromise = (async () => {
      if ((status === 'COMPLETED' || status === 'READY') && hasCreds) {
        if (!cleanEmail || !cleanTitle) {
          return { error: 'Account request is missing player email or game title.', status: 400 };
        }
        // Exact match first (indexed) — avoids slow case-insensitive regex on hot path
        await db.collection('gameAccounts').updateOne(
          { userEmail: cleanEmail, gameTitle: cleanTitle },
          {
            $set: {
              gameTitle: cleanTitle,
              userEmail: cleanEmail,
              username: credUser,
              password: credPass,
              status: 'READY'
            }
          },
          { upsert: true }
        );
        return { finalStatus: 'READY' };
      }

      if ((status === 'COMPLETED' || status === 'READY') && !hasCreds) {
        const existingAcc = await db.collection('gameAccounts').findOne(
          { userEmail: cleanEmail, gameTitle: cleanTitle },
          { projection: { username: 1, password: 1 } }
        );
        if (!existingAcc?.username || !existingAcc?.password) {
          return {
            error: 'Username and password are required to approve this account request.',
            status: 400
          };
        }
        return { finalStatus: 'READY' };
      }

      return { finalStatus: status };
    })();

    const [canAccess, upsertResult] = await Promise.all([accessPromise, upsertPromise]);

    if (!canAccess) {
      return NextResponse.json({
        success: false,
        message: 'You do not have access to process requests for this game.'
      }, { status: 403 });
    }
    if (upsertResult.error) {
      return NextResponse.json({ success: false, message: upsertResult.error }, { status: upsertResult.status || 400 });
    }
    finalStatus = upsertResult.finalStatus;

    const updateFields = { status: finalStatus };
    if (processedBy) updateFields.processedBy = processedBy;
    if (rejectionReason) updateFields.rejectionReason = rejectionReason;
    if (hasCreds) {
      updateFields.gameAccountUsername = credUser;
      updateFields.gameAccountPassword = credPass;
    }

    await requestsCollection.updateOne({ _id: requestDoc._id }, { $set: updateFields });

    // Respond immediately — referral bonus + cache bust happen in background
    const referralId = requestDoc.referralRewardId;
    const gameTitleForRef = requestDoc.gameTitle;
    if (finalStatus === 'READY' && referralId) {
      Promise.resolve().then(async () => {
        try {
          const pendingReferralsCollection = db.collection('pendingReferrals');
          const refDoc = await pendingReferralsCollection.findOne({ id: referralId });
          if (!refDoc || refDoc.status === 'CLAIMED' || !refDoc.referrerEmail) return;

          const refEmail = String(refDoc.referrerEmail).toLowerCase().trim();
          const referrerUser = await db.collection('users').findOne(
            { email: refEmail },
            { projection: { distributorId: 1 } }
          );
          const distId = referrerUser ? (referrerUser.distributorId || '') : '';
          const txId = (Date.now() + Math.floor(Math.random() * 100)).toString();
          const coinId = Date.now().toString() + Math.floor(Math.random() * 100 + 1).toString();
          const rewardCoinsNum = Number(refDoc.rewardCoins);

          await Promise.all([
            db.collection('transactions').insertOne({
              id: txId,
              userEmail: refEmail,
              date: new Date().toISOString(),
              createdAt: new Date().toISOString(),
              type: 'BONUS',
              amount: rewardCoinsNum,
              gateway: 'REFERRAL BONUS',
              code: 'REFERRAL',
              status: 'SUCCESS',
              gameTitle: gameTitleForRef || 'Lobby',
              note: `Referral reward for inviting ${refDoc.refereeEmail}`,
              distributorId: distId
            }),
            db.collection('coinsNotifications').insertOne({
              id: coinId,
              userEmail: refEmail,
              gameTitle: gameTitleForRef,
              depositAmount: 0,
              bonusApplied: -2,
              totalCoins: rewardCoinsNum,
              status: 'PENDING',
              read: false,
              timestamp: new Date().toISOString(),
              transactionId: txId,
              distributorId: distId
            }),
            pendingReferralsCollection.updateOne(
              { id: referralId },
              { $set: { status: 'CLAIMED', claimedAt: new Date().toISOString() } }
            )
          ]);

          cache.del('admin_stats');
          publishAdminEvent('coins', {
            distributorId: distId,
            gameTitle: gameTitleForRef,
            coins: rewardCoinsNum
          });
          publishAdminEvent('transactions', {
            distributorId: distId
          });

          notifyStaffAndDistributorAsync(db, {
            title: 'New Coins Request (Referral Bonus)',
            body: `${refEmail} · ${rewardCoinsNum} coins · ${gameTitleForRef}`,
            adminUrl: '/admin/coins',
            distributorUrl: '/distributor/coins',
            url: '/admin/coins',
            tag: `coin-${coinId}`,
            gameTitle: gameTitleForRef,
            alertKind: 'coins'
          }, distId);
        } catch (refErr) {
          console.error('Failed to auto-allot referral bonus upon account request approval:', refErr);
        }
      });
    }

    cache.del('admin_stats');
    publishAdminEvent('requests', { status: String(status || '') });

    return NextResponse.json({ success: true, message: 'Account request status updated successfully!' });
  } catch (err) {
    console.error('Update Account Request API Error:', err);
    return NextResponse.json({ success: false, message: 'Server error: ' + err.message }, { status: 500 });
  }
}

