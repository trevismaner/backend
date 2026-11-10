import Admin from '../entities/Admin.js';

async function adminAwardBadgeController({ userId, badgeId }) {
  if (!userId) {
    return { success: false, field: 'userId', message: 'A user id is required.' };
  }

  if (!badgeId) {
    return { success: false, field: 'badgeId', message: 'A badge id is required.' };
  }

  try {
    const data = await Admin.awardBadge(userId, badgeId);
    return { success: true, field: null, message: '', data };
  } catch (err) {
    return { success: false, field: null, message: err.message };
  }
}

export default adminAwardBadgeController;
