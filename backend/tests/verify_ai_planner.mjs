/**
 * The fitness plan AI — a rule-based expert system (no language model).
 *
 * The plan is produced by PlanBuilder from the runner's level and recent volume. These tests
 * cover the builder on its own, the level classification that shapes it, validation, and the
 * end-to-end endpoint. There is no model path to test any more: generation is always the rules.
 *
 * The end-to-end section needs the app running; the rest is offline.
 * Run: npm run test:planner
 */
import { buildPlan, validatePlan, LEVEL_PROFILES } from '../control/PlanBuilder.js';
import { generatePlan, isAiConfigured } from '../control/PlanGenerationService.js';

const BASE = process.env.TEST_URL || 'http://localhost:3000/api';
const stamp = Date.now();

let pass = 0, fail = 0;
const failures = [];
const check = (label, ok, detail = '') => {
  if (ok) { pass += 1; console.log(`  ok   ${label}`); }
  else { fail += 1; failures.push([label, detail]); console.log(`  FAIL ${label}\n         ${detail}`); }
};

const api = async (path, { method = 'GET', token, body } = {}) => {
  const r = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const t = await r.text(); let d; try { d = t ? JSON.parse(t) : null; } catch { d = t; }
  return { status: r.status, data: d };
};

const register = async (tag) =>
  (await api('/auth/register', { method: 'POST', body: { email: `${tag}.${stamp}@example.com`, password: 'Sprint7Harbour', name: `${tag} ${stamp}` } })).data.token;

// ─────────────────────────────────────────────────────────────
console.log('\n━━━ THE RULES BUILDER ON ITS OWN ━━━');
{
  const plan = buildPlan({ goalType: 'race_prep', targetDistanceKm: 21.1, weeklyFrequency: 4, durationWeeks: 10, recentWeeklyKm: 22 });
  check('builds the number of weeks asked for', plan.weeks.length === 10, `got ${plan.weeks.length}`);
  check('every week has the requested number of sessions',
    plan.weeks.every((w) => w.sessions.length === 4),
    plan.weeks.map((w) => w.sessions.length).join(','));
  check('its own output validates', !validatePlan(plan, { durationWeeks: 10 }).error,
    validatePlan(plan, { durationWeeks: 10 }).error);

  check('week one is near recent volume, not far above it',
    plan.weeks[0].targetDistanceKm <= 22 * 1.15,
    `${plan.weeks[0].targetDistanceKm} km against 22 km recent`);

  check('week 4 is lighter than week 3', plan.weeks[3].targetDistanceKm < plan.weeks[2].targetDistanceKm,
    `${plan.weeks[3].targetDistanceKm} vs ${plan.weeks[2].targetDistanceKm}`);
  check('week 8 is lighter than week 7', plan.weeks[7].targetDistanceKm < plan.weeks[6].targetDistanceKm,
    `${plan.weeks[7].targetDistanceKm} vs ${plan.weeks[6].targetDistanceKm}`);

  // A week must not exceed the highest week so far by more than about 10% — that is what a
  // genuine spike in training load looks like (returning from a recovery week is allowed).
  let peakSoFar = 0;
  const spikes = [];
  for (const w of plan.weeks) {
    if (peakSoFar > 0 && w.targetDistanceKm > peakSoFar * 1.11) {
      spikes.push(`wk${w.weekNumber}: ${w.targetDistanceKm} after a peak of ${peakSoFar.toFixed(1)}`);
    }
    peakSoFar = Math.max(peakSoFar, w.targetDistanceKm);
  }
  check('no week exceeds the highest week so far by more than about 10%', spikes.length === 0,
    spikes.join('; '));

  check('a race plan tapers at the end',
    plan.weeks[9].targetDistanceKm < plan.weeks[6].targetDistanceKm,
    `final ${plan.weeks[9].targetDistanceKm} vs peak-ish ${plan.weeks[6].targetDistanceKm}`);
  check('exactly one long run a week',
    plan.weeks.every((w) => w.sessions.filter((s) => s.sessionType === 'long').length === 1));
  check('no two sessions land on the same day',
    plan.weeks.every((w) => new Set(w.sessions.map((s) => s.dayOfWeek)).size === w.sessions.length));

  // A high-risk runner should be given less, not more.
  const risky = buildPlan({ goalType: 'general_fitness', weeklyFrequency: 4, durationWeeks: 8, recentWeeklyKm: 40, riskLevel: 'high' });
  const normal = buildPlan({ goalType: 'general_fitness', weeklyFrequency: 4, durationWeeks: 8, recentWeeklyKm: 40 });
  check('a high-risk runner starts below a low-risk one',
    risky.weeks[0].targetDistanceKm < normal.weeks[0].targetDistanceKm,
    `${risky.weeks[0].targetDistanceKm} vs ${normal.weeks[0].targetDistanceKm}`);

  const noHistory = buildPlan({ goalType: 'general_fitness', weeklyFrequency: 3, durationWeeks: 6, recentWeeklyKm: 0 });
  check('someone with no history still gets a sensible plan',
    noHistory.weeks.length === 6 && noHistory.weeks[0].targetDistanceKm > 0 && noHistory.weeks[0].targetDistanceKm < 30,
    `week one ${noHistory.weeks[0].targetDistanceKm} km`);
}

