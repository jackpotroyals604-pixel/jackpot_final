/**
 * Diagnose native (APK) push subscriptions WITHOUT notifying anyone.
 * Uses Firebase dryRun to check which stored tokens are still valid.
 *
 * Usage: node scripts/push-diagnose.mjs
 */
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
import { MongoClient } from 'mongodb';
import { createPrivateKey } from 'crypto';
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(__dirname, '..', '.env.local');

function loadEnv() {
  try {
    const raw = readFileSync(envPath, 'utf8');
    for (const line of raw.split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !process.env[m[1]]) {
        let val = m[2].trim();
        if (
          (val.startsWith('"') && val.endsWith('"')) ||
          (val.startsWith("'") && val.endsWith("'"))
        ) {
          val = val.slice(1, -1).trim();
        }
        process.env[m[1]] = val;
      }
    }
  } catch { /* ignore */ }
}
loadEnv();

function normalize(sa) {
  if (sa && typeof sa.private_key === 'string') sa.private_key = sa.private_key.replace(/\\n/g, '\n');
  return sa;
}
function keyOk(sa) { try { createPrivateKey(sa.private_key); return true; } catch { return false; } }
function getServiceAccount() {
  const c = [];
  if (process.env.FIREBASE_SERVICE_ACCOUNT_B64) { try { c.push(normalize(JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_B64, 'base64').toString('utf8')))); } catch {} }
  if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) { try { c.push(normalize(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON))); } catch {} }
  return c.find(keyOk) || c[0] || null;
}

function fmt(d) { return d ? new Date(d).toLocaleString() : '—'; }

async function main() {
  const client = new MongoClient(process.env.MONGODB_URI);
  await client.connect();
  const db = client.db();

  const allSubs = await db.collection('pushSubscriptions').find({}).sort({ updatedAt: -1, createdAt: -1 }).toArray();
  const nativeSubs = allSubs.filter((s) => s.type === 'native' && s.nativeToken);
  const webSubs = allSubs.filter((s) => s.type !== 'native' && s.subscription);

  const adminEmails = new Set([
    process.env.ADMIN_EMAIL,
    process.env.NEXT_PUBLIC_ADMIN_EMAIL
  ].map((e) => String(e || '').toLowerCase().trim()).filter(Boolean));

  const staffSubs = allSubs.filter((s) => s.audience === 'staff' || adminEmails.has(String(s.userEmail || '').toLowerCase().trim()));
  const distributorSubs = allSubs.filter((s) => s.audience === 'distributor');
  const playerSubs = allSubs.filter((s) => !staffSubs.includes(s) && !distributorSubs.includes(s));

  console.log('====================================================');
  console.log('       📱 PUSH NOTIFICATION DEVICES SUMMARY         ');
  console.log('====================================================');
  console.log(`Total Registered Devices:  ${allSubs.length}`);
  console.log(`  - Android/iOS Native APK: ${nativeSubs.length}`);
  console.log(`  - Web Push (Browsers):    ${webSubs.length}`);
  console.log('----------------------------------------------------');
  console.log(`Breakdown by Audience:`);
  console.log(`  - 👔 Staff / Admin:       ${staffSubs.length} device(s)`);
  console.log(`  - 🏢 Distributors:        ${distributorSubs.length} device(s)`);
  console.log(`  - 🎮 Players:             ${playerSubs.length} device(s)`);
  console.log('====================================================\n');

  console.log('--- 👔 STAFF / ADMIN REGISTERED DEVICES ---');
  if (staffSubs.length === 0) {
    console.log('No staff devices registered yet.');
  } else {
    staffSubs.forEach((s, idx) => {
      const type = s.type === 'native' ? 'APK' : 'WEB';
      console.log(` ${idx + 1}. [${type}] ${String(s.userEmail || '—').padEnd(30)} updated:${fmt(s.updatedAt || s.createdAt)}`);
    });
  }

  console.log('\n--- 🏢 DISTRIBUTOR REGISTERED DEVICES ---');
  if (distributorSubs.length === 0) {
    console.log('No distributor devices registered yet.');
  } else {
    distributorSubs.forEach((s, idx) => {
      const type = s.type === 'native' ? 'APK' : 'WEB';
      console.log(` ${idx + 1}. [${type}] Dist:${String(s.distributorId || '—').padEnd(10)} ${String(s.userEmail || '—').padEnd(25)} updated:${fmt(s.updatedAt || s.createdAt)}`);
    });
  }

  // Verify Native APK Tokens with Firebase dryRun
  const sa = getServiceAccount();
  if (sa && nativeSubs.length > 0) {
    console.log('\n--- 🔍 FIREBASE APK TOKEN HEALTH CHECK (dryRun) ---');
    const app = getApps().length ? getApps()[0] : initializeApp({ credential: cert(sa) });
    const messaging = getMessaging(app);

    let validCount = 0;
    for (const s of nativeSubs) {
      let state = 'unknown';
      try {
        await messaging.send(
          { token: s.nativeToken, notification: { title: 't', body: 'b' }, android: { notification: { channelId: 'jackpot_promotions' } } },
          true // dryRun — validates only, delivers nothing
        );
        state = 'VALID';
        validCount += 1;
      } catch (e) {
        state = e.code || e.message;
      }
      console.log(
        `${state.padEnd(42)} [${(s.audience || 'player').toUpperCase().padEnd(11)}] ${String(s.userEmail || '—').padEnd(28)} …${String(s.nativeToken || '').slice(-10)}`
      );
    }
    console.log(`\nActive/Valid APK Tokens: ${validCount} / ${nativeSubs.length}`);
  }

  await client.close();
  console.log('\nDone.');
}

main().catch((e) => { console.error(e); process.exit(1); });
