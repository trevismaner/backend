import Admin from '../entities/Admin.js';

async function adminCreateRewardController({ name, description = null, pointsRequired, rewardType = null, stock = null }) {
  if (!name || !name.trim()) {
    return { success: false, field: 'name', message: 'Reward name is required.' };
  }

  if (!Number.isInteger(Number(pointsRequired)) || Number(pointsRequired) < 0) {
    return { success: false, field: 'pointsRequired', message: 'Points required must be a whole number, 0 or more.' };
  }

  try {
    const data = await Admin.createReward({ name, description, pointsRequired, rewardType, stock });
    return { success: true, field: null, message: '', data };
  } catch (err) {
    return { success: false, field: null, message: err.message };
  }
}

export default adminCreateRewardController;
