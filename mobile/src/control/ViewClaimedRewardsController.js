import Reward from '../entities/Reward.js';

async function viewClaimedRewardsController() {
  try {
    const data = await Reward.getClaimed();
    return { success: true, field: null, message: '', data };
  } catch (err) {
    return { success: false, field: null, message: err.message };
  }
}

export default viewClaimedRewardsController;
