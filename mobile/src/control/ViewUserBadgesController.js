import Reward from '../entities/Reward.js';

async function viewUserBadgesController() {
  try {
    const data = await Reward.getBadges();
    return { success: true, field: null, message: '', data };
  } catch (err) {
    return { success: false, field: null, message: err.message };
  }
}

export default viewUserBadgesController;
