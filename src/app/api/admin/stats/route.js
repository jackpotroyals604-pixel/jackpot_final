import { NextResponse } from 'next/server';
import { getDb } from '../../../../lib/mongodb';
import { cache } from '../../../../lib/cache';
import { applyStaffGameFilter } from '../../../../lib/staffGameAccess';
import { typeBExclusionFilter } from '../../../../lib/typeBDistributors';
import { jsonOk } from '../../../../lib/apiResponse';

// Nepal Standard Time is UTC+5:45 (offset = 345 minutes = 20700 seconds)
const NEPAL_OFFSET_MS = 5 * 60 * 60 * 1000 + 45 * 60 * 1000; // 345 minutes in ms
const RESET_HOUR_NEPAL = 5; // Resets daily at 5:00 AM Nepal Time
const RESET_OFFSET_MS = RESET_HOUR_NEPAL * 60 * 60 * 1000; // 5 hours in ms

/**
 * Returns the UTC instant that corresponds to 5:00 AM
 * of the current business day in Nepal Standard Time.
 */
function getNepalStartOfToday() {
  const nowUtc = Date.now();
  // Convert to Nepal local time
  const nowNepal = nowUtc + NEPAL_OFFSET_MS;
  // Shift back by 5 hours so that 5:00 AM becomes 00:00 of the cycle
  const shifted = nowNepal - RESET_OFFSET_MS;
  const dayStartShifted = shifted - (shifted % (24 * 60 * 60 * 1000));
  const dayStartNepal = dayStartShifted + RESET_OFFSET_MS;
  // Convert back to UTC
  return new Date(dayStartNepal - NEPAL_OFFSET_MS);
}

