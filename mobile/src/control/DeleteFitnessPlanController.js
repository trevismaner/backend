import FitnessPlan from '../entities/FitnessPlan.js';

async function deleteFitnessPlanController(planId) {
  if (!planId) {
    return { success: false, field: 'planId', message: 'A plan id is required.' };
  }

  try {
    const data = await FitnessPlan.delete(planId);
    return { success: true, field: null, message: '', data };
  } catch (err) {
    return { success: false, field: null, message: err.message };
  }
}

export default deleteFitnessPlanController;
