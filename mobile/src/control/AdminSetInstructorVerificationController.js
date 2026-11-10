import Admin from '../entities/Admin.js';

async function adminSetInstructorVerificationController({ userId, verified, reason = null }) {
  if (!userId) {
    return { success: false, field: 'userId', message: 'A user id is required.' };
  }

  if (typeof verified !== 'boolean') {
    return { success: false, field: 'verified', message: 'Verification state must be true or false.' };
  }

  try {
    const data = await Admin.setInstructorVerification(userId, verified, reason);
    return { success: true, field: null, message: '', data };
  } catch (err) {
    return { success: false, field: null, message: err.message };
  }
}

export default adminSetInstructorVerificationController;
