/**
 * Tests the connection flow (RU-16, RU-49) against a stub that behaves like a real OAuth
 * provider. This container cannot reach Fitbit, so the stub stands in for it — what is
 * proven is the handshake, state handling, token storage, refresh, sync, dedup and every
 * failure path. The live provider is NOT exercised.
 */
import http from 'node:http';
import { execSync } from 'node:child_process';

const BASE = process.env.TEST_URL || 'http://localhost:3000/api';
const DB = process.env.TEST_DB || 'run_league_verify';
let pass = 0, fail = 0;

async function api(path, { method = 'GET', token, body, redirect = 'follow' } = {}) {
  const h = { 'Content-Type': 'application/json' };
  if (token) h.Authorization = `Bearer ${token}`;
  const r = await fetch(`${BASE}${path}`, { method, headers: h, body: body ? JSON.stringify(body) : undefined, redirect });
  const text = await r.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = { html: text }; }
  return { status: r.status, data };
}
// Plain `psql` on PATH, so this works on macOS and Linux alike. Set PGUSER / PGPASSWORD /
// PGHOST in the environment if your PostgreSQL needs them (match the DB_* values in .env).
const sql = (q) =>
  execSync(`psql -t -A -d ${DB} -f -`, {
    input: q,
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
  }).trim();
function check(label, ok, detail) {
  if (ok) { pass++; console.log(`  ok   ${label}`); }
  else { fail++; console.log(`  FAIL ${label}\n         ${detail}`); }
}

// ── the stub provider ──
let issuedCode = null, tokenCalls = [], activityCalls = [], mode = 'ok';
const provider = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost:4901');

  if (url.pathname === '/oauth2/authorize') {
    // A real provider shows a consent page; we just record what was asked for.
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(Object.fromEntries(url.searchParams)));
    return;
  }

  if (url.pathname === '/oauth2/token') {
    const body = await new Promise((r) => { let b = ''; req.on('data', (c) => b += c); req.on('end', () => r(b)); });
    const params = Object.fromEntries(new URLSearchParams(body));
    tokenCalls.push({ params, auth: req.headers.authorization });
    if (mode === 'reject-code') {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ errors: [{ message: 'Invalid authorization code' }], error_description: 'Invalid authorization code' }));
      return;
    }
    const isRefresh = params.grant_type === 'refresh_token';
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      access_token: isRefresh ? 'refreshed-access-token' : 'stub-access-token',
      refresh_token: isRefresh ? 'refreshed-refresh-token' : 'stub-refresh-token',
      expires_in: mode === 'short-token' ? 1 : 28800,
      scope: 'activity heartrate profile',
      user_id: 'STUBUSER1',
    }));
    return;
  }

  if (url.pathname === '/oauth2/revoke') { res.writeHead(200); res.end('{}'); return; }

  if (url.pathname.startsWith('/1/user/-/activities/list.json')) {
    activityCalls.push({ url: req.url, auth: req.headers.authorization });
    if (mode === 'activities-fail') { res.writeHead(401, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ errors: [{ message: 'Expired token' }] })); return; }
    // Fitbit's documented activity-log shape
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ activities: [
      { logId: 111, activityName: 'Run', distance: 8.2, distanceUnit: 'Kilometer', activeDuration: 2_700_000,
        calories: 560, averageHeartRate: 154, startTime: new Date(Date.now() - 2 * 86400000).toISOString(),
        heartRateZones: [{ max: 120 }, { max: 150 }, { max: 178 }] },
      { logId: 222, activityName: 'Run', distance: 5.0, distanceUnit: 'Kilometer', activeDuration: 1_500_000,
        calories: 330, averageHeartRate: 146, startTime: new Date(Date.now() - 86400000).toISOString() },
      { logId: 333, activityName: 'Yoga', distance: 0, distanceUnit: 'Kilometer', activeDuration: 1_800_000,
        calories: 90, startTime: new Date().toISOString() },   // not a run — must be skipped
    ] }));
    return;
  }
  res.writeHead(404); res.end('{}');
});
await new Promise((r) => provider.listen(4901, r));

