/**
 * Run tracking, end to end against the live server.
 *
 * Covers the four problems this suite was written for:
 *   1. a long GPS-tracked run can be saved at all
 *   2. a run in progress survives the app being killed
 *   3. a user can delete or correct their own run, and the points follow
 *   4. POST /runs refuses input that is not a run
 *
 * Start the server first, then: npm run test:tracking
 */
const BASE = process.env.TEST_URL || 'http://localhost:3000/api';
const stamp = Date.now();

let pass = 0;
let fail = 0;
const failures = [];

const check = (label, ok, detail = '') => {
  if (ok) {
    pass += 1;
    console.log(`  ok   ${label}`);
  } else {
    fail += 1;
    failures.push([label, detail]);
    console.log(`  FAIL ${label}\n         ${detail}`);
  }
};

const api = async (path, { method = 'GET', token, body } = {}) => {
  const response = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  return { status: response.status, data };
};

const register = async (tag) =>
  (await api('/auth/register', {
    method: 'POST',
    body: { email: `${tag}.${stamp}@example.com`, password: 'Password123', name: `${tag} ${stamp}` },
  })).data.token;

const pointsOf = async (token) => {
  const r = await api('/rewards', { token });
  return r.data?.points ?? r.data?.reward?.points ?? null;
};

/** A GPS route shaped like the app's, one point roughly every 3 seconds. */
const route = (points) =>
  Array.from({ length: points }, (_, i) => ({
    latitude: -34.406123 + i * 2e-5,
    longitude: 150.878456 + i * 2e-5,
    timestamp: Date.UTC(2026, 0, 1) + i * 3000,
  }));

const runner = await register('track');
const other = await register('trackother');

// ─────────────────────────────────────────────────────────────
console.log('\n━━━ A LONG GPS RUN CAN BE SAVED ━━━');
// 1 400 points used to exceed Express's 100 kB default body limit and fail with a 500,
// which meant a run over about 70 minutes could not be saved at all.
{
  const long = await api('/runs', {
    method: 'POST',
    token: runner,
    body: {
      name: 'Long tracked run',
      distanceKm: 21.1,
      durationSeconds: 7200,
      startedAt: new Date(Date.now() - 7200000).toISOString(),
      endedAt: new Date().toISOString(),
      routeGps: route(1400),
    },
  });
  check('a 1 400-point route (about 70 minutes) saves', long.status === 201, `${long.status} ${JSON.stringify(long.data).slice(0, 120)}`);

  const stored = await api(`/runs/${long.data?.run?.runId}`, { token: runner });
  check('all 1 400 points come back', stored.data?.run?.routeGps?.length === 1400, `got ${stored.data?.run?.routeGps?.length}`);

  const cap = await api('/runs', {
    method: 'POST',
    token: runner,
    body: { distanceKm: 10, durationSeconds: 3600, startedAt: new Date().toISOString(), routeGps: route(5001) },
  });
  check('past the cap it is refused with a clear 400, not a 500', cap.status === 400 && /5000 points/.test(cap.data?.error ?? ''), `${cap.status} ${JSON.stringify(cap.data)}`);
}

