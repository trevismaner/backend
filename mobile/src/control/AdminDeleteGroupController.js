import Admin from '../entities/Admin.js';

async function adminDeleteGroupController(groupId) {
  if (!groupId) {
    return { success: false, field: 'groupId', message: 'A group id is required.' };
  }

  try {
    const data = await Admin.deleteGroup(groupId);
    return { success: true, field: null, message: '', data };
  } catch (err) {
    return { success: false, field: null, message: err.message };
  }
}

export default adminDeleteGroupController;
