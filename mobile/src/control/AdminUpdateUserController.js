import Admin from '../entities/Admin.js';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * SA-06: update a user account so a locked-out user can be helped.
 * Only the fields the admin actually filled in are sent.
 */
async function adminUpdateUserController({ userId, name, email, password, bio } = {}) {
  if (!userId) {
    return { success: false, field: 'userId', message: 'A user id is required.' };
  }

  const changes = {};

  if (name !== undefined && name !== null) {
    if (!name.trim()) {
      return { success: false, field: 'name', message: 'Name cannot be empty.' };
    }
    if (name.trim().length > 100) {
      return { success: false, field: 'name', message: 'Name must be 100 characters or fewer.' };
    }
    changes.name = name.trim();
  }

  if (email !== undefined && email !== null) {
    if (!EMAIL_REGEX.test(email.trim())) {
      return { success: false, field: 'email', message: 'Enter a valid email address.' };
    }
    changes.email = email.trim().toLowerCase();
  }

  if (password !== undefined && password !== null && password !== '') {
    if (password.length < 8) {
      return { success: false, field: 'password', message: 'Password must be at least 8 characters.' };
    }
    changes.password = password;
  }

  if (bio !== undefined) changes.bio = bio;

  if (Object.keys(changes).length === 0) {
    return { success: false, field: null, message: 'Change something first.' };
  }

  try {
    const data = await Admin.updateUser(userId, changes);
    return { success: true, field: null, message: 'User updated', data };
  } catch (err) {
    return { success: false, field: null, message: err.message };
  }
}

export default adminUpdateUserController;
