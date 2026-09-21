import React from 'react';
import PanelModalBackdrop from '../PanelModalBackdrop';
import useSWR from 'swr';
import usePollingSWR from '../../hooks/usePollingSWR';
import { POLL } from '../../lib/pollingConfig';
import { filterGamesForStaff, parseRoles } from '../../lib/staffGameAccess';
import GatewayRevenueBreakdown from './GatewayRevenueBreakdown';
import { notifyStaffActivity } from '../../lib/desktopNotify';
import { formatDeviceTime } from '../../lib/formatDateTime';

const fetcher = (...args) => fetch(...args).then((res) => res.json());

export default function OverviewTab({ adminUser, onUpdateGameCoinsPool }) {
  const [shiftName, setShiftName] = React.useState('Morning Shift (5 AM - 1 PM)');
  const [notes, setNotes] = React.useState('');
  const [isSubmittingReport, setIsSubmittingReport] = React.useState(false);
  const unrespondedAlertRef = React.useRef(false);

  const handleShiftReportSubmit = async (e) => {
    e.preventDefault();
    
    setIsSubmittingReport(true);
    try {
      const response = await fetch('/api/admin/shift-reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          staffEmail: adminUser.email,
          shiftName,
          totalLoaded: 0,
          notes
        })
      });
      const data = await response.json();
      if (data.success) {
        setNotes('');
        alert('End of shift report submitted successfully!');
      } else {
        alert(data.message || 'Failed to submit report.');
      }
    } catch (err) {
      console.error(err);
      alert('Error submitting report.');
    } finally {
      setIsSubmittingReport(false);
    }
  };

  // Use SWR to poll stats every 4s and games list
  const { data: statsData, error: statsError } = usePollingSWR(
    `/api/admin/stats?adminRole=${adminUser?.role || ''}&adminDistributorId=${adminUser?.distributorId || ''}&adminEmail=${encodeURIComponent(adminUser?.email || '')}`,
    POLL.STATS
  );
  const { data: gamesData, error: gamesError, mutate: mutateGames } = useSWR('/api/games', fetcher, { revalidateOnFocus: false, dedupingInterval: 60000 });
  const { data: activityData } = usePollingSWR(
    `/api/admin/activity?adminRole=${adminUser?.role || ''}&adminDistributorId=${adminUser?.distributorId || ''}`,
    POLL.LISTS
  );

  // When pending work sits 5+ minutes, also ping lock-screen/desktop if staff tab is away.
  React.useEffect(() => {
    const alertOn =
      Boolean(activityData?.hasUnrespondedRequest) &&
      Number(activityData?.activeStaffCount || 0) > 0;
    if (alertOn && !unrespondedAlertRef.current) {
      unrespondedAlertRef.current = true;
      try {
        notifyStaffActivity({
          title: 'Requests waiting 5+ minutes',
          body: `${activityData?.pendingCount || 0} pending task(s) need a response.`,
          url: '/admin/requests'
        });
      } catch {
        /* ignore */
      }
    }
    if (!alertOn) unrespondedAlertRef.current = false;
  }, [activityData?.hasUnrespondedRequest, activityData?.activeStaffCount, activityData?.pendingCount]);

  const stats = statsData?.stats || {
    todayDeposits: 0,
    todayWithdrawals: 0,
    yesterdayDeposits: 0,
    yesterdayWithdrawals: 0
  };

  const games = filterGamesForStaff(gamesData?.games || [], adminUser);
  const roles = parseRoles(adminUser?.role);
  const isFinancialAdmin = roles.includes('financial_admin');
  const isCoinsAdmin = roles.includes('coins_admin');
  const isFullAdminView = roles.includes('admin') || roles.includes('operation_admin');
  const isPureFinancialAdminOnly = isFinancialAdmin && !isFullAdminView && !isCoinsAdmin && !roles.includes('support_admin');

  const [updateModalOpen, setUpdateModalOpen] = React.useState(false);
  const [selectedGame, setSelectedGame] = React.useState(null);
  const [updateCoins, setUpdateCoins] = React.useState('');
  const [updateLink, setUpdateLink] = React.useState('');
  const [isUpdatingPool, setIsUpdatingPool] = React.useState(false);
  const [resetUsedCoins, setResetUsedCoins] = React.useState(false);

  const getNepalDateString = (offsetDays = 0) => {
    // Nepal Standard Time is UTC+5:45 (345 minutes), reset cycle at 5:00 AM
    const NEPAL_OFFSET_MS = (5 * 60 + 45) * 60 * 1000;
    const RESET_OFFSET_MS = 5 * 60 * 60 * 1000; // 5:00 AM reset
    const target = new Date(Date.now() + NEPAL_OFFSET_MS - RESET_OFFSET_MS + offsetDays * 24 * 60 * 60 * 1000);
    const year = target.getUTCFullYear();
    const month = String(target.getUTCMonth() + 1).padStart(2, '0');
    const day = String(target.getUTCDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const getYesterdayDateString = () => getNepalDateString(-1);
  const getTodayDateString = () => getNepalDateString(0);
  const getOneYearAgoDateString = () => getNepalDateString(-365);

  const [lookupDate, setLookupDate] = React.useState(getYesterdayDateString());
  const [lookupStats, setLookupStats] = React.useState({ totalIn: 0, totalOut: 0 });
  const [lookupLoading, setLookupLoading] = React.useState(false);

  React.useEffect(() => {
    if (!lookupDate) return;
    setLookupLoading(true);
    const q = new URLSearchParams({
      date: lookupDate,
      adminRole: adminUser?.role || '',
      adminDistributorId: adminUser?.distributorId || ''
    });
    fetch(`/api/admin/stats/by-date?${q.toString()}`)
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          setLookupStats({ totalIn: data.totalIn || 0, totalOut: data.totalOut || 0 });
        }
      })
      .catch(err => console.error('Failed to load stats for date:', err))
      .finally(() => setLookupLoading(false));
  }, [lookupDate, adminUser?.distributorId, adminUser?.role]);

  const triggerPoolUpdate = (game) => {
    setSelectedGame(game);
    setUpdateCoins(game.availableCoins || 0);
    setUpdateLink(game.openPanelLink || game.link || '');
    setResetUsedCoins(false);
    setUpdateModalOpen(true);
  };

  const handlePoolUpdateSubmit = async (e) => {
    e.preventDefault();
    if (!selectedGame) return;
    const coinsVal = Number(updateCoins);
    if (isNaN(coinsVal) || coinsVal < 0) {
      alert('Please enter a valid positive number for coins.');
      return;
    }
    setIsUpdatingPool(true);
    try {
      await onUpdateGameCoinsPool(selectedGame.id, coinsVal, updateLink, resetUsedCoins);
      mutateGames();
      setUpdateModalOpen(false);
    } catch (err) {
      console.error(err);
      alert('Failed to update game details.');
    } finally {
      setIsUpdatingPool(false);
    }
  };

  const isLoading = !statsData || !gamesData;

  if (isLoading && !statsError && !gamesError) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center', opacity: 0.5 }}>
        <i className="fa-solid fa-spinner fa-spin" style={{ fontSize: '2rem', color: 'var(--gold-primary)', marginBottom: '1rem', display: 'block' }}></i>
        <p>Loading overview stats...</p>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', animation: 'fade-in 0.2s ease-out' }}>
      
      {/* Inactive Staff / Unresponded Request alert box */}
      {(adminUser?.role === 'admin' || adminUser?.role?.toLowerCase().split(',').map(r => r.trim()).includes('operation_admin')) && activityData?.hasUnrespondedRequest && activityData?.activeStaffCount > 0 && (
        <div style={{
          background: 'rgba(239, 68, 68, 0.1)',
          border: '1.5px solid rgba(239, 68, 68, 0.4)',
          borderRadius: '16px',
          padding: '1.25rem',
          boxShadow: '0 4px 20px rgba(239, 68, 68, 0.15)',
          animation: 'pulse-lion 2s infinite ease-in-out'
        }}>
          <h4 style={{ color: '#ef4444', margin: 0, fontSize: '0.85rem', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <i className="fa-solid fa-bell animate-bounce" style={{ color: '#ef4444' }}></i>
            Unresponded Request Alert (Staff Logged In)
          </h4>
          <p style={{ fontSize: '0.75rem', color: '#cbd5e1', margin: '0.5rem 0' }}>
            There are currently <strong style={{ color: '#ef4444' }}>{activityData?.activeStaffCount} active staff member(s)</strong> logged in, but one or more requests have been pending for **over 5 minutes** without a response!
          </p>

          <div style={{ margin: '0.75rem 0', padding: '0.75rem', background: 'rgba(0,0,0,0.2)', borderRadius: '10px', border: '1px solid rgba(239,68,68,0.2)' }}>
            <h5 style={{ color: '#ef4444', margin: '0 0 0.5rem 0', fontSize: '0.725rem', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Pending Tasks (&gt; 5 min):
            </h5>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', maxHeight: '150px', overflowY: 'auto' }}>
              {activityData?.unrespondedRequests?.map((req, idx) => (
                <div key={req.id || idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.7rem', padding: '0.35rem 0.5rem', background: 'rgba(255,255,255,0.03)', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.02)' }}>
                  <span style={{ color: '#fff', fontWeight: 'bold', marginRight: '6px' }}>[{req.type}]</span>
                  <span style={{ color: '#cbd5e1', flex: 1 }}>{req.detail}</span>
                  <span style={{ color: 'var(--text-muted)', fontSize: '0.625rem', marginLeft: '8px' }}>
                    {formatDeviceTime(req.time)}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginTop: '0.5rem', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '0.5rem' }}>
            <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', display: 'block', width: '100%', marginBottom: '0.15rem' }}>Active Staff Online:</span>
            {activityData?.activeStaffList?.map((s) => (
              <span key={s.email} style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', padding: '0.25rem 0.5rem', borderRadius: '6px', fontSize: '0.65rem', color: '#ffd700' }}>
                👤 {s.name || s.email} ({s.role.replace('_', ' ')})
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Daily Financial Summaries */}
      <section className="admin-stats-grid">
        <div className="stat-card" style={{ borderLeft: '4px solid #2ecc71' }}>
          <div className="stat-icon-wrapper green-bg"><i className="fa-solid fa-arrow-down-long"></i></div>
          <div className="stat-info">
            <h3>${stats.todayDeposits.toFixed(2)}</h3>
            <p>Today's Total Deposits</p>
          </div>
        </div>
        
        <div className="stat-card" style={{ borderLeft: '4px solid #ef4444' }}>
          <div className="stat-icon-wrapper red-bg"><i className="fa-solid fa-arrow-up-long"></i></div>
          <div className="stat-info">
            <h3>${stats.todayWithdrawals.toFixed(2)}</h3>
            <p>Today's Total Withdrawals</p>
          </div>
        </div>

        <div className="stat-card" style={{ borderLeft: '4px solid #3498db', minWidth: '300px' }}>
          <div className="stat-icon-wrapper gold-bg"><i className="fa-solid fa-calendar-days"></i></div>
          <div className="stat-info" style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
            <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'block', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Historical Records (1 Yr Max)</span>
            <input 
              type="date"
              value={lookupDate}
              onChange={(e) => setLookupDate(e.target.value)}
              max={getTodayDateString()}
              min={getOneYearAgoDateString()}
              style={{
                background: 'rgba(7,9,18,0.6)',
                border: '1px solid rgba(255,255,255,0.08)',
                color: '#fff',
                borderRadius: '6px',
                fontSize: '0.75rem',
                padding: '0.25rem 0.5rem',
                outline: 'none',
                width: '100%',
                cursor: 'pointer'
              }}
            />
            {lookupLoading ? (
              <span style={{ fontSize: '0.725rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px', marginTop: '0.15rem' }}>
                <i className="fa-solid fa-spinner fa-spin" style={{ color: 'var(--gold-primary)' }}></i> Loading date stats...
              </span>
            ) : (
              <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.15rem' }}>
                <span style={{ fontSize: '0.8rem', color: '#2ecc71', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '2px' }}>
                  📥 In: ${lookupStats.totalIn.toFixed(2)}
                </span>
                <span style={{ fontSize: '0.8rem', color: '#ef4444', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '2px' }}>
                  📤 Out: ${lookupStats.totalOut.toFixed(2)}
                </span>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Financial ledger overview for finance staff only */}
      {isFinancialAdmin && !isFullAdminView && (
        <GatewayRevenueBreakdown adminDistributorId={adminUser?.distributorId || ''} />
      )}

      {/* End of Shift Coins Loading Report Card (Visible to all staff with coins/admin access) */}
      {adminUser && !isPureFinancialAdminOnly && (
        <section className="admin-section-card" style={{ borderLeft: '4px solid var(--gold-primary)', background: '#0a0d16' }}>
          <div className="section-card-header" style={{ marginBottom: '0.75rem' }}>
            <div>
              <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <i className="fa-solid fa-clock-rotate-left text-red"></i> Submit End of Shift Loading Report
              </h3>
              <span className="game-tap-tip">Submit your shift statistics directly to the Boss & Operation Manager</span>
            </div>
          </div>

          <form onSubmit={handleShiftReportSubmit} style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', marginTop: '0.5rem' }}>
            <div className="input-group" style={{ flex: '1 1 100%', margin: 0 }}>
              <label style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.5rem' }}>Select Shift Timeframe</label>
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                {[
                  { value: 'Morning Shift (5 AM - 1 PM)', label: 'Morning Shift', hours: '5 AM - 1 PM', icon: 'fa-sun' },
                  { value: 'Day Shift (1 PM - 9 PM)', label: 'Day Shift', hours: '1 PM - 9 PM', icon: 'fa-moon' },
                  { value: 'Night Shift (9 PM - 5 AM)', label: 'Night Shift', hours: '9 PM - 5 AM', icon: 'fa-star' }
                ].map((s) => {
                  const isSelected = shiftName === s.value;
                  return (
                    <button
                      key={s.value}
                      type="button"
                      onClick={() => setShiftName(s.value)}
                      style={{
                        flex: '1 1 180px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.75rem',
                        padding: '0.65rem 1rem',
                        background: isSelected ? 'rgba(255, 215, 0, 0.1)' : '#070912',
                        border: isSelected ? '1px solid var(--gold-primary)' : '1px solid rgba(255,255,255,0.05)',
                        borderRadius: '10px',
                        cursor: 'pointer',
                        textAlign: 'left',
                        transition: 'all 0.2s ease',
                        color: isSelected ? 'var(--gold-primary)' : '#fff',
                        margin: 0
                      }}
                    >
                      <div style={{
                        width: '32px',
                        height: '32px',
                        borderRadius: '50%',
                        background: isSelected ? 'rgba(255,215,0,0.2)' : 'rgba(255,255,255,0.05)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '0.9rem',
                        color: isSelected ? 'var(--gold-primary)' : 'var(--text-muted)'
                      }}>
                        <i className={`fa-solid ${s.icon}`}></i>
                      </div>
                      <div>
                        <strong style={{ fontSize: '0.75rem', display: 'block' }}>{s.label}</strong>
                        <span style={{ fontSize: '0.6rem', opacity: 0.6, display: 'block', marginTop: '0.15rem' }}>{s.hours}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>



            <div className="input-group" style={{ flex: '1 1 100%', margin: 0 }}>
              <label style={{ fontSize: '0.7rem' }}>Shift Notes & Hand-over Comments</label>
              <textarea
                placeholder="Write highlights, hand-over notes, or shift details..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                style={{
                  background: '#07090f',
                  border: '1px solid rgba(255,255,255,0.05)',
                  borderRadius: '8px',
                  color: '#fff',
                  width: '100%',
                  minHeight: '80px',
                  padding: '0.75rem',
                  fontSize: '0.775rem',
                  outline: 'none',
                  resize: 'vertical'
                }}
              />
            </div>

            <button type="submit" className="submit-btn" style={{ background: 'var(--gold-primary)', color: '#000', fontWeight: 'bold', width: 'auto', padding: '0.65rem 1.5rem', margin: 0 }} disabled={isSubmittingReport}>
              <span>{isSubmittingReport ? 'SUBMITTING...' : 'SUBMIT SHIFT REPORT ➔'}</span>
              <div className="btn-glow"></div>
            </button>
          </form>
        </section>
      )}

      {/* Game coins pool status (Visible for staff with coins/admin access) */}
      {adminUser && !isPureFinancialAdminOnly && (
        <section className="admin-section-card">
        <div className="section-card-header">
          <div>
            <h3><i className="fa-solid fa-coins gold-text"></i> Game Coins Remaining Pool</h3>
            <span className="game-tap-tip">Allotment reserves of active game platforms</span>
          </div>
        </div>

        <div className="table-responsive">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Game Title</th>
                <th>Game Badge</th>
                <th>Remaining Coins Balance</th>
                <th>Used Coins</th>
                <th>Fulfillment Portal</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {games.length === 0 ? (
                <tr>
                  <td colSpan="6" className="text-center text-muted">No games loaded in library.</td>
                </tr>
              ) : (
                games.map((game) => (
                  <tr key={game.id}>
                    <td><strong>{game.title}</strong></td>
                    <td><span className={`admin-badge-preview b-${game.badge}`}>{game.badge}</span></td>
                    <td>
                      <strong style={{ fontSize: '0.95rem', color: (game.availableCoins || 0) < 5000 ? '#ef4444' : '#ffd700' }}>
                        <i className="fa-solid fa-coins" style={{ color: '#ffd700', marginRight: '4px' }}></i> {game.availableCoins || 0} Coins
                      </strong>
                    </td>
                    <td>
                      <strong style={{ fontSize: '0.95rem', color: '#10b981' }}>
                        <i className="fa-solid fa-circle-dollar-to-slot" style={{ color: '#10b981', marginRight: '4px' }}></i> {game.usedCoins || 0} Coins
                      </strong>
                    </td>
                    <td>
                      <a href={game.openPanelLink || game.link} target="_blank" rel="noopener noreferrer" className="gold-text" style={{ fontSize: '0.75rem', textDecoration: 'none' }}>
                        Open Panel &rarr;
                      </a>
                    </td>
                    <td>
                      {(() => {
                        const roles = (adminUser?.role || '').toLowerCase().split(',').map(r => r.trim());
                        const canUpdate = roles.includes('admin') || roles.includes('coins_admin') || roles.includes('operation_admin');
                        if (canUpdate) {
                          return (
                            <button
                              onClick={() => triggerPoolUpdate(game)}
                              className="action-row-btn btn-edit"
                              style={{ width: 'auto', padding: '0.4rem 0.75rem', fontSize: '0.72rem', display: 'inline-flex', alignItems: 'center', gap: '0.35rem', whiteSpace: 'nowrap' }}
                              title="Update Remaining Pool & Link"
                            >
                              <i className="fa-solid fa-pen-to-square"></i>
                              <span>Update Pool</span>
                            </button>
                          );
                        }
                        return <span style={{ fontSize: '0.7rem', opacity: 0.5 }}>Restricted</span>;
                      })()}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
      )}

      {/* Update Pool Modal */}
      {updateModalOpen && selectedGame && (
        <PanelModalBackdrop className="panel-modal-overlay">
          <div
            className="panel-modal-dialog"
            style={{ border: '1.5px solid var(--gold-primary)', padding: '1.5rem' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
              <h3 style={{ fontSize: '1rem', fontWeight: 'bold', color: '#fff', margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <i className="fa-solid fa-pen-to-square text-gold" style={{ color: 'var(--gold-primary)' }}></i>
                Update {selectedGame.title} Pool
              </h3>
              <button 
                onClick={() => setUpdateModalOpen(false)}
                style={{ background: 'none', border: 'none', color: '#fff', fontSize: '1.25rem', cursor: 'pointer', padding: 0 }}
              >
                &times;
              </button>
            </div>

            <form onSubmit={handlePoolUpdateSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div className="input-group" style={{ margin: 0 }}>
                <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.35rem' }}>
                  Available/Remaining Coins
                </label>
                <div className="input-wrapper" style={{ background: '#07090f' }}>
                  <i className="fa-solid fa-coins input-icon" style={{ color: 'var(--gold-primary)' }}></i>
                  <input
                    type="number"
                    value={updateCoins}
                    onChange={(e) => setUpdateCoins(e.target.value)}
                    placeholder="Enter coin balance"
                    style={{ fontSize: '0.75rem' }}
                    required
                  />
                </div>
              </div>

              <div className="input-group" style={{ margin: 0 }}>
                <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.35rem' }}>
                  Fulfillment Portal URL (Open Panel Link)
                </label>
                <div className="input-wrapper" style={{ background: '#07090f' }}>
                  <i className="fa-solid fa-link input-icon" style={{ color: 'var(--gold-primary)' }}></i>
                  <input
                    type="url"
                    value={updateLink}
                    onChange={(e) => setUpdateLink(e.target.value)}
                    placeholder="https://example.com/panel"
                    style={{ fontSize: '0.75rem' }}
                  />
                </div>
              </div>

              <div className="input-group" style={{ margin: '0.25rem 0 0 0' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.75rem', color: '#f59e0b' }}>
                  <input
                    type="checkbox"
                    checked={resetUsedCoins}
                    onChange={(e) => setResetUsedCoins(e.target.checked)}
                    style={{ width: 'auto', cursor: 'pointer' }}
                  />
                  <span>Reset Used Coins counter to 0 (Daily reset)</span>
                </label>
              </div>

              <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.5rem' }}>
                <button 
                  type="submit" 
                  className="submit-btn" 
                  style={{ background: 'var(--gold-primary)', color: '#000', fontWeight: 'bold', margin: 0, flex: 1 }} 
                  disabled={isUpdatingPool}
                >
                  {isUpdatingPool ? 'SAVING...' : 'SAVE CHANGES'}
                </button>
                <button 
                  type="button" 
                  className="action-row-btn" 
                  onClick={() => setUpdateModalOpen(false)}
                  style={{ background: 'rgba(255,255,255,0.05)', color: '#fff', border: 'none', padding: '0.5rem 1rem', borderRadius: '8px', cursor: 'pointer', margin: 0 }}
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </PanelModalBackdrop>
      )}
    </div>
  );
}
