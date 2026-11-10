import Reward from '../entities/Reward.js';

async function claimRewardController(rewardId) {
  try {
    const data = await Reward.claim(rewardId);
    return { success: true, field: null, message: '', data };
  } catch (err) {
    return { success: false, field: null, message: err.message };
  }
}

export default claimRewardController;
