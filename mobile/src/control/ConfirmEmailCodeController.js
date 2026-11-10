import User from '../entities/User.js';

/**
 * Checks a verification code and returns the proof registration needs.
 *
 * The 6-digit shape is checked here so an obviously wrong entry does not spend one of the
 * server's limited attempts — the code is finished after five wrong guesses.
 */
async function confirmEmailCodeController({ email, code }) {
  const trimmed = String(code || '').trim();
  if (!/^\d{6}$/.test(trimmed)) {
    throw new Error('Enter the 6-digit code from your email.');
  }
  const result = await User.confirmEmailCode({ email: String(email || '').trim(), code: trimmed });
  if (!result?.verificationToken) {
    throw new Error('That code could not be verified. Request a new one.');
  }
  return result;
}

export default confirmEmailCodeController;
