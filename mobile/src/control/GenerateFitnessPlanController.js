import FitnessPlan from '../entities/FitnessPlan.js';

/**
 * Starts building a week-by-week schedule for a plan.
 *
 * Returns as soon as the server has accepted the job, not when the plan is ready — the
 * screen polls for that. A 409 means one is already running, which is not an error worth
 * showing: the poll will pick up the result either way.
 */
async function generateFitnessPlanController(planId) {
  if (!planId) return { success: false, field: null, message: 'No plan to build.' };

  try {
    const data = await FitnessPlan.generate(planId);
    return { success: true, field: null, message: '', data };
  } catch (err) {
    if (/already being generated/i.test(err.message)) {
      return { success: true, field: null, message: '', data: { generationStatus: 'generating' } };
    }
    return { success: false, field: null, message: err.message };
  }
}

export default generateFitnessPlanController;
