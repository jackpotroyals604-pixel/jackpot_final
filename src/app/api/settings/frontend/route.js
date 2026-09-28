import { NextResponse } from 'next/server';
import { getDb } from '../../../../lib/mongodb';
import { cache } from '../../../../lib/cache';
import { compressDataUrlIfNeeded } from '../../../../lib/serverImageCompress';

const DEFAULT_SETTINGS = {
  id: 'frontend_settings',
  logoUrl: '/jackpot_lion_mascot.png?v=2',
  loginBgUrl: '/jackpot_royals_bg.png',
  notificationSoundUrl: 'https://raw.githubusercontent.com/AUTOMATIC1111/stable-diffusion-webui/master/notification.mp3',
  withdrawNotice: 'Fastest Withdrawals inside 5 Minutes!',
  cashoutNotice: 'Standard cashout processing hours: 9 AM - 11 PM EST',
  androidAppUrl: '/downloads/jackpot-royals.apk',
  iosAppUrl: '',
  getAppEnabled: false,
  chimeActive: true,
  venmoActive: true,
  cashappActive: true,
  firstDepositBonus: 300,
  signupFreeplay: 3,
  minimumDepositLimit: 5,
  minimumWithdrawalLimit: 25,
  freeplayMinWithdraw: 30,
  defaultMinWithdraw: 25,
  withdrawTier1MinDeposit: 5,
  withdrawTier1MaxDeposit: 50,
  withdrawTier1Multiplier: 5,
  withdrawTier2Multiplier: 3,
  // Withdrawal form proof requirements (Super Admin toggles)
  withdrawRequireGameScreenshot: false,
  withdrawRequireTagQrScreenshot: true,
  
  // Landing Page Texts
  landingWelcome: 'WELCOME TO JACKPOT ROYALS',
  landingGrab: 'Grab amazing bonuses and win big!',
  landingQuickSignup: 'Quick signup',
  landingSignupWithGoogle: 'Sign up with Google',
  landingOrCreate: 'or create account with email',
  landingMessengerWarning: 'Google sign-in is not supported inside Messenger. Please open this page in Chrome or Safari.',
  
  // Lobby Homepage Hero & Freeplay Texts
  lobbyHeroPromo: 'GET 300% SIGNUP BONUS ON YOUR FIRST DEPOSIT',
  lobbyTrustBadge1: 'Instant Withdrawals',
  lobbyTrustBadge2: 'Secure & Safe',
  lobbyTrustBadge3: 'Trusted by 1B+ Players',
  lobbyFreeplayValue: '$3',
  lobbyFreeplayLabel: 'FREEPLAY',
  lobbyFreeplayCondition: 'ON SIGNUP!',
  lobbyBullet1Title: 'PLAY',
  lobbyBullet1Desc: 'Explore exciting games',
  lobbyBullet2Title: 'WIN',
  lobbyBullet2Desc: 'Win real rewards',
  lobbyBullet3Title: 'CASH OUT',
  lobbyBullet3Desc: 'Fast withdrawals',
  lobbyFreeplayClaimBtn: 'CLAIM FREEPLAY NOW',
  lobbyHeroSideImage: '/lobby-app-download-promo.png',
  lobbyHeroSideImageAlt: 'Download mobile app and get $3 freeplay',
  lobbyHeroSideEnabled: true,
  
  // Marquee Cards
  marqueePayouts: [
    { name: 'Elizabeth Audrey', amount: '$208.00', time: '1 hour ago', color: 'av-purple', init: 'EA' },
    { name: 'Jamie', amount: '$30.00', time: '1 hour ago', color: 'av-blue', init: 'JM' },
    { name: 'Angel', amount: '$90.00', time: '1 hour ago', color: 'av-green', init: 'AN' },
    { name: 'Ashley', amount: '$45.00', time: '1 hour ago', color: 'av-orange', init: 'AS' },
    { name: 'Ryan G.', amount: '$420.00', time: '2 hours ago', color: 'av-red', init: 'RG' },
    { name: 'Michael S.', amount: '$150.00', time: '2 hours ago', color: 'av-purple', init: 'MS' }
  ],
  
  // Accordion cashout rules
  cashoutRules: [
    { title: '1. Account Verification', description: 'Before requesting your first cashout, your email must be verified. Go to customer support if you need assistance updating details.' },
    { title: '2. Playthrough Requirements', description: 'Sign-up bonuses and deposit match values carry a standard 1x playthrough requirement before funds are eligible for withdrawal requests.' },
    { title: '3. Minimum & Maximum Cashouts', description: 'The minimum cashout limit is $5. Daily maximum cashouts are capped at $5,000 for standard players. Support can raise limits for VIP accounts.' },
    { title: '4. Payout Duration', description: 'Withdrawal requests are processed instantly or within 10-15 minutes on average via digital wallets.' }
  ],
  proofScreenshots: [],
  lobbyCashoutTrustItems: [
    { icon: 'fa-shield-halved', title: '100% SECURE', description: 'Your data is always protected' },
    { icon: 'fa-circle-check', title: 'FAIR PLAY', description: 'Provably fair and transparent' },
    { icon: 'fa-bolt', title: 'INSTANT WITHDRAWALS', description: 'Get your winnings instantly' },
    { icon: 'fa-headset', title: '24/7 SUPPORT', description: 'Always here to help you' }
  ],

  // Info / Contact page (Super Admin editable)
  infoPageEnabled: true,
  infoShowOnAuth: true,
  infoShowOnLobby: true,
  infoTagline: 'PLAY SMARTER. CASHOUT FASTER.',
  infoLead:
    'Official channels for updates, community, and player support. Reach us anytime — we\'re here to help you win big.',
  infoSupportNote:
    'For account help, deposits, or withdrawals, email support and our team will get back to you.',
  infoInstagramEnabled: true,
  infoInstagramLabel: 'Instagram',
  infoInstagramHandle: '@jackpotroyals_casino',
  infoInstagramUrl: 'https://www.instagram.com/jackpotroyals_casino?igsh=dnZjNmNwdmNzazN6',
  infoTelegramEnabled: true,
  infoTelegramLabel: 'Telegram',
  infoTelegramHandle: 't.me/Jackpotroyals_casino',
  infoTelegramUrl: 'https://t.me/Jackpotroyals_casino',
  infoFacebookEnabled: true,
  infoFacebookLabel: 'Facebook',
  infoFacebookHandle: 'Jackpot Royals',
  infoFacebookUrl: 'https://www.facebook.com/share/1KgG9SdC5N/',
  infoWhatsappEnabled: true,
  infoWhatsappLabel: 'WhatsApp',
  infoWhatsappHandle: '+1 929 630 8553',
  infoWhatsappUrl: 'https://wa.me/19296308553',
  infoEmailEnabled: true,
  infoEmailLabel: 'Email Support',
  infoEmailHandle: 'support@jackpotroyals.com',
  infoEmailUrl: 'mailto:support@jackpotroyals.com'
};

