import { NextResponse } from 'next/server';
import { getDb } from '../../../../lib/mongodb';
import { calcCommissionFromProfit } from '../../../../lib/commission';

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const agentCode = searchParams.get('agentCode');

    if (!agentCode) {
      return NextResponse.json({ success: false, message: 'Agent code is required.' }, { status: 400 });
    }

    const db = await getDb();
    const usersCollection = db.collection('users');
    const transactionsCollection = db.collection('transactions');
    const agentsCollection = db.collection('agents');

    const agent = await agentsCollection.findOne({ agentCode: agentCode.toUpperCase() });
    if (!agent) {
      return NextResponse.json({ success: false, message: 'Agent not found.' }, { status: 404 });
    }

    // 1. Fetch all referred players
    const players = await usersCollection.find({ agentCode: agent.agentCode, role: 'user' }).toArray();
    const playerEmails = players.map(p => p.email.toLowerCase().trim());

    let totalDeposits = 0;
    let totalWithdrawals = 0;
    let todayDeposits = 0;
    let todayWithdrawals = 0;
    let pendingWithdrawals = 0;
    let depositingPlayersCount = 0;
    let verifiedPlayersCount = 0;
    let unverifiedPlayersCount = 0;

    const enrichedPlayers = [];

    // Get today's start date in Nepal Standard Time (UTC+5:45, resets at 5:00 AM)
    const NEPAL_OFFSET_MS = 5 * 60 * 60 * 1000 + 45 * 60 * 1000;
    const RESET_OFFSET_MS = 5 * 60 * 60 * 1000;
    const nowNepal = Date.now() + NEPAL_OFFSET_MS;
    const shifted = nowNepal - RESET_OFFSET_MS;
    const dayStartShifted = shifted - (shifted % (24 * 60 * 60 * 1000));
    const todayStart = new Date(dayStartShifted + RESET_OFFSET_MS - NEPAL_OFFSET_MS);

    if (playerEmails.length > 0) {
      // Get all deposits for these players
      const depositDocs = await transactionsCollection.find({
        userEmail: { $in: playerEmails },
        type: 'DEPOSIT',
        status: 'SUCCESS',
        isDepositFromCashout: { $ne: true }
      }).toArray();
      totalDeposits = depositDocs.reduce((acc, curr) => acc + parseFloat(curr.amount || 0), 0);

      // Get all withdrawals for these players
      const withdrawDocs = await transactionsCollection.find({
        userEmail: { $in: playerEmails },
        type: 'WITHDRAW',
        status: 'SUCCESS'
      }).toArray();
      totalWithdrawals = withdrawDocs.reduce((acc, curr) => {
        const val = (curr.payoutSent !== undefined && curr.payoutSent !== null && curr.payoutSent !== '')
          ? parseFloat(curr.payoutSent)
          : parseFloat(curr.amount || 0);
        return acc + val;
      }, 0);

      // Today's deposits (Nepal timezone midnight)
      const todayDepositDocs = depositDocs.filter(d => {
        const time = d.createdAt || d.date;
        return time && new Date(time) >= todayStart;
      });
      todayDeposits = todayDepositDocs.reduce((acc, curr) => acc + parseFloat(curr.amount || 0), 0);

      // Today's withdrawals (Nepal timezone midnight)
      const todayWithdrawDocs = withdrawDocs.filter(w => {
        const time = w.createdAt || w.date;
        return time && new Date(time) >= todayStart;
      });
      todayWithdrawals = todayWithdrawDocs.reduce((acc, curr) => {
        const val = (curr.payoutSent !== undefined && curr.payoutSent !== null && curr.payoutSent !== '')
          ? parseFloat(curr.payoutSent)
          : parseFloat(curr.amount || 0);
        return acc + val;
      }, 0);

      // Pending withdrawals of referred players
      const pendingWithdrawDocs = await transactionsCollection.find({
        userEmail: { $in: playerEmails },
        type: 'WITHDRAW',
        status: 'PENDING'
      }).toArray();
      pendingWithdrawals = pendingWithdrawDocs.reduce((acc, curr) => acc + parseFloat(curr.amount || 0), 0);

      // Enrich referred players data for team view
      const emailToDeposits = {};
      const emailToWithdrawals = {};
      depositDocs.forEach(d => {
        emailToDeposits[d.userEmail] = (emailToDeposits[d.userEmail] || 0) + parseFloat(d.amount);
      });
      withdrawDocs.forEach(w => {
        emailToWithdrawals[w.userEmail] = (emailToWithdrawals[w.userEmail] || 0) + parseFloat(w.amount);
      });

      players.forEach(p => {
        const email = p.email.toLowerCase().trim();
        const pDep = emailToDeposits[email] || 0;
        const pWith = emailToWithdrawals[email] || 0;
        if (pDep > 0) depositingPlayersCount++;
        
        // Count verification status: if verified field exists or not suspended/unverified
        const isVerified = p.status !== 'UNVERIFIED';
        if (isVerified) {
          verifiedPlayersCount++;
        } else {
          unverifiedPlayersCount++;
        }

        enrichedPlayers.push({
          id: p._id || p.id,
          name: p.name,
          email: p.email,
          status: p.status || 'ACTIVE',
          totalDeposits: pDep,
          totalWithdrawals: pWith,
          createdAt: p.createdAt || ''
        });
      });
    }

    const commissionEarned = calcCommissionFromProfit(totalDeposits, totalWithdrawals, agent.commissionRate);

    // Coins loaded into games for referred players (deposit allotments only)
    let totalCoinsUsed = 0;
    if (playerEmails.length > 0) {
      const coinsNotificationsCollection = db.collection('coinsNotifications');
      const coinDocs = await coinsNotificationsCollection.find({
        userEmail: { $in: playerEmails },
        status: 'COMPLETED',
        totalCoins: { $gt: 0 }
      }).project({ totalCoins: 1 }).toArray();
      totalCoinsUsed = coinDocs.reduce((acc, curr) => acc + parseFloat(curr.totalCoins || 0), 0);
    }

    // Sum up commission withdrawals by this agent
    const agentWithdrawDocs = await transactionsCollection.find({
      userEmail: agent.email.toLowerCase().trim(),
      type: 'AFFILIATE_COMMISSION_WITHDRAW',
      status: { $in: ['SUCCESS', 'PENDING'] }
    }).toArray();
    const totalWithdrawn = agentWithdrawDocs
      .filter((tx) => tx.status === 'SUCCESS')
      .reduce((acc, curr) => acc + parseFloat(curr.amount || 0) - parseFloat(curr.payoutHold || 0), 0);
    const pendingAgentWithdrawals = agentWithdrawDocs.filter(tx => tx.status === 'PENDING').reduce((acc, curr) => acc + parseFloat(curr.amount || 0), 0);

    const availableBalance = Math.max(0, commissionEarned - totalWithdrawn - pendingAgentWithdrawals);

    // Sub-agents created under this affiliate
    const teamAgents = await agentsCollection.find({ parentAgentCode: agent.agentCode }).toArray();
    const enrichedTeamAgents = await Promise.all(teamAgents.map(async (subAgent) => {
      const subPlayers = await usersCollection.find({ agentCode: subAgent.agentCode, role: 'user' }).toArray();
      return {
        id: subAgent.id,
        name: subAgent.name,
        email: subAgent.email,
        agentCode: subAgent.agentCode,
        accountType: subAgent.accountType || 'agent',
        role: subAgent.role || 'Agent',
        status: subAgent.status || 'ACTIVE',
        commissionRate: subAgent.commissionRate || 0,
        playersCount: subPlayers.length,
        createdAt: subAgent.createdAt || '',
        memberType: 'agent'
      };
    }));

    const referralPlayers = enrichedPlayers.map((p) => ({
      id: p.id,
      name: p.name,
      email: p.email,
      agentCode: '—',
      accountType: 'player',
      role: 'Player',
      status: p.status || 'ACTIVE',
      commissionRate: 0,
      playersCount: 0,
      totalDeposits: p.totalDeposits,
      totalWithdrawals: p.totalWithdrawals,
      createdAt: p.createdAt || '',
      memberType: 'player'
    }));

    const teamMembers = [...enrichedTeamAgents, ...referralPlayers];

    return NextResponse.json({
      success: true,
      agent: {
        id: agent.id,
        name: agent.name,
        email: agent.email,
        agentCode: agent.agentCode,
        accountType: agent.accountType || (agent.agentCode?.startsWith('SUB') ? 'sub-distributor' : 'agent'),
        role: agent.role || (agent.agentCode?.startsWith('SUB') ? 'Sub-Distributor' : 'Agent'),
        status: agent.status || 'ACTIVE',
        commissionRate: agent.commissionRate || 0,
        parentAgentCode: agent.parentAgentCode || ''
      },
      stats: {
        totalPlayers: players.length,
        verifiedPlayers: verifiedPlayersCount,
        unverifiedPlayers: unverifiedPlayersCount,
        depositingPlayers: depositingPlayersCount,
        totalDeposits,
        totalWithdrawals,
        totalCoinsUsed,
        netProfit: Math.max(0, totalDeposits - totalWithdrawals),
        commissionEarned,
        totalWithdrawn,
        availableBalance,
        todayDeposits,
        todayWithdrawals,
        pendingWithdrawals,
        pendingAgentWithdrawals
      },
      players: enrichedPlayers,
      teamAgents: enrichedTeamAgents,
      teamMembers,
      commissionWithdrawals: agentWithdrawDocs
    });
  } catch (err) {
    console.error('Agent Stats API Error:', err);
    return NextResponse.json({ success: false, message: 'Server error: ' + err.message }, { status: 500 });
  }
}
