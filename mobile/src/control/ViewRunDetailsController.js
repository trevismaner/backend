import Run from '../entities/Run.js';

async function viewRunDetailsController(runId) {
  try {
    const data = await Run.getById(runId);
    return { success: true, field: null, message: '', data };
  } catch (err) {
    return { success: false, field: null, message: err.message };
  }
}

export default viewRunDetailsController;
