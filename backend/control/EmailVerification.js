/**
 * Email verification for sign-up: issue a code, check a code, prove it was checked.
 *
 * The proof matters. Verification happens before the account exists, so "this address was
 * verified" has to survive two more screens (choose a password, accept the terms) and arrive
 * at registration. Carrying a boolean in the app would mean anyone could set it, so instead
 * confirming a code mints a short-lived signed token naming the address, and registration
 * will only accept a token whose address matches the one being registered.
 *
 * What this is defending against, and how:
 *
 *   guessing a code          six digits, but `attempts` is capped per code and the row is
 *                            spent once the cap is hit — a fresh code must be requested
 *   using a code twice       consumed_at is set on success and checked on every attempt
 *   using an old code        requesting a new code expires the previous ones for that address
 *   mail-bombing an address  a per-address request cap over a rolling window
 *   reading codes from a     only a SHA-256 hash of the code is stored
 *     leaked database
 *   forging the proof        the token is signed with JWT_SECRET and is valid for minutes
 */
import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import pool from '../config/db.js';
import { sendMail, verificationEmail } from './Mailer.js';

export const CODE_TTL_MINUTES = 10;
export const MAX_ATTEMPTS = 5;
export const MAX_REQUESTS_PER_HOUR = 5;
export const PROOF_TTL = '30m';   // long enough to pick a password and read the terms

/** Is verification required at all? Off unless explicitly switched on. */
export function isRequired() {
  const flag = process.env.REQUIRE_EMAIL_VERIFICATION?.trim().toLowerCase();
  return ['true', '1', 'on', 'yes'].includes(flag);
}

const normalise = (email) => String(email || '').trim().toLowerCase();
const hash = (code) => crypto.createHash('sha256').update(String(code)).digest('hex');

/**
 * Six digits, from a cryptographic source. `randomInt` is uniform over the range, unlike
 * `Math.floor(Math.random() * n)` which also leaks a predictable generator.
 */
function newCode() {
  return String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
}

/**
 * Issues a code and emails it.
 *
 * Returns { ok, retryAfterMinutes, devCode }. `devCode` is only ever populated when no mail
 * provider is configured AND this is not production — it is what makes the flow completable
 * in development and in the test suites without a mail account.
 */
export async function requestCode(email) {
  const address = normalise(email);
  if (!address || !address.includes('@')) {
    return { ok: false, error: 'A valid email address is required.' };
  }

  // Rate limit per address, so this cannot be used to send someone a hundred emails.
  const { rows: recent } = await pool.query(
    `SELECT COUNT(*)::int AS n FROM email_verifications
      WHERE LOWER(email) = $1 AND created_at > NOW() - INTERVAL '1 hour'`,
    [address]
  );
  if (recent[0].n >= MAX_REQUESTS_PER_HOUR) {
    return { ok: false, error: 'Too many codes requested for this address. Try again later.', retryAfterMinutes: 60 };
  }

  const code = newCode();

  // Supersede any outstanding codes: a person who requests a new one should not find the
  // old one still works, and it keeps "the live code" unambiguous.
  await pool.query(
    `UPDATE email_verifications SET expires_at = NOW()
      WHERE LOWER(email) = $1 AND consumed_at IS NULL AND expires_at > NOW()`,
    [address]
  );

  await pool.query(
    `INSERT INTO email_verifications (email, code_hash, expires_at)
     VALUES ($1, $2, NOW() + ($3 || ' minutes')::INTERVAL)`,
    [address, hash(code), String(CODE_TTL_MINUTES)]
  );

  const { subject, text, html } = verificationEmail({ code, minutes: CODE_TTL_MINUTES });
  const sent = await sendMail({ to: address, subject, text, html });

  const showCode = sent.via === 'console' && process.env.NODE_ENV !== 'production';
  return {
    ok: true,
    delivered: sent.delivered,
    via: sent.via,
    expiresInMinutes: CODE_TTL_MINUTES,
    ...(showCode ? { devCode: code } : {}),
  };
}

/**
 * Checks a code. On success returns a signed proof for the registration step.
 *
 * Wrong codes increment `attempts` on the live row rather than being silently ignored, and
 * the row is finished once MAX_ATTEMPTS is reached.
 */
export async function confirmCode(email, code) {
  const address = normalise(email);
  const supplied = String(code || '').trim();

  if (!/^\d{6}$/.test(supplied)) {
    return { ok: false, error: 'Enter the 6-digit code from your email.' };
  }

  /**
   * Note `expires_at <= NOW()` is computed in SQL rather than compared in JavaScript.
   *
   * These columns are `timestamp without time zone` holding UTC, which is what the rest of
   * this schema uses. node-pg parses that type into a Date using the *Node process's* local
   * timezone, so `new Date(row.expires_at) <= new Date()` silently shifts the value by the
   * offset of whatever machine happens to be running. On a UTC host it is correct; with
   * TZ=Asia/Singapore every freshly issued code read as eight hours stale and verification
   * was impossible. Letting the database do its own time arithmetic removes the question.
   */
  const { rows } = await pool.query(
    `SELECT id, code_hash, attempts, (expires_at <= NOW()) AS expired
       FROM email_verifications
      WHERE LOWER(email) = $1 AND consumed_at IS NULL
      ORDER BY created_at DESC
      LIMIT 1`,
    [address]
  );

  const row = rows[0];
  if (!row) return { ok: false, error: 'Request a code first.' };
  if (row.expired) {
    return { ok: false, error: 'That code has expired. Request a new one.' };
  }
  if (row.attempts >= MAX_ATTEMPTS) {
    return { ok: false, error: 'Too many incorrect attempts. Request a new code.' };
  }

  // timingSafeEqual over the hex digests: both are fixed-length, so no length leak.
  const supplieddigest = Buffer.from(hash(supplied), 'hex');
  const storedDigest = Buffer.from(row.code_hash, 'hex');
  const matches = supplieddigest.length === storedDigest.length
    && crypto.timingSafeEqual(supplieddigest, storedDigest);

  if (!matches) {
    const { rows: after } = await pool.query(
      'UPDATE email_verifications SET attempts = attempts + 1 WHERE id = $1 RETURNING attempts',
      [row.id]
    );
    const left = Math.max(0, MAX_ATTEMPTS - after[0].attempts);
    return {
      ok: false,
      error: left > 0
        ? `That code is not right. ${left} attempt${left === 1 ? '' : 's'} left.`
        : 'Too many incorrect attempts. Request a new code.',
      attemptsLeft: left,
    };
  }

  await pool.query('UPDATE email_verifications SET consumed_at = NOW() WHERE id = $1', [row.id]);

  const proof = jwt.sign(
    { purpose: 'email_verified', email: address },
    process.env.JWT_SECRET,
    { expiresIn: PROOF_TTL }
  );
  return { ok: true, verificationToken: proof, email: address };
}

/**
 * Does this token prove that this address was verified? Used by registration.
 *
 * The purpose claim is checked as well as the signature: without it, any valid login token
 * would be accepted here, and a signed-in user could register someone else's address.
 */
export function proofCoversEmail(token, email) {
  if (!token) return false;
  try {
    const claims = jwt.verify(token, process.env.JWT_SECRET);
    return claims.purpose === 'email_verified' && claims.email === normalise(email);
  } catch {
    return false;
  }
}

export default { isRequired, requestCode, confirmCode, proofCoversEmail, CODE_TTL_MINUTES, MAX_ATTEMPTS };
