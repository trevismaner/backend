import Reward from '../entities/Reward.js';

async function setBadgeDisplayController({ badgeId, isDisplayed }) {
  if (!badgeId) {
    return { success: false, field: 'badgeId', message: 'A badge id is required.' };
  }

  if (typeof isDisplayed !== 'boolean') {
    return { success: false, field: 'isDisplayed', message: 'Display state must be true or false.' };
  }

  try {
    const data = await Reward.setBadgeDisplay(badgeId, isDisplayed);
    return { success: true, field: null, message: '', data };
  } catch (err) {
    return { success: false, field: null, message: err.message };
  }
}

export default setBadgeDisplayController;
