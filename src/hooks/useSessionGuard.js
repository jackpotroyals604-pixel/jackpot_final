'use client';

import { useEffect, useRef } from 'react';

import { getDevicePayload } from '../lib/deviceId';

const SESSION_KEYS = [
  'jackpot_admin_session',
  'jackpot_session',
  'jackpot_distributor_session',
  'jackpot_agent_session'
];

function clearAllSessions() {
  for (const key of SESSION_KEYS) {
    try {
      localStorage.removeItem(key);
    } catch {
      /* ignore */
    }
  }
  try {
    localStorage.setItem('jackpot_session', 'null');
  } catch {
    /* ignore */
  }
}

function isClientProtectedSuperAdmin(email) {
  const clean = String(email || '').toLowerCase().trim();
  if (!clean) return true;
  const envEmail = String(process.env.NEXT_PUBLIC_ADMIN_EMAIL || '').toLowerCase().trim();
  return Boolean(envEmail && clean === envEmail);
}

/**
 * While logged in, poll session-status. If the account was deleted (or revoked),
 * wipe local sessions and hard-redirect to login — even if they never clicked Logout.
 */
export default function useSessionGuard(email, { redirectTo = '/login', intervalMs = 2500 } = {}) {
  const redirectingRef = useRef(false);

  useEffect(() => {
    const cleanEmail = String(email || '').toLowerCase().trim();
    // Super admin may only exist via env (not in DB). Never poll-kick them here;
    // session-status also treats them as always valid.
    if (!cleanEmail || isClientProtectedSuperAdmin(cleanEmail)) return undefined;

    let cancelled = false;
    let timer = null;

    const forceLogout = (reason) => {
      if (cancelled || redirectingRef.current) return;
      redirectingRef.current = true;
      clearAllSessions();
      try {
        window.dispatchEvent(new Event('jackpot-session-revoked'));
      } catch {
        /* ignore */
      }
      const q = reason ? `?reason=${encodeURIComponent(reason)}` : '';
      window.location.replace(`${redirectTo}${q}`);
    };

    const check = async () => {
      if (cancelled || redirectingRef.current) return;
      try {
        const { deviceId, deviceFingerprint } = getDevicePayload();
        const res = await fetch(
          `/api/auth/session-status?email=${encodeURIComponent(cleanEmail)}&deviceId=${encodeURIComponent(deviceId)}&deviceFingerprint=${encodeURIComponent(deviceFingerprint)}`,
          { cache: 'no-store' }
        );
        const data = await res.json().catch(() => null);
        if (!data || data.success === false) return; // transient server error — stay logged in
        if (data.valid === false) {
          forceLogout(data.reason || 'deleted');
        }
      } catch {
        /* network blip — ignore */
      }
    };

    check();
    timer = window.setInterval(check, intervalMs);

    const onVisible = () => {
      if (document.visibilityState === 'visible') check();
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      cancelled = true;
      if (timer) window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [email, redirectTo, intervalMs]);
}
