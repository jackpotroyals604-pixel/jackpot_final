'use client';

import React, { useState, useEffect } from 'react';
import PanelModalBackdrop from '../PanelModalBackdrop';
import usePollingSWR from '../../hooks/usePollingSWR';
import { POLL } from '../../lib/pollingConfig';
import { compressImageFile } from '../../lib/imageCompress';
import { formatDeviceDateTime } from '../../lib/formatDateTime';

export default function TxSearchTab({ onInspectProof, adminUser }) {
  const [historySearch, setHistorySearch] = useState('');
  const [historyDebouncedSearch, setHistoryDebouncedSearch] = useState('');
  const [historyStatus, setHistoryStatus] = useState(''); // '' (All), 'SUCCESS', 'FAILED', 'HOLD'
  const [historyType, setHistoryType] = useState(''); // '' (All), 'DEPOSIT', 'WITHDRAW', 'BONUS'
  const [historyPage, setHistoryPage] = useState(1);
  const limit = 20;

  // State for completing hold payout from transaction logs
  const [holdModalOpen, setHoldModalOpen] = useState(false);
  const [selectedHoldTx, setSelectedHoldTx] = useState(null);
  const [holdPayoutProof, setHoldPayoutProof] = useState('');
  const [holdNote, setHoldNote] = useState('');
  const [isSubmittingHold, setIsSubmittingHold] = useState(false);

  useEffect(() => {
    const handler = setTimeout(() => {
      setHistoryDebouncedSearch(historySearch);
      setHistoryPage(1);
    }, 400);
    return () => clearTimeout(handler);
  }, [historySearch]);

  const swrKey = `/api/transactions?page=${historyPage}&limit=${limit}&search=${encodeURIComponent(historyDebouncedSearch)}&status=${historyStatus}&type=${historyType}&adminRole=${adminUser?.role || ''}&adminDistributorId=${adminUser?.distributorId || ''}`;

  const { data, error, mutate } = usePollingSWR(swrKey, POLL.LISTS);

  const transactions = data?.transactions || [];
  const totalTransactions = data?.totalTransactions || 0;
  const totalPages = data?.totalPages || 1;
  const searchSummary = data?.searchSummary || null;

  const handleHistoryPrevPage = () => {
    if (historyPage > 1) setHistoryPage(historyPage - 1);
  };

  const handleHistoryNextPage = () => {
    if (historyPage < totalPages) setHistoryPage(historyPage + 1);
  };

  const handleOpenHoldModal = (tx) => {
    setSelectedHoldTx(tx);
    const holdAmount = parseFloat(tx.payoutHold || 0).toFixed(2);
    setHoldNote(`Remaining hold of $${holdAmount} paid directly to ${tx.gateway || 'player'}`);
    setHoldPayoutProof('');
    setHoldModalOpen(true);
  };

  const handleHoldProofChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      alert('Payout receipt must be under 2MB. Please select a smaller photo.');
      e.target.value = '';
      return;
    }
    try {
      const compressed = await compressImageFile(file, { maxSize: 1000, quality: 0.62 });
      setHoldPayoutProof(compressed);
    } catch (err) {
      console.error(err);
      alert('Could not load payout screenshot. Please try another image.');
    }
  };

  const handleConfirmHoldPayout = async (e) => {
    e.preventDefault();
    if (!selectedHoldTx) return;

    if (!holdPayoutProof) {
      if (!window.confirm('No payout receipt screenshot uploaded. Do you still want to complete this cashout hold?')) {
        return;
      }
    }

    setIsSubmittingHold(true);
    const txId = selectedHoldTx.id;
    const holdAmt = parseFloat(selectedHoldTx.payoutHold || 0);
    const currentPaid = parseFloat(selectedHoldTx.payoutSent || 0);
    const totalAmount = parseFloat(selectedHoldTx.amount || 0);
    const newSentTotal = currentPaid + holdAmt > 0 ? (currentPaid + holdAmt) : totalAmount;

    try {
      const response = await fetch('/api/transactions', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: txId,
          status: 'SUCCESS',
          payoutSent: newSentTotal,
          payoutHold: 0,
          note: holdNote.trim() || `Remaining hold payout completed directly`,
          payoutProof: holdPayoutProof || '',
          processedBy: adminUser?.email || 'admin'
        })
      });

      const data = await response.json().catch(() => null);
      if (data?.success) {
        setHoldModalOpen(false);
        setSelectedHoldTx(null);
        setHoldPayoutProof('');
        mutate();
      } else {
        alert(data?.message || 'Failed to complete hold payout.');
      }
    } catch (err) {
      console.error(err);
      alert('Error completing hold payout: ' + (err?.message || 'Network error'));
    } finally {
      setIsSubmittingHold(false);
    }
  };

  return (
    <section className="admin-section-card" style={{ animation: 'fade-in 0.2s ease-out' }}>
      <div className="section-card-header" style={{ marginBottom: '1rem' }}>
        <h3><i className="fa-solid fa-clock-rotate-left gold-text"></i> Transaction Logs Search</h3>
        <p style={{ fontSize: '0.725rem', color: 'var(--text-muted)' }}>
          Review full ledger transaction history, query player emails, usernames, and audit or complete hold payouts.
        </p>
      </div>

      {/* Search & Filters */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1.25rem', padding: '1rem', background: '#0b0d16', borderRadius: '8px' }}>
        <div className="input-wrapper search-wrapper" style={{ flex: 1, minWidth: '240px', background: '#07090f', margin: 0 }}>
          <i className="fa-solid fa-magnifying-glass input-icon"></i>
          <input
            type="text"
            placeholder="Search by player email, gateway or username..."
            value={historySearch}
            onChange={(e) => setHistorySearch(e.target.value)}
          />
        </div>
        
        <div style={{ display: 'flex', gap: '0.5rem', width: 'auto' }}>
          <select
            value={historyStatus}
            onChange={(e) => { setHistoryStatus(e.target.value); setHistoryPage(1); }}
            style={{
              background: '#07090f',
              color: '#fff',
              border: '1px solid rgba(255,255,255,0.05)',
              padding: '0.5rem',
              borderRadius: '6px',
              fontSize: '0.725rem',
              cursor: 'pointer'
            }}
          >
            <option value="">All Statuses</option>
            <option value="SUCCESS">SUCCESS</option>
            <option value="HOLD">ON HOLD</option>
            <option value="PENDING">PENDING</option>
            <option value="PENDING_COINS">VERIFYING COINS</option>
            <option value="FAILED">FAILED</option>
          </select>

          <select
            value={historyType}
            onChange={(e) => { setHistoryType(e.target.value); setHistoryPage(1); }}
            style={{
              background: '#07090f',
              color: '#fff',
              border: '1px solid rgba(255,255,255,0.05)',
              padding: '0.5rem',
              borderRadius: '6px',
              fontSize: '0.725rem',
              cursor: 'pointer'
            }}
          >
            <option value="">All Types</option>
            <option value="DEPOSIT">DEPOSIT</option>
            <option value="WITHDRAW">WITHDRAW</option>
            <option value="BONUS">BONUS / ADJUSTMENT</option>
          </select>
        </div>
      </div>

      {/* Search Summary Analytics Banner */}
      {searchSummary && (
        <div
          style={{
            background: 'linear-gradient(135deg, rgba(250, 204, 21, 0.08) 0%, rgba(15, 23, 42, 0.95) 100%)',
            border: '1px solid rgba(250, 204, 21, 0.35)',
            borderRadius: '10px',
            padding: '1rem 1.25rem',
            marginBottom: '1.25rem',
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '1rem',
            boxShadow: '0 4px 20px rgba(0,0,0,0.35)'
          }}
        >
          <div>
            <div style={{ fontSize: '0.7rem', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 'bold' }}>
              <i className={`fa-solid ${searchSummary.isUsernameSearch ? 'fa-gamepad' : 'fa-envelope'}`} style={{ color: 'var(--gold-primary)', marginRight: '6px' }}></i>
              {searchSummary.isUsernameSearch ? 'Specific Game Account Audit' : 'Player Overall Account Audit'}
            </div>
            <div style={{ fontSize: '1.05rem', fontWeight: '800', color: '#fff', display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.2rem', flexWrap: 'wrap' }}>
              <span style={{ color: '#facc15' }}>{searchSummary.query}</span>
              {searchSummary.matchedGame && (
                <span style={{ fontSize: '0.725rem', background: 'rgba(56, 189, 248, 0.15)', border: '1px solid rgba(56, 189, 248, 0.35)', padding: '0.15rem 0.55rem', borderRadius: '4px', color: '#38bdf8', fontWeight: 'bold' }}>
                  {searchSummary.matchedGame}
                </span>
              )}
              {searchSummary.userEmail && searchSummary.isUsernameSearch && (
                <span style={{ fontSize: '0.725rem', color: '#94a3b8' }}>
                  ({searchSummary.userEmail})
                </span>
              )}
            </div>
          </div>

          <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ background: 'rgba(34, 197, 94, 0.08)', border: '1px solid rgba(34, 197, 94, 0.25)', padding: '0.4rem 0.8rem', borderRadius: '8px' }}>
              <div style={{ fontSize: '0.65rem', color: '#94a3b8', textTransform: 'uppercase', fontWeight: 'bold' }}>Total Deposits</div>
              <div style={{ fontSize: '1rem', fontWeight: '900', color: '#22c55e', marginTop: '0.1rem' }}>
                ${(searchSummary.totalDeposits || 0).toFixed(2)}
              </div>
            </div>

            <div style={{ background: 'rgba(239, 68, 68, 0.08)', border: '1px solid rgba(239, 68, 68, 0.25)', padding: '0.4rem 0.8rem', borderRadius: '8px' }}>
              <div style={{ fontSize: '0.65rem', color: '#94a3b8', textTransform: 'uppercase', fontWeight: 'bold' }}>Total Redeems / Cashouts</div>
              <div style={{ fontSize: '1rem', fontWeight: '900', color: '#ef4444', marginTop: '0.1rem' }}>
                ${(searchSummary.totalRedeems || 0).toFixed(2)}
              </div>
            </div>

            <div style={{ background: 'rgba(250, 204, 21, 0.08)', border: '1px solid rgba(250, 204, 21, 0.25)', padding: '0.4rem 0.8rem', borderRadius: '8px' }}>
              <div style={{ fontSize: '0.65rem', color: '#94a3b8', textTransform: 'uppercase', fontWeight: 'bold' }}>Net Balance (P&L)</div>
              <div style={{ fontSize: '1rem', fontWeight: '900', color: (searchSummary.netProfit || 0) >= 0 ? '#facc15' : '#ef4444', marginTop: '0.1rem' }}>
                {(searchSummary.netProfit || 0) >= 0 ? '+' : ''}${(searchSummary.netProfit || 0).toFixed(2)}
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="table-responsive">
        <table className="admin-table">
          <thead>
            <tr>
              <th>#</th>
              <th>User Email</th>
              <th>Game Title</th>
              <th>Tx Type</th>
              <th>Amount</th>
              <th>Gateway Details / Notes</th>
              <th>Timestamp</th>
              <th>Status</th>
              <th>Proof / Screenshot</th>
              <th>Fulfillment</th>
            </tr>
          </thead>
          <tbody>
            {transactions.length === 0 ? (
              <tr>
                <td colSpan="10" className="text-center text-muted" style={{ padding: '2rem' }}>
                  No matching transaction logs found.
                </td>
              </tr>
            ) : (
              transactions.map((tx, idx) => {
                const hasHold = parseFloat(tx.payoutHold || 0) > 0;
                return (
                  <tr key={tx.id} style={{ background: hasHold ? 'rgba(245, 158, 11, 0.04)' : undefined }}>
                    <td>{(historyPage - 1) * limit + idx + 1}</td>
                    <td>
                      <div>{tx.userEmail}</div>
                      {tx.gameUsername && (
                        <div style={{ fontSize: '0.7rem', color: 'var(--gold-primary)', marginTop: '0.15rem' }}>
                          <i className="fa-solid fa-gamepad" style={{ marginRight: '3px' }}></i> {tx.gameUsername}
                        </div>
                      )}
                    </td>
                    <td><strong>{tx.gameTitle || 'Lobby'}</strong></td>
                    <td>
                      <span className={`admin-badge-preview b-${tx.isFreeplayWithdraw ? 'vip' : (tx.type === 'DEPOSIT' ? 'hot' : tx.type === 'WITHDRAW' ? 'new' : 'ready')}`}>
                        {tx.isFreeplayWithdraw ? 'FREEPLAY' : tx.type}
                      </span>
                    </td>
                    <td><strong>${parseFloat(tx.amount).toFixed(2)}</strong></td>
                    <td>
                      <span style={{ fontSize: '0.725rem', opacity: 0.9 }}>
                        {tx.gateway || '—'} {tx.code ? `(${tx.code})` : ''}
                      </span>
                      {(tx.nameOnTag || tx.phoneOnTag) && (
                        <div style={{ marginTop: '0.25rem', padding: '0.25rem 0.5rem', background: 'rgba(255,255,255,0.03)', borderRadius: '6px', fontSize: '0.65rem', display: 'flex', flexDirection: 'column', gap: '0.1rem', border: '1px solid rgba(255,255,255,0.03)' }}>
                          {tx.nameOnTag && <span style={{ color: '#ffd700' }}>Name: {tx.nameOnTag}</span>}
                          {tx.phoneOnTag && <span style={{ color: '#38bdf8' }}>Phone: {tx.phoneOnTag}</span>}
                        </div>
                      )}
                      {tx.note && <p style={{ fontSize: '0.675rem', color: '#ffb703', margin: '0.2rem 0 0 0' }}>{tx.note}</p>}
                      
                      {/* Action Logger details */}
                      {tx.approvedBy && (
                        <div style={{ fontSize: '0.65rem', marginTop: '0.25rem', color: 'rgba(255,255,255,0.5)', display: 'flex', alignItems: 'center', gap: '3px' }}>
                          <i className="fa-solid fa-user-shield text-blue" style={{ fontSize: '0.65rem' }}></i>
                          <span>Approved By:</span>
                          <span style={{ color: 'var(--gold-primary)', fontWeight: 'bold' }}>{tx.approvedBy}</span>
                        </div>
                      )}
                      {tx.allottedBy && (
                        <div style={{ fontSize: '0.65rem', marginTop: '0.15rem', color: 'rgba(255,255,255,0.5)', display: 'flex', alignItems: 'center', gap: '3px' }}>
                          <i className="fa-solid fa-circle-dollar-to-slot text-green" style={{ fontSize: '0.65rem' }}></i>
                          <span>Coins Allotted By:</span>
                          <span style={{ color: 'var(--gold-primary)', fontWeight: 'bold' }}>{tx.allottedBy}</span>
                        </div>
                      )}
                      {tx.payoutSent !== undefined && (
                        <div style={{ fontSize: '0.675rem', marginTop: '0.25rem', color: '#10b981', fontWeight: 'bold' }}>
                          <i className="fa-solid fa-circle-check"></i> Paid: ${parseFloat(tx.payoutSent).toFixed(2)}
                          {tx.status === 'SUCCESS' && tx.payoutHold > 0 && (
                            <span style={{ color: '#f59e0b' }}> • Hold: ${parseFloat(tx.payoutHold).toFixed(2)}</span>
                          )}
                        </div>
                      )}
                    </td>
                    <td style={{ fontSize: '0.7rem' }}>{formatDeviceDateTime(tx.createdAt, tx.date)}</td>
                    <td>
                      {hasHold ? (
                        <div>
                          <span className="admin-badge-preview b-hot" style={{ background: 'rgba(245,158,11,0.2)', border: '1px solid #f59e0b', color: '#f59e0b' }}>
                            ON HOLD
                          </span>
                          <div style={{ fontSize: '0.65rem', color: '#f59e0b', fontWeight: 'bold', marginTop: '0.2rem' }}>
                            Hold: ${parseFloat(tx.payoutHold).toFixed(2)}
                          </div>
                        </div>
                      ) : (
                        <span className={`admin-badge-preview b-${(tx.status === 'PENDING_COINS' || tx.status === 'COINS_LOADING') ? 'new' : (tx.status.toLowerCase() === 'success' ? 'ready' : (tx.status.toLowerCase() === 'cancelled' || tx.status.toLowerCase() === 'timed_out' || tx.status.toLowerCase() === 'failed' || tx.status.toLowerCase() === 'rejected') ? 'failed' : tx.status.toLowerCase())}`}>
                          {tx.status === 'PENDING_COINS' ? 'VERIFYING COINS' : (tx.status === 'COINS_LOADING' ? 'COINS LOADING' : tx.status === 'TIMED_OUT' ? 'TIMED OUT' : tx.status)}
                        </span>
                      )}
                    </td>
                    <td>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', alignItems: 'flex-start' }}>
                        {tx.screenshot ? (
                          <button
                            onClick={() => onInspectProof(tx.screenshot, tx.id, tx.type === 'WITHDRAW' ? 'screenshot' : null)}
                            className="submit-btn"
                            style={{ background: tx.type === 'WITHDRAW' ? '#eab308' : '#3498db', color: tx.type === 'WITHDRAW' ? '#000' : '#fff', margin: 0, padding: '0.35rem 0.65rem', width: 'auto', display: 'inline-flex', gap: '0.3rem', alignItems: 'center' }}
                          >
                            <i className={`fa-solid ${tx.type === 'WITHDRAW' ? 'fa-gamepad' : 'fa-receipt'}`}></i>{' '}
                            <span style={{ fontSize: '0.65rem' }}>{tx.type === 'WITHDRAW' ? 'Game Balance' : 'View Proof'}</span>
                          </button>
                        ) : null}
                        {tx.type === 'WITHDRAW' && tx.tagQrScreenshot ? (
                          <button
                            onClick={() => onInspectProof(tx.tagQrScreenshot, tx.id, 'tagQrScreenshot')}
                            className="submit-btn"
                            style={{ background: '#a855f7', color: '#fff', margin: 0, padding: '0.35rem 0.65rem', width: 'auto', display: 'inline-flex', gap: '0.3rem', alignItems: 'center' }}
                          >
                            <i className="fa-solid fa-qrcode"></i> <span style={{ fontSize: '0.65rem' }}>Tag QR</span>
                          </button>
                        ) : null}
                        {tx.type === 'WITHDRAW' && tx.payoutProof ? (
                          <button
                            onClick={() => onInspectProof(tx.payoutProof, tx.id, 'payoutProof')}
                            className="submit-btn"
                            style={{ background: '#10b981', color: '#fff', margin: 0, padding: '0.35rem 0.65rem', width: 'auto', display: 'inline-flex', gap: '0.3rem', alignItems: 'center' }}
                          >
                            <i className="fa-solid fa-money-check-dollar"></i> <span style={{ fontSize: '0.65rem' }}>Paid Receipt</span>
                          </button>
                        ) : null}
                        {!tx.screenshot && !(tx.type === 'WITHDRAW' && tx.tagQrScreenshot) && !(tx.type === 'WITHDRAW' && tx.payoutProof) && (
                          <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>—</span>
                        )}
                      </div>
                    </td>
                    <td>
                      {hasHold ? (
                        <button
                          type="button"
                          onClick={() => handleOpenHoldModal(tx)}
                          className="submit-btn"
                          style={{
                            background: 'linear-gradient(135deg, #00ff66 0%, #00a844 100%)',
                            color: '#000',
                            margin: 0,
                            padding: '0.35rem 0.65rem',
                            width: 'auto',
                            display: 'inline-flex',
                            gap: '0.3rem',
                            alignItems: 'center',
                            fontWeight: '900',
                            borderRadius: '8px',
                            boxShadow: '0 2px 10px rgba(0, 255, 102, 0.25)',
                            cursor: 'pointer'
                          }}
                          title="Pay remaining hold amount and mark DONE"
                        >
                          <i className="fa-solid fa-circle-check"></i>
                          <span style={{ fontSize: '0.68rem' }}>DONE CASHOUT</span>
                        </button>
                      ) : tx.type === 'WITHDRAW' && tx.status === 'SUCCESS' ? (
                        <span style={{ fontSize: '0.7rem', color: '#10b981', fontWeight: 'bold' }}>
                          <i className="fa-solid fa-check-double" style={{ marginRight: '3px' }}></i> Fulfilled
                        </span>
                      ) : (
                        <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>—</span>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* History Pagination Controls */}
      {totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1.5rem', padding: '0 0.5rem' }}>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            Showing page {historyPage} of {totalPages} ({totalTransactions} entries)
          </span>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button
              onClick={handleHistoryPrevPage}
              disabled={historyPage === 1}
              className="action-row-btn"
              style={{ width: 'auto', padding: '0.4rem 0.8rem', fontSize: '0.7rem', opacity: historyPage === 1 ? 0.4 : 1, cursor: historyPage === 1 ? 'not-allowed' : 'pointer' }}
            >
              &larr; Prev
            </button>
            <button
              onClick={handleHistoryNextPage}
              disabled={historyPage === totalPages}
              className="action-row-btn"
              style={{ width: 'auto', padding: '0.4rem 0.8rem', fontSize: '0.7rem', opacity: historyPage === totalPages ? 0.4 : 1, cursor: historyPage === totalPages ? 'not-allowed' : 'pointer' }}
            >
              Next &rarr;
            </button>
          </div>
        </div>
      )}

      {/* =========================================================================
          COMPLETE CASHOUT HOLD PAYOUT MODAL
          ========================================================================= */}
      {holdModalOpen && selectedHoldTx && (
        <PanelModalBackdrop onClick={() => setHoldModalOpen(false)}>
          <div
            className="modal-content border-green"
            onClick={(e) => e.stopPropagation()}
            style={{
              maxWidth: '440px',
              width: '92%',
              background: 'linear-gradient(180deg, #111625 0%, #0a0d17 100%)',
              border: '1.5px solid rgba(0, 255, 102, 0.4)',
              borderRadius: '20px',
              padding: '1.5rem 1.25rem',
              boxShadow: '0 20px 60px rgba(0,0,0,0.9), 0 0 30px rgba(0, 255, 102, 0.2)',
              position: 'relative',
              margin: 'auto'
            }}
          >
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '0.75rem' }}>
              <h3 style={{ margin: 0, fontSize: '1rem', color: '#fff', display: 'flex', alignItems: 'center', gap: '0.45rem', fontWeight: '900', textTransform: 'uppercase' }}>
                <i className="fa-solid fa-circle-check" style={{ color: '#00ff66' }}></i>
                Complete Cashout Hold
              </h3>
              <button
                type="button"
                className="close-modal"
                onClick={() => setHoldModalOpen(false)}
                style={{ background: 'none', border: 'none', color: '#fff', fontSize: '1.25rem', cursor: 'pointer' }}
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleConfirmHoldPayout} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {/* Summary Details Box */}
              <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '12px', padding: '0.85rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.4rem' }}>
                  <span style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.6)' }}>User Email:</span>
                  <strong style={{ fontSize: '0.75rem', color: '#fff' }}>{selectedHoldTx.userEmail}</strong>
                </div>
                {selectedHoldTx.gameUsername && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.4rem' }}>
                    <span style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.6)' }}>Game Account:</span>
                    <strong style={{ fontSize: '0.75rem', color: 'var(--gold-primary)' }}>{selectedHoldTx.gameUsername} ({selectedHoldTx.gameTitle || 'Lobby'})</strong>
                  </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.4rem' }}>
                  <span style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.6)' }}>Gateway / Tag:</span>
                  <strong style={{ fontSize: '0.75rem', color: '#38bdf8' }}>{selectedHoldTx.gateway || '—'} {selectedHoldTx.code ? `(${selectedHoldTx.code})` : ''}</strong>
                </div>

                {/* Numbers breakdown */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1.2fr', gap: '0.4rem', marginTop: '0.65rem', paddingTop: '0.65rem', borderTop: '1px solid rgba(255,255,255,0.06)', textAlign: 'center' }}>
                  <div style={{ background: 'rgba(0,0,0,0.3)', padding: '0.4rem', borderRadius: '6px' }}>
                    <span style={{ display: 'block', fontSize: '0.58rem', color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase' }}>Total Amount</span>
                    <strong style={{ fontSize: '0.82rem', color: '#fff' }}>${parseFloat(selectedHoldTx.amount || 0).toFixed(2)}</strong>
                  </div>
                  <div style={{ background: 'rgba(0,0,0,0.3)', padding: '0.4rem', borderRadius: '6px' }}>
                    <span style={{ display: 'block', fontSize: '0.58rem', color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase' }}>Already Paid</span>
                    <strong style={{ fontSize: '0.82rem', color: '#10b981' }}>${parseFloat(selectedHoldTx.payoutSent || 0).toFixed(2)}</strong>
                  </div>
                  <div style={{ background: 'rgba(0, 255, 102, 0.1)', border: '1px solid rgba(0, 255, 102, 0.3)', padding: '0.4rem', borderRadius: '6px' }}>
                    <span style={{ display: 'block', fontSize: '0.58rem', color: '#4ade80', fontWeight: 'bold', textTransform: 'uppercase' }}>Paying Hold</span>
                    <strong style={{ fontSize: '0.95rem', color: '#00ff66' }}>${parseFloat(selectedHoldTx.payoutHold || 0).toFixed(2)}</strong>
                  </div>
                </div>
              </div>

              {/* Payout Screenshot Uploader */}
              <div>
                <label style={{ display: 'block', fontSize: '0.72rem', color: 'rgba(255,255,255,0.8)', fontWeight: '700', marginBottom: '0.35rem' }}>
                  <i className="fa-solid fa-receipt" style={{ color: '#00ff66', marginRight: '4px' }}></i>
                  Upload Paid Receipt / Screenshot (Proof)
                </label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleHoldProofChange}
                    style={{
                      width: '100%',
                      background: '#07090f',
                      border: '1px solid rgba(255,255,255,0.12)',
                      padding: '0.5rem',
                      borderRadius: '8px',
                      color: '#fff',
                      fontSize: '0.72rem'
                    }}
                  />
                  {holdPayoutProof && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', background: 'rgba(0,0,0,0.4)', padding: '0.5rem', borderRadius: '8px', border: '1px solid rgba(0,255,102,0.3)' }}>
                      <img
                        src={holdPayoutProof}
                        alt="Receipt Preview"
                        style={{ width: '48px', height: '48px', objectFit: 'cover', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.2)' }}
                      />
                      <div style={{ flex: 1 }}>
                        <span style={{ fontSize: '0.7rem', color: '#4ade80', fontWeight: 'bold', display: 'block' }}>✓ Receipt Attached</span>
                        <span style={{ fontSize: '0.62rem', color: 'rgba(255,255,255,0.5)' }}>Compressed & ready to upload</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setHoldPayoutProof('')}
                        className="action-row-btn"
                        style={{ width: 'auto', padding: '0.25rem 0.5rem', fontSize: '0.65rem', background: 'rgba(239,68,68,0.2)', color: '#f87171', border: '1px solid rgba(239,68,68,0.4)' }}
                      >
                        Remove
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Note input */}
              <div>
                <label style={{ display: 'block', fontSize: '0.72rem', color: 'rgba(255,255,255,0.8)', fontWeight: '700', marginBottom: '0.35rem' }}>
                  Payout Note (Optional)
                </label>
                <input
                  type="text"
                  value={holdNote}
                  onChange={(e) => setHoldNote(e.target.value)}
                  placeholder="e.g. Sent via Cash App to $cashtag"
                  style={{
                    width: '100%',
                    background: '#07090f',
                    border: '1px solid rgba(255,255,255,0.12)',
                    padding: '0.55rem 0.75rem',
                    borderRadius: '8px',
                    color: '#fff',
                    fontSize: '0.75rem'
                  }}
                />
              </div>

              {/* Action Buttons */}
              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                <button
                  type="button"
                  onClick={() => setHoldModalOpen(false)}
                  className="action-row-btn"
                  style={{ flex: 1, padding: '0.75rem', fontSize: '0.75rem', background: 'rgba(255,255,255,0.06)', color: '#fff' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingHold}
                  className="submit-btn"
                  style={{
                    flex: 2,
                    background: 'linear-gradient(135deg, #00ff66 0%, #00a844 100%)',
                    color: '#000',
                    fontWeight: '900',
                    fontSize: '0.8rem',
                    padding: '0.75rem 1rem',
                    borderRadius: '10px',
                    margin: 0,
                    boxShadow: '0 4px 15px rgba(0, 255, 102, 0.3)',
                    cursor: isSubmittingHold ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '0.4rem',
                    opacity: isSubmittingHold ? 0.7 : 1
                  }}
                >
                  {isSubmittingHold ? (
                    <>
                      <i className="fa-solid fa-spinner fa-spin"></i>
                      <span>PROCESSING...</span>
                    </>
                  ) : (
                    <>
                      <i className="fa-solid fa-circle-check"></i>
                      <span>CONFIRM & DONE CASHOUT</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </PanelModalBackdrop>
      )}
    </section>
  );
}
