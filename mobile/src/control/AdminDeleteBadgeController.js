import Admin from '../entities/Admin.js';

async function adminDeleteBadgeController(badgeId) {
  if (!badgeId) {
    return { success: false, field: 'badgeId', message: 'A badge id is required.' };
  }

  try {
    const data = await Admin.deleteBadge(badgeId);
    return { success: true, field: null, message: '', data };
  } catch (err) {
    return { success: false, field: null, message: err.message };
  }
}

export default adminDeleteBadgeController;
