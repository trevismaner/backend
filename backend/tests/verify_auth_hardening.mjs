/**
 * The password rule and email verification, end to end against a real server.
 *
 *   npm run test:auth
 *
 * This suite starts its own server on a spare port with REQUIRE_EMAIL_VERIFICATION=true,
 * rather than using whichever one happens to be running. It has to: every other suite
 * registers users directly, so they need verification off, and this one needs it on. Running
 * its own instance keeps both true at once and means the suite works with no setup.
 *
 * No mail provider is configured under test, so the server returns the code in the response
 * as `devCode` — which it only ever does outside production and with no provider set. That
 * is what makes the flow completable here without a mail account.
 *
 * What is actually being checked, beyond the happy path: that a weak password is refused at
 * every entry point rather than just the new one, that a code cannot be guessed, reused,
 * moved to a different address, or forged from an ordinary login token, and that asking for
 * a code cannot be used to discover who already has an account.
 */
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const BACKEND = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.AUTH_TEST_PORT || 3101);
const BASE = `http://127.0.0.1:${PORT}/api`;
const STAMP = Date.now();

let passed = 0;
const failures = [];
const ok = (label, cond, detail = '') => {
  if (cond) { passed += 1; console.log(`  ok   ${label}`); }
  else { failures.push(label); console.log(`  FAIL ${label}${detail ? `\n       ${detail}` : ''}`); }
};

const dbEnv = {
  DB_HOST: process.env.DB_HOST || 'localhost',
  DB_PORT: process.env.DB_PORT || '5432',
  DB_NAME: process.env.DB_NAME || process.env.TEST_DB || 'run_league_verify',
  DB_USER: process.env.DB_USER || 'postgres',
  DB_PASSWORD: process.env.DB_PASSWORD || '',
};

