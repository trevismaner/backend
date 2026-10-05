import Admin from '../entities/Admin.js';

async function adminUpdateRewardController({ rewardId, changes }) {
  if (!rewardId) {
    return { success: false, field: 'rewardId', message: 'A reward id is required.' };
  }

  if (!changes || Object.keys(changes).length === 0) {
    return { success: false, field: null, message: 'No changes to save.' };
  }

  try {
    const data = await Admin.updateReward(rewardId, changes);
    return { success: true, field: null, message: '', data };
  } catch (err) {
    return { success: false, field: null, message: err.message };
  }
}

export default adminUpdateRewardController;
