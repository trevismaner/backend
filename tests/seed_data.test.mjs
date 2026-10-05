/**
 * Checks the seeded demo data: logs in as every account and confirms each role sees what
 * `npm run seed:reset` promises, including the two newest admin use cases (SA-06, SA-21).
 *
 * Run it against a seeded database, with the server up:
 *   npm run seed:reset
 *   npm start            # terminal 1
 *   npm run test:seed    # terminal 2
 *
 * It changes data as it goes (renames a user, resets a password, verifies an instructor),
 * so re-seed before running it again.
 */
const BASE = process.env.TEST_URL || 'http://localhost:3000/api';
let pass = 0, fail = 0;
const ok = (label, cond, detail = '') => {
  if (cond) { pass++; console.log(`  ok   ${label}`); }
  else { fail++; console.log(`  FAIL ${label}${detail ? `\n         ${detail}` : ''}`); }
};
const api = async (path, { method = 'GET', token, body } = {}) => {
  const r = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: r.status, data: await r.json().catch(() => null) };
};
const login = (email) => api('/auth/login', { method: 'POST', body: { email, password: 'Password123' } });

console.log('\n━━━ EVERY SEEDED ACCOUNT CAN LOG IN ━━━');
const tok = {};
for (const [key, email, role] of [
  ['admin', 'admin@runleague.test', 'system_admin'],
  ['coach', 'coach@runleague.test', 'instructor'],
  ['newcoach', 'newcoach@runleague.test', 'instructor'],
  ['alice', 'alice@runleague.test', 'registered_user'],
  ['ben', 'ben@runleague.test', 'registered_user'],
  ['chloe', 'chloe@runleague.test', 'registered_user'],
  ['dan', 'dan@runleague.test', 'registered_user'],
]) {
  const r = await login(email);
  ok(`${email} logs in as ${role}`, r.status === 200 && r.data?.user?.role === role, JSON.stringify(r.data).slice(0, 120));
  tok[key] = r.data?.token;
}
const susp = await login('suspended@runleague.test');
ok('suspended@runleague.test is refused with 403', susp.status === 403, `got ${susp.status}`);

console.log('\n━━━ SYSTEM ADMIN ━━━');
const stats = await api('/admin/stats', { token: tok.admin });
ok('sees platform stats', stats.status === 200 && stats.data.stats.users.totalUsers === 8, JSON.stringify(stats.data?.stats?.users));
ok('counts 2 instructors, 1 unverified', stats.data?.stats?.users?.instructors === 2 && stats.data?.stats?.users?.unverifiedInstructors === 1, JSON.stringify(stats.data?.stats?.users));
ok('counts 1 suspended user', stats.data?.stats?.users?.suspendedUsers === 1);
ok('counts 3 groups, 1 suspended', stats.data?.stats?.groups?.total === 3 && stats.data?.stats?.groups?.suspended === 1, JSON.stringify(stats.data?.stats?.groups));
ok('counts 3 tournaments across all statuses',
  stats.data?.stats?.tournaments?.open === 1 && stats.data?.stats?.tournaments?.inProgress === 1 && stats.data?.stats?.tournaments?.completed === 1,
  JSON.stringify(stats.data?.stats?.tournaments));
ok('counts 29 runs', stats.data?.stats?.runs?.total === 29, JSON.stringify(stats.data?.stats?.runs));
ok('sees 1 reward claim', stats.data?.stats?.rewards?.totalClaims === 1);

const users = await api('/admin/users', { token: tok.admin });
ok('lists all 8 users', users.data?.pagination?.total === 8, JSON.stringify(users.data?.pagination));
const sus = await api('/admin/users?suspended=true', { token: tok.admin });
ok('can filter to suspended users', sus.data?.pagination?.total === 1);
const events = await api('/admin/public-events', { token: tok.admin });
ok('sees 2 public events (SA-13)', events.status === 200 && events.data?.events?.length === 2, JSON.stringify(events.data).slice(0, 150));

