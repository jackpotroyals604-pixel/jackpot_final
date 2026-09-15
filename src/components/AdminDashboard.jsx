'use client';

import React, { useState, useEffect, Suspense } from 'react';
import useSWR, { mutate } from 'swr';
import { motion, AnimatePresence } from 'framer-motion';
import usePollingSWR from '../hooks/usePollingSWR';
import useAdminEvents from '../hooks/useAdminEvents';
import PullToRefresh from './PullToRefresh';
import { POLL } from '../lib/pollingConfig';
import { lazyWithRetry } from '../lib/lazyWithRetry';
import TabErrorBoundary from './TabErrorBoundary';
import { initAudioUnlock, playNotificationSound } from '../lib/notificationSound';
import { initDesktopNotifications, notifyStaffActivity } from '../lib/desktopNotify';
import { subscribeToStaffPush } from '../lib/pushClient';
import { registerNativeBackHandler } from '../lib/nativeBack';
import OfflineBanner from './OfflineBanner';

// Lazy load tab components with automatic retry on chunk failures
const OverviewTab = lazyWithRetry(() => import('./admin/OverviewTab'));
const GamesLibraryTab = lazyWithRetry(() => import('./admin/GamesLibraryTab'));
const PlayerAccountsTab = lazyWithRetry(() => import('./admin/PlayerAccountsTab'));
const RequestsTab = lazyWithRetry(() => import('./admin/RequestsTab'));
const LedgerTab = lazyWithRetry(() => import('./admin/LedgerTab'));
const GatewaysTab = lazyWithRetry(() => import('./admin/GatewaysTab'));
const CoinsAllotmentTab = lazyWithRetry(() => import('./admin/CoinsAllotmentTab'));
const SupportTab = lazyWithRetry(() => import('./admin/SupportTab'));
const StaffTab = lazyWithRetry(() => import('./admin/StaffTab'));
const SettingsTab = lazyWithRetry(() => import('./admin/SettingsTab'));
const FrontendSettingsTab = lazyWithRetry(() => import('./admin/FrontendSettingsTab'));
const ShiftReportsTab = lazyWithRetry(() => import('./admin/ShiftReportsTab'));
const ShiftDashboardTab = lazyWithRetry(() => import('./admin/ShiftDashboardTab'));
const PromotionsTab = lazyWithRetry(() => import('./admin/PromotionsTab'));
const TxSearchTab = lazyWithRetry(() => import('./admin/TxSearchTab'));
const DistributorsTab = lazyWithRetry(() => import('./admin/DistributorsTab'));
const AffiliatesTab = lazyWithRetry(() => import('./admin/AffiliatesTab'));
const DeletedPlayersTab = lazyWithRetry(() => import('./admin/DeletedPlayersTab'));
const AffiliateCommissionTab = lazyWithRetry(() => import('./admin/AffiliateCommissionTab'));
const WebsitePaymentsTab = lazyWithRetry(() => import('./admin/WebsitePaymentsTab'));
const CampaignRequestsTab = lazyWithRetry(() => import('./admin/CampaignRequestsTab'));
const DevicesTab = lazyWithRetry(() => import('./admin/DevicesTab'));

const fetcher = (...args) => fetch(...args).then((res) => res.json());

