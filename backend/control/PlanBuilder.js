/**
 * Builds a week-by-week training schedule from standard coaching heuristics, shaped by the
 * runner's LEVEL. A rule-based expert system — deterministic, testable, explainable.
 *
 * PROVENANCE OF EVERY NUMBER
 * Each constant is either a named, standard coaching heuristic or genuinely evidence-backed.
 * None is an arbitrary figure. Where a heuristic's evidence is weak or contested, that is said
 * so plainly — it is still a recognised standard, not an invention.
 *
 *   WEEKLY_BUILD 1.10   — the "10% rule" (increase weekly volume ~10%). A widely taught
 *                         standard, but its injury-prevention evidence is CONTESTED (an RCT
 *                         found no benefit). Used as a conventional default, not as proven.
 *   CUTBACK_EVERY 4     — a lighter "down" week every 4th week: standard periodisation, on the
 *     CUTBACK_FACTOR      principle that adaptation happens during recovery. ~30% lighter is the
 *                         usual magnitude.
 *   LONG_RUN_SHARE 0.33 — the long run as about a third of weekly volume: standard coaching
 *                         guidance; a long run beyond ~a third of the week is discouraged.
 *   TAPER 0.60, 0.50    — a ~2-week taper reducing volume ~40-50% while keeping intensity:
 *                         EVIDENCE-BACKED (systematic review + meta-analysis: tapering reliably
 *                         improves endurance performance).
 *   beginner run-walk,  — EVIDENCE-BACKED easing-in: novice runners are injured ~2.3x more than
 *   fewer days, no        experienced ones (Videbaek et al. 2015), and run-walk starts are the
 *   early quality         standard beginner method (Couch-to-5K / Galloway).
 *   SPIKE_LIMIT 1.5     — validation flags a weekly jump over 1.5x the prior peak: the
 *                         acute:chronic workload "danger" line (a common, though contested,
 *                         benchmark).
 *   NO_HISTORY_START 12 — a deliberately conservative starting volume when nothing is known;
 *                         a convention, kept low on the safe side.
 *   high-risk start     — the first week is a standard cutback (CUTBACK_FACTOR), reusing an
 *                         existing standard rather than inventing a risk multiplier.
 *
 * Nothing here is medical advice, and the plan is a suggestion a person reviews.
 */

const round1 = (n) => Number(n.toFixed(1));
const round2 = (n) => Number(n.toFixed(2));
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

export const SESSION_TYPES = Object.freeze([
  'easy', 'long', 'tempo', 'intervals', 'recovery', 'cross_training', 'rest',
]);

// Standard / evidence-backed constants (see PROVENANCE above).
const WEEKLY_BUILD = 1.10;
const CUTBACK_EVERY = 4;
const CUTBACK_FACTOR = 0.70;
const LONG_RUN_SHARE = 0.33;
const LONG_RUN_SHARE_2DAY = 0.50; // a 2-run week splits evenly-ish — a practical choice, noted
const TAPER = Object.freeze([0.60, 0.50]); // second-to-last, last week
const SPIKE_LIMIT = 1.5;
const NO_HISTORY_START = 12;

/**
 * What the LEVEL changes. Only differences with a standard basis are here: how many days a
 * week (beginners run fewer), how much quality work (built up as a runner advances), and
 * whether to start with run-walk. The build rate, cutback cadence and long-run share are the
 * SAME for everyone, because no standard sets those differently by level.
 */
export const LEVEL_PROFILES = Object.freeze({
  beginner: { maxFrequency: 3, qualityPerWeek: 0, startQualityWeek: Infinity, runWalkWeeks: 3 },
  intermediate: { maxFrequency: 5, qualityPerWeek: 1, startQualityWeek: 3, runWalkWeeks: 0 },
  advanced: { maxFrequency: 6, qualityPerWeek: 2, startQualityWeek: 2, runWalkWeeks: 0 },
});

const profileFor = (level) => LEVEL_PROFILES[level] ?? LEVEL_PROFILES.intermediate;

