'use client';

import React, { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { useGoogleLogin } from '@react-oauth/google';
import { motion, AnimatePresence } from 'framer-motion';
import { shouldShowInfoOnAuth } from '../lib/infoPage';
import { trackCompleteRegistration } from '../lib/metaPixel';
import { getDevicePayload } from '../lib/deviceId';
import SignupBonusModal from './SignupBonusCard';
import { DeviceAlertModal } from './Modals';

const DEFAULT_LOGIN_BG = '/jackpot_royals_bg.png';

/** Safe CSS url() — data: base64 must be quoted or mobile background silently fails. */
function cssBgUrl(raw) {
  const src = String(raw || DEFAULT_LOGIN_BG).trim() || DEFAULT_LOGIN_BG;
  const escaped = src.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  return `url("${escaped}")`;
}

function isNativeApp() {
  if (typeof window === 'undefined') return false;
  return (
    window.Capacitor?.isNativePlatform?.() === true ||
    /JackpotRoyalsNative/i.test(navigator.userAgent || '')
  );
}

async function loginWithGoogleProfile(accessToken) {
  const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  const profile = await res.json();
  if (!profile.email) {
    throw new Error('Failed to fetch email profile from Google.');
  }

  const { deviceId, deviceFingerprint, hardwareFingerprint } = getDevicePayload();

  const googleRes = await fetch('/api/auth/google', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: String(profile.email).toLowerCase(),
      name: profile.name || 'Google Player',
      referredBy: localStorage.getItem('jackpot_ref_code') || '',
      distributorId: localStorage.getItem('jackpot_distributor_id') || '',
      agentCode: localStorage.getItem('jackpot_agent_code') || '',
      campaign: localStorage.getItem('jackpot_campaign') || '',
      deviceId,
      deviceFingerprint,
      hardwareFingerprint
    })
  });
  const googleData = await googleRes.json();
  if (!googleRes.ok || !googleData.success) {
    const error = new Error(googleData.message || 'Google registration/login failed on server.');
    error.existingEmail = googleData.existingEmail;
    error.deviceRegistered = googleData.deviceRegistered;
    throw error;
  }
  return googleData;
}

