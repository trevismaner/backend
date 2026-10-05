import Admin from '../entities/Admin.js';

async function adminUpdateBadgeController({ badgeId, changes }) {
  if (!badgeId) {
    return { success: false, field: 'badgeId', message: 'A badge id is required.' };
  }

  if (!changes || Object.keys(changes).length === 0) {
    return { success: false, field: null, message: 'No changes to save.' };
  }

  try {
    const data = await Admin.updateBadge(badgeId, changes);
    return { success: true, field: null, message: '', data };
  } catch (err) {
    return { success: false, field: null, message: err.message };
  }
}

export default adminUpdateBadgeController;
