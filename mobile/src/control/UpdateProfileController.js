import User from '../entities/User.js';

async function updateProfileController({ name, bio, profilePhotoUrl }) {
  if (!name || !name.trim()) {
    return { success: false, field: 'name', message: 'Name cannot be empty.' };
  }

  try {
    const data = await User.updateProfile({ name, bio, profilePhotoUrl });
    return { success: true, field: null, message: '', data };
  } catch (err) {
    return { success: false, field: null, message: err.message };
  }
}

export default updateProfileController;
