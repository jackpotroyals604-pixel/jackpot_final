'use client';

import React, { useState, useMemo } from 'react';
import usePollingSWR from '../../hooks/usePollingSWR';
import { POLL } from '../../lib/pollingConfig';

export default function ShiftDashboardTab({ adminUser }) {
  const { data: reqData, mutate: mutateRequests } = usePollingSWR(
    `/api/account-requests?status=PENDING&limit=50&adminRole=${adminUser?.role || ''}&adminDistributorId=${adminUser?.distributorId || ''}&adminEmail=${encodeURIComponent(adminUser?.email || '')}`,
    POLL.LIVE,
    { refreshWhenHidden: true }
  );

  // Include HOLD + COMPLETED so Loaded/Invalid rows are known and never
  // re-created from leftover COINS_LOADING transactions (synthetic fallback).
  // No slim here — Verified Deposits must always show gameUsername (pending queue is small).
  const { data: coinData, mutate: mutateCoins } = usePollingSWR(
    `/api/coins-notifications?status=PENDING,CLAIM_REQUESTED,HOLD,COMPLETED&limit=150&adminRole=${adminUser?.role || ''}&adminDistributorId=${adminUser?.distributorId || ''}&adminEmail=${encodeURIComponent(adminUser?.email || '')}`,
    POLL.LIVE,
    { refreshWhenHidden: true, dedupingInterval: 200 }
  );

  // Fallback: finance-approved deposits waiting on coins (COINS_LOADING) that may
  // lack a coinsNotifications row still need to appear in Verified Deposits.
  const { data: coinsLoadingData, mutate: mutateCoinsLoading } = usePollingSWR(
    `/api/transactions?status=COINS_LOADING&limit=50&adminRole=${adminUser?.role || ''}&adminDistributorId=${adminUser?.distributorId || ''}&adminEmail=${encodeURIComponent(adminUser?.email || '')}`,
    POLL.LIVE,
    { refreshWhenHidden: true, dedupingInterval: 400 }
  );



  // Local input states for Game Credentials
  const [credsInput, setCredsInput] = useState({}); // { requestId: { username, password } }
  const [savingCredsId, setSavingCredsId] = useState(null);
  // Keep saved rows hidden even if a poll refreshes before the API finishes
  const [hiddenRequestIds, setHiddenRequestIds] = useState(() => new Set());

  // Local input states for Coin Allotments invalidation reasons
  const [invalidReasons, setInvalidReasons] = useState({}); // { notificationId: reason }
  const [processingCoinId, setProcessingCoinId] = useState(null);
  // Hide processed rows immediately (poll must not bring Invalid'd deposits back)
  const [hiddenCoinIds, setHiddenCoinIds] = useState(() => new Set());
  const [hiddenCoinTxIds, setHiddenCoinTxIds] = useState(() => new Set());

  const pendingRequests = useMemo(() => {
    const rows = reqData?.accountRequests || [];
    const seen = new Set();
    return rows.filter((r) => {
      const idKey = String(r.id ?? '');
      if (hiddenRequestIds.has(idKey)) return false;
      const key = `${String(r.userEmail || '').toLowerCase()}||${String(r.gameTitle || '').toLowerCase()}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [reqData?.accountRequests, hiddenRequestIds]);
  const pendingCoins = useMemo(() => {
    const allNotis = coinData?.coinsNotifications || [];
    // Any existing noti for a tx (incl. HOLD/COMPLETED) must block synthetic re-create.
    // Without COMPLETED in this set, Loaded rows come back after refresh from COINS_LOADING.
    const seenTx = new Set(
      allNotis.map((n) => String(n.transactionId || '')).filter(Boolean)
    );
    for (const txId of hiddenCoinTxIds) {
      if (txId) seenTx.add(String(txId));
    }

    const fromNoti = allNotis.filter(
      (n) =>
        (n.status === 'PENDING' || n.status === 'CLAIM_REQUESTED') &&
        !hiddenCoinIds.has(String(n.id))
    );
    // One row per transactionId (prevents freeplay / allotment showing twice)
    const dedupedFromNoti = [];
    const seenNotiTx = new Set();
    for (const n of fromNoti) {
      const tid = String(n.transactionId || '');
      if (tid) {
        if (seenNotiTx.has(tid)) continue;
        seenNotiTx.add(tid);
      }
      dedupedFromNoti.push(n);
    }

    const seenIds = new Set(dedupedFromNoti.map((n) => String(n.id)));
    for (const id of hiddenCoinIds) seenIds.add(String(id));

    const synthetic = (coinsLoadingData?.transactions || [])
      .filter((tx) => {
        // Only finance-approved DEPOSITS. Freeplay BONUS already has its own
        // coinsNotification — including BONUS here was duplicating freeplay rows.
        if (String(tx.type || '').toUpperCase() !== 'DEPOSIT') {
          return false;
        }
        const txId = String(tx.id || '');
        if (!txId || seenTx.has(txId) || hiddenCoinTxIds.has(txId)) return false;
        // Already invalidated / put on hold — never re-surface in Verified Deposits
        if (tx.coinsHoldNote || tx.coinsHoldAt) return false;
        return true;
      })
      .map((tx) => ({
        id: `tx-coins-${String(tx.id)}`,
        userEmail: tx.userEmail,
        // Always this transaction's game — never borrow another game's username/amount
        gameTitle: tx.gameTitle || 'Lobby',
        gameUsername: tx.gameUsername || '',
        depositAmount: parseFloat(tx.amount || 0),
        bonusApplied: 0,
        totalCoins: parseFloat(tx.amount || 0),
        status: 'PENDING',
        transactionId: String(tx.id),
        timestamp: tx.createdAt || tx.date || new Date().toISOString(),
        fromCoinsLoadingTx: true
      }))
      .filter((n) => !seenIds.has(String(n.id)) && !hiddenCoinIds.has(String(n.id)));

    // Final pass: one row per transactionId — prefer real coinsNotification over synthetic
    const merged = [...dedupedFromNoti, ...synthetic];
    const byTx = new Map();
    const noTxId = [];
    for (const row of merged) {
      const tid = String(row.transactionId || '');
      if (!tid) {
        noTxId.push(row);
        continue;
      }
      const prev = byTx.get(tid);
      if (!prev) {
        byTx.set(tid, row);
        continue;
      }
      // Keep real noti; drop synthetic duplicate
      if (prev.fromCoinsLoadingTx && !row.fromCoinsLoadingTx) {
        byTx.set(tid, row);
      }
    }
    return [...byTx.values(), ...noTxId];
  }, [coinData?.coinsNotifications, coinsLoadingData?.transactions, hiddenCoinIds, hiddenCoinTxIds]);

  // Handle saving credentials (optimistic UI + single PUT)
  const handleSaveCredentials = async (reqItem) => {
    const reqKey = String(reqItem?.id ?? '');
    const fields = credsInput[reqKey] || credsInput[reqItem.id] || {};
    const username = (fields.username || '').trim();
    const password = (fields.password || '').trim();

    if (!reqKey || reqKey.startsWith('account-')) {
      alert('This row is not a pending request. Ask the player to request an account again.');
      return;
    }
    if (!username || !password) {
      alert('Please fill in both Username and Password fields.');
      return;
    }

    setSavingCredsId(reqItem.id);
    setHiddenRequestIds((prev) => {
      const next = new Set(prev);
      next.add(reqKey);
      return next;
    });
    setCredsInput((prev) => {
      const next = { ...prev };
      delete next[reqKey];
      delete next[reqItem.id];
      return next;
    });

    // Fire request without blocking the list on a slow re-fetch
    try {
      const reqResponse = await fetch('/api/account-requests', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: reqKey,
          status: 'READY',
          gameAccountUsername: username,
          gameAccountPassword: password,
          processedBy: adminUser?.email || 'admin',
          adminEmail: adminUser?.email || ''
        })
      });

      let reqResult = null;
      const raw = await reqResponse.text();
      try {
        reqResult = raw ? JSON.parse(raw) : null;
      } catch {
        setHiddenRequestIds((prev) => {
          const next = new Set(prev);
          next.delete(reqKey);
          return next;
        });
        alert(`Error saving credentials (HTTP ${reqResponse.status}). Please try again.`);
        return;
      }

      if (reqResponse.ok && reqResult?.success) {
        mutateRequests(
          (current) => {
            if (!current?.accountRequests) return current;
            return {
              ...current,
              accountRequests: current.accountRequests.filter((r) => String(r.id) !== reqKey),
              totalRequests: Math.max(0, (current.totalRequests || 1) - 1)
            };
          },
          { revalidate: true }
        );
      } else {
        setHiddenRequestIds((prev) => {
          const next = new Set(prev);
          next.delete(reqKey);
          return next;
        });
        alert(reqResult?.message || `Failed to save credentials (HTTP ${reqResponse.status}).`);
      }
    } catch (err) {
      console.error(err);
      setHiddenRequestIds((prev) => {
        const next = new Set(prev);
        next.delete(reqKey);
        return next;
      });
      alert(err?.message ? `Error saving credentials: ${err.message}` : 'Error saving credentials.');
    } finally {
      setSavingCredsId(null);
    }
  };

  const findPendingCoin = (notiId) =>
    pendingCoins.find((n) => String(n.id) === String(notiId));

  const hideCoinRow = (notiId, transactionId) => {
    const idKey = String(notiId || '');
    const txKey = String(transactionId || '');
    if (idKey) {
      setHiddenCoinIds((prev) => {
        const next = new Set(prev);
        next.add(idKey);
        return next;
      });
    }
    if (txKey) {
      setHiddenCoinTxIds((prev) => {
        const next = new Set(prev);
        next.add(txKey);
        return next;
      });
    }
  };

  const unhideCoinRow = (notiId, transactionId) => {
    const idKey = String(notiId || '');
    const txKey = String(transactionId || '');
    if (idKey) {
      setHiddenCoinIds((prev) => {
        const next = new Set(prev);
        next.delete(idKey);
        return next;
      });
    }
    if (txKey) {
      setHiddenCoinTxIds((prev) => {
        const next = new Set(prev);
        next.delete(txKey);
        return next;
      });
    }
  };

  // Handle Allotment Loaded (Success)
  const handleCoinAllotmentSuccess = async (notiId) => {
    if (!notiId) {
      alert('Missing notification id.');
      return;
    }
    const row = findPendingCoin(notiId);
    const txId = row?.transactionId;
    setProcessingCoinId(notiId);
    hideCoinRow(notiId, txId);
    // Optimistic SWR remove — never wait on poll round-trips for Loaded UX
    mutateCoins(
      (current) => {
        if (!current?.coinsNotifications) return current;
        return {
          ...current,
          coinsNotifications: current.coinsNotifications.filter((n) => String(n.id) !== String(notiId)),
          totalNotifications: Math.max(0, (current.totalNotifications || 1) - 1)
        };
      },
      { revalidate: true }
    );
    if (txId) {
      mutateCoinsLoading(
        (current) => {
          if (!current?.transactions) return current;
          return {
            ...current,
            transactions: current.transactions.filter((t) => String(t.id) !== String(txId))
          };
        },
        { revalidate: true }
      );
    }
    try {
      const res = await fetch('/api/coins-notifications', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: notiId,
          status: 'COMPLETED',
          read: true,
          processedBy: adminUser?.email || 'admin',
          adminEmail: adminUser?.email || ''
        })
      });
      let data = null;
      try {
        data = await res.json();
      } catch {
        unhideCoinRow(notiId, txId);
        mutateCoins();
        mutateCoinsLoading();
        alert(`Error updating status (HTTP ${res.status}). Please try again.`);
        return;
      }
      if (!data.success) {
        unhideCoinRow(notiId, txId);
        mutateCoins();
        mutateCoinsLoading();
        alert(data.message || 'Failed to update status.');
      }
    } catch (err) {
      console.error(err);
      unhideCoinRow(notiId, txId);
      mutateCoins();
      mutateCoinsLoading();
      alert(err?.message ? `Error updating status: ${err.message}` : 'Error updating status.');
    } finally {
      setProcessingCoinId(null);
    }
  };

  // Handle Allotment Invalid (Hold / Notes)
  const handleCoinAllotmentInvalid = async (notiId) => {
    const reason = String(invalidReasons[notiId] || invalidReasons[String(notiId)] || '').trim();
    if (!reason) {
      alert('Please enter a reason for invalidating this transaction.');
      return;
    }
    if (!notiId) {
      alert('Missing notification id.');
      return;
    }

    const row = findPendingCoin(notiId);
    const txId = row?.transactionId;
    setProcessingCoinId(notiId);
    hideCoinRow(notiId, txId);
    setInvalidReasons((prev) => {
      const next = { ...prev };
      delete next[notiId];
      delete next[String(notiId)];
      return next;
    });
    mutateCoins(
      (current) => {
        if (!current?.coinsNotifications) return current;
        return {
          ...current,
          coinsNotifications: current.coinsNotifications.filter((n) => String(n.id) !== String(notiId)),
          totalNotifications: Math.max(0, (current.totalNotifications || 1) - 1)
        };
      },
      { revalidate: true }
    );
    if (txId) {
      mutateCoinsLoading(
        (current) => {
          if (!current?.transactions) return current;
          return {
            ...current,
            transactions: current.transactions.filter((t) => String(t.id) !== String(txId))
          };
        },
        { revalidate: true }
      );
    }
    try {
      const res = await fetch('/api/coins-notifications', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: notiId,
          status: 'HOLD',
          read: true,
          holdNote: reason,
          processedBy: adminUser?.email || 'admin',
          adminEmail: adminUser?.email || ''
        })
      });
      let data = null;
      try {
        data = await res.json();
      } catch {
        unhideCoinRow(notiId, txId);
        mutateCoins();
        mutateCoinsLoading();
        alert(`Error setting hold note (HTTP ${res.status}). Please try again.`);
        return;
      }
      if (!data.success) {
        unhideCoinRow(notiId, txId);
        mutateCoins();
        mutateCoinsLoading();
        alert(data.message || 'Failed to set hold note.');
      }
    } catch (err) {
      console.error(err);
      unhideCoinRow(notiId, txId);
      mutateCoins();
      mutateCoinsLoading();
      alert(err?.message ? `Error setting hold note: ${err.message}` : 'Error setting hold note.');
    } finally {
      setProcessingCoinId(null);
    }
  };

  // Handle Allotment Direct Cancel (without requiring text note)
  const handleCoinAllotmentCancel = async (notiId) => {
    if (!window.confirm('Are you sure you want to cancel this coins allotment directly?')) {
      return;
    }
    if (!notiId) {
      alert('Missing notification id.');
      return;
    }

    const row = findPendingCoin(notiId);
    const txId = row?.transactionId;
    setProcessingCoinId(notiId);
    hideCoinRow(notiId, txId);
    mutateCoins(
      (current) => {
        if (!current?.coinsNotifications) return current;
        return {
          ...current,
          coinsNotifications: current.coinsNotifications.filter((n) => String(n.id) !== String(notiId)),
          totalNotifications: Math.max(0, (current.totalNotifications || 1) - 1)
        };
      },
      { revalidate: true }
    );
    if (txId) {
      mutateCoinsLoading(
        (current) => {
          if (!current?.transactions) return current;
          return {
            ...current,
            transactions: current.transactions.filter((t) => String(t.id) !== String(txId))
          };
        },
        { revalidate: true }
      );
    }
    try {
      const res = await fetch('/api/coins-notifications', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: notiId,
          status: 'CANCELLED',
          read: true,
          holdNote: 'Cancelled by Administrator',
          processedBy: adminUser?.email || 'admin',
          adminEmail: adminUser?.email || ''
        })
      });
      let data = null;
      try {
        data = await res.json();
      } catch {
        unhideCoinRow(notiId, txId);
        mutateCoins();
        mutateCoinsLoading();
        alert(`Error cancelling allotment (HTTP ${res.status}). Please try again.`);
        return;
      }
      if (!data.success) {
        unhideCoinRow(notiId, txId);
        mutateCoins();
        mutateCoinsLoading();
        alert(data.message || 'Failed to cancel allotment.');
      }
    } catch (err) {
      console.error(err);
      unhideCoinRow(notiId, txId);
      mutateCoins();
      mutateCoinsLoading();
      alert(err?.message ? `Error cancelling allotment: ${err.message}` : 'Error cancelling allotment.');
    } finally {
      setProcessingCoinId(null);
    }
  };


  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', animation: 'fade-in 0.2s ease-out' }}>
      
      {/* SECTION 1: GAME ACCOUNTS CREDENTIALS */}
      <section className="admin-section-card" style={{ background: '#0a0d16', border: '1px solid rgba(255,255,255,0.05)' }}>
        <div className="section-card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <div>
            <h3 style={{ fontSize: '0.9rem', color: '#fff', fontWeight: 'bold' }}>Game Accounts Credentials</h3>
            <span className="game-tap-tip">Only accounts missing username/password are shown. Live updates every 1 second.</span>
          </div>
          <span className="admin-badge-preview b-ready" style={{ background: 'rgba(168,85,247,0.15)', color: '#a855f7', border: '1px solid rgba(168,85,247,0.25)' }}>SECURE</span>
        </div>

        <div className="table-responsive">
          <table className="admin-table">
            <thead>
              <tr>
                <th>NAME</th>
                <th>GAME</th>
                <th>USERNAME</th>
                <th>PASSWORD</th>
                <th>ACTION</th>
              </tr>
            </thead>
            <tbody>
              {pendingRequests.length === 0 ? (
                <tr>
                  <td colSpan="5" className="text-center text-muted" style={{ padding: '1.5rem' }}>No credentials requests pending.</td>
                </tr>
              ) : (
                pendingRequests.map((req) => {
                  const reqKey = String(req.id ?? '');
                  const draft = credsInput[reqKey] || credsInput[req.id] || {};
                  return (
                  <tr key={reqKey || `${req.userEmail}-${req.gameTitle}`}>
                    <td>
                      <strong>{req.userName || req.userEmail || '—'}</strong>
                      <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginTop: '0.15rem', wordBreak: 'break-all' }}>
                        {req.userEmail}
                      </div>
                    </td>
                    <td><span className="admin-badge-preview b-new" style={{ fontSize: '0.65rem' }}>{req.gameTitle}</span></td>
                    <td>
                      <input
                        type="text"
                        placeholder="Enter username"
                        autoComplete="off"
                        value={draft.username || ''}
                        onChange={(e) => setCredsInput(prev => ({
                          ...prev,
                          [reqKey]: { ...(prev[reqKey] || prev[req.id] || {}), username: e.target.value }
                        }))}
                        style={{ background: '#070912', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', fontSize: '0.75rem', padding: '0.35rem 0.5rem', borderRadius: '6px', width: '100%', minWidth: '120px' }}
                      />
                    </td>
                    <td>
                      <input
                        type="text"
                        placeholder="Enter password"
                        autoComplete="off"
                        value={draft.password || ''}
                        onChange={(e) => setCredsInput(prev => ({
                          ...prev,
                          [reqKey]: { ...(prev[reqKey] || prev[req.id] || {}), password: e.target.value }
                        }))}
                        style={{ background: '#070912', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', fontSize: '0.75rem', padding: '0.35rem 0.5rem', borderRadius: '6px', width: '100%', minWidth: '120px' }}
                      />
                    </td>
                    <td>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', alignItems: 'center' }}>
                          <button
                            onClick={() => handleSaveCredentials(req)}
                            disabled={savingCredsId === req.id || savingCredsId === reqKey}
                            className="submit-btn"
                            style={{ background: 'var(--gold-primary)', color: '#000', fontWeight: 'bold', margin: 0, padding: '0.35rem 1rem', width: 'auto', fontSize: '0.7rem' }}
                          >
                            {savingCredsId === req.id || savingCredsId === reqKey ? 'Saving...' : 'Save'}
                          </button>
                          {req.distributorType === 'B' && (
                            <span style={{ fontSize: '0.6rem', color: '#3b82f6', display: 'block', textAlign: 'center' }}>
                              Managed by {req.distributorName || 'Distributor'}
                            </span>
                          )}
                        </div>
                    </td>
                  </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* SECTION 2: VERIFIED DEPOSITS */}
      <section className="admin-section-card" style={{ background: '#0a0d16', border: '1px solid rgba(255,255,255,0.05)' }}>
        <div className="section-card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <div>
            <h3 style={{ fontSize: '0.9rem', color: '#fff', fontWeight: 'bold' }}>Verified Deposits</h3>
            <span className="game-tap-tip">After finance verifies a deposit, it appears here for coin loading. Live updates every 1 second.</span>
          </div>
          <span className="admin-badge-preview b-ready" style={{ background: 'rgba(34,197,94,0.15)', color: '#2ecc71', border: '1px solid rgba(34,197,94,0.25)' }}>LIVE DEPOSITS</span>
        </div>

        <div className="table-responsive">
          <table className="admin-table">
            <thead>
              <tr>
                <th>USERNAME</th>
                <th>GAME</th>
                <th>TYPE</th>
                <th>LD AMOUNT</th>
                <th>ACTION</th>
              </tr>
            </thead>
            <tbody>
              {pendingCoins.filter(n => n.totalCoins >= 0).length === 0 ? (
                <tr>
                  <td colSpan="5" className="text-center text-muted" style={{ padding: '1.5rem' }}>No pending deposits to allot.</td>
                </tr>
              ) : (
                pendingCoins.filter(n => n.totalCoins >= 0).map((noti) => (
                  <tr key={noti.id}>
                    <td>
                      <strong>{noti.gameUsername || noti.userEmail || '—'}</strong>
                    </td>
                    <td><span className="admin-badge-preview b-hot" style={{ fontSize: '0.65rem' }}>{noti.gameTitle}</span></td>
                    <td>
                      <span style={{ fontSize: '0.725rem', color: noti.isDepositFromCashout ? '#eab308' : noti.isLevelReward ? '#facc15' : '#2ecc71', textTransform: 'uppercase', fontWeight: 'bold' }}>
                        {noti.isDepositFromCashout ? 'FROM CASHOUT' : noti.isLevelReward ? 'LEVEL REWARD' : 'deposit'}
                      </span>
                    </td>
                    <td>
                      <strong style={{ color: 'var(--gold-primary)', fontSize: '0.85rem' }}>
                        {Math.floor(Math.abs(Number(noti.totalCoins) || 0))}
                      </strong>
                    </td>
                    <td>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <button
                              onClick={() => handleCoinAllotmentSuccess(noti.id)}
                              disabled={processingCoinId === noti.id}
                              className="submit-btn"
                              style={{ background: '#22c55e', color: '#fff', margin: 0, padding: '0.35rem 0.85rem', width: 'auto', fontSize: '0.7rem', fontWeight: 'bold' }}
                            >
                              Loaded
                            </button>
                            <input
                              type="text"
                              placeholder="Reason (required)"
                              value={invalidReasons[noti.id] || invalidReasons[String(noti.id)] || ''}
                              onChange={(e) => setInvalidReasons(prev => ({
                                ...prev,
                                [noti.id]: e.target.value,
                                [String(noti.id)]: e.target.value
                              }))}
                              style={{ background: '#070912', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', fontSize: '0.725rem', padding: '0.35rem 0.5rem', borderRadius: '6px', width: '140px' }}
                            />
                            <button
                              onClick={() => handleCoinAllotmentInvalid(noti.id)}
                              disabled={processingCoinId === noti.id}
                              className="submit-btn"
                              style={{ background: '#ef4444', color: '#fff', margin: 0, padding: '0.35rem 0.85rem', width: 'auto', fontSize: '0.7rem', fontWeight: 'bold' }}
                            >
                              Invalid
                            </button>
                            <button
                              onClick={() => handleCoinAllotmentCancel(noti.id)}
                              disabled={processingCoinId === noti.id}
                              className="submit-btn"
                              style={{ background: '#991b1b', color: '#fff', margin: 0, padding: '0.35rem 0.85rem', width: 'auto', fontSize: '0.7rem', fontWeight: 'bold' }}
                              title="Cancel coins direct without reason"
                            >
                              Cancel Direct
                            </button>
                          </div>
                          {noti.distributorType === 'B' && (
                            <span style={{ fontSize: '0.6rem', color: '#3b82f6', display: 'block' }}>
                              Managed by {noti.distributorName || 'Distributor'}
                            </span>
                          )}
                        </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* SECTION 3: VERIFIED WITHDRAWALS */}
      <section className="admin-section-card" style={{ background: '#0a0d16', border: '1px solid rgba(255,255,255,0.05)', marginTop: '1.5rem' }}>
        <div className="section-card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <div>
            <h3 style={{ fontSize: '0.9rem', color: '#fff', fontWeight: 'bold' }}>Verified Withdrawals</h3>
            <span className="game-tap-tip">Mark verified withdrawals as processed (Withdrawal) or invalid.</span>
          </div>
          <span className="admin-badge-preview b-hot" style={{ background: 'rgba(239,68,68,0.15)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.25)' }}>LIVE WITHDRAWALS</span>
        </div>

        <div className="table-responsive">
          <table className="admin-table">
            <thead>
              <tr>
                <th>USERNAME</th>
                <th>GAME</th>
                <th>TYPE</th>
                <th>LD AMOUNT</th>
                <th>ACTION</th>
              </tr>
            </thead>
            <tbody>
              {pendingCoins.filter(n => n.totalCoins < 0).length === 0 ? (
                <tr>
                  <td colSpan="5" className="text-center text-muted" style={{ padding: '1.5rem' }}>No pending withdrawals to allot.</td>
                </tr>
              ) : (
                pendingCoins.filter(n => n.totalCoins < 0).map((noti) => (
                  <tr key={noti.id}>
                    <td>
                      <strong>{noti.gameUsername || noti.userEmail || '—'}</strong>
                    </td>
                    <td>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '0.2rem' }}>
                        <span className="admin-badge-preview b-hot" style={{ fontSize: '0.65rem' }}>{noti.gameTitle}</span>
                        {noti.isFreeplayWithdraw && (
                          <div style={{ fontSize: '0.55rem', color: '#ff4d6d', fontWeight: 'bold', marginTop: '0.15rem', display: 'inline-block' }}>
                            ⚠️ FREEPLAY WIN: MAX PAYOUT $30
                          </div>
                        )}
                      </div>
                    </td>
                    <td>
                      <span style={{ fontSize: '0.725rem', color: '#ff4d6d', textTransform: 'uppercase', fontWeight: 'bold' }}>
                        withdraw
                      </span>
                    </td>
                    <td>
                      <strong style={{ color: '#ff4d6d', fontSize: '0.85rem' }}>
                        {Math.floor(Math.abs(Number(noti.totalCoins) || 0))}
                      </strong>
                    </td>
                    <td>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <button
                              onClick={() => handleCoinAllotmentSuccess(noti.id)}
                              disabled={processingCoinId === noti.id}
                              className="submit-btn"
                              style={{ background: '#e11d48', color: '#fff', margin: 0, padding: '0.35rem 0.85rem', width: 'auto', fontSize: '0.7rem', fontWeight: 'bold' }}
                            >
                              Withdrawal
                            </button>
                            <input
                              type="text"
                              placeholder="Reason (required)"
                              value={invalidReasons[noti.id] || invalidReasons[String(noti.id)] || ''}
                              onChange={(e) => setInvalidReasons(prev => ({
                                ...prev,
                                [noti.id]: e.target.value,
                                [String(noti.id)]: e.target.value
                              }))}
                              style={{ background: '#070912', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', fontSize: '0.725rem', padding: '0.35rem 0.5rem', borderRadius: '6px', width: '140px' }}
                            />
                            <button
                              onClick={() => handleCoinAllotmentInvalid(noti.id)}
                              disabled={processingCoinId === noti.id}
                              className="submit-btn"
                              style={{ background: '#ef4444', color: '#fff', margin: 0, padding: '0.35rem 0.85rem', width: 'auto', fontSize: '0.7rem', fontWeight: 'bold' }}
                            >
                              Invalid
                            </button>
                            <button
                              onClick={() => handleCoinAllotmentCancel(noti.id)}
                              disabled={processingCoinId === noti.id}
                              className="submit-btn"
                              style={{ background: '#991b1b', color: '#fff', margin: 0, padding: '0.35rem 0.85rem', width: 'auto', fontSize: '0.7rem', fontWeight: 'bold' }}
                              title="Cancel coins direct without reason"
                            >
                              Cancel Direct
                            </button>
                          </div>
                          {noti.distributorType === 'B' && (
                            <span style={{ fontSize: '0.6rem', color: '#3b82f6', display: 'block' }}>
                              Managed by {noti.distributorName || 'Distributor'}
                            </span>
                          )}
                        </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

    </div>
  );
}
