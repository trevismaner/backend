/**
 * Calories burned on a run, for the live figure on the run screen.
 *
 * Deliberately the same arithmetic as the server's control/CalorieEstimate.js. The server
 * is the authority — it fills the figure in on every run that arrives without one, so
 * manually logged and imported runs get it too — but the run screen needs a number while
 * the run is still happening, before anything has been saved. The two must agree, or the
 * total would visibly change the moment the run was saved.
 *
 * The basis is the oxygen cost of running, close to 1.03 kcal per kilogram of body mass
 * per kilometre. For running this is nearly independent of pace: a 5 km costs about the
 * same whether it takes 25 minutes or 40. That is not true of walking, which is why one
 * constant is defensible here and would not be in a general activity tracker.
 *
 * It is an estimate, ±15-20% depending on running economy, terrain and conditions, and the
 * screen labels it as one.
 */

/** Keep in step with KCAL_PER_KG_PER_KM in the backend's control/CalorieEstimate.js. */
export const KCAL_PER_KG_PER_KM = 1.03;

export const MIN_WEIGHT_KG = 20;
export const MAX_WEIGHT_KG = 400;

/**
 * Whole kcal, or null when there is nothing to base a figure on — no weight on the
 * profile, or no distance yet.
 *
 * Null rather than zero, so the screen can show nothing at all instead of asserting that
 * the run has cost no energy.
 */
export function estimateCalories({ weightKg, distanceKm } = {}) {
  const weight = Number(weightKg);
  const distance = Number(distanceKm);

  if (!Number.isFinite(weight) || weight < MIN_WEIGHT_KG || weight > MAX_WEIGHT_KG) return null;
  if (!Number.isFinite(distance) || distance <= 0) return null;

  const kcal = Math.round(weight * distance * KCAL_PER_KG_PER_KM);
  return kcal > 0 && kcal <= 30000 ? kcal : null;
}

/**
 * Reads a weight typed into a text field.
 *
 * Returns { ok, value } or { ok: false, problem }. The same bounds as the server and the
 * database CHECK, so the screen can say what is wrong before a round trip rather than
 * turning a constraint violation into a generic failure message.
 */
export function parseWeightInput(raw) {
  const text = String(raw ?? '').trim().replace(',', '.');
  if (text === '') return { ok: true, value: null };        // cleared, or never set

  const n = Number(text);
  if (!Number.isFinite(n)) return { ok: false, problem: 'Weight must be a number' };
  if (n < MIN_WEIGHT_KG || n > MAX_WEIGHT_KG) {
    return { ok: false, problem: `Weight must be between ${MIN_WEIGHT_KG} and ${MAX_WEIGHT_KG} kg` };
  }
  return { ok: true, value: Math.round(n * 100) / 100 };    // the column is NUMERIC(5,2)
}
