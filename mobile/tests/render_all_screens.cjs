/**
 * Mounts every Run League screen with react-test-renderer, against the live backend.
 *
 * The point is to find crashes the static checks cannot see: bad hooks, reading a field
 * off undefined, a broken renderItem. Only react-native and the native modules are mocked —
 * the screens, controllers and entities are the real files.
 */
const path = require('path');
const Module = require('module');
const React = require('react');

const MOBILE = path.resolve(__dirname, '..');   // this file lives in mobile/tests/
const HARNESS = __dirname;
const DB = process.env.TEST_DB || 'run_league_verify';

// ── module resolution: point native imports at the mocks ──
// React must resolve to ONE copy (the harness's, which matches react-test-renderer),
// otherwise the screens' hooks run against a different React instance and every mount fails.
const REACT_DIR = path.dirname(require.resolve('react/package.json'));
const mocks = {
  react: path.join(REACT_DIR, 'index.js'),
  'react/jsx-runtime': path.join(REACT_DIR, 'jsx-runtime.js'),
  'react/jsx-dev-runtime': path.join(REACT_DIR, 'jsx-dev-runtime.js'),
  'react-native': path.join(HARNESS, 'mocks/react-native.js'),
  '@react-navigation/native': path.join(HARNESS, 'mocks/navigation.js'),
  '@react-native-async-storage/async-storage': path.join(HARNESS, 'mocks/async-storage.js'),
};
const passthroughMock = ['expo-location', 'expo-notifications', 'expo-status-bar', 'react-native-maps',
  'react-native-safe-area-context', 'react-native-screens', '@react-navigation/native-stack', 'expo'];

const origResolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...args) {
  if (mocks[request]) return mocks[request];
  if (passthroughMock.includes(request) || request.startsWith('expo-')) return path.join(HARNESS, 'mocks/empty.js');
  if (request === 'react' || request === 'react-test-renderer') {
    return origResolve.call(this, request, ...args);
  }
  return origResolve.call(this, request, ...args);
};

require('@babel/register').default({
  presets: [
    [require.resolve('@babel/preset-env'), { targets: { node: 'current' } }],
    [require.resolve('@babel/preset-react'), { runtime: 'automatic' }],
  ],
  only: [new RegExp(MOBILE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))],
  extensions: ['.js', '.jsx'],
  cache: false,
});

global.IS_REACT_ACT_ENVIRONMENT = true;
const _warn = console.warn, _err = console.error;
const noisy = (a) => typeof a === 'string' && /react-test-renderer is deprecated/.test(a);
console.warn = (...a) => { if (!noisy(a[0])) _warn(...a); };
console.error = (...a) => { if (!noisy(a[0])) _err(...a); };   // silences the act() warning and enables act batching
const renderer = require('react-test-renderer');
const RN = require(path.join(HARNESS, 'mocks/react-native.js'));
// Exposes __fireFocus(), so a test can re-focus a mounted screen the way navigating back to
// a tab does — which is the only way to catch a screen that loads its data on mount only.
const navMock = require(path.join(HARNESS, 'mocks/navigation.js'));

// ── the live backend, reached through the real api/client.js ──
const BASE = process.env.TEST_URL || 'http://localhost:3000/api';
// The client refuses to guess a backend address; give it the one the harness uses.
process.env.EXPO_PUBLIC_API_URL = BASE;
let TOKEN = null;
const realFetch = global.fetch;
global.fetch = (url, opts = {}) => {
  const headers = { ...(opts.headers || {}) };
  if (TOKEN && !headers.Authorization) headers.Authorization = `Bearer ${TOKEN}`;
  return realFetch(url.toString().replace(/^http:\/\/[^/]+\/api/, BASE), { ...opts, headers });
};

