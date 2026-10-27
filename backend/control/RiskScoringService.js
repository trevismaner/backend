/**
 * Rules-based risk scoring (RU-10, RU-11).
 *
 * The schema is shaped for an external model — ml_base_score plus three modifiers — so this
 * fills that shape in Node rather than requiring the separate Python service to be running.
 * Everything below is a transparent rule over data the app already has, which is why each
 * score can explain itself through contributing_factors.
 *
 * To swap in the real AI service later, replace computeBaseScore() with the HTTP call and
 * keep the modifiers: the stored columns and the response shape do not change.
 *
 * NOT a medical assessment — it flags training-load patterns, nothing more.
 */

const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const round2 = (n) => Number(n.toFixed(2));

// Conditions that make hard training riskier, and roughly how much.
const CONDITION_WEIGHTS = {
  asthma: 6,
  hypertension: 5,
  diabetes: 5,
  knee_arthritis: 7,
};

/**
 * Acute:chronic workload — this week against the recent weekly average.
 * Sports-science rule of thumb: much above 1.5 is where injury risk climbs.
 */
function loadRatioPenalty(last7Km, previous28Km) {
  const chronicWeekly = previous28Km / 4;
  if (chronicWeekly <= 0) {
    // No history to compare against: a big first week is still worth flagging.
    return { ratio: null, penalty: last7Km > 30 ? 12 : last7Km > 15 ? 6 : 0 };
  }
  const ratio = last7Km / chronicWeekly;
  let penalty = 0;
  if (ratio > 1.5) penalty = 22;
  else if (ratio > 1.3) penalty = 14;
  else if (ratio > 1.1) penalty = 7;
  else if (ratio < 0.5) penalty = 4; // detraining is its own small risk
  return { ratio: Number(ratio.toFixed(2)), penalty };
}

/**
 * The "ML" stand-in: training load, soreness and unresolved injuries, 0-100.
 */
export function computeBaseScore({ form, runStats }) {
  const soreness = form.selfRatedSoreness ?? 3;
  const injuries = Array.isArray(form.pastInjuries) ? form.pastInjuries : [];
  const unresolved = injuries.filter((i) => i && i.resolved === false).length;

  const load = loadRatioPenalty(runStats.last7DaysKm, runStats.previous28DaysKm);

  // Soreness dominates at the top of the scale: 1-3 is noise, 8+ is a real signal.
  const sorenessPenalty = soreness <= 3 ? 0 : (soreness - 3) * 4.2;
  const injuryPenalty = unresolved * 11;
  const frequencyPenalty = runStats.last7DaysRuns >= 6 ? 8 : runStats.last7DaysRuns >= 5 ? 4 : 0;

  const base = clamp(12 + load.penalty + sorenessPenalty + injuryPenalty + frequencyPenalty, 0, 100);

  return {
    base: round2(base),
    parts: {
      loadPenalty: load.penalty,
      acuteChronicRatio: load.ratio,
      sorenessPenalty: round2(sorenessPenalty),
      injuryPenalty,
      frequencyPenalty,
      unresolvedInjuries: unresolved,
    },
  };
}

/**
 * Weather modifier fallback. Live conditions come from WeatherService (Open-Meteo); this
 * standing allowance is what gets used when that service cannot be reached, so a risk score
 * never fails because a third party is down.
 */
export function computeWeatherModifier() {
  return { value: 4, note: 'Standing allowance for hot, humid conditions' };
}

// Biometric modifier from heart-rate drift: rising average HR at similar paces = fatigue.
export function computeBiometricModifier({ runStats }) {
  const recent = runStats.recentAvgHeartRate;
  const baseline = runStats.baselineAvgHeartRate;
  if (recent == null || baseline == null) {
    return { value: 0, note: 'No heart-rate data available' };
  }
  const drift = recent - baseline;
  if (drift >= 8) return { value: 7, note: `Average heart rate up ${Math.round(drift)} bpm on recent runs` };
  if (drift >= 4) return { value: 4, note: `Average heart rate up ${Math.round(drift)} bpm on recent runs` };
  if (drift <= -4) return { value: -2, note: 'Average heart rate trending down — recovering well' };
  return { value: 0, note: 'Heart rate steady' };
}

