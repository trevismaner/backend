import Admin from '../entities/Admin.js';

async function adminSetUserSuspensionController({ userId, isSuspended, reason = null }) {
  if (!userId) {
    return { success: false, field: 'userId', message: 'A user id is required.' };
  }

  if (typeof isSuspended !== 'boolean') {
    return { success: false, field: 'isSuspended', message: 'Suspension state must be true or false.' };
  }

  try {
    const data = await Admin.setUserSuspension(userId, isSuspended, reason);
    return { success: true, field: null, message: '', data };
  } catch (err) {
    return { success: false, field: null, message: err.message };
  }
}

export default adminSetUserSuspensionController;
