import FitnessEstimate from '../entities/FitnessEstimate.js';

async function viewFitnessEstimateController() {
  try {
    const data = await FitnessEstimate.get();
    return { success: true, field: null, message: '', data };
  } catch (err) {
    return { success: false, field: null, message: err.message };
  }
}

export default viewFitnessEstimateController;