console.log('\n━━━ SA-06: edit a user (the new endpoint) ━━━');
const dan = (await api('/admin/users?search=dan@runleague', { token: tok.admin })).data.users[0];
const edit = await api(`/admin/users/${dan.userId}`, { method: 'PUT', token: tok.admin, body: { name: 'Daniel Fischer' } });
ok('renames a user', edit.status === 200 && edit.data.user.name === 'Daniel Fischer', JSON.stringify(edit.data).slice(0, 140));
const pwReset = await api(`/admin/users/${dan.userId}`, { method: 'PUT', token: tok.admin, body: { password: 'BrandNewPass1' } });
ok('resets a password', pwReset.status === 200);
ok('the new password works', (await api('/auth/login', { method: 'POST', body: { email: 'dan@runleague.test', password: 'BrandNewPass1' } })).status === 200);
ok('the old password no longer works', (await login('dan@runleague.test')).status === 401);
const clash = await api(`/admin/users/${dan.userId}`, { method: 'PUT', token: tok.admin, body: { email: 'alice@runleague.test' } });
ok('a duplicate email is refused with 409', clash.status === 409, JSON.stringify(clash.data));
ok('an empty body is refused with 400', (await api(`/admin/users/${dan.userId}`, { method: 'PUT', token: tok.admin, body: {} })).status === 400);
ok('a short password is refused with 400', (await api(`/admin/users/${dan.userId}`, { method: 'PUT', token: tok.admin, body: { password: 'short' } })).status === 400);
ok('a normal user cannot edit accounts', (await api(`/admin/users/${dan.userId}`, { method: 'PUT', token: tok.alice, body: { name: 'x' } })).status === 403);

console.log('\n━━━ SA-21: edit a group (the new endpoint) ━━━');
const groups = (await api('/admin/groups', { token: tok.admin })).data.groups;
const woll = groups.find((g) => g.name === 'Wollongong Runners');
const ren = await api(`/admin/groups/${woll.groupId}`, { method: 'PUT', token: tok.admin, body: { name: 'Illawarra Runners' } });
ok('renames a group', ren.status === 200 && ren.data.group.name === 'Illawarra Runners', JSON.stringify(ren.data).slice(0, 140));
ok('members are kept after the rename', (await api(`/admin/groups?search=Illawarra`, { token: tok.admin })).data.groups[0].memberCount === 4);
const tooSmall = await api(`/admin/groups/${woll.groupId}`, { method: 'PUT', token: tok.admin, body: { maxMembers: 2 } });
ok('a cap below current membership is refused with 409', tooSmall.status === 409, JSON.stringify(tooSmall.data));
const nameClash = await api(`/admin/groups/${woll.groupId}`, { method: 'PUT', token: tok.admin, body: { name: 'Dawn Patrol' } });
ok('a duplicate group name is refused with 409', nameClash.status === 409);
ok('clearing the member limit works', (await api(`/admin/groups/${woll.groupId}`, { method: 'PUT', token: tok.admin, body: { maxMembers: null } })).data.group.maxMembers === null);
ok('an empty body is refused with 400', (await api(`/admin/groups/${woll.groupId}`, { method: 'PUT', token: tok.admin, body: {} })).status === 400);
ok('a normal user cannot edit groups', (await api(`/admin/groups/${woll.groupId}`, { method: 'PUT', token: tok.alice, body: { name: 'x' } })).status === 403);
// restore the name so later checks read naturally
await api(`/admin/groups/${woll.groupId}`, { method: 'PUT', token: tok.admin, body: { name: 'Wollongong Runners' } });

console.log('\n━━━ VERIFIED INSTRUCTOR ━━━');
const me = await api('/auth/me', { token: tok.coach });
ok('is verified', me.data?.user?.role === 'instructor');
const myPosts = await api('/instructor-posts/mine', { token: tok.coach });
ok('sees own 2 posts', myPosts.status === 200 && (myPosts.data.posts ?? myPosts.data).length === 2, JSON.stringify(myPosts.data).slice(0, 120));
const newPost = await api('/instructor-posts', { method: 'POST', token: tok.coach, body: { title: 'Taper week', content: 'Cut volume, keep intensity.', category: 'training' } });
ok('can publish a post', newPost.status === 201, JSON.stringify(newPost.data).slice(0, 120));

console.log('\n━━━ UNVERIFIED INSTRUCTOR ━━━');
const blocked = await api('/instructor-posts', { method: 'POST', token: tok.newcoach, body: { title: 'Hi', content: 'Hello there everyone.' } });
ok('cannot publish until verified (403)', blocked.status === 403, `got ${blocked.status}: ${JSON.stringify(blocked.data)}`);
const nc = (await api('/admin/users?search=newcoach', { token: tok.admin })).data.users[0];
ok('admin can verify them (SA-11)', (await api(`/admin/users/${nc.userId}/instructor-verification`, { method: 'PATCH', token: tok.admin, body: { verified: true } })).status === 200);
ok('then they can publish', (await api('/instructor-posts', { method: 'POST', token: tok.newcoach, body: { title: 'First post', content: 'Now verified, so here goes.' } })).status === 201);

console.log('\n━━━ RUNNER: alice (active) ━━━');
const aRuns = await api('/runs', { token: tok.alice });
ok('sees her run history', aRuns.status === 200 && (aRuns.data.runs ?? aRuns.data).length > 0);
const insights = await api('/runs/insights', { token: tok.alice });
ok('has insights (RU-19)', insights.status === 200, JSON.stringify(insights.data).slice(0, 120));
const aBadges = await api('/rewards/badges', { token: tok.alice });
ok('earned First Steps and Consistent Runner (12 runs)',
  ['First Steps', 'Consistent Runner'].every((n) => aBadges.data.badges.some((b) => b.name === n)),
  JSON.stringify(aBadges.data.badges?.map((b) => b.name)));
