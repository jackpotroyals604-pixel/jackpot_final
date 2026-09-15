import React, { useState, useEffect } from 'react';
import PanelModalBackdrop from '../PanelModalBackdrop';
import usePollingSWR from '../../hooks/usePollingSWR';
import { POLL } from '../../lib/pollingConfig';
import { compressImageFile } from '../../lib/imageCompress';
import { formatDeviceDateTime } from '../../lib/formatDateTime';

export default function WebsitePaymentsTab({
  onInspectProof,
  completedActionIds = {},
  adminUser
}) {
  const [subTab, setSubTab] = useState('received'); // 'received' | 'sent'
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(1);
  const limit = 20;

  // Process Payout Modal State (for Sent Distributor Payouts)
  const [payoutModalOpen, setPayoutModalOpen] = useState(false);
  const [selectedTx, setSelectedTx] = useState(null);
  const [payoutNote, setPayoutNote] = useState('');
  const [payoutProof, setPayoutProof] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [payoutSent, setPayoutSent] = useState(0);
  const [payoutHold, setPayoutHold] = useState(0);
  const [remainderWaitHours, setRemainderWaitHours] = useState('0');
  const [remainderWaitMinutes, setRemainderWaitMinutes] = useState('0');

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 400);
    return () => clearTimeout(handler);
  }, [search]);

  // Handle switching sub-tabs
  const handleSubTabChange = (tab) => {
    setSubTab(tab);
    setSearch('');
    setDebouncedSearch('');
    setPage(1);
  };

  const targetType = subTab === 'received' ? 'WEBSITE_COMMISSION_PAYMENT' : 'COMMISSION_WITHDRAW';
  const swrKey = `/api/transactions?type=${targetType}&page=${page}&limit=${limit}&search=${encodeURIComponent(debouncedSearch)}&adminRole=${adminUser?.role || 'admin'}`;
  const { data, error, mutate } = usePollingSWR(swrKey, POLL.QUEUES);

  const rawTransactions = data?.transactions || [];
  const transactions = rawTransactions.filter((t) => !completedActionIds[t.id]);
  const totalTransactions = data?.totalTransactions || 0;
  const totalPages = data?.totalPages || 1;

  const pendingTransactions = transactions.filter((t) => t.status === 'PENDING');
  const processedTransactions = transactions.filter((t) => t.status !== 'PENDING');

  // Approve a Received Website Commission Payment
  const handleApproveReceived = async (tx) => {
    const confirmApprove = window.confirm(`Confirm receipt of $${parseFloat(tx.amount).toFixed(2)} website commission payout?`);
    if (!confirmApprove) return;

    try {
      const response = await fetch('/api/transactions', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: tx.id,
          status: 'SUCCESS',
          note: 'Confirmed by Admin',
          processedBy: adminUser?.email || 'admin'
        })
      });
      const resData = await response.json();
      if (resData.success) {
        alert('Payment confirmed successfully!');
        mutate();
      } else {
        alert(resData.message || 'Failed to approve payment.');
      }
    } catch (err) {
      console.error(err);
      alert('Error approving payment.');
    }
  };

  // Reject a Received Website Commission Payment
  const handleRejectReceived = async (tx) => {
    const feedbackMsg = window.prompt('Enter reason for rejecting this payment proof:', 'Payment proof invalid or screenshot unclear');
    if (feedbackMsg === null) return; // cancelled

    try {
      const response = await fetch('/api/transactions', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: tx.id,
          status: 'FAILED',
          note: feedbackMsg || 'Rejected by Admin',
          processedBy: adminUser?.email || 'admin'
        })
      });
      const resData = await response.json();
      if (resData.success) {
        alert('Payment rejected.');
        mutate();
      } else {
        alert(resData.message || 'Failed to reject payment.');
      }
    } catch (err) {
      console.error(err);
      alert('Error rejecting payment.');
    }
  };

  // Open Process Modal for Sent Payout
  const handleOpenPayoutModal = (tx) => {
    setSelectedTx(tx);
    setPayoutNote(`Distributor commission payout processed successfully`);
    setPayoutProof('');
    setPayoutSent(tx.amount || 0);
    setPayoutHold(0);
    setRemainderWaitHours('0');
    setPayoutModalOpen(true);
  };

  // Handle uploader change
  const handlePayoutProofChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const compressed = await compressImageFile(file, { maxSize: 1280, quality: 0.72 });
      setPayoutProof(compressed);
    } catch (err) {
      console.error(err);
      alert('Could not load paid proof screenshot. Please try another image.');
    }
  };

  // Submit Payout completion
  const handlePayoutSubmit = async (e) => {
    e.preventDefault();
    if (!selectedTx) return;
    const sentVal = Number(payoutSent);
    const holdVal = Number(payoutHold);

    // Only require payout screenshot if money is actually being sent now (> 0).
    // When placing on hold with $0 sent now, screenshot is optional.
    if (sentVal > 0 && !payoutProof) {
      alert('Please upload a paid proof screenshot before completing.');
      return;
    }

    const txId = selectedTx.id;
    const payload = {
      id: txId,
      status: 'SUCCESS',
      note: payoutNote.trim() || 'Distributor payout processed',
      payoutProof: payoutProof || '',
      payoutSent: sentVal,
      payoutHold: holdVal,
      processedBy: adminUser?.email || 'admin'
    };
    if (holdVal > 0) {
      payload.remainderWaitHours = Math.max(0, Number(remainderWaitHours) || 0);
      payload.remainderWaitMinutes = Math.max(0, Number(remainderWaitMinutes) || 0);
    }

    setIsProcessing(true);
    setPayoutModalOpen(false);
    setSelectedTx(null);
    setPayoutProof('');
    mutate(
      (current) => {
        if (!current?.transactions) return current;
        return {
          ...current,
          transactions: current.transactions.filter((t) => t.id !== txId),
          totalTransactions: Math.max(0, (current.totalTransactions || 1) - 1)
        };
      },
      { revalidate: false }
    );

    try {
      const response = await fetch('/api/transactions', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const resData = await response.json().catch(() => null);
      if (resData?.success) {
        mutate();
      } else {
        alert(resData?.message || 'Failed to process payout.');
        mutate();
      }
    } catch (err) {
      console.error(err);
      alert('Error processing payout.');
      mutate();
    } finally {
      setIsProcessing(false);
    }
  };

  // Fail/Decline distributor payout request
  const handleFailPayout = async (tx) => {
    const feedbackMsg = window.prompt('Enter reason for declining this commission cashout request:', 'Insufficient earnings / credentials invalid');
    if (feedbackMsg === null) return;

    try {
      const response = await fetch('/api/transactions', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: tx.id,
          status: 'FAILED',
          note: feedbackMsg || 'Declined by Admin',
          processedBy: adminUser?.email || 'admin'
        })
      });
      const resData = await response.json();
      if (resData.success) {
        alert('Payout request declined.');
        mutate();
      } else {
        alert(resData.message || 'Failed to decline payout.');
      }
    } catch (err) {
      console.error(err);
      alert('Error declining payout.');
    }
  };

  const handlePrevPage = () => {
    if (page > 1) setPage(page - 1);
  };

  const handleNextPage = () => {
    if (page < totalPages) setPage(page + 1);
  };

  const isLoading = !data && !error;

  return (
    <section className="admin-section-card" style={{ animation: 'fade-in 0.2s ease-out' }}>
      <div className="section-card-header" style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '1.25rem' }}>
        <h3><i className="fa-solid fa-file-invoice-dollar text-red"></i> Website Commission & Payouts</h3>
        <p style={{ fontSize: '0.75rem', color: '#888', margin: 0 }}>
          Manage payments received from distributors, or process outgoing commission payouts to Type A partners.
        </p>
      </div>

      {/* Modern Sub-Tab Toggles */}
      <div style={{ display: 'flex', gap: '0.5rem', background: '#070913', padding: '0.25rem', borderRadius: '10px', width: 'fit-content', border: '1px solid rgba(255,255,255,0.03)', marginBottom: '1.5rem' }}>
        <button
          onClick={() => handleSubTabChange('received')}
          style={{
            border: 'none',
            padding: '0.5rem 1.25rem',
            borderRadius: '8px',
            fontSize: '0.75rem',
            fontWeight: 'bold',
            cursor: 'pointer',
            transition: 'all 0.2s ease',
            background: subTab === 'received' ? 'var(--gold-primary)' : 'transparent',
            color: subTab === 'received' ? '#000' : '#fff'
          }}
        >
          <i className="fa-solid fa-arrow-down-long" style={{ marginRight: '0.35rem' }}></i> Received Platform Payments
        </button>
        <button
          onClick={() => handleSubTabChange('sent')}
          style={{
            border: 'none',
            padding: '0.5rem 1.25rem',
            borderRadius: '8px',
            fontSize: '0.75rem',
            fontWeight: 'bold',
            cursor: 'pointer',
            transition: 'all 0.2s ease',
            background: subTab === 'sent' ? 'var(--gold-primary)' : 'transparent',
            color: subTab === 'sent' ? '#000' : '#fff'
          }}
        >
          <i className="fa-solid fa-arrow-up-long" style={{ marginRight: '0.35rem' }}></i> Send Distributor Payouts
        </button>
      </div>

      {isLoading ? (
        <div style={{ padding: '2rem', textAlign: 'center', opacity: 0.5 }}>
          <i className="fa-solid fa-spinner fa-spin" style={{ fontSize: '2.5rem', color: 'var(--gold-primary)', marginBottom: '1rem', display: 'block' }}></i>
          <p>Loading transactions queue...</p>
        </div>
      ) : (
        <>
          <div className="input-wrapper search-wrapper" style={{ background: '#0b0d16', width: '100%', marginBottom: '1.25rem' }}>
            <i className="fa-solid fa-magnifying-glass input-icon"></i>
            <input
              type="text"
              placeholder={`Search by distributor email or reference code...`}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          {/* PENDING SECTION */}
          <div className="section-card-header" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '1rem', marginBottom: '0.75rem', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '0.5rem' }}>
            <h4 style={{ fontSize: '0.9rem', color: 'var(--gold-primary)', margin: 0, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <i className="fa-solid fa-hourglass-half"></i> PENDING REQUESTS ({pendingTransactions.length} on page)
            </h4>
          </div>

          <div className="table-responsive" style={{ marginBottom: '2.5rem' }}>
            <table className="admin-table">
              {subTab === 'received' ? (
                // TABLE FOR RECEIVED PAYMENTS
                <>
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Distributor Email</th>
                      <th>Gateway</th>
                      <th>Tx Hash / Tag</th>
                      <th>Amount</th>
                      <th>Submitted At</th>
                      <th>Proof Screenshot</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pendingTransactions.length === 0 ? (
                      <tr>
                        <td colSpan="8" className="text-center text-muted" style={{ padding: '2rem' }}>
                          No pending website commission payments.
                        </td>
                      </tr>
                    ) : (
                      pendingTransactions.map((tx, idx) => (
                        <tr key={tx.id}>
                          <td>{(page - 1) * limit + idx + 1}</td>
                          <td><strong>{tx.userEmail}</strong></td>
                          <td><span className="admin-badge-preview b-hot">{tx.gateway}</span></td>
                          <td><code style={{ fontSize: '0.7rem' }}>{tx.code}</code></td>
                          <td><strong style={{ color: '#00ff66' }}>${parseFloat(tx.amount).toFixed(2)}</strong></td>
                          <td style={{ fontSize: '0.7rem' }}>{formatDeviceDateTime(tx.createdAt, tx.date)}</td>
                          <td>
                            {tx.screenshot ? (
                              <button
                                onClick={() => onInspectProof(tx.screenshot, tx.id)}
                                className="submit-btn"
                                style={{ background: '#3498db', margin: 0, padding: '0.35rem 0.65rem', width: 'auto', display: 'inline-flex', gap: '0.3rem', alignItems: 'center' }}
                              >
                                <i className="fa-solid fa-receipt"></i> <span style={{ fontSize: '0.65rem' }}>View Proof</span>
                              </button>
                            ) : (
                              <span style={{ fontSize: '0.7rem', color: '#666' }}>No receipt</span>
                            )}
                          </td>
                          <td>
                            <div className="table-actions" style={{ justifyContent: 'flex-start', gap: '0.5rem' }}>
                              <button
                                onClick={() => handleApproveReceived(tx)}
                                className="action-row-btn btn-edit"
                                style={{ background: '#22c55e', color: '#fff' }}
                                title="Confirm & Approve Payment"
                              >
                                <i className="fa-solid fa-check"></i>
                              </button>
                              <button
                                onClick={() => handleRejectReceived(tx)}
                                className="action-row-btn btn-delete"
                                style={{ background: '#ef4444', color: '#fff' }}
                                title="Reject/Decline Proof"
                              >
                                <i className="fa-solid fa-xmark"></i>
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </>
              ) : (
                // TABLE FOR OUTGOING PAYOUTS
                <>
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Distributor Email</th>
                      <th>Gateway</th>
                      <th>Address / Tag</th>
                      <th>Requested Amount</th>
                      <th>Submitted At</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pendingTransactions.length === 0 ? (
                      <tr>
                        <td colSpan="7" className="text-center text-muted" style={{ padding: '2rem' }}>
                          No pending distributor commission payout requests.
                        </td>
                      </tr>
                    ) : (
                      pendingTransactions.map((tx, idx) => (
                        <tr key={tx.id}>
                          <td>{(page - 1) * limit + idx + 1}</td>
                          <td><strong>{tx.userEmail}</strong></td>
                          <td><span className="admin-badge-preview b-new">{tx.gateway}</span></td>
                          <td><code style={{ fontSize: '0.7rem' }}>{tx.code}</code></td>
                          <td><strong style={{ color: 'var(--gold-primary)' }}>${parseFloat(tx.amount).toFixed(2)}</strong></td>
                          <td style={{ fontSize: '0.7rem' }}>{formatDeviceDateTime(tx.createdAt, tx.date)}</td>
                          <td>
                            <div className="table-actions" style={{ justifyContent: 'flex-start', gap: '0.5rem' }}>
                              <button
                                onClick={() => handleOpenPayoutModal(tx)}
                                className="submit-btn"
                                style={{ background: '#22c55e', color: '#000', margin: 0, padding: '0.35rem 0.65rem', width: 'auto', display: 'inline-flex', gap: '0.3rem', alignItems: 'center' }}
                              >
                                <i className="fa-solid fa-paper-plane"></i> <span style={{ fontSize: '0.65rem', fontWeight: 'bold' }}>Send Payout</span>
                              </button>
                              <button
                                onClick={() => handleFailPayout(tx)}
                                className="action-row-btn btn-delete"
                                style={{ background: '#ef4444', color: '#fff' }}
                                title="Decline Request"
                              >
                                <i className="fa-solid fa-xmark"></i>
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </>
              )}
            </table>
          </div>

          {/* HISTORICAL PROCESSED SECTION */}
          <div className="section-card-header" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '1.5rem', marginBottom: '0.75rem', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '0.5rem' }}>
            <h4 style={{ fontSize: '0.9rem', color: '#ff4d6d', margin: 0, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <i className="fa-solid fa-clock-rotate-left"></i> PROCESSED TRANSACTION HISTORY ({processedTransactions.length} on page)
            </h4>
          </div>

          <div className="table-responsive">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Distributor Email</th>
                  <th>Gateway</th>
                  <th>Address/Tag/Hash</th>
                  <th>Amount</th>
                  <th>Processed At</th>
                  <th>Status</th>
                  <th>Processed By</th>
                  <th>Notes/Reasons</th>
                  <th>Screenshot</th>
                </tr>
              </thead>
              <tbody>
                {processedTransactions.length === 0 ? (
                  <tr>
                    <td colSpan="10" className="text-center text-muted" style={{ padding: '2rem' }}>
                      No transaction history found on this page.
                    </td>
                  </tr>
                ) : (
                  processedTransactions.map((tx, idx) => (
                    <tr key={tx.id}>
                      <td>{(page - 1) * limit + idx + 1}</td>
                      <td>{tx.userEmail}</td>
                      <td>
                        <span className={`admin-badge-preview b-${subTab === 'received' ? 'hot' : 'new'}`}>
                          {tx.gateway}
                        </span>
                      </td>
                      <td><code style={{ fontSize: '0.7rem' }}>{tx.code}</code></td>
                      <td>
                        <strong style={{ color: tx.status.toUpperCase() === 'SUCCESS' ? '#00ff66' : '#ef4444' }}>
                          ${parseFloat(tx.amount).toFixed(2)}
                        </strong>
                      </td>
                      <td style={{ fontSize: '0.7rem' }}>{formatDeviceDateTime(tx.createdAt, tx.date)}</td>
                      <td>
                        <span className={`admin-badge-preview b-${tx.status.toLowerCase() === 'success' ? 'ready' : tx.status.toLowerCase()}`}>
                          {tx.status}
                        </span>
                      </td>
                      <td style={{ fontSize: '0.7rem', color: 'var(--gold-primary)' }}>{tx.approvedBy || '-'}</td>
                      <td>
                        <div style={{ fontSize: '0.7rem', color: '#aaa', maxWidth: '200px', whiteSpace: 'normal' }}>
                          {tx.note || '-'}
                        </div>
                      </td>
                      <td>
                        {/* Display screenshot based on subTab type */}
                        {subTab === 'received' ? (
                          tx.screenshot ? (
                            <button
                              onClick={() => onInspectProof(tx.screenshot, tx.id)}
                              className="submit-btn"
                              style={{ background: '#4b5563', color: '#fff', margin: 0, padding: '0.3rem 0.5rem', width: 'auto' }}
                            >
                              <span style={{ fontSize: '0.65rem' }}>View Proof</span>
                            </button>
                          ) : (
                            <span style={{ fontSize: '0.7rem', color: '#666' }}>No screenshot</span>
                          )
                        ) : (
                          tx.payoutProof ? (
                            <button
                              onClick={() => onInspectProof(null, tx.id)}
                              className="submit-btn"
                              style={{ background: '#3498db', color: '#fff', margin: 0, padding: '0.3rem 0.5rem', width: 'auto' }}
                            >
                              <span style={{ fontSize: '0.65rem' }}>View Receipt</span>
                            </button>
                          ) : (
                            <span style={{ fontSize: '0.7rem', color: '#666' }}>No receipt</span>
                          )
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1.5rem', padding: '0 0.5rem' }}>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                Showing page {page} of {totalPages} ({totalTransactions} entries)
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
        </>
      )}

      {/* PROCESS OUTGOING PAYOUT MODAL */}
      {payoutModalOpen && selectedTx && (
        <PanelModalBackdrop onClick={() => setPayoutModalOpen(false)}>
          <div className="modal-content border-gold" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '440px', width: '90%' }}>
            <div className="modal-header">
              <h3><i className="fa-solid fa-paper-plane gold-text"></i> Process Outgoing Payout</h3>
              <button type="button" className="close-modal" onClick={() => setPayoutModalOpen(false)}>&times;</button>
            </div>
            <div className="modal-body">
              <div style={{ marginBottom: '1.25rem', paddingBottom: '0.75rem', borderBottom: '1px solid rgba(255,255,255,0.05)', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                <div>Distributor: <strong style={{ color: '#fff' }}>{selectedTx.userEmail}</strong></div>
                <div style={{ marginTop: '0.25rem' }}>Payout Method: <strong>{selectedTx.gateway}</strong></div>
                <div style={{ marginTop: '0.25rem' }}>Address/Wallet: <strong>{selectedTx.code}</strong></div>
                <div style={{ marginTop: '0.25rem', fontSize: '0.95rem' }}>Amount: <strong style={{ color: 'var(--gold-primary)' }}>${parseFloat(selectedTx.amount).toFixed(2)}</strong></div>
              </div>

              <form onSubmit={handlePayoutSubmit} noValidate style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <div className="input-group">
                    <label>Amount Sent ($)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={payoutSent}
                      onChange={(e) => {
                        const val = Math.max(0, Math.min(selectedTx.amount, parseFloat(e.target.value) || 0));
                        setPayoutSent(val);
                        setPayoutHold(Math.round((selectedTx.amount - val) * 100) / 100);
                      }}
                      style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', color: '#fff', padding: '0.4rem 0.6rem', borderRadius: '6px', fontSize: '0.75rem', outline: 'none', width: '100%' }}
                    />
                  </div>
                  <div className="input-group">
                    <label>Amount Hold ($)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={payoutHold}
                      onChange={(e) => {
                        const val = Math.max(0, Math.min(selectedTx.amount, parseFloat(e.target.value) || 0));
                        setPayoutHold(val);
                        setPayoutSent(Math.round((selectedTx.amount - val) * 100) / 100);
                      }}
                      style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', color: '#fff', padding: '0.4rem 0.6rem', borderRadius: '6px', fontSize: '0.75rem', outline: 'none', width: '100%' }}
                    />
                  </div>
                </div>

                {payoutHold > 0 && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                    <div className="input-group">
                      <label>Claim Wait (Hours)</label>
                      <input type="number" min="0" step="1" placeholder="e.g. 24" value={remainderWaitHours} onChange={(e) => setRemainderWaitHours(e.target.value)} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', color: '#fff', padding: '0.4rem 0.6rem', borderRadius: '6px', fontSize: '0.75rem', outline: 'none', width: '100%' }} />
                    </div>
                    <div className="input-group">
                      <label>Claim Wait (Minutes)</label>
                      <input type="number" min="0" max="59" step="1" placeholder="e.g. 30" value={remainderWaitMinutes} onChange={(e) => setRemainderWaitMinutes(e.target.value)} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', color: '#fff', padding: '0.4rem 0.6rem', borderRadius: '6px', fontSize: '0.75rem', outline: 'none', width: '100%' }} />
                    </div>
                    <p style={{ fontSize: '0.65rem', color: '#888', marginTop: '0.35rem', gridColumn: '1 / -1' }}>
                      Distributor will see countdown before claim button appears.
                    </p>
                  </div>
                )}

                <div className="input-group">
                  <label htmlFor="payout-note">Payout Note</label>
                  <div className="input-wrapper">
                    <i className="fa-solid fa-note-sticky input-icon"></i>
                    <input
                      type="text"
                      id="payout-note"
                      placeholder="e.g. Paid to Cashapp tag..."
                      value={payoutNote}
                      onChange={(e) => setPayoutNote(e.target.value)}
                      required
                    />
                  </div>
                </div>

                <div className="input-group">
                  <label style={{ display: 'block', fontSize: '0.75rem', marginBottom: '0.25rem' }}>
                    Upload Payout Receipt Screenshot {Number(payoutSent) > 0 ? '(Paid Proof)' : '(Optional - On Hold)'}
                  </label>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handlePayoutProofChange}
                    style={{ color: '#888', fontSize: '0.7rem', display: 'block' }}
                  />
                  {payoutProof && (
                    <div style={{ marginTop: '0.5rem', color: '#2ecc71', fontSize: '0.65rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                      <i className="fa-solid fa-circle-check"></i> Screenshot loaded successfully!
                    </div>
                  )}
                </div>

                <button type="submit" className="submit-btn" style={{ background: 'var(--gold-primary)', color: '#000', fontWeight: 'bold' }} disabled={isProcessing}>
                  {isProcessing ? 'SENDING PAYOUT...' : 'CONFIRM PAYOUT & COMPLETE ➔'}
                </button>
              </form>
            </div>
          </div>
        </PanelModalBackdrop>
      )}
    </section>
  );
}
