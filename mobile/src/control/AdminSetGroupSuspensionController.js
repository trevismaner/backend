import Admin from '../entities/Admin.js';

async function adminSetGroupSuspensionController({ groupId, isSuspended, reason = null }) {
  if (!groupId) {
    return { success: false, field: 'groupId', message: 'A group id is required.' };
  }

  if (typeof isSuspended !== 'boolean') {
    return { success: false, field: 'isSuspended', message: 'Suspension state must be true or false.' };
  }

  try {
    const data = await Admin.setGroupSuspension(groupId, isSuspended, reason);
    return { success: true, field: null, message: '', data };
  } catch (err) {
    return { success: false, field: null, message: err.message };
  }
}

export default adminSetGroupSuspensionController;
