'use client';

import React, { useState, useEffect } from 'react';
import { mutate } from 'swr';
import ParticlesBackground from '../../components/ParticlesBackground';
import AdminDashboard from '../../components/AdminDashboard';
import LoadingOverlay from '../../components/LoadingOverlay';
import { AdminGameModal, ApproveAccountModal, AdminGatewayModal, ViewProofModal, SupportModal } from '../../components/Modals';
import useSessionGuard from '../../hooks/useSessionGuard';

export default function AdminPage({ portalName, forcedRole }) {
  const [authenticated, setAuthenticated] = useState(false);
  const [adminUser, setAdminUser] = useState(null);
  const [adminEmail, setAdminEmail] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [supportOpen, setSupportOpen] = useState(false);

  // Overlay states
  const [loadingActive, setLoadingActive] = useState(false);
  const [toast, setToast] = useState(null);
  const [completedActionIds, setCompletedActionIds] = useState({});
  
  // Modal Controls
  const [gameModalOpen, setGameModalOpen] = useState(false);
  const [editGameData, setEditGameData] = useState(null);
  
  const [approveModalOpen, setApproveModalOpen] = useState(false);
  const [activeRequestDetails, setActiveRequestDetails] = useState(null);

  const [gatewayModalOpen, setGatewayModalOpen] = useState(false);
  const [editGatewayData, setEditGatewayData] = useState(null);

  const [proofModalOpen, setProofModalOpen] = useState(false);
  const [proofImageUrl, setProofImageUrl] = useState('');

  // If this staff account is deleted while they are still online, kick them out.
  const staffLoginPath =
    forcedRole === 'financial_admin' ? '/finance'
    : forcedRole === 'operation_admin' ? '/operations'
    : forcedRole === 'coins_admin' ? '/coins-staff'
    : forcedRole === 'support_admin' ? '/support-staff'
    : forcedRole === 'admin' && portalName?.includes('Boss') ? '/boss'
    : '/admin';
  useSessionGuard(authenticated ? adminUser?.email : null, {
    redirectTo: staffLoginPath,
    intervalMs: 2000
  });

  useEffect(() => {
    // Check local session
    const adminSession = localStorage.getItem('jackpot_admin_session');
    if (adminSession && adminSession !== 'active') {
      try {
        const parsed = JSON.parse(adminSession);
        if (parsed && parsed.role) {
          const cleanRoles = (parsed.role || '').toLowerCase().split(',').map(r => r.trim());
          if (forcedRole && !cleanRoles.includes(forcedRole) && !cleanRoles.includes('admin')) {
            localStorage.removeItem('jackpot_admin_session');
            setAuthenticated(false);
            setAdminUser(null);
          } else {
            setAuthenticated(true);
            setAdminUser(parsed);
          }
        }
      } catch (e) {
        setAuthenticated(true);
        setAdminUser({ name: 'System Admin', email: process.env.NEXT_PUBLIC_ADMIN_EMAIL || '', role: 'admin' });
      }
    } else if (adminSession === 'active') {
      setAuthenticated(true);
      setAdminUser({ name: 'System Admin', email: process.env.NEXT_PUBLIC_ADMIN_EMAIL || '', role: 'admin' });
    }

    // Multi-tab Real-Time Synchronization Listener
    const handleStorageEvent = (e) => {
      if (e.key === 'jackpot_admin_session') {
        const sess = localStorage.getItem('jackpot_admin_session');
        if (sess && sess !== 'null') {
          setAuthenticated(true);
          try {
            setAdminUser(JSON.parse(sess));
          } catch (err) {
            setAdminUser({ name: 'System Admin', email: process.env.NEXT_PUBLIC_ADMIN_EMAIL || '', role: 'admin' });
          }
        } else {
          setAuthenticated(false);
          setAdminUser(null);
        }
      }
    };
    window.addEventListener('storage', handleStorageEvent);
    return () => {
      window.removeEventListener('storage', handleStorageEvent);
    };
  }, []);

  // Shared toast trigger — clear prior timer so late responses don't wipe early toasts
  const toastTimerRef = React.useRef(null);
  const showToast = (message, type = 'info') => {
    if (toastTimerRef.current) {
      clearTimeout(toastTimerRef.current);
      toastTimerRef.current = null;
    }
    setToast({ message, type });
    toastTimerRef.current = setTimeout(() => {
      setToast(null);
      toastTimerRef.current = null;
    }, 4000);
  };

  const triggerLoading = (duration = 1000, callback) => {
    setLoadingActive(true);
    setTimeout(() => {
      setLoadingActive(false);
      if (callback) callback();
    }, duration);
  };

  // Admin login credentials check against database users
  const handleAdminLogin = async (e) => {
    e.preventDefault();
    setLoginError('');

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: adminEmail, password: adminPassword })
      });
      const data = await response.json();

      if (data.success) {
        const user = data.user;
        const allowedRoles = ['admin', 'financial_admin', 'coins_admin', 'support_admin', 'operation_admin'];
        const cleanRoles = (user.role || '').toLowerCase().split(',').map(r => r.trim());

        if (allowedRoles.some(r => cleanRoles.includes(r))) {
          if (user.distributorId) {
            setLoginError('Access Denied. Distributor staff must log in at the distributor portal.');
            return;
          }

          if (forcedRole && !cleanRoles.includes(forcedRole) && !cleanRoles.includes('admin')) {
            setLoginError(`Access Denied: This portal is strictly restricted to ${forcedRole.toUpperCase().replace('_', ' ')} accounts.`);
            return;
          }

          triggerLoading(1200, () => {
            setAuthenticated(true);
            setAdminUser(user);
            localStorage.setItem('jackpot_admin_session', JSON.stringify(user));
            showToast(`Welcome back, ${user.name}! Session Initiated.`, 'success');
            
            // Refresh stats SWR cache globally
            mutate('/api/admin/stats');
          });
        } else {
          setLoginError('Access Denied. You do not have administrator privileges.');
        }
      } else {
        setLoginError(data.message || 'Invalid Administrator credentials.');
      }
    } catch (err) {
      console.error('Admin login error:', err);
      setLoginError('Connection error during login.');
    }
  };

  const handleAdminLogout = () => {
    triggerLoading(800, () => {
      setAuthenticated(false);
      setAdminUser(null);
      localStorage.removeItem('jackpot_admin_session');
      localStorage.removeItem('jackpot_session');
      setAdminEmail('');
      setAdminPassword('');
      showToast('Logged out of Admin Portal.', 'info');
    });
  };

  const handleUpdateUserCoins = async (email, coins) => {
    try {
      const response = await fetch('/api/users', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, coins })
      });
      const data = await response.json();
      if (data.success) {
        showToast(`User coins updated to ${coins}!`, 'success');
        
        // Mutate users list caches
        mutate((key) => typeof key === 'string' && key.startsWith('/api/users'));
      } else {
        showToast(data.message || 'Failed to update coins.', 'error');
      }
    } catch (err) {
      console.error('Update coins API error:', err);
      showToast('Connection error updating coins.', 'error');
    }
  };

  const handleCreateAdmin = async (adminData) => {
    try {
      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: adminData.email,
          password: adminData.password,
          name: adminData.name,
          role: adminData.role,
          ...(adminData.allowedGameIds ? { allowedGameIds: adminData.allowedGameIds } : {})
        })
      });
      const data = await response.json();
      if (data.success) {
        showToast(`Admin staff account created for ${adminData.name}!`, 'success');
        
        // Revalidate users endpoint
        mutate((key) => typeof key === 'string' && key.startsWith('/api/users'));
      } else {
        showToast(data.message || 'Failed to create admin staff.', 'error');
      }
    } catch (err) {
      console.error('Create admin API error:', err);
      showToast('Connection error creating admin staff.', 'error');
    }
  };

  const handleUpdateSettings = async (firstDepositBonus, regularDepositBonus, referralBonus, usdtAddress, usdtQrCode, affiliatePayoutNetwork, affiliatePayoutWallet, affiliatePayoutQrCode, affiliatePlatformCommissionRate) => {
    try {
      const response = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firstDepositBonus,
          regularDepositBonus,
          referralBonus,
          usdtAddress,
          usdtQrCode,
          affiliatePayoutNetwork,
          affiliatePayoutWallet,
          affiliatePayoutQrCode,
          affiliatePlatformCommissionRate
        })
      });
      const data = await response.json();
      if (data.success) {
        showToast('System settings updated successfully!', 'success');
        
        // Mutate SWR settings cache
        mutate('/api/settings');
      } else {
        showToast(data.message || 'Failed to update settings.', 'error');
      }
    } catch (err) {
      console.error('Update settings API error:', err);
      showToast('Connection error updating settings.', 'error');
    }
  };

  const handleUpdateCoinsNotification = async (id, status, read, holdNote) => {
    // Instant queue clear — rollback if API fails
    if (status === 'COMPLETED' || status === 'HOLD') {
      setCompletedActionIds(prev => ({ ...prev, [id]: true }));
    }
    try {
      const response = await fetch('/api/coins-notifications', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status, read, holdNote, processedBy: adminUser?.email || 'admin', adminEmail: adminUser?.email || '' })
      });
      const data = await response.json();
      if (data.success) {
        if (status === 'COMPLETED') {
          showToast('Coin allotment request marked as DONE!', 'success');
        } else if (status === 'HOLD') {
          showToast('Allotment task placed ON HOLD.', 'info');
        } else {
          showToast('Notification status updated.', 'success');
        }
        
        // Revalidate stats & allotment queues caches
        mutate('/api/admin/stats');
        mutate((key) => typeof key === 'string' && key.startsWith('/api/coins-notifications'));
        mutate((key) => typeof key === 'string' && key.startsWith('/api/transactions'));
      } else {
        if (status === 'COMPLETED' || status === 'HOLD') {
          setCompletedActionIds(prev => {
            const next = { ...prev };
            delete next[id];
            return next;
          });
        }
        showToast(data.message || 'Failed to update notification.', 'error');
      }
    } catch (err) {
      if (status === 'COMPLETED' || status === 'HOLD') {
        setCompletedActionIds(prev => {
          const next = { ...prev };
          delete next[id];
          return next;
        });
      }
      console.error('Update notification API error:', err);
      showToast('Connection error updating notification.', 'error');
    }
  };

  const handleUpdateGameCoinsPool = async (gameId, coins, openPanelLink, resetUsedCoins) => {
    try {
      const body = { id: gameId };
      if (coins !== undefined) body.availableCoins = Number(coins);
      if (openPanelLink !== undefined) body.openPanelLink = openPanelLink;
      if (resetUsedCoins !== undefined) body.resetUsedCoins = Boolean(resetUsedCoins);

      const response = await fetch('/api/games', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const data = await response.json();
      if (data.success) {
        showToast('Game pool details updated successfully!', 'success');
        mutate('/api/games');
      } else {
        showToast(data.message || 'Failed to update game details.', 'error');
      }
    } catch (err) {
      console.error('Update game details API error:', err);
      showToast('Connection error updating game details.', 'error');
    }
  };

  // Games CRUDs
  const handleSaveGame = async (gameItem) => {
    try {
      const method = gameItem.id ? 'PUT' : 'POST';
      const response = await fetch('/api/games', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(gameItem)
      });
      const data = await response.json();
      if (data.success) {
        showToast(gameItem.id ? `Game updated successfully!` : `Game "${gameItem.title}" created successfully!`, 'success');
        mutate('/api/games');
      } else {
        showToast(data.message || 'Failed to save game.', 'error');
      }
    } catch (err) {
      console.error('Save game API error:', err);
      showToast('Connection error saving game.', 'error');
    }
    setGameModalOpen(false);
  };

  const handleDeleteGame = async (id) => {
    if (window.confirm('Are you sure you want to delete this game?')) {
      try {
        const response = await fetch(`/api/games?id=${id}`, { method: 'DELETE' });
        const data = await response.json();
        if (data.success) {
          showToast('Game deleted successfully.', 'error');
          mutate('/api/games');
        } else {
          showToast(data.message || 'Failed to delete game.', 'error');
        }
      } catch (err) {
        console.error('Delete game API error:', err);
        showToast('Connection error deleting game.', 'error');
      }
    }
  };

  const handleDeleteUser = async (email) => {
    if (window.confirm(`Delete user account "${email}"?`)) {
      try {
        const response = await fetch(`/api/users?email=${encodeURIComponent(email)}`, { method: 'DELETE' });
        const data = await response.json();
        if (data.success) {
          showToast('User account deleted.', 'error');
          mutate((key) => typeof key === 'string' && key.startsWith('/api/users'));
        } else {
          showToast(data.message || 'Failed to delete user.', 'error');
        }
      } catch (err) {
        console.error('Delete user API error:', err);
        showToast('Connection error deleting user.', 'error');
      }
    }
  };

  // Account Request Approvals
  const handleOpenApproveRequest = (requestItem) => {
    setActiveRequestDetails(requestItem);
    setApproveModalOpen(true);
  };

  const handleSaveApprovedAccount = async (credData) => {
    try {
      // Single fast PUT — creates game account + marks READY (same path as Shift Dashboard)
      const reqResponse = await fetch('/api/account-requests', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: credData.requestId,
          status: 'READY',
          gameAccountUsername: credData.username,
          gameAccountPassword: credData.password,
          processedBy: adminUser?.email || 'admin',
          adminEmail: adminUser?.email || ''
        })
      });
      const reqResult = await reqResponse.json();

      if (reqResponse.ok && reqResult.success) {
        showToast(`Account credentials sent to ${credData.userEmail}!`, 'success');
        setCompletedActionIds(prev => ({ ...prev, [credData.requestId]: true }));
        setApproveModalOpen(false);
        mutate('/api/admin/stats');
        mutate((key) => typeof key === 'string' && key.startsWith('/api/account-requests'));
      } else {
        showToast(reqResult.message || 'Failed to finalize request approval.', 'error');
      }
    } catch (err) {
      console.error('Approve account request API error:', err);
      showToast('Connection error approving request.', 'error');
    }
  };

  // Transaction Ledger Approvals
  const handleApproveTransaction = async (txId) => {
    // Instant hide + toast — do not wait for Mongo / coins task round-trip
    setCompletedActionIds(prev => ({ ...prev, [txId]: true }));
    showToast('Transaction approved successfully.', 'success');
    // Kick list refreshes in parallel with the approve call (coins row appears ASAP)
    mutate('/api/admin/stats');
    mutate((key) => typeof key === 'string' && key.startsWith('/api/transactions'));
    mutate((key) => typeof key === 'string' && key.startsWith('/api/coins-notifications'));

    try {
      const response = await fetch('/api/transactions', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: txId, status: 'SUCCESS', processedBy: adminUser?.email || 'admin' })
      });
      const data = await response.json();
      if (data.success) {
        // Revalidate again once coins notification is definitely written
        mutate('/api/admin/stats');
        mutate((key) => typeof key === 'string' && key.startsWith('/api/transactions'));
        mutate((key) => typeof key === 'string' && key.startsWith('/api/coins-notifications'));
        // Wake other admin tabs on this browser instantly (coins staff)
        try {
          const bc = new BroadcastChannel('jackpot-admin-events');
          bc.postMessage({
            type: 'coins',
            distributorId: data.coinsNotification?.distributorId || '',
            transactionId: txId
          });
          bc.postMessage({ type: 'transactions', status: data.status || 'COINS_LOADING' });
          bc.close();
        } catch {
          /* ignore */
        }
      } else {
        setCompletedActionIds(prev => {
          const next = { ...prev };
          delete next[txId];
          return next;
        });
        showToast(data.message || 'Failed to approve transaction.', 'error');
        mutate((key) => typeof key === 'string' && key.startsWith('/api/transactions'));
        mutate((key) => typeof key === 'string' && key.startsWith('/api/coins-notifications'));
      }
    } catch (err) {
      setCompletedActionIds(prev => {
        const next = { ...prev };
        delete next[txId];
        return next;
      });
      console.error('Approve transaction API error:', err);
      showToast('Connection error approving transaction.', 'error');
      mutate((key) => typeof key === 'string' && key.startsWith('/api/transactions'));
      mutate((key) => typeof key === 'string' && key.startsWith('/api/coins-notifications'));
    }
  };

  const handleFailTransaction = async (txId) => {
    const feedbackMsg = window.prompt('Enter reason for rejection/failure:', 'Payment not received');
    if (feedbackMsg === null) return;

    setCompletedActionIds(prev => ({ ...prev, [txId]: true }));
    try {
      const response = await fetch('/api/transactions', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: txId, status: 'FAILED', note: feedbackMsg || 'Declined by Admin', processedBy: adminUser?.email || 'admin' })
      });
      const data = await response.json();
      if (data.success) {
        showToast('Transaction set to FAILED status.', 'error');
        
        // Mutate stats and transaction lists
        mutate('/api/admin/stats');
        mutate((key) => typeof key === 'string' && key.startsWith('/api/transactions'));
        mutate((key) => typeof key === 'string' && key.startsWith('/api/coins-notifications'));
      } else {
        setCompletedActionIds(prev => {
          const next = { ...prev };
          delete next[txId];
          return next;
        });
        showToast(data.message || 'Failed to decline transaction.', 'error');
      }
    } catch (err) {
      setCompletedActionIds(prev => {
        const next = { ...prev };
        delete next[txId];
        return next;
      });
      console.error('Decline transaction API error:', err);
      showToast('Connection error declining transaction.', 'error');
    }
  };

  // View Screenshot proof trigger
  const handleInspectProof = async (imgUrl, txId, preferredField = null) => {
    if (typeof imgUrl === 'string' && imgUrl.startsWith('data:')) {
      setProofImageUrl(imgUrl);
      setProofModalOpen(true);
      return;
    }

    if (typeof imgUrl === 'string' && imgUrl.startsWith('http')) {
      setProofImageUrl(imgUrl);
      setProofModalOpen(true);
      return;
    }

    if (txId) {
      setProofImageUrl('');
      setProofModalOpen(true);
      try {
        const res = await fetch(`/api/transactions?id=${txId}&adminRole=admin`);
        const data = await res.json();
        let proof;
        if (preferredField === 'tagQrScreenshot') {
          proof = data.transaction?.tagQrScreenshot;
        } else if (preferredField === 'screenshot') {
          proof = data.transaction?.screenshot;
        } else if (preferredField === 'payoutProof') {
          proof = data.transaction?.payoutProof;
        } else {
          proof = data.transaction?.payoutProof || data.transaction?.screenshot || data.transaction?.paymentProof || data.transaction?.tagQrScreenshot;
        }
        if (data.success && proof && proof !== true) {
          setProofImageUrl(proof);
        } else {
          alert('Failed to load payment receipt screenshot.');
          setProofModalOpen(false);
        }
      } catch (err) {
        console.error(err);
        alert('Error fetching payment proof.');
        setProofModalOpen(false);
      }
      return;
    }

    if (imgUrl) {
      setProofImageUrl(imgUrl);
      setProofModalOpen(true);
    }
  };

  // Payment Gateway CRUDs
  const handleAddGatewayClick = () => {
    setEditGatewayData(null);
    setGatewayModalOpen(true);
  };

  const handleEditGatewayClick = (gateway) => {
    setEditGatewayData(gateway);
    setGatewayModalOpen(true);
  };

  const handleSaveGateway = async (gtData) => {
    try {
      const method = gtData.id ? 'PUT' : 'POST';
      const response = await fetch('/api/gateways', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(gtData)
      });
      const data = await response.json();
      if (data.success) {
        showToast(gtData.id ? `Gateway "${gtData.name}" updated successfully.` : `Gateway "${gtData.name}" created successfully.`, 'success');
        mutate('/api/gateways');
      } else {
        showToast(data.message || 'Failed to save gateway.', 'error');
      }
    } catch (err) {
      console.error('Save gateway API error:', err);
      showToast('Connection error saving gateway.', 'error');
    }
    setGatewayModalOpen(false);
  };

  const handleDeleteGateway = async (id) => {
    if (window.confirm('Are you sure you want to delete this payment gateway?')) {
      try {
        const response = await fetch(`/api/gateways?id=${id}`, { method: 'DELETE' });
        const data = await response.json();
        if (data.success) {
          showToast('Payment gateway deleted.', 'error');
          mutate('/api/gateways');
        } else {
          showToast(data.message || 'Failed to delete gateway.', 'error');
        }
      } catch (err) {
        console.error('Delete gateway API error:', err);
        showToast('Connection error deleting gateway.', 'error');
      }
    }
  };

  return (
    <>
      <ParticlesBackground />
      <div className="ambient-glow glow-1"></div>
      <div className="ambient-glow glow-2"></div>

      {toast && (
        <div className={`notification-banner ${toast.type === 'error' ? 'error' : toast.type === 'success' ? 'success' : ''}`}>
          <span>{toast.message}</span>
          <button className="close-notification" onClick={() => setToast(null)}>&times;</button>
        </div>
      )}

      {/* A) SECURE ADMINISTRATIVE SIGN-IN PANEL */}
      {!authenticated ? (
        <div className="page-container" style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <article className="auth-card" style={{ maxWidth: '420px', padding: '2.5rem 2rem', width: '100%' }}>
            <div className="glow-border-layer"></div>
            
            <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
              <div className="logo-container animate-float" style={{ width: '70px', height: '70px', margin: '0 auto 10px auto' }}>
                <i className="fa-solid fa-user-shield gold-text" style={{ fontSize: '2.5rem', marginTop: '12px', display: 'block' }}></i>
                <div className="logo-glow"></div>
              </div>
              <h2 className="brand-title" style={{ fontSize: '1.5rem' }}>
                <span className="gold-text-1">{portalName ? portalName.split(' ')[0].toUpperCase() : 'ADMIN'}</span>
                <span className="gold-text-2">{portalName ? portalName.split(' ').slice(1).join(' ').toUpperCase() : 'SECURE'}</span>
              </h2>
              <p className="brand-subheading" style={{ fontSize: '0.7rem' }}>{portalName ? `${portalName} access panel.` : 'Authorized staff personnel only.'}</p>
            </div>

            <form onSubmit={handleAdminLogin} noValidate>
              <div className="input-group">
                <label htmlFor="admin-email">Admin Login Email</label>
                <div className="input-wrapper">
                  <i className="fa-solid fa-envelope input-icon"></i>
                  <input
                    type="email"
                    id="admin-email"
                    placeholder="admin@example.com"
                    value={adminEmail}
                    onChange={(e) => { setAdminEmail(e.target.value); setLoginError(''); }}
                    required
                  />
                </div>
              </div>

              <div className="input-group">
                <label htmlFor="admin-pass">Access Password</label>
                <div className="input-wrapper">
                  <i className="fa-solid fa-lock input-icon"></i>
                  <input
                    type="password"
                    id="admin-pass"
                    placeholder="••••••••"
                    value={adminPassword}
                    onChange={(e) => { setAdminPassword(e.target.value); setLoginError(''); }}
                    required
                  />
                </div>
                <span className="error-msg">{loginError}</span>
              </div>

              <button type="submit" className="submit-btn" style={{ background: 'linear-gradient(135deg, #d32f2f 0%, #b71c1c 100%)' }}>
                <span>SECURE LOGIN &rarr;</span>
                <div className="btn-glow"></div>
              </button>
            </form>
          </article>
        </div>
      ) : (
        /* B) EXPANDED ADMINISTRATIVE WORKSPACE */
        <AdminDashboard
          adminUser={adminUser}
          completedActionIds={completedActionIds}
          onLogout={handleAdminLogout}
          showToast={showToast}
          onAddGameClick={() => { setEditGameData(null); setGameModalOpen(true); }}
          onEditGameClick={(game) => { setEditGameData(game); setGameModalOpen(true); }}
          onDeleteGame={handleDeleteGame}
          onDeleteUser={handleDeleteUser}
          onApproveRequest={handleOpenApproveRequest}
          onApproveTransaction={handleApproveTransaction}
          onFailTransaction={handleFailTransaction}
          onInspectProof={handleInspectProof}
          onAddGatewayClick={handleAddGatewayClick}
          onEditGatewayClick={handleEditGatewayClick}
          onDeleteGateway={handleDeleteGateway}
          onUpdateUserCoins={handleUpdateUserCoins}
          onCreateAdmin={handleCreateAdmin}
          onUpdateSettings={handleUpdateSettings}
          onUpdateCoinsNotification={handleUpdateCoinsNotification}
          onUpdateGameCoinsPool={handleUpdateGameCoinsPool}
        />
      )}

      {/* CRUD Games Modal */}
      <AdminGameModal
        isOpen={gameModalOpen}
        onClose={() => setGameModalOpen(false)}
        onSave={handleSaveGame}
        editGame={editGameData}
      />

      {/* Allot login credentials Modal */}
      <ApproveAccountModal
        isOpen={approveModalOpen}
        onClose={() => setApproveModalOpen(false)}
        onApprove={handleSaveApprovedAccount}
        requestDetails={activeRequestDetails}
      />

      {/* CRUD Gateway settings Modal */}
      <AdminGatewayModal
        isOpen={gatewayModalOpen}
        onClose={() => setGatewayModalOpen(false)}
        onSave={handleSaveGateway}
        editGateway={editGatewayData}
      />

      {/* Proof Inspection Modal viewer */}
      <ViewProofModal
        isOpen={proofModalOpen}
        onClose={() => setProofModalOpen(false)}
        proofUrl={proofImageUrl}
      />

      {authenticated && !supportOpen && (
        <button
          type="button"
          className="portal-support-fab"
          onClick={() => setSupportOpen(true)}
          aria-label="Open support chat"
          style={{
            position: 'fixed',
            bottom: '2rem',
            right: '2rem',
            zIndex: 99999,
            width: '60px',
            height: '60px',
            borderRadius: '50%',
            background: 'linear-gradient(135deg, #ffd700 0%, #cca000 100%)',
            color: '#000',
            border: 'none',
            boxShadow: '0 8px 30px rgba(255,215,0,0.35)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '1.5rem',
            transition: 'transform 0.2s ease, box-shadow 0.2s ease',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'scale(1.05)';
            e.currentTarget.style.boxShadow = '0 10px 35px rgba(255,215,0,0.5)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'scale(1)';
            e.currentTarget.style.boxShadow = '0 8px 30px rgba(255,215,0,0.35)';
          }}
        >
          <i className="fa-solid fa-headset"></i>
        </button>
      )}

      <SupportModal
        isOpen={supportOpen}
        onClose={() => setSupportOpen(false)}
        currentUser={adminUser}
      />

      <LoadingOverlay active={loadingActive} />
    </>
  );
}
