/**
 * The AI fitness planner, both paths.
 *
 * The model path is exercised against a stub provider on port 4902 rather than a real API:
 * it costs nothing, runs offline, and — more usefully — lets the failures be tested on
 * purpose. A provider that times out, returns prose instead of JSON, or returns a plan with
 * nine days in a week are the cases that matter, and none of them can be arranged reliably
 * against a real model.
 *
 * Start the server first, then: npm run test:planner
 */
import http from 'node:http';
import { buildPlan, validatePlan } from '../control/PlanBuilder.js';

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
  (await api('/auth/register', { method: 'POST', body: { email: `${tag}.${stamp}@example.com`, password: 'Password123', name: `${tag} ${stamp}` } })).data.token;

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

  // Every fourth week lighter — the point of a recovery week.
  check('week 4 is lighter than week 3', plan.weeks[3].targetDistanceKm < plan.weeks[2].targetDistanceKm,
    `${plan.weeks[3].targetDistanceKm} vs ${plan.weeks[2].targetDistanceKm}`);
  check('week 8 is lighter than week 7', plan.weeks[7].targetDistanceKm < plan.weeks[6].targetDistanceKm,
    `${plan.weeks[7].targetDistanceKm} vs ${plan.weeks[6].targetDistanceKm}`);

  // The meaningful rule is not "no week exceeds the one before it by 10%" — returning from a
  // deliberately easy recovery week legitimately rises more than that. What must not happen
  // is a week exceeding the highest week *so far* by more than about 10%, which is what a
  // genuine spike in training load looks like.
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

  const beginner = buildPlan({ goalType: 'general_fitness', weeklyFrequency: 3, durationWeeks: 6, recentWeeklyKm: 0 });
  check('someone with no history still gets a sensible plan',
    beginner.weeks.length === 6 && beginner.weeks[0].targetDistanceKm > 0 && beginner.weeks[0].targetDistanceKm < 30,
    `week one ${beginner.weeks[0].targetDistanceKm} km`);
}

// ─────────────────────────────────────────────────────────────
console.log('\n━━━ VALIDATION REJECTS WHAT A MODEL MIGHT RETURN ━━━');
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
  bad((p) => { p.coachNotes = 'x'.repeat(5000); }, 'over-long coach notes');

  check('refuses something that is not a plan at all', !!validatePlan(null).error);
  check('refuses a plan with no weeks', !!validatePlan({ weeks: [] }).error);
}

// ─────────────────────────────────────────────────────────────
console.log('\n━━━ END TO END, WITH NO MODEL CONFIGURED ━━━');
let planId;
const token = await register('planner');
{
  for (let i = 1; i <= 8; i += 1) {
    await api('/runs', { method: 'POST', token, body: { distanceKm: 6, durationSeconds: 2400, startedAt: new Date(Date.now() - i * 2 * 86400000).toISOString() } });
  }

  const created = await api('/fitness-plans', { method: 'POST', token, body: { goalType: 'race_prep', targetDistanceKm: 21.1, weeklyFrequency: 4, durationWeeks: 8 } });
  planId = created.data.plan?.planId ?? created.data.planId;

  const before = await api('/fitness-plans', { token });
  check('a new plan has no schedule yet', before.data.plan.generationStatus === 'none' && before.data.schedule.length === 0,
    `${before.data.plan.generationStatus}, ${before.data.schedule.length} weeks`);
  check('the API says whether a model is configured', typeof before.data.planGenerationUsesAi === 'boolean');

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
  check('with no model configured it says the plan came from the rules',
    view.data.plan.generatedBy === 'rules', view.data.plan.generatedBy);
  check('the schedule has the weeks', view.data.schedule.length === 8, `${view.data.schedule.length}`);
  check('and the sessions', view.data.schedule.every((w) => w.sessions.length === 4));
  check('there are coach notes', (view.data.plan.coachNotes || '').length > 20);
  check('nothing is marked done yet', view.data.scheduleProgress.completedSessions === 0);
}

// ─────────────────────────────────────────────────────────────
console.log('\n━━━ PLANNED AGAINST ACTUAL ━━━');
{
  const view = await api('/fitness-plans', { token });
  const session = view.data.schedule[0].sessions[0];
  const run = (await api('/runs?limit=1', { token })).data.runs[0];

  check('a session can be ticked off against a run',
    (await api(`/fitness-plans/sessions/${session.sessionId}/complete`, { method: 'PATCH', token, body: { runId: run.runId } })).status === 200);

  const after = await api('/fitness-plans', { token });
  check('progress counts it', after.data.scheduleProgress.completedSessions === 1,
    JSON.stringify(after.data.scheduleProgress));
  check('the session shows which run completed it',
    after.data.schedule[0].sessions[0].completedRun?.runId === run.runId,
    JSON.stringify(after.data.schedule[0].sessions[0].completedRun));

  check('it can be un-ticked',
    (await api(`/fitness-plans/sessions/${session.sessionId}/complete`, { method: 'DELETE', token })).status === 200);
  check('and progress goes back',
    (await api('/fitness-plans', { token })).data.scheduleProgress.completedSessions === 0);

  // Deleting the run must not delete the plan's history with it.
  await api(`/fitness-plans/sessions/${session.sessionId}/complete`, { method: 'PATCH', token, body: { runId: run.runId } });
  await api(`/runs/${run.runId}`, { method: 'DELETE', token });
  const afterDelete = await api('/fitness-plans', { token });
  check('deleting the run un-ticks the session rather than breaking the plan',
    afterDelete.data.schedule.length === 8 && afterDelete.data.schedule[0].sessions[0].completed === false,
    JSON.stringify(afterDelete.data.schedule[0].sessions[0]));

  const stranger = await register('planstranger');
  check("another user cannot tick someone else's session",
    (await api(`/fitness-plans/sessions/${session.sessionId}/complete`, { method: 'PATCH', token: stranger, body: { runId: 1 } })).status === 404);
  check("another user cannot generate someone else's plan",
    (await api(`/fitness-plans/${planId}/generate`, { method: 'POST', token: stranger })).status === 404);
  check('a non-numeric session id is a 400',
    (await api('/fitness-plans/sessions/not-a-number/complete', { method: 'PATCH', token, body: { runId: 1 } })).status === 400);
}