// ── a user ──
const stamp = Date.now();
const email = `oauth.${stamp}@example.com`;
const reg = await api('/auth/register', { method: 'POST', body: { email, password: 'Password123', name: `OAuth ${stamp}` } });
const tok = reg.data.token;
const userId = reg.data.user.userId;

console.log('\n━━━ WITHOUT CREDENTIALS, NOTHING PRETENDS TO WORK ━━━');
let list = await api('/connections', { token: tok });
check('listing works whatever is configured', list.status === 200 && Array.isArray(list.data.providers), JSON.stringify(list.data).slice(0, 120));

// Asserted against a provider with no credentials on this server, so the check holds
// regardless of which ones happen to be set up.
const unconfigured = list.data.providers.find((p) => !p.available && !p.onDevice);
check('at least one provider is unconfigured, to test against', !!unconfigured, 'every provider is configured — cannot test the unconfigured path');
check('an unconfigured provider is reported unavailable', unconfigured.available === false, JSON.stringify(unconfigured));
check('and says why, in plain words', /administrator needs to add/.test(unconfigured.unavailableReason), unconfigured.unavailableReason);
const startUnconfigured = await api(`/connections/${unconfigured.provider}/connect`, { method: 'POST', token: tok });
check('connecting an unconfigured provider is refused cleanly', startUnconfigured.status === 503, JSON.stringify(startUnconfigured.data));

const apple = list.data.wearables.find((p) => p.provider === 'apple_health');
check('Apple Health is listed but explained as on-device', apple.onDevice === true && /native build/.test(apple.unavailableReason), JSON.stringify(apple));
check('Apple Health cannot be started', (await api('/connections/apple_health/connect', { method: 'POST', token: tok })).status === 400);
check('an unknown provider 404s', (await api('/connections/nonsense/connect', { method: 'POST', token: tok })).status === 404);

console.log('\n━━━ WITH CREDENTIALS: THE HANDSHAKE ━━━');
console.log('  (server restarted with stub Fitbit credentials)');

list = await api('/connections', { token: tok });
const fb = list.data.wearables.find((p) => p.provider === 'fitbit');
check('the provider is now available', fb.available === true, JSON.stringify(fb));

const start = await api('/connections/fitbit/connect', { method: 'POST', token: tok });
check('starting returns an authorize URL', start.status === 200 && start.data.authorizeUrl.includes('/oauth2/authorize'), JSON.stringify(start.data).slice(0, 160));
const authUrl = new URL(start.data.authorizeUrl);
check('it carries our client id', authUrl.searchParams.get('client_id') === 'stub-client-id', authUrl.search);
check('it asks for the documented scopes', authUrl.searchParams.get('scope') === 'activity heartrate profile', authUrl.search);
check('it uses PKCE (challenge sent, not the secret)', authUrl.searchParams.get('code_challenge_method') === 'S256' && !!authUrl.searchParams.get('code_challenge'), authUrl.search);
check('the redirect URI matches what we would register', authUrl.searchParams.get('redirect_uri').endsWith('/connections/fitbit/callback'), authUrl.search);
const state = authUrl.searchParams.get('state');
check('a state was issued and stored', !!state && sql(`SELECT COUNT(*) FROM oauth_states WHERE state='${state}'`) === '1', state);
check('nothing is connected yet', sql(`SELECT COUNT(*) FROM connected_wearables WHERE user_id=${userId}`) === '0');

console.log('\n━━━ THE CALLBACK ━━━');
tokenCalls = [];
const cb = await api(`/connections/fitbit/callback?code=THECODE&state=${encodeURIComponent(state)}`);
check('the callback returns a page the browser can show', cb.status === 200 && /Fitbit connected/.test(cb.data.html ?? ''), String(cb.status));
check('the code was exchanged for tokens', tokenCalls.length === 1 && tokenCalls[0].params.grant_type === 'authorization_code', JSON.stringify(tokenCalls));
check('the PKCE verifier was sent', !!tokenCalls[0].params.code_verifier, JSON.stringify(tokenCalls[0].params));
check('the secret went as HTTP Basic, not in the URL', /^Basic /.test(tokenCalls[0].auth ?? ''), tokenCalls[0].auth);
check('the connection is stored', sql(`SELECT COUNT(*) FROM connected_wearables WHERE user_id=${userId} AND provider='fitbit'`) === '1');
check('the expiry was recorded', sql(`SELECT expires_at IS NOT NULL FROM connected_wearables WHERE user_id=${userId}`) === 't');
check('the provider account id was recorded', sql(`SELECT provider_user_id FROM connected_wearables WHERE user_id=${userId}`) === 'STUBUSER1');
check('the state was consumed', sql(`SELECT COUNT(*) FROM oauth_states WHERE state='${state}'`) === '0');

