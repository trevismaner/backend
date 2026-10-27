/**
 * One password rule, used everywhere a password is set.
 *
 * Before this existed the rule was inconsistent: admin-created users and `admin:create`
 * checked `length < 8`, and self-registration checked nothing at all — `"a"` registered
 * successfully. The weakest path is the one that matters, so the rule lives here and every
 * entry point calls it.
 *
 * The policy is deliberately modest. Long lists of character-class requirements push people
 * towards `Passw0rd!` and towards writing passwords down, so this asks for length, a letter
 * and a digit, and then rejects the specific things that are actually guessed first: the
 * common passwords, and anything built out of the person's own email or name.
 *
 * `describe()` is served to the app by GET /api/auth/config so the client can check as the
 * person types using these exact rules, rather than keeping a second copy that drifts.
 */

export const MIN_LENGTH = 8;

/**
 * bcrypt only looks at the first 72 bytes. Without this cap a 100-character password would
 * appear to work while the last 28 characters did nothing — and the person would never know,
 * including if they later typed only the first 72 and got in. Better to refuse it and say why.
 */
export const MAX_BYTES = 72;

/**
 * Not a security control on its own — an attacker is not limited to this list. It is here to
 * catch the handful of passwords that genuinely are tried first, which a length-and-digit
 * rule happily lets through: `password1` passes every structural check ever written.
 */
const COMMON = new Set([
  'password', 'password1', 'password123', 'passw0rd', 'p@ssword', 'p@ssw0rd',
  '12345678', '123456789', '1234567890', 'qwerty123', 'qwertyui', 'abc12345',
  'iloveyou', 'letmein1', 'welcome1', 'admin123', 'football1', 'baseball1',
  'sunshine1', 'princess1', 'dragon123', 'monkey123', 'trustno1', 'starwars1',
  'runleague', 'runleague1', 'runleague123',
]);

/** Pieces of the person's own identity that must not be the password. */
function personalFragments({ email, name } = {}) {
  const parts = [];
  if (typeof email === 'string' && email.includes('@')) {
    const local = email.split('@')[0].trim().toLowerCase();
    if (local.length >= 4) parts.push(local);
  }
  if (typeof name === 'string') {
    for (const word of name.toLowerCase().split(/\s+/)) {
      if (word.length >= 4) parts.push(word);
    }
  }
  return parts;
}

/**
 * Checks a password. Returns every problem rather than the first, so the person can fix all
 * of them in one go instead of resubmitting to discover the next rule.
 *
 * `context` is optional: pass { email, name } where they are known so the personal-fragment
 * check can run. Where they are not known the rest of the policy still applies.
 */
export function validatePassword(password, context = {}) {
  const problems = [];

  if (typeof password !== 'string' || password.length === 0) {
    return { ok: false, problems: ['A password is required.'] };
  }

  if (password.length < MIN_LENGTH) {
    problems.push(`Must be at least ${MIN_LENGTH} characters.`);
  }

  if (Buffer.byteLength(password, 'utf8') > MAX_BYTES) {
    problems.push(`Must be ${MAX_BYTES} bytes or fewer — anything longer is silently ignored past that point.`);
  }

  if (!/\p{L}/u.test(password)) problems.push('Must include at least one letter.');
  if (!/\d/.test(password)) problems.push('Must include at least one number.');

  // Leading and trailing spaces survive into the stored hash and are then impossible to see
  // when signing in on a phone keyboard that trims as you type.
  if (password !== password.trim()) {
    problems.push('Must not start or end with a space.');
  }

  const lower = password.toLowerCase();
  if (COMMON.has(lower)) {
    problems.push('That is one of the most commonly used passwords. Choose something else.');
  }

  for (const fragment of personalFragments(context)) {
    if (lower.includes(fragment)) {
      problems.push('Must not contain your name or the first part of your email address.');
      break;
    }
  }

  return { ok: problems.length === 0, problems };
}

/** The same rules, in a form the app can show and check against. Served by /api/auth/config. */
export function describe() {
  return {
    minLength: MIN_LENGTH,
    maxBytes: MAX_BYTES,
    requiresLetter: true,
    requiresNumber: true,
    rejectsCommon: true,
    rejectsPersonal: true,
    // What to show the person. Phrased as requirements they can tick off, not as errors.
    requirements: [
      `At least ${MIN_LENGTH} characters`,
      'At least one letter',
      'At least one number',
      'Not a commonly used password',
      'Does not contain your name or email',
    ],
  };
}

/**
 * Convenience for the controllers: either returns nothing, or the 400 body to send back.
 * Keeping the shape in one place means every endpoint reports the same way.
 */
export function passwordRejection(password, context = {}) {
  const { ok, problems } = validatePassword(password, context);
  if (ok) return null;
  return { error: problems[0], problems, policy: describe() };
}

export default { validatePassword, describe, passwordRejection, MIN_LENGTH, MAX_BYTES };
