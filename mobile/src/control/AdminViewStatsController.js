import Admin from '../entities/Admin.js';

async function adminViewStatsController() {
  try {
    const data = await Admin.getStats();
    return { success: true, field: null, message: '', data };
  } catch (err) {
    return { success: false, field: null, message: err.message };
  }
}

export default adminViewStatsController;