async function aggregateFinancialTotals(db, baseQuery) {
  const startOfToday = getNepalStartOfToday();
  const startOfYesterday = new Date(startOfToday.getTime() - 24 * 60 * 60 * 1000);
  const endOfToday = new Date(startOfToday.getTime() + 24 * 60 * 60 * 1000);

  const startOfYesterdayIso = startOfYesterday.toISOString();
  const endOfTodayIso = endOfToday.toISOString();

  const rows = await db.collection('transactions').aggregate([
    {
      $match: {
        ...baseQuery,
        status: 'SUCCESS',
        type: { $in: ['DEPOSIT', 'WITHDRAW'] },
        isDepositFromCashout: { $ne: true },
        $or: [
          { createdAt: { $gte: startOfYesterdayIso, $lt: endOfTodayIso } },
          { createdAt: { $gte: startOfYesterday, $lt: endOfToday } },
          { date: { $gte: startOfYesterdayIso, $lt: endOfTodayIso } },
          { date: { $gte: startOfYesterday, $lt: endOfToday } }
        ]
      }
    },
    {
      $addFields: {
        txDate: {
          $cond: [
            { $eq: [{ $type: '$createdAt' }, 'date'] },
            '$createdAt',
            {
              $convert: {
                input: '$createdAt',
                to: 'date',
                onError: {
                  $cond: [
                    { $eq: [{ $type: '$date' }, 'date'] },
                    '$date',
                    {
                      $convert: {
                        input: '$date',
                        to: 'date',
                        onError: null,
                        onNull: null
                      }
                    }
                  ]
                },
                onNull: {
                  $cond: [
                    { $eq: [{ $type: '$date' }, 'date'] },
                    '$date',
                    {
                      $convert: {
                        input: '$date',
                        to: 'date',
                        onError: null,
                        onNull: null
                      }
                    }
                  ]
                }
              }
            }
          ]
        }
      }
    },
    { $match: { txDate: { $gte: startOfYesterday, $lt: endOfToday } } },
    {
      $group: {
        _id: {
          type: '$type',
          period: {
            $cond: [{ $gte: ['$txDate', startOfToday] }, 'today', 'yesterday']
          }
        },
        total: {
          $sum: {
            $cond: [
              { $eq: ['$type', 'WITHDRAW'] },
              { $toDouble: { $ifNull: ['$payoutSent', { $ifNull: ['$amount', 0] }] } },
              { $toDouble: { $ifNull: ['$amount', 0] } }
            ]
          }
        }
      }
    }
  ]).toArray();

  let todayDeposits = 0;
  let todayWithdrawals = 0;
  let yesterdayDeposits = 0;
  let yesterdayWithdrawals = 0;

  for (const row of rows) {
    const amount = row.total || 0;
    const isToday = row._id.period === 'today';
    if (row._id.type === 'DEPOSIT') {
      if (isToday) todayDeposits += amount;
      else yesterdayDeposits += amount;
    } else if (row._id.type === 'WITHDRAW') {
      if (isToday) todayWithdrawals += amount;
      else yesterdayWithdrawals += amount;
    }
  }

  return { todayDeposits, todayWithdrawals, yesterdayDeposits, yesterdayWithdrawals };
}

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const adminRole = searchParams.get('adminRole');
    const adminDistributorId = searchParams.get('adminDistributorId');
    const adminEmail = searchParams.get('adminEmail');

    const cacheKey = `admin_stats_${adminRole || 'anon'}_${adminDistributorId || 'global'}_${adminEmail || 'all'}`;
    const cachedStats = cache.get(cacheKey);
    if (cachedStats) {
      return jsonOk({ success: true, stats: cachedStats }, { cacheSeconds: 0 });
    }

    const db = await getDb();

    let baseQuery = {};
    if (adminDistributorId) {
      baseQuery.distributorId = adminDistributorId;
    } else {
      baseQuery = await typeBExclusionFilter(db);
    }

    let requestsQuery = { ...baseQuery, status: 'PENDING' };
    let coinsQuery = { ...baseQuery, status: { $in: ['PENDING', 'CLAIM_REQUESTED'] } };
    if (adminEmail) {
      requestsQuery = await applyStaffGameFilter(db, requestsQuery, adminEmail);
      coinsQuery = await applyStaffGameFilter(db, coinsQuery, adminEmail);
    }

    const [
      pendingRequestsCount,
      pendingTransactionsCount,
      pendingCoinsCount,
      unreadChatUsers,
      pendingWebsitePaymentsCount,
      pendingAffiliateCommissionsCount,
      pendingCampaignRequestsCount,
      financialTotals
    ] = await Promise.all([
      db.collection('accountRequests').countDocuments(requestsQuery),
      db.collection('transactions').countDocuments({
        ...baseQuery,
        status: 'PENDING',
        type: { $nin: ['WEBSITE_COMMISSION_PAYMENT', 'COMMISSION_WITHDRAW', 'AFFILIATE_COMMISSION_WITHDRAW'] }
      }),
      db.collection('coinsNotifications').countDocuments(coinsQuery),
      db.collection('supportMessages').distinct(
        'userEmail',
        adminDistributorId
          ? { distributorId: adminDistributorId, senderType: 'player', read: false }
          : {
              senderType: 'player',
              read: false,
              $or: [
                { distributorType: { $exists: false } },
                { distributorType: null },
                { distributorType: '' },
                { distributorType: { $nin: ['B'] } }
              ]
            }
      ),
      db.collection('transactions').countDocuments({ type: { $in: ['WEBSITE_COMMISSION_PAYMENT', 'COMMISSION_WITHDRAW'] }, distributorId: adminDistributorId || { $exists: true }, status: 'PENDING' }),
      db.collection('transactions').countDocuments({ type: 'AFFILIATE_COMMISSION_WITHDRAW', status: 'PENDING' }),
      db.collection('campaignRequests').countDocuments({ status: 'PENDING' }),
      aggregateFinancialTotals(db, baseQuery)
    ]);

    const stats = {
      ...financialTotals,
      pendingRequestsCount,
      pendingTransactionsCount,
      pendingCoinsCount,
      pendingChatsCount: unreadChatUsers.length,
      pendingWebsitePaymentsCount,
      pendingAffiliateCommissionsCount,
      pendingCampaignRequestsCount
    };

    // Short TTL — coins badge must move within ~1s of finance approve on VPS
    cache.set(cacheKey, stats, 2);

    return jsonOk({ success: true, stats }, { cacheSeconds: 0 });
  } catch (err) {
    console.error('Fetch Admin Stats Error:', err);
    return NextResponse.json({ success: false, message: 'Server error: ' + err.message }, { status: 500 });
  }
}
