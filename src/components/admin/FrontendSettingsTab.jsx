'use client';

import React, { useState, useEffect } from 'react';
import useSWR from 'swr';
import { compressImageFile } from '../../lib/imageCompress';

const fetcher = (...args) => fetch(...args).then((res) => res.json());
const DEFAULT_LOGIN_BG = '/jackpot_royals_bg.png';
const DEFAULT_LOGO = '/jackpot_lion_mascot.png?v=2';

export default function FrontendSettingsTab({ adminUser }) {
  const { data, error, mutate } = useSWR('/api/settings/frontend', fetcher);

  const [logoUrl, setLogoUrl] = useState('');
  const [loginBgUrl, setLoginBgUrl] = useState('');
  const [notificationSoundUrl, setNotificationSoundUrl] = useState('');
  const [withdrawNotice, setWithdrawNotice] = useState('');
  const [cashoutNotice, setCashoutNotice] = useState('');
  const [androidAppUrl, setAndroidAppUrl] = useState('/downloads/jackpot-royals.apk');
  const [iosAppUrl, setIosAppUrl] = useState('');
  const [getAppEnabled, setGetAppEnabled] = useState(false);
  const [chimeActive, setChimeActive] = useState(true);
  const [venmoActive, setVenmoActive] = useState(true);
  const [cashappActive, setCashappActive] = useState(true);

  // Rewards & limit configurations
  const [firstDepositBonus, setFirstDepositBonus] = useState(300);
  const [signupFreeplay, setSignupFreeplay] = useState(3);
  const [minimumDepositLimit, setMinimumDepositLimit] = useState(5);
  const [minimumWithdrawalLimit, setMinimumWithdrawalLimit] = useState(25);
  const [freeplayMinWithdraw, setFreeplayMinWithdraw] = useState(30);
  const [withdrawTier1Multiplier, setWithdrawTier1Multiplier] = useState(5);
  const [withdrawTier2Multiplier, setWithdrawTier2Multiplier] = useState(3);
  const [withdrawTier1MinDeposit, setWithdrawTier1MinDeposit] = useState(5);
  const [withdrawTier1MaxDeposit, setWithdrawTier1MaxDeposit] = useState(50);
  const [withdrawTier1Basis, setWithdrawTier1Basis] = useState('COINS');
  const [withdrawTier2Basis, setWithdrawTier2Basis] = useState('DEPOSIT');
  const [withdrawMultiplierBasis, setWithdrawMultiplierBasis] = useState('SIGNUP_ONLY_COINS');
  const [withdrawRequireGameScreenshot, setWithdrawRequireGameScreenshot] = useState(false);
  const [withdrawRequireTagQrScreenshot, setWithdrawRequireTagQrScreenshot] = useState(true);

  // Landing Page Texts
  const [landingWelcome, setLandingWelcome] = useState('');
  const [landingGrab, setLandingGrab] = useState('');
  const [landingQuickSignup, setLandingQuickSignup] = useState('');
  const [landingSignupWithGoogle, setLandingSignupWithGoogle] = useState('');
  const [landingOrCreate, setLandingOrCreate] = useState('');
  const [landingMessengerWarning, setLandingMessengerWarning] = useState('');

  // Lobby Home Page Texts
  const [lobbyHeroPromo, setLobbyHeroPromo] = useState('');
  const [lobbyHeroRegularPromo, setLobbyHeroRegularPromo] = useState('');
  const [lobbyTrustBadge1, setLobbyTrustBadge1] = useState('');
  const [lobbyTrustBadge2, setLobbyTrustBadge2] = useState('');
  const [lobbyTrustBadge3, setLobbyTrustBadge3] = useState('');
  const [lobbyFreeplayValue, setLobbyFreeplayValue] = useState('');
  const [lobbyFreeplayLabel, setLobbyFreeplayLabel] = useState('');
  const [lobbyFreeplayCondition, setLobbyFreeplayCondition] = useState('');
  const [lobbyBullet1Title, setLobbyBullet1Title] = useState('');
  const [lobbyBullet1Desc, setLobbyBullet1Desc] = useState('');
  const [lobbyBullet2Title, setLobbyBullet2Title] = useState('');
  const [lobbyBullet2Desc, setLobbyBullet2Desc] = useState('');
  const [lobbyBullet3Title, setLobbyBullet3Title] = useState('');
  const [lobbyBullet3Desc, setLobbyBullet3Desc] = useState('');
  const [lobbyFreeplayClaimBtn, setLobbyFreeplayClaimBtn] = useState('');
  const [lobbyHeroSideImage, setLobbyHeroSideImage] = useState('');
  const [lobbyHeroSideImageAlt, setLobbyHeroSideImageAlt] = useState('');
  const [lobbyHeroSideEnabled, setLobbyHeroSideEnabled] = useState(true);

  // Info / Contact page
  const [infoPageEnabled, setInfoPageEnabled] = useState(true);
  const [infoShowOnAuth, setInfoShowOnAuth] = useState(true);
  const [infoShowOnLobby, setInfoShowOnLobby] = useState(true);
  const [infoTagline, setInfoTagline] = useState('');
  const [infoLead, setInfoLead] = useState('');
  const [infoSupportNote, setInfoSupportNote] = useState('');
  const [infoInstagramEnabled, setInfoInstagramEnabled] = useState(true);
  const [infoInstagramLabel, setInfoInstagramLabel] = useState('');
  const [infoInstagramHandle, setInfoInstagramHandle] = useState('');
  const [infoInstagramUrl, setInfoInstagramUrl] = useState('');
  const [infoTelegramEnabled, setInfoTelegramEnabled] = useState(true);
  const [infoTelegramLabel, setInfoTelegramLabel] = useState('');
  const [infoTelegramHandle, setInfoTelegramHandle] = useState('');
  const [infoTelegramUrl, setInfoTelegramUrl] = useState('');
  const [infoFacebookEnabled, setInfoFacebookEnabled] = useState(true);
  const [infoFacebookLabel, setInfoFacebookLabel] = useState('');
  const [infoFacebookHandle, setInfoFacebookHandle] = useState('');
  const [infoFacebookUrl, setInfoFacebookUrl] = useState('');
  const [infoWhatsappEnabled, setInfoWhatsappEnabled] = useState(true);
  const [infoWhatsappLabel, setInfoWhatsappLabel] = useState('');
  const [infoWhatsappHandle, setInfoWhatsappHandle] = useState('');
  const [infoWhatsappUrl, setInfoWhatsappUrl] = useState('');
  const [infoEmailEnabled, setInfoEmailEnabled] = useState(true);
  const [infoEmailLabel, setInfoEmailLabel] = useState('');
  const [infoEmailHandle, setInfoEmailHandle] = useState('');
  const [infoEmailUrl, setInfoEmailUrl] = useState('');

  // Marquee Cards
  const [marqueePayouts, setMarqueePayouts] = useState([]);

  // Accordion cashout rules
  const [cashoutRules, setCashoutRules] = useState([]);
  const [proofScreenshots, setProofScreenshots] = useState([]);
  const [lobbyCashoutTrustItems, setLobbyCashoutTrustItems] = useState([
    { icon: 'fa-shield-halved', title: '100% SECURE', description: 'Your data is always protected' },
    { icon: 'fa-circle-check', title: 'FAIR PLAY', description: 'Provably fair and transparent' },
    { icon: 'fa-bolt', title: 'INSTANT WITHDRAWALS', description: 'Get your winnings instantly' },
    { icon: 'fa-headset', title: '24/7 SUPPORT', description: 'Always here to help you' }
  ]);
  
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Seed form state when SWR loaded
  useEffect(() => {
    if (data?.settings) {
      const s = data.settings;
      setLogoUrl(s.logoUrl || DEFAULT_LOGO);
      setLoginBgUrl(s.loginBgUrl || DEFAULT_LOGIN_BG);
      setNotificationSoundUrl(s.notificationSoundUrl || 'https://raw.githubusercontent.com/AUTOMATIC1111/stable-diffusion-webui/master/notification.mp3');
      setWithdrawNotice(s.withdrawNotice || 'Fastest Withdrawals inside 5 Minutes!');
      setCashoutNotice(s.cashoutNotice || 'Standard cashout processing hours: 9 AM - 11 PM EST');
      setAndroidAppUrl(s.androidAppUrl || '/downloads/jackpot-royals.apk');
      setIosAppUrl(s.iosAppUrl || '');
      setGetAppEnabled(s.getAppEnabled === true);
      setChimeActive(s.chimeActive !== false);
      setVenmoActive(s.venmoActive !== false);
      setCashappActive(s.cashappActive !== false);
      setFirstDepositBonus(s.firstDepositBonus !== undefined ? s.firstDepositBonus : 300);
      setSignupFreeplay(s.signupFreeplay !== undefined ? s.signupFreeplay : 3);
      setMinimumDepositLimit(s.minimumDepositLimit !== undefined ? s.minimumDepositLimit : 5);
      setMinimumWithdrawalLimit(s.minimumWithdrawalLimit !== undefined ? s.minimumWithdrawalLimit : (s.defaultMinWithdraw !== undefined ? s.defaultMinWithdraw : 25));
      setFreeplayMinWithdraw(s.freeplayMinWithdraw !== undefined ? s.freeplayMinWithdraw : 30);
      setWithdrawTier1Multiplier(s.withdrawTier1Multiplier !== undefined ? s.withdrawTier1Multiplier : 5);
      setWithdrawTier2Multiplier(s.withdrawTier2Multiplier !== undefined ? s.withdrawTier2Multiplier : 3);
      setWithdrawTier1MinDeposit(s.withdrawTier1MinDeposit !== undefined ? s.withdrawTier1MinDeposit : 5);
      setWithdrawTier1MaxDeposit(s.withdrawTier1MaxDeposit !== undefined ? s.withdrawTier1MaxDeposit : 50);
      setWithdrawTier1Basis(s.withdrawTier1Basis || 'COINS');
      setWithdrawTier2Basis(s.withdrawTier2Basis || 'DEPOSIT');
      setWithdrawMultiplierBasis(s.withdrawMultiplierBasis || 'SIGNUP_ONLY_COINS');
      setWithdrawRequireGameScreenshot(s.withdrawRequireGameScreenshot === true);
      setWithdrawRequireTagQrScreenshot(s.withdrawRequireTagQrScreenshot !== false);

      setLandingWelcome(s.landingWelcome || 'WELCOME TO JACKPOT ROYALS');
      setLandingGrab(s.landingGrab || 'Grab amazing bonuses and win big!');
      setLandingQuickSignup(s.landingQuickSignup || 'Quick signup');
      setLandingSignupWithGoogle(s.landingSignupWithGoogle || 'Sign up with Google');
      setLandingOrCreate(s.landingOrCreate || 'or create account with email');
      setLandingMessengerWarning(s.landingMessengerWarning || 'Google sign-in is not supported inside Messenger. Please open this page in Chrome or Safari.');

      setLobbyHeroPromo(s.lobbyHeroPromo || 'GET 300% SIGNUP BONUS ON YOUR FIRST DEPOSIT');
      setLobbyHeroRegularPromo(s.lobbyHeroRegularPromo || '');
      setLobbyTrustBadge1(s.lobbyTrustBadge1 || 'Instant Withdrawals');
      setLobbyTrustBadge2(s.lobbyTrustBadge2 || 'Secure & Safe');
      setLobbyTrustBadge3(s.lobbyTrustBadge3 || 'Trusted by 1B+ Players');
      setLobbyFreeplayValue(s.lobbyFreeplayValue || '$3');
      setLobbyFreeplayLabel(s.lobbyFreeplayLabel || 'FREEPLAY');
      setLobbyFreeplayCondition(s.lobbyFreeplayCondition || 'ON SIGNUP!');
      setLobbyBullet1Title(s.lobbyBullet1Title || 'PLAY');
      setLobbyBullet1Desc(s.lobbyBullet1Desc || 'Explore exciting games');
      setLobbyBullet2Title(s.lobbyBullet2Title || 'WIN');
      setLobbyBullet2Desc(s.lobbyBullet2Desc || 'Win real rewards');
      setLobbyBullet3Title(s.lobbyBullet3Title || 'CASH OUT');
      setLobbyBullet3Desc(s.lobbyBullet3Desc || 'Fast withdrawals');
      setLobbyFreeplayClaimBtn(s.lobbyFreeplayClaimBtn || 'CLAIM FREEPLAY NOW');
      setLobbyHeroSideImage(s.lobbyHeroSideImage || '/lobby-app-download-promo.png');
      setLobbyHeroSideImageAlt(s.lobbyHeroSideImageAlt || 'Download mobile app and get $3 freeplay');
      setLobbyHeroSideEnabled(s.lobbyHeroSideEnabled !== false);

      setInfoPageEnabled(s.infoPageEnabled !== false);
      setInfoShowOnAuth(s.infoShowOnAuth !== false);
      setInfoShowOnLobby(s.infoShowOnLobby !== false);
      setInfoTagline(s.infoTagline || 'PLAY SMARTER. CASHOUT FASTER.');
      setInfoLead(
        s.infoLead ||
          "Official channels for updates, community, and player support. Reach us anytime — we're here to help you win big."
      );
      setInfoSupportNote(
        s.infoSupportNote ||
          'For account help, deposits, or withdrawals, email support and our team will get back to you.'
      );
      setInfoInstagramEnabled(s.infoInstagramEnabled !== false);
      setInfoInstagramLabel(s.infoInstagramLabel || 'Instagram');
      setInfoInstagramHandle(s.infoInstagramHandle || '@jackpotroyals_casino');
      setInfoInstagramUrl(
        s.infoInstagramUrl ||
          'https://www.instagram.com/jackpotroyals_casino?igsh=dnZjNmNwdmNzazN6'
      );
      setInfoTelegramEnabled(s.infoTelegramEnabled !== false);
      setInfoTelegramLabel(s.infoTelegramLabel || 'Telegram');
      setInfoTelegramHandle(s.infoTelegramHandle || 't.me/Jackpotroyals_casino');
      setInfoTelegramUrl(s.infoTelegramUrl || 'https://t.me/Jackpotroyals_casino');
      setInfoFacebookEnabled(s.infoFacebookEnabled !== false);
      setInfoFacebookLabel(s.infoFacebookLabel || 'Facebook');
      setInfoFacebookHandle(s.infoFacebookHandle || 'Jackpot Royals');
      setInfoFacebookUrl(s.infoFacebookUrl || 'https://www.facebook.com/share/1KgG9SdC5N/');
      setInfoWhatsappEnabled(s.infoWhatsappEnabled !== false);
      setInfoWhatsappLabel(s.infoWhatsappLabel || 'WhatsApp');
      setInfoWhatsappHandle(s.infoWhatsappHandle || '+1 929 630 8553');
      setInfoWhatsappUrl(s.infoWhatsappUrl || 'https://wa.me/19296308553');
      setInfoEmailEnabled(s.infoEmailEnabled !== false);
      setInfoEmailLabel(s.infoEmailLabel || 'Email Support');
      setInfoEmailHandle(s.infoEmailHandle || 'support@jackpotroyals.com');
      setInfoEmailUrl(s.infoEmailUrl || 'mailto:support@jackpotroyals.com');

      setMarqueePayouts(s.marqueePayouts || []);
      setCashoutRules(s.cashoutRules || []);
      setProofScreenshots(s.proofScreenshots || []);
      setLobbyCashoutTrustItems(s.lobbyCashoutTrustItems || [
        { icon: 'fa-shield-halved', title: '100% SECURE', description: 'Your data is always protected' },
        { icon: 'fa-circle-check', title: 'FAIR PLAY', description: 'Provably fair and transparent' },
        { icon: 'fa-bolt', title: 'INSTANT WITHDRAWALS', description: 'Get your winnings instantly' },
        { icon: 'fa-headset', title: '24/7 SUPPORT', description: 'Always here to help you' }
      ]);
    }
  }, [data]);

  const handleAudioUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      alert('Audio file size must be less than 5MB.');
      e.target.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onloadend = () => {
      let result = reader.result;
      if (typeof result === 'string') {
        // Convert any video mime-types (like video/mpeg) to audio/mpeg
        result = result.replace(/^data:video\/[^;]+;/, 'data:audio/mpeg;');
      }
      setNotificationSoundUrl(result);
    };
    reader.readAsDataURL(file);
  };

  // Handlers for dynamic lists
  const addPayout = () => {
    setMarqueePayouts([...marqueePayouts, { name: 'Player Name', amount: '$100.00', time: 'Just now', color: 'av-purple', init: 'PL' }]);
  };
  const deletePayout = (idx) => {
    setMarqueePayouts(marqueePayouts.filter((_, i) => i !== idx));
  };
  const updatePayout = (idx, field, val) => {
    const updated = [...marqueePayouts];
    updated[idx] = { ...updated[idx], [field]: val };
    setMarqueePayouts(updated);
  };

  const addRule = () => {
    setCashoutRules([...cashoutRules, { title: 'New Cashout Rule', description: 'Describe the cashout rule terms here...' }]);
  };
  const deleteRule = (idx) => {
    setCashoutRules(cashoutRules.filter((_, i) => i !== idx));
  };
  const updateRule = (idx, field, val) => {
    const updated = [...cashoutRules];
    updated[idx] = { ...updated[idx], [field]: val };
    setCashoutRules(updated);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setIsSaving(true);
    setSaveSuccess(false);

    try {
      const payload = {
          logoUrl,
          loginBgUrl,
          notificationSoundUrl,
          withdrawNotice,
          cashoutNotice,
          androidAppUrl,
          iosAppUrl,
          getAppEnabled,
          chimeActive,
          venmoActive,
          cashappActive,
          firstDepositBonus: Number(firstDepositBonus),
          signupFreeplay: Number(signupFreeplay),
          minimumDepositLimit: Number(minimumDepositLimit),
          minimumWithdrawalLimit: Number(minimumWithdrawalLimit),
          defaultMinWithdraw: Number(minimumWithdrawalLimit),
          freeplayMinWithdraw: Number(freeplayMinWithdraw),
          withdrawTier1Multiplier: Number(withdrawTier1Multiplier),
          withdrawTier2Multiplier: Number(withdrawTier2Multiplier),
          withdrawTier1MinDeposit: Number(withdrawTier1MinDeposit),
          withdrawTier1MaxDeposit: Number(withdrawTier1MaxDeposit),
          withdrawTier1Basis,
          withdrawTier2Basis,
          withdrawMultiplierBasis,
          withdrawRequireGameScreenshot,
          withdrawRequireTagQrScreenshot,

          landingWelcome,
          landingGrab,
          landingQuickSignup,
          landingSignupWithGoogle,
          landingOrCreate,
          landingMessengerWarning,

          lobbyHeroPromo,
          lobbyHeroRegularPromo,
          lobbyTrustBadge1,
          lobbyTrustBadge2,
          lobbyTrustBadge3,
          lobbyFreeplayValue,
          lobbyFreeplayLabel,
          lobbyFreeplayCondition,
          lobbyBullet1Title,
          lobbyBullet1Desc,
          lobbyBullet2Title,
          lobbyBullet2Desc,
          lobbyBullet3Title,
          lobbyBullet3Desc,
          lobbyFreeplayClaimBtn,
          lobbyHeroSideImage,
          lobbyHeroSideImageAlt,
          lobbyHeroSideEnabled,

          infoPageEnabled,
          infoShowOnAuth,
          infoShowOnLobby,
          infoTagline,
          infoLead,
          infoSupportNote,
          infoInstagramEnabled,
          infoInstagramLabel,
          infoInstagramHandle,
          infoInstagramUrl,
          infoTelegramEnabled,
          infoTelegramLabel,
          infoTelegramHandle,
          infoTelegramUrl,
          infoFacebookEnabled,
          infoFacebookLabel,
          infoFacebookHandle,
          infoFacebookUrl,
          infoWhatsappEnabled,
          infoWhatsappLabel,
          infoWhatsappHandle,
          infoWhatsappUrl,
          infoEmailEnabled,
          infoEmailLabel,
          infoEmailHandle,
          infoEmailUrl,

          marqueePayouts,
          cashoutRules,
          proofScreenshots,
          lobbyCashoutTrustItems
      };

      const approxKb = Math.round(JSON.stringify(payload).length / 1024);
      if (approxKb > 12000) {
        alert(`Settings payload is too large (~${approxKb}KB). Use a smaller login/logo image, or click Use Default for the auth background.`);
        return;
      }

      const response = await fetch('/api/settings/frontend', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const raw = await response.text();
      let resData = null;
      try {
        resData = raw ? JSON.parse(raw) : null;
      } catch {
        resData = null;
      }

      if (response.ok && resData?.success) {
        setSaveSuccess(true);
        mutate();
        setTimeout(() => setSaveSuccess(false), 3000);
      } else if (response.status === 413) {
        alert('Image too large for the server (413). Upload a smaller image or raise nginx client_max_body_size.');
      } else {
        alert(resData?.message || `Failed to update frontend settings (${response.status}).`);
      }
    } catch (err) {
      console.error(err);
      alert(err?.message || 'Error updating frontend settings. Image may be too large — try a smaller file.');
    } finally {
      setIsSaving(false);
    }
  };

  const isLoading = !data && !error;

  return (
    <section className="admin-section-card" style={{ animation: 'fade-in 0.2s ease-out' }}>
      <div className="section-card-header" style={{ marginBottom: '1.5rem' }}>
        <h3>
          <i className="fa-solid fa-palette gold-text"></i> Player Frontend Settings CMS
        </h3>
        <p className="game-tap-tip" style={{ marginTop: '0.25rem' }}>
          Configure live layout variables, banners, logos, and payment gateway listings shown to players.
        </p>
      </div>

      {isLoading ? (
        <div style={{ textAlign: 'center', padding: '3rem' }}>
          <i className="fa-solid fa-spinner fa-spin" style={{ fontSize: '1.5rem', color: 'var(--gold-primary)' }}></i>
          <p style={{ marginTop: '0.5rem', opacity: 0.5 }}>Loading CMS configurations...</p>
        </div>
      ) : (
        <form onSubmit={handleSave} noValidate style={{ maxWidth: '750px' }}>
          
          {saveSuccess && (
            <div style={{ background: 'rgba(34,197,94,0.15)', border: '1px solid #22c55e', color: '#4ade80', padding: '0.75rem 1rem', borderRadius: '8px', marginBottom: '1.5rem', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <i className="fa-solid fa-circle-check"></i> Frontend settings saved and synced successfully!
            </div>
          )}

          <div style={{ background: '#0b0d16', padding: '1rem', borderRadius: '12px', border: '1px solid rgba(255,215,0,0.18)', marginBottom: '1.5rem' }}>
            <h4 style={{ fontSize: '0.8rem', color: '#fff', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '0.75rem' }}>
              Mobile App Download
            </h4>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.75rem', color: '#ddd', cursor: 'pointer', marginBottom: '0.85rem' }}>
              <input type="checkbox" checked={getAppEnabled} onChange={(e) => setGetAppEnabled(e.target.checked)} />
              Show &quot;Get App&quot; button in Lobby header
            </label>
            <div className="input-group" style={{ margin: 0 }}>
              <label>Android APK URL</label>
              <div className="input-wrapper" style={{ background: '#07090f' }}>
                <i className="fa-brands fa-android input-icon"></i>
                <input
                  type="text"
                  value={androidAppUrl}
                  onChange={(event) => setAndroidAppUrl(event.target.value)}
                  placeholder="/downloads/jackpot-royals.apk"
                />
              </div>
            </div>
            <div className="input-group" style={{ margin: '0.85rem 0 0' }}>
              <label>iOS Install URL (TestFlight public link)</label>
              <div className="input-wrapper" style={{ background: '#07090f' }}>
                <i className="fa-brands fa-apple input-icon"></i>
                <input
                  type="text"
                  value={iosAppUrl}
                  onChange={(event) => setIosAppUrl(event.target.value)}
                  placeholder="https://testflight.apple.com/join/XXXXXXXX"
                />
              </div>
              <span className="game-tap-tip" style={{ display: 'block', marginTop: '0.35rem' }}>
                After TestFlight is ready, paste the public join link here. Get App → iPhone will open it.
              </span>
            </div>
          </div>

          {/* Info / Contact page CMS */}
          <div style={{ background: '#0b0d16', padding: '1rem', borderRadius: '12px', border: '1px solid rgba(34,197,94,0.25)', marginBottom: '1.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', marginBottom: '0.85rem', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '0.55rem', flexWrap: 'wrap' }}>
              <h4 style={{ fontSize: '0.8rem', color: '#4ade80', textTransform: 'uppercase', letterSpacing: '1px', margin: 0 }}>
                Info Page &amp; Social Channels
              </h4>
              <a href="/info" target="_blank" rel="noopener noreferrer" style={{ fontSize: '0.7rem', color: 'var(--gold-primary)' }}>
                Open /info ↗
              </a>
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.85rem 1.25rem', marginBottom: '1rem' }}>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.75rem', color: '#ddd', cursor: 'pointer' }}>
                <input type="checkbox" checked={infoPageEnabled} onChange={(e) => setInfoPageEnabled(e.target.checked)} />
                Enable info page
              </label>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.75rem', color: '#ddd', cursor: 'pointer' }}>
                <input type="checkbox" checked={infoShowOnAuth} onChange={(e) => setInfoShowOnAuth(e.target.checked)} disabled={!infoPageEnabled} />
                Show Info button on Auth / Home
              </label>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.75rem', color: '#ddd', cursor: 'pointer' }}>
                <input type="checkbox" checked={infoShowOnLobby} onChange={(e) => setInfoShowOnLobby(e.target.checked)} disabled={!infoPageEnabled} />
                Show Info button in Lobby header
              </label>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem', marginBottom: '1rem' }}>
              <div className="input-group" style={{ margin: 0 }}>
                <label>Tagline</label>
                <div className="input-wrapper" style={{ background: '#07090f' }}>
                  <input type="text" value={infoTagline} onChange={(e) => setInfoTagline(e.target.value)} />
                </div>
              </div>
              <div className="input-group" style={{ margin: 0 }}>
                <label>Intro text</label>
                <textarea
                  value={infoLead}
                  onChange={(e) => setInfoLead(e.target.value)}
                  rows={3}
                  style={{ width: '100%', background: '#07090f', border: '1px solid rgba(255,255,255,0.08)', color: '#fff', borderRadius: '8px', padding: '0.65rem', fontSize: '0.8rem', resize: 'vertical' }}
                />
              </div>
              <div className="input-group" style={{ margin: 0 }}>
                <label>Support note</label>
                <textarea
                  value={infoSupportNote}
                  onChange={(e) => setInfoSupportNote(e.target.value)}
                  rows={2}
                  style={{ width: '100%', background: '#07090f', border: '1px solid rgba(255,255,255,0.08)', color: '#fff', borderRadius: '8px', padding: '0.65rem', fontSize: '0.8rem', resize: 'vertical' }}
                />
              </div>
            </div>

            {[
              {
                key: 'instagram',
                title: 'Instagram',
                enabled: infoInstagramEnabled,
                setEnabled: setInfoInstagramEnabled,
                label: infoInstagramLabel,
                setLabel: setInfoInstagramLabel,
                handle: infoInstagramHandle,
                setHandle: setInfoInstagramHandle,
                url: infoInstagramUrl,
                setUrl: setInfoInstagramUrl,
                icon: 'fa-brands fa-instagram'
              },
              {
                key: 'telegram',
                title: 'Telegram',
                enabled: infoTelegramEnabled,
                setEnabled: setInfoTelegramEnabled,
                label: infoTelegramLabel,
                setLabel: setInfoTelegramLabel,
                handle: infoTelegramHandle,
                setHandle: setInfoTelegramHandle,
                url: infoTelegramUrl,
                setUrl: setInfoTelegramUrl,
                icon: 'fa-brands fa-telegram'
              },
              {
                key: 'facebook',
                title: 'Facebook',
                enabled: infoFacebookEnabled,
                setEnabled: setInfoFacebookEnabled,
                label: infoFacebookLabel,
                setLabel: setInfoFacebookLabel,
                handle: infoFacebookHandle,
                setHandle: setInfoFacebookHandle,
                url: infoFacebookUrl,
                setUrl: setInfoFacebookUrl,
                icon: 'fa-brands fa-facebook'
              },
              {
                key: 'whatsapp',
                title: 'WhatsApp',
                enabled: infoWhatsappEnabled,
                setEnabled: setInfoWhatsappEnabled,
                label: infoWhatsappLabel,
                setLabel: setInfoWhatsappLabel,
                handle: infoWhatsappHandle,
                setHandle: setInfoWhatsappHandle,
                url: infoWhatsappUrl,
                setUrl: setInfoWhatsappUrl,
                icon: 'fa-brands fa-whatsapp'
              },
              {
                key: 'email',
                title: 'Email',
                enabled: infoEmailEnabled,
                setEnabled: setInfoEmailEnabled,
                label: infoEmailLabel,
                setLabel: setInfoEmailLabel,
                handle: infoEmailHandle,
                setHandle: setInfoEmailHandle,
                url: infoEmailUrl,
                setUrl: setInfoEmailUrl,
                icon: 'fa-solid fa-envelope'
              }
            ].map((channel) => (
              <div
                key={channel.key}
                style={{
                  background: '#07090f',
                  border: '1px solid rgba(255,255,255,0.06)',
                  borderRadius: '10px',
                  padding: '0.85rem',
                  marginBottom: '0.65rem'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', marginBottom: '0.65rem' }}>
                  <strong style={{ fontSize: '0.78rem', color: '#fff', display: 'inline-flex', alignItems: 'center', gap: '0.45rem' }}>
                    <i className={channel.icon} style={{ color: 'var(--gold-primary)' }} />
                    {channel.title}
                  </strong>
                  <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.72rem', color: '#bbb', cursor: 'pointer' }}>
                    <input type="checkbox" checked={channel.enabled} onChange={(e) => channel.setEnabled(e.target.checked)} />
                    Show
                  </label>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <div className="input-group" style={{ flex: 1, minWidth: '120px', margin: 0 }}>
                    <label>Label</label>
                    <input
                      type="text"
                      value={channel.label}
                      onChange={(e) => channel.setLabel(e.target.value)}
                      disabled={!channel.enabled}
                      style={{ width: '100%', background: '#0b0d16', border: '1px solid rgba(255,255,255,0.08)', color: '#fff', padding: '0.45rem', borderRadius: '6px', fontSize: '0.75rem' }}
                    />
                  </div>
                  <div className="input-group" style={{ flex: 1, minWidth: '140px', margin: 0 }}>
                    <label>Display text</label>
                    <input
                      type="text"
                      value={channel.handle}
                      onChange={(e) => channel.setHandle(e.target.value)}
                      disabled={!channel.enabled}
                      style={{ width: '100%', background: '#0b0d16', border: '1px solid rgba(255,255,255,0.08)', color: '#fff', padding: '0.45rem', borderRadius: '6px', fontSize: '0.75rem' }}
                    />
                  </div>
                  <div className="input-group" style={{ flex: 2, minWidth: '180px', margin: 0 }}>
                    <label>Link / URL</label>
                    <input
                      type="text"
                      value={channel.url}
                      onChange={(e) => channel.setUrl(e.target.value)}
                      disabled={!channel.enabled}
                      placeholder={channel.key === 'whatsapp' ? 'https://wa.me/19296308553' : ''}
                      style={{ width: '100%', background: '#0b0d16', border: '1px solid rgba(255,255,255,0.08)', color: '#fff', padding: '0.45rem', borderRadius: '6px', fontSize: '0.75rem' }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Lobby Homepage — matches live hero layout */}
          <div style={{ background: '#0b0d16', padding: '1rem', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)', marginBottom: '1.5rem' }}>
            <h4 style={{ fontSize: '0.8rem', color: '#fff', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '0.75rem', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '0.5rem' }}>
              Lobby Hero — Left Banner
            </h4>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <div className="input-group" style={{ margin: 0 }}>
                <label>Left Promo Headline (First Deposit / Signup)</label>
                <div className="input-wrapper" style={{ background: '#07090f' }}>
                  <i className="fa-solid fa-gift input-icon"></i>
                  <input type="text" value={lobbyHeroPromo} onChange={(e) => setLobbyHeroPromo(e.target.value)} required />
                </div>
                <span className="game-tap-tip">Shown to new players before their first deposit is approved.</span>
              </div>

              <div className="input-group" style={{ margin: 0 }}>
                <label>Left Promo Headline (After First Deposit / Regular Bonus)</label>
                <div className="input-wrapper" style={{ background: '#07090f' }}>
                  <i className="fa-solid fa-coins input-icon" style={{ color: '#ffd700' }}></i>
                  <input
                    type="text"
                    value={lobbyHeroRegularPromo}
                    placeholder="e.g. GET 20% BONUS ON EVERY DEPOSIT"
                    onChange={(e) => setLobbyHeroRegularPromo(e.target.value)}
                  />
                </div>
                <span className="game-tap-tip">Shown to players once their first deposit is approved. If left blank, automatically displays &quot;GET [regular bonus]% BONUS ON EVERY DEPOSIT&quot;.</span>
              </div>

              <div style={{ display: 'flex', gap: '0.5rem', width: '100%', flexWrap: 'wrap' }}>
                <div className="input-group" style={{ flex: 1, minWidth: '140px', margin: 0 }}>
                  <label>Trust Badge 1</label>
                  <div className="input-wrapper" style={{ background: '#07090f' }}>
                    <i className="fa-solid fa-shield-halved input-icon"></i>
                    <input type="text" value={lobbyTrustBadge1} onChange={(e) => setLobbyTrustBadge1(e.target.value)} required />
                  </div>
                </div>
                <div className="input-group" style={{ flex: 1, minWidth: '140px', margin: 0 }}>
                  <label>Trust Badge 2</label>
                  <div className="input-wrapper" style={{ background: '#07090f' }}>
                    <i className="fa-solid fa-lock input-icon"></i>
                    <input type="text" value={lobbyTrustBadge2} onChange={(e) => setLobbyTrustBadge2(e.target.value)} required />
                  </div>
                </div>
                <div className="input-group" style={{ flex: 1, minWidth: '140px', margin: 0 }}>
                  <label>Trust Badge 3</label>
                  <div className="input-wrapper" style={{ background: '#07090f' }}>
                    <i className="fa-solid fa-trophy input-icon"></i>
                    <input type="text" value={lobbyTrustBadge3} onChange={(e) => setLobbyTrustBadge3(e.target.value)} required />
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div style={{ background: '#0b0d16', padding: '1rem', borderRadius: '12px', border: '1px solid rgba(255,215,0,0.12)', marginBottom: '1.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', marginBottom: '0.75rem', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '0.5rem' }}>
              <h4 style={{ fontSize: '0.8rem', color: 'var(--gold-primary)', textTransform: 'uppercase', letterSpacing: '1px', margin: 0 }}>
                Lobby Hero — Right Side Flyer Card
              </h4>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45rem', fontSize: '0.72rem', color: '#ccc', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                <input
                  type="checkbox"
                  checked={lobbyHeroSideEnabled}
                  onChange={(e) => setLobbyHeroSideEnabled(e.target.checked)}
                />
                Show flyer layout
              </label>
            </div>

            <p style={{ fontSize: '0.7rem', color: '#888', margin: '0 0 0.85rem' }}>
              Ye wahi right-side card hai: upar flyer image, neeche freeplay amount + claim button. Flyer off ho to classic freeplay card (lion + bullets) show hoga.
            </p>

            <div className="panel-split-hero" style={{ gap: '1rem', alignItems: 'start' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                <div className="input-group" style={{ margin: 0 }}>
                  <label>Flyer / Promo Image</label>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => {
                      const file = e.target.files[0];
                      if (!file) return;
                      if (file.size > 3 * 1024 * 1024) {
                        alert('Image must be under 3MB.');
                        e.target.value = '';
                        return;
                      }
                      const reader = new FileReader();
                      reader.onloadend = () => setLobbyHeroSideImage(reader.result);
                      reader.readAsDataURL(file);
                    }}
                    style={{ color: '#888', fontSize: '0.75rem', marginBottom: '0.45rem' }}
                  />
                  <div className="input-wrapper" style={{ background: '#07090f', marginBottom: '0.45rem' }}>
                    <i className="fa-solid fa-link input-icon"></i>
                    <input
                      type="text"
                      value={lobbyHeroSideImage}
                      onChange={(e) => setLobbyHeroSideImage(e.target.value)}
                      placeholder="/lobby-app-download-promo.png or image URL"
                    />
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      onClick={() => setLobbyHeroSideImage('/lobby-app-download-promo.png')}
                      style={{ background: 'rgba(255,215,0,0.1)', border: '1px solid rgba(255,215,0,0.25)', color: '#ffe066', borderRadius: '6px', padding: '0.35rem 0.65rem', fontSize: '0.68rem', cursor: 'pointer' }}
                    >
                      Use default flyer
                    </button>
                    <button
                      type="button"
                      onClick={() => setLobbyHeroSideImage('')}
                      style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)', color: '#f87171', borderRadius: '6px', padding: '0.35rem 0.65rem', fontSize: '0.68rem', cursor: 'pointer' }}
                    >
                      Clear image
                    </button>
                  </div>
                </div>

                <div className="input-group" style={{ margin: 0 }}>
                  <label>Image Alt Text</label>
                  <div className="input-wrapper" style={{ background: '#07090f' }}>
                    <i className="fa-solid fa-image input-icon"></i>
                    <input type="text" value={lobbyHeroSideImageAlt} onChange={(e) => setLobbyHeroSideImageAlt(e.target.value)} placeholder="Download mobile app promotion" />
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '0.5rem', width: '100%', flexWrap: 'wrap' }}>
                  <div className="input-group" style={{ flex: 1, minWidth: '100px', margin: 0 }}>
                    <label>Freeplay Amount</label>
                    <div className="input-wrapper" style={{ background: '#07090f' }}>
                      <i className="fa-solid fa-dollar-sign input-icon"></i>
                      <input type="text" value={lobbyFreeplayValue} onChange={(e) => setLobbyFreeplayValue(e.target.value)} required />
                    </div>
                  </div>
                  <div className="input-group" style={{ flex: 1, minWidth: '100px', margin: 0 }}>
                    <label>Freeplay Label</label>
                    <div className="input-wrapper" style={{ background: '#07090f' }}>
                      <i className="fa-solid fa-tag input-icon"></i>
                      <input type="text" value={lobbyFreeplayLabel} onChange={(e) => setLobbyFreeplayLabel(e.target.value)} required />
                    </div>
                  </div>
                  <div className="input-group" style={{ flex: 1, minWidth: '100px', margin: 0 }}>
                    <label>Condition</label>
                    <div className="input-wrapper" style={{ background: '#07090f' }}>
                      <i className="fa-solid fa-circle-question input-icon"></i>
                      <input type="text" value={lobbyFreeplayCondition} onChange={(e) => setLobbyFreeplayCondition(e.target.value)} required />
                    </div>
                  </div>
                </div>

                <div className="input-group" style={{ margin: 0 }}>
                  <label>Claim Button Text</label>
                  <div className="input-wrapper" style={{ background: '#07090f' }}>
                    <i className="fa-solid fa-gift input-icon"></i>
                    <input type="text" value={lobbyFreeplayClaimBtn} onChange={(e) => setLobbyFreeplayClaimBtn(e.target.value)} required />
                  </div>
                </div>
              </div>

              <div style={{ background: '#07090f', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '12px', padding: '0.75rem' }}>
                <div style={{ fontSize: '0.65rem', color: '#888', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.55rem' }}>Live Preview</div>
                {lobbyHeroSideEnabled && lobbyHeroSideImage ? (
                  <div style={{ borderRadius: '12px', overflow: 'hidden', border: '1px solid rgba(255,215,0,0.18)', background: '#0a0c16' }}>
                    <img src={lobbyHeroSideImage} alt="Side flyer preview" style={{ width: '100%', aspectRatio: '16 / 10', objectFit: 'cover', display: 'block' }} />
                    <div style={{ padding: '0.75rem', background: 'linear-gradient(180deg, #0c0e18, #120a1c)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem', marginBottom: '0.65rem' }}>
                        <strong style={{ fontSize: '1.35rem', color: '#ffe066' }}>{lobbyFreeplayValue || '$3'}</strong>
                        <div>
                          <div style={{ fontSize: '0.72rem', color: '#fff', fontWeight: 700 }}>{lobbyFreeplayLabel || 'FREEPLAY'}</div>
                          <div style={{ fontSize: '0.62rem', color: '#ff6b9d', fontWeight: 700 }}>{lobbyFreeplayCondition || 'ON SIGNUP!'}</div>
                        </div>
                      </div>
                      <div style={{ background: 'linear-gradient(135deg, #a855f7, #ec4899)', color: '#fff', borderRadius: '8px', padding: '0.55rem', textAlign: 'center', fontSize: '0.68rem', fontWeight: 800 }}>
                        {lobbyFreeplayClaimBtn || 'CLAIM FREEPLAY NOW'}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div style={{ borderRadius: '12px', border: '1px dashed rgba(255,255,255,0.12)', padding: '1rem', textAlign: 'center', color: '#888', fontSize: '0.72rem' }}>
                    Flyer off / no image — lobby pe classic freeplay card (lion + bullets) show hoga.
                  </div>
                )}
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', padding: '0.75rem', background: 'rgba(255,255,255,0.02)', borderRadius: '8px', marginTop: '1rem' }}>
              <span style={{ fontSize: '0.725rem', color: 'var(--gold-primary)', fontWeight: 'bold' }}>Classic Freeplay Bullets (only when flyer is off / empty)</span>
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                <div className="input-group" style={{ flex: 1, minWidth: '110px', margin: 0 }}>
                  <label>Bullet 1 Title</label>
                  <input type="text" style={{ background: '#07090f', border: '1px solid rgba(255,255,255,0.08)', color: '#fff', padding: '0.4rem', borderRadius: '6px', fontSize: '0.75rem', width: '100%' }} value={lobbyBullet1Title} onChange={(e) => setLobbyBullet1Title(e.target.value)} required />
                </div>
                <div className="input-group" style={{ flex: 2, minWidth: '160px', margin: 0 }}>
                  <label>Bullet 1 Description</label>
                  <input type="text" style={{ background: '#07090f', border: '1px solid rgba(255,255,255,0.08)', color: '#fff', padding: '0.4rem', borderRadius: '6px', fontSize: '0.75rem', width: '100%' }} value={lobbyBullet1Desc} onChange={(e) => setLobbyBullet1Desc(e.target.value)} required />
                </div>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                <div className="input-group" style={{ flex: 1, minWidth: '110px', margin: 0 }}>
                  <label>Bullet 2 Title</label>
                  <input type="text" style={{ background: '#07090f', border: '1px solid rgba(255,255,255,0.08)', color: '#fff', padding: '0.4rem', borderRadius: '6px', fontSize: '0.75rem', width: '100%' }} value={lobbyBullet2Title} onChange={(e) => setLobbyBullet2Title(e.target.value)} required />
                </div>
                <div className="input-group" style={{ flex: 2, minWidth: '160px', margin: 0 }}>
                  <label>Bullet 2 Description</label>
                  <input type="text" style={{ background: '#07090f', border: '1px solid rgba(255,255,255,0.08)', color: '#fff', padding: '0.4rem', borderRadius: '6px', fontSize: '0.75rem', width: '100%' }} value={lobbyBullet2Desc} onChange={(e) => setLobbyBullet2Desc(e.target.value)} required />
                </div>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                <div className="input-group" style={{ flex: 1, minWidth: '110px', margin: 0 }}>
                  <label>Bullet 3 Title</label>
                  <input type="text" style={{ background: '#07090f', border: '1px solid rgba(255,255,255,0.08)', color: '#fff', padding: '0.4rem', borderRadius: '6px', fontSize: '0.75rem', width: '100%' }} value={lobbyBullet3Title} onChange={(e) => setLobbyBullet3Title(e.target.value)} required />
                </div>
                <div className="input-group" style={{ flex: 2, minWidth: '160px', margin: 0 }}>
                  <label>Bullet 3 Description</label>
                  <input type="text" style={{ background: '#07090f', border: '1px solid rgba(255,255,255,0.08)', color: '#fff', padding: '0.4rem', borderRadius: '6px', fontSize: '0.75rem', width: '100%' }} value={lobbyBullet3Desc} onChange={(e) => setLobbyBullet3Desc(e.target.value)} required />
                </div>
              </div>
            </div>
          </div>

          {/* Landing page copy texts section */}
          <div style={{ background: '#0b0d16', padding: '1rem', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)', marginBottom: '1.5rem' }}>
            <h4 style={{ fontSize: '0.8rem', color: '#fff', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '0.75rem', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '0.5rem' }}>
              Landing Sign-In Card Copy & Layout Lines
            </h4>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <div className="input-group" style={{ margin: 0 }}>
                <label>Landing Welcome Subtitle Header</label>
                <div className="input-wrapper" style={{ background: '#07090f' }}>
                  <i className="fa-solid fa-heading input-icon"></i>
                  <input type="text" value={landingWelcome} onChange={(e) => setLandingWelcome(e.target.value)} required />
                </div>
              </div>
              <div className="input-group" style={{ margin: 0 }}>
                <label>Landing Welcome Tagline Description</label>
                <div className="input-wrapper" style={{ background: '#07090f' }}>
                  <i className="fa-solid fa-align-left input-icon"></i>
                  <input type="text" value={landingGrab} onChange={(e) => setLandingGrab(e.target.value)} required />
                </div>
              </div>
              <div className="input-group" style={{ margin: 0 }}>
                <label>Signup Tab Title</label>
                <div className="input-wrapper" style={{ background: '#07090f' }}>
                  <i className="fa-solid fa-user-plus input-icon"></i>
                  <input type="text" value={landingQuickSignup} onChange={(e) => setLandingQuickSignup(e.target.value)} required />
                </div>
              </div>
              <div className="input-group" style={{ margin: 0 }}>
                <label>Google Button Title</label>
                <div className="input-wrapper" style={{ background: '#07090f' }}>
                  <i className="fa-brands fa-google input-icon"></i>
                  <input type="text" value={landingSignupWithGoogle} onChange={(e) => setLandingSignupWithGoogle(e.target.value)} required />
                </div>
              </div>
              <div className="input-group" style={{ margin: 0 }}>
                <label>Divider Text Link</label>
                <div className="input-wrapper" style={{ background: '#07090f' }}>
                  <i className="fa-solid fa-columns input-icon"></i>
                  <input type="text" value={landingOrCreate} onChange={(e) => setLandingOrCreate(e.target.value)} required />
                </div>
              </div>
              <div className="input-group" style={{ margin: 0 }}>
                <label>Messenger Webview Warn Alert Notice</label>
                <div className="input-wrapper" style={{ background: '#07090f' }}>
                  <i className="fa-solid fa-circle-exclamation input-icon"></i>
                  <input type="text" value={landingMessengerWarning} onChange={(e) => setLandingMessengerWarning(e.target.value)} required />
                </div>
              </div>
            </div>
          </div>

          {/* Marquee Withdrawal Cards Slider */}
          <div style={{ background: '#0b0d16', padding: '1rem', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)', marginBottom: '1.5rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '0.5rem' }}>
              <h4 style={{ fontSize: '0.8rem', color: '#fff', textTransform: 'uppercase', letterSpacing: '1px', margin: 0 }}>
                Sliding Withdrawal Marquee Cards
              </h4>
              <button type="button" onClick={addPayout} className="action-row-btn" style={{ width: 'auto', background: 'rgba(255,215,0,0.1)', color: 'var(--gold-primary)', border: '1px solid var(--gold-primary)', fontSize: '0.65rem', padding: '0.25rem 0.5rem' }}>
                + Add Card
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', maxHeight: '250px', overflowY: 'auto', paddingRight: '0.5rem' }}>
              {marqueePayouts.length === 0 ? (
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textAlign: 'center', padding: '1rem' }}>No marquee cards configured.</div>
              ) : (
                marqueePayouts.map((p, idx) => (
                  <div key={idx} style={{ display: 'flex', gap: '0.5rem', background: '#07090f', padding: '0.5rem', borderRadius: '8px', alignItems: 'center' }}>
                    <input type="text" style={{ flex: 2, background: 'none', border: 'none', borderBottom: '1px solid rgba(255,255,255,0.1)', color: '#fff', fontSize: '0.75rem', padding: '0.25rem' }} placeholder="Player Name" value={p.name} onChange={(e) => updatePayout(idx, 'name', e.target.value)} />
                    <input type="text" style={{ flex: 1.5, background: 'none', border: 'none', borderBottom: '1px solid rgba(255,255,255,0.1)', color: '#fff', fontSize: '0.75rem', padding: '0.25rem' }} placeholder="Amount ($100.00)" value={p.amount} onChange={(e) => updatePayout(idx, 'amount', e.target.value)} />
                    <input type="text" style={{ flex: 1.5, background: 'none', border: 'none', borderBottom: '1px solid rgba(255,255,255,0.1)', color: '#fff', fontSize: '0.75rem', padding: '0.25rem' }} placeholder="Time (1 hour ago)" value={p.time} onChange={(e) => updatePayout(idx, 'time', e.target.value)} />
                    <input type="text" style={{ flex: 1, background: 'none', border: 'none', borderBottom: '1px solid rgba(255,255,255,0.1)', color: '#fff', fontSize: '0.75rem', padding: '0.25rem' }} placeholder="Initials (JM)" value={p.init} onChange={(e) => updatePayout(idx, 'init', e.target.value)} />
                    <select style={{ flex: 1.5, background: '#0b0d16', color: '#fff', fontSize: '0.7rem', padding: '0.25rem', border: '1px solid rgba(255,255,255,0.1)' }} value={p.color} onChange={(e) => updatePayout(idx, 'color', e.target.value)}>
                      <option value="av-purple">Purple</option>
                      <option value="av-blue">Blue</option>
                      <option value="av-green">Green</option>
                      <option value="av-orange">Orange</option>
                      <option value="av-red">Red</option>
                    </select>
                    <button type="button" onClick={() => deletePayout(idx)} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '0.25rem' }}>
                      <i className="fa-solid fa-trash"></i>
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Cashout Rules Section */}
          <div style={{ background: '#0b0d16', padding: '1rem', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)', marginBottom: '1.5rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '0.5rem' }}>
              <h4 style={{ fontSize: '0.8rem', color: '#fff', textTransform: 'uppercase', letterSpacing: '1px', margin: 0 }}>
                Lobby Cashout Accordion Rules
              </h4>
              <button type="button" onClick={addRule} className="action-row-btn" style={{ width: 'auto', background: 'rgba(255,215,0,0.1)', color: 'var(--gold-primary)', border: '1px solid var(--gold-primary)', fontSize: '0.65rem', padding: '0.25rem 0.5rem' }}>
                + Add Rule
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', maxHeight: '300px', overflowY: 'auto', paddingRight: '0.5rem' }}>
              {cashoutRules.length === 0 ? (
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textAlign: 'center', padding: '1rem' }}>No cashout rules configured.</div>
              ) : (
                cashoutRules.map((rule, idx) => (
                  <div key={idx} style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', background: '#07090f', padding: '0.75rem', borderRadius: '8px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <input type="text" style={{ flex: 1, background: 'none', border: 'none', borderBottom: '1px solid rgba(255,255,255,0.1)', color: '#fff', fontSize: '0.8rem', fontWeight: 'bold', padding: '0.25rem' }} placeholder="Rule Title (e.g. 1. Verification)" value={rule.title} onChange={(e) => updateRule(idx, 'title', e.target.value)} />
                      <button type="button" onClick={() => deleteRule(idx)} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '0.25rem' }}>
                        <i className="fa-solid fa-trash"></i>
                      </button>
                    </div>
                    <textarea rows="2" style={{ background: 'none', border: 'none', borderBottom: '1px solid rgba(255,255,255,0.1)', color: 'var(--text-muted)', fontSize: '0.75rem', padding: '0.25rem', resize: 'none', outline: 'none' }} placeholder="Rule Description text content..." value={rule.description} onChange={(e) => updateRule(idx, 'description', e.target.value)} />
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Cashout Proof Screenshots Management Section */}
          <div style={{ background: '#0b0d16', padding: '1rem', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)', marginBottom: '1.5rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '0.5rem' }}>
              <h4 style={{ fontSize: '0.8rem', color: '#fff', textTransform: 'uppercase', letterSpacing: '1px', margin: 0 }}>
                Homepage Cashout Proof Screenshots
              </h4>
            </div>

            {/* Input to add a new screenshot proof */}
            <div style={{ background: '#07090f', padding: '0.75rem', borderRadius: '8px', marginBottom: '1rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <span style={{ fontSize: '0.725rem', color: 'var(--gold-primary)', fontWeight: 'bold' }}>Add Cashout Proof Screenshot</span>
              <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
                <div style={{ flex: 1, minWidth: '200px' }}>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      if (file.size > 8 * 1024 * 1024) {
                        alert('Image file size must be less than 8MB.');
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
                          const max_width = 600; // screenshots are vertical and do not need to be very wide
                          if (width > max_width) {
                            height *= max_width / width;
                            width = max_width;
                          }
                          canvas.width = width;
                          canvas.height = height;
                          const ctx = canvas.getContext('2d');
                          ctx.drawImage(img, 0, 0, width, height);
                          const compressedBase64 = canvas.toDataURL('image/jpeg', 0.8);
                          // Generate new proof item
                          setProofScreenshots(prev => [
                            ...prev,
                            { id: Date.now().toString(), imageUrl: compressedBase64, title: 'Cashout Completed' }
                          ]);
                          e.target.value = '';
                        };
                      };
                      reader.readAsDataURL(file);
                    }}
                    style={{ fontSize: '0.75rem', color: '#fff' }}
                  />
                  <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                    Select an image. It will be auto-compressed and scaled.
                  </div>
                </div>
              </div>
            </div>

            {/* List of screenshots */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', maxHeight: '300px', overflowY: 'auto', paddingRight: '0.5rem' }}>
              {proofScreenshots.length === 0 ? (
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textAlign: 'center', padding: '1rem' }}>No proof screenshots added yet.</div>
              ) : (
                proofScreenshots.map((proof, idx) => (
                  <div key={proof.id || idx} style={{ display: 'flex', gap: '0.75rem', background: '#07090f', padding: '0.5rem', borderRadius: '8px', alignItems: 'center' }}>
                    <img src={proof.imageUrl} alt="Proof" style={{ width: '45px', height: '60px', borderRadius: '4px', objectFit: 'cover', border: '1px solid rgba(255,255,255,0.1)' }} />
                    <div style={{ flex: 1 }}>
                      <input
                        type="text"
                        style={{ width: '100%', background: 'none', border: 'none', borderBottom: '1px solid rgba(255,255,255,0.1)', color: '#fff', fontSize: '0.75rem', padding: '0.25rem 0' }}
                        placeholder="Screenshot Title (e.g. $100 Cashout completed!)"
                        value={proof.title}
                        onChange={(e) => {
                          const updated = [...proofScreenshots];
                          updated[idx] = { ...updated[idx], title: e.target.value };
                          setProofScreenshots(updated);
                        }}
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setProofScreenshots(proofScreenshots.filter((_, i) => i !== idx));
                      }}
                      style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '0.5rem' }}
                    >
                      <i className="fa-solid fa-trash"></i>
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Lobby trust badges (below cashout rules on player lobby) */}
          <div style={{ background: '#0b0d16', padding: '1rem', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)', marginBottom: '1.5rem' }}>
            <h4 style={{ fontSize: '0.8rem', color: '#fff', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '0.75rem', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '0.5rem' }}>
              Lobby Trust Badges (Below Cashout Rules)
            </h4>
            <p style={{ fontSize: '0.75rem', color: '#888', marginBottom: '1rem' }}>
              Shown on the player lobby under the cashout accordion. Use Font Awesome icon class (e.g. fa-shield-halved).
            </p>
            {lobbyCashoutTrustItems.map((item, idx) => (
              <div key={idx} style={{ display: 'grid', gridTemplateColumns: '120px 1fr 1fr', gap: '0.5rem', marginBottom: '0.75rem', alignItems: 'end' }}>
                <div className="input-group" style={{ margin: 0 }}>
                  <label>Icon</label>
                  <div className="input-wrapper" style={{ background: '#07090f' }}>
                    <i className={`fa-solid ${item.icon || 'fa-star'} input-icon`}></i>
                    <input
                      type="text"
                      placeholder="fa-shield-halved"
                      value={item.icon || ''}
                      onChange={(e) => {
                        const updated = [...lobbyCashoutTrustItems];
                        updated[idx] = { ...updated[idx], icon: e.target.value };
                        setLobbyCashoutTrustItems(updated);
                      }}
                    />
                  </div>
                </div>
                <div className="input-group" style={{ margin: 0 }}>
                  <label>Title</label>
                  <input
                    type="text"
                    value={item.title || ''}
                    onChange={(e) => {
                      const updated = [...lobbyCashoutTrustItems];
                      updated[idx] = { ...updated[idx], title: e.target.value };
                      setLobbyCashoutTrustItems(updated);
                    }}
                    style={{ width: '100%', background: '#07090f', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', padding: '0.6rem', color: '#fff' }}
                  />
                </div>
                <div className="input-group" style={{ margin: 0 }}>
                  <label>Description</label>
                  <input
                    type="text"
                    value={item.description || ''}
                    onChange={(e) => {
                      const updated = [...lobbyCashoutTrustItems];
                      updated[idx] = { ...updated[idx], description: e.target.value };
                      setLobbyCashoutTrustItems(updated);
                    }}
                    style={{ width: '100%', background: '#07090f', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', padding: '0.6rem', color: '#fff' }}
                  />
                </div>
              </div>
            ))}
            <button
              type="button"
              className="btn-secondary"
              style={{ fontSize: '0.75rem', padding: '0.4rem 0.8rem' }}
              onClick={() => setLobbyCashoutTrustItems([...lobbyCashoutTrustItems, { icon: 'fa-star', title: 'NEW BADGE', description: 'Short description' }])}
            >
              + Add Badge
            </button>
          </div>

          {/* Rewards & Limit Constraints */}
          <div style={{ background: '#0b0d16', padding: '1rem', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)', marginBottom: '1.5rem' }}>
            <h4 style={{ fontSize: '0.8rem', color: '#fff', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '0.75rem', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '0.5rem' }}>
              Promotional Rewards & Financial Limits
            </h4>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem' }}>
              <div className="input-group" style={{ flex: '1 1 200px', margin: 0 }}>
                <label>First Deposit Promo Bonus (%)</label>
                <div className="input-wrapper" style={{ background: '#07090f' }}>
                  <i className="fa-solid fa-gift input-icon"></i>
                  <input
                    type="number"
                    placeholder="300"
                    value={firstDepositBonus}
                    onChange={(e) => setFirstDepositBonus(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="input-group" style={{ flex: '1 1 200px', margin: 0 }}>
                <label>Freeplay Signup Reward ($)</label>
                <div className="input-wrapper" style={{ background: '#07090f' }}>
                  <i className="fa-solid fa-gift input-icon"></i>
                  <input
                    type="number"
                    placeholder="3"
                    value={signupFreeplay}
                    onChange={(e) => setSignupFreeplay(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="input-group" style={{ flex: '1 1 200px', margin: 0 }}>
                <label>Minimum Deposit Limit ($)</label>
                <div className="input-wrapper" style={{ background: '#07090f' }}>
                  <i className="fa-solid fa-coins input-icon"></i>
                  <input
                    type="number"
                    placeholder="5"
                    value={minimumDepositLimit}
                    onChange={(e) => setMinimumDepositLimit(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="input-group" style={{ flex: '1 1 200px', margin: 0 }}>
                <label>Default Min Cashout ($)</label>
                <div className="input-wrapper" style={{ background: '#07090f' }}>
                  <i className="fa-solid fa-wallet input-icon"></i>
                  <input
                    type="number"
                    placeholder="25"
                    value={minimumWithdrawalLimit}
                    onChange={(e) => setMinimumWithdrawalLimit(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="input-group" style={{ flex: '1 1 200px', margin: 0 }}>
                <label>Freeplay Min Cashout ($)</label>
                <div className="input-wrapper" style={{ background: '#07090f' }}>
                  <i className="fa-solid fa-gift input-icon" style={{ color: '#00ff66' }}></i>
                  <input
                    type="number"
                    placeholder="30"
                    value={freeplayMinWithdraw}
                    onChange={(e) => setFreeplayMinWithdraw(e.target.value)}
                    required
                  />
                </div>
              </div>
            </div>

            <div style={{ marginTop: '1rem', background: 'rgba(255,255,255,0.02)', padding: '0.85rem', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.06)' }}>
              <label style={{ fontSize: '0.75rem', color: '#ffd700', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.4rem' }}>
                <i className="fa-solid fa-sliders"></i> Multiplier Calculation Base (All Rules)
              </label>
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.35rem' }}>
                <button
                  type="button"
                  onClick={() => {
                    setWithdrawMultiplierBasis('SIGNUP_ONLY_COINS');
                    setWithdrawTier1Basis('COINS');
                    setWithdrawTier2Basis('DEPOSIT');
                  }}
                  style={{
                    padding: '0.3rem 0.65rem',
                    fontSize: '0.7rem',
                    borderRadius: '5px',
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
                    padding: '0.3rem 0.65rem',
                    fontSize: '0.7rem',
                    borderRadius: '5px',
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
                    padding: '0.3rem 0.65rem',
                    fontSize: '0.7rem',
                    borderRadius: '5px',
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
              <p style={{ fontSize: '0.65rem', color: '#888', margin: 0 }}>
                {withdrawMultiplierBasis === 'DEPOSIT'
                  ? 'All cashout rules calculate strictly from Deposit Amount ($).'
                  : withdrawMultiplierBasis === 'COINS'
                  ? 'All cashout rules calculate from Allotted Coins (deposit + bonus).'
                  : 'Only Signup Bonus (1st deposit) attaches coins with deposit amount. All subsequent regular deposits calculate strictly from Deposit Amount ($).'}
              </p>
            </div>

            <div style={{ marginTop: '1rem', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1rem' }}>
              <div style={{ background: 'rgba(255,255,255,0.02)', padding: '0.75rem', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)' }}>
                <div className="input-group" style={{ margin: 0, marginBottom: '0.5rem' }}>
                  <label style={{ fontSize: '0.75rem' }}>Tier 1 Multiplier ($5-$50 Deposit)</label>
                  <div className="input-wrapper" style={{ background: '#07090f' }}>
                    <i className="fa-solid fa-xmark input-icon" style={{ color: '#f59e0b' }}></i>
                    <input
                      type="number"
                      step="0.1"
                      placeholder="5"
                      value={withdrawTier1Multiplier}
                      onChange={(e) => setWithdrawTier1Multiplier(e.target.value)}
                      required
                    />
                  </div>
                </div>
                <div className="input-group" style={{ margin: 0 }}>
                  <label style={{ fontSize: '0.72rem', color: '#bbb' }}>Tier 1 Calculation Base</label>
                  <select
                    value={withdrawTier1Basis}
                    onChange={(e) => {
                      setWithdrawTier1Basis(e.target.value);
                      setWithdrawMultiplierBasis('CUSTOM');
                    }}
                    style={{
                      width: '100%',
                      background: '#07090f',
                      border: '1px solid rgba(255,255,255,0.1)',
                      color: '#fff',
                      padding: '0.45rem',
                      borderRadius: '5px',
                      fontSize: '0.72rem'
                    }}
                  >
                    <option value="COINS">Allotted Coins (Default: Coins × {withdrawTier1Multiplier}x)</option>
                    <option value="DEPOSIT">Deposit Amount ($ × {withdrawTier1Multiplier}x)</option>
                  </select>
                </div>
              </div>

              <div style={{ background: 'rgba(255,255,255,0.02)', padding: '0.75rem', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)' }}>
                <div className="input-group" style={{ margin: 0, marginBottom: '0.5rem' }}>
                  <label style={{ fontSize: '0.75rem' }}>Tier 2 Multiplier (&gt;$50 Deposit)</label>
                  <div className="input-wrapper" style={{ background: '#07090f' }}>
                    <i className="fa-solid fa-xmark input-icon" style={{ color: '#38bdf8' }}></i>
                    <input
                      type="number"
                      step="0.1"
                      placeholder="3"
                      value={withdrawTier2Multiplier}
                      onChange={(e) => setWithdrawTier2Multiplier(e.target.value)}
                      required
                    />
                  </div>
                </div>
                <div className="input-group" style={{ margin: 0 }}>
                  <label style={{ fontSize: '0.72rem', color: '#bbb' }}>Tier 2 Calculation Base</label>
                  <select
                    value={withdrawTier2Basis}
                    onChange={(e) => {
                      setWithdrawTier2Basis(e.target.value);
                      setWithdrawMultiplierBasis('CUSTOM');
                    }}
                    style={{
                      width: '100%',
                      background: '#07090f',
                      border: '1px solid rgba(255,255,255,0.1)',
                      color: '#fff',
                      padding: '0.45rem',
                      borderRadius: '5px',
                      fontSize: '0.72rem'
                    }}
                  >
                    <option value="DEPOSIT">Deposit Amount ($ × {withdrawTier2Multiplier}x) [Default]</option>
                    <option value="COINS">Allotted Coins (Coins × {withdrawTier2Multiplier}x)</option>
                  </select>
                </div>
              </div>
            </div>

            <div style={{ marginTop: '1.25rem', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '1rem' }}>
              <h4 style={{ fontSize: '0.75rem', color: '#fff', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '0.65rem' }}>
                Withdrawal Proof Requirements
              </h4>
              <p style={{ fontSize: '0.7rem', color: '#888', marginBottom: '0.75rem' }}>
                Control which screenshot uploads players must attach when cashing out.
              </p>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', fontSize: '0.78rem', color: '#ddd', cursor: 'pointer', marginBottom: '0.55rem' }}>
                <input
                  type="checkbox"
                  checked={withdrawRequireGameScreenshot}
                  onChange={(e) => setWithdrawRequireGameScreenshot(e.target.checked)}
                />
                Require game balance screenshot
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', fontSize: '0.78rem', color: '#ddd', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={withdrawRequireTagQrScreenshot}
                  onChange={(e) => setWithdrawRequireTagQrScreenshot(e.target.checked)}
                />
                Require Tag QR screenshot
              </label>
            </div>

            <div style={{ marginTop: '1.25rem', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '1rem' }}>
              <div className="input-group" style={{ margin: 0 }}>
                <label>Upload Custom Notification Alert Sound (.mp3 / .wav)</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginTop: '0.5rem', flexWrap: 'wrap' }}>
                  <input
                    type="file"
                    accept="audio/*,video/mpeg,audio/mpeg,audio/mp3,audio/wav,.mpeg,.mp3,.wav"
                    onChange={handleAudioUpload}
                    style={{ fontSize: '0.75rem', color: '#fff' }}
                  />
                  {notificationSoundUrl && (
                    <button
                      type="button"
                      onClick={() => {
                        try {
                          const cleanUrl = (notificationSoundUrl || '').replace(/^data:video\/[^;]+;/, 'data:audio/mpeg;');
                          const audio = new Audio(cleanUrl);
                          audio.play().catch(err => alert('Playback blocked by browser autoplay settings. Please click anywhere on the page and try again!'));
                        } catch (err) {
                          alert('Error playing audio: ' + err.message);
                        }
                      }}
                      className="submit-btn"
                      style={{ width: 'auto', background: 'rgba(255,255,255,0.1)', color: '#fff', margin: 0, padding: '0.35rem 0.75rem', fontSize: '0.7rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}
                    >
                      <i className="fa-solid fa-play"></i> Test Notification Sound
                    </button>
                  )}
                </div>
                <div style={{ fontSize: '0.625rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                  Upload any sound file under 5MB (MP3/WAV/etc). Audio will play on the Shift Dashboard and Coins Allotment pages when new queue items arrive.
                </div>
              </div>
            </div>
          </div>

          {/* Visual Assets & Photos CMS */}
          <div style={{ background: '#0b0d16', padding: '1rem', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)', marginBottom: '1.5rem' }}>
            <h4 style={{ fontSize: '0.8rem', color: '#fff', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '0.75rem', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '0.5rem' }}>
              Visual Media Assets & CMS Photos
            </h4>
            <p className="game-tap-tip" style={{ marginBottom: '1.25rem' }}>
              Upload custom images for the auth side background and brand logo.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              
              {/* Auth Side Image */}
              <div style={{ background: '#07090f', padding: '0.75rem', borderRadius: '8px', display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
                <div style={{ width: '80px', height: '80px', borderRadius: '8px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.08)', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {loginBgUrl ? (
                    <img src={loginBgUrl} alt="Auth Side Image Preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    <i className="fa-solid fa-image" style={{ fontSize: '1.5rem', color: 'var(--text-muted)' }}></i>
                  )}
                </div>
                <div style={{ flex: 1, minWidth: '220px' }}>
                  <label style={{ fontSize: '0.725rem', color: 'var(--gold-primary)', fontWeight: 'bold', display: 'block', marginBottom: '0.25rem' }}>
                    Auth Side Image (Login / Register)
                  </label>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center' }}>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        if (file.size > 8 * 1024 * 1024) {
                          alert('Image file size must be less than 8MB.');
                          return;
                        }
                        try {
                          // Compress so mobile can load as full-bleed background
                          const compressed = await compressImageFile(file, { maxSize: 1280, quality: 0.72 });
                          setLoginBgUrl(compressed);
                        } catch {
                          const reader = new FileReader();
                          reader.onloadend = () => setLoginBgUrl(reader.result);
                          reader.readAsDataURL(file);
                        }
                      }}
                      style={{ fontSize: '0.75rem', color: '#fff' }}
                    />
                    <button
                      type="button"
                      onClick={() => setLoginBgUrl(DEFAULT_LOGIN_BG)}
                      className="action-row-btn"
                      style={{
                        width: 'auto',
                        padding: '0.35rem 0.75rem',
                        fontSize: '0.65rem',
                        fontWeight: 'bold',
                        background: loginBgUrl === DEFAULT_LOGIN_BG ? 'rgba(255,215,0,0.15)' : 'rgba(255,255,255,0.05)',
                        border: '1px solid rgba(255,215,0,0.35)',
                        color: '#ffd700'
                      }}
                    >
                      Use Default
                    </button>
                  </div>
                  <div style={{ fontSize: '0.625rem', color: 'var(--text-muted)', marginTop: '0.35rem' }}>
                    Full-screen login background (mobile + desktop). Recommended: landscape ~1600×900. Click <strong>Use Default</strong> then Save to restore the original Royals image.
                  </div>
                </div>
              </div>

              {/* Brand Logo Mascot */}
              <div style={{ background: '#07090f', padding: '0.75rem', borderRadius: '8px', display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
                <div style={{ width: '80px', height: '80px', borderRadius: '8px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.08)', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {logoUrl ? (
                    <img src={logoUrl} alt="Logo Preview" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                  ) : (
                    <i className="fa-solid fa-crown" style={{ fontSize: '1.5rem', color: 'var(--text-muted)' }}></i>
                  )}
                </div>
                <div style={{ flex: 1, minWidth: '220px' }}>
                  <label style={{ fontSize: '0.725rem', color: 'var(--gold-primary)', fontWeight: 'bold', display: 'block', marginBottom: '0.25rem' }}>
                    Lobby Brand Logo / Mascot Image
                  </label>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      if (file.size > 8 * 1024 * 1024) {
                        alert('Image file size must be less than 8MB.');
                        return;
                      }
                      try {
                        const compressed = await compressImageFile(file, { maxSize: 512, quality: 0.8 });
                        setLogoUrl(compressed);
                      } catch {
                        const reader = new FileReader();
                        reader.onloadend = () => setLogoUrl(reader.result);
                        reader.readAsDataURL(file);
                      }
                    }}
                    style={{ fontSize: '0.75rem', color: '#fff' }}
                  />
                  <div style={{ fontSize: '0.625rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                    Recommended format: PNG transparent background logo shown on top banners.
                  </div>
                </div>
              </div>

            </div>
          </div>

          <button type="submit" className="submit-btn" style={{ background: 'var(--gold-primary)', color: '#000', fontWeight: 'bold' }} disabled={isSaving}>
            {isSaving ? 'SAVING CHANGES...' : 'SAVE FRONTEND SETTINGS'}
          </button>
        </form>
      )}
    </section>
  );
}