async function api(p, { method = 'GET', body, token } = {}) {
  const h = { 'Content-Type': 'application/json' };
  if (token) h.Authorization = `Bearer ${token}`;
  const r = await realFetch(`${BASE}${p}`, { method, headers: h, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, data: await r.json().catch(() => null) };
}

let pass = 0, fail = 0;
const failures = [];
function check(label, ok, detail) {
  if (ok) { pass++; process.stdout.write(`  ok   ${label}\n`); }
  else { fail++; failures.push([label, detail]); process.stdout.write(`  FAIL ${label}\n         ${detail}\n`); }
}

// Collects every string rendered, so we can assert real data reached the screen.
function textOf(tree) {
  const out = [];
  (function walk(n) {
    if (n == null) return;
    if (typeof n === 'string' || typeof n === 'number') { out.push(String(n)); return; }
    if (Array.isArray(n)) return n.forEach(walk);
    // a TextInput's content lives in its value prop, not in children
    if (n.props) for (const k of ['value', 'placeholder', 'label']) {
      if (typeof n.props[k] === 'string') out.push(n.props[k]);
    }
    if (n.children) n.children.forEach(walk);
  })(tree);
  return out.join(' ');
}

// Finds an accessibility label in the tree. Needed for purely visual elements — an unread
// dot renders no text, so textOf() cannot see it. Walking beats JSON.stringify, which trips
// over the circular references React puts in style and context props.
function hasLabel(node, pattern) {
  if (node == null || typeof node !== 'object') return false;
  if (Array.isArray(node)) return node.some((child) => hasLabel(child, pattern));
  const label = node.props?.accessibilityLabel;
  if (typeof label === 'string' && pattern.test(label)) return true;
  return Array.isArray(node.children) && node.children.some((child) => hasLabel(child, pattern));
}

const AuthContext = require(path.join(MOBILE, 'src/context/AuthContext.js'));

// Renders one screen inside the real AuthProvider, waiting for its effects to settle.
async function mount(ScreenModule, { params = {}, user = null } = {}) {
  const Screen = ScreenModule.default ?? ScreenModule;
  const nav = {
    navigate: (...a) => nav.calls.push(a), goBack: () => nav.calls.push(['goBack']),
    replace: (...a) => nav.calls.push(a), push: (...a) => nav.calls.push(a),
    setOptions: () => {}, addListener: () => () => {}, calls: [],
  };
  global.__nav = nav;

  let tree;
  await renderer.act(async () => {
    tree = renderer.create(
      React.createElement(AuthContext.AuthProvider, null,
        React.createElement(Screen, { navigation: nav, route: { params } }))
    );
  });
  // let pending promises (fetches) resolve and re-render
  for (let i = 0; i < 4; i++) {
    await renderer.act(async () => { await new Promise((r) => setTimeout(r, 120)); });
  }
  return { tree, json: tree.toJSON(), nav, text: textOf(tree.toJSON()) };
}

const screen = (name) => require(path.join(MOBILE, 'src/boundary', name + '.js'));

(async () => {
  // ── seed a user with real data so screens have something to draw ──
  const stamp = Date.now();
  const email = `render.${stamp}@example.com`;
  const reg = await api('/auth/register', { method: 'POST', body: { email, password: 'Password123', name: `Render User ${stamp}` } });
  TOKEN = reg.data.token;
  const userId = reg.data.user.userId;

  await api('/runs', { method: 'POST', token: TOKEN, body: { name: 'Seeded morning run', distanceKm: 6.4, durationSeconds: 2100, startedAt: new Date(Date.now() - 86400000).toISOString(), caloriesBurned: 420, avgHeartRate: 151, maxHeartRate: 174 } });
  await api('/runs', { method: 'POST', token: TOKEN, body: { name: 'Seeded long run', distanceKm: 14.2, durationSeconds: 5400, startedAt: new Date(Date.now() - 3 * 86400000).toISOString(), caloriesBurned: 900, avgHeartRate: 147, maxHeartRate: 168 } });
  await api('/fitness-plans', { method: 'POST', token: TOKEN, body: { goalType: 'race_prep', targetDistanceKm: 21.1, weeklyFrequency: 4, durationWeeks: 12 } });
  await api('/risk-assessment/form', { method: 'PUT', token: TOKEN, body: { isCurrentlySick: false, chronicConditions: ['asthma'], pastInjuries: [{ type: 'shin splints', resolved: false }], selfRatedSoreness: 6 } });
  const group = await api('/groups', { method: 'POST', token: TOKEN, body: { name: `Render Club ${stamp}`, description: 'seeded', isPrivate: false, maxMembers: 30 } });
  const groupId = group.data.group.groupId;
  const tournament = await api(`/groups/${groupId}/tournaments`, { method: 'POST', token: TOKEN, body: { name: `Render Cup ${stamp}`, distanceType: '10K', startDate: new Date(Date.now() + 7 * 86400000).toISOString(), endDate: new Date(Date.now() + 8 * 86400000).toISOString() } });
  const tournamentId = tournament.data.tournament.tournamentId;

  // admin + instructor, for their screens
  await api('/auth/register', { method: 'POST', body: { email: `radmin.${stamp}@example.com`, password: 'Password123', name: `RAdmin ${stamp}` } });
  require('child_process').execSync(`su postgres -c "psql -q -d ${DB} -c \\"UPDATE users SET role='system_admin' WHERE email='radmin.${stamp}@example.com'\\""`);
  const adminTok = (await api('/auth/login', { method: 'POST', body: { email: `radmin.${stamp}@example.com`, password: 'Password123' } })).data.token;
  const coach = await api('/auth/register', { method: 'POST', body: { email: `rcoach.${stamp}@example.com`, password: 'Password123', name: `RCoach ${stamp}`, accountType: 'instructor' } });
  require('child_process').execSync(`su postgres -c "psql -q -d ${DB} -c \\"UPDATE users SET credentials_verified=true WHERE email='rcoach.${stamp}@example.com'\\""`);
  const coachTok = (await api('/auth/login', { method: 'POST', body: { email: `rcoach.${stamp}@example.com`, password: 'Password123' } })).data.token;
  const post = await api('/instructor-posts', { method: 'POST', token: coachTok, body: { title: `Render post ${stamp}`, content: 'Coaching guidance for the render test.', category: 'training' } });
  const postId = post.data.post.postId;
  const event = await api('/admin/public-events', { method: 'POST', token: adminTok, body: { name: `Render Event ${stamp}`, maxParticipants: 50, registrationDeadline: new Date(Date.now() + 5 * 86400000).toISOString(), startDate: new Date(Date.now() + 7 * 86400000).toISOString(), endDate: new Date(Date.now() + 7 * 86400000).toISOString() } });
  const eventId = event.data.event.eventId;

  console.log('\n━━━ RUNNER SCREENS ━━━');
  TOKEN = reg.data.token;

  let r = await mount(screen('DashboardScreen'));
  check('DashboardScreen renders', !!r.json, 'rendered null');

  // The weekly total and the risk score used to be hardcoded placeholders (24.8 km and
  // "34 · LOW RISK"). Both must now agree with what the API returns for this user.
  {
    const apiRuns = (await api('/runs?limit=100', { token: TOKEN })).data.runs;
    const monday = new Date();
    monday.setHours(0, 0, 0, 0);
    monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
    const expectedKm = apiRuns
      .filter((run) => new Date(run.startedAt) >= monday)
      .reduce((sum, run) => sum + Number(run.distanceKm), 0)
      .toFixed(1);
    // textOf() joins each Text child with a space, so "20.6 km" arrives as "20.6  km".
    const shows = new RegExp(`${expectedKm.replace('.', '\\.')}\\s+km`).test(r.text)
      && (expectedKm === '24.8' || !/24\.8\s+km/.test(r.text)); // the old hardcoded figure
    check('DashboardScreen shows the real weekly distance', shows,
      `expected "${expectedKm} km" from ${apiRuns.length} runs; text: ${r.text.slice(0, 400)}`);

    const apiScore = (await api('/risk-assessment', { token: TOKEN })).data.score;
    check('DashboardScreen shows the real risk score',
      !!apiScore && r.text.includes(String(Math.round(apiScore.finalScore))) && !r.text.includes('34 · LOW RISK'),
      `api score ${apiScore?.finalScore}/${apiScore?.riskLevel}; text: ${r.text.slice(0, 220)}`);
  }

  // A brand-new account has nothing to show, which must read as a real zero rather than
  // falling back to invented figures.
  {
    const fresh = await api('/auth/register', { method: 'POST', body: { email: `fresh.${stamp}@example.com`, password: 'Password123', name: `Fresh User ${stamp}` } });
    const mine = TOKEN;
    TOKEN = fresh.data.token;
    const f = await mount(screen('DashboardScreen'));
    check('DashboardScreen shows 0.0 km when there are no runs this week',
      /0\.0\s+km/.test(f.text) && /No runs logged/.test(f.text), `text: ${f.text.slice(0, 300)}`);
    check('DashboardScreen prompts for an assessment when there is no score',
      /Not assessed yet/.test(f.text), `text: ${f.text.slice(0, 300)}`);
    // The unread dot is a bare View, so it is read off the accessibility label instead.
    check('DashboardScreen hides the unread dot when there is nothing unread',
      !hasLabel(f.json, /unread/), 'an unread badge was shown to a brand-new account');

    // Logging a run must move the figure, and land in today's bucket.
    await api('/runs', { method: 'POST', token: TOKEN, body: { name: 'Fresh run today', distanceKm: 3.3, durationSeconds: 1200, startedAt: new Date().toISOString() } });
    const after = await mount(screen('DashboardScreen'));
    check('DashboardScreen picks up a run logged today',
      /3\.3\s+km/.test(after.text) && !/No runs logged/.test(after.text), `text: ${after.text.slice(0, 300)}`);
    TOKEN = mine;
  }

  // ...and it appears once something genuinely is unread.
  {
    await api('/admin/announcements', { method: 'POST', token: adminTok, body: { title: `Render announcement ${stamp}`, body: 'Checking the unread badge.' } });
    const withUnread = await mount(screen('DashboardScreen'));
    check('DashboardScreen shows the unread dot when a notification is unread',
      hasLabel(withUnread.json, /unread/), 'no unread badge after an announcement was sent');
  }

  r = await mount(screen('RunHistoryScreen'));
  check('RunHistoryScreen shows the seeded runs', r.text.includes('Seeded morning run'), `text: ${r.text.slice(0, 160)}`);

  r = await mount(screen('RunDetailsScreen'), { params: { runId: (await api('/runs', { token: TOKEN })).data.runs[0].runId } });
  check('RunDetailsScreen renders a real run', /Seeded/.test(r.text), `text: ${r.text.slice(0, 160)}`);
  check('RunDetailsScreen offers to correct and to delete the run',
    /Correct the figures/.test(r.text) && /Delete this run/.test(r.text), `text: ${r.text.slice(0, 300)}`);
  check('RunDetailsScreen loads the saved figures into the correction fields',
    r.text.includes('6.4') || r.text.includes('14.2'), `text: ${r.text.slice(0, 300)}`);

  r = await mount(screen('LogRunScreen'));
  check('LogRunScreen renders', !!r.json, 'rendered null');
  check('LogRunScreen starts idle with nothing recorded', /0\.00/.test(r.text) && /Start/.test(r.text), `text: ${r.text.slice(0, 200)}`);

  // A run left part-recorded by the app being killed must be offered back, not lost.
  {
    await api('/runs/active', { method: 'DELETE', token: TOKEN });
    await api('/runs/active', { method: 'POST', token: TOKEN, body: { startedAt: new Date(Date.now() - 900000).toISOString() } });
    await api('/runs/active', { method: 'PATCH', token: TOKEN, body: {
      distanceKm: 7.25,
      durationSeconds: 900,
      routeGps: [{ latitude: -34.4, longitude: 150.87 }, { latitude: -34.41, longitude: 150.88 }],
    } });

    const recovered = await mount(screen('LogRunScreen'));
    check('LogRunScreen recovers a run the app was killed during',
      /still being recorded/.test(recovered.text), `text: ${recovered.text.slice(0, 300)}`);
    check('LogRunScreen restores the distance it had reached',
      /7\.25/.test(recovered.text), `text: ${recovered.text.slice(0, 300)}`);
    check('LogRunScreen offers to save or discard it, not to start again',
      /Save run/.test(recovered.text) && /Discard/.test(recovered.text), `text: ${recovered.text.slice(0, 300)}`);
    await api('/runs/active', { method: 'DELETE', token: TOKEN });
  }

  for (const kind of ['calories', 'heart-rate', 'trends']) {
    r = await mount(screen('RunInsightsScreen'), { params: { kind } });
    const shows = kind === 'calories' ? /1,?320|kcal/.test(r.text)
      : kind === 'heart-rate' ? /bpm/.test(r.text)
      : /km|pace/.test(r.text);
    check(`RunInsightsScreen (${kind}) shows real figures`, shows, `text: ${r.text.slice(0, 200)}`);
  }

  r = await mount(screen('FitnessPlanScreen'));
  check('FitnessPlanScreen shows the active plan', /Race prep/i.test(r.text), `text: ${r.text.slice(0, 200)}`);

  // The screen must leave its loading state. An early return in load() once skipped
  // setLoading(false), and the result was a permanent spinner that looked like the plan
  // failing to load — invisible to a check that only looks for a crash.
  check('FitnessPlanScreen finishes loading rather than spinning',
    /Edit Plan|Create a Plan/.test(r.text), `text: ${r.text.slice(0, 220)}`);
  check('FitnessPlanScreen offers to build a schedule when there is none',
    /Build my schedule/.test(r.text), `text: ${r.text.slice(0, 260)}`);

  // Generate one on the server, then check the screen renders it.
  {
    const planId = (await api('/fitness-plans', { token: TOKEN })).data.plan.planId;
    await api(`/fitness-plans/${planId}/generate`, { method: 'POST', token: TOKEN });

    let ready = null;
    for (let i = 0; i < 30; i += 1) {
      await new Promise((done) => setTimeout(done, 200));
      const view = await api('/fitness-plans', { token: TOKEN });
      if (view.data.plan.generationStatus !== 'generating') { ready = view.data; break; }
    }
    check('a schedule can be generated for the seeded plan',
      ready?.plan?.generationStatus === 'ready' && ready.schedule.length > 0,
      `status ${ready?.plan?.generationStatus}, ${ready?.schedule?.length} weeks`);

    const withPlan = await mount(screen('FitnessPlanScreen'));
    check('FitnessPlanScreen renders the generated schedule',
      /Your schedule/.test(withPlan.text), `text: ${withPlan.text.slice(0, 300)}`);
    // textOf joins each Text child with a space, so "Wk 1" arrives as "Wk  1".
    check('it shows week tabs and the sessions in a week',
      /Wk\s+1\b/.test(withPlan.text) && /(Easy run|Long run|Tempo|Intervals)/.test(withPlan.text),
      `text: ${withPlan.text.slice(0, 600)}`);
    check('it says where the plan came from rather than implying a model wrote it',
      /Standard progression|Written for you/.test(withPlan.text), `text: ${withPlan.text.slice(0, 300)}`);
    check('it shows how much of the plan has been done',
      /sessions done/.test(withPlan.text), `text: ${withPlan.text.slice(0, 400)}`);
  }

  r = await mount(screen('RiskAssessmentScreen'));
  check('RiskAssessmentScreen shows a real score', /RISK/.test(r.text) && /\d/.test(r.text), `text: ${r.text.slice(0, 200)}`);

  r = await mount(screen('ProfileScreen'));
  check('ProfileScreen renders earned badges, not a placeholder', /First Steps/.test(r.text), `text: ${r.text.slice(0, 220)}`);

  // Asserted against the server's own totals, positively. The previous version of this check
  // only looked for the ABSENCE of an old hardcoded figure, so it went on passing when the
  // tiles silently fell back to 0.0 km / 0 runs — which is what they did for a while.
  {
    const stats = (await api('/profile', { token: TOKEN })).data.stats;
    check('GET /profile returns run totals', !!stats && typeof stats.totalDistanceKm === 'number',
      `stats: ${JSON.stringify(stats)}`);
    check('ProfileScreen shows the distance the server reports',
      new RegExp(`${stats.totalDistanceKm.toFixed(1).replace('.', '\\.')}\\s`).test(r.text),
      `expected ${stats.totalDistanceKm.toFixed(1)} km; text: ${r.text.slice(0, 260)}`);
    check('ProfileScreen shows a non-zero distance for a runner who has runs',
      stats.runCount > 0 && !/\b0\.0\s+km/.test(r.text),
      `runCount ${stats.runCount}; text: ${r.text.slice(0, 260)}`);
    check('ProfileScreen shows the run count the server reports',
      new RegExp(`\\b${stats.runCount}\\s`).test(r.text),
      `expected ${stats.runCount} runs; text: ${r.text.slice(0, 260)}`);

    // Coming back to the tab must pick up a run logged in between — the loads used to run
    // only on mount, so the totals were whatever was true when the screen first opened.
    await api('/runs', { method: 'POST', token: TOKEN, body: {
      name: 'Logged while the profile was open', distanceKm: 3.75, durationSeconds: 1200,
      startedAt: new Date(Date.now() - 1200000).toISOString(),
    } });
    const expected = (stats.totalDistanceKm + 3.75).toFixed(1);
    await renderer.act(async () => { navMock.__fireFocus(); });
    await renderer.act(async () => { await new Promise((done) => setTimeout(done, 250)); });
    const after = textOf(r.tree.toJSON());
    check('ProfileScreen reloads its totals when the tab is reopened',
      new RegExp(`${expected.replace('.', '\\.')}\\s`).test(after),
      `expected ${expected} km after logging 3.75; text: ${after.slice(0, 260)}`);
  }

  r = await mount(screen('GroupsListScreen'));
  check('GroupsListScreen renders', !!r.json, 'rendered null');

  r = await mount(screen('GroupDetailsScreen'), { params: { groupId } });
  check('GroupDetailsScreen shows the real group', new RegExp(`Render Club`).test(r.text), `text: ${r.text.slice(0, 200)}`);

  r = await mount(screen('TournamentDetailsScreen'), { params: { tournamentId, id: tournamentId } });
  check('TournamentDetailsScreen renders', !!r.json, 'rendered null');
  // Finishing times must be formatted, never raw seconds like "5112s".
  // Recording a finishing time is what gives the standings something to rank.
  r = await mount(screen('TournamentResultsScreen'), { params: { tournamentId, isGroupAdmin: true, status: 'in_progress' } });
  check('TournamentResultsScreen lists participants to record for',
    /Record Results/.test(r.text) && /Record a time for any participant|Nobody has joined/.test(r.text),
    `text: ${r.text.slice(0, 220)}`);

  r = await mount(screen('TournamentResultsScreen'), { params: { tournamentId, isGroupAdmin: false, status: 'in_progress' } });
  check('TournamentResultsScreen tells a plain participant what they may do',
    /Record your own finishing time/.test(r.text), `text: ${r.text.slice(0, 220)}`);

  check('TournamentDetailsScreen does not show raw seconds',
    !/\b\d{3,}s\b/.test(r.text), `raw seconds in: ${r.text.slice(0, 200)}`);

  r = await mount(screen('PublicEventsScreen'));
  check('PublicEventsScreen lists the real event', new RegExp('Render Event').test(r.text), `text: ${r.text.slice(0, 200)}`);

  r = await mount(screen('PublicEventDetailsScreen'), { params: { eventId } });
  check('PublicEventDetailsScreen shows event detail', /Registration|Starts/.test(r.text), `text: ${r.text.slice(0, 200)}`);

  r = await mount(screen('InstructorBoardScreen'));
  check('InstructorBoardScreen (runner view) shows a real post', new RegExp('Render post').test(r.text), `text: ${r.text.slice(0, 200)}`);

  r = await mount(screen('InstructorPostDetailsScreen'), { params: { postId } });
  check('InstructorPostDetailsScreen shows post content', /render test/.test(r.text), `text: ${r.text.slice(0, 200)}`);

  r = await mount(screen('RewardsScreen'));
  check('RewardsScreen renders the catalog', /Voucher|Cap|pts/.test(r.text), `text: ${r.text.slice(0, 200)}`);

  r = await mount(screen('LeaderboardScreen'));
  check('LeaderboardScreen renders', !!r.json, 'rendered null');

  r = await mount(screen('NotificationsScreen'));
  check('NotificationsScreen renders', !!r.json, 'rendered null');

  r = await mount(screen('NotificationPreferencesScreen'));
  check('NotificationPreferencesScreen renders its toggles', /Reminders|Alerts/.test(r.text), `text: ${r.text.slice(0, 200)}`);

  console.log('\n━━━ INSTRUCTOR SCREENS ━━━');
  TOKEN = coachTok;

  r = await mount(screen('InstructorDashboardScreen'));
  check('InstructorDashboardScreen shows real post counts', new RegExp('Render post').test(r.text) || /Posts published/.test(r.text), `text: ${r.text.slice(0, 200)}`);

  r = await mount(screen('InstructorPostsScreen'));
  check('InstructorPostsScreen lists my posts', new RegExp('Render post').test(r.text), `text: ${r.text.slice(0, 200)}`);

  r = await mount(screen('InstructorCreatePostScreen'));
  check('InstructorCreatePostScreen renders the form', /Publish|Category/.test(r.text), `text: ${r.text.slice(0, 200)}`);

  r = await mount(screen('InstructorEditPostScreen'), { params: { postId } });
  check('InstructorEditPostScreen loads the post into the form', /Save Changes|No Changes/.test(r.text), `text: ${r.text.slice(0, 200)}`);

  r = await mount(screen('InstructorProfileScreen'));
  check('InstructorProfileScreen shows verification state', /Verified|Pending/.test(r.text), `text: ${r.text.slice(0, 200)}`);

  // IU-04: submitting credentials for a System Admin to verify (SA-11).
  r = await mount(screen('MyCredentialsScreen'));
  check('MyCredentialsScreen shows credential status',
    /NOT SUBMITTED|AWAITING REVIEW|VERIFIED/.test(r.text) && /Submit for Review|Resubmit for Review/.test(r.text),
    `text: ${r.text.slice(0, 220)}`);

  console.log('\n━━━ ADMIN SCREENS ━━━');
  TOKEN = adminTok;

  r = await mount(screen('AdminDashboardScreen'));
  // The screen labels the tiles "Users" / "Suspended" / "Pending Instructors" and puts the
  // count before the label, e.g. "3 Users". Assert a real number reached the tile.
  check('AdminDashboardScreen shows real platform stats',
    /System Overview/.test(r.text) && /\d+\s*Users/.test(r.text) && /Pending Instructors/.test(r.text),
    `text: ${r.text.slice(0, 220)}`);

  r = await mount(screen('AdminUsersScreen'));
  check('AdminUsersScreen lists real accounts', new RegExp('Render User').test(r.text), `text: ${r.text.slice(0, 250)}`);

  r = await mount(screen('AdminUserDetailsScreen'), { params: { userId } });
  check('AdminUserDetailsScreen shows one account', new RegExp('Render User').test(r.text), `text: ${r.text.slice(0, 250)}`);

  // SA-06: edit a user, so a locked-out account can be helped.
  r = await mount(screen('AdminEditUserScreen'), { params: { user: { userId, name: 'Render User', email: `ruser.${stamp}@example.com`, bio: null } } });
  check('AdminEditUserScreen loads the account into the form',
    /Edit Account/.test(r.text) && /No changes|Save Changes/.test(r.text), `text: ${r.text.slice(0, 220)}`);

  r = await mount(screen('AdminCreateUserScreen'));
  check('AdminCreateUserScreen renders the form', /Create Account/.test(r.text), `text: ${r.text.slice(0, 200)}`);

  r = await mount(screen('AdminGroupsScreen'));
  check('AdminGroupsScreen lists real groups', new RegExp('Render Club').test(r.text), `text: ${r.text.slice(0, 250)}`);

  // SA-21: rename a group rather than deleting it and losing its members.
  r = await mount(screen('AdminEditGroupScreen'), { params: { group: { groupId: 1, name: 'Render Club', description: null, maxMembers: null, memberCount: 1 } } });
  check('AdminEditGroupScreen loads the group into the form',
    /Edit Group/.test(r.text) && /No changes|Save Changes/.test(r.text), `text: ${r.text.slice(0, 220)}`);

  r = await mount(screen('AdminContentScreen'));
  check('AdminContentScreen shows rewards', /Voucher|pts/.test(r.text), `text: ${r.text.slice(0, 200)}`);

  r = await mount(screen('AdminRunsScreen'));
  check('AdminRunsScreen lists runs across users', /km/.test(r.text), `text: ${r.text.slice(0, 200)}`);

  r = await mount(screen('AdminPublicEventsScreen'));
  check('AdminPublicEventsScreen lists the event', new RegExp('Render Event').test(r.text), `text: ${r.text.slice(0, 250)}`);

  r = await mount(screen('AdminAnnouncementScreen'));
  check('AdminAnnouncementScreen renders the composer', /Send|Announcement/.test(r.text), `text: ${r.text.slice(0, 200)}`);

  r = await mount(screen('AdminAuditLogScreen'));
  check('AdminAuditLogScreen renders', !!r.json, 'rendered null');

  console.log('\n━━━ SHARED FORMATTING ━━━');
  const { formatDuration } = require(path.join(MOBILE, 'src/utils/geo.js'));
  check('formatDuration renders h:mm:ss past an hour', formatDuration(5112) === '01:25:12', `got ${formatDuration(5112)}`);
  check('formatDuration renders mm:ss under an hour', formatDuration(600) === '10:00', `got ${formatDuration(600)}`);
  check('formatDuration handles exactly one hour', formatDuration(3600) === '01:00:00', `got ${formatDuration(3600)}`);

  // thinRoute is what keeps a long run's GPS route inside the request limit. A route that
  // is too large is why runs over about 70 minutes used to fail to save.
  const { thinRoute, MAX_ROUTE_POINTS } = require(path.join(MOBILE, 'src/utils/geo.js'));
  {
    // Points 2 m apart: below the 10 m threshold, so most should be dropped.
    const dense = Array.from({ length: 2000 }, (_, i) => ({ latitude: -34.4 + i * 1.8e-5, longitude: 150.87 }));
    const thinned = thinRoute(dense);
    check('thinRoute drops points too close together to draw', thinned.length < dense.length / 3,
      `${dense.length} -> ${thinned.length}`);
    check('thinRoute keeps the start and the finish', thinned[0] === dense[0] && thinned[thinned.length - 1] === dense[dense.length - 1],
      'the route no longer starts or ends where the run did');

    // A 60 km run at a point every 3 s: must come back inside the server's cap.
    const marathon = Array.from({ length: 24000 }, (_, i) => ({ latitude: -34.4 + i * 2.3e-4, longitude: 150.87 + i * 2.3e-4 }));
    const capped = thinRoute(marathon);
    check('thinRoute never exceeds the cap the server enforces', capped.length <= MAX_ROUTE_POINTS,
      `${capped.length} points, cap ${MAX_ROUTE_POINTS}`);
    check('thinRoute leaves short routes alone', thinRoute([{ latitude: 1, longitude: 1 }]).length === 1);
    check('thinRoute copes with no route at all', thinRoute(undefined).length === 0 && thinRoute([]).length === 0);
  }

  // Background tracking: the task writes fixes to a buffer because the OS delivers them with
  // no screen mounted. If draining that buffer is wrong, a run recorded with the phone in a
  // pocket is silently lost or double-counted.
  {
    const bg = require(path.join(MOBILE, 'src/utils/backgroundLocation.js'));
    await bg.clearBufferedLocations();
    check('an empty buffer drains to nothing', (await bg.drainBufferedLocations()).length === 0);

    const AsyncStorage = require(path.join(HARNESS, 'mocks/async-storage.js'));
    const store = AsyncStorage.default ?? AsyncStorage;
    const points = [
      { latitude: -34.4061, longitude: 150.8785, timestamp: 1 },
      { latitude: -34.4071, longitude: 150.8795, timestamp: 2 },
    ];
    await store.setItem('runleague.backgroundLocations', JSON.stringify(points));

    const drained = await bg.drainBufferedLocations();
    check('buffered fixes come back in order', drained.length === 2 && drained[0].timestamp === 1,
      JSON.stringify(drained));
    check('draining clears the buffer, so nothing is counted twice',
      (await bg.drainBufferedLocations()).length === 0, 'the same points drained a second time');

    await store.setItem('runleague.backgroundLocations', 'not json at all');
    check('a corrupt buffer yields nothing rather than throwing',
      (await bg.drainBufferedLocations()).length === 0);

    // Expo Go has no background location, so starting must report that rather than throw.
    const started = await bg.startBackgroundTracking();
    check('starting background tracking never throws, and reports why if it cannot',
      typeof started?.ok === 'boolean' && (started.ok || typeof started.reason === 'string'),
      JSON.stringify(started));
  }

  console.log('\n━━━ AUTH / SIGNUP SCREENS ━━━');
  TOKEN = null;
  for (const name of ['LandingScreen', 'SignInScreen', 'RegisterScreen', 'CreateInstructorAccountScreen', 'ChooseAccountTypeScreen', 'ForgotPasswordScreen']) {
    r = await mount(screen(name));
    check(`${name} renders`, !!r.json, 'rendered null');
  }

  // ── interactions: find a control by its label and press it ──
  console.log('\n━━━ INTERACTIONS (pressing real buttons) ━━━');

  function findByText(tree, label) {
    const hits = [];
    (function walk(n, ancestors) {
      if (!n || typeof n !== 'object') return;
      if (Array.isArray(n)) return n.forEach((c) => walk(c, ancestors));
      const own = textOf(n);
      if (own.includes(label) && n.props && typeof n.props.onPress === 'function') hits.push(n);
      if (n.children) n.children.forEach((c) => walk(c, [...ancestors, n]));
    })(tree, []);
    return hits[0];
  }
  async function press(node) {
    await renderer.act(async () => { node.props.onPress(); });
    await renderer.act(async () => { await new Promise((r) => setTimeout(r, 300)); });
  }

  TOKEN = reg.data.token;

  // RU-40 — joining an event from the screen, not via the API
  let ev = await mount(screen('PublicEventDetailsScreen'), { params: { eventId } });
  const joinBtn = findByText(ev.json, 'Join Event');
  if (!joinBtn) { check('PublicEventDetails has a Join button', false, `text: ${ev.text.slice(0, 200)}`); }
  else {
    await press(joinBtn);
    const server = await api(`/public-events/${eventId}`, { token: TOKEN });
    check('RU-40 pressing Join in the UI registers on the server', server.data.event.isRegistered === true,
      `server says isRegistered=${server.data?.event?.isRegistered}`);
    check('RU-40 the screen updates to show the user is in', /registered for this event/i.test(textOf(ev.tree.toJSON())),
      `text: ${textOf(ev.tree.toJSON()).slice(0, 200)}`);
  }

  // RU-48 — toggling a badge off from the profile
  let prof = await mount(screen('ProfileScreen'));
  const badgeToggle = findByText(prof.json, 'On profile');
  if (!badgeToggle) { check('ProfileScreen has a badge display toggle', false, `text: ${prof.text.slice(0, 200)}`); }
  else {
    await press(badgeToggle);
    const badges = await api('/rewards/badges', { token: TOKEN });
    const anyHidden = badges.data.badges.some((b) => (b.is_displayed ?? b.isDisplayed) === false);
    check('RU-48 pressing the toggle hides the badge on the server', anyHidden,
      `badges: ${JSON.stringify(badges.data.badges).slice(0, 160)}`);
  }

  // RU-12 — creating a fitness plan through the form
  await api(`/fitness-plans/${(await api('/fitness-plans', { token: TOKEN })).data.plan.planId}`, { method: 'DELETE', token: TOKEN });
  let plan = await mount(screen('FitnessPlanScreen'));
  const createBtn = findByText(plan.json, 'Create a Plan');
  if (!createBtn) { check('FitnessPlanScreen offers plan creation when empty', false, `text: ${plan.text.slice(0, 200)}`); }
  else {
    await press(createBtn);
    const submit = findByText(plan.tree.toJSON(), 'Create Plan');
    check('FitnessPlanScreen opens the creation form', !!submit, `text: ${textOf(plan.tree.toJSON()).slice(0, 200)}`);
    if (submit) {
      await press(submit);
      const server = await api('/fitness-plans', { token: TOKEN });
      check('RU-12 submitting the form creates a plan on the server', server.data.plan !== null,
        `server plan: ${JSON.stringify(server.data.plan)}`);
    }
  }

  console.log(`\n${'─'.repeat(64)}\n  ${pass} screens/assertions passed, ${fail} failed\n${'─'.repeat(64)}`);
  if (failures.length) {
    console.log('\nFAILURES:');
    for (const [l, d] of failures) console.log(`  ${l}\n      ${d}`);
  }
  process.exit(fail ? 1 : 0);
})().catch((err) => {
  console.error('\nHARNESS ERROR:', err.stack);
  process.exit(2);
});
