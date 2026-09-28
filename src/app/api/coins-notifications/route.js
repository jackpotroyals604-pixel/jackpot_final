import { NextResponse } from 'next/server';
import { getDb } from '../../../lib/mongodb';
import { cache } from '../../../lib/cache';
import { applyStaffGameFilter, staffCanAccessGame } from '../../../lib/staffGameAccess';
import { accountLookupKey, buildGameUsernameMap } from '../../../lib/resolveGameUsername';
import { typeBExclusionFilter } from '../../../lib/typeBDistributors';
import { publishAdminEvent } from '../../../lib/adminEvents';
import { notifyStaffAndDistributorAsync } from '../../../lib/pushNotifications';

// GET all coins notifications (supports filtering by email for users, or returning all for admins)
export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const email = searchParams.get('email');
    const search = searchParams.get('search') || '';
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '25', 10);

    const db = await getDb();
    const notificationsCollection = db.collection('coinsNotifications');
    
    let query = {};
    if (email) {
      query.userEmail = email.toLowerCase().trim();
    }

    const adminDistributorId = searchParams.get('adminDistributorId');
    const adminEmail = searchParams.get('adminEmail');

    if (adminDistributorId) {
      query.distributorId = adminDistributorId;
    } else if (!email) {
      // Only exclude Type B distributor coin notifications from Super Admin/global views
      Object.assign(query, await typeBExclusionFilter(db));
    }

    let searchSummary = null;

    if (search) {
      const cleanSearch = search.trim();
      const escaped = cleanSearch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const searchRegex = { $regex: escaped, $options: 'i' };

      // Look up matching accountRequests, gameAccounts, or transactions to catch specific { userEmail, gameTitle } pairs for that username
      const [matchingRequests, matchingAccounts, matchingTransactions] = await Promise.all([
        db.collection('accountRequests')
          .find({ gameAccountUsername: searchRegex })
          .project({ userEmail: 1, gameTitle: 1, gameAccountUsername: 1 })
          .limit(100)
          .toArray(),
        db.collection('gameAccounts')
          .find({ username: searchRegex })
          .project({ userEmail: 1, gameTitle: 1, username: 1 })
          .limit(100)
          .toArray(),
        db.collection('transactions')
          .find({ gameUsername: searchRegex })
          .project({ userEmail: 1, gameTitle: 1, gameUsername: 1 })
          .limit(100)
          .toArray()
      ]);

      const specificPairs = [];
      const seenPairKeys = new Set();
      const addPair = (e, g) => {
        if (!e || !g) return;
        const em = String(e).toLowerCase().trim();
        const gt = String(g).trim();
        const key = `${em}_${gt.toLowerCase()}`;
        if (!seenPairKeys.has(key)) {
          seenPairKeys.add(key);
          specificPairs.push({
            userEmail: em,
            gameTitle: { $regex: `^${gt.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' }
          });
        }
      };

      matchingRequests.forEach(r => addPair(r.userEmail, r.gameTitle));
      matchingAccounts.forEach(a => addPair(a.userEmail, a.gameTitle));
      matchingTransactions.forEach(t => addPair(t.userEmail, t.gameTitle));

      const orConditions = [
        { gameUsername: searchRegex }
      ];

      if (cleanSearch.includes('@')) {
        orConditions.push({ userEmail: searchRegex });
      } else {
        orConditions.push({ userEmail: searchRegex });
        orConditions.push({ gameTitle: searchRegex });
        orConditions.push({ userName: searchRegex });
        orConditions.push({ transactionId: searchRegex });
      }

      if (!isNaN(cleanSearch) && cleanSearch !== '') {
        orConditions.push({ id: Number(cleanSearch) }, { id: cleanSearch });
      }

      if (specificPairs.length > 0) {
        orConditions.push(...specificPairs);
      }

      const searchCriteria = { $or: orConditions };
      // Always AND with existing filters (keeps Type B exclusion for HQ admin)
      query = Object.keys(query).length > 0 ? { $and: [query, searchCriteria] } : searchCriteria;

      // Compute lifetime coins load summary for this searched game username / user
      try {
        const allCandidates = await notificationsCollection.find(query).toArray();
        const candMissing = allCandidates.filter(n => !String(n.gameUsername || '').trim() && n.userEmail && n.gameTitle);
        let candMap = {};
        if (candMissing.length > 0) {
          const candEmails = Array.from(new Set(candMissing.map(n => n.userEmail.toLowerCase().trim())));
          candMap = await buildGameUsernameMap(db, candEmails, { dedupe: false });
        }

        const sLower = cleanSearch.toLowerCase();
        const filteredAll = allCandidates.filter(noti => {
          const gu = (String(noti.gameUsername || '').trim() || candMap[accountLookupKey(noti.userEmail, noti.gameTitle)] || '').toLowerCase();
          const ue = String(noti.userEmail || '').toLowerCase();
          const gt = String(noti.gameTitle || '').toLowerCase();
          const un = String(noti.userName || '').toLowerCase();
          const tx = String(noti.transactionId || '').toLowerCase();
          const idStr = String(noti.id || '');

          return (
            gu.includes(sLower) ||
            ue.includes(sLower) ||
            gt.includes(sLower) ||
            un.includes(sLower) ||
            tx.includes(sLower) ||
            idStr === cleanSearch
          );
        });

        const completedLoads = filteredAll.filter(n => String(n.status).toUpperCase() === 'COMPLETED').length;
        const pendingLoads = filteredAll.filter(n => ['PENDING', 'CLAIM_REQUESTED', 'HOLD'].includes(String(n.status).toUpperCase())).length;
        const totalCoinsAllotted = filteredAll
          .filter(n => String(n.status).toUpperCase() === 'COMPLETED')
          .reduce((sum, n) => sum + (parseFloat(n.totalCoins) || 0), 0);
        const totalDepositCash = filteredAll
          .reduce((sum, n) => sum + (parseFloat(n.depositAmount) || 0), 0);

        searchSummary = {
          searchTerm: cleanSearch,
          totalRecords: filteredAll.length,
          completedLoads,
          pendingLoads,
          totalCoinsAllotted,
          totalDepositCash
        };
      } catch (sumErr) {
        console.error('Coins search summary error:', sumErr);
      }
    }

    const statusParam = searchParams.get('status');
    if (statusParam) {
      const statuses = statusParam.split(',').map(s => s.toUpperCase().trim()).filter(Boolean);
      const statusFilter = statuses.length > 1 ? { $in: statuses } : statuses[0];
      if (query.$and) {
        query.$and.push({ status: statusFilter });
      } else if (Object.keys(query).length > 0) {
        query = { $and: [query, { status: statusFilter }] };
      } else {
        query.status = statusFilter;
      }
    }

    if (adminEmail) {
      query = await applyStaffGameFilter(db, query, adminEmail);
    }

    const skip = (page - 1) * limit;
    // slim=1: skip username join — Shift/Coins polls stay fast (list doesn't need it every 1s)
    const slim = searchParams.get('slim') === '1';

    // Heal stuck HOLD rows staff marked "Already loaded" instead of DONE
    try {
      const stuck = await notificationsCollection
        .find({
          status: { $in: ['HOLD', 'CLAIM_REQUESTED'] },
          holdNote: { $regex: /already\s*load/i }
        })
        .project({ id: 1, transactionId: 1, _id: 1 })
        .limit(50)
        .toArray();
      if (stuck.length > 0) {
        const ids = stuck.map((n) => n.id).filter((id) => id != null);
        await notificationsCollection.updateMany(
          { id: { $in: ids } },
          { $set: { status: 'COMPLETED', read: true } }
        );
        const txIds = stuck.map((n) => n.transactionId).filter(Boolean);
        if (txIds.length > 0) {
          const variants = txIds.flatMap((tid) => [tid, String(tid)]);
          await db.collection('transactions').updateMany(
            {
              id: { $in: variants },
              status: 'COINS_LOADING',
              type: { $in: ['DEPOSIT', 'BONUS'] }
            },
            { $set: { status: 'SUCCESS', coinsAllottedAt: new Date().toISOString() } }
          );
        }
        cache.del('admin_stats');
      }
    } catch (healErr) {
      console.warn('coins already-loaded heal:', healErr?.message || healErr);
    }

    // Active queue first (CLAIM / PENDING / HOLD), then COMPLETED history — newest within each group
    const [totalNotifications, notifications] = await Promise.all([
      notificationsCollection.countDocuments(query),
      notificationsCollection
        .aggregate([
          { $match: query },
          {
            $addFields: {
              _queueRank: {
                $switch: {
                  branches: [
                    { case: { $eq: ['$status', 'CLAIM_REQUESTED'] }, then: 0 },
                    { case: { $eq: ['$status', 'PENDING'] }, then: 1 },
                    { case: { $eq: ['$status', 'HOLD'] }, then: 2 }
                  ],
                  default: 3
                }
              }
            }
          },
          { $sort: { _queueRank: 1, timestamp: -1 } },
          { $skip: skip },
          { $limit: limit },
          { $project: { _queueRank: 0 } }
        ])
        .toArray()
    ]);

    // Prefer username stored on the notification (set at approve time).
    // Fill gaps for active queue rows OR whenever search is active OR when slim is off.
    const missingUname = notifications.filter((n) => {
      if (!n.gameTitle || !n.userEmail || n.gameTitle === 'Referral Reward') return false;
      if (String(n.gameUsername || '').trim()) return false;
      if (search || !slim) return true;
      const st = String(n.status || '').toUpperCase();
      return st === 'PENDING' || st === 'CLAIM_REQUESTED' || st === 'HOLD';
    });
    let accountsMap = {};
    if (missingUname.length > 0) {
      const uniqueEmails = Array.from(new Set(missingUname.map((n) => n.userEmail.toLowerCase().trim())));
      accountsMap = await buildGameUsernameMap(db, uniqueEmails, { dedupe: false });
    }

    const backfillOps = [];
    for (const noti of notifications) {
      if (noti.isDepositFromCashout && (!noti.bonusApplied || noti.bonusApplied === 0) && noti.depositAmount > 0) {
        try {
          const amt = parseFloat(noti.depositAmount);
          let settings = cache.get('global_settings');
          let frontendSettings = cache.get('frontend_settings_all');
          if (!settings || !frontendSettings) {
            const [s1, s2] = await Promise.all([
              db.collection('settings').findOne({ id: 'global_settings' }),
              db.collection('settings').findOne({ id: 'frontend_settings' })
            ]);
            if (s1) { settings = s1; cache.set('global_settings', s1, 60); }
            if (s2) { frontendSettings = s2; cache.set('frontend_settings_all', s2, 60); }
          }
          const firstBonusPercent = (frontendSettings && frontendSettings.firstDepositBonus !== undefined)
            ? Number(frontendSettings.firstDepositBonus)
            : (settings ? Number(settings.firstDepositBonus) : 300);
          const regularBonusPercent = (frontendSettings && frontendSettings.regularDepositBonus !== undefined)
            ? Number(frontendSettings.regularDepositBonus)
            : (settings ? Number(settings.regularDepositBonus) : 20);

          const priorSuccess = await db.collection('transactions').findOne(
            { userEmail: String(noti.userEmail || '').toLowerCase().trim(), type: 'DEPOSIT', status: 'SUCCESS', id: { $ne: noti.transactionId } },
            { projection: { _id: 1 } }
          );
          const bPercent = !priorSuccess ? firstBonusPercent : regularBonusPercent;
          const calcCoins = Math.floor(amt * (1 + bPercent / 100));

          noti.bonusApplied = bPercent;
          noti.totalCoins = calcCoins;

          if (noti.id != null) {
            backfillOps.push(
              notificationsCollection.updateOne(
                { id: noti.id },
                { $set: { bonusApplied: bPercent, totalCoins: calcCoins } }
              )
            );
          }
        } catch {
          /* ignore backfill errors */
        }
      }

      const stored = String(noti.gameUsername || '').trim();
      if (stored) {
        noti.gameUsername = stored;
        continue;
      }
      if (noti.gameTitle && noti.userEmail && noti.gameTitle !== 'Referral Reward') {
        const resolved = accountsMap[accountLookupKey(noti.userEmail, noti.gameTitle)] || '';
        noti.gameUsername = resolved;
        // Persist so later slim polls / Shift rows stay filled without re-joining
        if (resolved && noti.id != null) {
          backfillOps.push(
            notificationsCollection.updateOne(
              { id: noti.id },
              { $set: { gameUsername: resolved } }
            )
          );
        }
      } else {
        noti.gameUsername = '';
      }
    }

    if (backfillOps.length > 0) {
      Promise.all(backfillOps).catch((err) => {
        console.warn('coins username backfill:', err?.message || err);
      });
    }
    
    let finalNotifications = notifications;
    if (search) {
      const cleanSearch = search.trim();
      const sLower = cleanSearch.toLowerCase();
      finalNotifications = notifications.filter((noti) => {
        const gu = String(noti.gameUsername || '').toLowerCase();
        const ue = String(noti.userEmail || '').toLowerCase();
        const gt = String(noti.gameTitle || '').toLowerCase();
        const un = String(noti.userName || '').toLowerCase();
        const tx = String(noti.transactionId || '').toLowerCase();
        const idStr = String(noti.id || '');

        return (
          gu.includes(sLower) ||
          ue.includes(sLower) ||
          gt.includes(sLower) ||
          un.includes(sLower) ||
          tx.includes(sLower) ||
          idStr === cleanSearch
        );
      });
    }

    const totalCount = search && searchSummary ? searchSummary.totalRecords : totalNotifications;

    return NextResponse.json({
      success: true,
      coinsNotifications: finalNotifications,
      totalNotifications: totalCount,
      totalPages: Math.ceil(totalCount / limit) || 1,
      currentPage: page,
      searchSummary
    });
  } catch (err) {
    console.error('Fetch Coins Notifications Error:', err);
    return NextResponse.json({ success: false, message: 'Server error: ' + err.message }, { status: 500 });
  }
}

// PUT update status, read indicator, or hold note
export async function PUT(req) {
  try {
    const body = await req.json();
    const { id, status, read, holdNote, processedBy, adminEmail } = body || {};

    if (id === undefined || id === null || id === '') {
      return NextResponse.json({ success: false, message: 'Notification ID is required.' }, { status: 400 });
    }

    const db = await getDb();
    const notificationsCollection = db.collection('coinsNotifications');

    // id may be stored as string or number depending on older inserts
    const idStr = String(id);
    let originalNoti = await notificationsCollection.findOne({ id: idStr });
    if (!originalNoti && !Number.isNaN(Number(idStr))) {
      originalNoti = await notificationsCollection.findOne({ id: Number(idStr) });
    }
    if (!originalNoti) {
      originalNoti = await notificationsCollection.findOne({ id });
    }

    // Shift Dashboard synthetic rows: tx-coins-<transactionId> for COINS_LOADING
    // deposits that never got a coinsNotifications document.
    // Keep this path FAST — no first-deposit bonus recount (finance already approved).
    if (!originalNoti && idStr.startsWith('tx-coins-')) {
      const txId = idStr.slice('tx-coins-'.length);
      const tidVariants = [txId, String(txId)];
      if (!Number.isNaN(Number(txId)) && String(Number(txId)) === String(txId)) {
        tidVariants.push(Number(txId));
      }
      const tx =
        (await db.collection('transactions').findOne({ id: { $in: tidVariants } }));
      if (tx && (tx.type === 'DEPOSIT' || tx.type === 'BONUS')) {
        const existingByTx = await notificationsCollection.findOne({
          transactionId: { $in: [tx.id, String(tx.id), ...tidVariants] }
        });
        if (existingByTx) {
          originalNoti = existingByTx;
          // Already Loaded — do not create a second PENDING task for this deposit
          if (String(existingByTx.status || '').toUpperCase() === 'COMPLETED') {
            if (String(tx.status || '').toUpperCase() === 'COINS_LOADING') {
              await db.collection('transactions').updateOne(
                { id: tx.id },
                { $set: { status: 'SUCCESS', coinsAllottedAt: new Date().toISOString() } }
              );
            }
            return NextResponse.json({
              success: true,
              message: 'This deposit was already loaded.',
              alreadyCompleted: true
            });
          }
        } else {
          const amount = parseFloat(tx.amount || 0);
          const isFreeplay = tx.type === 'BONUS' && (tx.code === 'SIGNUP-FREE3' || tx.code === 'FREEPLAY');
          const emailKey = String(tx.userEmail || '').toLowerCase().trim();
          const titleKey = tx.gameTitle || 'Lobby';
          let gameUsername = '';
          try {
            const umap = await buildGameUsernameMap(db, [emailKey], { dedupe: false });
            gameUsername = umap[accountLookupKey(emailKey, titleKey)] || '';
          } catch {
            /* ignore */
          }
          const newNoti = {
            id: Date.now().toString() + Math.floor(Math.random() * 100).toString(),
            userEmail: tx.userEmail,
            gameTitle: titleKey,
            gameUsername,
            depositAmount: amount,
            bonusApplied: isFreeplay ? -3 : 0,
            totalCoins: amount,
            ...(isFreeplay ? { isFreeplay: true } : {}),
            status: 'PENDING',
            read: false,
            timestamp: new Date().toISOString(),
            transactionId: String(tx.id),
            distributorId: tx.distributorId || '',
            distributorType: tx.distributorType || ''
          };
          await notificationsCollection.insertOne(newNoti);
          originalNoti = newNoti;
        }
      }
    }

    if (!originalNoti) {
      return NextResponse.json({ success: false, message: 'Notification not found.' }, { status: 404 });
    }

    const actorEmail = adminEmail || processedBy;
    if (actorEmail && !(await staffCanAccessGame(db, actorEmail, originalNoti.gameTitle))) {
      return NextResponse.json({ success: false, message: 'You do not have access to process notifications for this game.' }, { status: 403 });
    }

    const updateFields = {};
    if (status !== undefined) {
      // Player reclaim after staff already marked Loaded / "Already loaded" → keep COMPLETED
      if (status === 'CLAIM_REQUESTED') {
        const priorNote = String(originalNoti.holdNote || '').toLowerCase();
        const alreadyLoadedNote = /already\s*load/.test(priorNote);
        if (String(originalNoti.status || '').toUpperCase() === 'COMPLETED' || alreadyLoadedNote) {
          updateFields.status = 'COMPLETED';
          updateFields.read = true;
          if (alreadyLoadedNote && !originalNoti.processedBy) {
            updateFields.processedBy = processedBy || 'system';
          }
        } else {
          updateFields.status = 'CLAIM_REQUESTED';
          updateFields.timestamp = new Date().toISOString();
        }
      } else if (status === 'HOLD' && originalNoti.totalCoins < 0) {
        updateFields.status = 'FAILED';
      } else {
        updateFields.status = status;
      }
    }
    if (read !== undefined) {
      updateFields.read = Boolean(read);
    }
    if (holdNote !== undefined) {
      updateFields.holdNote = holdNote;
    }
    if (processedBy !== undefined) {
      updateFields.processedBy = processedBy;
    }

    const notiQuery = originalNoti._id
      ? { _id: originalNoti._id }
      : { id: originalNoti.id };

    await notificationsCollection.updateOne(notiQuery, { $set: updateFields });

    if (status === 'COMPLETED' && originalNoti.status !== 'COMPLETED') {
      // Deduct coins from dynamic game pools on allotment completion
      const gameTitle = originalNoti.gameTitle;
      const amountToDeduct = parseFloat(originalNoti.totalCoins || 0);

      const poolPromise = (async () => {
        if (!gameTitle || gameTitle === 'Referral Reward' || gameTitle === 'Lobby') return;
        try {
          const gamesCollection = db.collection('games');
          let game = await gamesCollection.findOne({ title: gameTitle });
          if (!game) {
            const escaped = String(gameTitle).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            game = await gamesCollection.findOne({ title: { $regex: new RegExp(`^${escaped}$`, 'i') } });
          }
          if (!game) return;
          if (originalNoti.distributorId) {
            const distGamesColl = db.collection('distributorGames');
            const dg = await distGamesColl.findOne({ distributorId: originalNoti.distributorId, gameId: game.id });
            const currentCoins = parseFloat(dg?.availableCoins || 0);
            const newCoins = Math.max(0, currentCoins - amountToDeduct);
            const currentUsed = parseFloat(dg?.usedCoins || 0);
            const newUsed = originalNoti.isFreeplayWithdraw ? currentUsed : (currentUsed + amountToDeduct);
            await distGamesColl.updateOne(
              { distributorId: originalNoti.distributorId, gameId: game.id },
              { $set: { availableCoins: newCoins, usedCoins: newUsed, title: gameTitle } },
              { upsert: true }
            );
          } else {
            const currentCoins = parseFloat(game.availableCoins || 0);
            const newCoins = Math.max(0, currentCoins - amountToDeduct);
            const currentUsed = parseFloat(game.usedCoins || 0);
            const newUsed = originalNoti.isFreeplayWithdraw ? currentUsed : (currentUsed + amountToDeduct);
            await gamesCollection.updateOne({ id: game.id }, { $set: { availableCoins: newCoins, usedCoins: newUsed } });
            cache.del('games_all');
          }
        } catch (poolErr) {
          console.error('Failed to deduct game coin pool for completed allotment:', poolErr);
        }
      })();

      const parentPromise = (async () => {
        if (!originalNoti.transactionId) return;
        try {
          const transactionsCollection = db.collection('transactions');
          const tid = originalNoti.transactionId;
          const tidVariants = [tid, String(tid)];
          if (!Number.isNaN(Number(tid)) && String(Number(tid)) === String(tid)) {
            tidVariants.push(Number(tid));
          }
          const parentTx = await transactionsCollection.findOne({
            id: { $in: tidVariants }
          });
          if (!parentTx) return;
          const txUpdate = {
            allottedBy: processedBy || originalNoti.processedBy || 'system',
            coinsAllottedAt: new Date().toISOString()
          };
          if (parentTx.type === 'WITHDRAW') {
            txUpdate.status = 'PENDING';
            if (originalNoti.isFreeplayWithdraw) {
              let fpCap = 30;
              try {
                const sDoc = (await db.collection('settings').findOne({ id: 'frontend_settings' })) || (await db.collection('settings').findOne({ id: 'global_settings' }));
                if (sDoc?.freeplayMinWithdraw) fpCap = Number(sDoc.freeplayMinWithdraw);
              } catch {
                /* ignore */
              }
              txUpdate.payoutAmount = fpCap;
              txUpdate.amount = fpCap;
              txUpdate.isFreeplayWithdraw = true;
              txUpdate.note = `Freeplay win capped at $${fpCap} max cashout.`;
            }
            let playerDisplayName = parentTx.userEmail;
            if (parentTx.userEmail) {
              const uDoc = await db.collection('users').findOne({ email: parentTx.userEmail.toLowerCase().trim() }, { projection: { name: 1 } });
              if (uDoc?.name && uDoc.name.trim() && uDoc.name.trim() !== '-' && uDoc.name.trim() !== '—') {
                playerDisplayName = uDoc.name.trim();
              }
            }

            notifyStaffAndDistributorAsync(db, {
              title: 'Withdrawal Payout Ready',
              body: `${playerDisplayName} · $${parseFloat(parentTx.amount || 0).toFixed(2)}${parentTx.gameTitle ? ` · ${parentTx.gameTitle}` : ''}`,
              adminUrl: '/admin/ledger',
              distributorUrl: '/distributor/ledger',
              url: '/admin/ledger',
              tag: `payout-${parentTx.id}`,
              gameTitle: parentTx.gameTitle || '',
              alertKind: 'game'
            }, parentTx.distributorId);
          } else if (parentTx.type === 'DEPOSIT' || parentTx.type === 'BONUS') {
            txUpdate.status = 'SUCCESS';
            if (originalNoti.totalCoins !== undefined) txUpdate.totalCoins = originalNoti.totalCoins;
            if (originalNoti.bonusApplied !== undefined) txUpdate.bonusApplied = originalNoti.bonusApplied;
            if (originalNoti.totalCoins !== undefined) txUpdate.gameAmount = originalNoti.totalCoins;
            if (originalNoti.isDepositFromCashout || parentTx.isDepositFromCashout) {
              txUpdate.note = 'Added deposit from remaining cashout';
            }
          }
          await transactionsCollection.updateOne(
            parentTx._id ? { _id: parentTx._id } : { id: parentTx.id },
            { $set: txUpdate }
          );

          // If deposit from cashout: automatically deduct from source withdrawal's payoutHold
          if (originalNoti.isDepositFromCashout || parentTx.isDepositFromCashout) {
            const parentWithdrawId = originalNoti.parentTxId || parentTx.parentTxId;
            let sourceWithdrawTx = null;
            if (parentWithdrawId) {
              const widVariants = [parentWithdrawId, String(parentWithdrawId)];
              if (!Number.isNaN(Number(parentWithdrawId))) widVariants.push(Number(parentWithdrawId));
              sourceWithdrawTx = await transactionsCollection.findOne({ id: { $in: widVariants } });
            }
            if (!sourceWithdrawTx) {
              // Fallback to user's latest withdrawal transaction with payoutHold > 0
              sourceWithdrawTx = await transactionsCollection.findOne(
                {
                  userEmail: (originalNoti.userEmail || parentTx.userEmail || '').toLowerCase().trim(),
                  type: { $in: ['WITHDRAW', 'COMMISSION_WITHDRAW', 'AFFILIATE_COMMISSION_WITHDRAW'] },
                  status: 'SUCCESS',
                  remainderPaid: { $ne: true },
                  payoutHold: { $gt: 0 }
                },
                { sort: { createdAt: -1, id: -1 } }
              );
            }
            if (sourceWithdrawTx && parseFloat(sourceWithdrawTx.payoutHold || 0) > 0) {
              const currentHold = parseFloat(sourceWithdrawTx.payoutHold || 0);
              const depositVal = parseFloat(originalNoti.depositAmount || originalNoti.totalCoins || parentTx.amount || 0);
              const newHold = Math.max(0, Math.round((currentHold - depositVal) * 100) / 100);
              const withdrawUpdate = { payoutHold: newHold };
              if (newHold <= 0) {
                withdrawUpdate.payoutHold = 0;
                withdrawUpdate.remainderPaid = true;
              }
              await transactionsCollection.updateOne(
                sourceWithdrawTx._id ? { _id: sourceWithdrawTx._id } : { id: sourceWithdrawTx.id },
                { $set: withdrawUpdate }
              );
              cache.del('admin_stats');
              publishAdminEvent('transactions', { distributorId: sourceWithdrawTx.distributorId || '' });
            }
          }

          // Close any duplicate PENDING/CLAIM rows for the same deposit
          await notificationsCollection.updateMany(
            {
              transactionId: { $in: tidVariants },
              status: { $in: ['PENDING', 'CLAIM_REQUESTED'] },
              id: { $ne: originalNoti.id }
            },
            {
              $set: {
                status: 'COMPLETED',
                read: true,
                processedBy: processedBy || originalNoti.processedBy || 'system'
              }
            }
          );
        } catch (txErr) {
          console.error('Failed to update parent transaction on allotment complete:', txErr);
        }
      })();

      await Promise.all([poolPromise, parentPromise]);
    } else if (status === 'HOLD' || status === 'CANCELLED') {
      // Withdrawals or direct cancellation: fail parent tx.
      // Stamp the reason on the parent so COINS_LOADING rows don't look "stuck".
      if (originalNoti.transactionId) {
        const transactionsCollection = db.collection('transactions');
        const parentTx = await transactionsCollection.findOne({
          id: { $in: [originalNoti.transactionId, String(originalNoti.transactionId)] }
        });
        if (parentTx) {
          const txUpdate = {
            note: holdNote || (status === 'CANCELLED' ? 'Cancelled by Administrator.' : 'Declined by Administrator.'),
            allottedBy: processedBy || originalNoti.processedBy || 'system',
            coinsHoldNote: holdNote || (status === 'CANCELLED' ? 'Cancelled by Administrator.' : 'Declined by Administrator.'),
            coinsHoldAt: new Date().toISOString()
          };
          if (originalNoti.totalCoins < 0 || status === 'CANCELLED') {
            txUpdate.status = 'FAILED';
            txUpdate.payoutHold = 0;
            txUpdate.remainderPaid = true;
          }
          await transactionsCollection.updateOne(
            parentTx._id ? { _id: parentTx._id } : { id: parentTx.id },
            { $set: txUpdate }
          );
        }
      }
    }

    // Invalidate stats cache + SSE
    cache.del('admin_stats');
    publishAdminEvent('coins', {
      distributorId: originalNoti.distributorId || '',
      status: status != null ? String(status) : undefined
    });
    publishAdminEvent('transactions', { distributorId: originalNoti.distributorId || '' });

    return NextResponse.json({ success: true, message: 'Notification updated successfully!' });
  } catch (err) {
    console.error('Update Coins Notification Error:', err);
    return NextResponse.json({ success: false, message: 'Server error: ' + err.message }, { status: 500 });
  }
}