// Level classification is now the ML service (Python) — tested there, not in this Node suite.

// ─────────────────────────────────────────────────────────────
console.log('\n━━━ THE PLAN IS SHAPED BY LEVEL ━━━');
{
  const build = (level) => buildPlan({ goalType: 'race_prep', targetDistanceKm: 10, weeklyFrequency: 6, durationWeeks: 12, recentWeeklyKm: 20, level });

  for (const level of ['beginner', 'intermediate', 'advanced']) {
    const plan = build(level);
    const prof = LEVEL_PROFILES[level];
    check(`${level}: validates`, !validatePlan(plan, { durationWeeks: 12 }).error, validatePlan(plan, { durationWeeks: 12 }).error);
    const maxFreq = Math.max(...plan.weeks.map((w) => w.sessions.length));
    check(`${level}: runs per week capped at ${prof.maxFrequency}`, maxFreq <= prof.maxFrequency, `got ${maxFreq}`);
    const q = plan.weeks[5].sessions.filter((s) => ['tempo', 'intervals'].includes(s.sessionType)).length;
    check(`${level}: at most ${prof.qualityPerWeek} quality sessions in a build week`, q <= prof.qualityPerWeek, `got ${q}`);
    check(`${level}: the plan carries its level`, plan.level === level);
  }

  const beginner = build('beginner');
  check('a beginner is capped at 3 runs even when 6 were requested',
    beginner.weeks.every((w) => w.sessions.length <= 3), beginner.weeks.map((w) => w.sessions.length).join(','));
  check('a beginner starts with run-walk',
    beginner.weeks[0].sessions.some((s) => /walk/i.test(s.description)));
  check('a beginner gets a lighter week every fourth week',
    beginner.weeks[3].targetDistanceKm < beginner.weeks[2].targetDistanceKm,
    `${beginner.weeks[2].targetDistanceKm} vs ${beginner.weeks[1].targetDistanceKm}`);

  const advanced = build('advanced');
  check('an advanced runner does up to two quality sessions',
    advanced.weeks[5].sessions.filter((s) => ['tempo', 'intervals'].includes(s.sessionType)).length === 2);
}

// ─────────────────────────────────────────────────────────────
console.log('\n━━━ VALIDATION REJECTS A BAD PLAN ━━━');
{
  const good = buildPlan({ weeklyFrequency: 3, durationWeeks: 4 });
  const bad = (mutate, label) => {
    const copy = JSON.parse(JSON.stringify(good));
    mutate(copy);
    const result = validatePlan(copy, { durationWeeks: 4 });
    check(`refuses ${label}`, !!result.error, `accepted it: ${JSON.stringify(copy).slice(0, 90)}`);
  };

  bad((p) => { p.weeks[0].sessions[0].dayOfWeek = 9; }, 'a session on day 9');
  bad((p) => { p.weeks[0].sessions[0].sessionType = 'parkour'; }, 'an invented session type');
  bad((p) => { p.weeks[0].sessions[0].distanceKm = 500; }, 'a 500 km session');
  bad((p) => { p.weeks[0].targetDistanceKm = -5; }, 'a negative weekly target');
  bad((p) => { p.weeks[1].weekNumber = 1; }, 'the same week number twice');
  bad((p) => { p.weeks[0].sessions[1].dayOfWeek = p.weeks[0].sessions[0].dayOfWeek; }, 'two sessions on one day');
  bad((p) => { p.weeks.pop(); }, 'fewer weeks than were asked for');
  bad((p) => { p.weeks[0].sessions = []; }, 'a week with no sessions');
  bad((p) => { p.weeks[3].targetDistanceKm = p.weeks[0].targetDistanceKm * 3; }, 'a sudden volume spike');
  bad((p) => { p.coachNotes = 'x'.repeat(5000); }, 'over-long coach notes');

  check('refuses something that is not a plan at all', !!validatePlan(null).error);
  check('refuses a plan with no weeks', !!validatePlan({ weeks: [] }).error);
}