// ─────────────────────────────────────────────────────────────
console.log('\n━━━ A RUN IN PROGRESS SURVIVES THE APP BEING KILLED ━━━');
{
  check('nothing in progress to begin with', (await api('/runs/active', { token: runner })).data?.activeRun === null);

  const started = await api('/runs/active', { method: 'POST', token: runner, body: { startedAt: new Date(Date.now() - 600000).toISOString() } });
  check('tracking can be started', started.status === 201, `${started.status} ${JSON.stringify(started.data)}`);

  const second = await api('/runs/active', { method: 'POST', token: runner, body: {} });
  check('a second one is refused, and hands back the first', second.status === 409 && !!second.data?.activeRun, `${second.status} ${JSON.stringify(second.data)}`);

  const progress = await api('/runs/active', { method: 'PATCH', token: runner, body: { distanceKm: 3.4, durationSeconds: 600, routeGps: route(200) } });
  check('progress can be checkpointed', progress.status === 200, `${progress.status} ${JSON.stringify(progress.data)}`);

  // This is the recovery path: a fresh app process asks what was in flight.
  const resumed = await api('/runs/active', { token: runner });
  check('a restarted app can read the run back', resumed.data?.activeRun?.distanceKm === 3.4 && resumed.data.activeRun.routeGps.length === 200,
    JSON.stringify(resumed.data?.activeRun ?? {}).slice(0, 160));

  check('a checkpoint is rejected if the figures are impossible', (await api('/runs/active', { method: 'PATCH', token: runner, body: { distanceKm: -5 } })).status === 400);
  check("another user cannot see it", (await api('/runs/active', { token: other })).data?.activeRun === null);

  const before = await pointsOf(runner);
  const finished = await api('/runs/active/finish', { method: 'POST', token: runner, body: { name: 'Recovered run', distanceKm: 3.4, durationSeconds: 600 } });
  check('finishing turns it into a real run', finished.status === 201 && finished.data?.run?.name === 'Recovered run', `${finished.status} ${JSON.stringify(finished.data).slice(0, 140)}`);
  check('its route carried over', finished.data?.run?.routeGps?.length === 200, `got ${finished.data?.run?.routeGps?.length}`);
  check('it paid out the right points', finished.data?.pointsEarned === 34, `got ${finished.data?.pointsEarned}`);
  check('the balance moved by that much', (await pointsOf(runner)) === before + 34, `${before} -> ${await pointsOf(runner)}`);

  check('finishing twice cannot store it twice', (await api('/runs/active/finish', { method: 'POST', token: runner })).status === 404);
  check('nothing is left in progress', (await api('/runs/active', { token: runner })).data?.activeRun === null);

  await api('/runs/active', { method: 'POST', token: runner, body: {} });
  check('a run in progress can be discarded', (await api('/runs/active', { method: 'DELETE', token: runner })).status === 200);
  check('discarding twice is a 404', (await api('/runs/active', { method: 'DELETE', token: runner })).status === 404);
}

// ─────────────────────────────────────────────────────────────
console.log('\n━━━ DELETING AND CORRECTING YOUR OWN RUN ━━━');
{
  const made = await api('/runs', {
    method: 'POST',
    token: runner,
    body: { name: 'Run to delete', distanceKm: 8, durationSeconds: 2400, startedAt: new Date(Date.now() - 2400000).toISOString() },
  });
  const runId = made.data.run.runId;
  check('a run can be created to work on', made.status === 201 && made.data.pointsEarned === 80, JSON.stringify(made.data).slice(0, 120));

  const before = await pointsOf(runner);
  check("another user cannot delete it", (await api(`/runs/${runId}`, { method: 'DELETE', token: other })).status === 403);
  check("another user cannot correct it", (await api(`/runs/${runId}`, { method: 'PATCH', token: other, body: { distanceKm: 1 } })).status === 403);

  // Correcting the distance down has to take the points back with it.
  const corrected = await api(`/runs/${runId}`, { method: 'PATCH', token: runner, body: { distanceKm: 5 } });
  check('the distance can be corrected', corrected.status === 200 && corrected.data.run.distanceKm === 5, `${corrected.status} ${JSON.stringify(corrected.data).slice(0, 140)}`);
  check('the points came down with it', corrected.data?.pointsAdjustment === -30 && (await pointsOf(runner)) === before - 30, `adjustment ${corrected.data?.pointsAdjustment}, ${before} -> ${await pointsOf(runner)}`);

  const up = await api(`/runs/${runId}`, { method: 'PATCH', token: runner, body: { distanceKm: 9 } });
  check('correcting upwards pays the difference', up.data?.pointsAdjustment === 40, `got ${up.data?.pointsAdjustment}`);

  check('a correction still has to be a possible run', (await api(`/runs/${runId}`, { method: 'PATCH', token: runner, body: { durationSeconds: 5 } })).status === 400);
  check('and cannot end before it started', (await api(`/runs/${runId}`, { method: 'PATCH', token: runner, body: { endedAt: '2001-01-01T00:00:00Z' } })).status === 400);
  check('an empty correction is refused', (await api(`/runs/${runId}`, { method: 'PATCH', token: runner, body: {} })).status === 400);

  const beforeDelete = await pointsOf(runner);
  const deleted = await api(`/runs/${runId}`, { method: 'DELETE', token: runner });
  check('the owner can delete it', deleted.status === 200 && deleted.data.pointsReclaimed === 90, `${deleted.status} ${JSON.stringify(deleted.data)}`);
  check('deleting took back the points it had earned', (await pointsOf(runner)) === beforeDelete - 90, `${beforeDelete} -> ${await pointsOf(runner)}`);
  check('it is really gone', (await api(`/runs/${runId}`, { token: runner })).status === 404);
  check('deleting it again is a 404', (await api(`/runs/${runId}`, { method: 'DELETE', token: runner })).status === 404);
}

