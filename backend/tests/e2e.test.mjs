import { test } from 'node:test';
import assert from 'node:assert/strict';

// Run against a FRESH test database (see README). Server must already be running.
const BASE = process.env.TEST_URL ?? 'http://localhost:3000';
const call = async (method, path, token, body) => {
  const res = await fetch(BASE + path, {
    method,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json; try { json = JSON.parse(text); } catch { json = text; }
  return { status: res.status, body: json };
};
const expect = (r, status, label) => assert.equal(r.status, status, `${label}: got ${r.status} ${JSON.stringify(r.body)}`);

const S = {};

test('auth: register, login, me, logout', async () => {
  const reg = await call('POST', '/api/auth/register', null, { email: 'alice@uow.edu.au', password: 'Password1', name: 'Alice' });
  expect(reg, 201, 'register');
  assert.ok(reg.body.token);
  expect(await call('POST', '/api/auth/register', null, { email: 'alice@uow.edu.au', password: 'x', name: 'A' }), 409, 'dup register');
  expect(await call('POST', '/api/auth/register', null, { email: 'x@x.com' }), 400, 'missing fields');

  for (const [key, email, name, extra] of [
    ['bob', 'bob@uow.edu.au', 'Bob', {}],
    ['carol', 'carol@uow.edu.au', 'Carol', {}],
    ['ins', 'ins@uow.edu.au', 'Coach', { accountType: 'instructor' }],
  ]) {
    const r = await call('POST', '/api/auth/register', null, { email, password: 'Password1', name, ...extra });
    expect(r, 201, `register ${key}`);
    S[key] = { id: r.body.user.userId };
  }
  const login = async (email, password) => call('POST', '/api/auth/login', null, { email, password });
  expect(await login('alice@uow.edu.au', 'wrong'), 401, 'bad password');
  S.alice = { id: reg.body.user.userId, token: (await login('alice@uow.edu.au', 'Password1')).body.token };
  for (const k of ['bob', 'carol', 'ins']) S[k].token = (await login(`${k}@uow.edu.au`, 'Password1')).body.token;
  const adminLogin = await login('admin@uow.edu.au', 'Password123');
  expect(adminLogin, 200, 'admin login (seed script hash works with LoginController)');
  S.admin = { id: adminLogin.body.user.userId, token: adminLogin.body.token };

  const me = await call('GET', '/api/auth/me', S.alice.token);
  expect(me, 200, 'me');
  assert.equal(me.body.user.email, 'alice@uow.edu.au');
  expect(await call('GET', '/api/auth/me'), 401, 'no token');
  expect(await call('GET', '/api/auth/me', 'garbage'), 401, 'bad token');
  expect(await call('POST', '/api/auth/logout', S.alice.token), 200, 'logout');
});

test('profile: view and update', async () => {
  expect(await call('GET', '/api/profile', S.alice.token), 200, 'view');
  const up = await call('PUT', '/api/profile', S.alice.token, { bio: 'Runs at dawn' });
  expect(up, 200, 'update');
  assert.equal(up.body.user.bio, 'Runs at dawn');
  expect(await call('PUT', '/api/profile', S.alice.token, { name: '  ' }), 400, 'empty name');
});

test('runs: create, validation, history, search, details, ownership, rename', async () => {
  const start = new Date().toISOString();
  const r1 = await call('POST', '/api/runs', S.alice.token, { name: 'Morning jog', distanceKm: 5.5, durationSeconds: 1800, startedAt: start, caloriesBurned: 0 });
  expect(r1, 201, 'create');
  assert.equal(r1.body.pointsEarned, 55);
  assert.deepEqual(r1.body.newBadges, ['First Steps']);
  assert.equal(r1.body.run.distanceKm, 5.5);
  assert.equal(r1.body.run.caloriesBurned, 0);
  S.aliceRun = r1.body.run.runId;

  expect(await call('POST', '/api/runs', S.alice.token, { distanceKm: -5, durationSeconds: 60, startedAt: start }), 400, 'negative distance');
  expect(await call('POST', '/api/runs', S.alice.token, { distanceKm: 5, durationSeconds: 60, startedAt: 'yesterday-ish' }), 400, 'bad date');
  expect(await call('POST', '/api/runs', S.alice.token, { distanceKm: 5 }), 400, 'missing fields');

  // A pace no human reaches is refused at the point of saving, because it is almost always
  // a mis-typed duration — and an accepted one would sit in leaderboards and tournaments
  // until an administrator noticed.
  expect(await call('POST', '/api/runs', S.alice.token, { name: 'Car ride', distanceKm: 150, durationSeconds: 3600, startedAt: start }), 400, 'impossible pace');

  // Bob's long run: 150 km over 15 hours is an ultramarathon pace, so it stands.
  const big = await call('POST', '/api/runs', S.bob.token, { name: 'Ultra', distanceKm: 150, durationSeconds: 54000, startedAt: new Date(Date.now() - 54000000).toISOString() });
  expect(big, 201, 'bob run');
  S.bobRun = big.body.run.runId;

  // Fast but not impossible: 40 km/h is 90 s/km, which the admin's suspicious-run filter
  // below is meant to surface. It belongs to the instructor so Bob's points stay at 1500.
  const suspicious = await call('POST', '/api/runs', S.ins.token, { name: 'Suspiciously quick', distanceKm: 20, durationSeconds: 1800, startedAt: start });
  expect(suspicious, 201, 'borderline-fast run');

  const hist = await call('GET', '/api/runs', S.alice.token);
  expect(hist, 200, 'history');
  assert.equal(hist.body.runs?.length ?? hist.body.length, 1);
  const search = await call('GET', '/api/runs/search?q=morning', S.alice.token);
  expect(search, 200, 'search');
  assert.equal(search.body.runs.length, 1);
  expect(await call('GET', '/api/runs/search', S.alice.token), 400, 'search no q');

  expect(await call('GET', `/api/runs/${S.aliceRun}`, S.alice.token), 200, 'own details');
  expect(await call('GET', `/api/runs/${S.aliceRun}`, S.bob.token), 403, "other user's run");
  expect(await call('GET', '/api/runs/99999', S.alice.token), 404, 'missing run');
  const ren = await call('PATCH', `/api/runs/${S.aliceRun}/name`, S.alice.token, { name: 'Dawn jog' });
  expect(ren, 200, 'rename');
  expect(await call('PATCH', `/api/runs/${S.aliceRun}/description`, S.alice.token, { description: 'Nice' }), 200, 'describe');
  expect(await call('PATCH', `/api/runs/${S.aliceRun}/description`, S.bob.token, { description: 'hax' }), 403, 'describe other');
});

test('groups: create, join limits, private requests, invite, promote, remove', async () => {
  const g = await call('POST', '/api/groups', S.alice.token, { name: 'Wollongong Runners', maxMembers: 3 });
  expect(g, 201, 'create group');
  S.group = g.body.group.groupId;
  expect(await call('POST', '/api/groups', S.bob.token, { name: 'Wollongong Runners' }), 409, 'dup name');

  expect(await call('POST', `/api/groups/${S.group}/join`, S.bob.token), 200, 'bob joins');
  expect(await call('POST', `/api/groups/${S.group}/join`, S.bob.token), 409, 'bob joins twice');
  expect(await call('POST', `/api/groups/${S.group}/join`, S.carol.token), 200, 'carol joins (3/3)');
  expect(await call('POST', `/api/groups/${S.group}/join`, S.ins.token), 409, 'group full');

  const det = await call('GET', `/api/groups/${S.group}`, S.bob.token);
  expect(det, 200, 'details');
  assert.equal(det.body.memberCount, 3);
  const found = await call('GET', '/api/groups/search?q=woll', S.bob.token);
  expect(found, 200, 'search');
  assert.equal(found.body.groups.length, 1);

  expect(await call('PUT', `/api/groups/${S.group}`, S.bob.token, { description: 'x' }), 403, 'non-admin update');
  const upd = await call('PUT', `/api/groups/${S.group}`, S.alice.token, { maxMembers: null, description: 'Weekly runs' });
  expect(upd, 200, 'admin update, clear limit');
  assert.equal(upd.body.group.maxMembers, null);
  expect(await call('POST', `/api/groups/${S.group}/join`, S.ins.token), 200, 'join after limit cleared');

  expect(await call('POST', `/api/groups/${S.group}/members/${S.bob.id}/promote`, S.alice.token), 200, 'promote bob');
  expect(await call('DELETE', `/api/groups/${S.group}/members/${S.ins.id}`, S.bob.token), 200, 'bob removes coach');
  expect(await call('POST', `/api/groups/${S.group}/leave`, S.carol.token), 200, 'carol leaves');

  const priv = await call('POST', '/api/groups', S.bob.token, { name: 'Secret Squad', isPrivate: true });
  expect(priv, 201, 'private group');
  const pg = priv.body.group.groupId;
  const req = await call('POST', `/api/groups/${pg}/join`, S.carol.token);
  expect(req, 200, 'request');
  assert.equal(req.body.status, 'pending');
  expect(await call('POST', `/api/groups/${pg}/requests/respond`, S.bob.token, { userId: S.carol.id, decision: 'accept' }), 200, 'accept');
  expect(await call('POST', `/api/groups/${pg}/invite`, S.bob.token, { userId: S.alice.id }), 200, 'invite');
  expect(await call('POST', `/api/groups/${pg}/invite`, S.bob.token, { userId: S.carol.id }), 409, 'invite existing member');

  expect(await call('GET', '/api/groups/abc', S.bob.token), 400, 'bad id');
  expect(await call('GET', '/api/groups/99999', S.bob.token), 404, 'missing group');
  const lb = await call('GET', `/api/groups/${S.group}/leaderboard`, S.bob.token);
  expect(lb, 200, 'group leaderboard');
  assert.equal(typeof lb.body.leaderboard?.[0]?.total_distance_km ?? typeof lb.body[0]?.total_distance_km, 'number');
});

test('tournaments: create, limits, concurrent joins, status, standings, withdraw, delete', async () => {
  const t = await call('POST', `/api/groups/${S.group}/tournaments`, S.alice.token, { name: 'Park 5K', distanceType: '5K' });
  expect(t, 201, 'create');
  S.tour = t.body.tournament.tournamentId;
  expect(await call('POST', `/api/groups/${S.group}/tournaments`, S.carol.token, { name: 'X' }), 403, 'non-admin create');
  expect((await call('GET', `/api/groups/${S.group}/tournaments`, S.bob.token)), 200, 'list');

  expect(await call('PATCH', `/api/tournaments/${S.tour}/limits`, S.alice.token, { maxParticipants: 1 }), 200, 'limit 1');
  // re-add carol & coach as members so 3 members race for 1 place
  await call('POST', `/api/groups/${S.group}/join`, S.carol.token);
  await call('POST', `/api/groups/${S.group}/join`, S.ins.token);
  const race = await Promise.all([S.alice, S.bob, S.carol, S.ins].map((u) => call('POST', `/api/tournaments/${S.tour}/join`, u.token)));
  assert.equal(race.filter((r) => r.status === 200).length, 1, 'exactly one joins: ' + race.map((r) => r.status));
  assert.ok(race.filter((r) => r.status === 409).every((r) => /maximum participant/.test(r.body.error)));

  const winner = [S.alice, S.bob, S.carol, S.ins][race.findIndex((r) => r.status === 200)];
  expect(await call('POST', `/api/tournaments/${S.tour}/join`, winner.token), 409, 'join twice');
  expect(await call('POST', `/api/tournaments/${S.tour}/withdraw`, winner.token), 200, 'withdraw');
  expect(await call('POST', `/api/tournaments/${S.tour}/join`, winner.token), 200, 'rejoin after withdraw');

  const det = await call('GET', `/api/tournaments/${S.tour}`, S.bob.token);
  expect(det, 200, 'details');
  assert.equal(det.body.participantCount, 1);

  expect(await call('PATCH', `/api/tournaments/${S.tour}/status`, S.alice.token, { status: 'completed' }), 400, 'skip to completed');
  expect(await call('PATCH', `/api/tournaments/${S.tour}/status`, S.alice.token, { status: 'in_progress' }), 200, 'start');
  expect(await call('POST', `/api/tournaments/${S.tour}/withdraw`, winner.token), 409, 'withdraw after start');
  expect(await call('PATCH', `/api/tournaments/${S.tour}/status`, S.alice.token, { status: 'completed' }), 200, 'complete');
  expect(await call('GET', `/api/tournaments/${S.tour}/standings`, S.bob.token), 200, 'standings');
  expect(await call('PUT', `/api/tournaments/${S.tour}`, S.alice.token, { description: 'Done' }), 200, 'update details');

  const t2 = await call('POST', `/api/groups/${S.group}/tournaments`, S.alice.token, { name: 'Temp' });
  expect(await call('DELETE', `/api/tournaments/${t2.body.tournament.tournamentId}`, S.carol.token), 403, 'non-admin delete');
  expect(await call('DELETE', `/api/tournaments/${t2.body.tournament.tournamentId}`, S.alice.token), 200, 'delete');
  expect(await call('GET', '/api/tournaments/xyz', S.bob.token), 400, 'bad id');
});

test('rewards and badges: list, claim, double-claim race, claimed history, badge display', async () => {
  const list = await call('GET', '/api/rewards', S.bob.token);
  expect(list, 200, 'list');
  assert.equal(list.body.points, 1500); // 150 km * 10
  const cap = list.body.rewards.find((r) => r.name === 'Run League Cap'); // 300 pts

  // Bob (1500 pts) fires 6 simultaneous claims for a 300-pt item -> exactly 5 succeed
  const spam = await Promise.all(Array.from({ length: 6 }, () => call('POST', `/api/rewards/${cap.rewardId}/claim`, S.bob.token)));
  assert.equal(spam.filter((r) => r.status === 200).length, 5, spam.map((r) => r.status).join());
  assert.equal((await call('GET', '/api/rewards', S.bob.token)).body.points, 0);
  const claimed = await call('GET', '/api/rewards/claimed', S.bob.token);
  expect(claimed, 200, 'claimed');
  assert.equal(claimed.body.claims?.length ?? claimed.body.rewards?.length ?? claimed.body.length, 5);
  expect(await call('POST', '/api/rewards/99999/claim', S.bob.token), 404, 'missing reward');
  expect(await call('POST', '/api/rewards/abc/claim', S.bob.token), 400, 'bad reward id');

  const badges = await call('GET', '/api/rewards/badges', S.bob.token);
  expect(badges, 200, 'badges');
  const bid = badges.body.badges[0].badge_id;
  expect(await call('PATCH', `/api/rewards/badges/${bid}/display`, S.bob.token, { isDisplayed: false }), 200, 'hide badge');
  expect(await call('PATCH', `/api/rewards/badges/${bid}/display`, S.carol.token, { isDisplayed: false }), 404, 'unearned badge');
});

test('leaderboard and notifications', async () => {
  const lb = await call('GET', '/api/leaderboard', S.alice.token);
  expect(lb, 200, 'global');
  const rows = lb.body.leaderboard ?? lb.body;
  assert.equal(rows[0].user_id, S.bob.id);

  expect(await call('GET', '/api/notifications', S.alice.token), 200, 'list');
  expect(await call('GET', '/api/notifications/preferences', S.alice.token), 200, 'prefs');
  const up = await call('PUT', '/api/notifications/preferences', S.alice.token, { exerciseReminders: false });
  expect(up, 200, 'update prefs');
  assert.equal(up.body.preferences.exercise_reminders, false);
  expect(await call('POST', '/api/notifications/push-token', S.alice.token, { pushToken: 'ExponentPushToken[test]' }), 200, 'push token');
  expect(await call('PATCH', '/api/notifications/99999/read', S.alice.token), 404, 'mark missing');
});

test('admin: access control', async () => {
  expect(await call('GET', '/api/admin/stats', S.alice.token), 403, 'normal user');
  expect(await call('GET', '/api/admin/stats'), 401, 'no token');
  const stats = await call('GET', '/api/admin/stats', S.admin.token);
  expect(stats, 200, 'admin stats');
  assert.equal(stats.body.stats.users.totalUsers, 5);
  assert.equal(stats.body.stats.users.instructors, 1);
  assert.equal(stats.body.stats.rewards.totalClaims, 5);
});

test('admin: users', async () => {
  const list = await call('GET', '/api/admin/users?search=uow&role=registered_user', S.admin.token);
  expect(list, 200, 'list');
  assert.equal(list.body.pagination.total, 3);
  expect(await call('GET', `/api/admin/users/${S.alice.id}`, S.admin.token), 200, 'view');

  const created = await call('POST', '/api/admin/users', S.admin.token, { email: 'Dave@UOW.edu.au', password: 'Password1', name: 'Dave' });
  expect(created, 201, 'create');
  expect(await call('POST', '/api/auth/login', null, { email: 'dave@uow.edu.au', password: 'Password1' }), 200, 'created user can log in');

  expect(await call('PATCH', `/api/admin/users/${S.ins.id}/instructor-verification`, S.admin.token, { verified: true }), 200, 'verify');
  expect(await call('PATCH', `/api/admin/users/${S.alice.id}/instructor-verification`, S.admin.token, { verified: true }), 400, 'verify non-instructor');

  expect(await call('PATCH', `/api/admin/users/${S.carol.id}/suspension`, S.admin.token, { isSuspended: true, reason: 'spam' }), 200, 'suspend');
  expect(await call('GET', '/api/profile', S.carol.token), 403, 'suspended token blocked immediately');
  expect(await call('POST', '/api/auth/login', null, { email: 'carol@uow.edu.au', password: 'Password1' }), 403, 'suspended login');
  expect(await call('PATCH', `/api/admin/users/${S.carol.id}/suspension`, S.admin.token, { isSuspended: false }), 200, 'unsuspend');
  expect(await call('GET', '/api/profile', S.carol.token), 200, 'access restored');

  expect(await call('PATCH', `/api/admin/users/${S.admin.id}/role`, S.admin.token, { role: 'registered_user' }), 400, 'self demote');
  expect(await call('PATCH', `/api/admin/users/${S.bob.id}/role`, S.admin.token, { role: 'system_admin' }), 200, 'promote bob');
  expect(await call('GET', '/api/admin/stats', S.bob.token), 200, 'bob now admin (same token)');
  expect(await call('PATCH', `/api/admin/users/${S.bob.id}/role`, S.admin.token, { role: 'registered_user' }), 200, 'demote bob');
  expect(await call('GET', '/api/admin/stats', S.bob.token), 403, 'bob loses access immediately');

  expect(await call('DELETE', `/api/admin/users/${S.alice.id}`, S.admin.token), 409, 'delete group creator refused');
  expect(await call('DELETE', `/api/admin/users/${created.body.user.userId}`, S.admin.token), 200, 'delete dave');
  expect(await call('GET', '/api/admin/users/abc', S.admin.token), 400, 'bad id');
});

test('admin: groups, runs, rewards, badges, announcements, audit log', async () => {
  const groups = await call('GET', '/api/admin/groups', S.admin.token);
  expect(groups, 200, 'list groups');
  assert.equal(groups.body.pagination.total, 2);

  expect(await call('PATCH', `/api/admin/groups/${S.group}/suspension`, S.admin.token, { isSuspended: true, reason: 'Review' }), 200, 'suspend group');
  expect(await call('GET', `/api/groups/${S.group}`, S.bob.token), 403, 'member blocked');
  expect(await call('GET', `/api/tournaments/${S.tour}`, S.bob.token), 403, 'tournament blocked');
  expect(await call('GET', `/api/groups/${S.group}`, S.admin.token), 200, 'admin can still view');
  const notes = await call('GET', '/api/notifications', S.bob.token);
  assert.ok(JSON.stringify(notes.body).includes('Reason: Review'));
  expect(await call('PATCH', `/api/admin/groups/${S.group}/suspension`, S.admin.token, { isSuspended: false }), 200, 'reinstate');

  const fast = await call('GET', '/api/admin/runs?maxPaceSecondsPerKm=150', S.admin.token);
  expect(fast, 200, 'suspicious runs');
  assert.equal(fast.body.runs.length, 1);
  expect(await call('DELETE', `/api/admin/runs/${S.bobRun}`, S.admin.token, { reason: 'Could not be verified' }), 200, 'delete run');
  expect(await call('GET', `/api/admin/runs?userId=${S.bob.id}`, S.admin.token), 200, 'filter by user');

  const nr = await call('POST', '/api/admin/rewards', S.admin.token, { name: 'Water bottle', pointsRequired: 50, stock: 2, rewardType: 'voucher' });
  expect(nr, 201, 'create reward');
  expect(await call('PATCH', `/api/admin/rewards/${nr.body.reward.rewardId}`, S.admin.token, { isActive: false }), 200, 'deactivate');
  const visible = await call('GET', '/api/rewards', S.alice.token);
  assert.ok(!visible.body.rewards.some((r) => r.name === 'Water bottle'), 'inactive reward hidden from users');
  expect(await call('POST', '/api/admin/rewards', S.admin.token, { name: 'Bad', pointsRequired: -1 }), 400, 'invalid reward');

  const nb = await call('POST', '/api/admin/badges', S.admin.token, { name: 'Early Bird', description: 'Ran before 6am' });
  expect(nb, 201, 'create badge');
  const badgeId = nb.body.badge.badgeId;
  expect(await call('POST', `/api/admin/users/${S.alice.id}/badges`, S.admin.token, { badgeId }), 201, 'award');
  const aliceBadges = await call('GET', '/api/rewards/badges', S.alice.token);
  assert.ok(aliceBadges.body.badges.some((b) => b.name === 'Early Bird'), 'alice sees awarded badge');
  expect(await call('DELETE', `/api/admin/badges/${badgeId}`, S.admin.token), 409, 'delete earned badge');
  expect(await call('DELETE', `/api/admin/users/${S.alice.id}/badges/${badgeId}`, S.admin.token), 200, 'revoke');
  expect(await call('DELETE', `/api/admin/badges/${badgeId}`, S.admin.token), 200, 'delete badge');
  const firstSteps = (await call('GET', '/api/admin/badges', S.admin.token)).body.badges.find((b) => b.name === 'First Steps');
  expect(await call('PATCH', `/api/admin/badges/${firstSteps.badgeId}`, S.admin.token, { name: 'Renamed' }), 400, 'rename system badge');

  const ann = await call('POST', '/api/admin/announcements', S.admin.token, { title: 'Maintenance', body: 'Down at 2am Sunday' });
  expect(ann, 201, 'announce');
  assert.equal(ann.body.recipients, 5);

  const logs = await call('GET', '/api/admin/audit-logs', S.admin.token);
  expect(logs, 200, 'audit');
  const actions = new Set(logs.body.logs.map((l) => l.action));
  for (const a of ['CREATE_USER', 'VERIFY_INSTRUCTOR', 'SUSPEND_USER', 'CHANGE_ROLE', 'DELETE_USER', 'SUSPEND_GROUP',
                   'DELETE_RUN', 'CREATE_REWARD', 'UPDATE_REWARD', 'CREATE_BADGE', 'AWARD_BADGE', 'REVOKE_BADGE',
                   'DELETE_BADGE', 'SEND_ANNOUNCEMENT']) assert.ok(actions.has(a), `audit has ${a}`);
});

test('unknown route returns JSON 404', async () => {
  expect(await call('GET', '/api/nope'), 404, 'unknown');
});
