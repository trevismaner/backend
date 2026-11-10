import Run from '../entities/Run.js';

async function viewRunInsightsController() {
  try {
    const data = await Run.getInsights();
    return { success: true, field: null, message: '', data };
  } catch (err) {
    return { success: false, field: null, message: err.message };
  }
}

export default viewRunInsightsController;
