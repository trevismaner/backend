/**
 * Builds a week-by-week training schedule from arithmetic.
 *
 * This is both the fallback when no language model is configured and the shape every
 * generated plan is validated against. Keeping it is what lets the feature work with no API
 * key at all — the app has to be runnable by someone who has not signed up to anything, the
 * same way the wearable providers stay inert until their credentials exist.
 *
 * The rules are the ordinary ones from distance running, not invented:
 *
 *   - build volume by about 10% a week, which is the long-standing guidance for not
 *     outrunning what tendons and bone adapt to;
 *   - every fourth week is lighter, because adaptation happens during recovery;
 *   - one long run a week, kept to roughly a third of weekly volume;
 *   - taper over the last two weeks of a plan with a target race distance;
 *   - start from what the runner is actually doing, not from zero.
 *
 * Nothing here is medical advice, and the plan is a suggestion a person reviews.
 */

const round1 = (n) => Number(n.toFixed(1));
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

export const SESSION_TYPES = Object.freeze([
  'easy', 'long', 'tempo', 'intervals', 'recovery', 'cross_training', 'rest',
]);

/** Which days to run on, spread so hard days are not back to back. 1 = Monday. */
const DAY_PATTERNS = {
  2: [2, 6],
  3: [2, 4, 6],
  4: [2, 3, 5, 7],
  5: [1, 2, 4, 6, 7],
  6: [1, 2, 3, 5, 6, 7],
  7: [1, 2, 3, 4, 5, 6, 7],
};

/**
 * The volume to start from.
 *
 * A plan that opens well above what someone is already running is the exact pattern the risk
 * score flags, so the first week is anchored to recent history where there is any.
 */
function openingVolume({ recentWeeklyKm, targetDistanceKm, goalType }) {
  if (recentWeeklyKm > 0) return clamp(recentWeeklyKm * 1.05, 5, 120);

  // No history: start modestly, scaled to the goal rather than to nothing.
  if (goalType === 'race_prep' && targetDistanceKm) return clamp(targetDistanceKm * 1.5, 10, 40);
  if (goalType === 'weight_loss') return 12;
  return 15;
}

/**
 * The volume for every week of the plan, in order.
 *
 * Computed as a series rather than week by week, because each week depends on how much
 * *building* has happened before it — not on how many weeks have passed. A recovery week
 * deliberately does not advance the progression: if it did, the week after it would resume
 * from where the curve would have been, which means returning from an easy week straight
 * into a jump of 20% or more on the last real week. That is the exact spike the risk score
 * exists to flag, so a plan should not be built out of them.
 */
