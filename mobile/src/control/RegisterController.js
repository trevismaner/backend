import AsyncStorage from '@react-native-async-storage/async-storage';
import User from '../entities/User.js';
import { checkRequirements, meetsPolicy } from './PasswordRules.js';

/**
 * Creates the account.
 *
 * The password check here used to be `length < 6`, which was weaker than the server's rule
 * and so let a password through only to be refused by the API — surfacing as a generic
 * failure on the very last screen of the flow. It now uses the same rules the sign-up screen
 * shows, and names what is missing.
 *
 * `verificationToken` is the proof minted by /auth/verification/confirm, carried through the
 * password and terms screens. It is passed through untouched: whether it is required is the
 * server's decision, so there is deliberately no check for it here.
 */
async function registerController({ name, email, password, accountType, verificationToken }) {
  if (!name || !name.trim()) {
    return { success: false, field: 'name', message: 'Name is required.' };
  }
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { success: false, field: 'email', message: 'A valid email is required.' };
  }
  if (!password) {
    return { success: false, field: 'password', message: 'A password is required.' };
  }
  if (!meetsPolicy(password, { email, name })) {
    const missing = checkRequirements(password, { email, name })
      .filter((r) => !r.met)
      .map((r) => r.label);
    return {
      success: false,
      field: 'password',
      message: `Password needs: ${missing.join(', ')}.`,
    };
  }

  try {
    const data = await User.register({ name, email, password, accountType, verificationToken });
    await AsyncStorage.setItem('token', data.token);
    return { success: true, field: null, message: '', data };
  } catch (err) {
    return { success: false, field: null, message: err.message };
  }
}

export default registerController;
