import FitnessPlan from '../entities/FitnessPlan.js';

/**
 * Ticks a planned session off against a run that was actually done, or un-ticks it.
 *
 * Matched by the runner rather than guessed by the app: a run on the right day at roughly
 * the right distance is only probably the planned session, and silently ticking off the
 * wrong one is worse than asking.
 */
export async function completePlanSessionController(sessionId, runId) {
  if (!sessionId) return { success: false, field: null, message: 'No session selected.' };
  if (!runId) return { success: false, field: 'runId', message: 'Choose which run completed this session.' };

  try {
    const data = await FitnessPlan.completeSession(sessionId, runId);
    return { success: true, field: null, message: '', data };
  } catch (err) {
    return { success: false, field: null, message: err.message };
  }
}

export async function clearPlanSessionController(sessionId) {
  if (!sessionId) return { success: false, field: null, message: 'No session selected.' };

  try {
    const data = await FitnessPlan.clearSession(sessionId);
    return { success: true, field: null, message: '', data };
  } catch (err) {
    return { success: false, field: null, message: err.message };
  }
}
