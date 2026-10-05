import Admin from '../entities/Admin.js';

async function adminListRewardsController() {
  try {
    const data = await Admin.listRewards();
    return { success: true, field: null, message: '', data };
  } catch (err) {
    return { success: false, field: null, message: err.message };
  }
}

export default adminListRewardsController;
