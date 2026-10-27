/**
 * Covers the features the other suites touch least: public events, fitness plans, risk
 * assessment, the instructor post lifecycle, and instructor credentials (IU-04 / SA-11).
 *
 * Run it against a freshly seeded database, with the server up:
 *   npm run seed:reset
 *   npm start               # terminal 1
 *   npm run test:features   # terminal 2
 *
 * It creates and deletes data as it goes, so re-seed before running it again.
 */
const BASE = process.env.TEST_URL || 'http://localhost:3000/api';
let pass = 0, fail = 0;
const issues = [];
const ok = (label, cond, detail = '') => {
  if (cond) { pass++; console.log(`  ok   ${label}`); }
  else { fail++; issues.push(`${label} — ${detail}`); console.log(`  FAIL ${label}\n         ${detail}`); }
};
const api = async (path, { method = 'GET', token, body } = {}) => {
  const r = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const t = await r.text();
  let d; try { d = t ? JSON.parse(t) : null; } catch { d = t; }
  return { status: r.status, data: d };
};
const login = async (e) => (await api('/auth/login', { method: 'POST', body: { email: e, password: 'Password123' } })).data.token;

const T = {};
for (const k of ['admin', 'coach', 'newcoach', 'alice', 'ben', 'chloe', 'dan']) T[k] = await login(`${k}@runleague.test`);

console.log('\n━━━ PUBLIC EVENTS (RU-39, SA-12..15) ━━━');
const evs = await api('/public-events', { token: T.alice });
ok('a runner can list public events', evs.status === 200 && evs.data.events?.length === 2, JSON.stringify(evs.data).slice(0, 120));
const ev = evs.data.events.find((e) => e.name === 'New Year Fun Run');
ok('each row says whether the viewer is registered', 'isRegistered' in (evs.data.events[0] ?? {}), JSON.stringify(evs.data.events[0]));
const joined = await api(`/public-events/${ev.eventId}/join`, { method: 'POST', token: T.chloe });
ok('a runner can enter an event', joined.status === 200, JSON.stringify(joined.data));
ok('entering twice is refused', (await api(`/public-events/${ev.eventId}/join`, { method: 'POST', token: T.chloe })).status === 409);
const det = await api(`/public-events/${ev.eventId}`, { token: T.chloe });
ok('detail shows the participant', det.data.participants?.some((p) => p.name === 'Chloe Nguyen'), JSON.stringify(det.data.participants));
ok('withdraw works', (await api(`/public-events/${ev.eventId}/withdraw`, { method: 'POST', token: T.chloe })).status === 200);
const twice = await api(`/public-events/${ev.eventId}/withdraw`, { method: 'POST', token: T.chloe });
ok('withdrawing twice is refused with 409', twice.status === 409, `got ${twice.status} ${JSON.stringify(twice.data)}`);
ok('a runner cannot create an event', (await api('/admin/public-events', { method: 'POST', token: T.alice, body: { name: 'Sneaky' } })).status === 403);
const badDates = await api('/admin/public-events', { method: 'POST', token: T.admin, body: { name: 'Bad', startDate: '2026-12-01', endDate: '2026-11-01' } });
ok('end before start is refused', badDates.status === 400, JSON.stringify(badDates.data));
const capped = await api('/admin/public-events', { method: 'POST', token: T.admin, body: { name: 'Tiny Race', maxParticipants: 1 } });
ok('admin can create an event', capped.status === 201, JSON.stringify(capped.data).slice(0, 120));
const tiny = capped.data.event.eventId;
await api(`/public-events/${tiny}/join`, { method: 'POST', token: T.alice });
const full = await api(`/public-events/${tiny}/join`, { method: 'POST', token: T.ben });
ok('capacity is enforced', full.status === 409, `got ${full.status} ${JSON.stringify(full.data)}`);
ok('admin can delete an event', (await api(`/admin/public-events/${tiny}`, { method: 'DELETE', token: T.admin })).status === 200);