// GET Frontend Settings
export async function GET() {
  try {
    const cachedSettings = cache.get('frontend_settings_all');
    if (cachedSettings) {
      return NextResponse.json({ success: true, settings: cachedSettings });
    }

    const db = await getDb();
    const settingsCollection = db.collection('settings');
    
    let settings = await settingsCollection.findOne({ id: 'frontend_settings' });
    
    if (!settings) {
      settings = { ...DEFAULT_SETTINGS };
      await settingsCollection.insertOne(settings);
    } else {
      // Merge new schema keys dynamically if missing
      let hasMissing = false;
      const keys = Object.keys(DEFAULT_SETTINGS);
      for (const key of keys) {
        if (settings[key] === undefined) {
          settings[key] = DEFAULT_SETTINGS[key];
          hasMissing = true;
        }
      }
      if (hasMissing) {
        await settingsCollection.updateOne({ id: 'frontend_settings' }, { $set: settings });
      }
    }
    
    cache.set('frontend_settings_all', settings, 60);
    return NextResponse.json({ success: true, settings });
  } catch (err) {
    console.error('Fetch Frontend Settings API Error:', err);
    return NextResponse.json({ success: false, message: 'Server error: ' + err.message }, { status: 500 });
  }
}

// PUT Update Frontend Settings (Main Boss / Super Admin only)
export async function PUT(req) {
  try {
    const body = await req.json();
    const db = await getDb();
    const settingsCollection = db.collection('settings');

    const updateFields = {};
    const allowedKeys = Object.keys(DEFAULT_SETTINGS).filter(k => k !== 'id');
    
    for (const key of allowedKeys) {
      if (body[key] !== undefined) {
        if (typeof DEFAULT_SETTINGS[key] === 'boolean') {
          updateFields[key] = Boolean(body[key]);
        } else if (typeof DEFAULT_SETTINGS[key] === 'number') {
          updateFields[key] = Number(body[key]);
        } else {
          updateFields[key] = body[key];
        }
      }
    }

    // Keep auth/logo data-URLs under Mongo / nginx limits
    if (typeof updateFields.loginBgUrl === 'string' && updateFields.loginBgUrl.startsWith('data:')) {
      updateFields.loginBgUrl = await compressDataUrlIfNeeded(updateFields.loginBgUrl, {
        maxChars: 350_000,
        maxSize: 1280,
        quality: 70
      });
    }
    if (typeof updateFields.logoUrl === 'string' && updateFields.logoUrl.startsWith('data:')) {
      updateFields.logoUrl = await compressDataUrlIfNeeded(updateFields.logoUrl, {
        maxChars: 180_000,
        maxSize: 512,
        quality: 75
      });
    }

    await settingsCollection.updateOne(
      { id: 'frontend_settings' },
      { $set: updateFields },
      { upsert: true }
    );

    // Sync cashout settings to global_settings as well
    const cashoutSync = {};
    ['freeplayMinWithdraw', 'defaultMinWithdraw', 'withdrawTier1MinDeposit', 'withdrawTier1MaxDeposit', 'withdrawTier1Multiplier', 'withdrawTier2Multiplier'].forEach((key) => {
      if (updateFields[key] !== undefined) cashoutSync[key] = updateFields[key];
    });
    if (updateFields.minimumWithdrawalLimit !== undefined && updateFields.defaultMinWithdraw === undefined) {
      cashoutSync.defaultMinWithdraw = updateFields.minimumWithdrawalLimit;
    }
    if (Object.keys(cashoutSync).length > 0) {
      await settingsCollection.updateOne(
        { id: 'global_settings' },
        { $set: cashoutSync },
        { upsert: true }
      );
    }

    // Invalidate caches
    cache.del('frontend_settings_all');
    cache.del('settings_all');

    return NextResponse.json({ success: true, message: 'Frontend settings updated successfully!' });
  } catch (err) {
    console.error('Update Frontend Settings API Error:', err);
    return NextResponse.json({ success: false, message: 'Server error: ' + err.message }, { status: 500 });
  }
}
