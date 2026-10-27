/**
 * The HTTP side of sign-up email verification, plus the config the app reads to know what
 * the rules are.
 *
 * Boundary-ish concerns only: status codes, response shapes, and not leaking whether an
 * address already has an account. The decisions all live in EmailVerification.js and
 * PasswordPolicy.js.
 */
import User from '../entities/User.js';
import { describe as describePasswordPolicy } from './PasswordPolicy.js';
import {
  isRequired, requestCode, confirmCode, CODE_TTL_MINUTES, MAX_ATTEMPTS,
} from './EmailVerification.js';
import { activeProvider } from './Mailer.js';

/**
 * GET /api/auth/config
 *
 * So the app does not keep its own copy of the rules. It asks what the password must look
 * like and whether the verification step applies, and renders accordingly — which means
 * switching REQUIRE_EMAIL_VERIFICATION on the server changes the app's behaviour without a
 * rebuild. That matters here because `EXPO_PUBLIC_*` values are frozen at build time.
 */
export async function getAuthConfig(req, res) {
  return res.json({
    passwordPolicy: describePasswordPolicy(),
    emailVerification: {
      required: isRequired(),
      codeLength: 6,
      expiresInMinutes: CODE_TTL_MINUTES,
      maxAttempts: MAX_ATTEMPTS,
    },
  });
}

/**
 * POST /api/auth/verification/request  { email }
 *
 * Answers the same way whether or not an account already exists with that address. Telling
 * the caller "that email is already registered" here would turn this endpoint into a way to
 * discover who has an account, and it is reachable without signing in.
 *
 * When the address IS taken, no code is sent at all — there is nothing to verify, and
 * sending one would mean a stranger could make someone's inbox receive sign-up codes.
 * Registration will report the conflict later, to someone who got that far.
 */
export async function requestVerificationCode(req, res) {
  try {
    const { email } = req.body || {};
    if (!email || !String(email).includes('@')) {
      return res.status(400).json({ error: 'A valid email address is required.' });
    }

    const existing = await User.findByEmail(email);
    if (existing) {
      return res.status(202).json({
        sent: true,
        expiresInMinutes: CODE_TTL_MINUTES,
        message: 'If that address can be used, a code is on its way.',
      });
    }

    const result = await requestCode(email);
    if (!result.ok) {
      const status = result.retryAfterMinutes ? 429 : 400;
      return res.status(status).json({ error: result.error, retryAfterMinutes: result.retryAfterMinutes });
    }

    return res.status(202).json({
      sent: true,
      expiresInMinutes: result.expiresInMinutes,
      message: 'If that address can be used, a code is on its way.',
      // Only present when no mail provider is configured and this is not production. It is
      // what lets development and the test suites complete a sign-up without a mail account.
      ...(result.devCode ? { devCode: result.devCode, devNote: 'No mail provider configured — code returned for development only.' } : {}),
      ...(result.delivered ? {} : { warning: 'The code could not be emailed. Check the mail provider settings.' }),
    });
  } catch (err) {
    console.error('Verification request error:', err);
    return res.status(500).json({ error: 'Could not send a verification code.' });
  }
}

/**
 * POST /api/auth/verification/confirm  { email, code }
 *
 * On success returns a short-lived `verificationToken` that registration requires. The app
 * carries it through the password and terms screens.
 */
export async function confirmVerificationCode(req, res) {
  try {
    const { email, code } = req.body || {};
    const result = await confirmCode(email, code);

    if (!result.ok) {
      return res.status(400).json({ error: result.error, attemptsLeft: result.attemptsLeft });
    }
    return res.json({ verified: true, email: result.email, verificationToken: result.verificationToken });
  } catch (err) {
    console.error('Verification confirm error:', err);
    return res.status(500).json({ error: 'Could not check that code.' });
  }
}

/** Startup log line, so it is obvious which mode a deployment is in. */
export function describeAuthSetup() {
  return isRequired()
    ? `Email verification required · mail via ${activeProvider()}`
    : 'Email verification off (set REQUIRE_EMAIL_VERIFICATION=true to require it)';
}

export default { getAuthConfig, requestVerificationCode, confirmVerificationCode, describeAuthSetup };