console.log('\n━━━ THE STATE IS WHAT KEEPS THIS SAFE ━━━');
check('a reused state is rejected', /expired/i.test((await api(`/connections/fitbit/callback?code=X&state=${encodeURIComponent(state)}`)).data.html ?? ''));
check('an unknown state is rejected', /expired/i.test((await api('/connections/fitbit/callback?code=X&state=made-up')).data.html ?? ''));
check('a missing code is rejected', /missing information/i.test((await api('/connections/fitbit/callback?state=x')).data.html ?? ''));
const denied = await api('/connections/fitbit/callback?error=access_denied&state=whatever');
check('a denied consent is explained, not treated as an error', /cancelled/i.test(denied.data.html ?? ''), String(denied.status));

console.log('\n━━━ TOKENS ARE NEVER HANDED BACK TO THE APP ━━━');
list = await api('/connections', { token: tok });
const connected = list.data.wearables.find((p) => p.provider === 'fitbit');
check('the connection shows as connected', connected.connected === true, JSON.stringify(connected));
check('no access token is in the response', !JSON.stringify(list.data).includes('stub-access-token'), 'token leaked into the API response');
check('no refresh token either', !JSON.stringify(list.data).includes('stub-refresh-token'), 'refresh token leaked');

console.log('\n━━━ RU-16: IMPORTING ACTIVITIES ━━━');
activityCalls = [];
const sync1 = await api('/connections/fitbit/sync', { method: 'POST', token: tok });
check('sync reports what it imported', sync1.status === 200 && sync1.data.imported === 2, JSON.stringify(sync1.data));
check('it called the activity endpoint with a bearer token', activityCalls.length === 1 && /^Bearer /.test(activityCalls[0].auth), JSON.stringify(activityCalls[0]?.auth));
check('non-running activities are skipped', sql(`SELECT COUNT(*) FROM runs WHERE user_id=${userId} AND source='fitbit'`) === '2');
check('distance came through', sql(`SELECT distance_km FROM runs WHERE user_id=${userId} AND external_id='111'`) === '8.20');
check('duration converted from ms to seconds', sql(`SELECT duration_seconds FROM runs WHERE user_id=${userId} AND external_id='111'`) === '2700');
check('heart rate came through (RU-18)', sql(`SELECT avg_heart_rate FROM runs WHERE user_id=${userId} AND external_id='111'`) === '154');
check('max HR derived from the zones', sql(`SELECT max_heart_rate FROM runs WHERE user_id=${userId} AND external_id='111'`) === '178');
check('calories came through (RU-17)', sql(`SELECT calories_burned FROM runs WHERE user_id=${userId} AND external_id='111'`) === '560');

const sync2 = await api('/connections/fitbit/sync', { method: 'POST', token: tok });
check('syncing again imports nothing new', sync2.data.imported === 0 && sync2.data.skipped === 2, JSON.stringify(sync2.data));
check('and creates no duplicate runs', sql(`SELECT COUNT(*) FROM runs WHERE user_id=${userId} AND source='fitbit'`) === '2');
check('the sync time was recorded', sql(`SELECT last_synced_at IS NOT NULL FROM connected_wearables WHERE user_id=${userId}`) === 't');

console.log('\n━━━ IMPORTED RUNS FEED THE REST OF THE APP ━━━');
const insights = await api('/runs/insights', { token: tok });
check('imported calories reach RU-17', insights.data.calories.totalCalories === 890, JSON.stringify(insights.data.calories));
check('imported heart rate reaches RU-18', insights.data.heartRate.maxHeartRate === 178, JSON.stringify(insights.data.heartRate));
check('imported distance reaches RU-19 trends', insights.data.trends.shortTerm.current.distanceKm === 13.2, JSON.stringify(insights.data.trends.shortTerm.current));
const history = await api('/runs', { token: tok });
check('imported runs appear in run history (RU-06)', history.data.runs.length === 2, `${history.data.runs.length} runs`);

