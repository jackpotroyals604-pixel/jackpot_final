'use client';

import React, { useState, useEffect, useRef } from 'react';
import useSWR from 'swr';
import { formatDeviceDate } from '../../lib/formatDateTime';

const fetcher = (...args) => fetch(...args).then((res) => res.json());

export default function PromotionsTab({ adminUser }) {
  const [activeSubTab, setActiveSubTab] = useState('segments'); // 'segments' | 'broadcast'

  // SEGMENTS TAB STATES
  const [segment, setSegment] = useState('subscribed'); // 'subscribed' | 'unsubscribed' | 'active'
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(1);
  const limit = 15;

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 400);
    return () => clearTimeout(handler);
  }, [search]);

  // Fetch segmented users
  const { data: userData, mutate: mutateUsers, error: userError } = useSWR(
    `/api/users?segment=${segment}&search=${encodeURIComponent(debouncedSearch)}&page=${page}&limit=${limit}&adminRole=${adminUser?.role || ''}&adminDistributorId=${adminUser?.distributorId || ''}&adminEmail=${encodeURIComponent(adminUser?.email || '')}`,
    fetcher
  );

  const usersList = userData?.users || [];
  const totalUsers = userData?.totalUsers || 0;
  const totalPages = userData?.totalPages || 1;

  // EXPORT MENU & DOWNLOAD STATES
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const exportMenuRef = useRef(null);

  useEffect(() => {
    const handleOutsideClick = (e) => {
      if (exportMenuRef.current && !exportMenuRef.current.contains(e.target)) {
        setShowExportMenu(false);
      }
    };
    if (showExportMenu) {
      document.addEventListener('mousedown', handleOutsideClick);
    }
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
    };
  }, [showExportMenu]);

  const convertToCSV = (data) => {
    if (!data || !data.length) return '';
    const headers = ['Name', 'Email Address', 'Subscriber Status', 'Account Status', 'Coins Balance', 'Referral Code', 'Referred By', 'Distributor ID', 'Registration Date'];
    const rows = data.map((u) => [
      `"${String(u.name || '').replace(/"/g, '""')}"`,
      `"${String(u.email || '').replace(/"/g, '""')}"`,
      `"${u.isSubscribed ? 'Subscribed' : 'Unsubscribed'}"`,
      `"${String(u.status || 'active').replace(/"/g, '""')}"`,
      `"${u.coins ?? 0}"`,
      `"${String(u.referralCode || '').replace(/"/g, '""')}"`,
      `"${String(u.referredBy || '').replace(/"/g, '""')}"`,
      `"${String(u.distributorId || '').replace(/"/g, '""')}"`,
      `"${String(u.createdAt || '').replace(/"/g, '""')}"`
    ]);
    return [headers.join(','), ...rows.map((r) => r.join(','))].join('\r\n');
  };

  const triggerDownload = (csvContent, filename) => {
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleExport = async (exportSegment) => {
    setIsExporting(true);
    try {
      let url = `/api/users?page=1&limit=50000&adminRole=${encodeURIComponent(adminUser?.role || '')}&adminDistributorId=${encodeURIComponent(adminUser?.distributorId || '')}&adminEmail=${encodeURIComponent(adminUser?.email || '')}`;
      if (exportSegment && exportSegment !== 'all') {
        url += `&segment=${encodeURIComponent(exportSegment)}`;
      }
      const res = await fetch(url);
      const json = await res.json();
      if (!json?.success || !json?.users?.length) {
        alert('No player records found for export.');
        return;
      }
      const csv = convertToCSV(json.users);
      const dateStr = new Date().toISOString().slice(0, 10);
      const fileLabel = exportSegment === 'all' ? 'all_players' : `${exportSegment}_list`;
      triggerDownload(csv, `jackpot_${fileLabel}_${dateStr}.csv`);
      setShowExportMenu(false);
    } catch (err) {
      console.error('Export error:', err);
      alert('Failed to export player list.');
    } finally {
      setIsExporting(false);
    }
  };

  // BROADCAST TAB FORM STATES
  const [promoTitle, setPromoTitle] = useState('');
  const [promoMessage, setPromoMessage] = useState('');
  const [promoImage, setPromoImage] = useState('');
  const [promoImageError, setPromoImageError] = useState('');
  const [promoTarget, setPromoTarget] = useState('all'); // 'all' | 'subscribed' | 'unsubscribed' | 'active'
  const [dispatchChannel, setDispatchChannel] = useState('all'); // 'all' | 'push' | 'email' | 'website'
  const [promoType, setPromoType] = useState('message'); // 'message' | 'freeplay' | 'deposit_bonus'
  const [promoFreeplayAmount, setPromoFreeplayAmount] = useState('');
  const [promoBonusPercent, setPromoBonusPercent] = useState('');
  const [isBroadcasting, setIsBroadcasting] = useState(false);

  const handlePromoImageUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (file.size > 8 * 1024 * 1024) {
      setPromoImageError('Image flyer size must be less than 8MB.');
      e.target.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onloadend = () => {
      const img = new Image();
      img.src = reader.result;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;
        const max_width = 800; // Optimal width for lobby banner flyer
        if (width > max_width) {
          height *= max_width / width;
          width = max_width;
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        const compressedBase64 = canvas.toDataURL('image/jpeg', 0.75); // 75% JPEG
        setPromoImage(compressedBase64);
        setPromoImageError('');
      };
    };
    reader.readAsDataURL(file);
  };

  // Fetch past broadcasts
  const { data: promoData, mutate: mutatePromos } = useSWR('/api/promotions', fetcher);
  const pastPromotions = promoData?.promotions || [];

  const handleBroadcastSubmit = async (e) => {
    e.preventDefault();
    if (!promoTitle.trim() || !promoMessage.trim()) {
      alert('Please fill in Title and Message fields.');
      return;
    }
    if (promoType === 'freeplay' && !(parseFloat(promoFreeplayAmount) > 0)) {
      alert('Enter a freeplay amount greater than 0 for a freeplay offer.');
      return;
    }
    if (promoType === 'deposit_bonus' && !(parseFloat(promoBonusPercent) > 0)) {
      alert('Enter a bonus percentage greater than 0 for a deposit bonus offer.');
      return;
    }

    setIsBroadcasting(true);
    try {
      const res = await fetch('/api/promotions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: promoTitle.trim(),
          message: promoMessage.trim(),
          targetGroup: promoTarget,
          dispatchChannel,
          image: promoImage.trim(),
          promoType,
          freeplayAmount: promoType === 'freeplay' ? parseFloat(promoFreeplayAmount) || 0 : 0,
          bonusPercent: promoType === 'deposit_bonus' ? parseFloat(promoBonusPercent) || 0 : 0
        })
      });
      const data = await res.json();
      if (data.success) {
        alert('Promotion successfully broadcasted to target players!');
        setPromoTitle('');
        setPromoMessage('');
        setPromoImage('');
        setPromoTarget('all');
        setDispatchChannel('all');
        setPromoType('message');
        setPromoFreeplayAmount('');
        setPromoBonusPercent('');
        mutatePromos();
      } else {
        alert(data.message || 'Failed to send promotion.');
      }
    } catch (err) {
      console.error(err);
      alert('Error broadcasting promotion.');
    } finally {
      setIsBroadcasting(false);
    }
  };

  const handleDeletePromo = async (id) => {
    if (!window.confirm('Are you sure you want to delete this promotion? It will be removed from player lobbies.')) {
      return;
    }
    try {
      const res = await fetch(`/api/promotions?id=${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        mutatePromos();
      } else {
        alert(data.message || 'Failed to delete promotion.');
      }
    } catch (err) {
      console.error(err);
      alert('Error deleting promotion.');
    }
  };

  return (
    <div className="promotions-tab" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', animation: 'fade-in 0.2s ease-out' }}>
      
      {/* Tab Navigation header */}
      <div className="promotions-subtabs">
        <button
          type="button"
          onClick={() => setActiveSubTab('segments')}
          className={`promotions-subtab${activeSubTab === 'segments' ? ' is-active' : ''}`}
        >
          <i className="fa-solid fa-users-gear" aria-hidden="true"></i>
          <span>Player Databases & Segments</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveSubTab('broadcast')}
          className={`promotions-subtab${activeSubTab === 'broadcast' ? ' is-active' : ''}`}
        >
          <i className="fa-solid fa-bullhorn" aria-hidden="true"></i>
          <span>Send Promotion / Broadcast</span>
        </button>
      </div>

      {/* VIEW A: PLAYER SEGMENTS */}
      {activeSubTab === 'segments' && (
        <section className="admin-section-card" style={{ background: '#0a0d16', border: '1px solid rgba(255,255,255,0.05)' }}>
          <div className="promotions-segments-toolbar">
            <div>
              <h3 style={{ fontSize: '0.95rem', color: '#fff', fontWeight: 'bold' }}>Player Database Segmentation</h3>
              <span className="game-tap-tip">Filter players by subscription status or active deposits.</span>
            </div>
            
            {/* Segment selectors + discreet export icon */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
              <div className="promotions-segment-pills">
                {[
                  { id: 'subscribed', label: 'Subscribed List', icon: 'fa-envelope-open-text' },
                  { id: 'unsubscribed', label: 'Unsubscribed List', icon: 'fa-envelope' },
                  { id: 'active', label: 'Active Playing List', icon: 'fa-circle-dollar-to-slot' }
                ].map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => { setSegment(s.id); setPage(1); }}
                    className={`promotions-segment-pill${segment === s.id ? ' is-active' : ''}`}
                  >
                    <i className={`fa-solid ${s.icon}`} aria-hidden="true"></i>
                    <span>{s.label}</span>
                  </button>
                ))}
              </div>

              {/* Discreet tucked-away Export Icon Button & Dropdown */}
              <div style={{ position: 'relative' }} ref={exportMenuRef}>
                <button
                  type="button"
                  onClick={() => setShowExportMenu((prev) => !prev)}
                  title="Export Options (Subscribed, Unsubscribed, Active, All)"
                  aria-label="Export Data"
                  style={{
                    background: showExportMenu ? 'rgba(212, 175, 55, 0.15)' : '#07090f',
                    border: '1px solid',
                    borderColor: showExportMenu ? 'rgba(212, 175, 55, 0.4)' : 'rgba(255, 255, 255, 0.08)',
                    borderRadius: '8px',
                    color: showExportMenu ? 'var(--gold-primary)' : 'rgba(255, 255, 255, 0.45)',
                    padding: '0.45rem 0.6rem',
                    cursor: isExporting ? 'wait' : 'pointer',
                    fontSize: '0.75rem',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transition: 'all 0.2s ease',
                    boxShadow: showExportMenu ? '0 0 10px rgba(212, 175, 55, 0.2)' : 'none'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.color = 'var(--gold-primary)';
                    e.currentTarget.style.borderColor = 'rgba(212, 175, 55, 0.4)';
                  }}
                  onMouseLeave={(e) => {
                    if (!showExportMenu) {
                      e.currentTarget.style.color = 'rgba(255, 255, 255, 0.45)';
                      e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.08)';
                    }
                  }}
                >
                  {isExporting ? (
                    <i className="fa-solid fa-spinner fa-spin" style={{ color: 'var(--gold-primary)' }}></i>
                  ) : (
                    <i className="fa-solid fa-arrow-down-to-bracket" aria-hidden="true"></i>
                  )}
                </button>

                {showExportMenu && (
                  <div
                    style={{
                      position: 'absolute',
                      top: 'calc(100% + 6px)',
                      right: 0,
                      background: '#0a0d16',
                      border: '1px solid rgba(212, 175, 55, 0.3)',
                      borderRadius: '8px',
                      boxShadow: '0 10px 30px rgba(0,0,0,0.8), 0 0 15px rgba(212, 175, 55, 0.1)',
                      zIndex: 100,
                      minWidth: '230px',
                      padding: '0.4rem 0',
                      display: 'flex',
                      flexDirection: 'column',
                      backdropFilter: 'blur(12px)',
                      animation: 'fade-in 0.15s ease-out'
                    }}
                  >
                    <div
                      style={{
                        padding: '0.4rem 0.85rem',
                        fontSize: '0.65rem',
                        color: 'rgba(255,255,255,0.5)',
                        textTransform: 'uppercase',
                        letterSpacing: '0.6px',
                        borderBottom: '1px solid rgba(255,255,255,0.06)',
                        fontWeight: 'bold',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between'
                      }}
                    >
                      <span>Export List (CSV)</span>
                      <i className="fa-solid fa-file-csv" style={{ color: 'var(--gold-primary)' }}></i>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleExport('subscribed')}
                      disabled={isExporting}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: '#e2e8f0',
                        padding: '0.55rem 0.85rem',
                        fontSize: '0.75rem',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.6rem',
                        cursor: 'pointer',
                        textAlign: 'left',
                        width: '100%',
                        transition: 'background 0.15s'
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.06)')}
                      onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
                    >
                      <i className="fa-solid fa-envelope-open-text" style={{ color: '#22c55e', width: '16px' }}></i>
                      <span>Export Subscribed List</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleExport('unsubscribed')}
                      disabled={isExporting}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: '#e2e8f0',
                        padding: '0.55rem 0.85rem',
                        fontSize: '0.75rem',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.6rem',
                        cursor: 'pointer',
                        textAlign: 'left',
                        width: '100%',
                        transition: 'background 0.15s'
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.06)')}
                      onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
                    >
                      <i className="fa-solid fa-envelope" style={{ color: '#eab308', width: '16px' }}></i>
                      <span>Export Unsubscribed List</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleExport('active')}
                      disabled={isExporting}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: '#e2e8f0',
                        padding: '0.55rem 0.85rem',
                        fontSize: '0.75rem',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.6rem',
                        cursor: 'pointer',
                        textAlign: 'left',
                        width: '100%',
                        transition: 'background 0.15s'
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.06)')}
                      onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
                    >
                      <i className="fa-solid fa-circle-dollar-to-slot" style={{ color: '#38bdf8', width: '16px' }}></i>
                      <span>Export Active Playing List</span>
                    </button>

                    <div style={{ height: '1px', background: 'rgba(255,255,255,0.06)', margin: '0.25rem 0' }}></div>

                    <button
                      type="button"
                      onClick={() => handleExport('all')}
                      disabled={isExporting}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: 'var(--gold-primary)',
                        fontWeight: 'bold',
                        padding: '0.55rem 0.85rem',
                        fontSize: '0.75rem',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.6rem',
                        cursor: 'pointer',
                        textAlign: 'left',
                        width: '100%',
                        transition: 'background 0.15s'
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(212, 175, 55, 0.1)')}
                      onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
                    >
                      <i className="fa-solid fa-users" style={{ width: '16px' }}></i>
                      <span>Export All Players (Total)</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Search bar */}
          <div className="input-wrapper search-wrapper" style={{ background: '#07090f', marginBottom: '1rem' }}>
            <i className="fa-solid fa-magnifying-glass input-icon"></i>
            <input
              type="text"
              placeholder="Search players by name or email..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <div className="table-responsive">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Player Name</th>
                  <th>Email Address</th>
                  <th>Subscriber Status</th>
                  <th>Account Status</th>
                </tr>
              </thead>
              <tbody>
                {!userData && !userError ? (
                  <tr>
                    <td colSpan="5" className="text-center text-muted" style={{ padding: '2rem' }}>
                      <i className="fa-solid fa-spinner fa-spin" style={{ color: 'var(--gold-primary)', marginRight: '6px' }}></i> Loading segment players...
                    </td>
                  </tr>
                ) : usersList.length === 0 ? (
                  <tr>
                    <td colSpan="5" className="text-center text-muted" style={{ padding: '2rem' }}>No players found matching this criteria.</td>
                  </tr>
                ) : (
                  usersList.map((user, idx) => (
                    <tr key={user.email}>
                      <td>{(page - 1) * limit + idx + 1}</td>
                      <td><strong>{user.name}</strong></td>
                      <td>{user.email}</td>
                      <td>
                        <span className={`admin-badge-preview ${user.isSubscribed ? 'b-ready' : 'b-new'}`} style={{ fontSize: '0.65rem' }}>
                          {user.isSubscribed ? 'SUBSCRIBED' : 'UNSUBSCRIBED'}
                        </span>
                      </td>
                      <td>
                        <span className={`admin-badge-preview ${user.status === 'suspended' ? 'b-failed' : 'b-ready'}`} style={{ fontSize: '0.65rem' }}>
                          {user.status || 'active'}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Segment Pagination */}
          {totalPages > 1 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1.25rem' }}>
              <span style={{ fontSize: '0.725rem', color: 'var(--text-muted)' }}>
                Showing page {page} of {totalPages} ({totalUsers} entries)
              </span>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="action-row-btn"
                  style={{ width: 'auto', padding: '0.35rem 0.75rem', fontSize: '0.7rem', opacity: page === 1 ? 0.4 : 1 }}
                >
                  &larr; Prev
                </button>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="action-row-btn"
                  style={{ width: 'auto', padding: '0.35rem 0.75rem', fontSize: '0.7rem', opacity: page === totalPages ? 0.4 : 1 }}
                >
                  Next &rarr;
                </button>
              </div>
            </div>
          )}
        </section>
      )}

      {/* VIEW B: BROADCAST PROMOTION */}
      {activeSubTab === 'broadcast' && (
        <div className="admin-layout-split promotions-broadcast-grid">
          
          {/* Send Promo Form */}
          <section className="admin-section-card promotions-broadcast-form" style={{ background: '#0a0d16', border: '1px solid rgba(255,255,255,0.05)' }}>
            <h3 style={{ fontSize: '0.95rem', color: '#fff', fontWeight: 'bold', marginBottom: '1rem' }}>
              <i className="fa-solid fa-paper-plane gold-text"></i> Broadcast New Promotion Flyer
            </h3>

            <form onSubmit={handleBroadcastSubmit} noValidate className="promotions-broadcast-form-fields">
              <div className="input-group">
                <label htmlFor="promo-title">Promotion Title</label>
                <div className="input-wrapper">
                  <i className="fa-solid fa-heading input-icon"></i>
                  <input
                    type="text"
                    id="promo-title"
                    placeholder="e.g. 400% Weekend Cash Match!"
                    value={promoTitle}
                    onChange={(e) => setPromoTitle(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="input-group">
                <label htmlFor="promo-message">Message / Offer Body</label>
                <div className="input-wrapper" style={{ height: 'auto' }}>
                  <textarea
                    id="promo-message"
                    rows="4"
                    placeholder="Describe the offer rules or coupon details here..."
                    value={promoMessage}
                    onChange={(e) => setPromoMessage(e.target.value)}
                    className="promotions-message-field"
                    required
                  />
                </div>
              </div>

              <div className="input-group">
                <label htmlFor="promo-image-uploader">Upload Promotion Banner Image (Optional)</label>
                <div className="input-wrapper promotions-file-wrapper" style={{ background: '#07090f' }}>
                  <i className="fa-solid fa-file-image input-icon" style={{ color: 'var(--gold-primary)' }}></i>
                  <input
                    type="file"
                    id="promo-image-uploader"
                    accept="image/*"
                    onChange={handlePromoImageUpload}
                    className="promotions-file-input"
                  />
                </div>
                {promoImageError && <span className="error-msg">{promoImageError}</span>}
                {promoImage && (
                  <div className="promotions-image-preview">
                    <div className="promotions-image-thumb">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={promoImage} alt="Promo Preview" />
                    </div>
                    <span style={{ fontSize: '0.7rem', color: '#4ade80', fontWeight: 'bold' }}>Banner flyer selected ✓</span>
                    <button type="button" onClick={() => setPromoImage('')} className="promotions-remove-image">Remove</button>
                  </div>
                )}
              </div>

              <div className="input-group">
                <label htmlFor="promo-type">Offer Type</label>
                <div className="input-wrapper">
                  <i className="fa-solid fa-gift input-icon"></i>
                  <select
                    id="promo-type"
                    value={promoType}
                    onChange={(e) => setPromoType(e.target.value)}
                    className="promotions-select"
                  >
                    <option value="message" style={{ background: '#0a0d16' }}>Message Only (no claim button)</option>
                    <option value="freeplay" style={{ background: '#0a0d16' }}>Freeplay Offer (player picks a game & requests freeplay)</option>
                    <option value="deposit_bonus" style={{ background: '#0a0d16' }}>Deposit Bonus Offer (% applied on next deposit)</option>
                  </select>
                </div>
                <span className="game-tap-tip" style={{ marginTop: '0.35rem', display: 'block' }}>
                  {promoType === 'message' && 'Just an announcement — the popup shows only a "Got it" button.'}
                  {promoType === 'freeplay' && 'Player taps "Claim Freeplay", chooses a game, and it lands in the Coins queue like a normal freeplay.'}
                  {promoType === 'deposit_bonus' && 'Player taps "Claim Bonus"; their next approved deposit gets this bonus % in coins. No freeplay is included.'}
                </span>
              </div>

              {promoType === 'freeplay' && (
                <div className="input-group">
                  <label htmlFor="promo-freeplay">Freeplay Amount ($)</label>
                  <div className="input-wrapper">
                    <i className="fa-solid fa-coins input-icon"></i>
                    <input
                      type="number"
                      id="promo-freeplay"
                      min="0"
                      step="0.5"
                      placeholder="e.g. 5"
                      value={promoFreeplayAmount}
                      onChange={(e) => setPromoFreeplayAmount(e.target.value)}
                    />
                  </div>
                </div>
              )}

              {promoType === 'deposit_bonus' && (
                <div className="input-group">
                  <label htmlFor="promo-bonus">Deposit Bonus Percentage (%)</label>
                  <div className="input-wrapper">
                    <i className="fa-solid fa-percent input-icon"></i>
                    <input
                      type="number"
                      id="promo-bonus"
                      min="0"
                      step="1"
                      placeholder="e.g. 400"
                      value={promoBonusPercent}
                      onChange={(e) => setPromoBonusPercent(e.target.value)}
                    />
                  </div>
                </div>
              )}

              <div className="input-group">
                <label htmlFor="promo-target">Target Player Group Segment</label>
                <div className="input-wrapper">
                  <i className="fa-solid fa-users-viewfinder input-icon"></i>
                  <select
                    id="promo-target"
                    value={promoTarget}
                    onChange={(e) => setPromoTarget(e.target.value)}
                    className="promotions-select"
                  >
                    <option value="all" style={{ background: '#0a0d16' }}>Both Groups (All Registered Players)</option>
                    <option value="subscribed" style={{ background: '#0a0d16' }}>Subscribed Players Only</option>
                    <option value="unsubscribed" style={{ background: '#0a0d16' }}>Unsubscribed Players Only</option>
                    <option value="active" style={{ background: '#0a0d16' }}>Active Playing Players Only (Depositors)</option>
                  </select>
                </div>
              </div>

              <div className="input-group" style={{ marginBottom: '1.5rem' }}>
                <label htmlFor="promo-channel">Dispatch Channel (Delivery Destination)</label>
                <div className="input-wrapper">
                  <i className="fa-solid fa-tower-broadcast input-icon"></i>
                  <select
                    id="promo-channel"
                    value={dispatchChannel}
                    onChange={(e) => setDispatchChannel(e.target.value)}
                    className="promotions-select"
                  >
                    <option value="all" style={{ background: '#0a0d16' }}>ALL Channels (App Notification + Email + Website Promo Banner)</option>
                    <option value="push" style={{ background: '#0a0d16' }}>App Push Notification Only</option>
                    <option value="email" style={{ background: '#0a0d16' }}>Email Broadcast Only</option>
                    <option value="website" style={{ background: '#0a0d16' }}>Website Promo Banner Only (In-App Lobby)</option>
                  </select>
                </div>
                <span className="game-tap-tip" style={{ marginTop: '0.35rem', display: 'block' }}>
                  Choose whether this promo goes out as an App Push, Email, Website Lobby Banner, or ALL 3.
                </span>
              </div>

              <button
                type="submit"
                disabled={isBroadcasting}
                className="submit-btn"
                style={{ background: 'var(--gold-primary)', color: '#000', fontWeight: 'bold', width: '100%' }}
              >
                {isBroadcasting ? 'Broadcasting...' : 'Broadcast Promo Live'}
              </button>
            </form>
          </section>

          {/* Past Broadcasts List */}
          <section className="admin-section-card promotions-past-list" style={{ background: '#0a0d16', border: '1px solid rgba(255,255,255,0.05)' }}>
            <h3 style={{ fontSize: '0.95rem', color: '#fff', fontWeight: 'bold', marginBottom: '1rem' }}>
              <i className="fa-solid fa-clock-rotate-left gold-text"></i> Past Promotional Campaigns
            </h3>

            {pastPromotions.length === 0 ? (
              <div style={{ padding: '2rem', textAlign: 'center', opacity: 0.5, fontSize: '0.8rem' }}>No active promotions sent yet.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {pastPromotions.map((promo) => (
                  <div
                    key={promo.id}
                    className="promotions-past-item"
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem', marginBottom: '0.35rem' }}>
                      <strong style={{ color: '#fff', fontSize: '0.8rem', minWidth: 0, wordBreak: 'break-word' }}>{promo.title}</strong>
                      <button
                        type="button"
                        onClick={() => handleDeletePromo(promo.id)}
                        style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '0.8rem', flexShrink: 0 }}
                        title="Delete Promotion"
                      >
                        <i className="fa-solid fa-trash-can"></i>
                      </button>
                    </div>
                    <p style={{ fontSize: '0.725rem', color: 'var(--text-muted)', margin: '0.25rem 0', whiteSpace: 'normal', lineHeight: '1.4', wordBreak: 'break-word' }}>
                      {promo.message}
                    </p>
                    {promo.promoType && promo.promoType !== 'message' && (
                      <div style={{ marginTop: '0.35rem' }}>
                        <span style={{ fontSize: '0.6rem', fontWeight: 'bold', textTransform: 'uppercase', padding: '0.15rem 0.45rem', borderRadius: '5px', background: 'rgba(168,85,247,0.15)', color: '#c084fc', border: '1px solid rgba(168,85,247,0.4)' }}>
                          {promo.promoType === 'freeplay'
                            ? `Freeplay $${Number(promo.freeplayAmount || 0).toFixed(2)}`
                            : `Deposit Bonus ${Number(promo.bonusPercent || 0)}%`}
                        </span>
                      </div>
                    )}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.5rem', fontSize: '0.65rem', color: 'var(--text-muted)' }}>
                      <span>Target: <strong style={{ color: 'var(--gold-primary)' }}>{promo.targetGroup.toUpperCase()}</strong></span>
                      <span>{formatDeviceDate(promo.timestamp)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

        </div>
      )}

    </div>
  );
}
