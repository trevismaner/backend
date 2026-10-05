import Admin from '../entities/Admin.js';

async function adminViewUserController(userId) {
  if (!userId) {
    return { success: false, field: 'userId', message: 'A user id is required.' };
  }

  try {
    const data = await Admin.getUser(userId);
    return { success: true, field: null, message: '', data };
  } catch (err) {
    return { success: false, field: null, message: err.message };
  }
}

export default adminViewUserController;
