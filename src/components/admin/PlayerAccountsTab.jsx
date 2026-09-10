import React, { useState, useEffect } from 'react';
import PanelModalBackdrop from '../PanelModalBackdrop';
import useSWR from 'swr';
import { AdjustBalanceModal, AdminResetPasswordModal } from '../Modals';

const fetcher = (...args) => fetch(...args).then((res) => res.json());

export default function PlayerAccountsTab({ adminUser, onDeleteUser }) {
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(1);
  const limit = 15;

  // Selected player for history modal inspection
  const [inspectedUser, setInspectedUser] = useState(null);

  // Manual Player Registration State
  const [registerModalOpen, setRegisterModalOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newReferredBy, setNewReferredBy] = useState('');
  const [registerResult, setRegisterResult] = useState(null);
  const [isRegistering, setIsRegistering] = useState(false);
  // Modal states for balance and password reset
  const [balanceModalOpen, setBalanceModalOpen] = useState(false);
  const [adjustBalanceUser, setAdjustBalanceUser] = useState(null);
  const [passwordModalOpen, setPasswordModalOpen] = useState(false);
  const [resetPasswordUser, setResetPasswordUser] = useState(null);

  const handleAdjustBalanceSubmit = async (email, targetCoins) => {
    const response = await fetch('/api/users', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, coins: targetCoins })
    });
    const resData = await response.json();
    if (resData.success) {
      alert('Player balance adjusted successfully!');
      mutate();
    } else {
      throw new Error(resData.message || 'Failed to adjust balance.');
    }
  };

  const handleResetPasswordSubmit = async (email, newPassword) => {
    const response = await fetch('/api/users', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: newPassword })
    });
    const resData = await response.json();
    if (resData.success) {
      alert('Player password updated successfully!');
      mutate();
    } else {
      throw new Error(resData.message || 'Failed to reset password.');
    }
  };

  const handleToggleSuspend = async (user) => {
    const isSuspended = user.status === 'SUSPENDED';
    const actionText = isSuspended ? 'reactivate' : 'suspend';
    if (!window.confirm(`Are you sure you want to ${actionText} player account "${user.email}"?`)) {
      return;
    }
    try {
      const response = await fetch('/api/users', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: user.email,
          status: isSuspended ? 'ACTIVE' : 'SUSPENDED'
        })
      });
      const resData = await response.json();
      if (resData.success) {
        alert(`Account successfully ${isSuspended ? 'reactivated' : 'suspended'}!`);
        mutate();
      } else {
        alert(resData.message || 'Failed to update player status.');
      }
    } catch (err) {
      console.error(err);
      alert('Error updating player status.');
    }
  };

  const handleUnlinkPlayerDevice = async (user) => {
    if (!window.confirm(`Are you sure you want to release device lock for "${user.email}"? The player will be able to register a new account from their device.`)) {
      return;
    }
    try {
      const response = await fetch('/api/admin/devices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'unlink',
          email: user.email,
          adminRole: adminUser?.role || 'admin',
          adminEmail: adminUser?.email || ''
        })
      });
      const resData = await response.json();
      if (resData.success) {
        alert(`Device lock released successfully for "${user.email}"!`);
        mutate();
      } else {
        alert(resData.message || 'Failed to release device lock.');
      }
    } catch (err) {
      console.error(err);
      alert('Error releasing device lock.');
    }
  };

  const handleManualRegister = async (e) => {
    e.preventDefault();
    if (!newName.trim() || !newEmail.trim()) {
      alert('Please provide player Name and Gmail email.');
      return;
    }
    setIsRegistering(true);
    try {
      const response = await fetch('/api/users/manual-create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newName,
          email: newEmail,
          password: newPassword,
          referredBy: newReferredBy
        })
      });
      const resData = await response.json();
      if (resData.success) {
        setRegisterResult(resData.player);
        mutate();
      } else {
        alert(resData.message || 'Failed to register player.');
      }
    } catch (err) {
      console.error(err);
      alert('Network error registering player.');
    } finally {
      setIsRegistering(false);
    }
  };

  const resetRegisterForm = () => {
    setNewName('');
    setNewEmail('');
    setNewPassword('');
    setNewReferredBy('');
    setRegisterResult(null);
    setRegisterModalOpen(false);
  };
  const [userHistory, setUserHistory] = useState({
    deposits: [],
    withdrawals: [],
    holdAllotments: [],
    referrals: [],
    referralRewards: [],
    loading: false
  });

  // Debounce search typing
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 400);
    return () => clearTimeout(handler);
  }, [search]);

  const { data, error, mutate } = useSWR(
    `/api/users?page=${page}&limit=${limit}&search=${encodeURIComponent(debouncedSearch)}&adminRole=${adminUser?.role || ''}&adminDistributorId=${adminUser?.distributorId || ''}&adminEmail=${encodeURIComponent(adminUser?.email || '')}&includeDistributorPlayers=1`,
    fetcher
  );

  const users = data?.users || [];
  const totalUsers = data?.totalUsers || 0;
  const totalPages = data?.totalPages || 1;

  // Fetch inspected player's financial history dynamically
  useEffect(() => {
    if (!inspectedUser) return;

    const fetchHistory = async () => {
      setUserHistory((prev) => ({ ...prev, loading: true }));
      try {
        const emailQ = encodeURIComponent(inspectedUser.email);
        const [txRes, coinsRes, refsRes, rewardsRes] = await Promise.all([
          fetch(`/api/transactions?limit=1000&email=${emailQ}`).then((r) => r.json()),
          fetch(`/api/coins-notifications?limit=1000&email=${emailQ}`).then((r) => r.json()),
          fetch(`/api/users?referredBy=${emailQ}`).then((r) => r.json()),
          fetch(`/api/referrals/pending?email=${emailQ}&all=1`).then((r) => r.json())
        ]);

        const txs = txRes.transactions || [];
        const notis = coinsRes.coinsNotifications || [];

        setUserHistory({
          deposits: txs.filter((t) => t.type === 'DEPOSIT'),
          withdrawals: txs.filter((t) => t.type === 'WITHDRAW'),
          holdAllotments: notis.filter((n) => n.status === 'HOLD'),
          referrals: refsRes.referrals || [],
          referralRewards: rewardsRes.pending || [],
          loading: false
        });
      } catch (err) {
        console.error('Failed to load user profile history:', err);
        setUserHistory((prev) => ({ ...prev, loading: false }));
      }
    };

    fetchHistory();
  }, [inspectedUser]);

  const handleDelete = async (email) => {
    if (window.confirm(`Are you sure you want to delete user account "${email}"?`)) {
      await onDeleteUser(email);
      mutate();
    }
  };

  const handleReleaseHold = async (notiId) => {
    try {
      const response = await fetch('/api/coins-notifications', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: notiId, status: 'PENDING', holdNote: '' })
      });
      const resData = await response.json();
      if (resData.success) {
        alert('Allotment request successfully sent back to Coins Manager!');
        
        // Refresh local hold allotments list
        if (inspectedUser) {
          const coinsRes = await fetch(`/api/coins-notifications?limit=1000&email=${encodeURIComponent(inspectedUser.email)}`).then((r) => r.json());
          const notis = coinsRes.coinsNotifications || [];
          setUserHistory((prev) => ({
            ...prev,
            holdAllotments: notis.filter((n) => n.status === 'HOLD')
          }));
        }
      } else {
        alert(resData.message || 'Failed to release hold.');
      }
    } catch (err) {
      console.error(err);
      alert('Error updating allotment status.');
    }
  };

  const handlePrevPage = () => {
    if (page > 1) setPage(page - 1);
  };

  const handleNextPage = () => {
    if (page < totalPages) setPage(page + 1);
  };

  const isLoading = !data && !error;

  // Check if current logged in admin user is super admin or operational manager
  const cleanAdminRoles = (adminUser?.role || '').toLowerCase().split(',').map(r => r.trim());
  const isManagerOrAdmin = cleanAdminRoles.some(r => r === 'admin' || r === 'operation_admin');

  // Sum calculations for financial summaries
  const successDepositsSum = userHistory.deposits.filter((t) => t.status === 'SUCCESS').reduce((sum, t) => sum + parseFloat(t.amount || 0), 0);
  const pendingDepositsSum = userHistory.deposits.filter((t) => t.status === 'PENDING').reduce((sum, t) => sum + parseFloat(t.amount || 0), 0);

  const successWithdrawalsSum = userHistory.withdrawals.filter((t) => t.status === 'SUCCESS').reduce((sum, t) => sum + parseFloat(t.amount || 0), 0);
  const pendingWithdrawalsSum = userHistory.withdrawals.filter((t) => t.status === 'PENDING' || t.status === 'PENDING_COINS').reduce((sum, t) => sum + parseFloat(t.amount || 0), 0);

  return (
    <section className="admin-section-card" style={{ animation: 'fade-in 0.2s ease-out' }}>
      <div className="section-card-header" style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '1.25rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', flexWrap: 'wrap', gap: '0.5rem' }}>
          <h3><i className="fa-solid fa-users text-red"></i> Player Accounts ({totalUsers} Registered)</h3>
          {isManagerOrAdmin && (
            <button
              onClick={() => setRegisterModalOpen(true)}
              className="submit-btn"
              style={{
                margin: 0,
                width: 'auto',
                padding: '0.5rem 1.25rem',
                background: 'var(--gold-primary)',
                color: '#000',
                fontWeight: 'bold',
                fontSize: '0.75rem',
                display: 'flex',
                alignItems: 'center',
                gap: '0.35rem'
              }}
            >
              <i className="fa-solid fa-user-plus"></i> Register New Player
            </button>
          )}
        </div>
        
        <div className="input-wrapper search-wrapper" style={{ background: '#0b0d16', width: '100%' }}>
          <i className="fa-solid fa-magnifying-glass input-icon"></i>
          <input
            type="text"
            placeholder="Search players by name or email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      <div className="table-responsive">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Full Name</th>
              <th>Email Address</th>
              <th>Referral Code</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan="6" className="text-center text-muted" style={{ padding: '2rem' }}>
                  <i className="fa-solid fa-spinner fa-spin" style={{ color: 'var(--gold-primary)', marginRight: '6px' }}></i> Loading accounts...
                </td>
              </tr>
            ) : users.length === 0 ? (
              <tr><td colSpan="6" className="text-center text-muted">No matching players.</td></tr>
            ) : (
              users.map((user) => (
                <tr key={user.email}>
                  <td>{user.name}</td>
                  <td>{user.email}</td>
                  <td>
                    <span style={{ fontFamily: 'monospace', fontSize: '0.75rem', color: '#a855f7', fontWeight: 700 }}>
                      {user.referralCode || '—'}
                    </span>
                  </td>
                  <td>
                    <span className={`admin-badge-preview b-${user.status === 'SUSPENDED' ? 'failed' : 'ready'}`}>
                      {user.status === 'SUSPENDED' ? 'SUSPENDED' : 'ACTIVE'}
                    </span>
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                      {/* Inspect History */}
                      <button
                        className="action-row-btn"
                        onClick={() => setInspectedUser(user)}
                        title="Inspect Player Profile & History"
                        style={{ background: 'rgba(255,215,0,0.1)', border: '1px solid rgba(255,215,0,0.3)', color: 'var(--gold-primary)' }}
                      >
                        <i className="fa-solid fa-clock-rotate-left"></i>
                      </button>

                      {/* Reset Password */}
                      {isManagerOrAdmin && (
                        <button
                          className="action-row-btn"
                          onClick={() => { setResetPasswordUser(user); setPasswordModalOpen(true); }}
                          title="Reset Password"
                          style={{ background: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.3)', color: '#3b82f6' }}
                        >
                          <i className="fa-solid fa-key"></i>
                        </button>
                      )}

                      {/* Suspend / Reactivate */}
                      {isManagerOrAdmin && (
                        <button
                          className="action-row-btn"
                          onClick={() => handleToggleSuspend(user)}
                          title={user.status === 'SUSPENDED' ? 'Reactivate User' : 'Suspend User'}
                          style={{
                            background: user.status === 'SUSPENDED' ? 'rgba(239,68,68,0.15)' : 'rgba(245,158,11,0.1)',
                            border: user.status === 'SUSPENDED' ? '1px solid rgba(239,68,68,0.4)' : '1px solid rgba(245,158,11,0.3)',
                            color: user.status === 'SUSPENDED' ? '#ef4444' : '#f59e0b'
                          }}
                        >
                          {user.status === 'SUSPENDED' ? <i className="fa-solid fa-user-lock"></i> : <i className="fa-solid fa-ban"></i>}
                        </button>
                      )}

                      {/* Unlink Device Lock */}
                      {isManagerOrAdmin && (
                        <button
                          className="action-row-btn"
                          onClick={() => handleUnlinkPlayerDevice(user)}
                          title="Release Device Lock (Unlink Device)"
                          style={{ background: 'rgba(56,189,248,0.1)', border: '1px solid rgba(56,189,248,0.3)', color: '#38bdf8' }}
                        >
                          <i className="fa-solid fa-link-slash"></i>
                        </button>
                      )}

                      {/* Delete User */}
                      <button
                        className="action-row-btn btn-delete"
                        onClick={() => handleDelete(user.email)}
                        title="Delete User"
                      >
                        <i className="fa-solid fa-user-minus"></i>
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination Controls */}
      {totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1.5rem', padding: '0 0.5rem' }}>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            Showing page {page} of {totalPages} ({totalUsers} entries)
          </span>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button
              onClick={handlePrevPage}
              disabled={page === 1}
              className="action-row-btn"
              style={{ width: 'auto', padding: '0.4rem 0.8rem', fontSize: '0.7rem', opacity: page === 1 ? 0.4 : 1, cursor: page === 1 ? 'not-allowed' : 'pointer' }}
            >
              &larr; Prev
            </button>
            <button
              onClick={handleNextPage}
              disabled={page === totalPages}
              className="action-row-btn"
              style={{ width: 'auto', padding: '0.4rem 0.8rem', fontSize: '0.7rem', opacity: page === totalPages ? 0.4 : 1, cursor: page === totalPages ? 'not-allowed' : 'pointer' }}
            >
              Next &rarr;
            </button>
          </div>
        </div>
      )}

      {/* INSPECTED PLAYER HISTORY OVERLAY MODAL */}
      {inspectedUser && (
        <PanelModalBackdrop onClick={() => setInspectedUser(null)}>
          <div className="modal-content border-gold" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '680px', width: '90%' }}>
            <div className="modal-header">
              <h3>
                <i className="fa-solid fa-address-card gold-text"></i> Player History Profile
              </h3>
              <button type="button" className="close-modal" onClick={() => setInspectedUser(null)}>
                &times;
              </button>
            </div>
            <div className="modal-body" style={{ maxHeight: '75vh', overflowY: 'auto' }}>
              <div style={{ marginBottom: '1.25rem', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '0.75rem' }}>
                <h4 style={{ margin: 0, fontSize: '1rem', color: '#fff' }}>{inspectedUser.name}</h4>
                <p style={{ margin: '0.2rem 0 0 0', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  Email: <strong>{inspectedUser.email}</strong>
                </p>
              </div>

              {userHistory.loading ? (
                <div style={{ padding: '2rem', textAlign: 'center', opacity: 0.5 }}>
                  <i className="fa-solid fa-spinner fa-spin" style={{ fontSize: '2rem', color: 'var(--gold-primary)', marginBottom: '0.5rem', display: 'block' }}></i>
                  <p style={{ fontSize: '0.75rem' }}>Loading player activity logs...</p>
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '1.5rem' }}>
                  
                  {/* Financial Summaries Grid */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                    <div style={{ background: 'rgba(74, 222, 128, 0.03)', border: '1px solid rgba(74, 222, 128, 0.1)', padding: '0.85rem', borderRadius: '8px' }}>
                      <span style={{ fontSize: '0.65rem', textTransform: 'uppercase', color: '#4ade80', fontWeight: 'bold' }}>Deposited Cash</span>
                      <div style={{ fontSize: '1.15rem', color: '#fff', fontWeight: 'bold', margin: '0.25rem 0' }}>
                        ${successDepositsSum.toFixed(2)}
                      </div>
                      <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>
                        Pending Checkouts: ${pendingDepositsSum.toFixed(2)}
                      </span>
                    </div>

                    <div style={{ background: 'rgba(239, 68, 68, 0.03)', border: '1px solid rgba(239, 68, 68, 0.1)', padding: '0.85rem', borderRadius: '8px' }}>
                      <span style={{ fontSize: '0.65rem', textTransform: 'uppercase', color: '#f87171', fontWeight: 'bold' }}>Withdrawn Payouts</span>
                      <div style={{ fontSize: '1.15rem', color: '#fff', fontWeight: 'bold', margin: '0.25rem 0' }}>
                        ${successWithdrawalsSum.toFixed(2)}
                      </div>
                      <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>
                        Pending Payouts: ${pendingWithdrawalsSum.toFixed(2)}
                      </span>
                    </div>
                  </div>

                  {/* Referrals — count + bonus claim status (read-only) */}
                  <div>
                    <h5 style={{ fontSize: '0.8rem', textTransform: 'uppercase', color: 'var(--gold-primary)', marginBottom: '0.6rem', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '0.35rem' }}>
                      <i className="fa-solid fa-user-group"></i> Referrals
                    </h5>

                    <div style={{ background: 'rgba(168, 85, 247, 0.06)', border: '1px solid rgba(168, 85, 247, 0.2)', padding: '0.85rem', borderRadius: '8px', marginBottom: '0.75rem' }}>
                      <span style={{ fontSize: '0.65rem', textTransform: 'uppercase', color: '#c084fc', fontWeight: 'bold' }}>Total Referred Players</span>
                      <div style={{ fontSize: '1.15rem', color: '#fff', fontWeight: 'bold', margin: '0.25rem 0' }}>
                        {userHistory.referrals.length}
                      </div>
                      {userHistory.referrals.length > 0 ? (
                        <ul style={{ margin: '0.35rem 0 0', paddingLeft: '1.1rem', fontSize: '0.7rem', color: 'var(--text-muted)', lineHeight: 1.55 }}>
                          {userHistory.referrals.map((ref) => (
                            <li key={ref.email || ref.name}>
                              <strong style={{ color: '#fff' }}>{ref.name || ref.email || '—'}</strong>
                              {ref.name && ref.email ? (
                                <span style={{ color: 'var(--gold-primary)' }}> · {ref.email}</span>
                              ) : null}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>
                          This player has not referred anyone yet.
                        </span>
                      )}
                    </div>

                    <h5 style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: '#c084fc', marginBottom: '0.5rem' }}>
                      Referral Bonuses
                    </h5>
                    {userHistory.referralRewards.length === 0 ? (
                      <p style={{ fontSize: '0.725rem', color: 'var(--text-muted)', opacity: 0.7, fontStyle: 'italic', margin: '0.35rem 0' }}>
                        No referral bonus earned yet for this player.
                      </p>
                    ) : (
                      <div className="table-responsive" style={{ maxHeight: '220px', overflowY: 'auto' }}>
                        <table className="admin-table" style={{ fontSize: '0.725rem' }}>
                          <thead>
                            <tr>
                              <th>Referral</th>
                              <th>Coins</th>
                              <th>Status</th>
                            </tr>
                          </thead>
                          <tbody>
                            {userHistory.referralRewards.map((reward) => {
                              const refEmail = String(reward.refereeEmail || '').toLowerCase().trim();
                              const matched = userHistory.referrals.find(
                                (r) => String(r.email || '').toLowerCase().trim() === refEmail
                              );
                              const displayName = matched?.name || reward.refereeEmail || '—';
                              const status = String(reward.status || 'PENDING').toUpperCase();
                              const statusColor =
                                status === 'CLAIMED'
                                  ? '#4ade80'
                                  : status === 'PENDING'
                                    ? '#fbbf24'
                                    : '#c084fc';
                              return (
                                <tr key={reward.id || `${refEmail}-${reward.timestamp}`}>
                                  <td>
                                    <div style={{ color: '#fff', fontWeight: 600 }}>{displayName}</div>
                                    {matched?.name && reward.refereeEmail ? (
                                      <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)' }}>{reward.refereeEmail}</div>
                                    ) : null}
                                  </td>
                                  <td style={{ color: 'var(--gold-primary)', fontWeight: 'bold' }}>
                                    {Number(reward.rewardCoins || 0)}
                                  </td>
                                  <td>
                                    <span style={{ color: statusColor, fontWeight: 'bold', textTransform: 'uppercase', fontSize: '0.65rem' }}>
                                      {status === 'PENDING_ACCOUNT_APPROVAL' ? 'PENDING ACCOUNT' : status}
                                    </span>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>

                  {/* Hold Funds / Pending Coin Allotment Block */}
                  <div>
                    <h5 style={{ fontSize: '0.8rem', textTransform: 'uppercase', color: 'var(--gold-primary)', marginBottom: '0.6rem', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '0.35rem' }}>
                      <i className="fa-solid fa-clock-rotate-left"></i> Allotment Funds On Hold / Pending
                    </h5>

                    {userHistory.holdAllotments.length === 0 ? (
                      <p style={{ fontSize: '0.725rem', color: 'var(--text-muted)', opacity: 0.7, fontStyle: 'italic', margin: '0.5rem 0' }}>
                        No coin allotment requests are currently placed on hold for this player.
                      </p>
                    ) : (
                      <div className="table-responsive" style={{ maxHeight: '200px', overflowY: 'auto' }}>
                        <table className="admin-table" style={{ fontSize: '0.725rem' }}>
                          <thead>
                            <tr>
                              <th>Game</th>
                              <th>Coins</th>
                              <th>Hold Reason</th>
                              <th>Action</th>
                            </tr>
                          </thead>
                          <tbody>
                            {userHistory.holdAllotments.map((noti) => (
                              <tr key={noti.id}>
                                <td>{noti.gameTitle}</td>
                                <td style={{ color: 'var(--gold-primary)', fontWeight: 'bold' }}>{noti.totalCoins}</td>
                                <td style={{ color: '#ef4444' }}>{noti.holdNote || 'Unspecified'}</td>
                                <td>
                                  {isManagerOrAdmin ? (
                                    <button
                                      onClick={() => handleReleaseHold(noti.id)}
                                      style={{
                                        background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                                        color: '#fff',
                                        border: 'none',
                                        borderRadius: '4px',
                                        padding: '0.2rem 0.4rem',
                                        fontSize: '0.6rem',
                                        fontWeight: 'bold',
                                        cursor: 'pointer'
                                      }}
                                    >
                                      Release Hold & Request
                                    </button>
                                  ) : (
                                    <span style={{ fontSize: '0.6rem', opacity: 0.5 }}>No Auth</span>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>

                </div>
              )}
            </div>
          </div>
        </PanelModalBackdrop>
      )}
      {/* MANUAL REGISTER PLAYER MODAL */}
      {registerModalOpen && (
        <PanelModalBackdrop onClick={resetRegisterForm}>
          <div className="modal-content border-gold" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '440px', width: '90%' }}>
            <div className="modal-header">
              <h3>
                <i className="fa-solid fa-user-plus gold-text"></i> Register New Player
              </h3>
              <button type="button" className="close-modal" onClick={resetRegisterForm}>
                &times;
              </button>
            </div>
            <div className="modal-body">
              {registerResult ? (
                <div style={{ textAlign: 'center', padding: '1rem 0' }}>
                  <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: 'rgba(34,197,94,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#22c55e', margin: '0 auto 1rem auto', fontSize: '1.5rem' }}>
                    <i className="fa-solid fa-circle-check"></i>
                  </div>
                  <h4 style={{ color: '#fff', marginBottom: '0.5rem' }}>Player Registered Successfully!</h4>
                  <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '1.25rem' }}>
                    Share these login credentials with the player:
                  </p>
                  
                  <div style={{ background: '#0b0d16', padding: '1rem', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.05)', textAlign: 'left', marginBottom: '1.5rem', display: 'flex', flexDirection: 'column', gap: '0.5rem', fontSize: '0.8rem' }}>
                    <div><span style={{ color: 'var(--text-muted)' }}>Email:</span> <strong style={{ color: '#fff' }}>{registerResult.email}</strong></div>
                    <div><span style={{ color: 'var(--text-muted)' }}>Temporary Password:</span> <strong style={{ color: 'var(--gold-primary)', fontFamily: 'monospace' }}>{registerResult.password}</strong></div>
                    <div><span style={{ color: 'var(--text-muted)' }}>Referral Code:</span> <strong style={{ color: '#a855f7', fontFamily: 'monospace' }}>{registerResult.referralCode}</strong></div>
                  </div>

                  <button onClick={resetRegisterForm} className="submit-btn" style={{ background: 'var(--gold-primary)', color: '#000', fontWeight: 'bold' }}>
                    DONE
                  </button>
                </div>
              ) : (
                <form onSubmit={handleManualRegister} noValidate>
                  <div className="input-group">
                    <label htmlFor="reg-name">Player Full Name</label>
                    <div className="input-wrapper">
                      <i className="fa-solid fa-user input-icon"></i>
                      <input
                        type="text"
                        id="reg-name"
                        placeholder="e.g. John Doe"
                        value={newName}
                        onChange={(e) => setNewName(e.target.value)}
                        required
                      />
                    </div>
                  </div>

                  <div className="input-group">
                    <label htmlFor="reg-email">Gmail Address</label>
                    <div className="input-wrapper">
                      <i className="fa-solid fa-envelope input-icon"></i>
                      <input
                        type="email"
                        id="reg-email"
                        placeholder="player@gmail.com"
                        value={newEmail}
                        onChange={(e) => setNewEmail(e.target.value)}
                        required
                      />
                    </div>
                  </div>

                  <div className="input-group">
                    <label htmlFor="reg-pass">Password (Optional)</label>
                    <div className="input-wrapper">
                      <i className="fa-solid fa-lock input-icon"></i>
                      <input
                        type="text"
                        id="reg-pass"
                        placeholder="Type password or leave blank to auto-generate..."
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="input-group" style={{ marginBottom: '1.5rem' }}>
                    <label htmlFor="reg-ref">Referred By Code (Optional)</label>
                    <div className="input-wrapper">
                      <i className="fa-solid fa-gift input-icon"></i>
                      <input
                        type="text"
                        id="reg-ref"
                        placeholder="e.g. JKP55"
                        value={newReferredBy}
                        onChange={(e) => setNewReferredBy(e.target.value)}
                      />
                    </div>
                  </div>

                  <button type="submit" className="submit-btn" style={{ background: 'var(--gold-primary)', color: '#000', fontWeight: 'bold' }} disabled={isRegistering}>
                    {isRegistering ? 'REGISTERING...' : 'REGISTER PLAYER ➔'}
                  </button>
                </form>
              )}
            </div>
          </div>
        </PanelModalBackdrop>
      )}


      {/* Password Reset Modal */}
      <AdminResetPasswordModal
        isOpen={passwordModalOpen}
        onClose={() => { setPasswordModalOpen(false); setResetPasswordUser(null); }}
        onReset={handleResetPasswordSubmit}
        user={resetPasswordUser}
      />
    </section>
  );
}