console.log('\n━━━ EXPIRED TOKENS REFRESH THEMSELVES ━━━');
sql(`UPDATE connected_wearables SET expires_at = NOW() - INTERVAL '1 hour' WHERE user_id=${userId}`);
tokenCalls = [];
const afterExpiry = await api('/connections/fitbit/sync', { method: 'POST', token: tok });
check('an expired token triggers a refresh', tokenCalls.some((c) => c.params.grant_type === 'refresh_token'), JSON.stringify(tokenCalls.map((c) => c.params.grant_type)));
check('the sync still succeeds', afterExpiry.status === 200, JSON.stringify(afterExpiry.data));
check('the new token was stored', sql(`SELECT access_token FROM connected_wearables WHERE user_id=${userId}`) === 'refreshed-access-token');

sql(`UPDATE connected_wearables SET expires_at = NOW() - INTERVAL '1 hour', refresh_token = NULL WHERE user_id=${userId}`);
const noRefresh = await api('/connections/fitbit/sync', { method: 'POST', token: tok });
check('an expired token with no refresh asks the user to reconnect', noRefresh.status === 401 && /reconnect/i.test(noRefresh.data.error), JSON.stringify(noRefresh.data));
check('the failure is recorded against the connection', sql(`SELECT last_sync_error IS NOT NULL FROM connected_wearables WHERE user_id=${userId}`) === 't');

console.log('\n━━━ PROVIDER FAILURES SURFACE, NOT CRASH ━━━');
sql(`UPDATE connected_wearables SET expires_at = NOW() + INTERVAL '8 hours', refresh_token='stub-refresh-token' WHERE user_id=${userId}`);
mode = 'activities-fail';
const failed = await api('/connections/fitbit/sync', { method: 'POST', token: tok });
check('a provider error becomes a readable message', failed.status === 502 && /could not be reached/i.test(failed.data.error), JSON.stringify(failed.data));
mode = 'ok';

console.log('\n━━━ A PROVIDER WITH NO IMPORTER SAYS SO ━━━');
sql(`INSERT INTO connected_wearables (user_id, provider, access_token) VALUES (${userId}, 'garmin', 'x') ON CONFLICT (user_id, provider) DO NOTHING`);
const noAdapter = await api('/connections/garmin/sync', { method: 'POST', token: tok });
check('an unimplemented importer returns 501, not a lie', noAdapter.status === 501 && /not supported yet/i.test(noAdapter.data.error), JSON.stringify(noAdapter.data));

console.log('\n━━━ DISCONNECTING ━━━');
const disc = await api('/connections/fitbit', { method: 'DELETE', token: tok });
check('disconnect succeeds', disc.status === 200, JSON.stringify(disc.data));
check('the row is gone', sql(`SELECT COUNT(*) FROM connected_wearables WHERE user_id=${userId} AND provider='fitbit'`) === '0');
check('already-imported runs are kept', sql(`SELECT COUNT(*) FROM runs WHERE user_id=${userId} AND source='fitbit'`) === '2');
check('disconnecting again 404s', (await api('/connections/fitbit', { method: 'DELETE', token: tok })).status === 404);

console.log('\n━━━ SCOPING AND AUTH ━━━');
check('connections require a token', (await api('/connections')).status === 401);
check('sync requires a token', (await api('/connections/fitbit/sync', { method: 'POST' })).status === 401);
const other = await api('/auth/register', { method: 'POST', body: { email: `other.${stamp}@example.com`, password: 'Password123', name: 'Other' } });
const otherList = await api('/connections', { token: other.data.token });
check("one user cannot see another's connections", otherList.data.wearables.every((p) => !p.connected), JSON.stringify(otherList.data.wearables.map((p) => p.connected)));

provider.close();
console.log(`\n${'─'.repeat(64)}\n  ${pass} passed, ${fail} failed\n${'─'.repeat(64)}`);
process.exit(fail ? 1 : 0);
