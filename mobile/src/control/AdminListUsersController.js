import Admin from '../entities/Admin.js';

async function adminListUsersController(filters = {}) {
  try {
    const data = await Admin.listUsers(filters);
    return { success: true, field: null, message: '', data };
  } catch (err) {
    return { success: false, field: null, message: err.message };
  }
}

export default adminListUsersController;
