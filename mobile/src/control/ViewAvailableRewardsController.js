import Reward from '../entities/Reward.js';

async function viewAvailableRewardsController() {
  try {
    const data = await Reward.getAvailable();
    return { success: true, field: null, message: '', data };
  } catch (err) {
    return { success: false, field: null, message: err.message };
  }
}

export default viewAvailableRewardsController;
