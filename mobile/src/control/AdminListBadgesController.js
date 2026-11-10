import Admin from '../entities/Admin.js';

async function adminListBadgesController() {
  try {
    const data = await Admin.listBadges();
    return { success: true, field: null, message: '', data };
  } catch (err) {
    return { success: false, field: null, message: err.message };
  }
}

export default adminListBadgesController;
