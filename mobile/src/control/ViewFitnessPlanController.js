import FitnessPlan from '../entities/FitnessPlan.js';

async function viewFitnessPlanController() {
  try {
    const data = await FitnessPlan.get();
    return { success: true, field: null, message: '', data };
  } catch (err) {
    return { success: false, field: null, message: err.message };
  }
}

export default viewFitnessPlanController;
