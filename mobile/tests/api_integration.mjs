/**
 * Probes the mobile↔backend integration layer at its edges.
 *
 * Uses the real src/api/client.js logic, with only BASE_URL repointed at localhost
 * (that line is config, not behaviour). Everything else — headers, token handling,
 * response parsing, error mapping — is exactly what ships.
 */
import http from 'node:http';
import fs from 'node:fs';
import AsyncStorageMock from './storage.mjs';

const BASE_URL = process.env.TEST_URL || 'http://localhost:3000/api';
process.env.EXPO_PUBLIC_API_URL = BASE_URL;

/**
 * Load the REAL src/api/client.js. The only edit is swapping the AsyncStorage import
 * for a mock, since that module cannot load outside React Native — the request logic
 * under test is byte-identical to what ships.
 */
const CLIENT = new URL('../src/api/client.js', import.meta.url).pathname;
const source = fs.readFileSync(CLIENT, 'utf8')
  .replace(/import AsyncStorage from '@react-native-async-storage\/async-storage';/,
           "import AsyncStorage from '" + new URL('./storage.mjs', import.meta.url).href + "';");
const TMP = new URL('./_client_under_test.mjs', import.meta.url).pathname;
fs.writeFileSync(TMP, source);
const clientMod = await import('./_client_under_test.mjs?v=' + Date.now());
const request = clientMod.default;
const { setUnauthorisedHandler } = clientMod;

let pass = 0, fail = 0;
const findings = [];
function check(label, ok, detail) {
  if (ok) { pass++; console.log(`  ok    ${label}`); }
  else { fail++; console.log(`  ISSUE ${label}\n          ${detail}`); findings.push([label, detail]); }
}

const stamp = Date.now();

console.log('\n━━━ HAPPY PATH ━━━');
const reg = await fetch(`${BASE_URL}/auth/register`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: `probe.${stamp}@example.com`, password: 'Password123', name: `Probe ${stamp}` }),
}).then((r) => r.json());
await AsyncStorageMock.setItem('token', reg.token);

try {
  const me = await request('/profile');
  check('authenticated GET works and attaches the token', me.user.name === `Probe ${stamp}`, JSON.stringify(me).slice(0, 120));
} catch (e) { check('authenticated GET works', false, e.message); }

console.log('\n━━━ EDGE CASES THE CLIENT HAS TO SURVIVE ━━━');

// 1. a server error page that is not JSON
const htmlServer = http.createServer((req, res) => {
  res.writeHead(502, { 'Content-Type': 'text/html' });
  res.end('<html><body>502 Bad Gateway</body></html>');
});
await new Promise((r) => htmlServer.listen(4711, r));
process.env.EXPO_PUBLIC_API_URL = 'http://localhost:4711/api';
let htmlMod = await import('./_client_under_test.mjs?v=html' + Date.now());
try {
  await htmlMod.default('/profile');
  check('non-JSON error response surfaces a useful message', false, 'expected it to throw');
} catch (e) {
  const useful = !/JSON|token '<'/i.test(e.message) && /server|trouble/i.test(e.message);
  check('non-JSON error response surfaces a useful message', useful, `client threw: "${e.message}"`);
}
htmlServer.close();

// 2. a response with no body at all
const emptyServer = http.createServer((req, res) => { res.writeHead(204); res.end(); });
await new Promise((r) => emptyServer.listen(4712, r));
process.env.EXPO_PUBLIC_API_URL = 'http://localhost:4712/api';
let emptyMod = await import('./_client_under_test.mjs?v=empty' + Date.now());
try {
  const out = await emptyMod.default('/x');
  check('empty (204) response is handled', out === null, `returned: ${JSON.stringify(out)}`);
} catch (e) {
  check('empty (204) response is handled', false, `a 204 threw "${e.message}"`);
}
emptyServer.close();

// 3. backend unreachable — the single most common case in dev
process.env.EXPO_PUBLIC_API_URL = 'http://localhost:4799/api';
let deadMod = await import('./_client_under_test.mjs?v=dead' + Date.now());
try {
  await deadMod.default('/profile');
  check('unreachable backend gives a friendly message', false, 'expected a network failure');
} catch (e) {
  const friendly = /could not reach/i.test(e.message) && !/fetch failed/i.test(e.message);
  check('unreachable backend gives a friendly message', friendly, `client threw: "${e.message}"`);
}

