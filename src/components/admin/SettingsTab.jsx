import React, { useState, useEffect } from 'react';
import useSWR from 'swr';

const fetcher = (...args) => fetch(...args).then((res) => res.json());

export default function SettingsTab({ onUpdateSettings }) {
  const { data: settingsData, error, mutate } = useSWR('/api/settings', fetcher);

  const [firstBonusInput, setFirstBonusInput] = useState(300);
  const [regularBonusInput, setRegularBonusInput] = useState(20);
  const [referralBonusInput, setReferralBonusInput] = useState(10);
  const [preventDuplicateDeviceAccounts, setPreventDuplicateDeviceAccounts] = useState(true);
  const [usdtAddressInput, setUsdtAddressInput] = useState('');
  const [usdtQrCodeInput, setUsdtQrCodeInput] = useState('');
  const [affiliatePayoutNetwork, setAffiliatePayoutNetwork] = useState('TRC20');
  const [affiliatePayoutWallet, setAffiliatePayoutWallet] = useState('');
  const [affiliatePayoutQrCode, setAffiliatePayoutQrCode] = useState('');
  const [affiliatePayoutWalletBEP20, setAffiliatePayoutWalletBEP20] = useState('');
  const [affiliatePayoutQrBEP20, setAffiliatePayoutQrBEP20] = useState('');
  const [affiliatePlatformCommissionRate, setAffiliatePlatformCommissionRate] = useState(90);
  const [adPaymentNetwork, setAdPaymentNetwork] = useState('BEP20');
  const [adPaymentWallet, setAdPaymentWallet] = useState('');
  const [adPaymentQrCode, setAdPaymentQrCode] = useState('');
  const [adBudgetLimit, setAdBudgetLimit] = useState(6000);

  // Cashout rules & deposit multiplier settings
  const [freeplayMinWithdraw, setFreeplayMinWithdraw] = useState(30);
  const [defaultMinWithdraw, setDefaultMinWithdraw] = useState(25);
  const [withdrawTier1Multiplier, setWithdrawTier1Multiplier] = useState(5);
  const [withdrawTier2Multiplier, setWithdrawTier2Multiplier] = useState(3);
  const [withdrawTier1MinDeposit, setWithdrawTier1MinDeposit] = useState(5);
  const [withdrawTier1MaxDeposit, setWithdrawTier1MaxDeposit] = useState(50);
  const [withdrawTier1Basis, setWithdrawTier1Basis] = useState('COINS');
  const [withdrawTier2Basis, setWithdrawTier2Basis] = useState('DEPOSIT');
  const [withdrawMultiplierBasis, setWithdrawMultiplierBasis] = useState('SIGNUP_ONLY_COINS');

  // Sync settings inputs when SWR loads data
  useEffect(() => {
    if (settingsData?.settings) {
      setFirstBonusInput(settingsData.settings.firstDepositBonus);
      setRegularBonusInput(settingsData.settings.regularDepositBonus);
      setReferralBonusInput(settingsData.settings.referralBonus || 10);
      setPreventDuplicateDeviceAccounts(settingsData.settings.preventDuplicateDeviceAccounts !== false);
      setFreeplayMinWithdraw(settingsData.settings.freeplayMinWithdraw !== undefined ? settingsData.settings.freeplayMinWithdraw : 30);
      setDefaultMinWithdraw(settingsData.settings.defaultMinWithdraw !== undefined ? settingsData.settings.defaultMinWithdraw : 25);
      setWithdrawTier1Multiplier(settingsData.settings.withdrawTier1Multiplier !== undefined ? settingsData.settings.withdrawTier1Multiplier : 5);
      setWithdrawTier2Multiplier(settingsData.settings.withdrawTier2Multiplier !== undefined ? settingsData.settings.withdrawTier2Multiplier : 3);
      setWithdrawTier1MinDeposit(settingsData.settings.withdrawTier1MinDeposit !== undefined ? settingsData.settings.withdrawTier1MinDeposit : 5);
      setWithdrawTier1MaxDeposit(settingsData.settings.withdrawTier1MaxDeposit !== undefined ? settingsData.settings.withdrawTier1MaxDeposit : 50);
      setWithdrawTier1Basis(settingsData.settings.withdrawTier1Basis || 'COINS');
      setWithdrawTier2Basis(settingsData.settings.withdrawTier2Basis || 'DEPOSIT');
      setWithdrawMultiplierBasis(settingsData.settings.withdrawMultiplierBasis || 'SIGNUP_ONLY_COINS');
      setUsdtAddressInput(settingsData.settings.usdtAddress || '');
      setUsdtQrCodeInput(settingsData.settings.usdtQrCode || '');
      setAffiliatePayoutNetwork(settingsData.settings.affiliatePayoutNetwork || 'TRC20');
      setAffiliatePayoutWallet(settingsData.settings.affiliatePayoutWallet || '');
      setAffiliatePayoutQrCode(settingsData.settings.affiliatePayoutQrCode || '');
      setAffiliatePayoutWalletBEP20(settingsData.settings.affiliatePayoutWalletBEP20 || '');
      setAffiliatePayoutQrBEP20(settingsData.settings.affiliatePayoutQrBEP20 || '');
      setAffiliatePlatformCommissionRate(settingsData.settings.affiliatePlatformCommissionRate ?? 90);
      setAdPaymentNetwork(settingsData.settings.adPaymentNetwork || 'BEP20');
      setAdPaymentWallet(settingsData.settings.adPaymentWallet || '');
      setAdPaymentQrCode(settingsData.settings.adPaymentQrCode || '');
      setAdBudgetLimit(settingsData.settings.adBudgetLimit ?? 6000);
    }
  }, [settingsData]);

  const handleQrCodeChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onloadend = () => {
      setUsdtQrCodeInput(reader.result);
      alert('TRC20 QR Code screenshot loaded. Click Save configurations to update!');
    };
    reader.readAsDataURL(file);
  };

  const handleAffiliateQrChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onloadend = () => setAffiliatePayoutQrCode(reader.result);
    reader.readAsDataURL(file);
  };

  const handleAffiliateQrBEP20Change = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onloadend = () => setAffiliatePayoutQrBEP20(reader.result);
    reader.readAsDataURL(file);
  };

  const handleAdPaymentQrChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onloadend = () => setAdPaymentQrCode(reader.result);
    reader.readAsDataURL(file);
  };
  const handleAdQrChange = handleAdPaymentQrChange;

  const handleSettingsSubmit = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firstDepositBonus: firstBonusInput,
          regularDepositBonus: regularBonusInput,
          referralBonus: referralBonusInput,
          preventDuplicateDeviceAccounts,
          freeplayMinWithdraw: Number(freeplayMinWithdraw),
          defaultMinWithdraw: Number(defaultMinWithdraw),
          withdrawTier1Multiplier: Number(withdrawTier1Multiplier),
          withdrawTier2Multiplier: Number(withdrawTier2Multiplier),
          withdrawTier1MinDeposit: Number(withdrawTier1MinDeposit),
          withdrawTier1MaxDeposit: Number(withdrawTier1MaxDeposit),
          withdrawTier1Basis,
          withdrawTier2Basis,
          withdrawMultiplierBasis,
          usdtAddress: usdtAddressInput,
          usdtQrCode: usdtQrCodeInput,
          affiliatePayoutNetwork,
          affiliatePayoutWallet,
          affiliatePayoutQrCode,
          affiliatePayoutWalletBEP20,
          affiliatePayoutQrBEP20,
          affiliatePlatformCommissionRate,
          adPaymentNetwork,
          adPaymentWallet,
          adPaymentQrCode,
          adBudgetLimit
        })
      });
      const data = await res.json();
      if (data.success) {
        alert('System settings updated successfully!');
        mutate();
        if (onUpdateSettings) {
          await onUpdateSettings();
        }
      } else {
        alert(data.message || 'Failed to update settings.');
      }
    } catch (err) {
      console.error(err);
      alert('Connection error updating settings.');
    }
  };

  if (!settingsData && !error) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center', opacity: 0.5 }}>
        <i className="fa-solid fa-spinner fa-spin" style={{ fontSize: '2rem', color: 'var(--gold-primary)', marginBottom: '1rem', display: 'block' }}></i>
        <p>Loading settings configuration...</p>
      </div>
    );
  }

  return (
    <section className="admin-section-card" style={{ maxWidth: '600px', margin: '0 auto', animation: 'fade-in 0.2s ease-out' }}>
      <div className="section-card-header" style={{ marginBottom: '1.25rem' }}>
        <h3><i className="fa-solid fa-sliders gold-text"></i> System Settings & Bonus Percentages</h3>
        <p style={{ fontSize: '0.7rem', opacity: 0.7, color: 'var(--text-muted)' }}>
          Configure signup and repeat deposit bonuses allotted to players.
        </p>
      </div>

      <form onSubmit={handleSettingsSubmit} noValidate>
        <div className="input-group">
          <label htmlFor="settings-first-bonus">First Deposit Signup Bonus (%)</label>
          <div className="input-wrapper">
            <i className="fa-solid fa-gift input-icon" style={{ color: '#00ff66' }}></i>
            <input
              type="number"
              id="settings-first-bonus"
              placeholder="e.g. 300"
              value={firstBonusInput}
              onChange={(e) => setFirstBonusInput(e.target.value)}
              required
            />
            <span style={{ paddingRight: '1rem', color: 'var(--text-muted)', fontSize: '0.8rem' }}>%</span>
          </div>
          <span className="game-tap-tip">Calculates multiplier of deposit when a player makes their very first payment (e.g. 300% adds 3x coins).</span>
        </div>

        <div className="input-group" style={{ marginTop: '1.5rem' }}>
          <label htmlFor="settings-regular-bonus">Regular Repeat Deposit Bonus (%)</label>
          <div className="input-wrapper">
            <i className="fa-solid fa-rotate input-icon" style={{ color: '#00d2ff' }}></i>
            <input
              type="number"
              id="settings-regular-bonus"
              placeholder="e.g. 20"
              value={regularBonusInput}
              onChange={(e) => setRegularBonusInput(e.target.value)}
              required
            />
            <span style={{ paddingRight: '1rem', color: 'var(--text-muted)', fontSize: '0.8rem' }}>%</span>
          </div>
          <span className="game-tap-tip">Calculates multiplier of deposit when a player makes repeat deposits (e.g. 20% adds 1.2x coins).</span>
        </div>

        <div className="input-group" style={{ marginTop: '1.5rem' }}>
          <label htmlFor="settings-referral-bonus">Referral Deposit Reward Bonus (%)</label>
          <div className="input-wrapper">
            <i className="fa-solid fa-users-viewfinder input-icon" style={{ color: '#a855f7' }}></i>
            <input
              type="number"
              id="settings-referral-bonus"
              placeholder="e.g. 10"
              value={referralBonusInput}
              onChange={(e) => setReferralBonusInput(e.target.value)}
              required
            />
            <span style={{ paddingRight: '1rem', color: 'var(--text-muted)', fontSize: '0.8rem' }}>%</span>
          </div>
          <span className="game-tap-tip">Calculates reward coins allotted to the referrer when their referred friend makes a deposit (e.g. 10% sends 10% of deposit value to referrer).</span>
        </div>

        <div className="input-group" style={{ marginTop: '1.5rem', background: 'rgba(255, 255, 255, 0.03)', padding: '1rem', borderRadius: '10px', border: '1px solid var(--border-muted)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <label style={{ margin: 0, fontWeight: 'bold', fontSize: '0.85rem', color: '#fff' }}>
                <i className="fa-solid fa-shield-halved" style={{ color: 'var(--red-primary)', marginRight: '0.5rem' }}></i>
                Anti-Fraud: Prevent Multiple Accounts Per Device
              </label>
              <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                Blocks players from registering multiple accounts on the same phone, browser, or device.
              </p>
            </div>
            <label className="toggle-switch" style={{ position: 'relative', display: 'inline-block', width: '48px', height: '24px', flexShrink: 0, marginLeft: '1rem', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={preventDuplicateDeviceAccounts}
                onChange={(e) => setPreventDuplicateDeviceAccounts(e.target.checked)}
                style={{ opacity: 0, width: 0, height: 0 }}
              />
              <span style={{
                position: 'absolute', cursor: 'pointer', top: 0, left: 0, right: 0, bottom: 0,
                backgroundColor: preventDuplicateDeviceAccounts ? '#00ff66' : '#444',
                transition: '.3s', borderRadius: '24px'
              }}>
                <span style={{
                  position: 'absolute', height: '18px', width: '18px', left: preventDuplicateDeviceAccounts ? '26px' : '3px', bottom: '3px',
                  backgroundColor: 'white', transition: '.3s', borderRadius: '50%'
                }} />
              </span>
            </label>
          </div>
        </div>

        <div style={{ marginTop: '2rem', paddingTop: '1.5rem', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
          <h4 style={{ fontSize: '0.95rem', color: 'var(--gold-primary)', marginBottom: '0.4rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <i className="fa-solid fa-money-bill-transfer" style={{ color: 'var(--gold-primary)' }}></i> Cashout Rules & Deposit Multipliers
          </h4>
          <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '1.25rem' }}>
            Set minimum withdrawal limits, freeplay rules, and deposit multipliers (5x for $5-$50, 3x for &gt;$50) applied to player allotted coins.
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
            <div className="input-group" style={{ margin: 0 }}>
              <label htmlFor="settings-freeplay-min-cashout">Freeplay Min Cashout ($)</label>
              <div className="input-wrapper">
                <i className="fa-solid fa-gift input-icon" style={{ color: '#00ff66' }}></i>
                <input
                  type="number"
                  id="settings-freeplay-min-cashout"
                  min="1"
                  placeholder="30"
                  value={freeplayMinWithdraw}
                  onChange={(e) => setFreeplayMinWithdraw(e.target.value)}
                  required
                />
                <span style={{ paddingRight: '1rem', color: 'var(--text-muted)', fontSize: '0.8rem' }}>$</span>
              </div>
              <span className="game-tap-tip">Minimum cashout required when a client plays and requests a cashout with freeplay (Default: $30).</span>
            </div>

            <div className="input-group" style={{ margin: 0 }}>
              <label htmlFor="settings-default-min-cashout">Default Min Cashout ($)</label>
              <div className="input-wrapper">
                <i className="fa-solid fa-wallet input-icon" style={{ color: '#00d2ff' }}></i>
                <input
                  type="number"
                  id="settings-default-min-cashout"
                  min="1"
                  placeholder="25"
                  value={defaultMinWithdraw}
                  onChange={(e) => setDefaultMinWithdraw(e.target.value)}
                  required
                />
                <span style={{ paddingRight: '1rem', color: 'var(--text-muted)', fontSize: '0.8rem' }}>$</span>
              </div>
              <span className="game-tap-tip">Standard minimum withdrawal when no deposit tier rule applies.</span>
            </div>
          </div>

          <div style={{ background: 'rgba(255,255,255,0.03)', padding: '1rem', borderRadius: '10px', border: '1px solid var(--border-muted)', marginBottom: '1rem' }}>
            <h5 style={{ fontSize: '0.85rem', color: '#fff', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <i className="fa-solid fa-sliders" style={{ color: '#ffd700' }}></i> Cashout Calculation Base (All Rules)
            </h5>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.5rem' }}>
              <button
                type="button"
                onClick={() => {
                  setWithdrawMultiplierBasis('SIGNUP_ONLY_COINS');
                  setWithdrawTier1Basis('COINS');
                  setWithdrawTier2Basis('DEPOSIT');
                }}
                style={{
                  padding: '0.35rem 0.75rem',
                  fontSize: '0.72rem',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  background: withdrawMultiplierBasis === 'SIGNUP_ONLY_COINS' || withdrawMultiplierBasis === 'TIER_BASED' ? '#f59e0b' : 'rgba(255,255,255,0.08)',
                  color: withdrawMultiplierBasis === 'SIGNUP_ONLY_COINS' || withdrawMultiplierBasis === 'TIER_BASED' ? '#000' : '#ccc',
                  border: '1px solid rgba(255,255,255,0.1)',
                  fontWeight: '600'
                }}
              >
                Only Signup Bonus on Coins (Others on Deposit $) [Recommended]
              </button>
              <button
                type="button"
                onClick={() => {
                  setWithdrawMultiplierBasis('DEPOSIT');
                  setWithdrawTier1Basis('DEPOSIT');
                  setWithdrawTier2Basis('DEPOSIT');
                }}
                style={{
                  padding: '0.35rem 0.75rem',
                  fontSize: '0.72rem',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  background: withdrawMultiplierBasis === 'DEPOSIT' ? '#38bdf8' : 'rgba(255,255,255,0.08)',
                  color: withdrawMultiplierBasis === 'DEPOSIT' ? '#000' : '#ccc',
                  border: '1px solid rgba(255,255,255,0.1)',
                  fontWeight: '600'
                }}
              >
                All Rules on Deposit Amount ($)
              </button>
              <button
                type="button"
                onClick={() => {
                  setWithdrawMultiplierBasis('COINS');
                  setWithdrawTier1Basis('COINS');
                  setWithdrawTier2Basis('COINS');
                }}
                style={{
                  padding: '0.35rem 0.75rem',
                  fontSize: '0.72rem',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  background: withdrawMultiplierBasis === 'COINS' ? '#10b981' : 'rgba(255,255,255,0.08)',
                  color: withdrawMultiplierBasis === 'COINS' ? '#000' : '#ccc',
                  border: '1px solid rgba(255,255,255,0.1)',
                  fontWeight: '600'
                }}
              >
                All Rules on Coins
              </button>
            </div>
            <span className="game-tap-tip">
              {withdrawMultiplierBasis === 'DEPOSIT'
                ? 'All cashout rules calculate strictly from Deposit Amount ($).'
                : withdrawMultiplierBasis === 'COINS'
                ? 'All cashout rules calculate from Allotted Coins (deposit + bonus).'
                : 'Only Signup Bonus (1st deposit) attaches coins with deposit amount. All subsequent regular deposits calculate strictly from Deposit Amount ($).'}
            </span>
          </div>

          <div style={{ background: 'rgba(255,255,255,0.03)', padding: '1rem', borderRadius: '10px', border: '1px solid var(--border-muted)', marginBottom: '1rem' }}>
            <h5 style={{ fontSize: '0.85rem', color: '#fff', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <i className="fa-solid fa-calculator" style={{ color: '#f59e0b' }}></i> Deposit Tier 1: $5 to $50 Multiplier
            </h5>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '0.75rem' }}>
              <div className="input-group" style={{ margin: 0 }}>
                <label>Tier 1 Multiplier</label>
                <div className="input-wrapper">
                  <i className="fa-solid fa-xmark input-icon" style={{ color: '#f59e0b' }}></i>
                  <input
                    type="number"
                    step="0.1"
                    min="1"
                    placeholder="5"
                    value={withdrawTier1Multiplier}
                    onChange={(e) => setWithdrawTier1Multiplier(e.target.value)}
                    required
                  />
                  <span style={{ paddingRight: '1rem', color: 'var(--text-muted)', fontSize: '0.8rem' }}>x</span>
                </div>
              </div>

              <div className="input-group" style={{ margin: 0 }}>
                <label>Tier 1 Range (Min to Max $)</label>
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  <input
                    type="number"
                    min="1"
                    placeholder="5"
                    value={withdrawTier1MinDeposit}
                    onChange={(e) => setWithdrawTier1MinDeposit(e.target.value)}
                    style={{ width: '50%', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', padding: '0.5rem', borderRadius: '6px', fontSize: '0.75rem' }}
                  />
                  <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>to</span>
                  <input
                    type="number"
                    min="1"
                    placeholder="50"
                    value={withdrawTier1MaxDeposit}
                    onChange={(e) => setWithdrawTier1MaxDeposit(e.target.value)}
                    style={{ width: '50%', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', padding: '0.5rem', borderRadius: '6px', fontSize: '0.75rem' }}
                  />
                </div>
              </div>
            </div>

            <div className="input-group" style={{ margin: 0 }}>
              <label>Tier 1 Calculation Base</label>
              <select
                value={withdrawTier1Basis}
                onChange={(e) => {
                  setWithdrawTier1Basis(e.target.value);
                  setWithdrawMultiplierBasis('CUSTOM');
                }}
                style={{
                  width: '100%',
                  background: 'rgba(0,0,0,0.3)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  color: '#fff',
                  padding: '0.5rem',
                  borderRadius: '6px',
                  fontSize: '0.75rem'
                }}
              >
                <option value="COINS" style={{ background: '#111', color: '#fff' }}>Allotted Coins (Default: Coins × {withdrawTier1Multiplier}x)</option>
                <option value="DEPOSIT" style={{ background: '#111', color: '#fff' }}>Deposit Amount ($ × {withdrawTier1Multiplier}x)</option>
              </select>
              <span className="game-tap-tip">
                {withdrawTier1Basis === 'DEPOSIT'
                  ? `Min cashout calculated as: Deposit Amount ($) × ${withdrawTier1Multiplier}x.`
                  : `Min cashout calculated as: Allotted Coins × ${withdrawTier1Multiplier}x.`}
              </span>
            </div>
          </div>

          <div style={{ background: 'rgba(255,255,255,0.03)', padding: '1rem', borderRadius: '10px', border: '1px solid var(--border-muted)', marginBottom: '1rem' }}>
            <h5 style={{ fontSize: '0.85rem', color: '#fff', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <i className="fa-solid fa-calculator" style={{ color: '#38bdf8' }}></i> Deposit Tier 2: Above $50 Multiplier
            </h5>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div className="input-group" style={{ margin: 0 }}>
                <label>Tier 2 Multiplier (Deposit &gt; ${withdrawTier1MaxDeposit || 50})</label>
                <div className="input-wrapper">
                  <i className="fa-solid fa-xmark input-icon" style={{ color: '#38bdf8' }}></i>
                  <input
                    type="number"
                    step="0.1"
                    min="1"
                    placeholder="3"
                    value={withdrawTier2Multiplier}
                    onChange={(e) => setWithdrawTier2Multiplier(e.target.value)}
                    required
                  />
                  <span style={{ paddingRight: '1rem', color: 'var(--text-muted)', fontSize: '0.8rem' }}>x</span>
                </div>
              </div>

              <div className="input-group" style={{ margin: 0 }}>
                <label>Tier 2 Calculation Base</label>
                <select
                  value={withdrawTier2Basis}
                  onChange={(e) => {
                    setWithdrawTier2Basis(e.target.value);
                    setWithdrawMultiplierBasis('CUSTOM');
                  }}
                  style={{
                    width: '100%',
                    background: 'rgba(0,0,0,0.3)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    color: '#fff',
                    padding: '0.5rem',
                    borderRadius: '6px',
                    fontSize: '0.75rem'
                  }}
                >
                  <option value="DEPOSIT" style={{ background: '#111', color: '#fff' }}>Deposit Amount ($ × {withdrawTier2Multiplier}x) [Default]</option>
                  <option value="COINS" style={{ background: '#111', color: '#fff' }}>Allotted Coins (Coins × {withdrawTier2Multiplier}x)</option>
                </select>
              </div>
            </div>
            <span className="game-tap-tip" style={{ marginTop: '0.4rem', display: 'block' }}>
              {withdrawTier2Basis === 'DEPOSIT'
                ? `Min cashout calculated as: Deposit Amount ($) × ${withdrawTier2Multiplier}x (e.g. $100 deposit × ${withdrawTier2Multiplier} = $${100 * (Number(withdrawTier2Multiplier) || 3)} min cashout).`
                : `Min cashout calculated as: Allotted Coins × ${withdrawTier2Multiplier}x.`}
            </span>
          </div>
        </div>

        <div className="input-group" style={{ marginTop: '1.5rem' }}>
          <label htmlFor="settings-usdt-address">Platform Owner USDT Address (Zelle/USDT Wallet)</label>
          <div className="input-wrapper">
            <i className="fa-solid fa-wallet input-icon" style={{ color: '#ffcc00' }}></i>
            <input
              type="text"
              id="settings-usdt-address"
              placeholder="e.g. TR7NHgoKwqTvF24F7545G... or cashapp tag"
              value={usdtAddressInput}
              onChange={(e) => setUsdtAddressInput(e.target.value)}
            />
          </div>
          <span className="game-tap-tip">The wallet address independent Type B distributors will send their platform website commission payments to.</span>
        </div>

        <div className="input-group" style={{ marginTop: '1.5rem' }}>
          <label>TRC20 QR Code Screenshot</label>
          <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
            <input
              type="file"
              accept="image/*"
              onChange={handleQrCodeChange}
              style={{ color: '#888', fontSize: '0.75rem' }}
            />
            {usdtQrCodeInput && (
              <div style={{ position: 'relative' }}>
                <img
                  src={usdtQrCodeInput}
                  alt="USDT QR Code"
                  style={{ width: '80px', height: '80px', objectFit: 'cover', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.1)' }}
                />
                <button
                  type="button"
                  onClick={() => setUsdtQrCodeInput('')}
                  style={{ position: 'absolute', top: '-5px', right: '-5px', background: '#ef4444', color: '#fff', border: 'none', borderRadius: '50%', width: '18px', height: '18px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.6rem', cursor: 'pointer' }}
                >
                  &times;
                </button>
              </div>
            )}
          </div>
          <span className="game-tap-tip">Upload a QR Code screenshot so distributors can quickly scan and pay.</span>
        </div>

        <div style={{ marginTop: '2rem', paddingTop: '1.5rem', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
          <h4 style={{ fontSize: '0.95rem', color: 'var(--gold-primary)', marginBottom: '1rem' }}>
            <i className="fa-solid fa-users" style={{ marginRight: '0.4rem' }}></i> Affiliate Commission Payout Settings
          </h4>

          <div className="input-group" style={{ marginTop: '1rem' }}>
            <label>Platform Commission Share (%)</label>
            <input
              type="number"
              min="0"
              max="100"
              value={affiliatePlatformCommissionRate}
              onChange={(e) => setAffiliatePlatformCommissionRate(e.target.value)}
              style={{ width: '100%', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.05)', color: '#fff', padding: '0.5rem', borderRadius: '6px', fontSize: '0.75rem' }}
            />
            <span className="game-tap-tip">Shown to affiliates as platform share (affiliate share = 100 - this value).</span>
          </div>
        </div>

        <div style={{ marginTop: '2rem', paddingTop: '1.5rem', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
          <h4 style={{ fontSize: '0.95rem', color: 'var(--gold-primary)', marginBottom: '1rem' }}>
            <i className="fa-solid fa-bullhorn" style={{ marginRight: '0.4rem' }}></i> Affiliate Ads Payment Settings
          </h4>

          <div className="input-group">
            <label>Ads Budget Limit Per Agent ($)</label>
            <input type="number" min="0" step="1" value={adBudgetLimit} onChange={(e) => setAdBudgetLimit(e.target.value)} style={{ width: '100%', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.05)', color: '#fff', padding: '0.5rem', borderRadius: '6px', fontSize: '0.75rem' }} />
          </div>

          <div className="input-group" style={{ marginTop: '1rem' }}>
            <label>Ads Payment Network</label>
            <select value={adPaymentNetwork} onChange={(e) => setAdPaymentNetwork(e.target.value)} style={{ width: '100%', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.05)', color: '#fff', padding: '0.5rem', borderRadius: '6px', fontSize: '0.75rem' }}>
              <option value="BEP20">BNB Smart Chain (BEP20)</option>
              <option value="TRC20">USDT (TRC20)</option>
            </select>
          </div>

          <div className="input-group" style={{ marginTop: '1rem' }}>
            <label>Ads Payment Wallet Address</label>
            <input type="text" placeholder="Wallet for ad budget deposits" value={adPaymentWallet} onChange={(e) => setAdPaymentWallet(e.target.value)} style={{ width: '100%', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.05)', color: '#fff', padding: '0.5rem', borderRadius: '6px', fontSize: '0.75rem' }} />
          </div>

          <div className="input-group" style={{ marginTop: '1rem' }}>
            <label>Ads Payment QR Code</label>
            <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
              <input type="file" accept="image/*" onChange={handleAdQrChange} style={{ color: '#888', fontSize: '0.75rem' }} />
              {adPaymentQrCode && (
                <div style={{ position: 'relative' }}>
                  <img src={adPaymentQrCode} alt="Ads QR" style={{ width: '80px', height: '80px', objectFit: 'cover', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.1)' }} />
                  <button
                    type="button"
                    onClick={() => setAdPaymentQrCode('')}
                    style={{ position: 'absolute', top: '-5px', right: '-5px', background: '#ef4444', color: '#fff', border: 'none', borderRadius: '50%', width: '18px', height: '18px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.6rem', cursor: 'pointer' }}
                  >
                    &times;
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        <button type="submit" className="submit-btn" style={{ background: 'var(--gold-primary)', color: '#000', fontWeight: 'bold', marginTop: '2rem' }}>
          SAVE CONFIGURATIONS &rarr;
        </button>
      </form>
    </section>
  );
}