// Health modifier: current illness plus any chronic conditions declared on the form.
export function computeHealthModifier({ form }) {
  const conditions = Array.isArray(form.chronicConditions) ? form.chronicConditions : [];
  const conditionScore = conditions.reduce((sum, c) => sum + (CONDITION_WEIGHTS[c] ?? 4), 0);
  const sickScore = form.isCurrentlySick ? 18 : 0;
  const notes = [];
  if (form.isCurrentlySick) notes.push('currently unwell');
  if (conditions.length) notes.push(conditions.join(', ').replace(/_/g, ' '));
  return { value: round2(conditionScore + sickScore), note: notes.join(' · ') || 'No declared conditions' };
}

function levelFor(score) {
  if (score >= 70) return 'high';
  if (score >= 40) return 'moderate';
  return 'low';
}

// Normalised weights, so the UI can show what drove the score.
function contributingFactors(parts, weather, biometric, health) {
  const raw = {
    weekly_load: Math.max(parts.loadPenalty, 0),
    self_rated_soreness: parts.sorenessPenalty,
    unresolved_injuries: parts.injuryPenalty,
    run_frequency: parts.frequencyPenalty,
    health_conditions: Math.max(health, 0),
    heat_and_humidity: Math.max(weather, 0),
    heart_rate_trend: Math.max(biometric, 0),
  };
  const total = Object.values(raw).reduce((a, b) => a + b, 0);
  if (total === 0) return { baseline: 1 };
  return Object.fromEntries(
    Object.entries(raw)
      .filter(([, v]) => v > 0)
      .map(([k, v]) => [k, Number((v / total).toFixed(2))])
  );
}

function recommendationFor(level, parts, form) {
  if (form.isCurrentlySick) {
    return 'Skip training while you are unwell. Illness plus training load is how easy weeks turn into lost months — rest and reassess in 48 hours.';
  }
  if (level === 'high') {
    if (parts.unresolvedInjuries > 0) {
      return 'Rest today. An unresolved injury alongside this training load is the pattern that turns a niggle into a long layoff. Get it looked at before your next hard session.';
    }
    return 'Take a rest day. Your recent load has climbed sharply relative to what you have been doing, and the soreness score backs that up.';
  }
  if (level === 'moderate') {
    if (parts.acuteChronicRatio && parts.acuteChronicRatio > 1.3) {
      return 'Cut today’s distance by about a third and keep the effort easy. Your weekly load is well above your recent average — hold it steady for a week before building again.';
    }
    return 'Fine to run, but keep it easy and skip the speed work. Reassess tomorrow if the soreness has not settled.';
  }
  return 'Low risk. Your load and recovery signals look balanced — go ahead with your planned session.';
}

/**
 * Scores one submitted form against the user's recent running.
 * Returns exactly the columns risk_scores stores.
 */
export function scoreRisk({ form, runStats, weather: liveWeather = null }) {
  const { base, parts } = computeBaseScore({ form, runStats });
  // liveWeather comes from WeatherService when the lookup succeeded.
  const weather = liveWeather ?? computeWeatherModifier();
  const biometric = computeBiometricModifier({ runStats });
  const health = computeHealthModifier({ form });

  const final = round2(clamp(base + weather.value + biometric.value + health.value, 0, 100));
  const level = levelFor(final);

  return {
    mlBaseScore: base,
    weatherModifier: weather.value,
    biometricModifier: biometric.value,
    healthConditionModifier: health.value,
    finalScore: final,
    riskLevel: level,
    contributingFactors: contributingFactors(parts, weather.value, biometric.value, health.value),
    recommendation: recommendationFor(level, parts, form),
    // Kept alongside the score so the UI can explain the modifiers in words.
    explanation: {
      acuteChronicRatio: parts.acuteChronicRatio,
      unresolvedInjuries: parts.unresolvedInjuries,
      weatherNote: weather.note,
      weatherIsLive: weather.live === true,
      biometricNote: biometric.note,
      healthNote: health.note,
    },
  };
}
