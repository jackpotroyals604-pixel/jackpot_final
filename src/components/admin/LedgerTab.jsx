import React, { useState, useEffect } from 'react';
import PanelModalBackdrop from '../PanelModalBackdrop';
import usePollingSWR from '../../hooks/usePollingSWR';
import { POLL } from '../../lib/pollingConfig';
import { parseRoles } from '../../lib/staffGameAccess';
import GatewayRevenueBreakdown from './GatewayRevenueBreakdown';
import { compressImageFile } from '../../lib/imageCompress';
import { formatDeviceDateTime } from '../../lib/formatDateTime';

export default function LedgerTab({
  onInspectProof,
  onApproveTransaction,
  onFailTransaction,
  completedActionIds = {},
  processingIds,
  wrapAction,
  adminUser
}) {
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(1);
  const limit = 20;

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 400);
    return () => clearTimeout(handler);
  }, [search]);

  // Finance ledger: only PENDING. Withdrawals stay PENDING_COINS for coins staff
  // first; after coins approve they become PENDING and then appear here.
  const swrKey = `/api/transactions?status=PENDING&page=${page}&limit=${limit}&search=${encodeURIComponent(debouncedSearch)}&adminRole=${adminUser?.role || ''}&adminDistributorId=${adminUser?.distributorId || ''}`;

  // SWR automatically polls every 4s for ledger transactions
  const { data, error, mutate } = usePollingSWR(swrKey, POLL.QUEUES, { keepPreviousData: false });

  const roles = parseRoles(adminUser?.role);
  const showGatewayBreakdown = roles.includes('admin') || roles.includes('operation_admin');

  const rawTransactions = data?.transactions || [];
  const transactions = rawTransactions.filter((t) => !completedActionIds[t.id]);
  const totalTransactions = data?.totalTransactions || 0;
  const totalPages = data?.totalPages || 1;

  const depositsLedger = transactions.filter((t) => t.type === 'DEPOSIT');
  const withdrawalsLedger = transactions.filter((t) => t.type === 'WITHDRAW');

  // Double-click prevention for approve actions
  const [approvingIds, setApprovingIds] = useState({});

  const handleApprove = async (txId) => {
    if (approvingIds[txId]) return; // Prevent double-click
    setApprovingIds(prev => ({ ...prev, [txId]: true }));
    try {
      await onApproveTransaction(txId);
      mutate();
    } finally {
      setApprovingIds(prev => { const n = { ...prev }; delete n[txId]; return n; });
    }
  };

  // Processing Withdrawal Payout State
  const [payoutModalOpen, setPayoutModalOpen] = useState(false);
  const [selectedPayoutTx, setSelectedPayoutTx] = useState(null);
  const [payoutType, setPayoutType] = useState('full'); // 'full' | 'partial'
  const [payoutSentAmount, setPayoutSentAmount] = useState('');
  const [payoutHoldAmount, setPayoutHoldAmount] = useState('');
  const [payoutGateway, setPayoutGateway] = useState('');
  const [payoutCustomNote, setPayoutCustomNote] = useState('');
  const [payoutProof, setPayoutProof] = useState('');
  const [remainderWaitHours, setRemainderWaitHours] = useState('0');
  const [remainderWaitMinutes, setRemainderWaitMinutes] = useState('0');
  const [isProcessingPayout, setIsProcessingPayout] = useState(false);

  const handleOpenPayoutModal = (tx) => {
    setSelectedPayoutTx(tx);
    setPayoutType('full');
    const targetAmount = tx.payoutAmount !== undefined ? tx.payoutAmount : tx.amount;
    setPayoutSentAmount(targetAmount.toString());
    setPayoutHoldAmount('0');
    setPayoutGateway(tx.gateway || 'Chime');
    setPayoutCustomNote(`Full payout processed to ${tx.gateway || 'Chime'}`);
    setPayoutProof('');
    setRemainderWaitHours('0');
    setPayoutModalOpen(true);
  };

  const handleSentAmountChange = (val) => {
    setPayoutSentAmount(val);
    if (!selectedPayoutTx) return;
    const total = parseFloat(selectedPayoutTx.amount || 0);
    const sent = parseFloat(val || 0);
    const hold = Math.max(0, total - sent);
    setPayoutHoldAmount(hold.toString());

    if (payoutType === 'partial') {
      setPayoutCustomNote(`$${sent} sent to your ${payoutGateway} & $${hold} is on hold`);
    }
  };

  const handleHoldAmountChange = (val) => {
    setPayoutHoldAmount(val);
    if (!selectedPayoutTx) return;
    const total = parseFloat(selectedPayoutTx.amount || 0);
    const hold = parseFloat(val || 0);
    const sent = Math.max(0, total - hold);
    setPayoutSentAmount(sent.toString());

    if (payoutType === 'partial') {
      setPayoutCustomNote(`$${sent} sent to your ${payoutGateway} & $${hold} is on hold`);
    }
  };

  const handlePayoutTypeChange = (type) => {
    setPayoutType(type);
    if (!selectedPayoutTx) return;
    if (type === 'full') {
      setPayoutSentAmount(selectedPayoutTx.amount.toString());
      setPayoutHoldAmount('0');
      setPayoutCustomNote(`Full payout processed to ${selectedPayoutTx.gateway || 'Chime'}`);
    } else {
      const half = (parseFloat(selectedPayoutTx.amount || 0) / 2).toString();
      setPayoutSentAmount(half);
      const hold = parseFloat(selectedPayoutTx.amount || 0) - parseFloat(half);
      setPayoutHoldAmount(hold.toString());
      setPayoutCustomNote(`$${half} sent to your ${selectedPayoutTx.gateway || 'Chime'} & $${hold} is on hold`);
    }
  };

  const handleProcessPayoutSubmit = async (e) => {
    e.preventDefault();
    if (!selectedPayoutTx) return;
    const sentVal = parseFloat(payoutSentAmount || 0);
    const holdVal = parseFloat(payoutHoldAmount || 0);

    // Only require payout screenshot if money is actually being sent now (> 0).
    // When placing on hold with $0 sent now, screenshot is optional.
    if (sentVal > 0 && !payoutProof) {
      alert('Please upload a payout receipt screenshot before confirming.');
      return;
    }

    const txId = selectedPayoutTx.id;
    const payload = {
      id: txId,
      status: 'SUCCESS',
      note: payoutCustomNote.trim() || `Payout processed to ${payoutGateway}`,
      payoutSent: sentVal,
      payoutHold: holdVal,
      processedBy: adminUser?.email || 'admin',
      payoutProof: payoutProof || ''
    };
    if (holdVal > 0) {
      payload.remainderWaitHours = Math.max(0, Number(remainderWaitHours) || 0);
      payload.remainderWaitMinutes = Math.max(0, Number(remainderWaitMinutes) || 0);
    }

    setIsProcessingPayout(true);
    // Optimistic: close modal + hide row immediately so UI never sits on "PROCESSING..."
    setPayoutModalOpen(false);
    setSelectedPayoutTx(null);
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
      const data = await response.json().catch(() => null);
      if (data?.success) {
        mutate();
      } else {
        const hint =
          response.status === 413 || response.status === 502 || response.status === 504
            ? ' Receipt photo may be too large — try a smaller/clearer screenshot.'
            : '';
        alert((data?.message || `Failed to process payout (${response.status}).`) + hint);
        mutate(); // restore list from server
      }
    } catch (err) {
      console.error(err);
      // Usually: oversized payoutProof base64, proxy timeout, or offline
      alert(
        'Error processing payout. Network/timeout — use a smaller receipt screenshot and try again.' +
          (err?.message ? `\n(${err.message})` : '')
      );
      mutate();
    } finally {
      setIsProcessingPayout(false);
    }
  };

  const handlePayoutProofChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      alert('Payout receipt must be under 2MB. Take a clearer, smaller photo.');
      e.target.value = '';
      return;
    }
    try {
      // Smaller proof = Hostinger/Business proxies won't drop the PUT
      const compressed = await compressImageFile(file, { maxSize: 1000, quality: 0.62 });
      setPayoutProof(compressed);
    } catch (err) {
      console.error(err);
      alert('Could not load payout screenshot. Please try another image.');
    }
  };

  const handleFail = async (txId) => {
    await onFailTransaction(txId);
    mutate();
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
      {/* Header */}
      <div className="section-card-header" style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '1.25rem' }}>
        <h3><i className="fa-solid fa-wallet text-red"></i> Financial Transaction Ledger</h3>
      </div>

      {/* Gateway breakdown — super admin & operation manager only */}
      {showGatewayBreakdown && (
        <GatewayRevenueBreakdown
          compact
          adminDistributorId={adminUser?.distributorId || ''}
        />
      )}

      {/* Tab Switcher */}
      {isLoading ? (
        <div style={{ padding: '2rem', textAlign: 'center', opacity: 0.5 }}>
          <i className="fa-solid fa-spinner fa-spin" style={{ fontSize: '2.5rem', color: 'var(--gold-primary)', marginBottom: '1rem', display: 'block' }}></i>
          <p>Loading transaction logs...</p>
        </div>
      ) : (
        <>
          {/* PENDING VIEW: Search Input */}
          <div className="input-wrapper search-wrapper" style={{ background: '#0b0d16', width: '100%', marginBottom: '1.25rem' }}>
            <i className="fa-solid fa-magnifying-glass input-icon"></i>
            <input
              type="text"
              placeholder="Search pending ledger by email or gateway..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          {/* DEPOSITS SECTION */}
          <div className="section-card-header" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '1rem', marginBottom: '0.75rem', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '0.5rem' }}>
            <h4 style={{ fontSize: '0.9rem', color: 'var(--gold-primary)', margin: 0, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <i className="fa-solid fa-circle-arrow-down"></i> DEPOSIT REQUESTS ({depositsLedger.length} on page)
            </h4>
          </div>

          <div className="table-responsive" style={{ marginBottom: '2.5rem' }}>
            <table className="admin-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>User Email</th>
                  <th>Game Title</th>
                  <th>Tx Type</th>
                  <th>Amount</th>
                  <th>Gateway Details</th>
                  <th>Timestamp</th>
                  <th>Status</th>
                  <th>Payment Screenshot</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {depositsLedger.length === 0 ? (
                  <tr>
                    <td colSpan="10" className="text-center text-muted" style={{ padding: '2rem' }}>
                      No pending deposit transactions found on this page.
                    </td>
                  </tr>
                ) : (
                  depositsLedger.map((tx, idx) => (
                    <tr key={tx.id}>
                      <td>{(page - 1) * limit + idx + 1}</td>
                      <td>
                        <div>{tx.userEmail}</div>
                        {tx.gameUsername && (
                          <div style={{ fontSize: '0.7rem', color: 'var(--gold-primary)', marginTop: '0.15rem' }}>
                            <i className="fa-solid fa-gamepad" style={{ marginRight: '3px' }}></i> {tx.gameUsername}
                          </div>
                        )}
                      </td>
                      <td><strong>{tx.gameTitle}</strong></td>
                      <td>
                        <span className="admin-badge-preview b-hot">
                          {tx.type}
                        </span>
                      </td>
                      <td><strong>${parseFloat(tx.amount).toFixed(2)}</strong></td>
                      <td>
                        <span style={{ fontSize: '0.725rem', opacity: 0.9 }}>
                          {tx.gateway} ({tx.code})
                        </span>
                        {(tx.nameOnTag || tx.phoneOnTag) && (
                          <div style={{ marginTop: '0.25rem', padding: '0.25rem 0.5rem', background: 'rgba(255,255,255,0.03)', borderRadius: '6px', fontSize: '0.65rem', display: 'flex', flexDirection: 'column', gap: '0.1rem', border: '1px solid rgba(255,255,255,0.03)' }}>
                            {tx.nameOnTag && <span style={{ color: '#ffd700' }}>Name: {tx.nameOnTag}</span>}
                            {tx.phoneOnTag && <span style={{ color: '#38bdf8' }}>Phone: {tx.phoneOnTag}</span>}
                          </div>
                        )}
                        {tx.note && <p style={{ fontSize: '0.65rem', color: '#ff8787', margin: '0.2rem 0 0 0' }}>{tx.note}</p>}
                      </td>
                      <td style={{ fontSize: '0.7rem' }}>{formatDeviceDateTime(tx.createdAt, tx.date)}</td>
                      <td>
                        <span className={`admin-badge-preview b-${(tx.status === 'PENDING_COINS' || tx.status === 'COINS_LOADING') ? 'new' : (tx.status.toLowerCase() === 'success' ? 'ready' : tx.status.toLowerCase())}`}>
                          {tx.status === 'PENDING_COINS' ? 'VERIFYING COINS' : (tx.status === 'COINS_LOADING' ? 'COINS LOADING' : tx.status)}
                        </span>
                      </td>
                      <td>
                        {tx.screenshot ? (
                          <button
                            onClick={() => onInspectProof(tx.screenshot, tx.id, 'screenshot')}
                            className="submit-btn"
                            style={{ background: '#3498db', margin: 0, padding: '0.35rem 0.65rem', width: 'auto', display: 'inline-flex', gap: '0.3rem', alignItems: 'center' }}
                          >
                            <i className="fa-solid fa-receipt"></i> <span style={{ fontSize: '0.65rem' }}>View Proof</span>
                          </button>
                        ) : tx.proofPending ? (
                          (() => {
                            const createdMs = tx.createdAt
                              ? Date.parse(tx.createdAt)
                              : (Number(String(tx.id).replace(/\D/g, '').slice(0, 13)) || 0);
                            const ageSec = createdMs ? (Date.now() - createdMs) / 1000 : 0;
                            const stale = ageSec > 45;
                            return (
                              <span style={{ fontSize: '0.7rem', color: stale ? '#f87171' : 'var(--gold-main)' }}>
                                {stale ? 'Proof delayed — refresh or reject' : 'Proof uploading…'}
                              </span>
                            );
                          })()
                        ) : (
                          <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>No Screenshot</span>
                        )}
                      </td>
                      <td>
                        {tx.status === 'PENDING' ? (
                          <div className="table-actions" style={{ justifyContent: 'flex-start', gap: '0.5rem' }}>
                            <button
                              disabled={processingIds[tx.id]}
                              onClick={wrapAction(tx.id, () => handleApprove(tx.id))}
                              className="action-row-btn btn-edit"
                              style={{ background: '#22c55e', color: '#fff', opacity: processingIds[tx.id] ? 0.5 : 1 }}
                              title="Approve Payment"
                            >
                              {processingIds[tx.id] ? <i className="fa-solid fa-spinner fa-spin"></i> : <i className="fa-solid fa-check"></i>}
                            </button>
                            <button
                              disabled={processingIds[tx.id]}
                              onClick={wrapAction(tx.id, () => handleFail(tx.id))}
                              className="action-row-btn btn-delete"
                              style={{ background: '#ef4444', color: '#fff', opacity: processingIds[tx.id] ? 0.5 : 1 }}
                              title="Fail/Reject Payment"
                            >
                              {processingIds[tx.id] ? <i className="fa-solid fa-spinner fa-spin"></i> : <i className="fa-solid fa-xmark"></i>}
                            </button>
                          </div>
                        ) : (
                          <span style={{ fontSize: '0.75rem', opacity: 0.6 }}>Processed</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* WITHDRAWALS SECTION */}
          <div className="section-card-header" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '1.5rem', marginBottom: '0.75rem', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '0.5rem' }}>
            <h4 style={{ fontSize: '0.9rem', color: '#ff4d6d', margin: 0, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <i className="fa-solid fa-circle-arrow-up"></i> WITHDRAWAL REQUESTS ({withdrawalsLedger.length} on page)
            </h4>
          </div>

          <div className="table-responsive">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>User Email</th>
                  <th>Game Title</th>
                  <th>Tx Type</th>
                  <th>Amount</th>
                  <th>Gateway Details</th>
                  <th>Timestamp</th>
                  <th>Status</th>
                  <th>Proofs</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {withdrawalsLedger.length === 0 ? (
                  <tr>
                    <td colSpan="10" className="text-center text-muted" style={{ padding: '2rem' }}>
                      No pending withdrawal transactions found on this page.
                    </td>
                  </tr>
                ) : (
                  withdrawalsLedger.map((tx, idx) => (
                    <tr key={tx.id}>
                      <td>{(page - 1) * limit + idx + 1}</td>
                      <td>
                        <div>{tx.userEmail}</div>
                        {tx.gameUsername && (
                          <div style={{ fontSize: '0.7rem', color: 'var(--gold-primary)', marginTop: '0.15rem' }}>
                            <i className="fa-solid fa-gamepad" style={{ marginRight: '3px' }}></i> {tx.gameUsername}
                          </div>
                        )}
                      </td>
                      <td><strong>{tx.gameTitle}</strong></td>
                      <td>
                        <span className={`admin-badge-preview ${tx.isFreeplayWithdraw ? 'b-vip' : 'b-new'}`}>
                          {tx.isFreeplayWithdraw ? 'FREEPLAY' : tx.type}
                        </span>
                      </td>
                      <td>
                        <strong>${parseFloat(tx.amount).toFixed(2)}</strong>
                        {tx.payoutAmount !== undefined && (
                          <div style={{ fontSize: '0.65rem', color: '#ff4d6d', marginTop: '0.15rem', background: 'rgba(255, 77, 109, 0.1)', border: '1px solid rgba(255, 77, 109, 0.25)', padding: '0.15rem 0.35rem', borderRadius: '4px', fontWeight: 'bold' }}>
                            ⚠️ PAYOUT CAP: ${parseFloat(tx.payoutAmount).toFixed(2)}
                          </div>
                        )}
                      </td>
                      <td>
                        <span style={{ fontSize: '0.725rem', opacity: 0.9 }}>
                          {tx.gateway} ({tx.code})
                        </span>
                        {(tx.nameOnTag || tx.phoneOnTag) && (
                          <div style={{ marginTop: '0.25rem', padding: '0.25rem 0.5rem', background: 'rgba(255,255,255,0.03)', borderRadius: '6px', fontSize: '0.65rem', display: 'flex', flexDirection: 'column', gap: '0.1rem', border: '1px solid rgba(255,255,255,0.03)' }}>
                            {tx.nameOnTag && <span style={{ color: '#ffd700' }}>Name: {tx.nameOnTag}</span>}
                            {tx.phoneOnTag && <span style={{ color: '#38bdf8' }}>Phone: {tx.phoneOnTag}</span>}
                          </div>
                        )}
                        {tx.note && <p style={{ fontSize: '0.65rem', color: '#ff8787', margin: '0.2rem 0 0 0' }}>{tx.note}</p>}
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
                      </td>
                      <td style={{ fontSize: '0.7rem' }}>{formatDeviceDateTime(tx.createdAt, tx.date)}</td>
                      <td>
                        <span className={`admin-badge-preview b-${(tx.status === 'PENDING_COINS' || tx.status === 'COINS_LOADING') ? 'new' : (tx.status.toLowerCase() === 'success' ? 'ready' : tx.status.toLowerCase())}`}>
                          {tx.status === 'PENDING_COINS' ? 'VERIFYING COINS' : (tx.status === 'COINS_LOADING' ? 'COINS LOADING' : tx.status)}
                        </span>
                      </td>
                      <td>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', alignItems: 'flex-start' }}>
                          {tx.screenshot ? (
                            <button
                              onClick={() => onInspectProof(tx.screenshot, tx.id, 'screenshot')}
                              className="submit-btn"
                              style={{ background: '#eab308', color: '#000', margin: 0, padding: '0.35rem 0.65rem', width: 'auto', display: 'inline-flex', gap: '0.3rem', alignItems: 'center' }}
                            >
                              <i className="fa-solid fa-gamepad"></i> <span style={{ fontSize: '0.65rem', fontWeight: 'bold' }}>View Game Balance</span>
                            </button>
                          ) : (
                            <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>No Game Screenshot</span>
                          )}
                          {tx.tagQrScreenshot ? (
                            <button
                              onClick={() => onInspectProof(tx.tagQrScreenshot, tx.id, 'tagQrScreenshot')}
                              className="submit-btn"
                              style={{ background: '#a855f7', color: '#fff', margin: 0, padding: '0.35rem 0.65rem', width: 'auto', display: 'inline-flex', gap: '0.3rem', alignItems: 'center' }}
                            >
                              <i className="fa-solid fa-qrcode"></i> <span style={{ fontSize: '0.65rem', fontWeight: 'bold' }}>View Tag QR</span>
                            </button>
                          ) : (
                            <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>No Tag QR</span>
                          )}
                        </div>
                      </td>
                      <td>
                        {tx.status === 'PENDING' ? (
                          <div className="table-actions" style={{ justifyContent: 'flex-start', gap: '0.5rem' }}>
                            <button
                              disabled={processingIds[tx.id]}
                              onClick={() => {
                                if (tx.type === 'WITHDRAW') {
                                  handleOpenPayoutModal(tx);
                                } else {
                                  wrapAction(tx.id, () => handleApprove(tx.id))();
                                }
                              }}
                              className="action-row-btn btn-edit"
                              style={{ background: '#22c55e', color: '#fff', opacity: processingIds[tx.id] ? 0.5 : 1 }}
                              title="Approve Payment"
                            >
                              {processingIds[tx.id] ? <i className="fa-solid fa-spinner fa-spin"></i> : <i className="fa-solid fa-check"></i>}
                            </button>
                            <button
                              disabled={processingIds[tx.id]}
                              onClick={wrapAction(tx.id, () => handleFail(tx.id))}
                              className="action-row-btn btn-delete"
                              style={{ background: '#ef4444', color: '#fff', opacity: processingIds[tx.id] ? 0.5 : 1 }}
                              title="Fail/Reject Payment"
                            >
                              {processingIds[tx.id] ? <i className="fa-solid fa-spinner fa-spin"></i> : <i className="fa-solid fa-xmark"></i>}
                            </button>
                          </div>
                        ) : tx.status === 'PENDING_COINS' ? (
                          <span style={{ fontSize: '0.7rem', color: '#ffb703', fontWeight: 'bold' }}>Waiting on Coins Manager</span>
                        ) : (
                          <span style={{ fontSize: '0.75rem', opacity: 0.6 }}>Processed</span>
                        )}
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
      {/* PROCESSING WITHDRAWAL PAYOUT MODAL */}
      {payoutModalOpen && selectedPayoutTx && (
        <PanelModalBackdrop onClick={() => setPayoutModalOpen(false)}>
          <div className="modal-content border-gold" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '460px', width: '90%' }}>
            <div className="modal-header">
              <h3>
                <i className="fa-solid fa-money-bill-transfer gold-text"></i> Process Payout
              </h3>
              <button type="button" className="close-modal" onClick={() => setPayoutModalOpen(false)}>
                &times;
              </button>
            </div>
            <div className="modal-body">
              <div style={{ marginBottom: '1.25rem', paddingBottom: '0.75rem', borderBottom: '1px solid rgba(255,255,255,0.05)', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                <div>Player: <strong style={{ color: '#fff' }}>{selectedPayoutTx.userEmail}</strong></div>
                <div style={{ marginTop: '0.25rem' }}>Platform: <strong>{selectedPayoutTx.gateway}</strong> • Tag: <strong>{selectedPayoutTx.code}</strong></div>
                {selectedPayoutTx.nameOnTag && (
                  <div style={{ marginTop: '0.25rem' }}>Name on Tag: <strong style={{ color: '#ffd700' }}>{selectedPayoutTx.nameOnTag}</strong></div>
                )}
                {selectedPayoutTx.phoneOnTag && (
                  <div style={{ marginTop: '0.25rem' }}>Phone / Linked #: <strong style={{ color: '#38bdf8' }}>{selectedPayoutTx.phoneOnTag}</strong></div>
                )}
                <div style={{ marginTop: '0.25rem', fontSize: '0.95rem' }}>Total Requested: <strong style={{ color: 'var(--gold-primary)' }}>${parseFloat(selectedPayoutTx.amount).toFixed(2)}</strong></div>
                {selectedPayoutTx.tagQrScreenshot && (
                  <div style={{ marginTop: '0.5rem' }}>
                    <button
                      type="button"
                      onClick={() => onInspectProof(selectedPayoutTx.tagQrScreenshot, selectedPayoutTx.id, 'tagQrScreenshot')}
                      className="submit-btn"
                      style={{ background: '#a855f7', color: '#fff', margin: 0, padding: '0.35rem 0.65rem', width: 'auto', display: 'inline-flex', gap: '0.3rem', alignItems: 'center', fontSize: '0.75rem', fontWeight: 'bold' }}
                    >
                      <i className="fa-solid fa-qrcode"></i> View Tag QR Screenshot
                    </button>
                  </div>
                )}
              </div>

              <form onSubmit={handleProcessPayoutSubmit} noValidate>
                
                {/* Payout Options */}
                <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.25rem' }}>
                  <label style={{
                    flex: 1,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    padding: '0.6rem',
                    background: payoutType === 'full' ? 'rgba(255, 215, 0, 0.1)' : '#0c0e17',
                    border: payoutType === 'full' ? '1px solid var(--gold-primary)' : '1px solid rgba(255,255,255,0.05)',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    fontSize: '0.75rem',
                    fontWeight: 'bold',
                    color: payoutType === 'full' ? 'var(--gold-primary)' : '#fff'
                  }}>
                    <input
                      type="radio"
                      name="payoutType"
                      checked={payoutType === 'full'}
                      onChange={() => handlePayoutTypeChange('full')}
                      style={{ marginBottom: '0.25rem' }}
                    />
                    Full Payout
                  </label>

                  <label style={{
                    flex: 1,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    padding: '0.6rem',
                    background: payoutType === 'partial' ? 'rgba(255, 215, 0, 0.1)' : '#0c0e17',
                    border: payoutType === 'partial' ? '1px solid var(--gold-primary)' : '1px solid rgba(255,255,255,0.05)',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    fontSize: '0.75rem',
                    fontWeight: 'bold',
                    color: payoutType === 'partial' ? 'var(--gold-primary)' : '#fff'
                  }}>
                    <input
                      type="radio"
                      name="payoutType"
                      checked={payoutType === 'partial'}
                      onChange={() => handlePayoutTypeChange('partial')}
                      style={{ marginBottom: '0.25rem' }}
                    />
                    Partial Payout
                  </label>
                </div>

                {/* Sent Amount input */}
                <div className="input-group">
                  <label htmlFor="sent-amount">Amount Sent Now ($)</label>
                  <div className="input-wrapper">
                    <i className="fa-solid fa-circle-dollar-to-slot input-icon"></i>
                    <input
                      type="number"
                      id="sent-amount"
                      placeholder="e.g. 50"
                      value={payoutSentAmount}
                      onChange={(e) => handleSentAmountChange(e.target.value)}
                      disabled={payoutType === 'full'}
                      required
                    />
                  </div>
                </div>

                {/* Remaining Hold Amount */}
                <div className="input-group">
                  <label htmlFor="hold-amount">Amount Put On Hold ($)</label>
                  <div className="input-wrapper" style={payoutType === 'full' ? { opacity: 0.6 } : {}}>
                    <i className="fa-solid fa-lock input-icon"></i>
                    <input
                      type="number"
                      id="hold-amount"
                      placeholder="e.g. 30"
                      value={payoutHoldAmount}
                      onChange={(e) => handleHoldAmountChange(e.target.value)}
                      disabled={payoutType === 'full'}
                      required
                    />
                  </div>
                </div>

                {payoutType === 'partial' && parseFloat(payoutHoldAmount || 0) > 0 && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                    <div className="input-group">
                      <label htmlFor="remainder-wait-hours">Claim Wait (Hours)</label>
                      <div className="input-wrapper">
                        <i className="fa-solid fa-clock input-icon"></i>
                        <input
                          type="number"
                          id="remainder-wait-hours"
                          min="0"
                          step="1"
                          placeholder="e.g. 24"
                          value={remainderWaitHours}
                          onChange={(e) => setRemainderWaitHours(e.target.value)}
                        />
                      </div>
                    </div>
                    <div className="input-group">
                      <label htmlFor="remainder-wait-minutes">Claim Wait (Minutes)</label>
                      <div className="input-wrapper">
                        <i className="fa-solid fa-hourglass-half input-icon"></i>
                        <input
                          type="number"
                          id="remainder-wait-minutes"
                          min="0"
                          max="59"
                          step="1"
                          placeholder="e.g. 30"
                          value={remainderWaitMinutes}
                          onChange={(e) => setRemainderWaitMinutes(e.target.value)}
                        />
                      </div>
                    </div>
                    <p style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginTop: '0.35rem', gridColumn: '1 / -1' }}>
                      Player will see a countdown timer. Claim button appears only after this wait period ends.
                    </p>
                  </div>
                )}

                {/* Auto Payout Custom Note description */}
                <div className="input-group" style={{ marginBottom: '1rem' }}>
                  <label htmlFor="payout-note">Payout Note (Shown to Player)</label>
                  <div className="input-wrapper">
                    <i className="fa-solid fa-note-sticky input-icon"></i>
                    <input
                      type="text"
                      id="payout-note"
                      placeholder="Custom payout description..."
                      value={payoutCustomNote}
                      onChange={(e) => setPayoutCustomNote(e.target.value)}
                      required
                    />
                  </div>
                </div>

                {/* Payout receipt proof uploader */}
                <div className="input-group" style={{ marginBottom: '1.5rem' }}>
                  <label style={{ display: 'block', fontSize: '0.75rem', marginBottom: '0.25rem' }}>
                    Upload Payout Receipt Screenshot {parseFloat(payoutSentAmount || 0) > 0 ? '(Paid Proof)' : '(Optional - On Hold)'}
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

                <button type="submit" className="submit-btn" style={{ background: 'var(--gold-primary)', color: '#000', fontWeight: 'bold' }} disabled={isProcessingPayout}>
                  {isProcessingPayout ? 'PROCESSING PAYOUT...' : 'CONFIRM PAYOUT ➔'}
                </button>
              </form>
            </div>
          </div>
        </PanelModalBackdrop>
      )}
    </section>
  );
}