// ─────────────────────────────────────────────────────────────
console.log('\n━━━ POINTS CANNOT GO NEGATIVE ━━━');
{
  const poor = await register('trackpoor');
  const small = await api('/runs', { method: 'POST', token: poor, body: { distanceKm: 2, durationSeconds: 900, startedAt: new Date().toISOString() } });
  // Spend most of them, then delete the run that earned them.
  const deleted = await api(`/runs/${small.data.run.runId}`, { method: 'DELETE', token: poor });
  check('a small run deletes cleanly', deleted.status === 200, JSON.stringify(deleted.data));
  const balance = await pointsOf(poor);
  check('the balance never goes below zero', balance >= 0, `balance ${balance}`);
}

// ─────────────────────────────────────────────────────────────
console.log('\n━━━ SAVING THE SAME RUN TWICE ━━━');
{
  const token = await register('trackdupe');
  const body = {
    name: 'Double tapped',
    distanceKm: 4,
    durationSeconds: 1200,
    startedAt: new Date(Date.now() - 1200000).toISOString(),
    clientRunId: `probe-${stamp}`,
  };

  const [first, second] = await Promise.all([
    api('/runs', { method: 'POST', token, body }),
    api('/runs', { method: 'POST', token, body }),
  ]);
  const statuses = [first.status, second.status].sort().join('+');
  check('two simultaneous saves of one run both answer', statuses === '200+201' || statuses === '201+201', statuses);

  const history = await api('/runs', { token });
  check('only one run was stored', history.data.runs.length === 1, `${history.data.runs.length} runs`);
  check('and it only paid out once', (await pointsOf(token)) === 40, `points ${await pointsOf(token)}`);

  const retry = await api('/runs', { method: 'POST', token, body });
  check('a later retry returns the run already saved', retry.status === 200 && retry.data.alreadySaved === true, `${retry.status} ${JSON.stringify(retry.data).slice(0, 100)}`);
  check('still only one run', (await api('/runs', { token })).data.runs.length === 1);

  // Without a key, two genuinely separate runs on the same day must both be kept.
  const past = { distanceKm: 5, durationSeconds: 1500, startedAt: new Date(Date.now() - 86400000).toISOString() };
  await api('/runs', { method: 'POST', token, body: { ...past, name: 'Morning' } });
  await api('/runs', { method: 'POST', token, body: { ...past, name: 'Evening' } });
  check('two runs logged for the same moment are both kept', (await api('/runs', { token })).data.runs.length === 3,
    `${(await api('/runs', { token })).data.runs.length} runs`);
}

