import User from '../entities/User.js';

/**
 * Reads the sign-up rules from the server: the password policy, and whether the email
 * verification step applies.
 *
 * Cached for the life of the app process. The sign-up flow asks for it on more than one
 * screen and the answer does not change mid-flow, so this avoids repeating the request
 * while still picking up a server-side change on the next launch.
 *
 * Returns null rather than throwing when it cannot be read. Every caller has a sensible
 * fallback, and the server remains the authority regardless — registration refuses a weak
 * password or a missing verification proof whatever the app believed.
 */
let cached = null;

async function getAuthConfigController({ refresh = false } = {}) {
  if (cached && !refresh) return cached;
  try {
    cached = await User.getAuthConfig();
    return cached;
  } catch {
    return null;
  }
}

/** Test seam: forget the cached config. */
export function resetAuthConfigCache() {
  cached = null;
}

export default getAuthConfigController;