function weeklyVolumes({ totalWeeks, opening, isRacePrep }) {
  const buildWeeks = isRacePrep ? Math.max(1, totalWeeks - 2) : totalWeeks;
  const volumes = [];

  let buildStep = 0; // completed 10% increments, not weeks elapsed
  let peak = opening;

  for (let weekNumber = 1; weekNumber <= totalWeeks; weekNumber += 1) {
    if (weekNumber > buildWeeks) {
      // Taper: drop sharply off the peak so the runner arrives fresh rather than tired.
      const intoTaper = weekNumber - buildWeeks;
      volumes.push(peak * (intoTaper === 1 ? 0.65 : 0.45));
      continue;
    }

    // Capped: beyond about twelve increments, flatten off rather than projecting a volume
    // nobody asked for.
    const level = opening * Math.pow(1.1, Math.min(buildStep, 11));

    if (weekNumber % 4 === 0) {
      volumes.push(level * 0.7); // recovery week — and the build does not move on
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

/**
 * Turns a week's volume into individual sessions.
 *
 * The long run takes about a third, the rest is split across the remaining days, and one day
 * becomes quality work once the runner is far enough in to absorb it.
 */
function sessionsFor({ weekVolumeKm, frequency, weekNumber, isRecoveryWeek, isTaper, goalType }) {
  const days = DAY_PATTERNS[clamp(frequency, 2, 7)] ?? DAY_PATTERNS[3];
  const sessions = [];

  const longShare = frequency <= 2 ? 0.45 : 0.35;
  const longKm = round1(weekVolumeKm * longShare);
  const remaining = weekVolumeKm - longKm;
  const otherDays = days.length - 1;
  const easyKm = otherDays > 0 ? round1(remaining / otherDays) : 0;

  // Quality work only once there is a base under it, and never in a recovery or taper week.
  const hasQuality = weekNumber >= 3 && !isRecoveryWeek && !isTaper && frequency >= 3;
  const qualityDay = hasQuality ? days[Math.floor(days.length / 2)] : null;
  const longDay = days[days.length - 1]; // the long run lands on the last day of the pattern

  for (const day of days) {
    if (day === longDay) {
      sessions.push({
        dayOfWeek: day,
        sessionType: 'long',
        distanceKm: longKm,
        description: isTaper
          ? 'Long run, shortened. Comfortable the whole way.'
          : 'Long run at a pace you could hold a conversation at.',
      });
    } else if (day === qualityDay) {
      const isIntervals = goalType === 'race_prep' && weekNumber % 2 === 0;
      sessions.push({
        dayOfWeek: day,
        sessionType: isIntervals ? 'intervals' : 'tempo',
        distanceKm: easyKm,
        description: isIntervals
          ? 'Warm up, then 6 × 400 m hard with 90 seconds easy between. Warm down.'
          : 'Warm up, then 15 minutes at a comfortably hard pace. Warm down.',
      });
    } else {
      sessions.push({
        dayOfWeek: day,
        sessionType: isRecoveryWeek ? 'recovery' : 'easy',
        distanceKm: easyKm,
        description: isRecoveryWeek
          ? 'Easy and short. The point of this week is the recovery.'
          : 'Easy running. If it feels hard, slow down.',
      });
    }
  }

  return sessions.sort((a, b) => a.dayOfWeek - b.dayOfWeek);
}

/**
 * Builds the whole schedule.
 *
 * `recentWeeklyKm` and `riskLevel` come from what the app already knows — the runner's own
 * history and their current risk score — so a plan is anchored to them rather than generic.
 */
export function buildPlan({
  goalType = 'general_fitness',
  targetDistanceKm = null,
  weeklyFrequency = 3,
  durationWeeks = 8,
  recentWeeklyKm = 0,
  riskLevel = null,
} = {}) {
  const totalWeeks = clamp(Math.round(durationWeeks) || 8, 1, 52);
  const frequency = clamp(Math.round(weeklyFrequency) || 3, 2, 7);
  const isRacePrep = goalType === 'race_prep' && totalWeeks >= 4;

  let opening = openingVolume({ recentWeeklyKm, targetDistanceKm, goalType });

  // Someone already flagged as high risk should not be handed a plan that starts by asking
  // for more. Starting below where they are is the whole point of the flag.
  if (riskLevel === 'high') opening *= 0.75;
  else if (riskLevel === 'moderate') opening *= 0.9;

  const volumes = weeklyVolumes({ totalWeeks, opening, isRacePrep });

  const weeks = [];
  for (let weekNumber = 1; weekNumber <= totalWeeks; weekNumber += 1) {
    const isTaper = isRacePrep && weekNumber > totalWeeks - 2;
    const isRecoveryWeek = !isTaper && weekNumber % 4 === 0;
    const volume = round1(volumes[weekNumber - 1]);

    weeks.push({
      weekNumber,
      focus: focusFor({ weekNumber, totalWeeks, isRacePrep, isRecoveryWeek, isTaper }),
      targetDistanceKm: volume,
      notes: null,
      sessions: sessionsFor({
        weekVolumeKm: volume,
        frequency,
        weekNumber,
        isRecoveryWeek,
        isTaper,
        goalType,
      }),
    });
  }

  return {
    weeks,
    coachNotes: coachNotesFor({ goalType, totalWeeks, frequency, riskLevel, opening }),
  };
}

function coachNotesFor({ goalType, totalWeeks, frequency, riskLevel, opening }) {
  const lines = [
    `${totalWeeks} weeks, ${frequency} runs a week, starting at about ${round1(opening)} km in week one.`,
    'Volume rises by roughly 10% a week, with every fourth week lighter so the work has time to settle.',
  ];
  if (goalType === 'race_prep') lines.push('The last two weeks taper, so you arrive rested rather than tired.');
  if (riskLevel === 'high') {
    lines.push('Your risk score is high at the moment, so this plan starts below your recent volume on purpose.');
  } else if (riskLevel === 'moderate') {
    lines.push('Your risk score is moderate, so the first week is a little under where you have been.');
  }
  lines.push('Treat the distances as a guide. If a session feels wrong, run easier or take the day off.');
  return lines.join(' ');
}

/**
 * Checks a schedule — whoever produced it — before it is stored.
 *
 * A language model returns something plausible rather than something guaranteed, so its
 * output is validated exactly as a request body would be. Anything failing this is rejected
 * and the rules-built plan is used instead, which is the difference between a feature that
 * degrades and one that stores nonsense.
 */
export function validatePlan(plan, { durationWeeks } = {}) {
  if (!plan || typeof plan !== 'object') return { error: 'plan must be an object' };
  if (!Array.isArray(plan.weeks) || plan.weeks.length === 0) return { error: 'plan.weeks must be a non-empty array' };
  if (plan.weeks.length > 52) return { error: 'a plan cannot be longer than 52 weeks' };
  if (durationWeeks && plan.weeks.length !== durationWeeks) {
    return { error: `expected ${durationWeeks} weeks, got ${plan.weeks.length}` };
  }

  const seenWeeks = new Set();
  for (const week of plan.weeks) {
    const n = Number(week?.weekNumber);
    if (!Number.isInteger(n) || n < 1 || n > 52) return { error: `bad weekNumber: ${week?.weekNumber}` };
    if (seenWeeks.has(n)) return { error: `week ${n} appears twice` };
    seenWeeks.add(n);

    const target = Number(week.targetDistanceKm);
    if (!Number.isFinite(target) || target < 0 || target > 300) {
      return { error: `week ${n} has an implausible target distance: ${week.targetDistanceKm}` };
    }

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
