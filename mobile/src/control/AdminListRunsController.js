import Admin from '../entities/Admin.js';

async function adminListRunsController(filters = {}) {
  try {
    const data = await Admin.listRuns(filters);
    return { success: true, field: null, message: '', data };
  } catch (err) {
    return { success: false, field: null, message: err.message };
  }
}

export default adminListRunsController;