/** Which days to run on, spread so hard days are not back to back. 1 = Monday. */
const DAY_PATTERNS = {
  2: [2, 6],
  3: [2, 4, 6],
  4: [2, 3, 5, 7],
  5: [1, 2, 4, 6, 7],
  6: [1, 2, 3, 5, 6, 7],
  7: [1, 2, 3, 4, 5, 6, 7],
};

/** Start where the runner already is (no increase in week one); conservative default if new. */
function openingVolume({ recentWeeklyKm }) {
  if (recentWeeklyKm > 0) return clamp(recentWeeklyKm, 5, 120);
  return NO_HISTORY_START;
}

/**
 * The volume for every week. Build ~10% on a normal week; every 4th week is a ~30% lighter
 * cutback and the build pauses across it (so the week after returns to the prior level, not a
 * leap past it); a race plan tapers over the last two weeks. A high-risk runner's first week
 * is itself a cutback.
 */
function weeklyVolumes({ totalWeeks, opening, isRacePrep, firstWeekCutback }) {
  const buildWeeks = isRacePrep ? Math.max(1, totalWeeks - TAPER.length) : totalWeeks;
  const volumes = [];

  let buildStep = 0;
  let peak = opening;

  for (let weekNumber = 1; weekNumber <= totalWeeks; weekNumber += 1) {
    if (weekNumber > buildWeeks) {
      const intoTaper = weekNumber - buildWeeks; // 1-based
      volumes.push(peak * (TAPER[intoTaper - 1] ?? TAPER[TAPER.length - 1]));
      continue;
    }

    // A high-risk runner opens with a lighter week (a standard cutback), then builds.
    if (weekNumber === 1 && firstWeekCutback) {
      volumes.push(opening * CUTBACK_FACTOR);
      continue; // build does not advance
    }

    const level = opening * Math.pow(WEEKLY_BUILD, Math.min(buildStep, 11));

    if (weekNumber % CUTBACK_EVERY === 0) {
      volumes.push(level * CUTBACK_FACTOR); // cutback week — build does not move on
    } else {
      volumes.push(level);
      peak = Math.max(peak, level);
      buildStep += 1;
    }
  }

  return volumes;
}

function focusFor({ weekNumber, totalWeeks, isRacePrep, isRecoveryWeek, isTaper }) {
  if (isTaper) return 'Taper — stay sharp, arrive fresh';
  if (isRecoveryWeek) return 'Recovery week — let the work settle';
  if (weekNumber === 1) return 'Settling in — find a rhythm you can repeat';
  if (isRacePrep && weekNumber > totalWeeks * 0.6) return 'Race specific — practise the pace';
  return 'Building — a little more than last week';
}

/** Pick up to `count` quality days from the run days, spaced so they are not back to back. */
function pickQualityDays(days, count) {
  if (count <= 0 || days.length < 3) return new Set();
  const candidates = days.slice(0, -1); // never the long-run day
  const picked = new Set();
  if (count >= 1) picked.add(candidates[Math.floor(candidates.length / 2)]);
  if (count >= 2) picked.add(candidates[0]);
  return picked;
}

