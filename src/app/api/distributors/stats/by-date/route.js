import { NextResponse } from 'next/server';
import { getDb } from '../../../../../lib/mongodb';
import { calcCommissionFromProfit, calcNetProfit } from '../../../../../lib/commission';

// Nepal Standard Time offset: UTC+5:45 (345 minutes)
const NEPAL_OFFSET_MS = 5 * 60 * 60 * 1000 + 45 * 60 * 1000;
const RESET_HOUR_MS = 5 * 60 * 60 * 1000; // Resets daily at 5:00 AM Nepal Time

/**
 * Convert a Nepal business date (YYYY-MM-DD) to exact UTC start/end boundaries.
 * Day cycle runs from 05:00:00 AM Nepal time to 05:00:00 AM next day.
 */
function getNepalDayUtcRange(year, month, day) {
  const midnightUtc = Date.UTC(year, month - 1, day) - NEPAL_OFFSET_MS;
  const startUtc = new Date(midnightUtc + RESET_HOUR_MS);
  const endUtc = new Date(midnightUtc + RESET_HOUR_MS + 24 * 60 * 60 * 1000);
  return { startUtc, endUtc };
}

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const distributorId = searchParams.get('distributorId');
    const dateParam = String(searchParams.get('date') || '').trim();

    if (!distributorId || !dateParam) {
      return NextResponse.json({ success: false, message: 'Missing distributorId or date.' }, { status: 400 });
    }

    const parts = dateParam.split('-').map(Number);
    if (parts.length !== 3 || parts.some(isNaN)) {
      return NextResponse.json({ success: false, message: 'Invalid date format. Use YYYY-MM-DD.' }, { status: 400 });
    }
    const [targetYear, targetMonth, targetDay] = parts;

    // Compute the UTC window that equals this Nepal calendar day
    const { startUtc, endUtc } = getNepalDayUtcRange(targetYear, targetMonth, targetDay);
    const startIso = startUtc.toISOString();
    const endIso = endUtc.toISOString();

    const db = await getDb();
    const distributorsCollection = db.collection('distributors');
    const usersCollection = db.collection('users');
    const transactionsCollection = db.collection('transactions');

    const dist = await distributorsCollection.findOne({ id: distributorId });
    if (!dist) {
      return NextResponse.json({ success: false, message: 'Distributor not found.' }, { status: 404 });
    }

    const commissionRate = parseFloat(dist.commissionRate || 0);
    const websiteCommissionRate = parseFloat(dist.websiteCommissionRate || 0);

    const players = await usersCollection.find(
      { distributorId, role: 'user' },
      { projection: { email: 1 } }
    ).toArray();

    const playerEmails = players.map(p => (p.email || '').toLowerCase().trim()).filter(Boolean);

    let totalDeposits = 0;
    let totalWithdrawals = 0;

    if (playerEmails.length > 0) {
      const datePrefixRegex = new RegExp(`^0?${targetMonth}/0?${targetDay}/${targetYear}`);

      const rows = await transactionsCollection.aggregate([
        {
          $match: {
            userEmail: { $in: playerEmails },
            status: 'SUCCESS',
            type: { $in: ['DEPOSIT', 'WITHDRAW'] },
            isDepositFromCashout: { $ne: true },
            $or: [
              { createdAt: { $gte: startIso, $lt: endIso } },
              { createdAt: { $gte: startUtc, $lt: endUtc } },
              { date: { $gte: startIso, $lt: endIso } },
              { date: { $gte: startUtc, $lt: endUtc } },
              { date: { $regex: datePrefixRegex } }
            ]
          }
        },
        {
          $group: {
            _id: '$type',
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

      for (const row of rows) {
        if (row._id === 'DEPOSIT') totalDeposits = row.total || 0;
        else if (row._id === 'WITHDRAW') totalWithdrawals = row.total || 0;
      }
    }

    const netProfit = calcNetProfit(totalDeposits, totalWithdrawals);
    const commissionEarned = calcCommissionFromProfit(totalDeposits, totalWithdrawals, commissionRate);
    const websiteCommissionEarned = calcCommissionFromProfit(totalDeposits, totalWithdrawals, websiteCommissionRate);

    return NextResponse.json({
      success: true,
      date: dateParam,
      totalDeposits,
      totalWithdrawals,
      netProfit,
      commissionEarned,
      websiteCommissionEarned,
      commissionRate,
      websiteCommissionRate
    });
  } catch (err) {
    console.error('Distributor Date Stats Error:', err);
    return NextResponse.json({ success: false, message: 'Server error: ' + err.message }, { status: 500 });
  }
}
