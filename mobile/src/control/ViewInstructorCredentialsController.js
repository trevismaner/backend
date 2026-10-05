import User from '../entities/User.js';

// IU-04: what has been submitted, and whether an admin has reviewed it.
async function viewInstructorCredentialsController() {
  try {
    const data = await User.getCredentials();
    return { success: true, field: null, message: '', data };
  } catch (err) {
    return { success: false, field: null, message: err.message };
  }
}

export default viewInstructorCredentialsController;
