import FitnessPlan from '../entities/FitnessPlan.js';

async function updateFitnessPlanController({ planId, changes }) {
  if (!planId) {
    return { success: false, field: 'planId', message: 'A plan id is required.' };
  }

  if (!changes || Object.keys(changes).length === 0) {
    return { success: false, field: null, message: 'No changes to save.' };
  }

  try {
    const data = await FitnessPlan.update(planId, changes);
    return { success: true, field: null, message: '', data };
  } catch (err) {
    return { success: false, field: null, message: err.message };
  }
}

export default updateFitnessPlanController;
