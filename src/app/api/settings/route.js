import { NextResponse } from 'next/server';
import { getDb } from '../../../lib/mongodb';
import { cache } from '../../../lib/cache';

// GET settings
export async function GET() {
  try {
    const cachedSettings = cache.get('settings_all');
    if (cachedSettings) {
      return NextResponse.json({ success: true, settings: cachedSettings });
    }

    const db = await getDb();
    const settingsCollection = db.collection('settings');
    
    let settings = await settingsCollection.findOne({ id: 'global_settings' });
    
    // Seed defaults if missing
    if (!settings) {
      settings = {
        id: 'global_settings',
        firstDepositBonus: 300,
        regularDepositBonus: 20,
        referralBonus: 10,
        preventDuplicateDeviceAccounts: true,
        freeplayMinWithdraw: 30,
        defaultMinWithdraw: 25,
        withdrawTier1MinDeposit: 5,
        withdrawTier1MaxDeposit: 50,
        withdrawTier1Multiplier: 5,
        withdrawTier2Multiplier: 3,
        withdrawTier1Basis: 'COINS',
        withdrawTier2Basis: 'DEPOSIT',
        withdrawMultiplierBasis: 'TIER_BASED',
        usdtAddress: '',
        usdtQrCode: '',
        affiliatePayoutNetwork: 'TRC20',
        affiliatePayoutWallet: '',
        affiliatePayoutQrCode: '',
        affiliatePayoutWalletBEP20: '',
        affiliatePayoutQrBEP20: '',
        affiliatePlatformCommissionRate: 90,
        adPaymentNetwork: 'BEP20',
        adPaymentWallet: '',
        adPaymentQrCode: '',
        adBudgetLimit: 6000
      };
      await settingsCollection.insertOne(settings);
    } else {
      let needsUpdate = false;
      const updates = {};
      if (settings.preventDuplicateDeviceAccounts === undefined) {
        updates.preventDuplicateDeviceAccounts = true;
        settings.preventDuplicateDeviceAccounts = true;
        needsUpdate = true;
      }
      if (settings.referralBonus === undefined) {
        updates.referralBonus = 10;
        settings.referralBonus = 10;
        needsUpdate = true;
      }
      if (settings.freeplayMinWithdraw === undefined) {
        updates.freeplayMinWithdraw = 30;
        settings.freeplayMinWithdraw = 30;
        needsUpdate = true;
      }
      if (settings.defaultMinWithdraw === undefined) {
        updates.defaultMinWithdraw = 25;
        settings.defaultMinWithdraw = 25;
        needsUpdate = true;
      }
      if (settings.withdrawTier1MinDeposit === undefined) {
        updates.withdrawTier1MinDeposit = 5;
        settings.withdrawTier1MinDeposit = 5;
        needsUpdate = true;
      }
      if (settings.withdrawTier1MaxDeposit === undefined) {
        updates.withdrawTier1MaxDeposit = 50;
        settings.withdrawTier1MaxDeposit = 50;
        needsUpdate = true;
      }
      if (settings.withdrawTier1Multiplier === undefined) {
        updates.withdrawTier1Multiplier = 5;
        settings.withdrawTier1Multiplier = 5;
        needsUpdate = true;
      }
      if (settings.withdrawTier2Multiplier === undefined) {
        updates.withdrawTier2Multiplier = 3;
        settings.withdrawTier2Multiplier = 3;
        needsUpdate = true;
      }
      if (settings.withdrawTier1Basis === undefined) {
        updates.withdrawTier1Basis = 'COINS';
        settings.withdrawTier1Basis = 'COINS';
        needsUpdate = true;
      }
      if (settings.withdrawTier2Basis === undefined) {
        updates.withdrawTier2Basis = 'DEPOSIT';
        settings.withdrawTier2Basis = 'DEPOSIT';
        needsUpdate = true;
      }
      if (settings.withdrawMultiplierBasis === undefined) {
        updates.withdrawMultiplierBasis = 'TIER_BASED';
        settings.withdrawMultiplierBasis = 'TIER_BASED';
        needsUpdate = true;
      }
      if (settings.usdtAddress === undefined) {
        updates.usdtAddress = '';
        settings.usdtAddress = '';
        needsUpdate = true;
      }
      if (settings.usdtQrCode === undefined) {
        updates.usdtQrCode = '';
        settings.usdtQrCode = '';
        needsUpdate = true;
      }
      if (settings.affiliatePayoutNetwork === undefined) {
        updates.affiliatePayoutNetwork = 'TRC20';
        settings.affiliatePayoutNetwork = 'TRC20';
        needsUpdate = true;
      }
      if (settings.affiliatePayoutWallet === undefined) {
        updates.affiliatePayoutWallet = '';
        settings.affiliatePayoutWallet = '';
        needsUpdate = true;
      }
      if (settings.affiliatePayoutQrCode === undefined) {
        updates.affiliatePayoutQrCode = '';
        settings.affiliatePayoutQrCode = '';
        needsUpdate = true;
      }
      if (settings.affiliatePlatformCommissionRate === undefined) {
        updates.affiliatePlatformCommissionRate = 90;
        settings.affiliatePlatformCommissionRate = 90;
        needsUpdate = true;
      }
      ['affiliatePayoutWalletBEP20', 'affiliatePayoutQrBEP20', 'adPaymentNetwork', 'adPaymentWallet', 'adPaymentQrCode'].forEach((key) => {
        if (settings[key] === undefined) {
          updates[key] = '';
          settings[key] = '';
          needsUpdate = true;
        }
      });
      if (settings.adBudgetLimit === undefined) {
        updates.adBudgetLimit = 6000;
        settings.adBudgetLimit = 6000;
        needsUpdate = true;
      }
      if (needsUpdate) {
        await settingsCollection.updateOne({ id: 'global_settings' }, { $set: updates });
      }
    }
    
    cache.set('settings_all', settings, 60);
    return NextResponse.json({ success: true, settings });
  } catch (err) {
    console.error('Fetch Settings API Error:', err);
    return NextResponse.json({ success: false, message: 'Server error: ' + err.message }, { status: 500 });
  }
}