const mine = await api('/groups/mine', { token: tok.alice });
ok('is in 2 groups', (mine.data.groups ?? mine.data).length === 2, JSON.stringify(mine.data).slice(0, 140));
const aTours = await api('/tournaments/mine', { token: tok.alice });
ok('is entered in 3 tournaments', aTours.data.joined?.length === 3, JSON.stringify(aTours.data.joined?.map((t) => t.name)));
ok('and created 3 of them as group admin', aTours.data.created?.length === 3, JSON.stringify(aTours.data.created?.map((t) => t.name)));
const plan = await api('/fitness-plans', { token: tok.alice });
ok('has a fitness plan', plan.status === 200 && JSON.stringify(plan.data).includes('race_prep'), JSON.stringify(plan.data).slice(0, 140));

console.log('\n━━━ RUNNER: ben (top of leaderboard) ━━━');
const board = await api('/leaderboard', { token: tok.ben });
const rows = board.data.leaderboard ?? board.data;
ok('tops the global leaderboard', rows[0].name === 'Ben Carter', JSON.stringify(rows.slice(0, 2)));
ok('distances come back as numbers, not strings', typeof rows[0].total_distance_km === 'number', typeof rows[0].total_distance_km);
ok('the suspended user is not on the board', !rows.some((r) => r.name === 'Sam Rowe'));
const claimed = await api('/rewards/claimed', { token: tok.ben });
ok('has 1 claimed reward', (claimed.data.claims ?? claimed.data.rewards ?? claimed.data).length === 1, JSON.stringify(claimed.data).slice(0, 140));

console.log('\n━━━ COMPLETED TOURNAMENT HAS REAL RESULTS ━━━');
const all = await api('/tournaments/mine', { token: tok.ben });
const done = (all.data.joined ?? []).find((t) => t.status === 'completed');
ok('a completed tournament exists', !!done, JSON.stringify(all.data.joined?.map((t) => `${t.name}:${t.status}`)));
if (done) {
  const st = await api(`/tournaments/${done.tournamentId}/standings`, { token: tok.ben });
  const s = st.data.standings;
  ok('standings are ranked 1,2,3', s.map((r) => r.rank).join(',') === '1,2,3', JSON.stringify(s));
  ok('the fastest time is rank 1', s[0].name === 'Ben Carter' && Number(s[0].result_time_seconds) === 5112, JSON.stringify(s[0]));
}

console.log('\n━━━ RUNNER: dan (brand new) ━━━');
const danTok = (await api('/auth/login', { method: 'POST', body: { email: 'dan@runleague.test', password: 'BrandNewPass1' } })).data.token;
const dRuns = await api('/runs', { token: danTok });
ok('has no runs yet', (dRuns.data.runs ?? dRuns.data).length === 0);
const notes = await api('/notifications', { token: danTok });
ok('still received the welcome announcement', JSON.stringify(notes.data).includes('Welcome to Run League'));

console.log('\n━━━ SUSPENDED GROUP IS BLOCKED ━━━');
const flagged = (await api('/admin/groups?suspended=true', { token: tok.admin })).data.groups[0];
ok('a suspended group exists', !!flagged, JSON.stringify(flagged));
ok('a normal user cannot open it (403)', (await api(`/groups/${flagged.groupId}`, { token: tok.alice })).status === 403);
ok('the admin still can', (await api(`/groups/${flagged.groupId}`, { token: tok.admin })).status === 200);

console.log('\n━━━ PENDING JOIN REQUEST IS WAITING ━━━');
const dawn = (await api('/admin/groups?search=Dawn', { token: tok.admin })).data.groups[0];
const members = await api(`/groups/${dawn.groupId}`, { token: tok.ben });
const statuses = (members.data.members ?? []).map((m) => m.status);
ok('Dawn Patrol has a pending and an invited member', statuses.includes('pending') && statuses.includes('invited'), JSON.stringify(statuses));

console.log('\n━━━ AUDIT LOG RECORDED THE ADMIN WORK ━━━');
const logs = await api('/admin/audit-logs', { token: tok.admin });
const actions = new Set(logs.data.logs.map((l) => l.action));
for (const a of ['UPDATE_USER', 'UPDATE_GROUP', 'VERIFY_INSTRUCTOR']) {
  ok(`logged ${a}`, actions.has(a), [...actions].join(','));
}

console.log('\n' + '─'.repeat(64));
console.log(`  ${pass} passed, ${fail} failed`);
console.log('─'.repeat(64) + '\n');
process.exit(fail ? 1 : 0);
