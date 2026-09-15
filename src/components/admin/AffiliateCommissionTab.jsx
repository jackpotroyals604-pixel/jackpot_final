import React, { useState, useEffect } from 'react';
import PanelModalBackdrop from '../PanelModalBackdrop';
import usePollingSWR from '../../hooks/usePollingSWR';
import { POLL } from '../../lib/pollingConfig';
import { parseAffiliatePayoutFields } from '../../lib/affiliatePayout';
import { compressImageFile } from '../../lib/imageCompress';
import { formatDeviceDateTime } from '../../lib/formatDateTime';

export default function AffiliateCommissionTab({
  onInspectProof,
  completedActionIds = {},
  adminUser
}) {
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(1);
  const limit = 20;

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

  const swrKey = `/api/transactions?type=AFFILIATE_COMMISSION_WITHDRAW&page=${page}&limit=${limit}&search=${encodeURIComponent(debouncedSearch)}&adminRole=${adminUser?.role || 'admin'}`;
  const { data, error, mutate } = usePollingSWR(swrKey, POLL.QUEUES);

  const rawTransactions = data?.transactions || [];
  const transactions = rawTransactions.filter((t) => !completedActionIds[t.id]);
  const totalPages = data?.totalPages || 1;
  const pendingTransactions = transactions.filter((t) => t.status === 'PENDING');
  const processedTransactions = transactions.filter((t) => t.status !== 'PENDING');

  const handleOpenPayoutModal = (tx) => {
    setSelectedTx(tx);
    setPayoutNote(`Affiliate commission payout processed successfully`);
    setPayoutProof('');
    setPayoutSent(tx.amount || 0);
    setPayoutHold(0);
    setRemainderWaitHours('0');
    setPayoutModalOpen(true);
  };

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

  const handlePayoutSubmit = async (e) => {
    e.preventDefault();
    if (!selectedTx) return;
    const sentVal = Number(payoutSent);
    const holdVal = Number(payoutHold);

    // Only require payout screenshot if money is actually being sent now (> 0).
    // When placing on hold with $0 sent now, screenshot is optional.
    if (sentVal > 0 && !payoutProof) {
      alert('Please upload a payout receipt screenshot before completing.');
      return;
    }

    const txId = selectedTx.id;
    const payload = {
      id: txId,
      status: 'SUCCESS',
      note: payoutNote.trim() || 'Affiliate payout processed',
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

  const handleFailPayout = async (tx) => {
    const feedbackMsg = window.prompt('Enter reason for declining this affiliate cashout request:', 'Insufficient earnings / credentials invalid');
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

  const isLoading = !data && !error;

  return (
    <section className="admin-section-card" style={{ animation: 'fade-in 0.2s ease-out' }}>
      <div className="section-card-header" style={{ marginBottom: '1.25rem' }}>
        <h3><i className="fa-solid fa-hand-holding-dollar gold-text"></i> Affiliate Commission Payouts</h3>
        <p style={{ fontSize: '0.75rem', color: '#888', margin: 0 }}>
          Super Admin only — process affiliate agent commission withdrawal requests separately from distributor payouts.
        </p>
      </div>

      {isLoading ? (
        <div style={{ padding: '2rem', textAlign: 'center', opacity: 0.5 }}>
          <i className="fa-solid fa-spinner fa-spin" style={{ fontSize: '2.5rem', color: 'var(--gold-primary)', marginBottom: '1rem', display: 'block' }}></i>
          <p>Loading affiliate commission queue...</p>
        </div>
      ) : (
        <>
          <div className="input-wrapper search-wrapper" style={{ background: '#0b0d16', width: '100%', marginBottom: '1.25rem' }}>
            <i className="fa-solid fa-magnifying-glass input-icon"></i>
            <input
              type="text"
              placeholder="Search by affiliate email or wallet address..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <div className="section-card-header" style={{ marginBottom: '0.75rem' }}>
            <h4 style={{ fontSize: '0.9rem', color: 'var(--gold-primary)', margin: 0 }}>
              <i className="fa-solid fa-hourglass-half"></i> PENDING REQUESTS ({pendingTransactions.length})
            </h4>
          </div>

          <div className="table-responsive" style={{ marginBottom: '2rem' }}>
            <table className="admin-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Affiliate Email</th>
                  <th>Gateway</th>
                  <th>Address / Tag</th>
                  <th>Amount</th>
                  <th>User QR</th>
                  <th>Submitted</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {pendingTransactions.length === 0 ? (
                  <tr><td colSpan="8" style={{ textAlign: 'center', padding: '2rem', color: '#888' }}>No pending affiliate commission requests.</td></tr>
                ) : pendingTransactions.map((tx, idx) => {
                  const payout = parseAffiliatePayoutFields(tx);
                  return (
                  <tr key={tx.id}>
                    <td>{(page - 1) * limit + idx + 1}</td>
                    <td>
                      <strong>{tx.userEmail}</strong>
                      {payout.holder !== '—' && <div style={{ fontSize: '0.65rem', color: '#888' }}>{payout.holder}</div>}
                    </td>
                    <td><span className="admin-badge-preview b-new">{payout.method}</span></td>
                    <td><code style={{ fontSize: '0.7rem' }}>{payout.account}</code></td>
                    <td><strong style={{ color: 'var(--gold-primary)' }}>${parseFloat(tx.amount).toFixed(2)}</strong></td>
                    <td>
                      {tx.payoutQr ? (
                        <button type="button" onClick={() => onInspectProof(tx.payoutQr, tx.id)} className="submit-btn" style={{ background: '#6366f1', margin: 0, padding: '0.3rem 0.55rem', width: 'auto', fontSize: '0.65rem' }}>
                          View QR
                        </button>
                      ) : <span style={{ color: '#666', fontSize: '0.7rem' }}>—</span>}
                    </td>
                    <td style={{ fontSize: '0.7rem' }}>{formatDeviceDateTime(tx.createdAt, tx.date)}</td>
                    <td>
                      <div style={{ display: 'flex', gap: '0.4rem' }}>
                        <button type="button" onClick={() => handleOpenPayoutModal(tx)} className="submit-btn" style={{ background: '#22c55e', color: '#000', margin: 0, padding: '0.35rem 0.65rem', width: 'auto', fontSize: '0.65rem', fontWeight: 'bold' }}>
                          Send Payout
                        </button>
                        <button type="button" onClick={() => handleFailPayout(tx)} style={{ background: '#ef4444', color: '#fff', border: 'none', borderRadius: '6px', padding: '0.35rem 0.55rem', cursor: 'pointer' }}>
                          <i className="fa-solid fa-xmark"></i>
                        </button>
                      </div>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="section-card-header" style={{ marginBottom: '0.75rem' }}>
            <h4 style={{ fontSize: '0.9rem', color: '#ff4d6d', margin: 0 }}>
              <i className="fa-solid fa-clock-rotate-left"></i> PROCESSED HISTORY ({processedTransactions.length})
            </h4>
          </div>

          <div className="table-responsive">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Affiliate</th>
                  <th>Gateway</th>
                  <th>Address</th>
                  <th>Amount</th>
                  <th>Status</th>
                  <th>Paid / Hold</th>
                  <th>Notes</th>
                  <th>Receipt</th>
                </tr>
              </thead>
              <tbody>
                {processedTransactions.length === 0 ? (
                  <tr><td colSpan="9" style={{ textAlign: 'center', padding: '2rem', color: '#888' }}>No processed affiliate payouts yet.</td></tr>
                ) : processedTransactions.map((tx, idx) => {
                  const payout = parseAffiliatePayoutFields(tx);
                  return (
                  <tr key={tx.id}>
                    <td>{(page - 1) * limit + idx + 1}</td>
                    <td><strong>{tx.userEmail}</strong></td>
                    <td>{payout.method}</td>
                    <td><code style={{ fontSize: '0.65rem' }}>{payout.account}</code></td>
                    <td style={{ color: 'var(--gold-primary)', fontWeight: 'bold' }}>${parseFloat(tx.amount).toFixed(2)}</td>
                    <td><span className={`admin-badge-preview b-${tx.status === 'SUCCESS' ? 'ready' : 'none'}`}>{tx.status}</span></td>
                    <td style={{ fontSize: '0.7rem' }}>
                      {tx.payoutSent !== undefined ? (
                        tx.status === 'SUCCESS' && parseFloat(tx.payoutHold || 0) > 0 ? (
                          <>Paid: ${parseFloat(tx.payoutSent || 0).toFixed(2)}<br />Hold: ${parseFloat(tx.payoutHold || 0).toFixed(2)}</>
                        ) : (
                          <>Paid: ${parseFloat(tx.payoutSent || 0).toFixed(2)}</>
                        )
                      ) : '—'}
                    </td>
                    <td style={{ fontSize: '0.65rem', color: '#aaa' }}>{tx.note || '—'}</td>
                    <td>
                      {tx.payoutProof ? (
                        <button type="button" onClick={() => onInspectProof(null, tx.id)} className="submit-btn" style={{ background: '#3498db', margin: 0, padding: '0.3rem 0.55rem', width: 'auto', fontSize: '0.65rem' }}>
                          View Receipt
                        </button>
                      ) : '—'}
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div style={{ display: 'flex', justifyContent: 'center', gap: '0.75rem', marginTop: '1.5rem' }}>
              <button type="button" disabled={page <= 1} onClick={() => setPage(page - 1)} className="submit-btn" style={{ width: 'auto', padding: '0.4rem 0.85rem', opacity: page <= 1 ? 0.4 : 1 }}>&larr; Prev</button>
              <span style={{ fontSize: '0.75rem', color: '#888', alignSelf: 'center' }}>Page {page} of {totalPages}</span>
              <button type="button" disabled={page >= totalPages} onClick={() => setPage(page + 1)} className="submit-btn" style={{ width: 'auto', padding: '0.4rem 0.85rem', opacity: page >= totalPages ? 0.4 : 1 }}>Next &rarr;</button>
            </div>
          )}
        </>
      )}

      {payoutModalOpen && selectedTx && (() => {
        const payout = parseAffiliatePayoutFields(selectedTx);
        return (
        <PanelModalBackdrop onClick={() => setPayoutModalOpen(false)}>
          <div className="modal-content border-gold" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '480px', width: '92%' }}>
            <div className="modal-header">
              <h3><i className="fa-solid fa-paper-plane gold-text"></i> Process Affiliate Payout</h3>
              <button type="button" className="close-modal" onClick={() => setPayoutModalOpen(false)}>&times;</button>
            </div>
            <div className="modal-body">
              <div style={{ marginBottom: '1rem', fontSize: '0.8rem', color: '#aaa' }}>
                <div>Affiliate: <strong style={{ color: '#fff' }}>{selectedTx.userEmail}</strong></div>
                {payout.holder !== '—' && <div style={{ marginTop: '0.25rem' }}>Account Holder: <strong>{payout.holder}</strong></div>}
                <div style={{ marginTop: '0.25rem' }}>Method: <strong>{payout.method}</strong></div>
                <div style={{ marginTop: '0.25rem' }}>Account Number: <strong>{payout.account}</strong></div>
                <div style={{ marginTop: '0.25rem' }}>Amount: <strong style={{ color: 'var(--gold-primary)' }}>${parseFloat(selectedTx.amount).toFixed(2)}</strong></div>
                {(selectedTx.payoutQr || payout.qr) && (
                  <div style={{ marginTop: '0.75rem', padding: '0.75rem', background: 'rgba(255,255,255,0.03)', borderRadius: '8px', border: '1px solid rgba(255,215,0,0.15)' }}>
                    <div style={{ fontSize: '0.7rem', color: '#aaa', marginBottom: '0.5rem' }}>Affiliate Wallet QR (scan to pay)</div>
                    <img src={selectedTx.payoutQr || payout.qr} alt="Affiliate wallet QR" style={{ width: '120px', height: '120px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.08)' }} />
                  </div>
                )}
              </div>
              <form onSubmit={handlePayoutSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <div className="input-group">
                    <label>Amount Sent ($)</label>
                    <input type="number" step="0.01" value={payoutSent} onChange={(e) => {
                      const val = Math.max(0, Math.min(selectedTx.amount, parseFloat(e.target.value) || 0));
                      setPayoutSent(val);
                      setPayoutHold(Math.round((selectedTx.amount - val) * 100) / 100);
                    }} style={{ width: '100%', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', color: '#fff', padding: '0.5rem', borderRadius: '6px' }} />
                  </div>
                  <div className="input-group">
                    <label>Amount Hold ($)</label>
                    <input type="number" step="0.01" value={payoutHold} onChange={(e) => {
                      const val = Math.max(0, Math.min(selectedTx.amount, parseFloat(e.target.value) || 0));
                      setPayoutHold(val);
                      setPayoutSent(Math.round((selectedTx.amount - val) * 100) / 100);
                    }} style={{ width: '100%', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', color: '#fff', padding: '0.5rem', borderRadius: '6px' }} />
                  </div>
                </div>
                {payoutHold > 0 && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                    <div className="input-group">
                      <label>Claim Wait (Hours)</label>
                      <input type="number" min="0" step="1" value={remainderWaitHours} onChange={(e) => setRemainderWaitHours(e.target.value)} style={{ width: '100%', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', color: '#fff', padding: '0.5rem', borderRadius: '6px' }} />
                    </div>
                    <div className="input-group">
                      <label>Claim Wait (Minutes)</label>
                      <input type="number" min="0" max="59" step="1" value={remainderWaitMinutes} onChange={(e) => setRemainderWaitMinutes(e.target.value)} style={{ width: '100%', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', color: '#fff', padding: '0.5rem', borderRadius: '6px' }} />
                    </div>
                    <p style={{ fontSize: '0.65rem', color: '#888', marginTop: '0.35rem', gridColumn: '1 / -1' }}>Affiliate will see countdown before claim button appears.</p>
                  </div>
                )}
                <div className="input-group">
                  <label>Payout Note</label>
                  <input type="text" value={payoutNote} onChange={(e) => setPayoutNote(e.target.value)} style={{ width: '100%', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', color: '#fff', padding: '0.5rem', borderRadius: '6px' }} />
                </div>
                <div className="input-group">
                  <label>Upload Payout Receipt {Number(payoutSent) > 0 ? '(Paid Proof)' : '(Optional - On Hold)'}</label>
                  <input type="file" accept="image/*" onChange={handlePayoutProofChange} style={{ color: '#888', fontSize: '0.75rem' }} />
                </div>
                <button type="submit" disabled={isProcessing} className="submit-btn" style={{ background: 'var(--gold-primary)', color: '#000', fontWeight: 'bold' }}>
                  {isProcessing ? 'Processing...' : 'CONFIRM PAYOUT & COMPLETE →'}
                </button>
              </form>
            </div>
          </div>
        </PanelModalBackdrop>
        );
      })()}
    </section>
  );
}