// PUT / POST update settings (Super Admin only)
export async function PUT(req) {
  try {
    const {
      firstDepositBonus,
      regularDepositBonus,
      referralBonus,
      preventDuplicateDeviceAccounts,
      freeplayMinWithdraw,
      defaultMinWithdraw,
      withdrawTier1MinDeposit,
      withdrawTier1MaxDeposit,
      withdrawTier1Multiplier,
      withdrawTier2Multiplier,
      withdrawTier1Basis,
      withdrawTier2Basis,
      withdrawMultiplierBasis,
      usdtAddress,
      usdtQrCode,
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
    } = await req.json();

    const db = await getDb();
    const settingsCollection = db.collection('settings');

    const updateFields = {};
    if (firstDepositBonus !== undefined) {
      updateFields.firstDepositBonus = Number(firstDepositBonus);
    }
    if (regularDepositBonus !== undefined) {
      updateFields.regularDepositBonus = Number(regularDepositBonus);
    }
    if (referralBonus !== undefined) {
      updateFields.referralBonus = Number(referralBonus);
    }
    if (preventDuplicateDeviceAccounts !== undefined) {
      updateFields.preventDuplicateDeviceAccounts = Boolean(preventDuplicateDeviceAccounts);
    }
    if (freeplayMinWithdraw !== undefined) {
      updateFields.freeplayMinWithdraw = Math.max(1, Number(freeplayMinWithdraw) || 30);
    }
    if (defaultMinWithdraw !== undefined) {
      updateFields.defaultMinWithdraw = Math.max(1, Number(defaultMinWithdraw) || 25);
    }
    if (withdrawTier1MinDeposit !== undefined) {
      updateFields.withdrawTier1MinDeposit = Math.max(1, Number(withdrawTier1MinDeposit) || 5);
    }
    if (withdrawTier1MaxDeposit !== undefined) {
      updateFields.withdrawTier1MaxDeposit = Math.max(1, Number(withdrawTier1MaxDeposit) || 50);
    }
    if (withdrawTier1Multiplier !== undefined) {
      updateFields.withdrawTier1Multiplier = Math.max(0.1, Number(withdrawTier1Multiplier) || 5);
    }
    if (withdrawTier2Multiplier !== undefined) {
      updateFields.withdrawTier2Multiplier = Math.max(0.1, Number(withdrawTier2Multiplier) || 3);
    }
    if (withdrawTier1Basis !== undefined) {
      updateFields.withdrawTier1Basis = ['COINS', 'DEPOSIT'].includes(String(withdrawTier1Basis).toUpperCase())
        ? String(withdrawTier1Basis).toUpperCase()
        : 'COINS';
    }
    if (withdrawTier2Basis !== undefined) {
      updateFields.withdrawTier2Basis = ['COINS', 'DEPOSIT'].includes(String(withdrawTier2Basis).toUpperCase())
        ? String(withdrawTier2Basis).toUpperCase()
        : 'DEPOSIT';
    }
    if (withdrawMultiplierBasis !== undefined) {
      updateFields.withdrawMultiplierBasis = ['COINS', 'DEPOSIT', 'TIER_BASED'].includes(String(withdrawMultiplierBasis).toUpperCase())
        ? String(withdrawMultiplierBasis).toUpperCase()
        : 'TIER_BASED';
    }
    if (usdtAddress !== undefined) {
      updateFields.usdtAddress = String(usdtAddress).trim();
    }
    if (usdtQrCode !== undefined) {
      updateFields.usdtQrCode = String(usdtQrCode);
    }
    if (affiliatePayoutNetwork !== undefined) {
      updateFields.affiliatePayoutNetwork = ['TRC20', 'BEP20'].includes(affiliatePayoutNetwork) ? affiliatePayoutNetwork : 'TRC20';
    }
    if (affiliatePayoutWallet !== undefined) {
      updateFields.affiliatePayoutWallet = String(affiliatePayoutWallet).trim();
    }
    if (affiliatePayoutQrCode !== undefined) {
      updateFields.affiliatePayoutQrCode = String(affiliatePayoutQrCode);
    }
    if (affiliatePayoutWalletBEP20 !== undefined) {
      updateFields.affiliatePayoutWalletBEP20 = String(affiliatePayoutWalletBEP20).trim();
    }
    if (affiliatePayoutQrBEP20 !== undefined) {
      updateFields.affiliatePayoutQrBEP20 = String(affiliatePayoutQrBEP20);
    }
    if (affiliatePlatformCommissionRate !== undefined) {
      updateFields.affiliatePlatformCommissionRate = Number(affiliatePlatformCommissionRate) || 90;
    }
    if (adPaymentNetwork !== undefined) {
      updateFields.adPaymentNetwork = ['TRC20', 'BEP20'].includes(adPaymentNetwork) ? adPaymentNetwork : 'BEP20';
    }
    if (adPaymentWallet !== undefined) {
      updateFields.adPaymentWallet = String(adPaymentWallet).trim();
    }
    if (adPaymentQrCode !== undefined) {
      updateFields.adPaymentQrCode = String(adPaymentQrCode);
    }
    if (adBudgetLimit !== undefined) {
      updateFields.adBudgetLimit = Math.max(0, Number(adBudgetLimit) || 6000);
    }

    await settingsCollection.updateOne(
      { id: 'global_settings' },
      { $set: updateFields },
      { upsert: true }
    );

    // Sync cashout settings to frontend_settings as well
    const cashoutSync = {};
    ['freeplayMinWithdraw', 'defaultMinWithdraw', 'withdrawTier1MinDeposit', 'withdrawTier1MaxDeposit', 'withdrawTier1Multiplier', 'withdrawTier2Multiplier', 'withdrawTier1Basis', 'withdrawTier2Basis', 'withdrawMultiplierBasis'].forEach((key) => {
      if (updateFields[key] !== undefined) cashoutSync[key] = updateFields[key];
    });
    if (updateFields.defaultMinWithdraw !== undefined) {
      cashoutSync.minimumWithdrawalLimit = updateFields.defaultMinWithdraw;
    }
    if (Object.keys(cashoutSync).length > 0) {
      await settingsCollection.updateOne(
        { id: 'frontend_settings' },
        { $set: cashoutSync },
        { upsert: true }
      );
    }

    // Invalidate caches
    cache.del('settings_all');
    cache.del('frontend_settings_all');
    cache.del('admin_stats');

    return NextResponse.json({ success: true, message: 'Settings updated successfully!' });
  } catch (err) {
    console.error('Update Settings API Error:', err);
    return NextResponse.json({ success: false, message: 'Server error: ' + err.message }, { status: 500 });
  }
}

