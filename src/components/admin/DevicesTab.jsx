'use client';

import React, { useState, useEffect } from 'react';
import usePollingSWR from '../../hooks/usePollingSWR';
import { POLL } from '../../lib/pollingConfig';
import PanelModalBackdrop from '../PanelModalBackdrop';
import { formatDeviceDateTime } from '../../lib/formatDateTime';

export default function DevicesTab({ adminUser }) {
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);

  // Quick Unlink by Email State
  const [quickUnlinkEmail, setQuickUnlinkEmail] = useState('');
  const [isSubmittingQuickUnlink, setIsSubmittingQuickUnlink] = useState(false);
  const [feedbackMessage, setFeedbackMessage] = useState(null);

  // Modal States
  const [selectedDeviceToBlock, setSelectedDeviceToBlock] = useState(null);
  const [blockReason, setBlockReason] = useState('');
  const [isSubmittingBlock, setIsSubmittingBlock] = useState(false);

  const [selectedDeviceToUnlink, setSelectedDeviceToUnlink] = useState(null);
  const [isSubmittingUnlink, setIsSubmittingUnlink] = useState(false);

  const [selectedDeviceToUnblock, setSelectedDeviceToUnblock] = useState(null);
  const [isSubmittingUnblock, setIsSubmittingUnblock] = useState(false);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(searchQuery);
      setPage(1);
    }, 400);
    return () => clearTimeout(handler);
  }, [searchQuery]);

  const isSuperAdmin = adminUser?.role === 'admin' || adminUser?.email === process.env.NEXT_PUBLIC_ADMIN_EMAIL;

  const swrKey = isSuperAdmin
    ? `/api/admin/devices?page=${page}&limit=25&search=${encodeURIComponent(debouncedSearch)}&role=${encodeURIComponent(roleFilter)}&status=${encodeURIComponent(statusFilter)}&adminRole=${encodeURIComponent(adminUser?.role || '')}&adminEmail=${encodeURIComponent(adminUser?.email || '')}`
    : null;

  const { data, error, mutate, isValidating } = usePollingSWR(swrKey, POLL.LISTS);

  const isInitialLoading = !data && !error;
  const isUpdating = isValidating && Boolean(data);

  const devices = data?.devices || [];
  const stats = data?.stats || { totalDevices: 0, activeToday: 0, staffDevices: 0, blockedCount: 0 };
  const totalPages = data?.totalPages || 1;

  if (!isSuperAdmin) {
    return (
      <div className="admin-section-card" style={{ padding: '2rem', textAlign: 'center', color: '#ef4444' }}>
        <i className="fa-solid fa-lock" style={{ fontSize: '3rem', marginBottom: '1rem' }}></i>
        <h3>Access Restricted: Super Admin Only</h3>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
          Device management, unlinking, and permanent device banning is strictly reserved for the Super Admin (Owner) account.
        </p>
      </div>
    );
  }

  // Handle Quick Unlink by typing an email directly
  const handleQuickUnlink = async (e) => {
    e.preventDefault();
    const targetEmail = quickUnlinkEmail.trim().toLowerCase();
    if (!targetEmail) {
      alert('Please enter a valid player email address.');
      return;
    }

    setIsSubmittingQuickUnlink(true);
    setFeedbackMessage(null);

    try {
      const res = await fetch('/api/admin/devices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'unlink',
          email: targetEmail,
          adminRole: adminUser?.role || 'admin',
          adminEmail: adminUser?.email || ''
        })
      });

      const resData = await res.json();
      if (resData?.success) {
        setFeedbackMessage({
          type: 'success',
          text: `Device lock released for ${targetEmail}! The player can now register a new account or log in on their device without the "Account Detected" error.`
        });
        setQuickUnlinkEmail('');
        mutate();
      } else {
        setFeedbackMessage({
          type: 'error',
          text: resData?.message || 'Failed to unlink device for this email.'
        });
      }
    } catch (err) {
      console.error('Error unlinking device:', err);
      setFeedbackMessage({
        type: 'error',
        text: 'Network error while releasing device lock.'
      });
    } finally {
      setIsSubmittingQuickUnlink(false);
    }
  };

  // Handle Modal Unlink for a specific table device row
  const handleConfirmUnlink = async (e) => {
    e.preventDefault();
    if (!selectedDeviceToUnlink) return;

    setIsSubmittingUnlink(true);
    try {
      const res = await fetch('/api/admin/devices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'unlink',
          email: selectedDeviceToUnlink.email,
          deviceId: selectedDeviceToUnlink.deviceId,
          deviceFingerprint: selectedDeviceToUnlink.deviceFingerprint,
          adminRole: adminUser?.role || 'admin',
          adminEmail: adminUser?.email || ''
        })
      });

      const resData = await res.json();
      if (resData?.success) {
        alert(`Device lock released successfully for ${selectedDeviceToUnlink.email || 'this device'}! The user on this device can now sign up fresh.`);
        setSelectedDeviceToUnlink(null);
        mutate();
      } else {
        alert(resData?.message || 'Failed to unlink device.');
      }
    } catch (err) {
      console.error('Error unlinking device:', err);
      alert('Network error while releasing device lock.');
    } finally {
      setIsSubmittingUnlink(false);
    }
  };

  // Handle Unblock Device
  const handleConfirmUnblock = async (e) => {
    e.preventDefault();
    if (!selectedDeviceToUnblock) return;

    setIsSubmittingUnblock(true);
    try {
      const res = await fetch('/api/admin/devices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'unblock',
          deviceId: selectedDeviceToUnblock.deviceId,
          deviceFingerprint: selectedDeviceToUnblock.deviceFingerprint,
          adminRole: adminUser?.role || 'admin',
          adminEmail: adminUser?.email || ''
        })
      });

      const resData = await res.json();
      if (resData?.success) {
        alert('Device successfully unblocked! Regular logins have been restored for this device.');
        setSelectedDeviceToUnblock(null);
        mutate();
      } else {
        alert(resData?.message || 'Failed to unblock device.');
      }
    } catch (err) {
      console.error('Error unblocking device:', err);
      alert('Network error while unblocking device.');
    } finally {
      setIsSubmittingUnblock(false);
    }
  };

  // Handle Permanent Block
  const handleConfirmBlock = async (e) => {
    e.preventDefault();
    if (!selectedDeviceToBlock) return;

    setIsSubmittingBlock(true);
    try {
      const res = await fetch('/api/admin/devices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'block',
          deviceId: selectedDeviceToBlock.deviceId,
          deviceFingerprint: selectedDeviceToBlock.deviceFingerprint,
          reason: blockReason.trim() || 'Permanently blocked by Super Admin',
          adminRole: adminUser?.role || 'admin',
          adminEmail: adminUser?.email || ''
        })
      });

      const resData = await res.json();
      if (resData?.success) {
        alert('Device blocked! Active sessions on this device have been revoked.');
        setSelectedDeviceToBlock(null);
        setBlockReason('');
        mutate();
      } else {
        alert(resData?.message || 'Failed to block device.');
      }
    } catch (err) {
      console.error('Error blocking device:', err);
      alert('Network error while blocking device.');
    } finally {
      setIsSubmittingBlock(false);
    }
  };

  return (
    <section className="admin-section-card" style={{ animation: 'fade-in 0.2s ease-out' }}>
      {/* Header Banner */}
      <div className="section-card-header" style={{ marginBottom: '1.25rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '1.2rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <i className="fa-solid fa-mobile-screen-button gold-text"></i>
              Super Admin Device Management & Unlink System
            </h3>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
              Monitor logged-in devices, release device locks (Account Detected removal), and manage hardware bans across all posts.
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            {isUpdating && (
              <span style={{ fontSize: '0.725rem', color: '#facc15', display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                <i className="fa-solid fa-spinner fa-spin"></i> Updating...
              </span>
            )}
            <span style={{ background: 'rgba(250, 204, 21, 0.1)', border: '1px solid #facc15', color: '#facc15', padding: '0.3rem 0.75rem', borderRadius: '20px', fontSize: '0.725rem', fontWeight: 'bold' }}>
              👑 Super Admin Access Granted
            </span>
          </div>
        </div>
      </div>

      {/* Metrics Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.85rem', marginBottom: '1.25rem' }}>
        <div style={{ background: '#0b0d16', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '10px', padding: '0.85rem 1rem' }}>
          <div style={{ fontSize: '0.7rem', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Logged-in Devices</div>
          <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#fff', marginTop: '0.2rem' }}>
            {isInitialLoading ? <i className="fa-solid fa-spinner fa-spin" style={{ fontSize: '1.1rem', color: 'var(--gold-primary)' }}></i> : stats.totalDevices}
          </div>
        </div>

        <div style={{ background: '#0b0d16', border: '1px solid rgba(34, 197, 94, 0.2)', borderRadius: '10px', padding: '0.85rem 1rem' }}>
          <div style={{ fontSize: '0.7rem', color: '#4ade80', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Active Today</div>
          <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#4ade80', marginTop: '0.2rem' }}>
            {isInitialLoading ? <i className="fa-solid fa-spinner fa-spin" style={{ fontSize: '1.1rem', color: '#4ade80' }}></i> : stats.activeToday}
          </div>
        </div>

        <div style={{ background: '#0b0d16', border: '1px solid rgba(56, 189, 248, 0.2)', borderRadius: '10px', padding: '0.85rem 1rem' }}>
          <div style={{ fontSize: '0.7rem', color: '#38bdf8', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Staff & Admin Devices</div>
          <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#38bdf8', marginTop: '0.2rem' }}>
            {isInitialLoading ? <i className="fa-solid fa-spinner fa-spin" style={{ fontSize: '1.1rem', color: '#38bdf8' }}></i> : stats.staffDevices}
          </div>
        </div>

        <div style={{ background: '#0b0d16', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: '10px', padding: '0.85rem 1rem' }}>
          <div style={{ fontSize: '0.7rem', color: '#ef4444', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Blocked Devices</div>
          <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#ef4444', marginTop: '0.2rem' }}>
            {isInitialLoading ? <i className="fa-solid fa-spinner fa-spin" style={{ fontSize: '1.1rem', color: '#ef4444' }}></i> : stats.blockedCount}
          </div>
        </div>
      </div>

      {/* QUICK UNLINK BY EMAIL TOOL (Purana Email Se Device Hatayein) */}
      <div
        style={{
          background: 'linear-gradient(135deg, rgba(14, 165, 233, 0.08) 0%, rgba(16, 185, 129, 0.08) 100%)',
          border: '1px solid rgba(56, 189, 248, 0.35)',
          borderRadius: '12px',
          padding: '1.1rem 1.25rem',
          marginBottom: '1.25rem',
          boxShadow: '0 4px 20px rgba(0, 0, 0, 0.2)'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.35rem' }}>
          <div style={{ background: 'rgba(56, 189, 248, 0.2)', color: '#38bdf8', padding: '0.35rem 0.55rem', borderRadius: '8px', fontSize: '0.9rem' }}>
            <i className="fa-solid fa-link-slash"></i>
          </div>
          <h4 style={{ margin: 0, fontSize: '0.975rem', fontWeight: '800', color: '#fff' }}>
            Release Device Lock by Email <span style={{ color: '#38bdf8', fontSize: '0.8rem', fontWeight: 'normal' }}>(Purana Email Daalkar Device Lock Remove Karein)</span>
          </h4>
        </div>
        <p style={{ margin: '0 0 0.85rem', fontSize: '0.775rem', color: '#cbd5e1', lineHeight: '1.4' }}>
          Agar koi player purane email se login nahi kar pa raha hai aur uska device lock hai (<strong>&quot;Account Detected&quot;</strong> error aa raha hai), toh yahan uska purana email daalkar <strong>&quot;Release Device Lock&quot;</strong> par click karein. Isse us device ka lock hat jayega aur player naye account se register kar sakega.
        </p>

        <form onSubmit={handleQuickUnlink} style={{ display: 'flex', flexWrap: 'wrap', gap: '0.65rem', alignItems: 'center' }}>
          <div style={{ flex: '1', minWidth: '260px', position: 'relative' }}>
            <input
              type="email"
              placeholder="Enter player's old registered email (e.g. vow553@usbc.be)..."
              value={quickUnlinkEmail}
              onChange={(e) => setQuickUnlinkEmail(e.target.value)}
              style={{
                width: '100%',
                background: '#07090f',
                border: '1px solid rgba(56, 189, 248, 0.3)',
                borderRadius: '8px',
                padding: '0.6rem 0.85rem 0.6rem 2.2rem',
                color: '#fff',
                fontSize: '0.8rem',
                outline: 'none'
              }}
            />
            <i className="fa-solid fa-envelope" style={{ position: 'absolute', left: '0.8rem', top: '50%', transform: 'translateY(-50%)', color: '#38bdf8', fontSize: '0.75rem' }}></i>
          </div>

          <button
            type="submit"
            disabled={isSubmittingQuickUnlink || !quickUnlinkEmail.trim()}
            style={{
              background: 'linear-gradient(135deg, #0284c7, #0d9488)',
              color: '#fff',
              border: 'none',
              padding: '0.6rem 1.25rem',
              borderRadius: '8px',
              fontSize: '0.8rem',
              fontWeight: 'bold',
              cursor: isSubmittingQuickUnlink || !quickUnlinkEmail.trim() ? 'not-allowed' : 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.45rem',
              boxShadow: '0 2px 10px rgba(2, 132, 199, 0.3)',
              opacity: isSubmittingQuickUnlink || !quickUnlinkEmail.trim() ? 0.6 : 1
            }}
          >
            {isSubmittingQuickUnlink ? (
              <>
                <i className="fa-solid fa-spinner fa-spin"></i> Releasing Lock...
              </>
            ) : (
              <>
                <i className="fa-solid fa-key"></i> Release Device Lock 🔓
              </>
            )}
          </button>
        </form>

        {feedbackMessage && (
          <div
            style={{
              marginTop: '0.75rem',
              padding: '0.65rem 0.85rem',
              borderRadius: '8px',
              fontSize: '0.775rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              background: feedbackMessage.type === 'success' ? 'rgba(34, 197, 94, 0.15)' : 'rgba(239, 68, 68, 0.15)',
              border: feedbackMessage.type === 'success' ? '1px solid #22c55e' : '1px solid #ef4444',
              color: feedbackMessage.type === 'success' ? '#4ade80' : '#f87171'
            }}
          >
            <i className={`fa-solid ${feedbackMessage.type === 'success' ? 'fa-circle-check' : 'fa-triangle-exclamation'}`}></i>
            <span>{feedbackMessage.text}</span>
          </div>
        )}
      </div>

      {/* Filters & Search Bar */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1.25rem', padding: '1rem', background: '#0b0d16', borderRadius: '10px', alignItems: 'center' }}>
        <div className="input-wrapper search-wrapper" style={{ flex: 1, minWidth: '240px', background: '#07090f', margin: 0 }}>
          <i className="fa-solid fa-magnifying-glass input-icon"></i>
          <input
            type="text"
            placeholder="Search by user name, email, post/role, IP or device ID..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <select
          value={roleFilter}
          onChange={(e) => { setRoleFilter(e.target.value); setPage(1); }}
          style={{ background: '#07090f', color: '#fff', border: '1px solid rgba(255,255,255,0.12)', padding: '0.55rem 0.75rem', borderRadius: '8px', fontSize: '0.75rem', outline: 'none', cursor: 'pointer' }}
        >
          <option value="">All Posts / Roles</option>
          <option value="admin">Super Admin (Owner)</option>
          <option value="financial_admin">Financial Admin</option>
          <option value="coins_admin">Coins Staff</option>
          <option value="support_admin">Support Agent</option>
          <option value="distributor">Distributor Office</option>
          <option value="distributor_staff">Distributor Staff</option>
          <option value="agent">Affiliate Agent</option>
          <option value="player">Player Account</option>
        </select>

        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
          style={{ background: '#07090f', color: '#fff', border: '1px solid rgba(255,255,255,0.12)', padding: '0.55rem 0.75rem', borderRadius: '8px', fontSize: '0.75rem', outline: 'none', cursor: 'pointer' }}
        >
          <option value="">All Statuses</option>
          <option value="ACTIVE">Active Devices</option>
          <option value="BLOCKED">Permanently Blocked</option>
        </select>
      </div>

      {/* Devices Table */}
      <div className="table-responsive">
        <table className="admin-table">
          <thead>
            <tr>
              <th>#</th>
              <th>User & Post Title</th>
              <th>Device & OS Info</th>
              <th>IP Address</th>
              <th>Last Active</th>
              <th>Status</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {isInitialLoading ? (
              <tr>
                <td colSpan="7" style={{ textAlign: 'center', padding: '3.5rem 1rem', color: '#facc15' }}>
                  <i className="fa-solid fa-spinner fa-spin" style={{ fontSize: '2.5rem', marginBottom: '1rem', display: 'block', color: 'var(--gold-primary)' }}></i>
                  <strong style={{ fontSize: '1rem', color: '#fff', display: 'block' }}>Loading Connected Devices...</strong>
                  <p style={{ fontSize: '0.775rem', color: 'var(--text-muted)', marginTop: '0.35rem' }}>
                    Fetching live sessions, fingerprints and security records
                  </p>
                </td>
              </tr>
            ) : error ? (
              <tr>
                <td colSpan="7" style={{ textAlign: 'center', padding: '2.5rem 1rem', color: '#ef4444' }}>
                  <i className="fa-solid fa-circle-exclamation" style={{ fontSize: '2rem', marginBottom: '0.5rem', display: 'block' }}></i>
                  <strong>Failed to load devices data.</strong>
                  <button
                    type="button"
                    onClick={() => mutate()}
                    style={{ display: 'block', margin: '0.75rem auto 0', background: 'rgba(239, 68, 68, 0.2)', border: '1px solid #ef4444', color: '#ef4444', padding: '0.35rem 0.85rem', borderRadius: '6px', cursor: 'pointer', fontSize: '0.75rem' }}
                  >
                    Retry
                  </button>
                </td>
              </tr>
            ) : devices.length === 0 ? (
              <tr>
                <td colSpan="7" style={{ textAlign: 'center', padding: '3rem 1rem', opacity: 0.8 }}>
                  <i className="fa-solid fa-laptop-slash" style={{ fontSize: '2.2rem', marginBottom: '0.75rem', display: 'block', opacity: 0.35, color: '#facc15' }}></i>
                  <strong style={{ color: '#fff', display: 'block', fontSize: '0.95rem' }}>No logged-in devices found</strong>
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.75rem', marginTop: '0.25rem' }}>
                    No devices match your selected search or role filter criteria.
                  </p>
                </td>
              </tr>
            ) : (
              devices.map((device, idx) => {
                const isBlocked = device.isBlocked || device.status === 'PERMANENTLY_BLOCKED';
                return (
                  <tr key={device.id || idx} style={{ opacity: isBlocked ? 0.75 : 1, background: isBlocked ? 'rgba(239, 68, 68, 0.05)' : 'transparent' }}>
                    <td>{(page - 1) * 25 + idx + 1}</td>

                    {/* User & Post */}
                    <td>
                      <div>
                        <strong style={{ fontSize: '0.85rem', color: '#fff', display: 'block' }}>
                          {device.name || 'Player'}
                        </strong>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{device.email}</span>

                        <div style={{ marginTop: '0.35rem', display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
                          {device.badges && device.badges.length > 0 ? (
                            device.badges.map((b, bIdx) => (
                              <span
                                key={bIdx}
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '0.3rem',
                                  padding: '0.15rem 0.5rem',
                                  borderRadius: '6px',
                                  fontSize: '0.675rem',
                                  fontWeight: '700',
                                  background: 'rgba(255,255,255,0.06)',
                                  color: b.color || '#facc15',
                                  border: `1px solid ${b.color || 'rgba(255,255,255,0.15)'}`
                                }}
                              >
                                <span>{b.emoji}</span>
                                <span>{b.title}</span>
                              </span>
                            ))
                          ) : (
                            <span
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '0.3rem',
                                padding: '0.15rem 0.5rem',
                                borderRadius: '6px',
                                fontSize: '0.675rem',
                                fontWeight: '700',
                                background: 'rgba(255,255,255,0.06)',
                                color: device.postColor || '#94a3b8',
                                border: `1px solid ${device.postColor || 'rgba(255,255,255,0.1)'}`
                              }}
                            >
                              <span>{device.postEmoji || '🎮'}</span>
                              <span>{device.postTitle || 'Player Account'}</span>
                            </span>
                          )}
                        </div>
                      </div>
                    </td>

                    {/* Device & OS */}
                    <td>
                      <div>
                        {/* Device Model / Name */}
                        <div style={{ fontSize: '0.785rem', fontWeight: 'bold', color: '#fff', display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
                          <i
                            className={`fa-solid ${device.os?.includes('Android') || device.os?.includes('iOS') || device.os?.includes('iPhone') ? 'fa-mobile-screen-button' : (device.os?.includes('iPad') || device.os?.includes('Tablet') ? 'fa-tablet-screen-button' : (device.os?.includes('Mac') || device.os?.includes('Windows') || device.os?.includes('Linux') ? 'fa-desktop' : 'fa-mobile-screen-button'))}`}
                            style={{ color: device.os?.includes('Android') || device.os?.includes('iOS') ? '#38bdf8' : '#facc15', fontSize: '0.85rem' }}
                          ></i>
                          <span>{device.deviceName || device.os || 'Android Smartphone'}</span>
                          <span style={{ fontSize: '0.675rem', color: '#94a3b8', background: 'rgba(255,255,255,0.06)', padding: '0.1rem 0.35rem', borderRadius: '4px' }}>
                            {device.os}
                          </span>
                        </div>

                        {/* App vs Browser Distinction Badge */}
                        <div style={{ marginTop: '0.3rem', display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
                          {device.isApp || device.browser?.includes('App') ? (
                            <span style={{ background: 'linear-gradient(135deg, rgba(250, 204, 21, 0.15), rgba(168, 85, 247, 0.15))', border: '1px solid rgba(250, 204, 21, 0.45)', color: '#facc15', padding: '0.15rem 0.45rem', borderRadius: '4px', fontSize: '0.65rem', fontWeight: 'bold', display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
                              <i className="fa-solid fa-mobile-screen-button"></i> 📲 Jackpot Royals App (APK/PWA)
                            </span>
                          ) : (
                            <span style={{ background: 'rgba(56, 189, 248, 0.12)', border: '1px solid rgba(56, 189, 248, 0.3)', color: '#38bdf8', padding: '0.15rem 0.45rem', borderRadius: '4px', fontSize: '0.65rem', fontWeight: 'bold', display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
                              <i className={device.browser?.includes('Safari') ? 'fa-brands fa-safari' : (device.browser?.includes('Firefox') ? 'fa-brands fa-firefox-browser' : (device.browser?.includes('Edge') ? 'fa-brands fa-edge' : 'fa-brands fa-chrome'))}></i>
                              <span>{device.browser || 'Chrome Browser'}</span>
                            </span>
                          )}
                        </div>

                        <div style={{ fontSize: '0.65rem', color: '#94a3b8', fontFamily: 'monospace', marginTop: '0.25rem' }} title={device.deviceId}>
                          ID: {device.deviceId ? `${device.deviceId.slice(0, 16)}...` : 'N/A'}
                        </div>
                      </div>
                    </td>

                    {/* IP Address */}
                    <td>
                      <span style={{ fontFamily: 'monospace', fontSize: '0.775rem', color: '#cbd5e1' }}>
                        {device.ip || 'Unknown'}
                      </span>
                    </td>

                    {/* Last Active */}
                    <td>
                      <span style={{ fontSize: '0.725rem', color: 'var(--text-muted)' }}>
                        {device.lastActive ? formatDeviceDateTime(device.lastActive) : 'Recently'}
                      </span>
                    </td>

                    {/* Status */}
                    <td>
                      {isBlocked ? (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', background: 'rgba(239, 68, 68, 0.15)', color: '#ef4444', border: '1px solid #ef4444', padding: '0.2rem 0.5rem', borderRadius: '6px', fontSize: '0.675rem', fontWeight: 'bold' }}>
                          <i className="fa-solid fa-ban"></i> PERMANENTLY BLOCKED
                        </span>
                      ) : (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', background: 'rgba(34, 197, 94, 0.15)', color: '#4ade80', border: '1px solid #22c55e', padding: '0.2rem 0.5rem', borderRadius: '6px', fontSize: '0.675rem', fontWeight: 'bold' }}>
                          <i className="fa-solid fa-circle" style={{ fontSize: '0.45rem' }}></i> ACTIVE
                        </span>
                      )}
                    </td>

                    {/* Actions */}
                    <td>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', alignItems: 'center' }}>
                        {/* 1. Unlink Device Action (Device Lock Release) */}
                        <button
                          type="button"
                          onClick={() => setSelectedDeviceToUnlink(device)}
                          title="Release device lock so new account can register on this device"
                          style={{
                            background: 'rgba(56, 189, 248, 0.12)',
                            border: '1px solid rgba(56, 189, 248, 0.4)',
                            color: '#38bdf8',
                            padding: '0.3rem 0.65rem',
                            borderRadius: '6px',
                            fontSize: '0.7rem',
                            fontWeight: 'bold',
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.3rem'
                          }}
                        >
                          <i className="fa-solid fa-link-slash"></i> UNLINK
                        </button>

                        {/* 2. Unblock vs Block Button */}
                        {isBlocked ? (
                          <button
                            type="button"
                            onClick={() => setSelectedDeviceToUnblock(device)}
                            style={{
                              background: 'rgba(34, 197, 94, 0.15)',
                              border: '1px solid #22c55e',
                              color: '#4ade80',
                              padding: '0.3rem 0.65rem',
                              borderRadius: '6px',
                              fontSize: '0.7rem',
                              fontWeight: 'bold',
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '0.3rem'
                            }}
                          >
                            <i className="fa-solid fa-unlock"></i> UNBLOCK
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => { setSelectedDeviceToBlock(device); setBlockReason(''); }}
                            style={{
                              background: 'rgba(239, 68, 68, 0.15)',
                              border: '1px solid #ef4444',
                              color: '#ef4444',
                              padding: '0.3rem 0.65rem',
                              borderRadius: '6px',
                              fontSize: '0.7rem',
                              fontWeight: 'bold',
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '0.3rem'
                            }}
                          >
                            <i className="fa-solid fa-ban"></i> BLOCK
                          </button>
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

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1rem' }}>
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => setPage(p => Math.max(1, p - 1))}
            style={{ background: '#0b0d16', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', padding: '0.4rem 0.85rem', borderRadius: '6px', cursor: page <= 1 ? 'not-allowed' : 'pointer', fontSize: '0.75rem' }}
          >
            Previous
          </button>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Page {page} of {totalPages}</span>
          <button
            type="button"
            disabled={page >= totalPages}
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            style={{ background: '#0b0d16', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', padding: '0.4rem 0.85rem', borderRadius: '6px', cursor: page >= totalPages ? 'not-allowed' : 'pointer', fontSize: '0.75rem' }}
          >
            Next
          </button>
        </div>
      )}

      {/* UNLINK DEVICE CONFIRMATION MODAL */}
      {selectedDeviceToUnlink && (
        <PanelModalBackdrop isOpen={Boolean(selectedDeviceToUnlink)} onClose={() => setSelectedDeviceToUnlink(null)}>
          <div style={{ background: '#0d0f19', border: '1px solid #38bdf8', borderRadius: '16px', padding: '1.5rem', maxWidth: '480px', width: '100%', color: '#fff' }}>
            <div style={{ background: 'rgba(56, 189, 248, 0.15)', border: '1px solid #38bdf8', padding: '0.65rem', borderRadius: '8px', color: '#38bdf8', fontWeight: 'bold', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
              <i className="fa-solid fa-link-slash" style={{ fontSize: '1.1rem' }}></i>
              <span>RELEASE DEVICE LOCK (UNLINK ACCOUNT)</span>
            </div>

            <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 'bold', color: '#fff' }}>
              Release Device Lock for this Account?
            </h3>

            <p style={{ fontSize: '0.8rem', color: '#cbd5e1', lineHeight: 1.5, marginTop: '0.5rem' }}>
              Are you sure you want to remove device binding for <strong>{selectedDeviceToUnlink.name}</strong> (<code style={{ color: '#38bdf8' }}>{selectedDeviceToUnlink.email}</code>)?
            </p>

            <div style={{ background: 'rgba(0,0,0,0.4)', padding: '0.75rem', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.06)', fontSize: '0.75rem', color: '#94a3b8', margin: '0.75rem 0' }}>
              <strong>Unlinking Effects:</strong>
              <ul style={{ margin: '0.3rem 0 0 1.1rem', padding: 0 }}>
                <li>Clears hardware fingerprint and device ID from this player in database.</li>
                <li>Fixes the <strong>&quot;Account Detected: You already have an account from this device&quot;</strong> error.</li>
                <li>Allows the player on this device to register fresh or link a different account.</li>
              </ul>
            </div>

            <form onSubmit={handleConfirmUnlink}>
              <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '1rem' }}>
                <button
                  type="button"
                  onClick={() => setSelectedDeviceToUnlink(null)}
                  style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: '#ccc', padding: '0.55rem 1rem', borderRadius: '8px', cursor: 'pointer', fontSize: '0.8rem' }}
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={isSubmittingUnlink}
                  style={{ background: 'linear-gradient(135deg, #0284c7, #0d9488)', color: '#fff', border: 'none', padding: '0.55rem 1.15rem', borderRadius: '8px', fontWeight: 'bold', cursor: isSubmittingUnlink ? 'wait' : 'pointer', fontSize: '0.8rem' }}
                >
                  {isSubmittingUnlink ? 'RELEASING...' : 'YES, RELEASE DEVICE LOCK 🔓'}
                </button>
              </div>
            </form>
          </div>
        </PanelModalBackdrop>
      )}

      {/* UNBLOCK DEVICE CONFIRMATION MODAL */}
      {selectedDeviceToUnblock && (
        <PanelModalBackdrop isOpen={Boolean(selectedDeviceToUnblock)} onClose={() => setSelectedDeviceToUnblock(null)}>
          <div style={{ background: '#0d0f19', border: '1px solid #22c55e', borderRadius: '16px', padding: '1.5rem', maxWidth: '480px', width: '100%', color: '#fff' }}>
            <div style={{ background: 'rgba(34, 197, 94, 0.15)', border: '1px solid #22c55e', padding: '0.65rem', borderRadius: '8px', color: '#4ade80', fontWeight: 'bold', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
              <i className="fa-solid fa-unlock" style={{ fontSize: '1.1rem' }}></i>
              <span>RESTORE DEVICE ACCESS</span>
            </div>

            <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 'bold', color: '#fff' }}>
              Unblock Device?
            </h3>

            <p style={{ fontSize: '0.8rem', color: '#cbd5e1', lineHeight: 1.5, marginTop: '0.5rem' }}>
              Are you sure you want to remove the ban on device <code style={{ color: '#facc15' }}>{selectedDeviceToUnblock.deviceId}</code>?
            </p>

            <form onSubmit={handleConfirmUnblock}>
              <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '1rem' }}>
                <button
                  type="button"
                  onClick={() => setSelectedDeviceToUnblock(null)}
                  style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: '#ccc', padding: '0.55rem 1rem', borderRadius: '8px', cursor: 'pointer', fontSize: '0.8rem' }}
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={isSubmittingUnblock}
                  style={{ background: '#22c55e', color: '#000', border: 'none', padding: '0.55rem 1.15rem', borderRadius: '8px', fontWeight: 'bold', cursor: isSubmittingUnblock ? 'wait' : 'pointer', fontSize: '0.8rem' }}
                >
                  {isSubmittingUnblock ? 'UNBLOCKING...' : 'YES, UNBLOCK DEVICE ✅'}
                </button>
              </div>
            </form>
          </div>
        </PanelModalBackdrop>
      )}

      {/* Block Confirmation Modal */}
      {selectedDeviceToBlock && (
        <PanelModalBackdrop isOpen={Boolean(selectedDeviceToBlock)} onClose={() => setSelectedDeviceToBlock(null)}>
          <div style={{ background: '#0d0f19', border: '1px solid #ef4444', borderRadius: '16px', padding: '1.5rem', maxWidth: '480px', width: '100%', color: '#fff' }}>
            <div style={{ background: 'rgba(239, 68, 68, 0.15)', border: '1px solid #ef4444', padding: '0.65rem', borderRadius: '8px', color: '#ef4444', fontWeight: 'bold', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
              <i className="fa-solid fa-triangle-exclamation" style={{ fontSize: '1.1rem' }}></i>
              <span>BLOCK DEVICE</span>
            </div>

            <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 'bold', color: '#fff' }}>
              Block Device from Logging In?
            </h3>

            <p style={{ fontSize: '0.8rem', color: '#cbd5e1', lineHeight: 1.5, marginTop: '0.5rem' }}>
              Are you sure you want to block device <code style={{ color: '#facc15' }}>{selectedDeviceToBlock.deviceId}</code> used by <strong>{selectedDeviceToBlock.name}</strong> ({selectedDeviceToBlock.email})?
            </p>

            <div style={{ background: 'rgba(0,0,0,0.4)', padding: '0.75rem', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.06)', fontSize: '0.75rem', color: '#94a3b8', margin: '0.75rem 0' }}>
              <strong>Banning Effects:</strong>
              <ul style={{ margin: '0.3rem 0 0 1.1rem', padding: 0 }}>
                <li>This device is blacklisted in MongoDB.</li>
                <li>All active sessions on this device will be force-logged-out immediately.</li>
                <li>You can unblock this device anytime later from this panel.</li>
              </ul>
            </div>

            <form onSubmit={handleConfirmBlock}>
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', fontSize: '0.725rem', color: '#94a3b8', marginBottom: '0.35rem' }}>
                  Block Reason (Optional audit note):
                </label>
                <input
                  type="text"
                  placeholder="e.g. Fraud, multi-accounting violation, compromised staff device"
                  value={blockReason}
                  onChange={(e) => setBlockReason(e.target.value)}
                  style={{ width: '100%', background: '#07090f', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '8px', padding: '0.55rem', color: '#fff', fontSize: '0.8rem', outline: 'none' }}
                />
              </div>

              <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  onClick={() => setSelectedDeviceToBlock(null)}
                  style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: '#ccc', padding: '0.55rem 1rem', borderRadius: '8px', cursor: 'pointer', fontSize: '0.8rem' }}
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={isSubmittingBlock}
                  style={{ background: '#ef4444', color: '#fff', border: 'none', padding: '0.55rem 1.15rem', borderRadius: '8px', fontWeight: 'bold', cursor: isSubmittingBlock ? 'wait' : 'pointer', fontSize: '0.8rem' }}
                >
                  {isSubmittingBlock ? 'BLOCKING...' : 'YES, BLOCK DEVICE 🚫'}
                </button>
              </div>
            </form>
          </div>
        </PanelModalBackdrop>
      )}
    </section>
  );
}