/** Turns a week's volume into individual sessions, shaped by level. */
function sessionsFor({ weekVolumeKm, frequency, weekNumber, isRecoveryWeek, isTaper, goalType, profile, paces }) {
  const days = DAY_PATTERNS[clamp(frequency, 2, 7)] ?? DAY_PATTERNS[3];
  const sessions = [];

  const longShare = frequency <= 2 ? LONG_RUN_SHARE_2DAY : LONG_RUN_SHARE;
  const longKm = round1(weekVolumeKm * longShare);
  const remaining = weekVolumeKm - longKm;
  const otherDays = days.length - 1;
  const easyKm = otherDays > 0 ? round1(remaining / otherDays) : 0;

  const qualityOn = weekNumber >= profile.startQualityWeek && !isRecoveryWeek && !isTaper;
  const qualityDays = qualityOn ? pickQualityDays(days, profile.qualityPerWeek) : new Set();
  const longDay = days[days.length - 1];
  const isRunWalk = weekNumber <= profile.runWalkWeeks;

  const withPace = (session, type) => (paces && paces[type] != null
    ? { ...session, targetPaceMinPerKm: round2(paces[type]) }
    : session);

  let qualityUsed = 0;
  for (const day of days) {
    if (day === longDay) {
      sessions.push(withPace({
        dayOfWeek: day,
        sessionType: 'long',
        distanceKm: longKm,
        description: isTaper
          ? 'Long run, shortened. Comfortable the whole way.'
          : isRunWalk
            ? 'Long effort with walk breaks — run a few minutes, walk a minute, repeat.'
            : 'Long run at a pace you could hold a conversation at.',
      }, 'long'));
    } else if (qualityDays.has(day)) {
      const isIntervals = (goalType === 'race_prep' || profile.qualityPerWeek >= 2)
        ? qualityUsed % 2 === 0
        : false;
      qualityUsed += 1;
      sessions.push(withPace({
        dayOfWeek: day,
        sessionType: isIntervals ? 'intervals' : 'tempo',
        distanceKm: easyKm,
        description: isIntervals
          ? 'Warm up, then 6 × 400 m hard with 90 seconds easy between. Warm down.'
          : 'Warm up, then 15 minutes at a comfortably hard pace. Warm down.',
      }, isIntervals ? 'intervals' : 'tempo'));
    } else {
      sessions.push(withPace({
        dayOfWeek: day,
        sessionType: isRecoveryWeek ? 'recovery' : 'easy',
        distanceKm: easyKm,
        description: isRecoveryWeek
          ? 'Easy and short. The point of this week is the recovery.'
          : isRunWalk
            ? 'Run-walk: alternate 1 minute running, 1 minute walking, for the distance.'
            : 'Easy running. If it feels hard, slow down.',
      }, 'easy'));
    }
  }

  return sessions.sort((a, b) => a.dayOfWeek - b.dayOfWeek);
}

/**
 * Builds the whole schedule. `level` comes from the classifier, `recentWeeklyKm` and
 * `riskLevel` from what the app already knows, `paces` (optional) from the fitness estimate.
 */
export function buildPlan({
  goalType = 'general_fitness',
  targetDistanceKm = null,
  weeklyFrequency = 3,
  durationWeeks = 8,
  recentWeeklyKm = 0,
  riskLevel = null,
  level = 'intermediate',
  paces = null,
} = {}) {
  const profile = profileFor(level);
  const totalWeeks = clamp(Math.round(durationWeeks) || 8, 1, 52);
  // Requested frequency is capped by level; a high-risk runner drops a day.
  let frequency = clamp(Math.round(weeklyFrequency) || 3, 2, profile.maxFrequency);
  if (riskLevel === 'high') frequency = clamp(frequency - 1, 2, profile.maxFrequency);

  const isRacePrep = goalType === 'race_prep' && totalWeeks >= 4;
  const opening = openingVolume({ recentWeeklyKm });

  const volumes = weeklyVolumes({
    totalWeeks,
    opening,
    isRacePrep,
    firstWeekCutback: riskLevel === 'high',
  });

  const weeks = [];
  for (let weekNumber = 1; weekNumber <= totalWeeks; weekNumber += 1) {
    const isTaper = isRacePrep && weekNumber > totalWeeks - TAPER.length;
    const isRecoveryWeek = !isTaper && weekNumber % CUTBACK_EVERY === 0;
    const volume = round1(volumes[weekNumber - 1]);

    weeks.push({
      weekNumber,
      focus: focusFor({ weekNumber, totalWeeks, isRacePrep, isRecoveryWeek, isTaper }),
      targetDistanceKm: volume,
      notes: null,
      sessions: sessionsFor({
        weekVolumeKm: volume, frequency, weekNumber, isRecoveryWeek, isTaper, goalType, profile, paces,
      }),
    });
  }

  return {
    weeks,
    level,
    coachNotes: coachNotesFor({ goalType, totalWeeks, frequency, riskLevel, opening, level }),
  };
}

