import { buildPlan, validatePlan, SESSION_TYPES } from './PlanBuilder.js';

/**
 * Generates a training schedule, with a language model when one is configured and from the
 * built-in rules when not.
 *
 * Built on the same principle as WeatherService: a third party is something that improves the
 * answer, never something the feature depends on. If no key is set, if the provider is down,
 * if it is slow, or if what comes back does not validate, the runner still gets a plan — the
 * rules-built one — and the app records which it was.
 *
 * WHAT IS SENT
 * Derived figures only: weekly volume, run count, goal, duration, and the risk *level*. The
 * runner's name, email, declared conditions and injury descriptions are deliberately not
 * sent. Health details about an identifiable person should not leave the server for a
 * nice-to-have, and nothing in the prompt needs them — "moderate risk" carries the same
 * planning signal as the reasons behind it.
 *
 * CONFIGURE
 *   AI_PROVIDER      'anthropic' | 'openai' | 'none'   (default: none)
 *   AI_API_KEY       the provider key
 *   AI_MODEL         model name; each provider has a sensible default
 *   AI_TIMEOUT_MS    default 20000 — generation runs in the background, so it can wait
 */

const TIMEOUT_MS = Number(process.env.AI_TIMEOUT_MS) || 20000;

const PROVIDERS = {
  anthropic: {
    url: 'https://api.anthropic.com/v1/messages',
    defaultModel: 'claude-sonnet-4-5',
    headers: (key) => ({
      'content-type': 'application/json',
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
    }),
    body: (model, prompt) => ({
      model,
      max_tokens: 4096,
      messages: [{ role: 'user', content: prompt }],
    }),
    extractText: (data) => data?.content?.[0]?.text ?? '',
  },
  openai: {
    url: 'https://api.openai.com/v1/chat/completions',
    defaultModel: 'gpt-4o-mini',
    headers: (key) => ({
      'content-type': 'application/json',
      authorization: `Bearer ${key}`,
    }),
    body: (model, prompt) => ({
      model,
      max_tokens: 4096,
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
    }),
    extractText: (data) => data?.choices?.[0]?.message?.content ?? '',
  },
};

/** Whether a language model is configured. The app is fully usable when this is false. */
export function isAiConfigured() {
  const provider = (process.env.AI_PROVIDER || 'none').toLowerCase();
  return provider !== 'none' && !!PROVIDERS[provider] && !!process.env.AI_API_KEY?.trim();
}

/**
 * The prompt.
 *
 * `context` holds only derived numbers, never free text the runner typed. That is as much a
 * safety property as a privacy one: there is no user-controlled string in the prompt for
 * someone to put instructions into.
 */
function buildPrompt(context) {
  return `You are an experienced running coach writing a training schedule.

Runner:
- Goal: ${context.goalType}
- Target distance: ${context.targetDistanceKm ? `${context.targetDistanceKm} km` : 'not set'}
- Plan length: ${context.durationWeeks} weeks
- Runs per week: ${context.weeklyFrequency}
- Recent volume: ${context.recentWeeklyKm} km per week over the last 4 weeks
- Runs logged in the last 7 days: ${context.last7DaysRuns}
- Current injury-risk level: ${context.riskLevel ?? 'not assessed'}

Rules you must follow:
- Build weekly volume gradually, around 10% per week at most.
- Make every fourth week lighter.
- Exactly ${context.durationWeeks} weeks, numbered 1 to ${context.durationWeeks}.
- Exactly ${context.weeklyFrequency} sessions per week, each on a different day (1 = Monday, 7 = Sunday).
- If the risk level is high, start below their recent volume.
- sessionType must be one of: ${SESSION_TYPES.join(', ')}.
- Distances in kilometres, as numbers.
- Do not give medical advice or diagnose anything.

Reply with JSON only, no prose around it, in exactly this shape:
{
  "coachNotes": "2-4 sentences on the shape of the plan and how to use it",
  "weeks": [
    {
      "weekNumber": 1,
      "focus": "short phrase",
      "targetDistanceKm": 20.0,
      "sessions": [
        { "dayOfWeek": 2, "sessionType": "easy", "distanceKm": 5.0, "description": "one sentence" }
      ]
    }
  ]
}`;
}

/** Pulls the JSON object out of a reply, tolerating a model that wrapped it in prose. */
function parseJsonReply(text) {
  if (typeof text !== 'string' || text.trim() === '') return null;
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start === -1 || end <= start) return null;
  try {
    return JSON.parse(candidate.slice(start, end + 1));
  } catch {
    return null;
  }
}

/** Calls the provider. Returns the parsed object, or null for any failure at all. */
async function callProvider(prompt) {
  const name = (process.env.AI_PROVIDER || 'none').toLowerCase();
  const provider = PROVIDERS[name];
  const key = process.env.AI_API_KEY?.trim();
  if (!provider || !key) return null;

  const model = process.env.AI_MODEL?.trim() || provider.defaultModel;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(process.env.AI_API_URL?.trim() || provider.url, {
      method: 'POST',
      headers: provider.headers(key),
      body: JSON.stringify(provider.body(model, prompt)),
      signal: controller.signal,
    });

    if (!response.ok) {
      // The body can contain the key in an echoed request on some providers, so only the
      // status is logged.
      console.error(`Plan generation: provider returned ${response.status}`);
      return null;
    }

    return parseJsonReply(provider.extractText(await response.json()));
  } catch (err) {
    console.error('Plan generation: provider call failed —', err.name === 'AbortError' ? 'timed out' : err.message);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Produces a schedule for a plan.
 *
 * Always resolves to `{ plan, generatedBy, warning }`:
 *   generatedBy 'ai'    the model produced it and it validated
 *   generatedBy 'rules' the built-in builder produced it, with `warning` saying why
 *
 * It never throws and never returns nothing — a runner asking for a plan gets a plan.
 */
export async function generatePlan(context) {
  const fallback = () => buildPlan(context);

  if (!isAiConfigured()) {
    return {
      plan: fallback(),
      generatedBy: 'rules',
      warning: null, // not having a model configured is a normal state, not a failure
    };
  }

  const raw = await callProvider(buildPrompt(context));
  if (!raw) {
    return { plan: fallback(), generatedBy: 'rules', warning: 'The planner was unavailable, so this plan was built from the standard progression rules.' };
  }

  // Validated exactly as a request body would be. A plausible-looking answer is not the same
  // as a usable one, and an unchecked model response is just untrusted input.
  const checked = validatePlan(raw, { durationWeeks: context.durationWeeks });
  if (checked.error) {
    console.error('Plan generation: model output rejected —', checked.error);
    return { plan: fallback(), generatedBy: 'rules', warning: 'The generated plan did not look right, so the standard progression was used instead.' };
  }

  return { plan: checked.value, generatedBy: 'ai', warning: null };
}
