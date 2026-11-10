import Admin from '../entities/Admin.js';

async function adminCreateBadgeController({ name, description = null, iconUrl = null }) {
  if (!name || !name.trim()) {
    return { success: false, field: 'name', message: 'Badge name is required.' };
  }

  try {
    const data = await Admin.createBadge({ name, description, iconUrl });
    return { success: true, field: null, message: '', data };
  } catch (err) {
    return { success: false, field: null, message: err.message };
  }
}

export default adminCreateBadgeController;
