/**
 * Cashout minimum from last successful deposit:
 * - last deposit $5 to $50  → allotted coins × 5 (or configured tier 1 multiplier)
 * - last deposit > $50      → allotted coins × 3 (or configured tier 2 multiplier)
 * - Freeplay cashout minimum is $30 (or configured freeplayMinWithdraw).
 */

export function resolveAllottedCoins(lastDeposit, settings = {}) {
  if (!lastDeposit) return 0;
  if (typeof lastDeposit === 'number') {
    const defaultBonus = Number(settings?.regularDepositBonus ?? 20);
    return Math.floor(lastDeposit * (1 + (Number.isFinite(defaultBonus) ? defaultBonus : 20) / 100));
  }
  if (lastDeposit.totalCoins !== undefined && lastDeposit.totalCoins !== null && !isNaN(Number(lastDeposit.totalCoins)) && Number(lastDeposit.totalCoins) > 0) {
    return Math.floor(Number(lastDeposit.totalCoins));
  }
  if (lastDeposit.gameAmount !== undefined && lastDeposit.gameAmount !== null && !isNaN(Number(lastDeposit.gameAmount)) && Number(lastDeposit.gameAmount) > 0) {
    return Math.floor(Number(lastDeposit.gameAmount));
  }
  const deposit = Number(lastDeposit.amount || 0);
  if (!Number.isFinite(deposit) || deposit <= 0) return 0;
  const bonus = Number(lastDeposit.bonusApplied !== undefined ? lastDeposit.bonusApplied : (settings.regularDepositBonus ?? 20));
  return Math.floor(deposit * (1 + (Number.isFinite(bonus) ? bonus : 20) / 100));
}

export function formatWithdrawRuleExplanation(rule) {
  if (!rule) return '';
  if (rule.basis === 'DEPOSIT') {
    return `$${Number(rule.depositAmount || 0).toFixed(2)} deposit × ${rule.multiplier}`;
  }
  return `${rule.allottedCoins} coins allotted × ${rule.multiplier}`;
}

export function getDepositWithdrawRule(lastDepositOrAmount, settings = {}) {
  if (!lastDepositOrAmount) return null;

  let depositAmount = 0;
  let allottedCoins = 0;

  if (typeof lastDepositOrAmount === 'object' && lastDepositOrAmount !== null) {
    depositAmount = Number(lastDepositOrAmount.amount || 0);
    allottedCoins = resolveAllottedCoins(lastDepositOrAmount, settings);
  } else {
    depositAmount = Number(lastDepositOrAmount || 0);
    allottedCoins = resolveAllottedCoins(depositAmount, settings);
  }

  if (!Number.isFinite(depositAmount) || depositAmount <= 0) return null;

  const tier1Min = Number(settings.withdrawTier1MinDeposit ?? 5);
  const tier1Max = Number(settings.withdrawTier1MaxDeposit ?? 50);
  const tier1Mult = Number(settings.withdrawTier1Multiplier ?? 5);
  const tier2Mult = Number(settings.withdrawTier2Multiplier ?? 3);

  // Global multiplier basis fallback ('COINS' | 'DEPOSIT')
  const globalBasis = settings.withdrawMultiplierBasis ? String(settings.withdrawMultiplierBasis).toUpperCase() : null;

  // Tier 1 basis: default 'COINS' unless explicitly set or global basis is 'DEPOSIT'
  let tier1Basis = 'COINS';
  if (settings.withdrawTier1Basis) {
    tier1Basis = String(settings.withdrawTier1Basis).toUpperCase() === 'DEPOSIT' ? 'DEPOSIT' : 'COINS';
  } else if (globalBasis === 'DEPOSIT') {
    tier1Basis = 'DEPOSIT';
  }

  // Tier 2 basis: default 'DEPOSIT' (> $50 deposit multiplies deposit amount, not coins)
  // unless explicitly set to 'COINS' or global basis is set to 'COINS'
  let tier2Basis = 'DEPOSIT';
  if (settings.withdrawTier2Basis) {
    tier2Basis = String(settings.withdrawTier2Basis).toUpperCase() === 'COINS' ? 'COINS' : 'DEPOSIT';
  } else if (globalBasis === 'COINS') {
    tier2Basis = 'COINS';
  }

  // Fallback if allotted coins resulted in 0 or less
  if (allottedCoins <= 0) {
    allottedCoins = Math.max(1, Math.floor(depositAmount));
  }

  // Tier 1: deposit between $5 and $50 (inclusive)
  if (depositAmount >= tier1Min && depositAmount <= tier1Max) {
    const baseValue = tier1Basis === 'DEPOSIT' ? depositAmount : allottedCoins;
    const minWithdraw = Math.round(baseValue * tier1Mult * 100) / 100;
    return {
      minWithdraw,
      multiplier: tier1Mult,
      basis: tier1Basis,
      baseValue,
      allottedCoins,
      depositAmount,
      tier: 1
    };
  }

  // Tier 2: deposit strictly above $50
  if (depositAmount > tier1Max) {
    const baseValue = tier2Basis === 'DEPOSIT' ? depositAmount : allottedCoins;
    const minWithdraw = Math.round(baseValue * tier2Mult * 100) / 100;
    return {
      minWithdraw,
      multiplier: tier2Mult,
      basis: tier2Basis,
      baseValue,
      allottedCoins,
      depositAmount,
      tier: 2
    };
  }

  // Under tier 1 min (e.g. deposit < $5)
  return null;
}

export function getDepositBasedMinWithdraw(lastDepositOrAmount, settings = {}) {
  const rule = getDepositWithdrawRule(lastDepositOrAmount, settings);
  return rule ? rule.minWithdraw : null;
}

export function findLastSuccessDeposit(transactions, { userEmail, gameTitle } = {}) {
  const email = String(userEmail || '').toLowerCase().trim();
  const game = String(gameTitle || '').toLowerCase().trim();
  const filterRows = (matchGame) => (Array.isArray(transactions) ? transactions : [])
    .filter((t) => {
      if (String(t.type || '').toUpperCase() !== 'DEPOSIT') return false;
      if (String(t.status || '').toUpperCase() !== 'SUCCESS') return false;
      if (email && String(t.userEmail || '').toLowerCase().trim() !== email) return false;
      if (matchGame && game && String(t.gameTitle || '').toLowerCase().trim() !== game) return false;
      return true;
    })
    .sort((a, b) => {
      const ta = Date.parse(a.createdAt || a.date || 0) || 0;
      const tb = Date.parse(b.createdAt || b.date || 0) || 0;
      if (tb !== ta) return tb - ta;
      return String(b.id || '').localeCompare(String(a.id || ''));
    });

  const withGame = filterRows(true);
  if (withGame.length > 0) return withGame[0];
  const anyDeposit = filterRows(false);
  return anyDeposit[0] || null;
}
