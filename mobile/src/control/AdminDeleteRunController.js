import Admin from '../entities/Admin.js';

async function adminDeleteRunController(runId) {
  if (!runId) {
    return { success: false, field: 'runId', message: 'A run id is required.' };
  }

  try {
    const data = await Admin.deleteRun(runId);
    return { success: true, field: null, message: '', data };
  } catch (err) {
    return { success: false, field: null, message: err.message };
  }
}

export default adminDeleteRunController;
