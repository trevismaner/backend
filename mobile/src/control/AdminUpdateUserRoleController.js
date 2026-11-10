import Admin from '../entities/Admin.js';

async function adminUpdateUserRoleController({ userId, role }) {
  if (!userId) {
    return { success: false, field: 'userId', message: 'A user id is required.' };
  }

  if (!role) {
    return { success: false, field: 'role', message: 'A role is required.' };
  }

  try {
    const data = await Admin.updateUserRole(userId, role);
    return { success: true, field: null, message: '', data };
  } catch (err) {
    return { success: false, field: null, message: err.message };
  }
}

export default adminUpdateUserRoleController;
