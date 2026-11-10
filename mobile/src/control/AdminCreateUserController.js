import Admin from '../entities/Admin.js';

async function adminCreateUserController({ email, password, name, role }) {
  if (!email || !email.trim()) {
    return { success: false, field: 'email', message: 'Email is required.' };
  }

  if (!name || !name.trim()) {
    return { success: false, field: 'name', message: 'Name is required.' };
  }

  if (!password || password.length < 8) {
    return { success: false, field: 'password', message: 'Password must be at least 8 characters.' };
  }

  try {
    const data = await Admin.createUser({ email, password, name, role });
    return { success: true, field: null, message: '', data };
  } catch (err) {
    return { success: false, field: null, message: err.message };
  }
}

export default adminCreateUserController;
