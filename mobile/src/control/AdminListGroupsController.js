import Admin from '../entities/Admin.js';

async function adminListGroupsController(filters = {}) {
  try {
    const data = await Admin.listGroups(filters);
    return { success: true, field: null, message: '', data };
  } catch (err) {
    return { success: false, field: null, message: err.message };
  }
}

export default adminListGroupsController;
