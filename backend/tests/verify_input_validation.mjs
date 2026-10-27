/**
 * Verifies the six input-validation defects found during test-plan execution stay fixed.
 *
 *   npm run test:validation
 *
 * Each defect below was found by testing a failure condition the project's own test plan
 * already named, against the running backend and a real database. Every check in this file
 * was confirmed to fail before the fix and pass after it — not assumed to.
 *
 *   D-01  Registration accepted malformed addresses. `a@`, `@uow.edu.au` and
 *         `a b@uow.edu.au` each created a working account with a session token. Worse, the
 *         address was stored in whatever case it was typed and `findByEmail` compared with
 *         `=`, so signing up as `Bob@…` locked the person out of `bob@…` — login returned
 *         "Incorrect email or password" — and let the same person register twice.
 *
 *   D-02  A profile name over 100 characters returned 500. `users.name` is VARCHAR(100)
 *         and only emptiness was checked, so the value reached Postgres and the driver's
 *         length error surfaced as "Failed to update profile". Boundary: 100 saved, 101 did
 *         not. `{ name: 123 }` reached the same 500 via `name.trim is not a function`.
 *
 *   D-03  The leaderboard had no `rank` field and broke ties alphabetically, against the
 *         test plan's "Users with the same scores (should be the same rank)".
 *
 *   D-04  The tournament participant limit was checked only against the number already
 *         registered: `0` was stored (nobody can join), `100000000` was stored, `"many"`
 *         returned 500, and `-5` was refused for the wrong reason.
 *
 *   D-05  Impossible dates were never parsed strictly. `2026-11-31` became 1 December.
 *
 *   D-06  A tournament could be stored ending before it started.
 *
 * The InputPolicy checks run with no database at all, so they still run if Postgres is
 * unavailable; the HTTP checks need a server and are skipped cleanly without one.
 */
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  validateEmail,
  normalizeEmail,
  validateText,
  parseCalendarDate,
  validateCount,
  validateDateRange,
  MAX_NAME_LENGTH,
} from '../control/InputPolicy.js';