let server;
async function startServer() {
  server = spawn(process.execPath, ['server.js'], {
    cwd: BACKEND,
    env: {
      ...process.env,
      ...dbEnv,
      PORT: String(PORT),
      NODE_ENV: 'test',
      REQUIRE_EMAIL_VERIFICATION: 'true',
      JWT_SECRET: process.env.JWT_SECRET || 'auth-suite-secret-not-for-real-use',
      // Deliberately no RESEND_API_KEY / SMTP_URL: console mode returns devCode.
      RESEND_API_KEY: '',
      SMTP_URL: '',
      DATABASE_URL: '',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let log = '';
  server.stdout.on('data', (d) => { log += d.toString(); });
  server.stderr.on('data', (d) => { log += d.toString(); });

  for (let i = 0; i < 40; i += 1) {
    await new Promise((r) => setTimeout(r, 400));
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/health/db`);
      if (res.ok) return true;
    } catch { /* not up yet */ }
  }
  console.error(`\n  Could not start a server on port ${PORT}.\n${log.split('\n').slice(-12).join('\n')}\n`);
  return false;
}

function stopServer() {
  if (server && !server.killed) server.kill();
}

async function call(pathname, { method = 'GET', body, token } = {}) {
  const res = await fetch(`${BASE}${pathname}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* non-JSON */ }
  return { status: res.status, body: json, raw: text };
}

const freshEmail = (tag) => `${tag}.${STAMP}.${Math.random().toString(36).slice(2, 7)}@example.com`;

/** Completes the verification dance and returns the proof token. */
async function verifiedToken(email) {
  const req = await call('/auth/verification/request', { method: 'POST', body: { email } });
  const code = req.body?.devCode;
  if (!code) throw new Error(`no devCode returned (status ${req.status}): ${req.raw.slice(0, 200)}`);
  const confirm = await call('/auth/verification/confirm', { method: 'POST', body: { email, code } });
  return { token: confirm.body?.verificationToken, code };
}

async function main() {
  console.log('\n━━━ password rule ━━━');

  const weakCases = [
    ['a', 'too short'],
    ['short1', 'still too short'],
    ['alllettershere', 'no number'],
    ['12345678901', 'no letter'],
    ['password123', 'a very common password'],
    ['Password123', 'a very common password, capitalised'],
    [' Trailspur42', 'leading space'],
    ['Trailspur42 ', 'trailing space'],
    ['x'.repeat(80) + '1', 'longer than bcrypt reads'],
  ];

  for (const [password, why] of weakCases) {
    const res = await call('/auth/register', {
      method: 'POST',
      body: { email: freshEmail('weak'), password, name: 'Weak Tester' },
    });
    ok(`refuses ${why}`, res.status === 400, `got ${res.status}: ${res.raw.slice(0, 140)}`);
  }

  // The personal-fragment rule needs the name and email to be in play.
  {
    const email = `strider.${STAMP}@example.com`;
    const res = await call('/auth/register', {
      method: 'POST',
      body: { email, password: 'strider9999', name: 'Pat Strider' },
    });
    ok('refuses a password containing the email name', res.status === 400, `got ${res.status}`);
  }
  {
    const res = await call('/auth/register', {
      method: 'POST',
      body: { email: freshEmail('nm'), password: 'Pemberton77', name: 'Ada Pemberton' },
    });
    ok('refuses a password containing the person\'s surname', res.status === 400, `got ${res.status}`);
  }

  // The rejection should say what is wrong and what the rules are, not just "invalid".
  {
    const res = await call('/auth/register', {
      method: 'POST',
      body: { email: freshEmail('msg'), password: 'abcdefgh', name: 'Msg Tester' },
    });
    ok('names the specific problem', /number/i.test(res.body?.error || ''), `error was: ${res.body?.error}`);
    ok('returns every problem, not only the first', Array.isArray(res.body?.problems), 'no problems array');
    ok('returns the policy so the client can display it',
      res.body?.policy?.minLength === 8 && Array.isArray(res.body?.policy?.requirements),
      `policy was: ${JSON.stringify(res.body?.policy)}`);
  }

  // Strong passwords must still get through.
  for (const password of ['Sprint7Harbour', 'quiet-otter-4471', 'Z3bra!Crossing']) {
    const email = freshEmail('good');
    const { token } = await verifiedToken(email);
    const res = await call('/auth/register', {
      method: 'POST',
      body: { email, password, name: 'Good Tester', verificationToken: token },
    });
    ok(`accepts ${password}`, res.status === 201, `got ${res.status}: ${res.raw.slice(0, 140)}`);
  }

  console.log('\n━━━ the rule applies at every entry point ━━━');
  // An admin creating a user, and an admin resetting a password, used to have their own
  // weaker check. They should now be refused the same things.
  {
    const adminEmail = freshEmail('suiteadmin');
    const { token: proof } = await verifiedToken(adminEmail);
    const reg = await call('/auth/register', {
      method: 'POST',
      body: { email: adminEmail, password: 'Sprint7Harbour', name: 'Suite Admin', verificationToken: proof },
    });
    const userId = reg.body?.user?.userId;

    const pool = new pg.Pool({
      host: dbEnv.DB_HOST, port: dbEnv.DB_PORT, database: dbEnv.DB_NAME,
      user: dbEnv.DB_USER, password: dbEnv.DB_PASSWORD,
    });
    await pool.query("UPDATE users SET role='system_admin' WHERE user_id = $1", [userId]);
    await pool.end();

    const login = await call('/auth/login', { method: 'POST', body: { email: adminEmail, password: 'Sprint7Harbour' } });
    const adminToken = login.body?.token;
    ok('the suite has an admin to test with', !!adminToken, `login gave ${login.status}`);

    const created = await call('/admin/users', {
      method: 'POST', token: adminToken,
      body: { email: freshEmail('adm'), name: 'Admin Made', password: 'password123', role: 'registered_user' },
    });
    ok('admin cannot create a user with a common password', created.status === 400, `got ${created.status}`);

    const reset = await call(`/admin/users/${userId}`, {
      method: 'PUT', token: adminToken, body: { password: 'short1' },
    });
    ok('admin cannot reset a password to a weak one', reset.status === 400, `got ${reset.status}`);
  }

  console.log('\n━━━ email verification: configuration ━━━');
  {
    const config = await call('/auth/config');
    ok('the config endpoint is readable without signing in', config.status === 200, `got ${config.status}`);
    ok('it reports verification as required', config.body?.emailVerification?.required === true,
      JSON.stringify(config.body?.emailVerification));
    ok('it publishes the password policy', config.body?.passwordPolicy?.minLength === 8,
      JSON.stringify(config.body?.passwordPolicy));
  }

  console.log('\n━━━ email verification: the flow ━━━');
  {
    const email = freshEmail('flow');

    const noProof = await call('/auth/register', {
      method: 'POST', body: { email, password: 'Sprint7Harbour', name: 'Flow Tester' },
    });
    ok('registering without verifying is refused', noProof.status === 403, `got ${noProof.status}`);
    ok('and says why, so the app can route back', noProof.body?.needsEmailVerification === true,
      JSON.stringify(noProof.body));

    const req = await call('/auth/verification/request', { method: 'POST', body: { email } });
    ok('requesting a code is accepted', req.status === 202, `got ${req.status}: ${req.raw.slice(0, 120)}`);
    ok('with no mail provider the code comes back for development', /^\d{6}$/.test(req.body?.devCode || ''),
      `devCode was: ${req.body?.devCode}`);
    const code = req.body.devCode;

    const wrong = await call('/auth/verification/confirm', { method: 'POST', body: { email, code: '000000' } });
    ok('a wrong code is refused', wrong.status === 400, `got ${wrong.status}`);
    ok('and the remaining attempts are counted down', wrong.body?.attemptsLeft === 4,
      `attemptsLeft was ${wrong.body?.attemptsLeft}`);
    ok('a wrong code does not report the code as expired',
      !/expired/i.test(wrong.body?.error || ''), `error was: ${wrong.body?.error}`);

    const right = await call('/auth/verification/confirm', { method: 'POST', body: { email, code } });
    ok('the correct code is accepted', right.status === 200, `got ${right.status}`);
    ok('and returns a proof token', typeof right.body?.verificationToken === 'string', 'no token');

    const reused = await call('/auth/verification/confirm', { method: 'POST', body: { email, code } });
    ok('the same code cannot be used twice', reused.status === 400, `got ${reused.status}`);

    const registered = await call('/auth/register', {
      method: 'POST',
      body: { email, password: 'Sprint7Harbour', name: 'Flow Tester', verificationToken: right.body.verificationToken },
    });
    ok('registering with the proof succeeds', registered.status === 201, `got ${registered.status}: ${registered.raw.slice(0, 140)}`);
    ok('and a token comes back, so the person is signed in', !!registered.body?.token, 'no login token');
  }

  console.log('\n━━━ email verification: the ways it could be cheated ━━━');
  {
    // A proof for one address must not register another.
    const mine = freshEmail('mine');
    const theirs = freshEmail('theirs');
    const { token } = await verifiedToken(mine);
    const swapped = await call('/auth/register', {
      method: 'POST',
      body: { email: theirs, password: 'Sprint7Harbour', name: 'Swapper', verificationToken: token },
    });
    ok('a proof for one address will not register a different one', swapped.status === 403, `got ${swapped.status}`);
  }
  {
    // An ordinary login token is signed with the same secret. Without the purpose claim
    // being checked, it would be accepted here.
    const email = freshEmail('purpose');
    const { token: proof } = await verifiedToken(email);
    const reg = await call('/auth/register', {
      method: 'POST', body: { email, password: 'Sprint7Harbour', name: 'Purpose Tester', verificationToken: proof },
    });
    const loginToken = reg.body?.token;
    const other = freshEmail('purpose2');
    const abused = await call('/auth/register', {
      method: 'POST',
      body: { email: other, password: 'Sprint7Harbour', name: 'Abuser', verificationToken: loginToken },
    });
    ok('a login token is not accepted as a verification proof', abused.status === 403, `got ${abused.status}`);
  }
  {
    const garbage = await call('/auth/register', {
      method: 'POST',
      body: { email: freshEmail('garbage'), password: 'Sprint7Harbour', name: 'G', verificationToken: 'not-a-token' },
    });
    ok('a made-up proof is refused', garbage.status === 403, `got ${garbage.status}`);
  }
  {
    // Running out of guesses should finish the code off.
    const email = freshEmail('bruteforce');
    const req = await call('/auth/verification/request', { method: 'POST', body: { email } });
    const real = req.body.devCode;
    const wrongOne = real === '111111' ? '222222' : '111111';
    let last;
    for (let i = 0; i < 5; i += 1) {
      last = await call('/auth/verification/confirm', { method: 'POST', body: { email, code: wrongOne } });
    }
    ok('five wrong guesses exhaust the code', /too many/i.test(last.body?.error || ''), `error was: ${last.body?.error}`);
    const afterwards = await call('/auth/verification/confirm', { method: 'POST', body: { email, code: real } });
    ok('and the correct code no longer works afterwards', afterwards.status === 400, `got ${afterwards.status}`);
  }
  {
    // Requesting a new code should retire the previous one.
    const email = freshEmail('supersede');
    const first = (await call('/auth/verification/request', { method: 'POST', body: { email } })).body.devCode;
    const second = (await call('/auth/verification/request', { method: 'POST', body: { email } })).body.devCode;
    ok('a second request issues a different code', first !== second, `both were ${first}`);
    const usingOld = await call('/auth/verification/confirm', { method: 'POST', body: { email, code: first } });
    ok('the superseded code stops working', usingOld.status === 400, `got ${usingOld.status}`);
    const usingNew = await call('/auth/verification/confirm', { method: 'POST', body: { email, code: second } });
    ok('the newest code works', usingNew.status === 200, `got ${usingNew.status}`);
  }
  {
    // An expired code. Rather than waiting ten minutes, age it in the database.
    const email = freshEmail('expiry');
    const code = (await call('/auth/verification/request', { method: 'POST', body: { email } })).body.devCode;
    const pool = new pg.Pool({
      host: dbEnv.DB_HOST, port: dbEnv.DB_PORT, database: dbEnv.DB_NAME,
      user: dbEnv.DB_USER, password: dbEnv.DB_PASSWORD,
    });
    await pool.query(
      "UPDATE email_verifications SET expires_at = NOW() - INTERVAL '1 minute' WHERE LOWER(email) = $1",
      [email.toLowerCase()]
    );
    await pool.end();
    const res = await call('/auth/verification/confirm', { method: 'POST', body: { email, code } });
    ok('an expired code is refused', res.status === 400, `got ${res.status}`);
    ok('and says it expired rather than that it was wrong', /expired/i.test(res.body?.error || ''),
      `error was: ${res.body?.error}`);
  }
  {
    // This is the regression that nearly shipped: timestamps are `timestamp without time
    // zone` holding UTC, and node-pg parses them in the Node process's local zone. Comparing
    // them in JavaScript made every freshly issued code read as already expired on a
    // non-UTC machine — correct on Render, broken on a laptop in Singapore.
    const email = freshEmail('tz');
    const code = (await call('/auth/verification/request', { method: 'POST', body: { email } })).body.devCode;
    const res = await call('/auth/verification/confirm', { method: 'POST', body: { email, code } });
    ok('a code issued seconds ago is not treated as expired (timezone regression)',
      res.status === 200, `got ${res.status}: ${res.body?.error}`);
  }

  console.log('\n━━━ email verification: not a way to find out who has an account ━━━');
  {
    // Ask for a code for an address that already has an account. The answer must look the
    // same as for a free one, and no code may be sent — otherwise this endpoint both
    // discloses who is registered and lets a stranger fill their inbox.
    const taken = freshEmail('taken');
    const { token } = await verifiedToken(taken);
    await call('/auth/register', {
      method: 'POST', body: { email: taken, password: 'Sprint7Harbour', name: 'Taken Tester', verificationToken: token },
    });

    const again = await call('/auth/verification/request', { method: 'POST', body: { email: taken } });
    const free = await call('/auth/verification/request', { method: 'POST', body: { email: freshEmail('free') } });
    ok('the same status for a taken and a free address', again.status === free.status,
      `taken ${again.status} vs free ${free.status}`);
    ok('the same message for both', again.body?.message === free.body?.message,
      `"${again.body?.message}" vs "${free.body?.message}"`);
    ok('no code is issued for an address that already has an account', !again.body?.devCode,
      `devCode leaked: ${again.body?.devCode}`);
  }
  {
    const bad = await call('/auth/verification/request', { method: 'POST', body: { email: 'not-an-email' } });
    ok('a malformed address is refused', bad.status === 400, `got ${bad.status}`);
  }
  {
    // Per-address cap, so this cannot be used to send someone a hundred emails.
    const email = freshEmail('ratelimit');
    let limited = null;
    for (let i = 0; i < 7; i += 1) {
      const res = await call('/auth/verification/request', { method: 'POST', body: { email } });
      if (res.status === 429) { limited = res; break; }
    }
    ok('repeated requests for one address are rate limited', limited !== null && limited.status === 429,
      limited ? `status ${limited.status}` : 'never hit a 429 in 7 tries');
  }

  console.log('\n━━━ the account records that the address was confirmed ━━━');
  {
    const email = freshEmail('recorded');
    const { token } = await verifiedToken(email);
    await call('/auth/register', {
      method: 'POST', body: { email, password: 'Sprint7Harbour', name: 'Recorded Tester', verificationToken: token },
    });
    const pool = new pg.Pool({
      host: dbEnv.DB_HOST, port: dbEnv.DB_PORT, database: dbEnv.DB_NAME,
      user: dbEnv.DB_USER, password: dbEnv.DB_PASSWORD,
    });
    const { rows } = await pool.query(
      'SELECT email_verified_at FROM users WHERE LOWER(email) = $1', [email.toLowerCase()]
    );
    await pool.end();
    ok('email_verified_at is set on the new account', !!rows[0]?.email_verified_at,
      `value was ${rows[0]?.email_verified_at}`);
  }
}

const started = await startServer();
if (!started) {
  console.error('  The suite needs a database. Set DB_NAME / DB_USER / DB_PASSWORD as the other suites use.\n');
  process.exit(1);
}

try {
  await main();
} catch (err) {
  console.error('\n  the suite itself failed:', err.message);
  failures.push(`suite error: ${err.message}`);
} finally {
  stopServer();
}

console.log(`\n${'─'.repeat(64)}`);
if (failures.length === 0) console.log(`  ${passed} checks passed, 0 failed`);
else {
  console.log(`  ${passed} passed, ${failures.length} FAILED`);
  for (const f of failures) console.log(`    - ${f}`);
}
console.log(`${'─'.repeat(64)}\n`);
process.exit(failures.length > 0 ? 1 : 0);
