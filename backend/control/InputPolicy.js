/**
 * Shared input rules: email addresses, stored text lengths, and calendar dates.
 *
 * This exists for the same reason PasswordPolicy.js does. Each of these rules was being
 * applied in one place and skipped in another, and the skipped path is the one that
 * decides how the system behaves:
 *
 *   - Email format was checked by the admin create-user path and not by self-registration,
 *     so `a@`, `@uow.edu.au` and `a b@uow.edu.au` all registered successfully.
 *   - Email case was lowercased by the admin path and not by registration or login, and
 *     `findByEmail` compared with `=`. Signing up as `Bob@uow.edu.au` therefore made the
 *     account unreachable by `bob@uow.edu.au` — not a cosmetic problem, a lockout — and let
 *     the same person register twice under the two spellings.
 *   - Text length was enforced against `VARCHAR(100)` by the admin path and not by the
 *     profile update, so a 101-character name reached Postgres and came back as a 500.
 *   - Dates were compared but never parsed strictly, so `2026-11-31` became 1 December.
 *
 * Each rule returns `{ ok, value, problem }` so callers can use the cleaned value, and each
 * has a `*Rejection()` wrapper that returns a ready `{ error }` body or null, which is the
 * shape the HTTP boundaries already use.
 */

/** The `email` column. An address longer than this cannot be stored. */
export const MAX_EMAIL_LENGTH = 255;

/** The `name` column on `users`, `groups` and `tournaments`. */
export const MAX_NAME_LENGTH = 100;

/**
 * `bio` and run descriptions are TEXT, so the database imposes no limit — which is why a
 * 5 000-character bio was accepted without complaint. A cap belongs here rather than in the
 * schema: it is a product decision about what a profile is for, and it needs to be a number
 * the sign-up screen can show someone before they hit it.
 */
export const MAX_BIO_LENGTH = 1000;

/** Enough for a long CDN URL, short enough not to be a storage surprise. */
export const MAX_URL_LENGTH = 2048;

/**
 * Deliberately not an RFC 5322 implementation. A fully conformant pattern accepts quoted
 * local parts and bracketed IP literals that no sign-up form should encourage, and is famous
 * for rejecting valid addresses through small mistakes. What actually matters here is
 * catching the shapes that cannot receive mail at all, because the address is the login
 * identifier and the only route for a password reset: a missing local part, a missing
 * domain, a domain with no dot, or whitespace anywhere.
 *
 * Anything stricter belongs in a verification email, which is the only real proof that an
 * address exists — and which this project already implements in EmailVerification.js.
 */
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * The stored form of an address: trimmed and lowercased.
 *
 * Addresses are case-insensitive in practice for every mail provider people actually use,
 * and phone keyboards capitalise the first letter by default, so the case someone typed is
 * not a fact worth preserving. Normalising on the way in means one account per address
 * regardless of how it was typed, and `findByEmail` compares against this same form.
 *
 * Returns null for anything that is not a string, so callers get one shape to test.
 */
export function normalizeEmail(raw) {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim().toLowerCase();
  return trimmed || null;
}

export function validateEmail(raw) {
  const email = normalizeEmail(raw);

  if (!email) {
    return { ok: false, value: null, problem: 'Email is required.' };
  }
  if (email.length > MAX_EMAIL_LENGTH) {
    return {
      ok: false,
      value: null,
      problem: `Email must be ${MAX_EMAIL_LENGTH} characters or fewer.`,
    };
  }
  if (!EMAIL_SHAPE.test(email)) {
    return {
      ok: false,
      value: null,
      problem: 'Enter a valid email address, for example name@example.com.',
    };
  }

  return { ok: true, value: email, problem: null };
}

/** `{ error }` for a bad address, or null when it is fine. */
export function emailRejection(raw) {
  const result = validateEmail(raw);
  return result.ok ? null : { error: result.problem };
}

/**
 * Text bound for a sized column.
 *
 * `required: false` lets a field be left out of a partial update without being treated as
 * an attempt to blank it — which is what `undefined` means in a PATCH body — while still
 * rejecting a value that is present but empty or over-long.
 */
export function validateText(raw, { label, max = MAX_NAME_LENGTH, required = true } = {}) {
  if (raw === undefined) {
    return required
      ? { ok: false, value: undefined, problem: `${label} is required` }
      : { ok: true, value: undefined, problem: null };
  }
  if (typeof raw !== 'string') {
    return { ok: false, value: undefined, problem: `${label} must be text` };
  }

  const trimmed = raw.trim();
  if (!trimmed) {
    return { ok: false, value: undefined, problem: `${label} cannot be empty` };
  }
  // Measured on the trimmed value, because that is what gets stored.
  if (trimmed.length > max) {
    return {
      ok: false,
      value: undefined,
      problem: `${label} must be ${max} characters or fewer (that was ${trimmed.length})`,
    };
  }

  return { ok: true, value: trimmed, problem: null };
}

export function textRejection(raw, options) {
  const result = validateText(raw, options);
  return result.ok ? null : { error: result.problem };
}

