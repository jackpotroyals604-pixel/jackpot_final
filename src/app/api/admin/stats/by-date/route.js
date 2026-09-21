import { NextResponse } from 'next/server';
import { getDb } from '../../../../../lib/mongodb';
import { typeBExclusionFilter } from '../../../../../lib/typeBDistributors';

// Nepal Standard Time offset: UTC+5:45 (345 minutes)
const NEPAL_OFFSET_MS = 5 * 60 * 60 * 1000 + 45 * 60 * 1000;
const RESET_HOUR_MS = 5 * 60 * 60 * 1000; // Resets daily at 5:00 AM Nepal Time

/**
 * Convert a Nepal business date (YYYY-MM-DD) to exact UTC start/end boundaries.
 * The daily business cycle runs from 05:00:00 AM Nepal time to 05:00:00 AM next day.
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
    const dateParam = String(searchParams.get('date') || '').trim(); // YYYY-MM-DD
    const adminDistributorId = searchParams.get('adminDistributorId');

    if (!dateParam) {
      return NextResponse.json({ success: false, message: 'Date parameter is required.' }, { status: 400 });
    }

    const parts = dateParam.split('-').map(Number);
    if (parts.length !== 3 || parts.some(isNaN)) {
      return NextResponse.json({ success: false, message: 'Invalid date format. Use YYYY-MM-DD.' }, { status: 400 });
    }
    const [targetYear, targetMonth, targetDay] = parts;

    // Compute the UTC window that corresponds to this Nepal calendar day
    const { startUtc, endUtc } = getNepalDayUtcRange(targetYear, targetMonth, targetDay);
    const startIso = startUtc.toISOString();
    const endIso = endUtc.toISOString();

    const db = await getDb();

    // Respect distributor scoping and Type B exclusion to match /api/admin/stats
    let baseQuery = {};
    if (adminDistributorId) {
      baseQuery.distributorId = adminDistributorId;
    } else {
      baseQuery = await typeBExclusionFilter(db);
    }

    // Legacy date string matching prefix for very old non-ISO formatted records
    const datePrefixRegex = new RegExp(`^0?${targetMonth}/0?${targetDay}/${targetYear}`);

    const matchQuery = {
      ...baseQuery,
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
    };

    const rows = await db.collection('transactions').aggregate([
      { $match: matchQuery },
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

    let totalIn = 0;
    let totalOut = 0;

    for (const row of rows) {
      if (row._id === 'DEPOSIT') totalIn = row.total || 0;
      else if (row._id === 'WITHDRAW') totalOut = row.total || 0;
    }

    return NextResponse.json({
      success: true,
      date: dateParam,
      totalIn,
      totalOut
    });
  } catch (err) {
    console.error('Fetch Date Stats API Error:', err);
    return NextResponse.json({ success: false, message: 'Server error: ' + err.message }, { status: 500 });
  }
}
