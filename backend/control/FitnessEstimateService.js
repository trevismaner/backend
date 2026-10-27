/**
 * The fitness estimate AI.
 *
 * WHAT IT ESTIMATES
 * How many beats per minute below a typical runner someone sits, at the same pace and
 * distance. Lower heart rate for the same work means fitter, so that gap — the "offset" — is
 * the fitness signal. It is turned into a friendly 0-100 score for display, and into training
 * paces for the planner.
 *
 * HOW IT WORKS
 * Two pieces, both from RunLeague_Fitness_Estimate_AI.ipynb:
 *
 *   1. A line fitted once across all runners:  hr ~= a + b*pace + c*distance
 *      This is "the average runner". Distance is in there because heart rate drifts upward on
 *      longer runs at the same pace (cardiac drift), so without it every long run would look
 *      like a loss of fitness.
 *
 *   2. A Kalman filter per runner, tracking their offset from that line, updated run by run.
 *      Fitness genuinely changes, so a single number computed once and frozen goes stale; and
 *      a single run is noisy — heat, sleep, caffeine, a hill — so reacting fully to each run
 *      is worse than useless. A Kalman filter is exactly the tool for "a quantity that drifts,
 *      measured noisily": Q says how fast fitness really moves, R how noisy one run is, and
 *      the filter weighs new evidence against the current estimate accordingly.
 *
 * WHY NOT PYTHON
 * Unlike the level classifier, there is no trained artefact here beyond seven numbers. The
 * filter is four lines of arithmetic. Shipping a Python service to run it would be all cost
 * and no benefit, so the fitted settings live in SETTINGS below and this runs natively.
 *
 * WHAT THE NOTEBOOK MEASURED (128 test users the model never saw, mean absolute error in bpm)
 *
 *   Average runner, ignoring the person   11.44 +/- 0.49
 *   Frozen after warm-up                   8.67 +/- 0.34
 *   Moving average (gain 0.15)             7.15 +/- 0.24
 *   Kalman filter (Q 4.0)                  7.15 +/- 0.24
 *
 * So personalising is worth about 4.3 bpm over treating everyone the same, and continuing to
 * update is worth about 1.5 bpm over estimating once and stopping. The moving average ties
 * the Kalman filter on this measure; the filter is used anyway because of the warm-up result:
 * frozen estimates need 10 runs to reach 8.34 bpm, while the filter sits at 7.22 bpm whether
 * it starts from 1 run or 10. It corrects a rough start on its own, so the app does not have
 * to make someone log five runs before it will say anything.
 */

/**
 * Fitted on the tuning users and tuned on them; never on the test users. Produced by
 * section 9 of the notebook — these are its output verbatim, not re-derived here.
 */
export const SETTINGS = Object.freeze({
  line: Object.freeze({ intercept: 173.065, paceCoef: -3.993, distanceCoef: -0.076 }),
  kalman: Object.freeze({ Q: 4.0, R: 178.4, P0: 1000.0 }),
  warmupRuns: 5,
  reference: Object.freeze({ hr: 150.0, distanceKm: 10.0 }),
  displayScoreSpanBpm: 35.0,
});

/** Paces outside this are not running, and a fitted line extrapolated there is meaningless. */
const PACE_BOUNDS = Object.freeze({ min: 2.75, max: 12.0 });

/** Heart rates outside this are a sensor fault, not a person. */
const HR_BOUNDS = Object.freeze({ min: 60, max: 220 });

const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

/** What the average runner's heart rate would be for this pace and distance. */
export function typicalHeartRate(paceMinPerKm, distanceKm) {
  const { intercept, paceCoef, distanceCoef } = SETTINGS.line;
  return intercept + paceCoef * paceMinPerKm + distanceCoef * distanceKm;
}

/**
 * Keeps only runs that can carry the signal.
 *
 * A run with no heart rate says nothing about fitness — most of the app's runs are like that,
 * since it needs a wearable — and a run at an impossible pace is a data-entry error rather
 * than a performance. Both are dropped rather than being fed to the filter, because the
 * filter has no way to tell a bad measurement from a real change in fitness.
 */
export function usableRuns(runs) {
  if (!Array.isArray(runs)) return [];
  return runs
    .map((run) => {
      const distanceKm = Number(run?.distanceKm ?? run?.distance_km);
      const durationSeconds = Number(run?.durationSeconds ?? run?.duration_seconds);
      const avgHeartRate = Number(run?.avgHeartRate ?? run?.avg_heart_rate);
      const startedAt = run?.startedAt ?? run?.started_at ?? null;

      if (!Number.isFinite(distanceKm) || distanceKm <= 0) return null;
      if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) return null;
      if (!Number.isFinite(avgHeartRate)) return null;
      if (avgHeartRate < HR_BOUNDS.min || avgHeartRate > HR_BOUNDS.max) return null;

      const paceMinPerKm = durationSeconds / 60 / distanceKm;
      if (paceMinPerKm < PACE_BOUNDS.min || paceMinPerKm > PACE_BOUNDS.max) return null;

      return { distanceKm, paceMinPerKm, avgHeartRate, startedAt };
    })
    .filter(Boolean);
}

/**
 * Runs the filter over a runner's history, oldest first, and returns the current estimate.
 *
 * The state is one number — the offset in bpm — with P its variance. Each run: let the
 * uncertainty grow a little (fitness may have moved since the last run), compare the measured
 * heart rate against what the line predicts, and pull the estimate towards the difference by
 * the Kalman gain. A high gain means "trust this run"; a low one, "trust what we already
 * knew".
 *
 * Returns null when there is nothing usable to go on, rather than a confident zero: no data
 * is not the same as average fitness, and the difference matters to the caller.
 */