console.log('\n━━━ FITNESS PLANS (RU-20..23) ━━━');
const plan = await api('/fitness-plans', { token: T.alice });
ok('alice has a seeded plan', plan.status === 200 && JSON.stringify(plan.data).includes('race_prep'), JSON.stringify(plan.data).slice(0, 140));
const newPlan = await api('/fitness-plans', { method: 'POST', token: T.dan, body: { goalType: 'general_fitness', targetDistanceKm: 5, weeklyFrequency: 3, durationWeeks: 6 } });
ok('a runner can create a plan', newPlan.status === 201, JSON.stringify(newPlan.data).slice(0, 140));
const planId = newPlan.data.plan?.planId ?? newPlan.data.planId;
const upd = await api(`/fitness-plans/${planId}`, { method: 'PUT', token: T.dan, body: { weeklyFrequency: 4 } });
ok('a runner can update their plan', upd.status === 200, JSON.stringify(upd.data).slice(0, 140));
ok("a runner cannot touch someone else's plan", [403, 404].includes((await api(`/fitness-plans/${planId}`, { method: 'PUT', token: T.ben, body: { weeklyFrequency: 9 } })).status));
ok('a runner can delete their plan', (await api(`/fitness-plans/${planId}`, { method: 'DELETE', token: T.dan })).status === 200);

console.log('\n━━━ RISK ASSESSMENT (RU-24..27) ━━━');
const form = await api('/risk-assessment/form', { method: 'PUT', token: T.dan, body: { isCurrentlySick: false, chronicConditions: [], pastInjuries: [], selfRatedSoreness: 3 } });
ok('a runner can submit the form', [200, 201].includes(form.status), JSON.stringify(form.data).slice(0, 140));
const score = await api('/risk-assessment', { token: T.dan });
ok('a score is produced', score.status === 200, JSON.stringify(score.data).slice(0, 200));
const lvl = score.data?.score?.riskLevel ?? score.data?.riskLevel ?? score.data?.risk?.riskLevel;
ok('the score has a risk level', ['low','moderate','high'].includes(lvl), `level=${lvl} body=${JSON.stringify(score.data).slice(0,200)}`);
const badSoreness = await api('/risk-assessment/form', { method: 'PUT', token: T.dan, body: { selfRatedSoreness: 99 } });
ok('out-of-range soreness is refused', badSoreness.status === 400, `got ${badSoreness.status} ${JSON.stringify(badSoreness.data)}`);
const sick = await api('/risk-assessment/form', { method: 'PUT', token: T.chloe, body: { isCurrentlySick: true, chronicConditions: ['asthma'], pastInjuries: [], selfRatedSoreness: 9 } });
ok('a higher-risk profile is accepted', [200,201].includes(sick.status), JSON.stringify(sick.data).slice(0,140));
const sickScore = await api('/risk-assessment', { token: T.chloe });
const sickLvl = sickScore.data?.score?.riskLevel ?? sickScore.data?.riskLevel;
ok('it scores at least as high as the healthy runner', ['low','moderate','high'].indexOf(sickLvl) >= ['low','moderate','high'].indexOf(lvl), `healthy=${lvl} sick=${sickLvl}`);

console.log('\n━━━ INSTRUCTOR POST LIFECYCLE (IU-05..08) ━━━');
const mk = await api('/instructor-posts', { method: 'POST', token: T.coach, body: { title: 'Lifecycle test', content: 'Content long enough to be valid.', category: 'training' } });
ok('verified instructor can publish', mk.status === 201, JSON.stringify(mk.data).slice(0, 140));
const pid = mk.data.post.postId;
ok('a runner can read the board', (await api('/instructor-posts', { token: T.alice })).status === 200);
ok('a runner cannot publish', (await api('/instructor-posts', { method: 'POST', token: T.alice, body: { title: 'x', content: 'runners should not post here' } })).status === 403);
ok('author can edit own post', (await api(`/instructor-posts/${pid}`, { method: 'PUT', token: T.coach, body: { title: 'Lifecycle test edited' } })).status === 200);
const otherEdit = await api(`/instructor-posts/${pid}`, { method: 'PUT', token: T.newcoach, body: { title: 'hijack' } });
ok("another instructor cannot edit it", [403, 404].includes(otherEdit.status), `got ${otherEdit.status}`);
ok('admin can edit any post (SA-17)', (await api(`/instructor-posts/${pid}`, { method: 'PUT', token: T.admin, body: { title: 'Moderated' } })).status === 200);
ok('author can delete own post', (await api(`/instructor-posts/${pid}`, { method: 'DELETE', token: T.coach })).status === 200);
ok('deleting it again 404s', (await api(`/instructor-posts/${pid}`, { method: 'DELETE', token: T.coach })).status === 404);

