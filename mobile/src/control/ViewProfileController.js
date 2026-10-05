import User from '../entities/User.js';

/**
 * The signed-in user's own profile (RU-03).
 *
 * Reads `/profile`, not `/auth/me`: both return the user, but only `/profile` carries the
 * lifetime run totals the profile screen displays. Returns `{ user, stats }` in `data`.
 */
async function viewProfileController() {
  try {
    const data = await User.getProfile();
    return { success: true, field: null, message: '', data };
  } catch (err) {
    return { success: false, field: null, message: err.message };
  }
}

export default viewProfileController;
