import { NextResponse } from 'next/server';
import { getDb } from '../../../../lib/mongodb';

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const agentCode = searchParams.get('agentCode');
    const fromDate = searchParams.get('fromDate');
    const toDate = searchParams.get('toDate');

    if (!agentCode) {
      return NextResponse.json({ success: false, message: 'Agent code is required.' }, { status: 400 });
    }

    const db = await getDb();
    const usersCollection = db.collection('users');
    const transactionsCollection = db.collection('transactions');
    const agentsCollection = db.collection('agents');
    const distributorsCollection = db.collection('distributors');

    const agent = await agentsCollection.findOne({ agentCode: agentCode.toUpperCase().trim() });
    if (!agent) {
      return NextResponse.json({ success: false, message: 'Agent not found.' }, { status: 404 });
    }

    // Resolve distributor names to show in the list
    const distributors = await distributorsCollection.find().toArray();
    const distMap = {};
    distributors.forEach(d => {
      distMap[d.id] = d.name || d.email;
    });

    // 1. Fetch all referred users (players)
    const players = await usersCollection.find({ agentCode: agent.agentCode, role: 'user' }).toArray();
    const playerEmails = players.map(p => p.email.toLowerCase().trim());

    // Get successful deposits of all referred players to resolve deposited states
    let firstDepositMap = {};
    let activeEmails = new Set();
    if (playerEmails.length > 0) {
      const deposits = await transactionsCollection.find({
        userEmail: { $in: playerEmails },
        type: 'DEPOSIT',
        status: 'SUCCESS'
      }).sort({ createdAt: 1 }).toArray();

      deposits.forEach(d => {
        const emailKey = d.userEmail.toLowerCase().trim();
        activeEmails.add(emailKey);
        if (!firstDepositMap[emailKey]) {
          firstDepositMap[emailKey] = d.createdAt || d.date;
        }
      });
    }

    // 2. Filter players by date range if provided
    let filteredPlayers = [...players];
    const NEPAL_OFFSET_MS = 5 * 60 * 60 * 1000 + 45 * 60 * 1000;
    if (fromDate) {
      const parts = fromDate.split('-').map(Number);
      if (parts.length === 3 && !parts.some(isNaN)) {
        const [y, m, d] = parts;
        const start = new Date(Date.UTC(y, m - 1, d) - NEPAL_OFFSET_MS);
        filteredPlayers = filteredPlayers.filter(p => {
          const time = p.createdAt || p.date;
          return time && new Date(time) >= start;
        });
      }
    }
    if (toDate) {
      const parts = toDate.split('-').map(Number);
      if (parts.length === 3 && !parts.some(isNaN)) {
        const [y, m, d] = parts;
        const end = new Date(Date.UTC(y, m - 1, d + 1) - NEPAL_OFFSET_MS - 1);
        filteredPlayers = filteredPlayers.filter(p => {
          const time = p.createdAt || p.date;
          return time && new Date(time) <= end;
        });
      }
    }

    // 3. Compute Card Stats
    let totalSignups = filteredPlayers.length;
    let referralSignups = 0;
    let facebookSignups = 0;
    let organicSignups = 0;

    let totalVerified = 0;
    let referralVerified = 0;
    let facebookVerified = 0;
    let organicVerified = 0;

    let totalDeposited = 0;
    let referralDeposited = 0;
    let facebookDeposited = 0;
    let organicDeposited = 0;
    let oldSignupDeposited = 0;

    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    // Grouping by campaign for breakdown
    const campaignCounts = {};

    const playersList = [];

    filteredPlayers.forEach(p => {
      const email = p.email.toLowerCase().trim();
      const campaign = (p.campaign || 'organic').toLowerCase().trim();
      const isVerified = p.status !== 'UNVERIFIED';
      const hasDeposited = activeEmails.has(email);

      // Increment campaign stats
      if (campaign === 'referral') {
        referralSignups++;
        if (isVerified) referralVerified++;
        if (hasDeposited) referralDeposited++;
      } else if (campaign === 'facebook') {
        facebookSignups++;
        if (isVerified) facebookVerified++;
        if (hasDeposited) facebookDeposited++;
      } else {
        organicSignups++;
        if (isVerified) organicVerified++;
        if (hasDeposited) organicDeposited++;
      }

      if (isVerified) totalVerified++;
      if (hasDeposited) {
        totalDeposited++;
        // Check if old signup (registered older than 7 days ago)
        const signupTime = p.createdAt ? new Date(p.createdAt) : null;
        if (signupTime && signupTime < sevenDaysAgo) {
          oldSignupDeposited++;
        }
      }

      // Grouping
      const campaignTitle = p.campaign || 'Organic';
      campaignCounts[campaignTitle] = (campaignCounts[campaignTitle] || 0) + 1;

      // Map to detailed players list
      playersList.push({
        id: p.id || p._id?.toString() || '—',
        name: p.name,
        email: p.email,
        ownerType: 'Agent',
        ownerName: agent.name,
        ownerCode: agent.agentCode,
        distributor: distMap[p.distributorId] || '—',
        subDistributor: '—',
        agent: agent.name,
        networkPath: `Super Admin ➔ ${distMap[p.distributorId] || 'Lobby'} ➔ ${agent.name}`,
        signupDate: p.createdAt ? new Date(p.createdAt).toLocaleDateString() : p.date || '—',
        firstDepositDate: firstDepositMap[email] ? new Date(firstDepositMap[email]).toLocaleDateString() : '—',
        verification: isVerified ? 'VERIFIED' : 'UNVERIFIED',
        campaign: campaignTitle
      });
    });

    const campaignBreakdown = Object.keys(campaignCounts).map(name => ({
      campaign: name,
      totalSignups: campaignCounts[name]
    })).sort((a, b) => b.totalSignups - a.totalSignups);

    return NextResponse.json({
      success: true,
      stats: {
        totalPlayers: totalSignups,
        referralSignups,
        facebookSignups,
        organicSignups,
        totalVerified,
        referralVerified,
        facebookVerified,
        organicVerified,
        totalDeposited,
        referralDeposited,
        facebookDeposited,
        organicDeposited,
        oldSignupDeposited
      },
      campaignBreakdown,
      playersList
    });
  } catch (err) {
    console.error('Signup Report API Error:', err);
    return NextResponse.json({ success: false, message: 'Server error: ' + err.message }, { status: 500 });
  }
}