export default function AdminDashboard({
  adminUser,
  completedActionIds = {},
  onLogout,
  showToast,
  onAddGameClick,
  onEditGameClick,
  onDeleteGame,
  onDeleteUser,
  onApproveRequest,
  onApproveTransaction,
  onFailTransaction,
  onInspectProof,
  onAddGatewayClick,
  onEditGatewayClick,
  onDeleteGateway,
  onCreateAdmin,
  onUpdateSettings,
  onUpdateCoinsNotification,
  onUpdateGameCoinsPool
}) {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [pushSyncState, setPushSyncState] = useState({ loading: false, success: false, message: '' });
  const suppressUrlSyncRef = React.useRef(true);

  const handleSyncNotifications = async () => {
    let email = adminUser?.email;
    if (!email && typeof localStorage !== 'undefined') {
      try {
        const sess = JSON.parse(localStorage.getItem('jackpot_admin_session') || '{}');
        email = sess.email;
      } catch {}
    }
    if (!email) {
      email = process.env.NEXT_PUBLIC_ADMIN_EMAIL || '';
    }

    setPushSyncState({ loading: true, success: false, message: '' });
    try {
      const res = await subscribeToStaffPush(email);
      const isNative = Boolean(res?.nativeToken) || Boolean(window.Capacitor?.isNativePlatform?.());
      const successMsg = isNative ? 'APK Native Device Registered!' : 'Browser notifications connected!';
      setPushSyncState({ loading: false, success: true, message: successMsg });
      if (typeof showToast === 'function') {
        showToast(`✅ ${successMsg} (${email})`, 'success');
      }
      setTimeout(() => setPushSyncState((prev) => ({ ...prev, message: '' })), 5000);
    } catch (err) {
      const errMsg = err?.message || 'Registration failed';
      setPushSyncState({ loading: false, success: false, message: errMsg });
      if (typeof showToast === 'function') {
        showToast(errMsg, 'error');
      }
      setTimeout(() => setPushSyncState((prev) => ({ ...prev, message: '' })), 6000);
    }
  };

  // Sync tab from URL on mount and browser back/forward
  useEffect(() => {
    const syncFromPath = () => {
      const parts = window.location.pathname.split('/').filter(Boolean);
      if (parts[0] === 'admin' && parts[1]) {
        let tab = parts[1];
        if (['ledger', 'payouts', 'payout', 'deposit', 'deposits', 'withdraw', 'withdrawals', 'financial_ledger'].includes(tab)) {
          tab = 'ledger';
        } else if (['requests', 'account_requests', 'account-requests'].includes(tab)) {
          tab = 'requests';
        }
        setActiveTab(tab);
      } else if (parts[0] === 'admin') {
        setActiveTab('dashboard');
      }
      suppressUrlSyncRef.current = false;
    };
    window.addEventListener('popstate', syncFromPath);
    window.addEventListener('focus', syncFromPath);
    syncFromPath();
    return () => {
      window.removeEventListener('popstate', syncFromPath);
      window.removeEventListener('focus', syncFromPath);
    };
  }, []);

  useEffect(() => {
    if (suppressUrlSyncRef.current) return;
    const targetPath = `/admin/${activeTab}`;
    if (window.location.pathname !== targetPath) {
      window.history.pushState({ adminTab: activeTab }, '', targetPath);
    }
    try {
      if (typeof window !== 'undefined' && window.location.href.startsWith('http')) {
        localStorage.setItem('jackpot_last_online_url', window.location.href);
      }
    } catch (_) {}
  }, [activeTab]);

  // Hide floating headset FAB while already on Live Support (it covers Reply)
  useEffect(() => {
    document.documentElement.classList.toggle('portal-on-support-tab', activeTab === 'support');
    return () => document.documentElement.classList.remove('portal-on-support-tab');
  }, [activeTab]);

  // Android / Portal system back: close mobile sidebar first
  useEffect(() => {
    return registerNativeBackHandler(() => {
      if (!sidebarOpen) return false;
      setSidebarOpen(false);
      return true;
    });
  }, [sidebarOpen]);

  const [processingIds, setProcessingIds] = useState({});

  // Instant list refresh when finance approves / players submit (SSE)
  useAdminEvents({
    enabled: Boolean(adminUser?.email),
    distributorId: adminUser?.distributorId || ''
  });

  // Use SWR to poll counts/stats for the sidebar badges
  const { data: statsData } = usePollingSWR(
    `/api/admin/stats?adminRole=${adminUser?.role || ''}&adminDistributorId=${adminUser?.distributorId || ''}&adminEmail=${encodeURIComponent(adminUser?.email || '')}`,
    POLL.STATS,
    // Keep near-live polling when tab/APK is backgrounded so coins staff get
    // sound + desktop/lock alerts without 6–10s lag.
    { refreshWhenHidden: true }
  );

  const { data: settingsData } = useSWR('/api/settings/frontend', fetcher, { revalidateOnFocus: false, dedupingInterval: 60000 });

  const pendingRequestsCount = statsData?.stats?.pendingRequestsCount || 0;
  const pendingTransactionsCount = statsData?.stats?.pendingTransactionsCount || 0;
  const pendingCoinsCount = statsData?.stats?.pendingCoinsCount || 0;
  const pendingCampaignRequestsCount = statsData?.stats?.pendingCampaignRequestsCount || 0;

  const prevCountsRef = React.useRef({ requests: 0, transactions: 0, coins: 0, chats: 0, campaigns: 0 });
  const alertsReadyRef = React.useRef(false);
  const soundUrlRef = React.useRef('');

  // Unlock audio + prime desktop notifications on first user gesture
  useEffect(() => {
    initAudioUnlock();
    initDesktopNotifications();
  }, []);

  // Portal / Capacitor admin: avoid double safe-area inset. Retry briefly because
  // the Capacitor bridge / UA marker can appear after the first paint.
  useEffect(() => {
    const apply = () => {
      const isNative =
        /JackpotRoyalsNative|JackpotPortalNative/i.test(navigator.userAgent || '') ||
        window.Capacitor?.isNativePlatform?.() === true ||
        // Portal APK always opens /admin — treat Capacitor WebView on admin as native shell
        (window.Capacitor != null && window.location.pathname.startsWith('/admin')) ||
        /JackpotDistributorNative/i.test(navigator.userAgent || '');

      if (isNative) {
        document.documentElement.classList.add('admin-native-shell');
        return true;
      }
      return false;
    };

    apply();
    const interval = window.setInterval(() => {
      if (apply()) window.clearInterval(interval);
    }, 300);
    const stop = window.setTimeout(() => window.clearInterval(interval), 6000);

    return () => {
      window.clearInterval(interval);
      window.clearTimeout(stop);
      document.documentElement.classList.remove('admin-native-shell');
    };
  }, []);

  // Register this device for Jackpot Portal lock-screen request alerts
  // (native Portal APK + optional browser staff push). Player APK tokens are separate.
  useEffect(() => {
    const email = adminUser?.email;
    if (!email) return;
    let cancelled = false;
    (async () => {
      try {
        await subscribeToStaffPush(email);
      } catch (err) {
        if (!cancelled) {
          console.warn('Staff push registration:', err?.message || err);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [adminUser?.email]);

  useEffect(() => {
    soundUrlRef.current = settingsData?.settings?.notificationSoundUrl || '';
  }, [settingsData]);

  useEffect(() => {
    if (!statsData?.stats) return;

    const {
      pendingRequestsCount = 0,
      pendingTransactionsCount = 0,
      pendingCoinsCount = 0,
      pendingChatsCount = 0,
      pendingCampaignRequestsCount = 0
    } = statsData.stats;

    const counts = {
      requests: Number(pendingRequestsCount) || 0,
      transactions: Number(pendingTransactionsCount) || 0,
      coins: Number(pendingCoinsCount) || 0,
      chats: Number(pendingChatsCount) || 0,
      campaigns: Number(pendingCampaignRequestsCount) || 0
    };

    if (!alertsReadyRef.current) {
      prevCountsRef.current = counts;
      alertsReadyRef.current = true;
      return;
    }

    // Only alert for queues this staff role can actually open
    const roles = String(adminUser?.role || '')
      .toLowerCase()
      .split(',')
      .map((r) => r.trim())
      .filter(Boolean);
    const isFull = roles.includes('admin') || roles.includes('operation_admin');
    const canRequests = isFull || roles.includes('coins_admin');
    const canTx = isFull || roles.includes('financial_admin');
    const canCoins = isFull || roles.includes('coins_admin');
    const canChats = isFull || roles.includes('support_admin');
    const canCampaigns = roles.includes('admin') && !adminUser?.distributorId;

    const prev = prevCountsRef.current;
    const hasNewRequest = canRequests && counts.requests > prev.requests;
    const hasNewTx = canTx && counts.transactions > prev.transactions;
    const hasNewCoin = canCoins && counts.coins > prev.coins;
    const hasNewChat = canChats && counts.chats > prev.chats;
    const hasNewCampaign = canCampaigns && counts.campaigns > prev.campaigns;

    if (hasNewRequest || hasNewTx || hasNewCoin || hasNewChat || hasNewCampaign) {
      try {
        playNotificationSound(soundUrlRef.current);
      } catch (_) {
        // never break dashboard for audio
      }
      try {
        const parts = [];
        if (hasNewRequest) parts.push('account request');
        if (hasNewTx) parts.push('transaction');
        if (hasNewCoin) parts.push('coins request');
        if (hasNewChat) parts.push('support message');
        if (hasNewCampaign) parts.push('campaign request');
        let targetUrl = '/admin';
        if (hasNewCoin) targetUrl = '/admin/coins';
        else if (hasNewChat) targetUrl = '/admin/support';
        else if (hasNewCampaign) targetUrl = '/admin/campaign_requests';
        else if (hasNewTx) targetUrl = '/admin/ledger';
        else if (hasNewRequest) targetUrl = '/admin/requests';

        notifyStaffActivity({
          title: 'Jackpot Royals — New activity',
          body: `New ${parts.join(', ')} received.`,
          url: targetUrl
        });
      } catch (_) {
        // never break dashboard for notifications
      }
      try {
        if (hasNewRequest) mutate((key) => typeof key === 'string' && key.includes('/api/account-requests'));
        if (hasNewTx) mutate((key) => typeof key === 'string' && key.includes('/api/transactions') && !key.includes('AFFILIATE_COMMISSION'));
        if (hasNewCoin) mutate((key) => typeof key === 'string' && key.includes('/api/coins-notifications'));
        if (hasNewChat) mutate((key) => typeof key === 'string' && key.includes('/api/support'));
        if (hasNewCampaign) mutate((key) => typeof key === 'string' && key.includes('/api/campaign-requests'));
      } catch (_) {
        // ignore mutate errors
      }
    }

    prevCountsRef.current = counts;
  }, [statsData, adminUser?.role, adminUser?.distributorId]);

  useEffect(() => {
    if (!adminUser?.email) return;

    // Heartbeat ping tracker for current admin
    let lastPing = 0;
    const sendPing = async () => {
      const now = Date.now();
      if (now - lastPing < 30000) return; // limit to once every 30s
      lastPing = now;
      try {
        await fetch('/api/admin/activity', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: adminUser.email })
        });
      } catch (err) {
        console.error('Heartbeat update failed:', err);
      }
    };

    sendPing();
    const triggerPing = () => sendPing();
    window.addEventListener('mousemove', triggerPing);
    window.addEventListener('keydown', triggerPing);
    window.addEventListener('click', triggerPing);

    return () => {
      window.removeEventListener('mousemove', triggerPing);
      window.removeEventListener('keydown', triggerPing);
      window.removeEventListener('click', triggerPing);
    };
  }, [adminUser]);



  const wrapAction = (id, actionFn) => async (...args) => {
    if (processingIds[id]) return;
    setProcessingIds(prev => ({ ...prev, [id]: true }));
    try {
      await actionFn(...args);
    } catch (err) {
      console.error(err);
    } finally {
      setProcessingIds(prev => ({ ...prev, [id]: false }));
    }
  };

  // Helper: tab permissions checking based on role
  const isSuperAdmin = () => {
    if (!adminUser?.role) return false;
    return adminUser.role.toLowerCase().split(',').map((r) => r.trim()).includes('admin');
  };

  const hasAccess = (tabName) => {
    if (!adminUser?.role) return false;
    const roleString = adminUser.role.toLowerCase();
    
    // Split roles by comma for multi-role access checks
    const roles = roleString.split(',').map(r => r.trim());
    
    return roles.some((role) => {
      if (role === 'admin') return true; // Super Admin has full access
      
      if (tabName === 'shift_dashboard') return role === 'operation_admin' || role === 'coins_admin';
      if (tabName === 'promotions') return role === 'operation_admin';
      // Frontend Settings tab is strictly reserved for main boss (Super Admin)
      if (tabName === 'frontend_settings') return false;
      if (tabName === 'shift_reports') return role === 'operation_admin';

      if (role === 'operation_admin') return !['staff', 'settings'].includes(tabName); // Operational Manager has access to all EXCEPT staff and settings
      if (role === 'financial_admin') return ['dashboard', 'ledger', 'gateways', 'tx_search'].includes(tabName);
      if (role === 'support_admin') return ['dashboard', 'support'].includes(tabName);
      if (role === 'coins_admin') return ['dashboard', 'requests', 'coins', 'tx_search', 'shift_dashboard'].includes(tabName);
      return false;
    });
  };

  const isSuperAdminOnlyTab = (tabName) => (
    ['affiliate_commissions', 'website_payments', 'deleted_accounts', 'campaign_requests'].includes(tabName)
  );

  const canRenderActiveTab = () => {
    if (!adminUser) return false;
    if (isSuperAdminOnlyTab(activeTab)) {
      return isSuperAdmin() && !adminUser?.distributorId;
    }
    return hasAccess(activeTab);
  };

  useEffect(() => {
    if (!adminUser || suppressUrlSyncRef.current) return;
    if (!canRenderActiveTab()) {
      setActiveTab('dashboard');
    }
  }, [adminUser, activeTab]);

  return (
    <div id="view-admin-dashboard" className="admin-dashboard-layout">
      <OfflineBanner />
      {/* Mobile Top Header Bar */}
      <div className="admin-mobile-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            style={{ background: 'none', border: 'none', color: '#fff', fontSize: '1.35rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            title="Toggle Menu"
          >
            <i className={`fa-solid ${sidebarOpen ? 'fa-xmark' : 'fa-bars'}`}></i>
          </button>
          
          <div style={{
            width: '32px',
            height: '32px',
            borderRadius: '50%',
            border: '1px solid rgba(255,215,0,0.4)',
            background: '#000',
            boxShadow: '0 0 10px rgba(255,215,0,0.3)',
            overflow: 'hidden',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <img src="/jackpot_lion_mascot.png?v=2" alt="Mascot Logo" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%', clipPath: 'circle(50%)' }} />
          </div>

          <span style={{ fontSize: '0.9rem', fontWeight: '900', color: '#fff', fontFamily: 'var(--font-heading)', letterSpacing: '0.05em' }}>
            JACKPOT<span style={{ color: 'var(--gold-primary)' }}>ROYALS</span>
          </span>
        </div>
        <button className="lobby-nav-btn logout-btn" onClick={onLogout} style={{ padding: '0.4rem 0.8rem', fontSize: '0.7rem', margin: 0, width: 'auto', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
          <i className="fa-solid fa-right-from-bracket"></i> <span>LOGOUT</span>
        </button>
      </div>

      {sidebarOpen && (
        <button
          type="button"
          className="admin-sidebar-overlay"
          aria-label="Close menu"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Left Sidebar Menu */}
      <aside className={`admin-sidebar ${sidebarOpen ? 'mobile-show' : ''}`}>
        {/* Brand logo */}
        <div className="admin-logo" style={{ padding: '1.5rem', borderBottom: '1px solid rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <i className="fa-solid fa-crown gold-text" style={{ fontSize: '1.5rem' }}></i>
          <h2 style={{ fontSize: '1.1rem', fontWeight: 'bold', fontFamily: 'var(--font-heading)' }}>
            JACKPOT<span className="accent-red" style={{ color: '#ef4444' }}>ROYALS</span>
          </h2>
        </div>

        {/* Tab List */}
        <nav style={{ flex: 1, padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.35rem', overflowY: 'auto' }}>
          {hasAccess('dashboard') && (
            <button
              onClick={() => { setActiveTab('dashboard'); setSidebarOpen(false); }}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem',
                background: activeTab === 'dashboard' ? 'var(--gold-primary)' : 'none',
                color: activeTab === 'dashboard' ? '#111' : '#fff',
                fontSize: '0.8rem',
                fontWeight: 'bold',
                padding: '0.75rem 1rem',
                borderRadius: '8px',
                border: 'none',
                cursor: 'pointer',
                textAlign: 'left',
                transition: 'all 0.2s ease'
              }}
            >
              <i className="fa-solid fa-chart-line" style={{ width: '18px' }}></i>
              <span>Overview Welcome</span>
            </button>
          )}

          {hasAccess('shift_dashboard') && (
            <button
              onClick={() => { setActiveTab('shift_dashboard'); setSidebarOpen(false); }}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem',
                background: activeTab === 'shift_dashboard' ? 'var(--gold-primary)' : 'none',
                color: activeTab === 'shift_dashboard' ? '#111' : '#fff',
                fontSize: '0.8rem',
                fontWeight: 'bold',
                padding: '0.75rem 1rem',
                borderRadius: '8px',
                border: 'none',
                cursor: 'pointer',
                textAlign: 'left',
                position: 'relative',
                transition: 'all 0.2s ease'
              }}
            >
              <i className="fa-solid fa-business-time" style={{ width: '18px' }}></i>
              <span>Shift Dashboard</span>
              {(pendingRequestsCount + pendingCoinsCount) > 0 && (
                <span style={{ marginLeft: 'auto', background: '#ef4444', color: '#fff', fontSize: '0.65rem', padding: '0.15rem 0.45rem', borderRadius: '10px', fontWeight: 'bold' }}>
                  {pendingRequestsCount + pendingCoinsCount}
                </span>
              )}
            </button>
          )}

          {hasAccess('promotions') && (
            <button
              onClick={() => { setActiveTab('promotions'); setSidebarOpen(false); }}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem',
                background: activeTab === 'promotions' ? 'var(--gold-primary)' : 'none',
                color: activeTab === 'promotions' ? '#111' : '#fff',
                fontSize: '0.8rem',
                fontWeight: 'bold',
                padding: '0.75rem 1rem',
                borderRadius: '8px',
                border: 'none',
                cursor: 'pointer',
                textAlign: 'left',
                transition: 'all 0.2s ease'
              }}
            >
              <i className="fa-solid fa-bullhorn" style={{ width: '18px' }}></i>
              <span>Promotions & Segments</span>
            </button>
          )}

          {hasAccess('games') && (
            <button
              onClick={() => { setActiveTab('games'); setSidebarOpen(false); }}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem',
                background: activeTab === 'games' ? 'var(--gold-primary)' : 'none',
                color: activeTab === 'games' ? '#111' : '#fff',
                fontSize: '0.8rem',
                fontWeight: 'bold',
                padding: '0.75rem 1rem',
                borderRadius: '8px',
                border: 'none',
                cursor: 'pointer',
                textAlign: 'left',
                transition: 'all 0.2s ease'
              }}
            >
              <i className="fa-solid fa-gamepad" style={{ width: '18px' }}></i>
              <span>Games Library</span>
            </button>
          )}

          {hasAccess('users') && (
            <button
              onClick={() => { setActiveTab('users'); setSidebarOpen(false); }}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem',
                background: activeTab === 'users' ? 'var(--gold-primary)' : 'none',
                color: activeTab === 'users' ? '#111' : '#fff',
                fontSize: '0.8rem',
                fontWeight: 'bold',
                padding: '0.75rem 1rem',
                borderRadius: '8px',
                border: 'none',
                cursor: 'pointer',
                textAlign: 'left',
                transition: 'all 0.2s ease'
              }}
            >
              <i className="fa-solid fa-users" style={{ width: '18px' }}></i>
              <span>Player Accounts</span>
            </button>
          )}

          {hasAccess('requests') && (
            <button
              onClick={() => { setActiveTab('requests'); setSidebarOpen(false); }}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem',
                background: activeTab === 'requests' ? 'var(--gold-primary)' : 'none',
                color: activeTab === 'requests' ? '#111' : '#fff',
                fontSize: '0.8rem',
                fontWeight: 'bold',
                padding: '0.75rem 1rem',
                borderRadius: '8px',
                border: 'none',
                cursor: 'pointer',
                textAlign: 'left',
                position: 'relative',
                transition: 'all 0.2s ease'
              }}
            >
              <i className="fa-solid fa-user-plus" style={{ width: '18px' }}></i>
              <span>Requests</span>
              {pendingRequestsCount > 0 && (
                <span style={{ marginLeft: 'auto', background: '#ef4444', color: '#fff', fontSize: '0.65rem', padding: '0.15rem 0.45rem', borderRadius: '10px', fontWeight: 'bold' }}>
                  {pendingRequestsCount}
                </span>
              )}
            </button>
          )}

          {hasAccess('ledger') && (
            <button
              onClick={() => { setActiveTab('ledger'); setSidebarOpen(false); }}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem',
                background: activeTab === 'ledger' ? 'var(--gold-primary)' : 'none',
                color: activeTab === 'ledger' ? '#111' : '#fff',
                fontSize: '0.8rem',
                fontWeight: 'bold',
                padding: '0.75rem 1rem',
                borderRadius: '8px',
                border: 'none',
                cursor: 'pointer',
                textAlign: 'left',
                position: 'relative',
                transition: 'all 0.2s ease'
              }}
            >
              <i className="fa-solid fa-wallet" style={{ width: '18px' }}></i>
              <span>Ledger</span>
              {pendingTransactionsCount > 0 && (
                <span style={{ marginLeft: 'auto', background: '#ef4444', color: '#fff', fontSize: '0.65rem', padding: '0.15rem 0.45rem', borderRadius: '10px', fontWeight: 'bold' }}>
                  {pendingTransactionsCount}
                </span>
              )}
            </button>
          )}

          {hasAccess('gateways') && (
            <button
              onClick={() => { setActiveTab('gateways'); setSidebarOpen(false); }}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem',
                background: activeTab === 'gateways' ? 'var(--gold-primary)' : 'none',
                color: activeTab === 'gateways' ? '#111' : '#fff',
                fontSize: '0.8rem',
                fontWeight: 'bold',
                padding: '0.75rem 1rem',
                borderRadius: '8px',
                border: 'none',
                cursor: 'pointer',
                textAlign: 'left',
                transition: 'all 0.2s ease'
              }}
            >
              <i className="fa-solid fa-sliders" style={{ width: '18px' }}></i>
              <span>Payment Gateways</span>
            </button>
          )}

          {hasAccess('tx_search') && (
            <button
              onClick={() => { setActiveTab('tx_search'); setSidebarOpen(false); }}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem',
                background: activeTab === 'tx_search' ? 'var(--gold-primary)' : 'none',
                color: activeTab === 'tx_search' ? '#111' : '#fff',
                fontSize: '0.8rem',
                fontWeight: 'bold',
                padding: '0.75rem 1rem',
                borderRadius: '8px',
                border: 'none',
                cursor: 'pointer',
                textAlign: 'left',
                transition: 'all 0.2s ease'
              }}
            >
              <i className="fa-solid fa-clock-rotate-left" style={{ width: '18px' }}></i>
              <span>Transaction Logs</span>
            </button>
          )}

          {hasAccess('coins') && (
            <button
              onClick={() => { setActiveTab('coins'); setSidebarOpen(false); }}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem',
                background: activeTab === 'coins' ? 'var(--gold-primary)' : 'none',
                color: activeTab === 'coins' ? '#111' : '#fff',
                fontSize: '0.8rem',
                fontWeight: 'bold',
                padding: '0.75rem 1rem',
                borderRadius: '8px',
                border: 'none',
                cursor: 'pointer',
                textAlign: 'left',
                position: 'relative',
                transition: 'all 0.2s ease'
              }}
            >
              <i className="fa-solid fa-coins" style={{ width: '18px' }}></i>
              <span>Coins Allotment</span>
              {pendingCoinsCount > 0 && (
                <span style={{ marginLeft: 'auto', background: '#ef4444', color: '#fff', fontSize: '0.65rem', padding: '0.15rem 0.45rem', borderRadius: '10px', fontWeight: 'bold' }}>
                  {pendingCoinsCount}
                </span>
              )}
            </button>
          )}

          {hasAccess('shift_reports') && (
            <button
              onClick={() => { setActiveTab('shift_reports'); setSidebarOpen(false); }}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem',
                background: activeTab === 'shift_reports' ? 'var(--gold-primary)' : 'none',
                color: activeTab === 'shift_reports' ? '#111' : '#fff',
                fontSize: '0.8rem',
                fontWeight: 'bold',
                padding: '0.75rem 1rem',
                borderRadius: '8px',
                border: 'none',
                cursor: 'pointer',
                textAlign: 'left',
                transition: 'all 0.2s ease'
              }}
            >
              <i className="fa-solid fa-clock-rotate-left" style={{ width: '18px' }}></i>
              <span>Shift Reports</span>
            </button>
          )}

          {hasAccess('support') && (
            <button
              onClick={() => { setActiveTab('support'); setSidebarOpen(false); }}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem',
                background: activeTab === 'support' ? 'var(--gold-primary)' : 'none',
                color: activeTab === 'support' ? '#111' : '#fff',
                fontSize: '0.8rem',
                fontWeight: 'bold',
                padding: '0.75rem 1rem',
                borderRadius: '8px',
                border: 'none',
                cursor: 'pointer',
                textAlign: 'left',
                position: 'relative',
                transition: 'all 0.2s ease'
              }}
            >
              <i className="fa-solid fa-comments" style={{ width: '18px' }}></i>
              <span>Live Chat Support</span>
              {statsData?.stats?.pendingChatsCount > 0 && (
                <span style={{ marginLeft: 'auto', background: '#ef4444', color: '#fff', fontSize: '0.65rem', padding: '0.15rem 0.45rem', borderRadius: '10px', fontWeight: 'bold' }}>
                  {statsData.stats.pendingChatsCount}
                </span>
              )}
            </button>
          )}

          {hasAccess('staff') && (
            <button
              onClick={() => { setActiveTab('staff'); setSidebarOpen(false); }}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem',
                background: activeTab === 'staff' ? 'var(--gold-primary)' : 'none',
                color: activeTab === 'staff' ? '#111' : '#fff',
                fontSize: '0.8rem',
                fontWeight: 'bold',
                padding: '0.75rem 1rem',
                borderRadius: '8px',
                border: 'none',
                cursor: 'pointer',
                textAlign: 'left',
                transition: 'all 0.2s ease'
              }}
            >
              <i className="fa-solid fa-user-shield" style={{ width: '18px' }}></i>
              <span>Staff Management</span>
            </button>
          )}

          {hasAccess('distributors') && (
            <button
              onClick={() => { setActiveTab('distributors'); setSidebarOpen(false); }}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem',
                background: activeTab === 'distributors' ? 'var(--gold-primary)' : 'none',
                color: activeTab === 'distributors' ? '#111' : '#fff',
                fontSize: '0.8rem',
                fontWeight: 'bold',
                padding: '0.75rem 1rem',
                borderRadius: '8px',
                border: 'none',
                cursor: 'pointer',
                textAlign: 'left',
                transition: 'all 0.2s ease'
              }}
            >
              <i className="fa-solid fa-users-gear" style={{ width: '18px' }}></i>
              <span>Distributors</span>
            </button>
          )}

          {hasAccess('distributors') && (
            <button
              onClick={() => { setActiveTab('affiliates'); setSidebarOpen(false); }}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem',
                background: activeTab === 'affiliates' ? 'var(--gold-primary)' : 'none',
                color: activeTab === 'affiliates' ? '#111' : '#fff',
                fontSize: '0.8rem',
                fontWeight: 'bold',
                padding: '0.75rem 1rem',
                borderRadius: '8px',
                border: 'none',
                cursor: 'pointer',
                textAlign: 'left',
                transition: 'all 0.2s ease',
                marginTop: '0.25rem'
              }}
            >
              <i className="fa-solid fa-users" style={{ width: '18px' }}></i>
              <span>Affiliates (Agents)</span>
            </button>
          )}

          {isSuperAdmin() && !adminUser?.distributorId && (
            <button
              onClick={() => { setActiveTab('affiliate_commissions'); setSidebarOpen(false); }}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem',
                background: activeTab === 'affiliate_commissions' ? 'var(--gold-primary)' : 'none',
                color: activeTab === 'affiliate_commissions' ? '#111' : '#fff',
                fontSize: '0.8rem',
                fontWeight: 'bold',
                padding: '0.75rem 1rem',
                borderRadius: '8px',
                border: 'none',
                cursor: 'pointer',
                textAlign: 'left',
                transition: 'all 0.2s ease',
                marginTop: '0.25rem'
              }}
            >
              <i className="fa-solid fa-hand-holding-dollar" style={{ width: '18px' }}></i>
              <span>Affiliate Commissions</span>
              {statsData?.stats?.pendingAffiliateCommissionsCount > 0 && (
                <span className="notification-badge" style={{ marginLeft: 'auto', background: '#a855f7', color: '#fff', fontSize: '0.65rem', padding: '0.15rem 0.35rem', borderRadius: '10px', fontWeight: 'bold' }}>
                  {statsData.stats.pendingAffiliateCommissionsCount}
                </span>
              )}
            </button>
          )}

          {!adminUser?.distributorId && isSuperAdmin() && (
            <button
              onClick={() => { setActiveTab('website_payments'); setSidebarOpen(false); }}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem',
                background: activeTab === 'website_payments' ? 'var(--gold-primary)' : 'none',
                color: activeTab === 'website_payments' ? '#111' : '#fff',
                fontSize: '0.8rem',
                fontWeight: 'bold',
                padding: '0.75rem 1rem',
                borderRadius: '8px',
                border: 'none',
                cursor: 'pointer',
                textAlign: 'left',
                transition: 'all 0.2s ease'
              }}
            >
              <i className="fa-solid fa-file-invoice-dollar" style={{ width: '18px' }}></i>
              <span>Website Payments</span>
              {statsData?.stats?.pendingWebsitePaymentsCount > 0 && (
                <span className="notification-badge" style={{ marginLeft: 'auto', background: '#ef4444', color: '#fff', fontSize: '0.65rem', padding: '0.15rem 0.35rem', borderRadius: '10px', fontWeight: 'bold' }}>
                  {statsData.stats.pendingWebsitePaymentsCount}
                </span>
              )}
            </button>
          )}

          {!adminUser?.distributorId && isSuperAdmin() && (
            <button
              onClick={() => { setActiveTab('campaign_requests'); setSidebarOpen(false); }}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem',
                background: activeTab === 'campaign_requests' ? 'var(--gold-primary)' : 'none',
                color: activeTab === 'campaign_requests' ? '#111' : '#fff',
                fontSize: '0.8rem',
                fontWeight: 'bold',
                padding: '0.75rem 1rem',
                borderRadius: '8px',
                border: 'none',
                cursor: 'pointer',
                textAlign: 'left',
                transition: 'all 0.2s ease',
                marginTop: '0.25rem'
              }}
            >
              <i className="fa-solid fa-bullhorn" style={{ width: '18px' }}></i>
              <span>Ads Campaigns</span>
              {statsData?.stats?.pendingCampaignRequestsCount > 0 && (
                <span className="notification-badge" style={{ marginLeft: 'auto', background: '#ef4444', color: '#fff', fontSize: '0.65rem', padding: '0.15rem 0.35rem', borderRadius: '10px', fontWeight: 'bold' }}>
                  {statsData.stats.pendingCampaignRequestsCount}
                </span>
              )}
            </button>
          )}

          {!adminUser?.distributorId && isSuperAdmin() && (
            <button
              onClick={() => { setActiveTab('deleted_accounts'); setSidebarOpen(false); }}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem',
                background: activeTab === 'deleted_accounts' ? 'var(--gold-primary)' : 'none',
                color: activeTab === 'deleted_accounts' ? '#111' : '#fff',
                fontSize: '0.8rem',
                fontWeight: 'bold',
                padding: '0.75rem 1rem',
                borderRadius: '8px',
                border: 'none',
                cursor: 'pointer',
                textAlign: 'left',
                transition: 'all 0.2s ease'
              }}
            >
              <i className="fa-solid fa-trash-arrow-up" style={{ width: '18px' }}></i>
              <span>Deleted Accounts</span>
            </button>
          )}

          {!adminUser?.distributorId && isSuperAdmin() && (
            <button
              onClick={() => { setActiveTab('devices'); setSidebarOpen(false); }}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem',
                background: activeTab === 'devices' ? 'var(--gold-primary)' : 'none',
                color: activeTab === 'devices' ? '#111' : '#fff',
                fontSize: '0.8rem',
                fontWeight: 'bold',
                padding: '0.75rem 1rem',
                borderRadius: '8px',
                border: 'none',
                cursor: 'pointer',
                textAlign: 'left',
                transition: 'all 0.2s ease'
              }}
            >
              <i className="fa-solid fa-mobile-screen-button" style={{ width: '18px' }}></i>
              <span>Device Management</span>
            </button>
          )}

          {hasAccess('settings') && (
            <button
              onClick={() => { setActiveTab('settings'); setSidebarOpen(false); }}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem',
                background: activeTab === 'settings' ? 'var(--gold-primary)' : 'none',
                color: activeTab === 'settings' ? '#111' : '#fff',
                fontSize: '0.8rem',
                fontWeight: 'bold',
                padding: '0.75rem 1rem',
                borderRadius: '8px',
                border: 'none',
                cursor: 'pointer',
                textAlign: 'left',
                transition: 'all 0.2s ease'
              }}
            >
              <i className="fa-solid fa-sliders" style={{ width: '18px' }}></i>
              <span>System Settings</span>
            </button>
          )}

          {hasAccess('frontend_settings') && (
            <button
              onClick={() => { setActiveTab('frontend_settings'); setSidebarOpen(false); }}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem',
                background: activeTab === 'frontend_settings' ? 'var(--gold-primary)' : 'none',
                color: activeTab === 'frontend_settings' ? '#111' : '#fff',
                fontSize: '0.8rem',
                fontWeight: 'bold',
                padding: '0.75rem 1rem',
                borderRadius: '8px',
                border: 'none',
                cursor: 'pointer',
                textAlign: 'left',
                transition: 'all 0.2s ease'
              }}
            >
              <i className="fa-solid fa-palette" style={{ width: '18px' }}></i>
              <span>Frontend CMS</span>
            </button>
          )}
        </nav>

        {/* Profile Card, Portal APK & Logout */}
        <div style={{ padding: '1.25rem', borderTop: '1px solid rgba(255,255,255,0.05)', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontSize: '0.8rem', fontWeight: 'bold', color: '#fff' }}>{adminUser?.name || 'System Admin'}</span>
            <span style={{ fontSize: '0.65rem', color: '#ffd700', textTransform: 'uppercase', marginTop: '0.15rem' }}>
              <i className="fa-solid fa-shield-halved"></i> {adminUser?.role?.replace('_', ' ') || 'Super Admin'}
            </span>
          </div>
          <button
            type="button"
            onClick={handleSyncNotifications}
            disabled={pushSyncState.loading}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.45rem',
              padding: '0.55rem 0.6rem',
              borderRadius: '8px',
              border: pushSyncState.success
                ? '1px solid rgba(74, 222, 128, 0.6)'
                : '1px solid rgba(255, 215, 0, 0.35)',
              background: pushSyncState.success
                ? 'rgba(74, 222, 128, 0.15)'
                : 'rgba(255, 215, 0, 0.08)',
              color: pushSyncState.success ? '#4ade80' : '#ffe566',
              fontSize: '0.7rem',
              fontWeight: 800,
              cursor: pushSyncState.loading ? 'wait' : 'pointer',
              transition: 'all 0.2s ease'
            }}
          >
            <i className={`fa-solid ${pushSyncState.loading ? 'fa-spinner fa-spin' : pushSyncState.success ? 'fa-circle-check' : 'fa-bell'}`} />
            <span>
              {pushSyncState.loading
                ? 'Connecting Device...'
                : pushSyncState.message
                ? pushSyncState.message
                : '🔔 Sync / Enable Device Push'}
            </span>
          </button>
          <a
            href="/downloads/jackpot-portal.apk"
            download
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.45rem',
              padding: '0.55rem 0.6rem',
              borderRadius: '8px',
              textDecoration: 'none',
              fontSize: '0.7rem',
              fontWeight: 800,
              background: 'linear-gradient(135deg, rgba(255,215,0,0.2) 0%, rgba(234,179,8,0.12) 100%)',
              border: '1px solid rgba(255,215,0,0.4)',
              color: '#ffe566'
            }}
          >
            <i className="fa-solid fa-mobile-screen-button" aria-hidden="true" />
            <span>Download Portal App</span>
          </a>
          <button className="lobby-nav-btn logout-btn" onClick={onLogout} style={{ width: '100%', padding: '0.6rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', margin: 0 }}>
            <i className="fa-solid fa-right-from-bracket"></i> <span>Logout</span>
          </button>
        </div>
      </aside>

      {/* Main Content Workspace Wrapper */}
      <main className={`admin-main-workspace${activeTab === 'support' ? ' admin-main-workspace--support' : ''}`}>
        <PullToRefresh
          className="admin-workspace-scroll"
          enabled={activeTab !== 'support'}
          onRefresh={async () => {
            // Revalidate all live admin queues + stats (same as a full soft refresh)
            await Promise.all([
              mutate((key) => typeof key === 'string' && key.includes('/api/admin/stats')),
              mutate((key) => typeof key === 'string' && key.includes('/api/account-requests')),
              mutate(
                (key) =>
                  typeof key === 'string' &&
                  key.includes('/api/transactions') &&
                  !key.includes('AFFILIATE_COMMISSION')
              ),
              mutate((key) => typeof key === 'string' && key.includes('/api/coins-notifications')),
              mutate((key) => typeof key === 'string' && key.includes('/api/support')),
              mutate((key) => typeof key === 'string' && key.includes('/api/campaign-requests')),
              mutate((key) => typeof key === 'string' && key.includes('/api/games')),
              mutate((key) => typeof key === 'string' && key.includes('/api/users')),
              mutate((key) => typeof key === 'string' && key.includes('/api/gateways')),
              mutate((key) => typeof key === 'string' && key.includes('/api/distributors'))
            ]);
          }}
        >
        <TabErrorBoundary onBack={() => setActiveTab('dashboard')}>
        <Suspense fallback={
          <div style={{ padding: '2rem', textAlign: 'center', opacity: 0.5 }}>
            <i className="fa-solid fa-spinner fa-spin" style={{ fontSize: '2rem', color: 'var(--gold-primary)', marginBottom: '1rem', display: 'block' }}></i>
            <p>Loading tab content...</p>
          </div>
        }>
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.15, ease: 'easeOut' }}
              style={{ width: '100%', height: '100%' }}
            >
              {activeTab === 'dashboard' && hasAccess('dashboard') && (
                <OverviewTab adminUser={adminUser} onUpdateGameCoinsPool={onUpdateGameCoinsPool} />
              )}
              {activeTab === 'games' && hasAccess('games') && (
                <GamesLibraryTab onAddGameClick={onAddGameClick} onEditGameClick={onEditGameClick} onDeleteGame={onDeleteGame} />
              )}
              {activeTab === 'users' && hasAccess('users') && (
                <PlayerAccountsTab adminUser={adminUser} onDeleteUser={onDeleteUser} />
              )}
              {activeTab === 'requests' && hasAccess('requests') && (
                <RequestsTab adminUser={adminUser} onApproveRequest={onApproveRequest} completedActionIds={completedActionIds} processingIds={processingIds} wrapAction={wrapAction} />
              )}
              {activeTab === 'ledger' && hasAccess('ledger') && (
                <LedgerTab
                  onInspectProof={onInspectProof}
                  onApproveTransaction={onApproveTransaction}
                  onFailTransaction={onFailTransaction}
                  completedActionIds={completedActionIds}
                  processingIds={processingIds}
                  wrapAction={wrapAction}
                  adminUser={adminUser}
                />
              )}
              {activeTab === 'gateways' && hasAccess('gateways') && (
                <GatewaysTab onAddGatewayClick={onAddGatewayClick} onEditGatewayClick={onEditGatewayClick} onDeleteGateway={onDeleteGateway} />
              )}
              {activeTab === 'coins' && hasAccess('coins') && (
                <CoinsAllotmentTab
                  onUpdateCoinsNotification={onUpdateCoinsNotification}
                  completedActionIds={completedActionIds}
                  processingIds={processingIds}
                  wrapAction={wrapAction}
                  adminUser={adminUser}
                />
              )}
              {activeTab === 'support' && hasAccess('support') && (
                <SupportTab adminUser={adminUser} />
              )}
              {activeTab === 'staff' && hasAccess('staff') && (
                <StaffTab adminUser={adminUser} onCreateAdmin={onCreateAdmin} onDeleteUser={onDeleteUser} />
              )}
              {activeTab === 'distributors' && hasAccess('distributors') && (
                <DistributorsTab />
              )}
              {activeTab === 'affiliates' && hasAccess('distributors') && (
                <AffiliatesTab />
              )}
              {activeTab === 'deleted_accounts' && !adminUser?.distributorId && isSuperAdmin() && (
                <DeletedPlayersTab />
              )}
              {activeTab === 'affiliate_commissions' && isSuperAdmin() && !adminUser?.distributorId && (
                <AffiliateCommissionTab
                  onInspectProof={onInspectProof}
                  completedActionIds={completedActionIds}
                  adminUser={adminUser}
                />
              )}
              {activeTab === 'website_payments' && !adminUser?.distributorId && isSuperAdmin() && (
                <WebsitePaymentsTab
                  onInspectProof={onInspectProof}
                  completedActionIds={completedActionIds}
                  adminUser={adminUser}
                />
              )}
              {activeTab === 'campaign_requests' && !adminUser?.distributorId && isSuperAdmin() && (
                <CampaignRequestsTab
                  adminUser={adminUser}
                  onInspectProof={onInspectProof}
                />
              )}
              {activeTab === 'devices' && !adminUser?.distributorId && isSuperAdmin() && (
                <DevicesTab adminUser={adminUser} />
              )}
              {activeTab === 'settings' && hasAccess('settings') && (
                <SettingsTab onUpdateSettings={onUpdateSettings} />
              )}
              {activeTab === 'frontend_settings' && hasAccess('frontend_settings') && (
                <FrontendSettingsTab adminUser={adminUser} />
              )}
              {activeTab === 'shift_reports' && hasAccess('shift_reports') && (
                <ShiftReportsTab />
              )}
              {activeTab === 'shift_dashboard' && hasAccess('shift_dashboard') && (
                <ShiftDashboardTab adminUser={adminUser} />
              )}
              {activeTab === 'promotions' && hasAccess('promotions') && (
                <PromotionsTab adminUser={adminUser} />
              )}
              {activeTab === 'tx_search' && hasAccess('tx_search') && (
                <TxSearchTab onInspectProof={onInspectProof} adminUser={adminUser} />
              )}
            </motion.div>
          </AnimatePresence>
        </Suspense>
        </TabErrorBoundary>
        </PullToRefresh>
      </main>
    </div>
  );
}
