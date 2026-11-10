/**
 * Estimating the energy cost of a run.
 *
 * The figure comes from the oxygen cost of running, which is close to 1.03 kcal per
 * kilogram of body mass per kilometre. The useful property is that for *running* this is
 * nearly independent of pace: covering five kilometres costs about the same whether it
 * takes twenty-five minutes or forty. That is not true of walking, where slower is
 * markedly cheaper per kilometre, which is why a single constant is defensible here and
 * would not be for a general activity tracker.
 *
 * It is an estimate and should be presented as one. Individual energy cost varies with
 * running economy, terrain, wind and temperature, so ±15-20% is the honest expectation.
 * It is the same basis most running apps use when no heart rate or power data is present.
 *
 * Deliberately not done: a heart-rate-based formula. Those need age and sex as well, which
 * would mean collecting two more personal attributes for an accuracy gain this app has no
 * way to validate.
 */

/** kcal per kilogram of body mass per kilometre covered. */
export const KCAL_PER_KG_PER_KM = 1.03;

/** Matches the CHECK added in migration 011 and the profile validator. */
export const MIN_WEIGHT_KG = 20;
export const MAX_WEIGHT_KG = 400;

/**
 * Returns whole kcal, or null when there is nothing to base a figure on.
 *
 * Null rather than zero: zero asserts that the run cost no energy, which is false, whereas
 * null says the app does not know — and the runs table stores exactly that distinction.
 */
export function estimateCalories({ weightKg, distanceKm } = {}) {
  const weight = Number(weightKg);
  const distance = Number(distanceKm);

  if (!Number.isFinite(weight) || weight < MIN_WEIGHT_KG || weight > MAX_WEIGHT_KG) return null;
  if (!Number.isFinite(distance) || distance <= 0) return null;

  const kcal = Math.round(weight * distance * KCAL_PER_KG_PER_KM);

  // The column accepts 0-30000. A 400 kg runner would have to cover 73 km to reach that,
  // so this is unreachable in practice — but an unreachable guard is cheaper than a run
  // that fails to save because one derived field went out of range.
  return kcal > 0 && kcal <= 30000 ? kcal : null;
}

export default estimateCalories;