/**
 * A date that exists on the calendar.
 *
 * `new Date()` does not tell you this. V8 silently rolls day overflow forward, in the
 * date-only form and in the full ISO form alike:
 *
 *   new Date('2026-11-31')            -> 2026-12-01
 *   new Date('2026-02-30T00:00:00Z')  -> 2026-03-02
 *   new Date('2026-02-29')            -> 2026-03-01   (2026 is not a leap year)
 *
 * Only a month above 12 is refused. So a deadline typed as 31 November was accepted as
 * 1 December without comment, and whether an impossible date surfaced as a validation error
 * or as a 500 from Postgres depended on which impossible date it was.
 *
 * The fix is to read the year, month and day back out of the parsed date and require that
 * they are the ones that were written.
 */
export function parseCalendarDate(raw, { label = 'Date' } = {}) {
  if (raw === undefined || raw === null || raw === '') {
    return { ok: false, value: null, problem: `${label} is required` };
  }
  if (raw instanceof Date) {
    return Number.isNaN(raw.getTime())
      ? { ok: false, value: null, problem: `${label} is not a valid date` }
      : { ok: true, value: raw, problem: null };
  }
  if (typeof raw !== 'string') {
    return { ok: false, value: null, problem: `${label} must be a date` };
  }

  const text = raw.trim();
  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) {
    return { ok: false, value: null, problem: `${label} is not a valid date` };
  }

  // The round-trip check. Only applied when the string actually states a calendar date in
  // ISO form; other formats are left to the parse above, since there is nothing to compare
  // against without re-implementing their grammar.
  const stated = /^(\d{4})-(\d{2})-(\d{2})/.exec(text);
  if (stated) {
    const [, year, month, day] = stated.map(Number);
    // A date-only string is parsed as UTC midnight, a string with a time may carry an
    // offset. Comparing in UTC is right for the first and is what the database stores for
    // the second.
    const rolled =
      parsed.getUTCFullYear() !== year ||
      parsed.getUTCMonth() + 1 !== month ||
      parsed.getUTCDate() !== day;

    if (rolled) {
      return {
        ok: false,
        value: null,
        problem: `${label} is not a date that exists (${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')})`,
      };
    }
  }

  return { ok: true, value: parsed, problem: null };
}

export function dateRejection(raw, options) {
  const result = parseCalendarDate(raw, options);
  return result.ok ? null : { error: result.problem };
}

/**
 * A start/end pair, where either may be absent.
 *
 * `current` carries the values already stored, so a PATCH that moves only the end date is
 * still checked against the start date it will actually sit next to. Without that, a
 * tournament could be given a valid range and then have one end moved past the other in a
 * second request — which is exactly how `startDate 2026-12-20, endDate 2026-12-01` came to
 * be stored with a 200.
 *
 * Returns the parsed values so the caller writes what was checked.
 */
export function validateDateRange(
  { startDate, endDate },
  { current = {}, startLabel = 'Start date', endLabel = 'End date' } = {}
) {
  const out = {};

  if (startDate !== undefined && startDate !== null) {
    const checked = parseCalendarDate(startDate, { label: startLabel });
    if (!checked.ok) return { ok: false, problem: checked.problem };
    out.startDate = checked.value;
  }
  if (endDate !== undefined && endDate !== null) {
    const checked = parseCalendarDate(endDate, { label: endLabel });
    if (!checked.ok) return { ok: false, problem: checked.problem };
    out.endDate = checked.value;
  }

  // Fall back to what is already stored for whichever end this request did not send.
  const start = out.startDate ?? (current.startDate ? new Date(current.startDate) : null);
  const end = out.endDate ?? (current.endDate ? new Date(current.endDate) : null);

  if (start && end && end < start) {
    return {
      ok: false,
      problem: `${endLabel} must be on or after ${startLabel.toLowerCase()}`,
    };
  }

  return { ok: true, value: out, problem: null };
}

/**
 * A whole number within bounds — participant limits, page sizes, anything counted.
 *
 * Written because the tournament participant limit was checked only against the number
 * already registered: `0` was accepted and produced a tournament nobody could join,
 * `100000000` was accepted, `"many"` reached the database and returned a 500, and `-5` was
 * refused with "cannot be below the current registered count", which is true but not the
 * reason.
 */
export function validateCount(raw, { label, min = 1, max = 100000 } = {}) {
  if (!Number.isInteger(raw)) {
    return { ok: false, value: null, problem: `${label} must be a whole number` };
  }
  if (raw < min) {
    return { ok: false, value: null, problem: `${label} must be ${min} or more` };
  }
  if (raw > max) {
    return { ok: false, value: null, problem: `${label} must be ${max} or fewer` };
  }
  return { ok: true, value: raw, problem: null };
}

export function countRejection(raw, options) {
  const result = validateCount(raw, options);
  return result.ok ? null : { error: result.problem };
}

/** Served to the app alongside the password policy, so the client can check as people type. */
export function describe() {
  return {
    email: { maxLength: MAX_EMAIL_LENGTH, caseInsensitive: true },
    name: { maxLength: MAX_NAME_LENGTH },
  };
}
