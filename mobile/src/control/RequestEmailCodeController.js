import User from '../entities/User.js';

/**
 * Asks the server to email a verification code.
 *
 * Throws on failure so the screen can show the server's own message — which carries the
 * useful detail, such as having asked for too many codes for one address.
 */
async function requestEmailCodeController(email) {
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email).trim())) {
    throw new Error('A valid email address is required.');
  }
  return User.requestEmailCode(String(email).trim());
}

export default requestEmailCodeController;
