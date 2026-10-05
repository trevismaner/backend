/**
 * Verifies every user story in the spec against the running backend + real PostgreSQL.
 *
 * Each story gets a concrete exercise and one of:
 *   PASS         the behaviour the story describes actually works
 *   FAIL         the endpoint exists but does not do what the story says
 *   MISSING      nothing implements it
 *   OUT OF APP   the story is about the website/APK, not this application
 */
import { execSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const BASE = process.env.TEST_URL || 'http://localhost:3000/api';
const DB = process.env.TEST_DB || 'run_league_verify';
// Repo root, derived from this file — never a hard-coded machine path.
// The run-league directory (parent of backend), from this file's own location.
// fileURLToPath (not .pathname) so Windows gets C:\... rather than /C:/...
const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const mobileFile = (...parts) => join(ROOT, 'mobile', 'src', ...parts);
const results = [];
const stamp = Date.now();
const mk = (p) => `${p}.v${stamp}@example.com`;
const ago = (d) => new Date(Date.now() - d * 86400000).toISOString();
const ahead = (d) => new Date(Date.now() + d * 86400000).toISOString();

async function api(path, { method = 'GET', token, body } = {}) {
  const h = { 'Content-Type': 'application/json' };
  if (token) h.Authorization = `Bearer ${token}`;
  const r = await fetch(`${BASE}${path}`, { method, headers: h, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, data: await r.json().catch(() => null) };
}
/**
 * Runs a query against the test database with the plain `psql` on PATH, so this works the
 * same on macOS and Linux. Set PGUSER / PGPASSWORD / PGHOST in the environment if your
 * PostgreSQL needs them (matching the DB_* values in .env).
 */
const sql = (q) =>
  execSync(`psql -t -A -d ${DB} -f -`, {
    input: q,
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
  }).trim();

function record(id, title, status, evidence) {
  results.push({ id, title, status, evidence });
  const mark = { PASS: ' ok  ', FAIL: 'FAIL ', MISSING: 'MISS ', 'OUT OF APP': ' n/a ' }[status];
  console.log(`  ${mark} ${id}  ${title}${status === 'PASS' ? '' : `\n         ${evidence}`}`);
}

// Runs an assertion and records it. `probe` returns true/false, or throws.
async function story(id, title, probe) {
  try {
    const outcome = await probe();
    if (outcome === true) record(id, title, 'PASS', '');
    else if (outcome === 'MISSING') record(id, title, 'MISSING', 'no endpoint implements this');
    else record(id, title, 'FAIL', typeof outcome === 'string' ? outcome : 'assertion returned false');
  } catch (err) {
    record(id, title, 'FAIL', err.message);
  }
}

// ───────────────────────── setup ─────────────────────────
console.log('\n━━━ UNREGISTERED USER ━━━');

let aliceTok, bobTok, carolTok, instructorTok, adminTok;
let aliceId, bobId, carolId, instructorId;

await story('UU-01', 'Create a new account', async () => {
  const r = await api('/auth/register', { method: 'POST', body: { email: mk('alice'), password: 'Password123', name: `Alice ${stamp}` } });
  aliceTok = r.data?.token; aliceId = r.data?.user?.userId;
  return r.status === 201 && !!aliceTok && r.data.user.role === 'registered_user';
});

await story('UU-02', 'Create a new instructor account', async () => {
  const r = await api('/auth/register', { method: 'POST', body: { email: mk('coach'), password: 'Password123', name: `Coach ${stamp}`, accountType: 'instructor' } });
  instructorTok = r.data?.token; instructorId = r.data?.user?.userId;
  return r.status === 201 && r.data.user.role === 'instructor';
});

// supporting accounts
const bob = await api('/auth/register', { method: 'POST', body: { email: mk('bob'), password: 'Password123', name: `Bob ${stamp}` } });
bobTok = bob.data.token; bobId = bob.data.user.userId;
const carol = await api('/auth/register', { method: 'POST', body: { email: mk('carol'), password: 'Password123', name: `Carol ${stamp}` } });
carolTok = carol.data.token; carolId = carol.data.user.userId;
await api('/auth/register', { method: 'POST', body: { email: mk('admin'), password: 'Password123', name: `Admin ${stamp}` } });
sql(`UPDATE users SET role='system_admin' WHERE email='${mk('admin')}'`);
adminTok = (await api('/auth/login', { method: 'POST', body: { email: mk('admin'), password: 'Password123' } })).data.token;

// ───────────────────────── registered user ─────────────────────────
console.log('\n━━━ REGISTERED USER — account & profile ━━━');

await story('RU-01', 'Log in', async () => {
  const r = await api('/auth/login', { method: 'POST', body: { email: mk('alice'), password: 'Password123' } });
  const wrong = await api('/auth/login', { method: 'POST', body: { email: mk('alice'), password: 'nope' } });
  aliceTok = r.data.token;
  return r.status === 200 && !!r.data.token && wrong.status === 401;
});

await story('RU-02', 'Log out', async () => {
  const r = await api('/auth/logout', { method: 'POST', token: aliceTok });
  return r.status === 200;
});

await story('RU-03', 'View profile details', async () => {
  const r = await api('/profile', { token: aliceTok });
  return r.status === 200 && r.data.user.name === `Alice ${stamp}`;
});

await story('RU-04', 'Update profile details', async () => {
  await api('/profile', { method: 'PUT', token: aliceTok, body: { name: `Alice R ${stamp}`, bio: 'Runner' } });
  const after = await api('/profile', { token: aliceTok });
  return after.data.user.name === `Alice R ${stamp}` && after.data.user.bio === 'Runner';
});

console.log('\n━━━ REGISTERED USER — runs ━━━');

let runId;
await story('RU-05', 'Create a new run', async () => {
  const r = await api('/runs', { method: 'POST', token: aliceTok, body: {
    name: 'Morning loop', distanceKm: 5.2, durationSeconds: 1800, startedAt: ago(1),
    caloriesBurned: 340, avgHeartRate: 150, maxHeartRate: 172,
  } });
  runId = r.data?.run?.runId;
  return r.status === 201 && !!runId;
});

await story('RU-06', 'View run history', async () => {
  await api('/runs', { method: 'POST', token: aliceTok, body: { name: 'Evening jog', distanceKm: 3.1, durationSeconds: 1100, startedAt: ago(3) } });
  const r = await api('/runs', { token: aliceTok });
  return r.status === 200 && r.data.runs.length === 2;
});

await story('RU-07', 'Search runs in history', async () => {
  const r = await api('/runs/search?q=Morning', { token: aliceTok });
  const none = await api('/runs/search?q=zzzz', { token: aliceTok });
  return r.status === 200 && r.data.runs.length === 1 && none.data.runs.length === 0;
});

await story('RU-08', 'Update the name of a run', async () => {
  const r = await api(`/runs/${runId}/name`, { method: 'PATCH', token: aliceTok, body: { name: 'Renamed run' } });
  const after = await api(`/runs/${runId}`, { token: aliceTok });
  return r.status === 200 && after.data.run.name === 'Renamed run';
});

await story('RU-09', 'Update the description of a run', async () => {
  const r = await api(`/runs/${runId}/description`, { method: 'PATCH', token: aliceTok, body: { description: 'Felt easy' } });
  const after = await api(`/runs/${runId}`, { token: aliceTok });
  return r.status === 200 && after.data.run.description === 'Felt easy'
    && Number(after.data.run.distanceKm) === 5.2; // activity data untouched
});

console.log('\n━━━ REGISTERED USER — health & planning ━━━');

await story('RU-10', 'View risk assessment score', async () => {
  await api('/risk-assessment/form', { method: 'PUT', token: aliceTok, body: { isCurrentlySick: false, chronicConditions: [], pastInjuries: [], selfRatedSoreness: 4 } });
  const r = await api('/risk-assessment', { token: aliceTok });
  return r.status === 200 && ['low', 'moderate', 'high'].includes(r.data.score.riskLevel)
    && r.data.score.finalScore >= 0 && r.data.score.finalScore <= 100;
});

await story('RU-11', 'Update the risk assessment form', async () => {
  const before = (await api('/risk-assessment', { token: aliceTok })).data.score.finalScore;
  const r = await api('/risk-assessment/form', { method: 'PUT', token: aliceTok, body: {
    isCurrentlySick: true, chronicConditions: ['asthma'], pastInjuries: [{ type: 'shin splints', resolved: false }], selfRatedSoreness: 9,
  } });
  return r.status === 201 && r.data.score.finalScore > before; // the form actually moved the score
});

let planId;
await story('RU-12', 'Create a fitness plan', async () => {
  const r = await api('/fitness-plans', { method: 'POST', token: aliceTok, body: { goalType: 'race_prep', targetDistanceKm: 21.1, weeklyFrequency: 4, durationWeeks: 12 } });
  planId = r.data?.plan?.planId;
  return r.status === 201 && r.data.plan.isActive === true;
});

await story('RU-13', 'View fitness plan', async () => {
  const r = await api('/fitness-plans', { token: aliceTok });
  return r.status === 200 && r.data.plan.planId === planId && r.data.progress !== null;
});

await story('RU-14', 'Update fitness plan', async () => {
  const r = await api(`/fitness-plans/${planId}`, { method: 'PUT', token: aliceTok, body: { weeklyFrequency: 5 } });
  return r.status === 200 && r.data.plan.weeklyFrequency === 5 && Number(r.data.plan.targetDistanceKm) === 21.1;
});

await story('RU-15', 'Delete fitness plan', async () => {
  const r = await api(`/fitness-plans/${planId}`, { method: 'DELETE', token: aliceTok });
  const after = await api('/fitness-plans', { token: aliceTok });
  return r.status === 200 && after.data.plan === null;
});

console.log('\n━━━ REGISTERED USER — wearables & analytics ━━━');

await story('RU-16', 'Connect a wearable device', async () => {
  // Implemented at /connections. The full OAuth handshake, token refresh, activity import
  // and dedup are covered against a stub provider in tests/connections.test.mjs.
  const list = await api('/connections', { token: aliceTok });
  if (list.status !== 200 || !Array.isArray(list.data?.wearables)) return 'GET /connections did not list wearables';

  const names = list.data.wearables.map((w) => w.provider);
  if (!['fitbit', 'garmin', 'samsung_health', 'apple_health'].every((p) => names.includes(p))) {
    return `wearable providers missing: ${names.join(', ')}`;
  }
  // Without credentials configured a connect attempt must refuse cleanly, not pretend.
  const start = await api('/connections/fitbit/connect', { method: 'POST', token: aliceTok });
  if (![200, 503].includes(start.status)) return `connect returned ${start.status}`;
  return true;
});

await story('RU-17', 'See estimated calories burned for each run', async () => {
  const detail = await api(`/runs/${runId}`, { token: aliceTok });
  const insights = await api('/runs/insights', { token: aliceTok });
  return detail.data.run.caloriesBurned === 340 && insights.data.calories.totalCalories === 340;
});

await story('RU-18', 'See average and maximum heart rate for a run', async () => {
  const detail = await api(`/runs/${runId}`, { token: aliceTok });
  const insights = await api('/runs/insights', { token: aliceTok });
  return detail.data.run.avgHeartRate === 150 && detail.data.run.maxHeartRate === 172
    && insights.data.heartRate.maxHeartRate === 172;
});

await story('RU-19', 'View short- and long-term trends', async () => {
  const r = await api('/runs/insights', { token: aliceTok });
  const t = r.data.trends;
  return r.status === 200 && t.shortTerm?.current !== undefined && t.longTerm?.current !== undefined
    && 'distancePercent' in t.shortTerm.change;
});

console.log('\n━━━ REGISTERED USER — notifications ━━━');

await story('RU-20', 'Customise notification preferences', async () => {
  const r = await api('/notifications/preferences', { method: 'PUT', token: aliceTok, body: { exerciseReminders: false, overtrainingAlerts: true } });
  const after = await api('/notifications/preferences', { token: aliceTok });
  const p = after.data.preferences;
  // NOTE: this endpoint returns snake_case while the rest of the API is camelCase
  const value = p.exerciseReminders ?? p.exercise_reminders;
  return r.status === 200 && value === false;
});

console.log('\n━━━ REGISTERED USER — groups ━━━');

let groupId, privateGroupId;
await story('RU-21', 'Create a group, public or private', async () => {
  const pub = await api('/groups', { method: 'POST', token: aliceTok, body: { name: `Public Club ${stamp}`, description: 'open', isPrivate: false, maxMembers: 50 } });
  const priv = await api('/groups', { method: 'POST', token: aliceTok, body: { name: `Private Club ${stamp}`, description: 'invite only', isPrivate: true, maxMembers: 10 } });
  groupId = pub.data?.group?.groupId; privateGroupId = priv.data?.group?.groupId;
  return pub.status === 201 && priv.status === 201 && priv.data.group.isPrivate === true;
});

await story('RU-22', "Update my group's details", async () => {
  const r = await api(`/groups/${groupId}`, { method: 'PUT', token: aliceTok, body: { description: 'updated description' } });
  const after = await api(`/groups/${groupId}`, { token: aliceTok });
  return r.status === 200 && after.data.group.description === 'updated description';
});

await story('RU-23', "View my group's details", async () => {
  const r = await api(`/groups/${groupId}`, { token: aliceTok });
  return r.status === 200 && Array.isArray(r.data.members) && r.data.members.length >= 1;
});

await story('RU-24', 'Invite users to my group', async () => {
  const r = await api(`/groups/${groupId}/invite`, { method: 'POST', token: aliceTok, body: { userId: carolId } });
  const status = sql(`SELECT status FROM group_members WHERE group_id=${groupId} AND user_id=${carolId}`);
  return r.status === 200 && status === 'invited';
});

await story('RU-29', 'Join a group', async () => {
  const r = await api(`/groups/${groupId}/join`, { method: 'POST', token: bobTok });
  const status = sql(`SELECT status FROM group_members WHERE group_id=${groupId} AND user_id=${bobId}`);
  return r.status === 200 && status === 'active';
});

await story('RU-25', 'Approve or reject pending join requests', async () => {
  await api(`/groups/${privateGroupId}/join`, { method: 'POST', token: bobTok });
  const pending = sql(`SELECT status FROM group_members WHERE group_id=${privateGroupId} AND user_id=${bobId}`);
  const r = await api(`/groups/${privateGroupId}/requests/respond`, { method: 'POST', token: aliceTok, body: { userId: bobId, decision: 'accept' } });
  const after = sql(`SELECT status FROM group_members WHERE group_id=${privateGroupId} AND user_id=${bobId}`);
  return pending === 'pending' && r.status === 200 && after === 'active';
});

await story('RU-27', 'Promote a member', async () => {
  const r = await api(`/groups/${groupId}/members/${bobId}/promote`, { method: 'POST', token: aliceTok });
  const isAdmin = sql(`SELECT is_admin FROM group_members WHERE group_id=${groupId} AND user_id=${bobId}`);
  return r.status === 200 && isAdmin === 't';
});

await story('RU-26', 'Remove a member from my group', async () => {
  const r = await api(`/groups/${groupId}/members/${carolId}`, { method: 'DELETE', token: aliceTok });
  const rows = sql(`SELECT COUNT(*) FROM group_members WHERE group_id=${groupId} AND user_id=${carolId}`);
  return r.status === 200 && rows === '0';
});

await story('RU-28', 'View group details before joining', async () => {
  const r = await api(`/groups/${groupId}`, { token: carolTok }); // carol is not a member
  return r.status === 200 && r.data.group.name.includes('Public Club');
});

await story('RU-30', 'Search for groups', async () => {
  const r = await api(`/groups/search?q=Public Club ${stamp}`, { token: carolTok });
  return r.status === 200 && r.data.groups.some((g) => g.groupId === groupId);
});

await story('RU-31', 'Leave a group', async () => {
  await api(`/groups/${groupId}/join`, { method: 'POST', token: carolTok });
  const r = await api(`/groups/${groupId}/leave`, { method: 'POST', token: carolTok });
  const rows = sql(`SELECT COUNT(*) FROM group_members WHERE group_id=${groupId} AND user_id=${carolId} AND status='active'`);
  return r.status === 200 && rows === '0';
});

console.log('\n━━━ REGISTERED USER — tournaments ━━━');

let tournamentId;
await story('RU-32', 'Create a tournament in my group', async () => {
  const r = await api(`/groups/${groupId}/tournaments`, { method: 'POST', token: aliceTok, body: {
    name: `Club 10K ${stamp}`, description: 'first one', distanceType: '10K', startDate: ahead(7), endDate: ahead(8),
  } });
  tournamentId = r.data?.tournament?.tournamentId;
  return r.status === 201 && !!tournamentId;
});

await story('RU-33', 'View tournament details', async () => {
  const r = await api(`/tournaments/${tournamentId}`, { token: aliceTok });
  return r.status === 200 && r.data.tournament.name.includes('Club 10K');
});

await story('RU-34', 'Update tournament details', async () => {
  const r = await api(`/tournaments/${tournamentId}`, { method: 'PUT', token: aliceTok, body: { description: 'rescheduled' } });
  const after = await api(`/tournaments/${tournamentId}`, { token: aliceTok });
  return r.status === 200 && after.data.tournament.description === 'rescheduled';
});

await story('RU-36', 'Set participant limit and registration deadline', async () => {
  const r = await api(`/tournaments/${tournamentId}/limits`, { method: 'PATCH', token: aliceTok, body: { maxParticipants: 20, registrationDeadline: ahead(5) } });
  const after = await api(`/tournaments/${tournamentId}`, { token: aliceTok });
  return r.status === 200 && after.data.tournament.maxParticipants === 20;
});

await story('RU-38', 'Join a tournament', async () => {
  const r = await api(`/tournaments/${tournamentId}/join`, { method: 'POST', token: bobTok });
  const rows = sql(`SELECT COUNT(*) FROM tournament_participants WHERE tournament_id=${tournamentId} AND user_id=${bobId} AND withdrawn=false`);
  return r.status === 200 && rows === '1';
});

await story('RU-41', 'View tournament standings', async () => {
  const r = await api(`/tournaments/${tournamentId}/standings`, { token: bobTok });
  return r.status === 200 && Array.isArray(r.data.standings);
});

await story('RU-37', 'Update tournament status', async () => {
  const r = await api(`/tournaments/${tournamentId}/status`, { method: 'PATCH', token: aliceTok, body: { status: 'in_progress' } });
  const after = await api(`/tournaments/${tournamentId}`, { token: aliceTok });
  return r.status === 200 && after.data.tournament.status === 'in_progress';
});

await story('RU-42', 'Withdraw from a tournament before it starts', async () => {
  // a fresh open tournament, since the one above is already in progress
  const t = await api(`/groups/${groupId}/tournaments`, { method: 'POST', token: aliceTok, body: { name: `Withdrawable ${stamp}`, distanceType: '5K', startDate: ahead(9), endDate: ahead(9) } });
  const tid = t.data.tournament.tournamentId;
  await api(`/tournaments/${tid}/join`, { method: 'POST', token: bobTok });
  const r = await api(`/tournaments/${tid}/withdraw`, { method: 'POST', token: bobTok });
  const withdrawn = sql(`SELECT withdrawn FROM tournament_participants WHERE tournament_id=${tid} AND user_id=${bobId}`);
  return r.status === 200 && withdrawn === 't';
});

await story('RU-35', 'Delete a tournament', async () => {
  const t = await api(`/groups/${groupId}/tournaments`, { method: 'POST', token: aliceTok, body: { name: `Doomed ${stamp}`, distanceType: '5K', startDate: ahead(9), endDate: ahead(9) } });
  const tid = t.data.tournament.tournamentId;
  const r = await api(`/tournaments/${tid}`, { method: 'DELETE', token: aliceTok });
  const rows = sql(`SELECT COUNT(*) FROM tournaments WHERE tournament_id=${tid}`);
  return r.status === 200 && rows === '0';
});

console.log('\n━━━ REGISTERED USER — public events ━━━');

let eventId;
await story('RU-39', 'Read public event details', async () => {
  const made = await api('/admin/public-events', { method: 'POST', token: adminTok, body: {
    name: `Verify Event ${stamp}`, description: 'platform wide', maxParticipants: 10,
    registrationDeadline: ahead(5), startDate: ahead(7), endDate: ahead(7),
  } });
  eventId = made.data.event.eventId;
  const r = await api(`/public-events/${eventId}`, { token: aliceTok });
  return r.status === 200 && r.data.event.name.includes('Verify Event') && r.data.event.status === 'upcoming';
});

await story('RU-40', 'Join a public event', async () => {
  const r = await api(`/public-events/${eventId}/join`, { method: 'POST', token: aliceTok });
  return r.status === 200 && r.data.event.isRegistered === true;
});

await story('RU-43', 'Withdraw from a public event before it starts', async () => {
  const r = await api(`/public-events/${eventId}/withdraw`, { method: 'POST', token: aliceTok });
  const started = await api(`/public-events/${eventId}`, { token: aliceTok });
  return r.status === 200 && started.data.event.isRegistered === false;
});

console.log('\n━━━ REGISTERED USER — board, leaderboards, rewards ━━━');

await story('RU-44', 'Read posts on the Instructor Board', async () => {
  sql(`UPDATE users SET credentials_verified=true WHERE user_id=${instructorId}`);
  await api('/instructor-posts', { method: 'POST', token: instructorTok, body: { title: `Verify post ${stamp}`, content: 'Advice from a verified coach.', category: 'training' } });
  const r = await api('/instructor-posts', { token: aliceTok });
  return r.status === 200 && r.data.posts.some((p) => p.title.includes('Verify post'));
});

await story('RU-45', 'View leaderboards', async () => {
  const global = await api('/leaderboard', { token: aliceTok });
  const group = await api(`/groups/${groupId}/leaderboard`, { token: aliceTok });
  return global.status === 200 && Array.isArray(global.data.leaderboard)
    && group.status === 200 && Array.isArray(group.data.leaderboard);
});

await story('RU-46', 'View available rewards', async () => {
  const r = await api('/rewards', { token: aliceTok });
  return r.status === 200 && r.data.rewards.length > 0 && r.data.rewards[0].pointsRequired !== undefined;
});

await story('RU-47', "Claim a reward I've earned", async () => {
  const reward = (await api('/rewards', { token: aliceTok })).data.rewards.sort((a, b) => a.pointsRequired - b.pointsRequired)[0];
  sql(`INSERT INTO user_points (user_id, total_points) VALUES (${aliceId}, 99999) ON CONFLICT (user_id) DO UPDATE SET total_points=99999`);
  const r = await api(`/rewards/${reward.rewardId}/claim`, { method: 'POST', token: aliceTok });
  const claimed = await api('/rewards/claimed', { token: aliceTok });
  const list = claimed.data.claims ?? claimed.data.rewards ?? [];
  return r.status === 200 && list.length >= 1;
});

await story('RU-48', 'Display earned badges on my profile', async () => {
  const badges = await api('/rewards/badges', { token: aliceTok });
  if (badges.status !== 200) return `badges endpoint returned ${badges.status}`;
  const earned = badges.data.badges.find((b) => b.earned_at ?? b.earnedAt);
  if (!earned) return 'no badge auto-awarded despite logged runs';
  const id = earned.badge_id ?? earned.badgeId;
  const r = await api(`/rewards/badges/${id}/display`, { method: 'PATCH', token: aliceTok, body: { isDisplayed: false } });
  const after = await api('/rewards/badges', { token: aliceTok });
  const updated = after.data.badges.find((b) => (b.badge_id ?? b.badgeId) === id);
  const apiWorks = r.status === 200 && (updated.is_displayed ?? updated.isDisplayed) === false;
  if (!apiWorks) return 'the display toggle endpoint did not persist';
  // the story is about the PROFILE showing them, so check the screen actually renders badges
  const screenPath = mobileFile('boundary', 'ProfileScreen.js');
  if (!existsSync(screenPath)) return `ProfileScreen.js not found at ${screenPath}`;
  const screen = readFileSync(screenPath, 'utf8');
  const rendersBadges = /\.map\(\s*\(?\s*badge/.test(screen) && /setBadgeDisplayController|toggleDisplay/.test(screen);
  if (!rendersBadges) {
    return 'ProfileScreen does not render individual badges with a display toggle';
  }
  return true;
});

console.log('\n━━━ REGISTERED USER — social sharing ━━━');

await story('RU-49', 'Connect social media accounts', async () => {
  // Same /connections flow as RU-16, with kind 'social'.
  const list = await api('/connections', { token: aliceTok });
  if (list.status !== 200 || !Array.isArray(list.data?.social)) return 'GET /connections did not list social accounts';

  const names = list.data.social.map((p) => p.provider);
  if (!['strava', 'facebook', 'instagram', 'x', 'tiktok'].every((p) => names.includes(p))) {
    return `social providers missing: ${names.join(', ')}`;
  }
  const start = await api('/connections/strava/connect', { method: 'POST', token: aliceTok });
  if (![200, 503].includes(start.status)) return `connect returned ${start.status}`;
  return true;
});

await story('RU-50', 'Share tournament results on social media', async () => {
  // client-side only by design: the native share sheet needs no endpoint
  const f = mobileFile('control', 'ShareTournamentResultController.js');
  return existsSync(f) ? true : `not found: ${f}`;
});

await story('RU-51', 'Share an earned badge', async () => {
  const f = mobileFile('control', 'ShareBadgeController.js');
  return existsSync(f) ? true : `not found: ${f}`;
});

// ───────────────────────── instructor ─────────────────────────
console.log('\n━━━ FITNESS INSTRUCTOR ━━━');

let postId;
await story('IU-01', 'Log in as instructor', async () => {
  const r = await api('/auth/login', { method: 'POST', body: { email: mk('coach'), password: 'Password123' } });
  instructorTok = r.data.token;
  return r.status === 200 && r.data.user.role === 'instructor';
});

await story('IU-02', 'Log out', async () => (await api('/auth/logout', { method: 'POST', token: instructorTok })).status === 200);

await story('IU-03', 'View instructor profile', async () => {
  const r = await api('/profile', { token: instructorTok });
  return r.status === 200 && r.data.user.role === 'instructor';
});

await story('IU-04', 'Update instructor profile', async () => {
  await api('/profile', { method: 'PUT', token: instructorTok, body: { bio: 'Accredited coach, 12 years' } });
  const after = await api('/profile', { token: instructorTok });
  return after.data.user.bio === 'Accredited coach, 12 years';
});

await story('IU-05', 'Create a new post', async () => {
  const r = await api('/instructor-posts', { method: 'POST', token: instructorTok, body: { title: `Easy runs ${stamp}`, content: 'Keep easy runs easy.', category: 'training' } });
  postId = r.data?.post?.postId;
  return r.status === 201 && !!postId;
});

await story('IU-06', 'Update my post', async () => {
  const r = await api(`/instructor-posts/${postId}`, { method: 'PUT', token: instructorTok, body: { title: `Easy runs, revised ${stamp}` } });
  return r.status === 200 && r.data.post.title.includes('revised') && r.data.post.content === 'Keep easy runs easy.';
});

await story('IU-07', 'Read posts on the Instructor Board', async () => {
  const board = await api('/instructor-posts', { token: instructorTok });
  const mine = await api('/instructor-posts/mine', { token: instructorTok });
  return board.status === 200 && board.data.posts.length >= 1
    && mine.status === 200 && mine.data.posts.every((p) => p.authorId === instructorId);
});

await story('IU-08', 'Delete my post', async () => {
  const r = await api(`/instructor-posts/${postId}`, { method: 'DELETE', token: instructorTok });
  const after = await api(`/instructor-posts/${postId}`, { token: instructorTok });
  return r.status === 200 && after.status === 404;
});

// ───────────────────────── system admin ─────────────────────────
console.log('\n━━━ SYSTEM ADMIN ━━━');

await story('SA-01', 'Log in', async () => {
  const r = await api('/auth/login', { method: 'POST', body: { email: mk('admin'), password: 'Password123' } });
  adminTok = r.data.token;
  return r.status === 200 && r.data.user.role === 'system_admin'
    && (await api('/admin/stats', { token: adminTok })).status === 200;
});

await story('SA-02', 'Log out', async () => (await api('/auth/logout', { method: 'POST', token: adminTok })).status === 200);

let victimId;
await story('SA-03', 'Create a user account', async () => {
  const r = await api('/admin/users', { method: 'POST', token: adminTok, body: { email: mk('victim'), password: 'Password123', name: `Victim ${stamp}`, role: 'registered_user' } });
  victimId = r.data?.user?.userId;
  return r.status === 201 && !!victimId;
});

await story('SA-04', 'View a user account', async () => {
  const r = await api(`/admin/users/${victimId}`, { token: adminTok });
  return r.status === 200 && r.data.user.email === mk('victim') && r.data.user.isSuspended === false;
});

await story('SA-05', 'Suspend a user account', async () => {
  const r = await api(`/admin/users/${victimId}/suspension`, { method: 'PATCH', token: adminTok, body: { isSuspended: true } });
  const login = await api('/auth/login', { method: 'POST', body: { email: mk('victim'), password: 'Password123' } });
  return r.status === 200 && login.status === 403;
});

await story('SA-06', 'Update a user account', async () => {
  // its own account: SA-05 left `victim` suspended, and SA-07/SA-08 still need it intact
  const made = await api('/admin/users', { method: 'POST', token: adminTok, body: {
    email: mk('lockedout'), password: 'Password123', name: `Locked Out ${stamp}`, role: 'registered_user',
  } });
  const lockedId = made.data.user.userId;
  const renamed = await api(`/admin/users/${lockedId}`, { method: 'PUT', token: adminTok, body: { name: 'Fixed Name' } });
  if (renamed.status === 404 || renamed.status === 405) return 'no general update endpoint';
  if (renamed.data.user.name !== 'Fixed Name') return 'name did not persist';

  // the point of the story: rescuing a locked-out user
  const newEmail = mk('lockedout-fixed');
  const fixedEmail = await api(`/admin/users/${lockedId}`, { method: 'PUT', token: adminTok, body: { email: newEmail, password: 'BrandNewPass123' } });
  if (fixedEmail.status !== 200) return `email/password reset failed: ${fixedEmail.data?.error}`;
  const login = await api('/auth/login', { method: 'POST', body: { email: newEmail, password: 'BrandNewPass123' } });
  if (login.status !== 200) return 'user cannot log in with the reset credentials';

  const noop = await api(`/admin/users/${lockedId}`, { method: 'PUT', token: adminTok, body: {} });
  const shortPw = await api(`/admin/users/${lockedId}`, { method: 'PUT', token: adminTok, body: { password: 'short' } });
  const dupe = await api(`/admin/users/${lockedId}`, { method: 'PUT', token: adminTok, body: { email: mk('alice') } });
  const notAdmin = await api(`/admin/users/${lockedId}`, { method: 'PUT', token: aliceTok, body: { name: 'x' } });
  return noop.status === 400 && shortPw.status === 400 && dupe.status === 409 && notAdmin.status === 403;
});

await story('SA-07', 'Unsuspend a user account', async () => {
  const r = await api(`/admin/users/${victimId}/suspension`, { method: 'PATCH', token: adminTok, body: { isSuspended: false } });
  const login = await api('/auth/login', { method: 'POST', body: { email: mk('victim'), password: 'Password123' } });
  return r.status === 200 && login.status === 200;
});

await story('SA-08', 'Delete a user account', async () => {
  const r = await api(`/admin/users/${victimId}`, { method: 'DELETE', token: adminTok });
  const rows = sql(`SELECT COUNT(*) FROM users WHERE user_id=${victimId}`);
  return r.status === 200 && rows === '0';
});

record('SA-09', 'Edit reviews on the app website', 'OUT OF APP',
  'concerns the marketing website, not this application');
record('SA-10', 'Update the APK on the website', 'OUT OF APP',
  'release/hosting task, not an application feature');

await story('SA-11', "Receive and verify an instructor's credentials", async () => {
  sql(`UPDATE users SET credentials_verified=false WHERE user_id=${instructorId}`);
  const blocked = await api('/instructor-posts', { method: 'POST', token: instructorTok, body: { title: 'x', content: 'y' } });
  const verify = await api(`/admin/users/${instructorId}/instructor-verification`, { method: 'PATCH', token: adminTok, body: { verified: true } });
  const allowed = await api('/instructor-posts', { method: 'POST', token: instructorTok, body: { title: `After verify ${stamp}`, content: 'now allowed' } });
  return blocked.status === 403 && verify.status === 200 && allowed.status === 201;
});

let saEventId;
await story('SA-12', 'Create a platform-wide tournament', async () => {
  const r = await api('/admin/public-events', { method: 'POST', token: adminTok, body: {
    name: `Admin Event ${stamp}`, maxParticipants: 100, registrationDeadline: ahead(3), startDate: ahead(5), endDate: ahead(5),
  } });
  saEventId = r.data?.event?.eventId;
  return r.status === 201 && !!saEventId;
});

await story('SA-13', 'Read tournaments I manage', async () => {
  const list = await api('/admin/public-events', { token: adminTok });
  const one = await api(`/admin/public-events/${saEventId}`, { token: adminTok });
  return list.status === 200 && list.data.events.some((e) => e.eventId === saEventId) && one.status === 200;
});

await story('SA-14', 'Update a tournament', async () => {
  const r = await api(`/admin/public-events/${saEventId}`, { method: 'PUT', token: adminTok, body: { maxParticipants: 250 } });
  return r.status === 200 && r.data.event.maxParticipants === 250;
});

await story('SA-15', 'Delete a tournament', async () => {
  const r = await api(`/admin/public-events/${saEventId}`, { method: 'DELETE', token: adminTok });
  const rows = sql(`SELECT COUNT(*) FROM public_events WHERE event_id=${saEventId}`);
  return r.status === 200 && rows === '0';
});

let adminPostId;
await story('SA-16', 'Create a post on the Instructor Board', async () => {
  const r = await api('/instructor-posts', { method: 'POST', token: adminTok, body: { title: `Admin notice ${stamp}`, content: 'Platform-level guidance.', category: 'training' } });
  adminPostId = r.data?.post?.postId;
  return r.status === 201 && !!adminPostId;
});

await story('SA-17', 'Update any post', async () => {
  const theirs = await api('/instructor-posts', { method: 'POST', token: instructorTok, body: { title: `Coach post ${stamp}`, content: 'original' } });
  const r = await api(`/instructor-posts/${theirs.data.post.postId}`, { method: 'PUT', token: adminTok, body: { title: 'Moderated by admin' } });
  return r.status === 200 && r.data.post.title === 'Moderated by admin';
});

await story('SA-18', 'Delete any post', async () => {
  const theirs = await api('/instructor-posts', { method: 'POST', token: instructorTok, body: { title: `Doomed post ${stamp}`, content: 'x' } });
  const r = await api(`/instructor-posts/${theirs.data.post.postId}`, { method: 'DELETE', token: adminTok });
  return r.status === 200;
});

await story('SA-19', 'Read posts', async () => {
  const r = await api('/instructor-posts', { token: adminTok });
  return r.status === 200 && r.data.posts.length >= 1;
});

let modGroupId;
await story('SA-23', 'View a group and its members', async () => {
  const g = await api('/groups', { method: 'POST', token: bobTok, body: { name: `Moderated Group ${stamp}`, isPrivate: false, maxMembers: 20 } });
  modGroupId = g.data.group.groupId;
  const r = await api('/admin/groups', { token: adminTok });
  const listed = r.data.groups.find((x) => x.groupId === modGroupId);
  return r.status === 200 && !!listed && listed.memberCount >= 1 && !!listed.creatorName;
});

await story('SA-21', 'Update group details', async () => {
  const r = await api(`/admin/groups/${modGroupId}`, { method: 'PUT', token: adminTok, body: { name: `Renamed by admin ${stamp}`, description: 'moderated' } });
  if (r.status === 404 || r.status === 405) return 'no admin group-update endpoint';
  if (r.data.group.name !== `Renamed by admin ${stamp}`) return 'rename did not persist';

  const noop = await api(`/admin/groups/${modGroupId}`, { method: 'PUT', token: adminTok, body: {} });
  const clash = await api(`/admin/groups/${modGroupId}`, { method: 'PUT', token: adminTok, body: { name: `Public Club ${stamp}` } });
  const tooSmall = await api(`/admin/groups/${modGroupId}`, { method: 'PUT', token: adminTok, body: { maxMembers: 0 } });
  const notAdmin = await api(`/admin/groups/${modGroupId}`, { method: 'PUT', token: aliceTok, body: { name: 'x' } });
  return noop.status === 400 && clash.status === 409 && tooSmall.status === 400 && notAdmin.status === 403;
});

await story('SA-22', 'Suspend a group', async () => {
  const r = await api(`/admin/groups/${modGroupId}/suspension`, { method: 'PATCH', token: adminTok, body: { isSuspended: true } });
  const suspended = sql(`SELECT is_suspended FROM groups WHERE group_id=${modGroupId}`);
  return r.status === 200 && suspended === 't';
});

await story('SA-20', 'Delete a group', async () => {
  const r = await api(`/admin/groups/${modGroupId}`, { method: 'DELETE', token: adminTok });
  const rows = sql(`SELECT COUNT(*) FROM groups WHERE group_id=${modGroupId}`);
  return r.status === 200 && rows === '0';
});

// ───────────────────────── summary ─────────────────────────
const by = (s) => results.filter((r) => r.status === s);
console.log('\n' + '─'.repeat(68));
console.log(`  PASS ${by('PASS').length}   FAIL ${by('FAIL').length}   MISSING ${by('MISSING').length}   OUT OF APP ${by('OUT OF APP').length}   (${results.length} stories)`);
console.log('─'.repeat(68));

for (const label of ['FAIL', 'MISSING', 'OUT OF APP']) {
  const rows = by(label);
  if (!rows.length) continue;
  console.log(`\n${label}:`);
  for (const r of rows) console.log(`  ${r.id}  ${r.title}\n        ${r.evidence}`);
}

import { writeFileSync } from 'node:fs';
writeFileSync(fileURLToPath(new URL('./verify_results.json', import.meta.url)), JSON.stringify(results, null, 2));
console.log('\nresults written to tests/verify_results.json');