// ─────────────────────────────────────────────────────────────
console.log('\n━━━ THE MODEL PATH, AGAINST A STUB PROVIDER ━━━');
// The service is exercised directly here: the endpoint path is already covered above, and
// what matters now is how the service behaves when a provider misbehaves.
{
  let mode = 'good';
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      if (mode === 'slow') return; // never answers, to exercise the timeout
      if (mode === 'error') { res.writeHead(500).end('{}'); return; }

      const reply =
        mode === 'prose' ? 'Here is your plan! I hope you like it.'
        : mode === 'invalid' ? JSON.stringify({ coachNotes: 'x', weeks: [{ weekNumber: 1, targetDistanceKm: 20, sessions: [{ dayOfWeek: 99, sessionType: 'easy', distanceKm: 5 }] }] })
        : mode === 'fenced' ? '```json\n' + JSON.stringify(aiPlan(4)) + '\n```'
        : JSON.stringify(aiPlan(4));

      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ content: [{ type: 'text', text: reply }] }));
    });
  });
  await new Promise((r) => server.listen(4902, r));

  function aiPlan(weeks) {
    return {
      coachNotes: 'A gentle build with a recovery week.',
      weeks: Array.from({ length: weeks }, (_, i) => ({
        weekNumber: i + 1,
        focus: `Week ${i + 1}`,
        targetDistanceKm: 20 + i * 2,
        sessions: [
          { dayOfWeek: 2, sessionType: 'easy', distanceKm: 5, description: 'Easy.' },
          { dayOfWeek: 4, sessionType: 'tempo', distanceKm: 6, description: 'Tempo.' },
          { dayOfWeek: 7, sessionType: 'long', distanceKm: 9, description: 'Long.' },
        ],
      })),
    };
  }

  process.env.AI_PROVIDER = 'anthropic';
  process.env.AI_API_KEY = 'stub-key';
  process.env.AI_API_URL = 'http://localhost:4902/v1/messages';
  process.env.AI_TIMEOUT_MS = '1500';

  // Imported after the environment is set, since the service reads it at call time.
  const { generatePlan, isAiConfigured } = await import('../control/PlanGenerationService.js');
  const context = { goalType: 'general_fitness', weeklyFrequency: 3, durationWeeks: 4, recentWeeklyKm: 20 };

  check('a configured provider is detected', isAiConfigured() === true);

  mode = 'good';
  const ai = await generatePlan(context);
  check('a good model reply is used', ai.generatedBy === 'ai', JSON.stringify(ai).slice(0, 120));
  check('and its weeks are stored', ai.plan.weeks.length === 4);
  check('and its coach notes come through', ai.plan.coachNotes.includes('gentle build'));

  mode = 'fenced';
  check('JSON wrapped in a code fence is still read', (await generatePlan(context)).generatedBy === 'ai');

  mode = 'prose';
  const prose = await generatePlan(context);
  check('prose instead of JSON falls back to the rules', prose.generatedBy === 'rules', JSON.stringify(prose).slice(0, 100));
  check('and the runner is told why', typeof prose.warning === 'string' && prose.warning.length > 10, prose.warning);
  check('and still gets a usable plan', prose.plan.weeks.length === 4);

  mode = 'invalid';
  const invalid = await generatePlan(context);
  check('a plan that fails validation falls back', invalid.generatedBy === 'rules');
  check('and the fallback is a real plan', invalid.plan.weeks.every((w) => w.sessions.length === 3));

  mode = 'error';
  check('a provider error falls back', (await generatePlan(context)).generatedBy === 'rules');

  mode = 'slow';
  const startedAt = Date.now();
  const slow = await generatePlan(context);
  const waited = Date.now() - startedAt;
  check('a provider that never answers times out and falls back', slow.generatedBy === 'rules');
  check('and does not wait for ever', waited < 4000, `waited ${waited} ms`);

  delete process.env.AI_PROVIDER;
  delete process.env.AI_API_KEY;
  delete process.env.AI_API_URL;
  const { isAiConfigured: recheck } = await import('../control/PlanGenerationService.js?nocache=1');
  check('with no provider set, the app reports no model configured', recheck() === false);

  await new Promise((r) => server.close(r));
}

console.log('\n' + '─'.repeat(70));
console.log(`  ${pass} passed, ${fail} failed`);
if (failures.length) {
  console.log('\nFAILURES:');
  failures.forEach(([l, d]) => console.log(`  • ${l}\n      ${d}`));
}
console.log('─'.repeat(70));
process.exit(fail > 0 ? 1 : 0);