// ─────────────────────────────────────────────────────────────
console.log('\n━━━ GENERATION IS ALWAYS THE RULES (NO MODEL) ━━━');
{
  const out = await generatePlan({ goalType: 'general_fitness', weeklyFrequency: 3, durationWeeks: 4, recentWeeklyKm: 20, level: 'intermediate' });
  check('generatePlan returns a rules plan', out.generatedBy === 'rules', out.generatedBy);
  check('there is no warning, because there is no model to fall back from', out.warning === null);
  check('and the plan is usable', out.plan.weeks.length === 4);
  check('the app reports no model configured', isAiConfigured() === false);
  check('optional paces attach to every session',
    buildPlan({ level: 'intermediate', durationWeeks: 2, recentWeeklyKm: 25, paces: { easy: 6.4, long: 6.5, tempo: 5.6, intervals: 5.2 } })
      .weeks[0].sessions.every((s) => typeof s.targetPaceMinPerKm === 'number'));
}

// ─────────────────────────────────────────────────────────────
// The sections below need the app running (TEST_URL). They are skipped when it is unreachable.
console.log('\n━━━ END TO END ━━━');
let serverUp = true;
try { await fetch(BASE.replace(/\/api$/, '') + '/health').catch(() => fetch(BASE)); }
catch { serverUp = false; }

if (!serverUp) {
  console.log('  (skipped — app not reachable at', BASE + ')');
} else {
  const token = await register('planner');
  let planId;
  for (let i = 1; i <= 8; i += 1) {
    await api('/runs', { method: 'POST', token, body: { distanceKm: 6, durationSeconds: 2400, startedAt: new Date(Date.now() - i * 2 * 86400000).toISOString() } });
  }

  const created = await api('/fitness-plans', { method: 'POST', token, body: { goalType: 'race_prep', targetDistanceKm: 21.1, weeklyFrequency: 4, durationWeeks: 8 } });
  planId = created.data.plan?.planId ?? created.data.planId;

  const before = await api('/fitness-plans', { token });
  check('a new plan has no schedule yet', before.data.plan.generationStatus === 'none' && before.data.schedule.length === 0,
    `${before.data.plan.generationStatus}, ${before.data.schedule.length} weeks`);

  const started = await api(`/fitness-plans/${planId}/generate`, { method: 'POST', token });
  check('generating answers immediately rather than holding the request', started.status === 202, `${started.status}`);
  check('a second generation is refused while one is running',
    (await api(`/fitness-plans/${planId}/generate`, { method: 'POST', token })).status === 409);

  let view;
  for (let i = 0; i < 30; i += 1) {
    await new Promise((r) => setTimeout(r, 200));
    view = await api('/fitness-plans', { token });
    if (view.data.plan.generationStatus !== 'generating') break;
  }
  check('it finishes', view.data.plan.generationStatus === 'ready', view.data.plan.generationStatus);
  check('the plan came from the rules', view.data.plan.generatedBy === 'rules', view.data.plan.generatedBy);
  check('the schedule has the weeks', view.data.schedule.length === 8, `${view.data.schedule.length}`);
  check('there are coach notes', (view.data.plan.coachNotes || '').length > 20);

  const session = view.data.schedule[0].sessions[0];
  const run = (await api('/runs?limit=1', { token })).data.runs[0];
  check('a session can be ticked off against a run',
    (await api(`/fitness-plans/sessions/${session.sessionId}/complete`, { method: 'PATCH', token, body: { runId: run.runId } })).status === 200);
  const after = await api('/fitness-plans', { token });
  check('progress counts it', after.data.scheduleProgress.completedSessions === 1, JSON.stringify(after.data.scheduleProgress));

  const stranger = await register('planstranger');
  check("another user cannot generate someone else's plan",
    (await api(`/fitness-plans/${planId}/generate`, { method: 'POST', token: stranger })).status === 404);
}

console.log('\n' + '─'.repeat(70));
console.log(`  ${pass} passed, ${fail} failed`);
if (failures.length) {
  console.log('\nFAILURES:');
  failures.forEach(([l, d]) => console.log(`  • ${l}\n      ${d}`));
}
console.log('─'.repeat(70));
process.exit(fail > 0 ? 1 : 0);