const BACKEND = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.VALIDATION_TEST_PORT || 3129);
const BASE = `http://127.0.0.1:${PORT}/api`;
const STAMP = Date.now();
const PASSWORD = 'Sprint7Harbour';

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
      REQUIRE_EMAIL_VERIFICATION: 'false',
      JWT_SECRET: process.env.JWT_SECRET || 'validation-suite-secret-not-for-real-use',
      DATABASE_URL: '',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let log = '';
  let exited = false;
  server.stdout.on('data', (d) => { log += d.toString(); });
  server.stderr.on('data', (d) => { log += d.toString(); });
  server.on('exit', () => { exited = true; });

  for (let i = 0; i < 40; i += 1) {
    await new Promise((r) => setTimeout(r, 400));

    // Checked before the health probe, and this is the whole reason the probe is not enough.
    // A server left running on this port from an earlier suite answers /health/db perfectly
    // well — so if our own child died of EADDRINUSE and we only looked at the port, we would
    // run the entire suite against somebody else's process, quite possibly one built from
    // different code. That happened: a reverted fix still "passed" because a stale server
    // was serving the old binary. A port that answers is not proof that OUR server is up.
    if (exited) {
      const clash = /EADDRINUSE/.test(log);
      console.error(
        `\n  The server could not start on port ${PORT}.` +
        (clash
          ? `\n  Something is already listening there. Set VALIDATION_TEST_PORT to a free port,` +
            `\n  or stop the leftover process, and run again.`
          : `\n${log.split('\n').slice(-10).join('\n')}`) +
        '\n'
      );
      return false;
    }

    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/health/db`);
      if (res.ok) return true;
    } catch { /* not up yet */ }
  }
  console.error(`\n  Timed out starting a server on port ${PORT}.\n${log.split('\n').slice(-10).join('\n')}\n`);
  return false;
}

async function call(method, route, body, token) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(BASE + route, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let parsed;
  try { parsed = JSON.parse(text); } catch { parsed = text; }
  return { status: res.status, body: parsed };
}

// ════════════════════════════════════════════════════════════════════════
// InputPolicy on its own — no server, no database.
// ════════════════════════════════════════════════════════════════════════
function policyChecks() {
  console.log('\n━━━ D-01  EMAIL SHAPE ━━━');

  for (const bad of [
    'not-an-email', 'a@', '@uow.edu.au', 'a b@uow.edu.au', 'a@b',
    '', '   ', 'two@at@signs.com', 'no-domain-dot@localhost',
  ]) {
    const result = validateEmail(bad);
    ok(`rejected: ${JSON.stringify(bad)}`, result.ok === false, `got ok=${result.ok}`);
  }
  for (const good of [
    'dillon@uow.edu.au', 'a.b+tag@example.co.uk', 'x@y.zz',
  ]) {
    ok(`accepted: ${good}`, validateEmail(good).ok === true);
  }
  ok('an address over 255 characters is refused',
    validateEmail(`${'a'.repeat(250)}@example.com`).ok === false);
  // The column is 255, so this must be the stored length, not the typed length.
  ok('exactly 255 characters is allowed',
    validateEmail(`${'a'.repeat(243)}@example.com`).value?.length === 255);

  console.log('\n━━━ D-01  EMAIL CASE ━━━');
  ok('normalised to lowercase', normalizeEmail('  Bob@UOW.Edu.AU  ') === 'bob@uow.edu.au');
  ok('surrounding whitespace removed', normalizeEmail(' x@y.zz ') === 'x@y.zz');
  ok('non-strings give null', normalizeEmail(undefined) === null && normalizeEmail(42) === null);
  ok('two capitalisations normalise to one address',
    validateEmail('Bob@uow.edu.au').value === validateEmail('bob@UOW.EDU.AU').value);

  console.log('\n━━━ D-02  TEXT LENGTH ━━━');
  ok(`${MAX_NAME_LENGTH} characters accepted`,
    validateText('a'.repeat(MAX_NAME_LENGTH), { label: 'Name' }).ok === true);
  ok(`${MAX_NAME_LENGTH + 1} characters refused`,
    validateText('a'.repeat(MAX_NAME_LENGTH + 1), { label: 'Name' }).ok === false);
  ok('the message names the limit and the actual length',
    /100 characters or fewer \(that was 101\)/.test(
      validateText('a'.repeat(101), { label: 'Name' }).problem));
  ok('length is measured after trimming',
    validateText(`  ${'a'.repeat(100)}  `, { label: 'Name' }).ok === true);
  ok('a number is refused, not thrown on',
    validateText(123, { label: 'Name' }).ok === false);
  ok('whitespace only is refused', validateText('   ', { label: 'Name' }).ok === false);
  ok('absent is fine when not required',
    validateText(undefined, { label: 'Name', required: false }).ok === true);
  ok('absent is refused when required',
    validateText(undefined, { label: 'Name' }).ok === false);
  ok('the trimmed value is returned for storing',
    validateText('  Dillon  ', { label: 'Name' }).value === 'Dillon');

  console.log('\n━━━ D-05  CALENDAR DATES ━━━');
  // Each of these is silently rolled forward by `new Date()`, which is the whole problem.
  for (const [input, note] of [
    ['2026-11-31', 'November has 30 days'],
    ['2026-02-30', 'February never has 30'],
    ['2026-02-29', '2026 is not a leap year'],
    ['2026-13-01', 'month 13'],
    ['2026-00-10', 'month 0'],
    ['2026-04-31', 'April has 30 days'],
    ['2026-02-30T00:00:00Z', 'rolls over in full ISO form too'],
  ]) {
    const result = parseCalendarDate(input, { label: 'Deadline' });
    ok(`refused ${input} (${note})`, result.ok === false, `got ${JSON.stringify(result)}`);
  }
  for (const good of ['2026-11-30', '2026-02-28', '2024-02-29', '2026-12-01T10:30:00Z']) {
    ok(`accepted ${good}`, parseCalendarDate(good, { label: 'Deadline' }).ok === true);
  }
  ok('an empty value is refused', parseCalendarDate('', { label: 'Deadline' }).ok === false);
  ok('nonsense text is refused',
    parseCalendarDate('not-a-date', { label: 'Deadline' }).ok === false);
  ok('the message says the date does not exist',
    /not a date that exists/.test(parseCalendarDate('2026-11-31', { label: 'Deadline' }).problem));

  console.log('\n━━━ D-04  COUNTS ━━━');
  ok('0 refused', validateCount(0, { label: 'Max', min: 1, max: 100000 }).ok === false);
  ok('1 accepted', validateCount(1, { label: 'Max', min: 1, max: 100000 }).ok === true);
  ok('-5 refused', validateCount(-5, { label: 'Max', min: 1, max: 100000 }).ok === false);
  ok('100000000 refused', validateCount(100000000, { label: 'Max', min: 1, max: 100000 }).ok === false);
  ok('a string refused', validateCount('many', { label: 'Max', min: 1, max: 100000 }).ok === false);
  ok('a fraction refused', validateCount(2.5, { label: 'Max', min: 1, max: 100000 }).ok === false);
  ok('NaN refused', validateCount(NaN, { label: 'Max', min: 1, max: 100000 }).ok === false);
  ok('the ceiling is accepted',
    validateCount(100000, { label: 'Max', min: 1, max: 100000 }).ok === true);

  console.log('\n━━━ D-06  DATE RANGES ━━━');
  ok('end after start accepted',
    validateDateRange({ startDate: '2026-12-01', endDate: '2026-12-20' }).ok === true);
  ok('end before start refused',
    validateDateRange({ startDate: '2026-12-20', endDate: '2026-12-01' }).ok === false);
  ok('same day accepted',
    validateDateRange({ startDate: '2026-12-01', endDate: '2026-12-01' }).ok === true);
  ok('only a start date is fine',
    validateDateRange({ startDate: '2026-12-01' }).ok === true);
  ok('only an end date is fine',
    validateDateRange({ endDate: '2026-12-01' }).ok === true);
  // The two-step case: moving one end alone must still be checked against the stored other.
  ok('a new end before the STORED start is refused',
    validateDateRange({ endDate: '2026-11-01' },
      { current: { startDate: '2026-12-01', endDate: '2026-12-20' } }).ok === false);
  ok('a new start after the STORED end is refused',
    validateDateRange({ startDate: '2027-01-01' },
      { current: { startDate: '2026-12-01', endDate: '2026-12-20' } }).ok === false);
  ok('an impossible date inside a range is refused',
    validateDateRange({ startDate: '2026-11-31', endDate: '2026-12-20' }).ok === false);
}

// ════════════════════════════════════════════════════════════════════════
// The same rules over HTTP, which is where they actually have to hold.
// ════════════════════════════════════════════════════════════════════════
async function httpChecks() {
  console.log('\n━━━ D-01  REGISTRATION OVER HTTP ━━━');

  for (const bad of ['not-an-email', 'a@', '@uow.edu.au', 'a b@uow.edu.au']) {
    const res = await call('POST', '/auth/register', {
      name: 'Shape Test', email: bad, password: PASSWORD,
    });
    ok(`${JSON.stringify(bad)} refused with 400`, res.status === 400,
      `got ${res.status} ${JSON.stringify(res.body)}`);
  }

  const mixed = `Case.${STAMP}@UOW.Edu.AU`;
  const lower = `case.${STAMP}@uow.edu.au`;

  const created = await call('POST', '/auth/register', {
    name: 'Case Test', email: mixed, password: PASSWORD,
  });
  ok('a mixed-case address registers', created.status === 201,
    `got ${created.status} ${JSON.stringify(created.body)}`);
  ok('it is stored lowercased', created.body?.user?.email === lower,
    `stored as ${created.body?.user?.email}`);

  // The lockout. This returned 401 before the fix.
  const loginLower = await call('POST', '/auth/login', { email: lower, password: PASSWORD });
  ok('login works with the lowercase form', loginLower.status === 200,
    `got ${loginLower.status} ${JSON.stringify(loginLower.body)}`);
  const loginMixed = await call('POST', '/auth/login', { email: mixed, password: PASSWORD });
  ok('login works with the typed form too', loginMixed.status === 200,
    `got ${loginMixed.status}`);
  const loginUpper = await call('POST', '/auth/login', {
    email: lower.toUpperCase(), password: PASSWORD,
  });
  ok('login works in all caps', loginUpper.status === 200, `got ${loginUpper.status}`);

  // The double account. This returned 201 before the fix.
  const again = await call('POST', '/auth/register', {
    name: 'Case Test Twice', email: lower, password: PASSWORD,
  });
  ok('registering the other capitalisation is a 409, not a second account',
    again.status === 409, `got ${again.status} ${JSON.stringify(again.body)}`);

  const token = loginLower.body?.token;

  console.log('\n━━━ D-02  PROFILE FIELD LENGTHS OVER HTTP ━━━');
  const at100 = await call('PUT', '/profile', { name: 'a'.repeat(100) }, token);
  ok('a 100-character name saves', at100.status === 200, `got ${at100.status}`);
  const at101 = await call('PUT', '/profile', { name: 'a'.repeat(101) }, token);
  ok('a 101-character name is 400, not 500', at101.status === 400,
    `got ${at101.status} ${JSON.stringify(at101.body)}`);
  ok('and the message names the limit', /100 characters or fewer/.test(at101.body?.error ?? ''),
    `message was ${JSON.stringify(at101.body?.error)}`);
  const at300 = await call('PUT', '/profile', { name: 'a'.repeat(300) }, token);
  ok('a 300-character name is 400, not 500', at300.status === 400, `got ${at300.status}`);
  const numeric = await call('PUT', '/profile', { name: 123 }, token);
  ok('a numeric name is 400, not 500', numeric.status === 400, `got ${numeric.status}`);
  const blank = await call('PUT', '/profile', { name: '   ' }, token);
  ok('a blank name is still 400', blank.status === 400, `got ${blank.status}`);
  const longBio = await call('PUT', '/profile', { bio: 'b'.repeat(5000) }, token);
  ok('a 5000-character bio is refused', longBio.status === 400, `got ${longBio.status}`);
  const okBio = await call('PUT', '/profile', { name: 'Case Test', bio: 'Runs on Tuesdays.' }, token);
  ok('an ordinary update still works', okBio.status === 200, `got ${okBio.status}`);

  console.log('\n━━━ D-03  LEADERBOARD TIES OVER HTTP ━━━');
  // Three accounts on exactly the same distance, created out of alphabetical order so a
  // name-based tie-break would be visible.
  const tied = [];
  for (const name of ['Zeta Tie', 'Alpha Tie', 'Mid Tie']) {
    const reg = await call('POST', '/auth/register', {
      name: `${name} ${STAMP}`,
      email: `tie.${name.split(' ')[0].toLowerCase()}.${STAMP}@uow.edu.au`,
      password: PASSWORD,
    });
    await call('POST', '/runs', {
      distanceKm: 777.7,
      durationSeconds: 777 * 300,
      startedAt: new Date(Date.now() - 7200e3).toISOString(),
      name: 'tie run',
    }, reg.body.token);
    tied.push(`${name} ${STAMP}`);
  }

  const board = await call('GET', '/leaderboard', undefined, token);
  ok('the leaderboard loads', board.status === 200, `got ${board.status}`);

  const rows = board.body?.leaderboard ?? [];
  ok('every entry carries a rank', rows.length > 0 && rows.every((r) => Number.isInteger(r.rank)),
    `first entry: ${JSON.stringify(rows[0])}`);

  const ourRows = rows.filter((r) => tied.includes(r.name));
  ok('all three tied users are on the board', ourRows.length === 3, `found ${ourRows.length}`);
  // The integer test is load-bearing. Without it, three rows that all have `rank: undefined`
  // form a Set of size 1 and this check passes while no rank exists at all — which is the
  // exact defect. Verified by reverting the fix: this assertion passed until it required an
  // integer.
  ok('the three tied users share one rank',
    ourRows.length === 3
      && Number.isInteger(ourRows[0].rank)
      && new Set(ourRows.map((r) => r.rank)).size === 1,
    `ranks were ${ourRows.map((r) => `${r.name}=${r.rank}`).join(', ')}`);
  ok('they are all on the same distance',
    new Set(ourRows.map((r) => r.total_distance_km)).size === 1);

  // Competition ranking: after three users sharing rank N, the next distinct distance is
  // N+3, not N+1.
  const sorted = [...rows].sort((a, b) => a.rank - b.rank);
  let continuous = sorted.length > 0 && sorted.every((r) => Number.isInteger(r.rank));
  for (let i = 1; continuous && i < sorted.length; i += 1) {
    const sameDistance = sorted[i].total_distance_km === sorted[i - 1].total_distance_km;
    if (sameDistance && sorted[i].rank !== sorted[i - 1].rank) continuous = false;
    if (!sameDistance && sorted[i].rank <= sorted[i - 1].rank) continuous = false;
  }
  ok('ranks are consistent with distances all the way down the board', continuous,
    sorted.map((r) => `${r.rank}:${r.total_distance_km}`).join(' '));

  const ranksSeen = sorted.map((r) => r.rank);
  ok('ranks never decrease', ranksSeen.every((r, i) => i === 0 || r >= ranksSeen[i - 1]));
  ok('the board starts at rank 1', sorted[0]?.rank === 1, `started at ${sorted[0]?.rank}`);

  console.log('\n━━━ D-04 / D-05 / D-06  TOURNAMENTS OVER HTTP ━━━');
  const group = await call('POST', '/groups', {
    name: `Validation Club ${STAMP}`, description: 'for the validation suite',
  }, token);
  ok('a group is created to hold the tournaments', group.status === 201, `got ${group.status}`);
  const groupId = group.body?.group?.groupId;

  // D-06 at create time.
  const backwards = await call('POST', `/groups/${groupId}/tournaments`, {
    name: 'Backwards Cup', startDate: '2026-12-20', endDate: '2026-12-01',
  }, token);
  ok('a tournament ending before it starts is refused', backwards.status === 400,
    `got ${backwards.status} ${JSON.stringify(backwards.body)}`);

  // D-05 at create time.
  const badStart = await call('POST', `/groups/${groupId}/tournaments`, {
    name: 'Impossible Start Cup', startDate: '2026-11-31', endDate: '2026-12-20',
  }, token);
  ok('a start date that does not exist is refused', badStart.status === 400,
    `got ${badStart.status} ${JSON.stringify(badStart.body)}`);

  const overLongName = await call('POST', `/groups/${groupId}/tournaments`, {
    name: 'c'.repeat(101),
  }, token);
  ok('a 101-character tournament name is refused', overLongName.status === 400,
    `got ${overLongName.status}`);

  const good = await call('POST', `/groups/${groupId}/tournaments`, {
    name: 'Validation Cup', startDate: '2026-12-01', endDate: '2026-12-20',
  }, token);
  ok('a valid tournament is created', good.status === 201,
    `got ${good.status} ${JSON.stringify(good.body)}`);
  const tournamentId = good.body?.tournament?.tournamentId;
  ok('its dates are stored', !!good.body?.tournament?.startDate && !!good.body?.tournament?.endDate,
    JSON.stringify(good.body?.tournament));

  // D-06 in two steps: move only the end date, behind the stored start.
  const twoStep = await call('PUT', `/tournaments/${tournamentId}`, {
    endDate: '2026-11-15',
  }, token);
  ok('moving only the end date behind the stored start is refused', twoStep.status === 400,
    `got ${twoStep.status} ${JSON.stringify(twoStep.body)}`);

  // D-04.
  for (const [label, value, expected] of [
    ['0', 0, 400],
    ['-5', -5, 400],
    ['100000000', 100000000, 400],
    ['"many"', 'many', 400],
    ['2.5', 2.5, 400],
    ['20', 20, 200],
  ]) {
    const res = await call('PATCH', `/tournaments/${tournamentId}/limits`,
      { maxParticipants: value }, token);
    ok(`maxParticipants ${label} -> ${expected}`, res.status === expected,
      `got ${res.status} ${JSON.stringify(res.body)}`);
  }
  const stored = await call('GET', `/tournaments/${tournamentId}`, undefined, token);
  ok('the accepted limit is the one stored',
    stored.body?.tournament?.maxParticipants === 20,
    `stored ${stored.body?.tournament?.maxParticipants}`);

  // D-05 on the deadline.
  for (const [label, value, expected] of [
    ['2026-11-31 (does not exist)', '2026-11-31', 400],
    ['2026-02-30 (does not exist)', '2026-02-30', 400],
    ['2020-01-01 (in the past)', '2020-01-01', 400],
    ['2026-12-10 (valid, before the end)', '2026-12-10', 200],
  ]) {
    const res = await call('PATCH', `/tournaments/${tournamentId}/limits`,
      { registrationDeadline: value }, token);
    ok(`deadline ${label} -> ${expected}`, res.status === expected,
      `got ${res.status} ${JSON.stringify(res.body)}`);
  }
  const afterEnd = await call('PATCH', `/tournaments/${tournamentId}/limits`,
    { registrationDeadline: '2027-06-01' }, token);
  ok('a deadline after the tournament ends is refused', afterEnd.status === 400,
    `got ${afterEnd.status} ${JSON.stringify(afterEnd.body)}`);

  const empty = await call('PATCH', `/tournaments/${tournamentId}/limits`, {}, token);
  ok('an empty limits body is 400, not a silent 200', empty.status === 400,
    `got ${empty.status} ${JSON.stringify(empty.body)}`);

  console.log('\n━━━ NOTHING ELSE MOVED ━━━');
  // The point of these: the fixes tightened shared paths, so the ordinary cases that were
  // already correct have to still be correct.
  const freshEmail = `still.works.${STAMP}@uow.edu.au`;
  const fresh = await call('POST', '/auth/register', {
    name: 'Still Works', email: freshEmail, password: PASSWORD,
  });
  ok('ordinary registration still returns 201 and a token',
    fresh.status === 201 && !!fresh.body?.token, `got ${fresh.status}`);
  const dup = await call('POST', '/auth/register', {
    name: 'Still Works', email: freshEmail, password: PASSWORD,
  });
  ok('the duplicate 409 is unchanged', dup.status === 409, `got ${dup.status}`);
  const weak = await call('POST', '/auth/register', {
    name: 'Weak', email: `weak.${STAMP}@uow.edu.au`, password: 'password123',
  });
  ok('the password policy still fires, and after the email check',
    weak.status === 400 && /commonly used/.test(weak.body?.error ?? ''),
    `got ${weak.status} ${JSON.stringify(weak.body)}`);
  // Order matters: a request that is wrong in two ways should name the email, since that is
  // what the person has to fix before the account can exist at all.
  const both = await call('POST', '/auth/register', {
    name: 'Both Wrong', email: 'bad@', password: 'password123',
  });
  ok('a bad address and a weak password reports the address first',
    both.status === 400 && /valid email address/.test(both.body?.error ?? ''),
    `got ${JSON.stringify(both.body)}`);
}

async function main() {
  policyChecks();

  const started = await startServer();
  if (!started) {
    // Counted as a failure, not a skip. The HTTP half is where these rules actually have to
    // hold, and a run that quietly checks only the pure functions would print "57 checks
    // passed, 0 failed" and exit 0 — a green result for a suite that tested almost nothing.
    ok('a server could be started for the HTTP checks', false,
      'the HTTP half of this suite did not run');
    return;
  }
  try {
    await httpChecks();
  } finally {
    server?.kill();
  }
}

main()
  .then(() => {
    console.log(`\n${'─'.repeat(64)}`);
    if (failures.length === 0) console.log(`  ${passed} checks passed, 0 failed`);
    else {
      console.log(`  ${passed} passed, ${failures.length} FAILED`);
      for (const f of failures) console.log(`    - ${f}`);
    }
    console.log(`${'─'.repeat(64)}\n`);
    process.exit(failures.length > 0 ? 1 : 0);
  })
  .catch((err) => {
    server?.kill();
    console.error('\n  the suite itself failed:', err.message, '\n');
    process.exit(1);
  });
