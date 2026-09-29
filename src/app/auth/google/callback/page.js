'use client';

import { useEffect, useState } from 'react';
import { getDevicePayload } from '../../../../lib/deviceId';

async function completeGoogleFromToken(accessToken, sid) {
  const profileRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  const profile = await profileRes.json();
  if (!profile.email) {
    throw new Error('Google profile email was missing.');
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
    throw new Error(googleData.message || 'Google sign-in failed.');
  }

  if (sid) {
    const completeRes = await fetch('/api/auth/google/ticket', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mode: 'complete',
        sid,
        user: googleData.user,
        isNewUser: googleData.isNewUser
      })
    });
    const completeData = await completeRes.json();
    if (!completeRes.ok || !completeData.success) {
      throw new Error(completeData.message || 'Could not finish Google sign-in.');
    }
    return { mode: 'session', sid };
  }

  const ticketRes = await fetch('/api/auth/google/ticket', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ user: googleData.user, isNewUser: googleData.isNewUser })
  });
  const ticketData = await ticketRes.json();
  if (!ticketRes.ok || !ticketData.ticket) {
    throw new Error(ticketData.message || 'Could not finish Google sign-in.');
  }
  return { mode: 'ticket', ticket: ticketData.ticket };
}

export default function GoogleOAuthCallbackPage() {
  const [status, setStatus] = useState('Signing you in with Google…');
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const hash = window.location.hash.startsWith('#')
          ? window.location.hash.slice(1)
          : window.location.hash;
        const hashParams = new URLSearchParams(hash);
        const queryParams = new URLSearchParams(window.location.search);
        const accessToken = hashParams.get('access_token') || queryParams.get('access_token');
        const sid = hashParams.get('state') || queryParams.get('state') || '';
        const err = hashParams.get('error') || queryParams.get('error');
        if (err) throw new Error('Google sign-in was cancelled.');
        if (!accessToken) throw new Error('Missing Google access token.');

        const result = await completeGoogleFromToken(accessToken, sid);
        if (cancelled) return;

        if (result.mode === 'session') {
          setStatus('Signed in! Return to the Jackpot Royals app — login will finish automatically.');
          return;
        }

        setStatus('Signed in. Returning to Jackpot Royals…');
        window.location.replace(
          `${window.location.origin}/login?google_ticket=${encodeURIComponent(result.ticket)}`
        );
      } catch (err) {
        if (cancelled) return;
        setError(err.message || 'Google sign-in failed.');
        setStatus('Could not complete Google sign-in.');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'grid',
        placeItems: 'center',
        padding: '2rem',
        background: '#080a11',
        color: '#fff',
        fontFamily: 'system-ui, sans-serif',
        textAlign: 'center'
      }}
    >
      <div style={{ maxWidth: 420 }}>
        <h1 style={{ fontSize: '1.35rem', marginBottom: '0.75rem' }}>Jackpot Royals</h1>
        <p style={{ color: error ? '#f87171' : '#cbd5e1', marginBottom: '1.25rem' }}>
          {error || status}
        </p>
        {!error && (
          <p style={{ color: '#94a3b8', fontSize: '0.9rem' }}>
            You can close this tab and go back to the app.
          </p>
        )}
        {error && (
          <a href="/login" style={{ color: '#f5d76e', fontWeight: 600 }}>
            Back to login
          </a>
        )}
      </div>
    </main>
  );
}