// ─────────────────────────────────────────────────────────────
console.log('\n━━━ BAD INPUT IS A 4xx, NEVER A 500 ━━━');
{
  const base = { distanceKm: 3, durationSeconds: 900, startedAt: new Date().toISOString() };
  const refuses = [
    ['endedAt before startedAt', { ...base, endedAt: new Date(Date.now() - 7 * 86400000).toISOString() }],
    ['startedAt in the future', { ...base, startedAt: new Date(Date.now() + 365 * 86400000).toISOString() }],
    ['an impossible pace', { ...base, distanceKm: 5, durationSeconds: 10 }],
    ['a duration over 24 hours', { ...base, durationSeconds: 2592000 }],
    ['routeGps that is not an array', { ...base, routeGps: 'not-a-route' }],
    ['routeGps holding junk', { ...base, routeGps: [{ foo: 'bar' }] }],
    ['a latitude off the planet', { ...base, routeGps: [{ latitude: 999, longitude: -4000 }] }],
    ['negative calories', { ...base, caloriesBurned: -500 }],
    ['a negative heart rate', { ...base, avgHeartRate: -20 }],
    ['maxHeartRate below avgHeartRate', { ...base, avgHeartRate: 180, maxHeartRate: 90 }],
    ['a name past the column limit', { ...base, name: 'x'.repeat(5000) }],
  ];
  for (const [label, body] of refuses) {
    const r = await api('/runs', { method: 'POST', token: runner, body });
    check(`refuses ${label}`, r.status === 400, `got ${r.status} ${JSON.stringify(r.data).slice(0, 100)}`);
  }

  const accepts = [
    ['a distance sent as a string', { ...base, distanceKm: '3.5' }],
    ['a 0 km run with a duration (treadmill, no GPS)', { ...base, distanceKm: 0 }],
    ['lat/lng spelling, as schema.sql describes it', { ...base, routeGps: [{ lat: -34.4, lng: 150.87 }] }],
  ];
  for (const [label, body] of accepts) {
    const r = await api('/runs', { method: 'POST', token: runner, body });
    check(`still accepts ${label}`, r.status === 201, `got ${r.status} ${JSON.stringify(r.data).slice(0, 100)}`);
  }

  check('an id that is not a number is a 400', (await api('/runs/active-ish', { token: runner })).status === 400);
  check('a negative limit is a 400, not a database error', (await api('/runs?limit=-1', { token: runner })).status === 400);
  check('an absurd limit is a 400', (await api('/runs?limit=999999', { token: runner })).status === 400);
  check('a non-numeric limit is a 400', (await api('/runs?limit=abc', { token: runner })).status === 400);
  check('the limit the dashboard asks for still works', (await api('/runs?limit=100', { token: runner })).status === 200);
  check('malformed JSON is a 400', await (async () => {
    const r = await fetch(`${BASE}/runs`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${runner}` }, body: '{not json' });
    return r.status === 400;
  })());
}

// ─────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────
console.log('\n━━━ THE PROFILE REPORTS REAL TOTALS ━━━');
// These used to be added up in the app from a page of run history, which broke the moment
// the history outgrew one page: the profile showed 0 km and 0 runs however much was logged.
{
  const token = await register('trackprofile');
  const profileOf = async () => (await api('/profile', { token })).data;

  const empty = await profileOf();
  check('a new account reports zero, with the stats block present', empty.stats?.runCount === 0 && empty.stats?.totalDistanceKm === 0,
    JSON.stringify(empty.stats));

  await api('/runs', { method: 'POST', token, body: { distanceKm: 6.4, durationSeconds: 2100, startedAt: new Date(Date.now() - 2100000).toISOString() } });
  await api('/runs', { method: 'POST', token, body: { distanceKm: 14.2, durationSeconds: 5400, startedAt: new Date(Date.now() - 3 * 86400000).toISOString() } });

  const after = await profileOf();
  check('the distance is the sum of the runs', after.stats.totalDistanceKm === 20.6, `got ${after.stats.totalDistanceKm}`);
  check('the run count is right', after.stats.runCount === 2, `got ${after.stats.runCount}`);
  check('the longest run is reported', after.stats.longestRunKm === 14.2, `got ${after.stats.longestRunKm}`);
  check('the total duration is reported', after.stats.totalDurationSeconds === 7500, `got ${after.stats.totalDurationSeconds}`);
  check('first and last run dates are set', !!after.stats.firstRunAt && !!after.stats.lastRunAt, JSON.stringify(after.stats));

  // The whole point: the numbers move when the history changes.
  await api('/runs', { method: 'POST', token, body: { distanceKm: 3.75, durationSeconds: 1200, startedAt: new Date(Date.now() - 1200000).toISOString() } });
  check('the totals follow a newly logged run', (await profileOf()).stats.totalDistanceKm === 24.35, `got ${(await profileOf()).stats.totalDistanceKm}`);

  // And are per-user, not platform-wide.
  const stranger = await register('trackstranger');
  check("another account's totals are its own", (await api('/profile', { token: stranger })).data.stats.runCount === 0,
    `got ${(await api('/profile', { token: stranger })).data.stats.runCount}`);

  // A page of history is no longer how the profile gets its figures, but the old call must
  // still be refused rather than silently returning nothing.
  check('a limit past the cap is still a clear 400', (await api('/runs?limit=500', { token })).status === 400,
    `got ${(await api('/runs?limit=500', { token })).status}`);
}

// ─────────────────────────────────────────────────────────────
console.log('\n━━━ THE LEADERBOARD TOTALS FOLLOW THE RUNS ━━━');
// Migration 006 keeps a running total per user so the board does not re-add every run on
// every request. A cache is only worth having if it cannot drift, so this checks that the
// trigger tracks creates, corrections and deletions through the real API.
{
  const token = await register('trackboard');
  const me = async () => {
    const board = await api('/leaderboard?limit=200', { token });
    const rows = board.data.leaderboard ?? board.data;
    return rows.find((r) => r.name === `trackboard ${stamp}`) ?? null;
  };

  const fresh = await me();
  check('a runner with no runs starts at zero', !fresh || fresh.total_distance_km === 0,
    JSON.stringify(fresh));

  const first = await api('/runs', { method: 'POST', token, body: { distanceKm: 12.5, durationSeconds: 3600, startedAt: new Date(Date.now() - 3600000).toISOString() } });
  const afterOne = await me();
  check('logging a run updates the board immediately', afterOne?.total_distance_km === 12.5,
    `got ${afterOne?.total_distance_km}`);
  check('and the run count with it', afterOne?.total_runs === 1, `got ${afterOne?.total_runs}`);

  await api('/runs', { method: 'POST', token, body: { distanceKm: 7.5, durationSeconds: 2400, startedAt: new Date(Date.now() - 2400000).toISOString() } });
  check('a second run adds to the total', (await me())?.total_distance_km === 20, `got ${(await me())?.total_distance_km}`);

  // Correcting a distance has to move the board, not just the run.
  await api(`/runs/${first.data.run.runId}`, { method: 'PATCH', token, body: { distanceKm: 2.5 } });
  check('correcting a run down adjusts the board', (await me())?.total_distance_km === 10,
    `got ${(await me())?.total_distance_km}`);

  await api(`/runs/${first.data.run.runId}`, { method: 'DELETE', token });
  const afterDelete = await me();
  check('deleting a run removes its distance', afterDelete?.total_distance_km === 7.5,
    `got ${afterDelete?.total_distance_km}`);
  check('and decrements the run count', afterDelete?.total_runs === 1, `got ${afterDelete?.total_runs}`);

  // The cache must agree with the source of truth it is derived from.
  const totals = (await api('/profile', { token })).data.stats;
  check('the board agrees with the profile, which counts runs directly',
    afterDelete?.total_distance_km === totals.totalDistanceKm && afterDelete?.total_runs === totals.runCount,
    `board ${afterDelete?.total_distance_km}/${afterDelete?.total_runs} vs profile ${totals.totalDistanceKm}/${totals.runCount}`);

  const ordered = (await api('/leaderboard?limit=200', { token })).data;
  const rows = ordered.leaderboard ?? ordered;
  const sorted = rows.every((r, i) => i === 0 || rows[i - 1].total_distance_km >= r.total_distance_km);
  check('the board is still ordered by distance, descending', sorted,
    JSON.stringify(rows.slice(0, 3).map((r) => r.total_distance_km)));
  check('distances come back as numbers', rows.length === 0 || typeof rows[0].total_distance_km === 'number',
    typeof rows[0]?.total_distance_km);
}

console.log('\n━━━ NEGATIVE FIGURES NO LONGER POISON THE INSIGHTS ━━━');
{
  const insights = await api('/runs/insights', { token: runner });
  const total = insights.data?.calories?.totalCalories;
  check('total calories cannot be negative', insights.status === 200 && (total === null || total >= 0), `totalCalories ${total}`);
  const avgHeartRate = insights.data?.heartRate?.avgHeartRate;
  check('average heart rate cannot be negative', avgHeartRate === null || avgHeartRate > 0, `avgHeartRate ${avgHeartRate}`);
}

console.log('\n' + '─'.repeat(70));
console.log(`  ${pass} passed, ${fail} failed`);
if (failures.length) {
  console.log('\nFAILURES:');
  failures.forEach(([label, detail]) => console.log(`  • ${label}\n      ${detail}`));
}
console.log('─'.repeat(70));
process.exit(fail > 0 ? 1 : 0);
