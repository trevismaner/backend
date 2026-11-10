import Run from '../entities/Run.js';

const NUMERIC_FIELDS = ['distanceKm', 'durationSeconds', 'caloriesBurned', 'avgHeartRate', 'maxHeartRate'];

/**
 * Corrects the figures on a saved run — a GPS glitch that added a kilometre, a duration
 * entered wrong, calories that were never recorded.
 *
 * Blank fields are dropped rather than sent as empty strings, so clearing a text box does
 * not try to write "" into a numeric column. The server re-validates the whole run and
 * adjusts the points by the difference, which comes back as `data.pointsAdjustment`.
 */
async function updateRunController(runId, changes) {
  if (!runId) return { success: false, field: null, message: 'No run to update.' };

  const payload = {};
  for (const [field, value] of Object.entries(changes ?? {})) {
    if (value === undefined || value === null || value === '') continue;
    if (NUMERIC_FIELDS.includes(field)) {
      const n = Number(value);
      if (!Number.isFinite(n)) return { success: false, field, message: `${field} must be a number.` };
      payload[field] = field === 'distanceKm' ? n : Math.round(n);
    } else {
      payload[field] = value;
    }
  }

  if (Object.keys(payload).length === 0) {
    return { success: false, field: null, message: 'Nothing to change.' };
  }

  try {
    const data = await Run.update(runId, payload);
    return { success: true, field: null, message: '', data };
  } catch (err) {
    return { success: false, field: null, message: err.message };
  }
}

export default updateRunController;