export default function AuthPortal({
  onLoginSuccess,
  onRegisterSuccess,
  onGoogleWarning,
  triggerLoading,
  showToast,
  onOpenSupport,
  supportUnread = false,
  frontendSettings = {}
}) {
  const googleClientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || 'your_google_client_id_here';
  const loginBgUrl = frontendSettings.loginBgUrl || DEFAULT_LOGIN_BG;
  const loginBgCss = cssBgUrl(loginBgUrl);
  const showInfoLinks = shouldShowInfoOnAuth(frontendSettings);

  // Detect Facebook/Messenger In-App WebView
  const isMessengerWebView = () => {
    if (typeof window === 'undefined') return false;
    const ua = navigator.userAgent || navigator.vendor || window.opera;
    return (ua.indexOf("FBAN") > -1) || (ua.indexOf("FBAV") > -1) || (ua.indexOf("Messenger") > -1);
  };

  const finishGoogleLogin = (googleData) => {
    if (googleData.user?.email) {
      try {
        localStorage.setItem('jackpot_last_email', googleData.user.email.toLowerCase().trim());
      } catch (_) {}
    }
    if (googleData.isNewUser) {
      trackCompleteRegistration('google');
      showToast(`Google account registered! Welcome, ${googleData.user?.name || 'Player'}.`, 'success');
    } else {
      showToast(`Welcome back, ${googleData.user?.name || 'Player'}!`, 'success');
    }
    onLoginSuccess(googleData.user);
  };

  // Google OAuth Authentication login hook (browser popup flow)
  const loginWithGoogle = useGoogleLogin({
    onSuccess: async (tokenResponse) => {
      triggerLoading(1500, async () => {
        try {
          const googleData = await loginWithGoogleProfile(tokenResponse.access_token);
          setDeviceLockError('');
          finishGoogleLogin(googleData);
        } catch (err) {
          console.error('Google Login Error:', err);
          if (err.deviceRegistered || (err.message && err.message.toLowerCase().includes('device'))) {
            const foundEmail = err.existingEmail || localStorage.getItem('jackpot_last_email') || '';
            if (foundEmail) setExistingAccountEmail(foundEmail);
            setDeviceLockError(err.message || 'You already have an account from this device.');
            setDeviceModalOpen(true);
          } else {
            showToast(err.message || 'Google Sign-In failed or was cancelled.', 'error');
          }
        }
      });
    },
    onError: (error) => {
      console.error('Google Login Error:', error);
      showToast('Google Sign-In failed or was cancelled.', 'error');
    }
  });

  const redeemGoogleTicket = async (ticket) => {
    const ticketRes = await fetch(`/api/auth/google/ticket?ticket=${encodeURIComponent(ticket)}`, {
      cache: 'no-store'
    });
    const ticketData = await ticketRes.json();
    if (!ticketRes.ok || !ticketData.success) {
      throw new Error(ticketData.message || 'Google login ticket expired.');
    }
    finishGoogleLogin(ticketData);
  };

  const googlePollRef = useRef(null);

  const openGoogleAuthUrl = async (url) => {
    // Prefer Browser plugin when present; otherwise navigate — Capacitor opens Google
    // in the system browser (not allowlisted) and keeps the app WebView on login.
    try {
      if (window.Capacitor?.isPluginAvailable?.('Browser')) {
        const { Browser } = await import('@capacitor/browser');
        await Browser.open({ url, presentationStyle: 'popover' });
        return;
      }
    } catch {
      // Older APKs without Browser plugin.
    }
    window.location.assign(url);
  };

  const startNativeGoogleLogin = async () => {
    if (googlePollRef.current) {
      window.clearInterval(googlePollRef.current);
      googlePollRef.current = null;
    }

    const sessionRes = await fetch('/api/auth/google/ticket', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: 'session' })
    });
    const sessionData = await sessionRes.json();
    if (!sessionRes.ok || !sessionData.sid) {
      throw new Error(sessionData.message || 'Could not start Google sign-in.');
    }

    const sid = sessionData.sid;
    const redirectUri = `${window.location.origin}/auth/google/callback`;
    const params = new URLSearchParams({
      client_id: googleClientId,
      redirect_uri: redirectUri,
      response_type: 'token',
      scope: 'openid email profile',
      include_granted_scopes: 'true',
      prompt: 'select_account',
      state: sid
    });

    showToast('Complete Google sign-in, then return to the app.', 'info');
    await openGoogleAuthUrl(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);

    const startedAt = Date.now();
    googlePollRef.current = window.setInterval(async () => {
      if (Date.now() - startedAt > 10 * 60 * 1000) {
        window.clearInterval(googlePollRef.current);
        googlePollRef.current = null;
        showToast('Google sign-in timed out. Please try again.', 'error');
        return;
      }

      try {
        const pollRes = await fetch(`/api/auth/google/ticket?sid=${encodeURIComponent(sid)}`, {
          cache: 'no-store'
        });
        const pollData = await pollRes.json();
        if (!pollRes.ok) {
          if (pollRes.status === 404) {
            window.clearInterval(googlePollRef.current);
            googlePollRef.current = null;
            showToast(pollData.message || 'Google sign-in expired.', 'error');
          }
          return;
        }
        if (pollData.status === 'ready' && pollData.user) {
          window.clearInterval(googlePollRef.current);
          googlePollRef.current = null;
          try {
            if (window.Capacitor?.isPluginAvailable?.('Browser')) {
              const { Browser } = await import('@capacitor/browser');
              await Browser.close();
            }
          } catch {
            // Older APKs / already-closed browser.
          }
          triggerLoading(1000, () => finishGoogleLogin(pollData));
        }
      } catch (err) {
        console.error('Google session poll failed:', err);
      }
    }, 1500);
  };

  const handleGoogleClick = () => {
    if (isMessengerWebView()) {
      onGoogleWarning();
      return;
    }

    if (googleClientId === 'your_google_client_id_here' || !googleClientId) {
      // Run Simulator Fallback
      showToast('Google OAuth Simulator triggered (Client ID not configured in .env.local).', 'info');
      triggerLoading(1200, async () => {
        try {
          const googleRes = await fetch('/api/auth/google', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              email: 'google-player@test.com',
              name: 'Google Demo Player',
              referredBy: localStorage.getItem('jackpot_ref_code') || '',
              distributorId: localStorage.getItem('jackpot_distributor_id') || '',
              agentCode: localStorage.getItem('jackpot_agent_code') || ''
            })
          });
          const googleData = await googleRes.json();
          if (googleData.success) {
            onLoginSuccess(googleData.user);
          }
        } catch (err) {
          console.error('Google Simulator save failed:', err);
        }
      });
      return;
    }

    if (isNativeApp()) {
      startNativeGoogleLogin().catch((err) => {
        console.error('Native Google login failed:', err);
        showToast(err.message || 'Could not open Google sign-in.', 'error');
      });
      return;
    }

    loginWithGoogle();
  };

  // Query ticket return (web fallback) — no APK update required
  useEffect(() => {
    const fromQuery = new URLSearchParams(window.location.search).get('google_ticket');
    if (!fromQuery) return;
    const cleanUrl = window.location.pathname;
    window.history.replaceState({}, '', cleanUrl);
    triggerLoading(1200, async () => {
      try {
        await redeemGoogleTicket(fromQuery);
      } catch (err) {
        showToast(err.message || 'Could not finish Google sign-in.', 'error');
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    return () => {
      if (googlePollRef.current) {
        window.clearInterval(googlePollRef.current);
        googlePollRef.current = null;
      }
    };
  }, []);

  const [activeTab, setActiveTab] = useState('login'); // 'login' | 'register' | 'forgot' | 'otp'
  const [showPassword, setShowPassword] = useState(false);
  const [bonusModalOpen, setBonusModalOpen] = useState(true);
  const [deviceModalOpen, setDeviceModalOpen] = useState(false);
  const [existingAccountEmail, setExistingAccountEmail] = useState('');

  // Preload saved email if previously remembered
  useEffect(() => {
    try {
      const savedEmail = localStorage.getItem('jackpot_last_email');
      if (savedEmail) {
        setExistingAccountEmail(savedEmail);
      }
    } catch (_) {}
  }, []);

  // Sync activeTab state changes to browser URL pathnames
  useEffect(() => {
    const validPaths = {
      login: '/login',
      register: '/register',
      forgot: '/forgot',
      forgot_reset: '/forgot',
      otp: '/login'
    };
    const newPath = validPaths[activeTab] || '/login';
    if (typeof window !== 'undefined' && window.location.pathname !== newPath) {
      window.history.pushState({}, '', newPath);
    }
  }, [activeTab]);

  // Sync browser back/forward buttons (popstate) to activeTab state
  useEffect(() => {
    const handlePathChange = () => {
      const path = window.location.pathname;
      if (path === '/register') {
        setActiveTab('register');
      } else if (path === '/forgot') {
        setActiveTab('forgot');
      } else if (path === '/login') {
        setActiveTab('login');
      }
    };
    window.addEventListener('popstate', handlePathChange);
    handlePathChange(); // Sync initial view on mount
    return () => window.removeEventListener('popstate', handlePathChange);
  }, []);

  // Form Fields
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [regName, setRegName] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [forgotEmail, setForgotEmail] = useState('');
  const [otpValues, setOtpValues] = useState(['', '', '', '', '', '']);

  // Error Hooks
  const [errors, setErrors] = useState({});
  const [deviceLockError, setDeviceLockError] = useState('');

  // OTP Countdown States
  const [countdown, setCountdown] = useState(30);
  const [resendDisabled, setResendDisabled] = useState(true);
  const [activeOtpCode, setActiveOtpCode] = useState(null);
  const [pendingUserData, setPendingUserData] = useState(null);
  const [newResetPassword, setNewResetPassword] = useState('');
  const [isResettingPassword, setIsResettingPassword] = useState(false);

  const handlePasswordResetSubmit = async (e) => {
    e.preventDefault();
    if (newResetPassword.length < 8) {
      setErrors({ resetPassword: 'Password must be at least 8 characters long' });
      return;
    }
    setErrors({ resetPassword: '' });
    setIsResettingPassword(true);

    try {
      const response = await fetch('/api/auth/register', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: pendingUserData.recoveryEmail,
          newPassword: newResetPassword
        })
      });
      const data = await response.json();
      if (data.success) {
        showToast('Password reset successfully! Log in now.', 'success');
        setNewResetPassword('');
        setPendingUserData(null);
        switchTab('login');
      } else {
        setErrors({ resetPassword: data.message || 'Failed to reset password.' });
      }
    } catch (err) {
      console.error(err);
      setErrors({ resetPassword: 'Network error resetting password.' });
    } finally {
      setIsResettingPassword(false);
    }
  };

  // References for OTP boxes chaining
  const otpRefs = [useRef(null), useRef(null), useRef(null), useRef(null), useRef(null), useRef(null)];

  // Clear verification styles on field inputs
  const handleInputChange = (field, val, setter) => {
    setter(val);
    if (errors[field]) {
      setErrors((prev) => ({ ...prev, [field]: '' }));
    }
  };

  const emailPattern = /^[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,6}$/;

  // Validation Actions
  const validateEmail = (email, fieldName) => {
    if (email.trim() === '') {
      return `${fieldName} is required`;
    }
    if (!emailPattern.test(email.trim())) {
      return 'Please enter a valid email format';
    }
    return '';
  };

  // OTP timer effect
  useEffect(() => {
    let timer;
    if (activeTab === 'otp' && countdown > 0) {
      setResendDisabled(true);
      timer = setInterval(() => {
        setCountdown((prev) => prev - 1);
      }, 1000);
    } else if (countdown === 0) {
      setResendDisabled(false);
    }
    return () => clearInterval(timer);
  }, [activeTab, countdown]);

  // Generate OTP and dispatch via real SMTP or simulator fallback
  const triggerDemoOtpCode = async (userData) => {
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    setActiveOtpCode(code);
    if (process.env.NODE_ENV !== 'production') {
      // Dev-only helper so local testing works without email; never shown to users.
      console.log(`[DEV] Verification code: ${code}`);
    }

    const targetEmail = userData?.email || userData?.recoveryEmail;
    const targetName = userData?.name || 'Player';

    if (!targetEmail) {
      showToast('No email address found for verification.', 'error');
      return;
    }

    try {
      const response = await fetch('/api/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: targetEmail, otp: code, name: targetName })
      });
      const data = await response.json();

      if (data.success && !data.simulated) {
        showToast('Verification code sent to your email inbox!', 'success');
      } else if (data.success && data.simulated) {
        // Email service not configured (local dev only). Code is in the dev console.
        showToast('Email service is not configured yet. Please contact support.', 'error');
      } else {
        showToast(data.message || 'Could not send verification email. Please try again.', 'error');
      }
    } catch (err) {
      console.error('Mail dispatch network error:', err);
      showToast('Could not send verification email. Please check your connection and try again.', 'error');
    }
  };

  const startOtpFlow = (userData) => {
    setPendingUserData(userData);
    setActiveTab('otp');
    setCountdown(30);
    triggerDemoOtpCode(userData);
  };

  // Submit Login
  const handleLoginSubmit = async (e) => {
    e.preventDefault();
    const emailErr = validateEmail(loginEmail, 'Email address');
    const passErr = loginPassword.trim() === '' ? 'Password is required' : '';

    if (emailErr || passErr) {
      setErrors({ loginEmail: emailErr, loginPassword: passErr });
      return;
    }

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: loginEmail, password: loginPassword })
      });
      const data = await response.json();
      
      if (data.success) {
        try {
          localStorage.setItem('jackpot_last_email', loginEmail.trim().toLowerCase());
        } catch (_) {}
        triggerLoading(1500, () => {
          onLoginSuccess(data.user);
          setLoginEmail('');
          setLoginPassword('');
        });
      } else {
        setErrors({ loginPassword: data.message || 'Incorrect email or password' });
      }
    } catch (err) {
      console.error('Login submit error:', err);
      setErrors({ loginPassword: 'Connection error during login.' });
    }
  };

  // Submit Register (Fires OTP verification page)
  const handleRegisterSubmit = async (e) => {
    e.preventDefault();
    const nameErr = regName.trim() === '' ? 'Full Name is required' : '';
    const emailErr = validateEmail(regEmail, 'Email address');
    let passErr = regPassword.trim() === '' ? 'Password is required' : '';
    if (!passErr && regPassword.length < 8) {
      passErr = 'Password must be at least 8 characters long';
    }

    if (nameErr || emailErr || passErr) {
      setErrors({ regName: nameErr, regEmail: emailErr, regPassword: passErr });
      return;
    }

    try {
      const { deviceId, deviceFingerprint, hardwareFingerprint } = getDevicePayload();
      const checkRes = await fetch(`/api/auth/register?email=${encodeURIComponent(regEmail.trim())}&deviceId=${encodeURIComponent(deviceId)}&deviceFingerprint=${encodeURIComponent(deviceFingerprint)}&hardwareFingerprint=${encodeURIComponent(hardwareFingerprint || '')}`);
      const checkData = await checkRes.json();
      
      if (checkData.deviceRegistered) {
        const foundEmail = checkData.existingEmail || localStorage.getItem('jackpot_last_email') || '';
        if (foundEmail) {
          setExistingAccountEmail(foundEmail);
        }
        setDeviceLockError(checkData.message || 'You already have an account from this device.');
        setDeviceModalOpen(true);
        return;
      }

      if (checkData.success && checkData.exists) {
        setErrors({ regEmail: 'An account is already registered with this email' });
        return;
      }

      setDeviceLockError('');

      const newUser = {
        name: regName.trim(),
        email: regEmail.trim(),
        password: regPassword,
        role: 'user',
        referredBy: localStorage.getItem('jackpot_ref_code') || '',
        distributorId: localStorage.getItem('jackpot_distributor_id') || '',
        agentCode: localStorage.getItem('jackpot_agent_code') || '',
        campaign: localStorage.getItem('jackpot_campaign') || '',
        deviceId,
        deviceFingerprint,
        hardwareFingerprint
      };

      triggerLoading(1200, () => {
        startOtpFlow(newUser);
        showToast('Security code dispatched. Check the top info bar!', 'success');
      });
    } catch (err) {
      console.error('Registration email check error:', err);
      showToast('Connection error during registration check.', 'error');
    }
  };

  // Submit Forgot Password (Fires OTP verification page)
  const handleForgotSubmit = async (e) => {
    e.preventDefault();
    const emailErr = validateEmail(forgotEmail, 'Email address');

    if (emailErr) {
      setErrors({ forgotEmail: emailErr });
      return;
    }

    try {
      const response = await fetch(`/api/auth/register?email=${encodeURIComponent(forgotEmail.trim())}`);
      const data = await response.json();
      
      if (data.success && data.exists) {
        triggerLoading(1200, () => {
          startOtpFlow({
            recoveryEmail: forgotEmail.trim(),
            name: data.name,
            password: data.password
          });
          showToast('Password reset code dispatched. Check the top info bar!', 'success');
        });
      } else {
        setErrors({ forgotEmail: 'No account found with this email address' });
      }
    } catch (err) {
      console.error('Forgot password check error:', err);
      showToast('Connection error checking email account.', 'error');
    }
  };

  // Chaining OTP Input Fields
  const handleOtpInput = (val, index) => {
    const cleanVal = val.replace(/[^0-9]/g, '');
    const newOtp = [...otpValues];
    newOtp[index] = cleanVal;
    setOtpValues(newOtp);

    // Shift Focus
    if (cleanVal.length === 1 && index < 5) {
      otpRefs[index + 1].current.focus();
    }
  };

  const handleOtpKeyDown = (e, index) => {
    if (e.key === 'Backspace' && otpValues[index] === '' && index > 0) {
      const newOtp = [...otpValues];
      newOtp[index - 1] = '';
      setOtpValues(newOtp);
      otpRefs[index - 1].current.focus();
    }
  };

  // Submit OTP Verification Code
  const handleOtpVerify = (e) => {
    e.preventDefault();
    const code = otpValues.join('');
    
    if (code.length < 6) {
      setErrors({ otp: 'Please enter all 6 digits' });
      return;
    }

    setErrors({ otp: '' });

    triggerLoading(2000, () => {
      if (code === activeOtpCode) {
        if (pendingUserData && pendingUserData.recoveryEmail) {
          // Password Recovery Case - transition to password reset input tab!
          const email = pendingUserData.recoveryEmail;
          resetOtpState();
          setPendingUserData({ recoveryEmail: email });
          setActiveTab('forgot_reset');
        } else if (pendingUserData) {
          // Account Registration Case
          fetch('/api/auth/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(pendingUserData)
          })
          .then(res => res.json())
          .then(data => {
            if (data.success) {
              setDeviceLockError('');
              onRegisterSuccess(data.user);
              resetOtpState();
              resetFormFields();
            } else {
              if (data.message && data.message.toLowerCase().includes('device')) {
                setDeviceLockError(data.message);
                resetOtpState();
                switchTab('login');
                setDeviceModalOpen(true);
              } else {
                setErrors({ otp: data.message || 'Server error during registration.' });
              }
            }
          })
          .catch(err => {
            console.error('Registration fetch error:', err);
            setErrors({ otp: 'Connection error finalizing registration.' });
          });
        }
      } else {
        setErrors({ otp: 'Invalid verification code. Please check & try again.' });
        // Trigger shaking effects on container
        const otpContainer = document.querySelector('.otp-inputs-container');
        if (otpContainer) {
          otpContainer.style.animation = 'none';
          otpContainer.offsetHeight; // Reflow trigger
          otpContainer.style.animation = 'shake 0.4s ease';
        }
      }
    });
  };

  const resetOtpState = () => {
    setOtpValues(['', '', '', '', '', '']);
    setPendingUserData(null);
    setActiveOtpCode(null);
  };

  const resetFormFields = () => {
    setLoginEmail('');
    setLoginPassword('');
    setRegName('');
    setRegEmail('');
    setRegPassword('');
    setForgotEmail('');
    setNewResetPassword('');
    setErrors({});
  };

  const handleResendOtp = () => {
    triggerLoading(1000, () => {
      setCountdown(30);
      triggerDemoOtpCode();
      showToast('A new verification code has been dispatched to your email.', 'success');
    });
  };

  const switchTab = (tab) => {
    setErrors({});
    setActiveTab(tab);
    resetOtpState();
  };

  const handleGoToRegister = (depositAmt, targetMode = 'register') => {
    if (depositAmt) {
      try {
        localStorage.setItem('jackpot_pending_deposit_amount', String(depositAmt));
      } catch (e) {
        /* ignore */
      }
    }
    if (targetMode === 'login') {
      handleGoToExistingLogin();
      return;
    }
    switchTab('register');
    const bonusVal = frontendSettings?.firstDepositBonus || 300;
    showToast(`Create your free account below to claim your ${bonusVal}% bonus & deposit!`, 'success');
    setTimeout(() => {
      const regInput = document.getElementById('reg-name') || document.getElementById('auth-card');
      if (regInput) {
        regInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
        regInput.focus?.();
      }
    }, 150);
  };

  const handleGoToLoginFromBonus = (depositAmt) => {
    if (depositAmt) {
      try {
        localStorage.setItem('jackpot_pending_deposit_amount', String(depositAmt));
      } catch (e) {
        /* ignore */
      }
    }
    switchTab('login');
    showToast('Log in to choose your game and complete your deposit!', 'info');
    setTimeout(() => {
      const emailInput = document.getElementById('login-email') || document.getElementById('auth-card');
      if (emailInput) {
        emailInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
        emailInput.focus?.();
      }
    }, 150);
  };

  const handleGoToExistingLogin = (emailToFill) => {
    switchTab('login');
    const targetEmail = emailToFill || existingAccountEmail || localStorage.getItem('jackpot_last_email') || '';
    if (targetEmail) {
      setLoginEmail(targetEmail);
    }
    setTimeout(() => {
      const passInput = document.getElementById('login-password');
      if (passInput) {
        passInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
        passInput.focus?.();
      } else {
        const emailInput = document.getElementById('login-email');
        if (emailInput) {
          emailInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
          emailInput.focus?.();
        }
      }
    }, 150);
  };

  return (
    <div
      className="auth-page-wrapper"
      style={{ '--auth-login-bg': loginBgCss }}
    >
      {/* Mobile full-bleed background (data URLs work more reliably on a real element) */}
      <div className="auth-mobile-bg" aria-hidden="true" style={{ backgroundImage: loginBgCss }} />

      {/* Left Graphic Panel (Desktop only) */}
      <div className="auth-graphic-panel" style={{ backgroundImage: loginBgCss, backgroundSize: 'cover', backgroundPosition: 'center center', backgroundRepeat: 'no-repeat' }}></div>

      {/* Right Form Panel */}
      <div className="auth-form-panel">
        {/* Top welcome banner */}
        <div className="header-banner">
          <div className="banner-text">
            <div className="banner-subtitle">{frontendSettings.landingWelcome || 'WELCOME TO JACKPOT ROYALS'}</div>
            <div className="banner-desc">{frontendSettings.landingGrab || 'Grab amazing bonuses and win big!'}</div>
          </div>
          <div className="header-banner-actions">
            {showInfoLinks && (
              <Link href="/info" className="home-info-chip" aria-label="Official channels and contact">
                <i className="fa-solid fa-circle-info" aria-hidden="true" />
                <span>Info</span>
              </Link>
            )}
            <div className="banner-logo-container animate-float">
              <img src="/jackpot_royals_logo.png" alt="Jackpot Royals Logo" className="banner-logo" />
              <div className="logo-glow"></div>
            </div>
          </div>
        </div>

        {/* Big logo/brand title */}
        <div className="brand-title-container">
          <h2 className="brand-title">
            <span className="brand-text-1">JACKPOT</span>
            <span className="brand-text-2">ROYALS</span>
          </h2>
        </div>

        {/* Auth Card wrapper */}
        <article className="auth-card" id="auth-card">
          <div className="glow-border-layer"></div>

          <div className="auth-panels">
            <AnimatePresence mode="wait">
              {activeTab === 'login' && (
                <motion.section
                  key="login"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ duration: 0.2, ease: 'easeOut' }}
                  className="auth-panel active"
                  aria-labelledby="login-header"
                >
                  <h3 className="sr-only" id="login-header">Login Account</h3>
                  
                  {deviceLockError && (
                    <div className="device-lock-banner" role="alert">
                      <div className="device-lock-banner-inner">
                        <p className="device-lock-title">Please fix the errors below:</p>
                        <p className="device-lock-desc">{deviceLockError}</p>
                      </div>
                    </div>
                  )}

                  <button type="button" className="google-auth-btn" onClick={handleGoogleClick}>
                    <svg className="google-svg" viewBox="0 0 24 24" width="20" height="20" xmlns="http://www.w3.org/2000/svg">
                      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" fill="#FBBC05"/>
                      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" fill="#EA4335"/>
                    </svg>
                    <span>{frontendSettings.landingLoginWithGoogle || 'Continue with Google'}</span>
                  </button>
                  
                  <p className="messenger-warning">
                    <i className="fa-solid fa-circle-exclamation"></i> {frontendSettings.landingMessengerWarning || 'Google sign-in is not supported inside Messenger. Please open this page in Chrome or Safari.'}
                  </p>

                  <div className="divider">
                    <span>{frontendSettings.landingOrLogin || 'or login with email'}</span>
                  </div>

                  <form onSubmit={handleLoginSubmit} noValidate>
                    <div className="input-group">
                      <label htmlFor="login-email">Email Address</label>
                      <div className="input-wrapper">
                        <i className="fa-solid fa-envelope input-icon"></i>
                        <input
                          type="email"
                          id="login-email"
                          placeholder="example@email.com"
                          value={loginEmail}
                          onChange={(e) => handleInputChange('loginEmail', e.target.value, setLoginEmail)}
                          required
                        />
                      </div>
                      <span className="error-msg">{errors.loginEmail}</span>
                    </div>

                    <div className="input-group">
                      <div className="label-row">
                        <label htmlFor="login-password">Password</label>
                      </div>
                      <div className="input-wrapper">
                        <i className="fa-solid fa-lock input-icon"></i>
                        <input
                          type={showPassword ? 'text' : 'password'}
                          id="login-password"
                          placeholder="••••••••"
                          value={loginPassword}
                          onChange={(e) => handleInputChange('loginPassword', e.target.value, setLoginPassword)}
                          required
                        />
                        <button
                          type="button"
                          className="toggle-password"
                          onClick={() => setShowPassword(!showPassword)}
                          aria-label="Toggle Password Visibility"
                        >
                          <i className={`fa-solid ${showPassword ? 'fa-eye' : 'fa-eye-slash'}`}></i>
                        </button>
                      </div>
                      <span className="error-msg">{errors.loginPassword}</span>
                    </div>

                    <button type="submit" className="submit-btn slanted-green-btn">
                      <span className="btn-inner">LOGIN</span>
                      <div className="btn-glow"></div>
                    </button>
                  </form>

                  <div className="bottom-action-buttons">
                    <button type="button" className="slanted-action-btn register-btn" onClick={() => switchTab('register')}>
                      <span className="btn-inner">REGISTER</span>
                    </button>
                    <button type="button" className="slanted-action-btn forgot-btn" onClick={() => switchTab('forgot')}>
                      <span className="btn-inner">FORGOT</span>
                    </button>
                  </div>
                </motion.section>
              )}

              {/* ==========================================
                   2) REGISTER PANEL
                   ========================================== */}
              {activeTab === 'register' && (
                <motion.section
                  key="register"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ duration: 0.2, ease: 'easeOut' }}
                  className="auth-panel active"
                  aria-labelledby="register-header"
                >
                  <h3 className="panel-heading" id="register-header">{frontendSettings.landingQuickSignup || 'Quick signup'}</h3>
                  
                  {deviceLockError && (
                    <div className="device-lock-banner" role="alert">
                      <div className="device-lock-banner-inner">
                        <p className="device-lock-title">Please fix the errors below:</p>
                        <p className="device-lock-desc">{deviceLockError}</p>
                      </div>
                    </div>
                  )}

                  <button type="button" className="google-auth-btn" onClick={handleGoogleClick}>
                    <svg className="google-svg" viewBox="0 0 24 24" width="20" height="20" xmlns="http://www.w3.org/2000/svg">
                      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" fill="#FBBC05"/>
                      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" fill="#EA4335"/>
                    </svg>
                    <span>{frontendSettings.landingSignupWithGoogle || 'Sign up with Google'}</span>
                  </button>
                  
                  <p className="messenger-warning">
                    <i className="fa-solid fa-circle-exclamation"></i> {frontendSettings.landingMessengerWarning || 'Google sign-in is not supported inside Messenger. Please open this page in Chrome or Safari.'}
                  </p>

                  <div className="divider">
                    <span>{frontendSettings.landingOrCreate || 'or create account with email'}</span>
                  </div>

                  <form onSubmit={handleRegisterSubmit} noValidate>
                    <div className="input-group">
                      <label htmlFor="reg-name">Full Name</label>
                      <div className="input-wrapper">
                        <i className="fa-solid fa-user input-icon"></i>
                        <input
                          type="text"
                          id="reg-name"
                          placeholder="John Doe"
                          value={regName}
                          onChange={(e) => handleInputChange('regName', e.target.value, setRegName)}
                          required
                        />
                      </div>
                      <span className="error-msg">{errors.regName}</span>
                    </div>

                    <div className="input-group">
                      <label htmlFor="reg-email">Email Address</label>
                      <div className="input-wrapper">
                        <i className="fa-solid fa-envelope input-icon"></i>
                        <input
                          type="email"
                          id="reg-email"
                          placeholder="example@email.com"
                          value={regEmail}
                          onChange={(e) => handleInputChange('regEmail', e.target.value, setRegEmail)}
                          required
                        />
                      </div>
                      <span className="error-msg">{errors.regEmail}</span>
                    </div>

                    <div className="input-group">
                      <label htmlFor="reg-password">Password</label>
                      <div className="input-wrapper">
                        <i className="fa-solid fa-lock input-icon"></i>
                        <input
                          type={showPassword ? 'text' : 'password'}
                          id="reg-password"
                          placeholder="Min. 8 characters"
                          value={regPassword}
                          onChange={(e) => handleInputChange('regPassword', e.target.value, setRegPassword)}
                          required
                        />
                        <button
                          type="button"
                          className="toggle-password"
                          onClick={() => setShowPassword(!showPassword)}
                          aria-label="Toggle Password Visibility"
                        >
                          <i className={`fa-solid ${showPassword ? 'fa-eye' : 'fa-eye-slash'}`}></i>
                        </button>
                      </div>
                      <span className="error-msg">{errors.regPassword}</span>
                    </div>

                    <button type="submit" className="submit-btn slanted-green-btn">
                      <span className="btn-inner">SIGN UP</span>
                      <div className="btn-glow"></div>
                    </button>
                  </form>

                  <div className="bottom-action-buttons single-btn">
                    <button type="button" className="slanted-action-btn login-btn" onClick={() => switchTab('login')}>
                      <span className="btn-inner">LOGIN</span>
                    </button>
                  </div>
                </motion.section>
              )}

              {/* ==========================================
                   3) FORGOT PASSWORD PANEL
                   ========================================== */}
              {activeTab === 'forgot' && (
                <motion.section
                  key="forgot"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ duration: 0.2, ease: 'easeOut' }}
                  className="auth-panel active"
                  aria-labelledby="forgot-header"
                >
                  <h3 className="panel-heading" id="forgot-header">Reset Password</h3>
                  <p className="panel-description">
                    Enter your registered email below, and we will send you an OTP (One-Time Password) to reset your account.
                  </p>

                  <form onSubmit={handleForgotSubmit} noValidate>
                    <div className="input-group">
                      <label htmlFor="forgot-email">Email Address</label>
                      <div className="input-wrapper">
                        <i className="fa-solid fa-envelope input-icon"></i>
                        <input
                          type="email"
                          id="forgot-email"
                          placeholder="example@email.com"
                          value={forgotEmail}
                          onChange={(e) => handleInputChange('forgotEmail', e.target.value, setForgotEmail)}
                          required
                        />
                      </div>
                      <span className="error-msg">{errors.forgotEmail}</span>
                    </div>

                    <button type="submit" className="submit-btn slanted-green-btn">
                      <span className="btn-inner">SEND OTP</span>
                      <div className="btn-glow"></div>
                    </button>
                  </form>

                  <div className="bottom-action-buttons">
                    <button type="button" className="slanted-action-btn login-btn" onClick={() => switchTab('login')}>
                      <span className="btn-inner">LOGIN</span>
                    </button>
                    <button type="button" className="slanted-action-btn register-btn" onClick={() => switchTab('register')}>
                      <span className="btn-inner">REGISTER</span>
                    </button>
                  </div>
                </motion.section>
              )}

              {/* ==========================================
                   4) RESET PASSWORD FORM (FORGOT PASSWORD VERIFIED STATE)
                   ========================================== */}
              {activeTab === 'forgot_reset' && (
                <motion.section
                  key="forgot_reset"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ duration: 0.2, ease: 'easeOut' }}
                  className="auth-panel active"
                  aria-labelledby="reset-header"
                >
                  <h3 className="panel-heading" id="reset-header">Set New Password</h3>
                  <p className="panel-description">
                    Enter a new secure password for your account.
                  </p>

                  <form onSubmit={handlePasswordResetSubmit} noValidate>
                    <div className="input-group">
                      <label htmlFor="reset-pass">New Password</label>
                      <div className="input-wrapper">
                        <i className="fa-solid fa-lock input-icon"></i>
                        <input
                          type={showPassword ? 'text' : 'password'}
                          id="reset-pass"
                          placeholder="Min 8 characters"
                          value={newResetPassword}
                          onChange={(e) => setNewResetPassword(e.target.value)}
                          required
                        />
                        <button
                          type="button"
                          className="toggle-password"
                          onClick={() => setShowPassword(!showPassword)}
                          aria-label="Toggle Password Visibility"
                        >
                          <i className={`fa-solid ${showPassword ? 'fa-eye' : 'fa-eye-slash'}`}></i>
                        </button>
                      </div>
                      <span className="error-msg">{errors.resetPassword}</span>
                    </div>

                    <button type="submit" className="submit-btn slanted-green-btn" disabled={isResettingPassword}>
                      <span className="btn-inner">{isResettingPassword ? 'RESETTING...' : 'UPDATE PASSWORD'}</span>
                      <div className="btn-glow"></div>
                    </button>
                  </form>

                  <div className="bottom-action-buttons single-btn">
                    <button type="button" className="slanted-action-btn login-btn" onClick={() => switchTab('login')}>
                      <span className="btn-inner">CANCEL</span>
                    </button>
                  </div>
                </motion.section>
              )}

              {/* ==========================================
                   5) OTP VERIFICATION PANEL
                   ========================================== */}
              {activeTab === 'otp' && (
                <motion.section
                  key="otp"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ duration: 0.2, ease: 'easeOut' }}
                  className="auth-panel active"
                  aria-labelledby="otp-header"
                >
                  <h3 className="panel-heading" id="otp-header">Verify your email</h3>
                  <p className="panel-description">
                    We have sent a verification code to your email. Please enter the OTP below.
                  </p>
                  
                  <p className="messenger-warning otp-warning">
                    <i className="fa-solid fa-envelope-open-text"></i> OTP email may be delayed. If you don't receive it, please contact customer support.
                  </p>

                  <form onSubmit={handleOtpVerify} noValidate>
                    <div className="otp-inputs-container">
                      {otpValues.map((digit, idx) => (
                        <input
                          key={idx}
                          ref={otpRefs[idx]}
                          type="text"
                          maxLength={1}
                          className="otp-box"
                          aria-label={`OTP Digit ${idx + 1}`}
                          value={digit}
                          onChange={(e) => handleOtpInput(e.target.value, idx)}
                          onKeyDown={(e) => handleOtpKeyDown(e, idx)}
                          required
                          pattern="[0-9]"
                          inputMode="numeric"
                        />
                      ))}
                    </div>
                    <span className="error-msg text-center">{errors.otp}</span>

                    <button type="submit" className="submit-btn slanted-green-btn" id="otp-submit-btn">
                      <span className="btn-inner">VERIFY</span>
                      <div className="btn-glow"></div>
                    </button>
                  </form>

                  <div className="otp-timer-container">
                    <p>
                      Didn't receive code?{' '}
                      <button
                        type="button"
                        className="resend-btn"
                        onClick={handleResendOtp}
                        disabled={resendDisabled}
                      >
                        Resend OTP
                      </button>{' '}
                      {resendDisabled && <span className="countdown-timer">({countdown}s)</span>}
                    </p>
                  </div>

                  <div className="bottom-action-buttons single-btn">
                    <button type="button" className="slanted-action-btn login-btn" onClick={() => switchTab('login')}>
                      <span className="btn-inner">LOGIN</span>
                    </button>
                  </div>
                </motion.section>
              )}
            </AnimatePresence>
          </div>
        </article>

        {showInfoLinks && (
          <p className="auth-info-link-wrap">
            <Link href="/info" className="auth-info-link">
              <i className="fa-solid fa-circle-info" aria-hidden="true" />
              Official channels &amp; contact
            </Link>
          </p>
        )}

        {/* Floating Support Button FAB */}
        {onOpenSupport && (
          <button
            type="button"
            className={`support-fab${supportUnread ? ' support-fab--unread' : ''}`}
            onClick={onOpenSupport}
          >
            <i className="fa-solid fa-comment-dots"></i>
            <span>{supportUnread ? 'New msg' : 'Support'}</span>
            {supportUnread && <span className="support-unread-badge" aria-label="New support message">1</span>}
          </button>
        )}
      </div>

      {/* Floating Bonus Trigger Button (shown when modal is dismissed) */}
      {!bonusModalOpen && (
        <button
          type="button"
          className="auth-floating-bonus-trigger"
          onClick={() => setBonusModalOpen(true)}
          aria-label="Open Signup Bonus Offer"
        >
          <span className="floating-bonus-pulse"></span>
          <i className="fa-solid fa-gift"></i>
          <span>{frontendSettings.firstDepositBonus || 300}% BONUS</span>
        </button>
      )}

      {/* Floating Signup Bonus Modal */}
      <SignupBonusModal
        isOpen={bonusModalOpen}
        onClose={() => setBonusModalOpen(false)}
        frontendSettings={frontendSettings}
        onGoToRegister={handleGoToRegister}
        onGoToLogin={handleGoToLoginFromBonus}
      />

      {/* Centered Device Alert Modal (Replaces top toast error) */}
      <DeviceAlertModal
        isOpen={deviceModalOpen}
        onClose={() => setDeviceModalOpen(false)}
        message={deviceLockError}
        existingEmail={existingAccountEmail}
        onGoToLogin={handleGoToExistingLogin}
        onGoToForgot={() => switchTab('forgot')}
        onOpenSupport={onOpenSupport}
      />
    </div>
  );
}