console.log('\n━━━ CREDENTIALS (IU-04 / SA-11) ━━━');
ok('unsubmitted reads as not_submitted', (await api('/profile/credentials', { token: T.newcoach })).data.credentials.status === 'not_submitted');
ok('a runner has no credentials', (await api('/profile/credentials', { token: T.alice })).status === 403);
ok('blank qualification refused', (await api('/profile/credentials', { method: 'PUT', token: T.newcoach, body: { qualification: '   ' } })).status === 400);
ok('over-long qualification refused', (await api('/profile/credentials', { method: 'PUT', token: T.newcoach, body: { qualification: 'x'.repeat(201) } })).status === 400);
const sub = await api('/profile/credentials', { method: 'PUT', token: T.newcoach, body: { qualification: 'Level 3 Coach', reference: 'L3-001' } });
ok('submitting works', sub.status === 200 && sub.data.credentials.status === 'pending', JSON.stringify(sub.data));
const ncId = (await api('/admin/users?search=newcoach', { token: T.admin })).data.users[0].userId;
const seen = await api(`/admin/users/${ncId}`, { token: T.admin });
ok('admin sees the submission', seen.data.user.credentialQualification === 'Level 3 Coach', JSON.stringify(seen.data.user).slice(0, 200));
ok('still blocked from publishing while pending', (await api('/instructor-posts', { method: 'POST', token: T.newcoach, body: { title: 'x', content: 'still pending review here' } })).status === 403);
await api(`/admin/users/${ncId}/instructor-verification`, { method: 'PATCH', token: T.admin, body: { verified: true } });
ok('publishing works once verified', (await api('/instructor-posts', { method: 'POST', token: T.newcoach, body: { title: 'Now verified', content: 'Publishing after verification.' } })).status === 201);
ok('resubmitting returns to pending', (await api('/profile/credentials', { method: 'PUT', token: T.newcoach, body: { qualification: 'Level 4 Coach' } })).data.credentials.status === 'pending');
ok('and blocks publishing again', (await api('/instructor-posts', { method: 'POST', token: T.newcoach, body: { title: 'y', content: 'should be blocked once more' } })).status === 403);

console.log('\n━━━ NOTIFICATIONS & LEADERBOARDS ━━━');
const notes = await api('/notifications', { token: T.alice });
const nid = (notes.data.notifications ?? notes.data)[0]?.notification_id;
ok('marking read works', (await api(`/notifications/${nid}/read`, { method: 'PATCH', token: T.alice })).status === 200);
ok("cannot mark someone else's notification", (await api(`/notifications/${nid}/read`, { method: 'PATCH', token: T.ben })).status === 404);
const myGroups = await api('/groups/mine', { token: T.alice });
const gid = (myGroups.data.groups ?? myGroups.data)[0]?.groupId;
const gl = await api(`/groups/${gid}/leaderboard`, { token: T.alice });
ok('group leaderboard loads', gl.status === 200, `group ${gid} -> ${gl.status} ${JSON.stringify(gl.data).slice(0,120)}`);
const rows = gl.data.leaderboard ?? gl.data;
ok('its distances are numbers, not strings', rows.length === 0 || typeof rows[0].total_distance_km === 'number', typeof rows?.[0]?.total_distance_km);
const ins = await api('/runs/insights', { token: T.alice });
ok('run insights load', ins.status === 200, JSON.stringify(ins.data).slice(0, 140));

console.log('\n' + '─'.repeat(66));
console.log(`  ${pass} passed, ${fail} failed`);
if (issues.length) { console.log('\nISSUES:'); issues.forEach((i) => console.log('  • ' + i)); }
console.log('─'.repeat(66));
process.exit(fail ? 1 : 0);