// 4. expired or invalid token mid-session
process.env.EXPO_PUBLIC_API_URL = BASE_URL;
let authMod = await import('./_client_under_test.mjs?v=auth' + Date.now());
let signedOut = false;
authMod.setUnauthorisedHandler(() => { signedOut = true; });
await AsyncStorageMock.setItem('token', 'not-a-real-token');
let threw = '';
try { await authMod.default('/profile'); } catch (e) { threw = e.message; }
const tokenAfter = await AsyncStorageMock.getItem('token');
check('a rejected token clears the stored token', tokenAfter === null, `token still stored: ${tokenAfter}`);
check('a rejected token tells the app to sign out', signedOut, 'the unauthorised handler was never called');
check('the 401 message is understandable', /session|sign in/i.test(threw), `threw: "${threw}"`);
await AsyncStorageMock.setItem('token', reg.token);

// 5. a request that never comes back
const sockets = new Set();
const hangServer = http.createServer(() => { /* never responds */ });
hangServer.on('connection', (s) => sockets.add(s));
await new Promise((r) => hangServer.listen(4713, r));
const clientSource = fs.readFileSync(CLIENT, 'utf8');
const timeoutMatch = clientSource.match(/TIMEOUT_MS = (\d+)/);
const hasAbort = /AbortController/.test(clientSource) && /signal: controller\.signal/.test(clientSource);
check('the client sets a timeout so a screen cannot spin forever',
  hasAbort && timeoutMatch && Number(timeoutMatch[1]) > 0 && Number(timeoutMatch[1]) <= 30000,
  `AbortController wired: ${hasAbort}, timeout: ${timeoutMatch?.[1] ?? 'none'}`);

// prove the abort path produces a readable message, without waiting the full timeout
process.env.EXPO_PUBLIC_API_URL = 'http://localhost:4713/api';
const shortSource = clientSource.replace(/TIMEOUT_MS = \d+/, 'TIMEOUT_MS = 800')
  .replace(/import AsyncStorage from '@react-native-async-storage\/async-storage';/,
           "import AsyncStorage from '" + new URL('./storage.mjs', import.meta.url).href + "';");
fs.writeFileSync(new URL('./_client_short.mjs', import.meta.url).pathname, shortSource);
const shortMod = await import('./_client_short.mjs?v=' + Date.now());
const started = Date.now();
let timeoutMsg = '';
try { await shortMod.default('/x'); } catch (e) { timeoutMsg = e.message; }
check('a hung request gives up with a readable message',
  /too long|connection/i.test(timeoutMsg) && Date.now() - started < 3000,
  `after ${Date.now() - started}ms threw: "${timeoutMsg}"`);
for (const s of sockets) s.destroy();
hangServer.close();

// 6. BASE_URL is a hardcoded LAN address
const realClient = fs.readFileSync(CLIENT, 'utf8');
const configurable = /process\.env\.EXPO_PUBLIC_API_URL/.test(realClient);
check('BASE_URL can be set without editing the file', configurable,
  'BASE_URL is hardcoded, so the app only works on the network its author was on');

console.log('\n━━━ CONTRACT: does the client match what the API actually returns? ━━━');

// error bodies: every endpoint should use { error } so client.js can surface it
const errorSamples = await Promise.all([
  fetch(`${BASE_URL}/profile`).then((r) => r.json()),
  fetch(`${BASE_URL}/runs/999999`, { headers: { Authorization: `Bearer ${reg.token}` } }).then((r) => r.json()),
  fetch(`${BASE_URL}/fitness-plans`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${reg.token}` }, body: '{}' }).then((r) => r.json()),
  fetch(`${BASE_URL}/nope`).then((r) => r.json()),
]);
check('every error response uses the { error } shape client.js reads',
  errorSamples.every((s) => typeof s.error === 'string'),
  `got: ${JSON.stringify(errorSamples).slice(0, 200)}`);

console.log(`\n${'─'.repeat(66)}\n  ${pass} checks passed, ${fail} issues found\n${'─'.repeat(66)}`);
if (findings.length) {
  console.log('\nISSUES:');
  findings.forEach(([l, d], i) => console.log(`  ${i + 1}. ${l}\n     ${d}\n`));
}
process.exit(0);