function coachNotesFor({ goalType, totalWeeks, frequency, riskLevel, opening, level }) {
  const lines = [
    `A ${level} plan: ${totalWeeks} weeks, ${frequency} runs a week, starting at about ${round1(opening)} km in week one.`,
    'Volume rises by roughly 10% a week, with every fourth week lighter so the work has time to settle.',
  ];
  if (level === 'beginner') lines.push('Early weeks use run-walk — running a few minutes, then walking — to ease your body in.');
  if (goalType === 'race_prep') lines.push('The last two weeks taper, so you arrive rested rather than tired.');
  if (riskLevel === 'high') {
    lines.push('Your risk score is high at the moment, so this plan opens with a lighter week and one fewer run.');
  } else if (riskLevel === 'moderate') {
    lines.push('Your risk score is moderate, so week one holds at your recent volume rather than adding to it.');
  }
  lines.push('Treat the distances as a guide. If a session feels wrong, run easier or take the day off.');
  return lines.join(' ');
}

/**
 * Checks a schedule before it is stored. The rule builder already produces safe plans, but a
 * stored or hand-edited plan is validated the same way — including a progression guard: a new
 * peak over 1.5x the previous peak (the acute:chronic "danger" line) is rejected.
 */
export function validatePlan(plan, { durationWeeks } = {}) {
  if (!plan || typeof plan !== 'object') return { error: 'plan must be an object' };
  if (!Array.isArray(plan.weeks) || plan.weeks.length === 0) return { error: 'plan.weeks must be a non-empty array' };
  if (plan.weeks.length > 52) return { error: 'a plan cannot be longer than 52 weeks' };
  if (durationWeeks && plan.weeks.length !== durationWeeks) {
    return { error: `expected ${durationWeeks} weeks, got ${plan.weeks.length}` };
  }

  const seenWeeks = new Set();
  let peak = 0;
  for (const week of plan.weeks) {
    const n = Number(week?.weekNumber);
    if (!Number.isInteger(n) || n < 1 || n > 52) return { error: `bad weekNumber: ${week?.weekNumber}` };
    if (seenWeeks.has(n)) return { error: `week ${n} appears twice` };
    seenWeeks.add(n);

    const target = Number(week.targetDistanceKm);
    if (!Number.isFinite(target) || target < 0 || target > 300) {
      return { error: `week ${n} has an implausible target distance: ${week.targetDistanceKm}` };
    }
    if (peak > 0 && target > peak * SPIKE_LIMIT) {
      return { error: `week ${n} jumps volume from a peak of ${peak} to ${target} km (too steep)` };
    }
    peak = Math.max(peak, target);

    if (!Array.isArray(week.sessions) || week.sessions.length === 0) {
      return { error: `week ${n} has no sessions` };
    }
    if (week.sessions.length > 7) return { error: `week ${n} has more than seven sessions` };

    const seenDays = new Set();
    for (const session of week.sessions) {
      const day = Number(session?.dayOfWeek);
      if (!Number.isInteger(day) || day < 1 || day > 7) {
        return { error: `week ${n} has a session on day ${session?.dayOfWeek}` };
      }
      if (seenDays.has(day)) return { error: `week ${n} has two sessions on day ${day}` };
      seenDays.add(day);

      if (!SESSION_TYPES.includes(session.sessionType)) {
        return { error: `week ${n} day ${day} has an unknown session type: ${session.sessionType}` };
      }
      if (session.distanceKm !== null && session.distanceKm !== undefined) {
        const km = Number(session.distanceKm);
        if (!Number.isFinite(km) || km < 0 || km > 100) {
          return { error: `week ${n} day ${day} has an implausible distance: ${session.distanceKm}` };
        }
      }
      if (typeof session.description === 'string' && session.description.length > 500) {
        return { error: `week ${n} day ${day} has an over-long description` };
      }
    }
  }

  if (plan.coachNotes != null && typeof plan.coachNotes !== 'string') {
    return { error: 'coachNotes must be text' };
  }
  if (typeof plan.coachNotes === 'string' && plan.coachNotes.length > 4000) {
    return { error: 'coachNotes is too long' };
  }

  return { value: plan };
}