export function estimateOffset(runs) {
  const usable = usableRuns(runs);
  if (usable.length === 0) return null;

  const { Q, R, P0 } = SETTINGS.kalman;

  // The opening estimate is the MEAN residual over the first `warmupRuns` runs, matching the
  // notebook's `replay_user`. Not the first run alone: one run is noisy enough that starting
  // from it hands the filter a worse opening guess than it needs to have. Those same runs are
  // then replayed through the filter below, exactly as the notebook does — they are used both
  // to seed the estimate and to update it.
  //
  // P0 is deliberately huge, so the filter treats even that seed as nearly worthless and lets
  // the first few updates overwrite it. That is why the warm-up size barely matters: the
  // notebook measured 7.22 bpm whether it started from 1 run or 10.
  const warmup = usable.slice(0, Math.min(SETTINGS.warmupRuns, usable.length));
  const seed = warmup.reduce(
    (sum, run) => sum + (run.avgHeartRate - typicalHeartRate(run.paceMinPerKm, run.distanceKm)),
    0
  ) / warmup.length;

  let offset = seed;
  let P = P0;

  const history = [];
  for (const run of usable) {
    // Predict: the offset itself does not drift in any known direction, so only the
    // uncertainty grows.
    P += Q;

    // Update.
    const predicted = typicalHeartRate(run.paceMinPerKm, run.distanceKm) + offset;
    const residual = run.avgHeartRate - predicted;
    const gain = P / (P + R);
    offset += gain * residual;
    P *= 1 - gain;

    history.push({
      startedAt: run.startedAt,
      offset: Number(offset.toFixed(2)),
      score: displayScore(offset),
    });
  }

  return { offset, variance: P, runsUsed: usable.length, history };
}

/**
 * The 0-100 number a runner sees. Higher is fitter.
 *
 * The raw offset is in bpm and signed the unhelpful way round — negative means fitter, which
 * nobody would guess. This flips it and maps +/- the span onto 0-100. The span is 35 bpm,
 * which the notebook found puts the 5th percentile near 24 and the 95th near 69: most people
 * land in a middle band that leaves room to improve, rather than everyone clustering at 50 or
 * pinning at the ends.
 */
export function displayScore(offsetBpm) {
  const span = SETTINGS.displayScoreSpanBpm;
  return Math.round(clamp(50 - (offsetBpm / span) * 50, 0, 100));
}

/**
 * The pace this runner would hold at the reference heart rate.
 *
 * Rearranges the fitted line for pace, which is what makes the estimate useful rather than
 * merely interesting: it converts "you are 9 bpm below typical" into a number of minutes per
 * kilometre. Clamped to real running paces, because the line is linear and extrapolates to
 * nonsense at the extremes.
 */
export function paceAtReference(offsetBpm, { hr = SETTINGS.reference.hr, distanceKm = SETTINGS.reference.distanceKm } = {}) {
  const { intercept, paceCoef, distanceCoef } = SETTINGS.line;
  const pace = (hr - offsetBpm - intercept - distanceCoef * distanceKm) / paceCoef;
  return Number(clamp(pace, PACE_BOUNDS.min, PACE_BOUNDS.max).toFixed(2));
}

/**
 * Training paces derived from the estimate.
 *
 * The deltas are the notebook's (section 8): easy and long slower than the reference pace,
 * tempo and intervals faster. They are conventional coaching spacing, anchored on a pace this
 * runner can actually hold rather than on a percentage of a race time they may never have run.
 *
 * ONE DELIBERATE DEVIATION FROM THE NOTEBOOK: each pace is clamped to the realistic range,
 * not just the base. The notebook clamps only `pace_at_ref`, which is fine for analysis but
 * would show a very fit runner an interval pace of 1.95 min/km — faster than any human has
 * ever run — because the base had already been clamped at the floor before the delta was
 * subtracted. Clamping afterwards collapses the paces together at the extremes instead, which
 * is wrong in a way the runner can see and ignore, rather than wrong in a way that looks
 * authoritative.
 */
export function trainingPaces(offsetBpm) {
  const base = paceAtReference(offsetBpm);
  const shift = (delta) => Number(clamp(base + delta, PACE_BOUNDS.min, PACE_BOUNDS.max).toFixed(2));
  return {
    easy: shift(0.6),
    long: shift(0.5),
    tempo: shift(-0.4),
    intervals: shift(-0.8),
  };
}

/**
 * The whole estimate for one runner, ready to serve.
 *
 * `confident` is the honest part of this. The filter produces a number from a single run, and
 * that number is worth much less than one built from ten — so the count and the flag travel
 * with it, and the app can present an early estimate as provisional instead of as a verdict.
 */
export function estimateFitness(runs) {
  const estimate = estimateOffset(runs);

  if (!estimate) {
    return {
      available: false,
      reason: 'No runs with heart-rate data yet. Connect a wearable, or record a run with heart rate, to see your fitness estimate.',
      runsUsed: 0,
      score: null,
      offsetBpm: null,
      paces: null,
      confident: false,
      history: [],
    };
  }

  const { offset, runsUsed, history } = estimate;
  return {
    available: true,
    reason: null,
    runsUsed,
    confident: runsUsed >= SETTINGS.warmupRuns,
    score: displayScore(offset),
    offsetBpm: Number(offset.toFixed(2)),
    referencePaceMinPerKm: paceAtReference(offset),
    referenceHeartRate: SETTINGS.reference.hr,
    paces: trainingPaces(offset),
    // Enough to draw a trend line without shipping every run back.
    history: history.slice(-30),
  };
}
