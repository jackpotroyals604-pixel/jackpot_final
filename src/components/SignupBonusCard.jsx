'use client';

import React, { useState, useEffect } from 'react';

export default function SignupBonusModal({
  isOpen = false,
  onClose,
  frontendSettings = {},
  onGoToRegister,
  onGoToLogin,
  onGoToDeposit,
  isLoggedIn = false
}) {
  const [depositAmount, setDepositAmount] = useState(10);
  const [customAmount, setCustomAmount] = useState('');
  const [isCustom, setIsCustom] = useState(false);
  const [authMode, setAuthMode] = useState('register'); // 'register' | 'login'

  // Read live bonus & freeplay settings from system
  const bonusPercent = Number(
    frontendSettings?.firstDepositBonus !== undefined
      ? frontendSettings.firstDepositBonus
      : 300
  );
  const freeplayAmount = Number(
    frontendSettings?.signupFreeplay !== undefined
      ? frontendSettings.signupFreeplay
      : 3
  );

  const presets = [10, 20, 50, 100];

  const activeDeposit = isCustom
    ? Math.max(1, Number(customAmount) || 10)
    : depositAmount;

  // Dynamic bonus calculation based on real system settings
  const bonusAmount = Math.round((activeDeposit * bonusPercent) / 100);
  const totalPlayAmount = activeDeposit + bonusAmount;

  // Lock body scroll cleanly when modal is open for visitors who have not signed up
  useEffect(() => {
    if (isOpen && !isLoggedIn) {
      const origBodyOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = origBodyOverflow;
      };
    }
  }, [isOpen, isLoggedIn]);

  if (!isOpen || isLoggedIn) return null;

  const handleSelectPreset = (amt) => {
    setIsCustom(false);
    setDepositAmount(amt);
    setCustomAmount('');
  };

  const handleCustomChange = (e) => {
    const val = e.target.value.replace(/[^0-9]/g, '');
    setCustomAmount(val);
    setIsCustom(true);
  };

  const handleCtaClick = (e) => {
    e.preventDefault();
    if (isLoggedIn) {
      if (onGoToDeposit) {
        onGoToDeposit(activeDeposit);
      }
    } else {
      if (authMode === 'login') {
        if (onGoToLogin) {
          onGoToLogin(activeDeposit);
        } else if (onGoToRegister) {
          onGoToRegister(activeDeposit, 'login');
        }
      } else {
        if (onGoToRegister) {
          onGoToRegister(activeDeposit, 'register');
        }
      }
    }
    if (onClose) {
      onClose();
    }
  };

  return (
    <div
      className="bonus-modal-overlay"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="bonus-modal-title"
    >
      <div
        className="bonus-modal-card"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close Button */}
        <button
          type="button"
          onClick={onClose}
          className="bonus-modal-close-btn"
          aria-label="Close Bonus Modal"
        >
          <i className="fa-solid fa-xmark"></i>
        </button>

        {/* Ambient Top Glow */}
        <div className="bonus-modal-top-glow"></div>

        {/* Top Floating Badge */}
        <div className="bonus-badge-top">
          <span className="bonus-pulse-dot"></span>
          <i className="fa-solid fa-gift bonus-badge-icon"></i>
          <span>{isLoggedIn ? 'FIRST DEPOSIT BONUS READY' : 'REGISTRATION BONUS READY'}</span>
        </div>

        {/* Auth Option Toggle Bar for Guest Users */}
        {!isLoggedIn && (
          <div className="bonus-auth-toggle-row">
            <button
              type="button"
              className={`bonus-auth-toggle-btn ${authMode === 'register' ? 'active' : ''}`}
              onClick={() => setAuthMode('register')}
            >
              <i className="fa-solid fa-user-plus"></i> REGISTER NOW
            </button>
            <button
              type="button"
              className={`bonus-auth-toggle-btn ${authMode === 'login' ? 'active' : ''}`}
              onClick={() => setAuthMode('login')}
            >
              <i className="fa-solid fa-right-to-bracket"></i> LOGIN NOW
            </button>
          </div>
        )}

        {/* Hero 3D Gift Icon & Glow Header */}
        <div className="bonus-hero-header">
          <div className="bonus-gift-box-wrapper">
            <div className="bonus-gift-glow"></div>
            <div className="bonus-gift-box">
              <i className="fa-solid fa-gift"></i>
            </div>
            <div className="bonus-sparkle-1">✦</div>
            <div className="bonus-sparkle-2">✦</div>
          </div>

          <h2 className="bonus-main-title" id="bonus-modal-title">
            CONGRATS! YOUR{' '}
            <span className="bonus-highlight-gold">{bonusPercent}% SIGNUP BONUS</span>{' '}
            IS UNLOCKED
          </h2>

          <p className="bonus-subtitle">
            {isLoggedIn ? (
              <>
                Make your first deposit to get your <strong style={{ color: '#ffd700' }}>{bonusPercent}% Instant Match</strong>{' '}
                + <strong style={{ color: '#4ade80' }}>${freeplayAmount} Freeplay</strong>!
              </>
            ) : (
              <>
                {authMode === 'login' ? 'Log in to select your game & claim your deposit bonus!' : 'Sign up today to claim your bonus on your first deposit!'}
              </>
            )}
          </p>
        </div>

        {/* Interactive Calculation Card */}
        <div className="bonus-calc-card">
          <div className="bonus-calc-header">
            <div className="bonus-calc-icon-title">
              <div className="bonus-mini-gift">
                <i className="fa-solid fa-coins"></i>
              </div>
              <div>
                <h4 className="bonus-calc-title">CHOOSE DEPOSIT AMOUNT</h4>
                <p className="bonus-calc-desc">
                  Select your deposit amount to calculate your <strong>{bonusPercent}% Bonus</strong>.
                </p>
              </div>
            </div>
          </div>

          {/* Preset Deposit Selectors */}
          <div className="bonus-preset-row">
            <span className="bonus-preset-label">Select Deposit:</span>
            <div className="bonus-preset-buttons">
              {presets.map((amt) => (
                <button
                  key={amt}
                  type="button"
                  className={`bonus-preset-btn ${!isCustom && depositAmount === amt ? 'active' : ''}`}
                  onClick={() => handleSelectPreset(amt)}
                >
                  ${amt}
                </button>
              ))}
              <div className={`bonus-custom-input-wrap ${isCustom ? 'active' : ''}`}>
                <span className="bonus-custom-prefix">$</span>
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  placeholder="Custom"
                  value={customAmount}
                  onChange={handleCustomChange}
                  onFocus={() => setIsCustom(true)}
                  className="bonus-custom-input"
                  maxLength={5}
                  aria-label="Custom deposit amount"
                />
              </div>
            </div>
          </div>

          {/* Visual 3-Box Calculation Grid */}
          <div className="bonus-calc-grid">
            {/* Box 1: Your Deposit */}
            <div className="bonus-calc-step-box">
              <span className="bonus-step-label">YOUR DEPOSIT</span>
              <div className="bonus-step-value deposit-val">
                ${activeDeposit}
              </div>
            </div>

            {/* Plus Sign */}
            <div className="bonus-math-operator">+</div>

            {/* Box 2: Instant Bonus */}
            <div className="bonus-calc-step-box">
              <span className="bonus-step-label">BONUS ({bonusPercent}%)</span>
              <div className="bonus-step-value bonus-val">
                +${bonusAmount}
              </div>
            </div>

            {/* Equal Sign */}
            <div className="bonus-math-operator">=</div>

            {/* Box 3: Total Play Balance */}
            <div className="bonus-calc-step-box total-box">
              <span className="bonus-step-label total-label">YOUR PLAY WITH</span>
              <div className="bonus-step-value total-val">
                ${totalPlayAmount}
              </div>
            </div>
          </div>

          {/* Freeplay Alert Strip */}
          <div className="bonus-freeplay-strip">
            <span className="freeplay-live-dot"></span>
            <span>
              <strong>${freeplayAmount} Freeplay</strong> is available immediately after registration
            </span>
          </div>

          {/* Main CTA Deposit / Register / Login Button */}
          <button
            type="button"
            onClick={handleCtaClick}
            className="bonus-deposit-cta-btn"
            id="bonus-deposit-cta"
          >
            <span className="cta-icon">🚀</span>
            <span className="cta-text">
              {isLoggedIn
                ? `DEPOSIT $${activeDeposit} & CHOOSE GAME`
                : authMode === 'login'
                ? `LOGIN NOW & DEPOSIT $${activeDeposit}`
                : `REGISTER NOW & CLAIM BONUS`}
            </span>
            <i className="fa-solid fa-arrow-right cta-arrow"></i>
          </button>

          {/* Mode Switch Helper Link */}
          {!isLoggedIn && (
            <div className="bonus-auth-switch-note" style={{ marginTop: '0.65rem', fontSize: '0.85rem', color: 'rgba(255,255,255,0.7)' }}>
              {authMode === 'register' ? (
                <span onClick={() => setAuthMode('login')} style={{ cursor: 'pointer' }}>
                  Already have an account? <strong style={{ color: '#ffd700', textDecoration: 'underline' }}>Login Now &rarr;</strong>
                </span>
              ) : (
                <span onClick={() => setAuthMode('register')} style={{ cursor: 'pointer' }}>
                  Don't have an account yet? <strong style={{ color: '#ffd700', textDecoration: 'underline' }}>Register Now &rarr;</strong>
                </span>
              )}
            </div>
          )}

          {/* Trust Badges */}
          <div className="bonus-trust-badges">
            <div className="bonus-trust-pill">
              <i className="fa-solid fa-bolt" style={{ color: '#ffd700' }}></i>
              <span>Instant Load</span>
            </div>
            <div className="bonus-trust-pill">
              <i className="fa-solid fa-shield-halved" style={{ color: '#22c55e' }}></i>
              <span>Secure Deposit</span>
            </div>
            <div className="bonus-trust-pill">
              <i className="fa-solid fa-headset" style={{ color: '#38bdf8' }}></i>
              <span>24/7 Support</span>
            </div>
          </div>

          {/* Footer Guidance */}
          <p className="bonus-footer-note">
            Choose your deposit amount, select your favorite game, and activate your signup bonus.
          </p>
        </div>
      </div>
    </div>
  );
}
