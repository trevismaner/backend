import rateLimit, { ipKeyGenerator } from 'express-rate-limit';

/**
 * Request limits.
 *
 * These exist for three different reasons, which is why there are three of them rather than
 * one number applied everywhere:
 *
 *   api        a backstop, so one client cannot monopolise a small instance or exhaust a
 *              free-tier database's connections.
 *   auth       sign-in and registration are where guessing happens. A tight limit on failed
 *              attempts costs an honest user nothing and makes credential stuffing slow.
 *   expensive  anything that calls a paid third-party API. Without a limit here, one script
 *              in a loop is a bill rather than an outage.
 *
 * Limits are counted per signed-in user where there is one, and per IP otherwise — otherwise
 * everyone behind one university NAT shares a single allowance.
 *
 * Behind a proxy (Render, Fly, any load balancer) `trust proxy` must be set in server.js, or
 * every request appears to come from the proxy and the whole platform shares one bucket.
 */

/**
 * `ipKeyGenerator` rather than `req.ip` directly: a single IPv6 customer is routinely given a
 * whole /64, so keying on the full address would let one client present billions of distinct
 * "IPs" and never hit a limit. The helper narrows an IPv6 address to its subnet, and leaves
 * IPv4 alone.
 */
const byUserOrIp = (req) => (req.user?.userId ? `u:${req.user.userId}` : `ip:${ipKeyGenerator(req.ip)}`);
const byIp = (req) => `ip:${ipKeyGenerator(req.ip)}`;

const message = (retryAfterNote) => ({
  error: `Too many requests. ${retryAfterNote}`,
});

/** Everything under /api. Generous: this is a backstop, not a throttle. */
export const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: Number(process.env.RATE_LIMIT_PER_MINUTE) || 300,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: byUserOrIp,
  message: message('Try again in a minute.'),
  // The test suites hammer the API deliberately; a limit would make them flaky rather than
  // informative. Production and development both stay limited.
  skip: () => process.env.NODE_ENV === 'test',
});

/** Sign-in and registration. Only failures count, so a correct password is never punished. */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: Number(process.env.RATE_LIMIT_AUTH) || 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: byIp,
  skipSuccessfulRequests: true,
  message: message('Too many sign-in attempts — wait 15 minutes.'),
  skip: () => process.env.NODE_ENV === 'test',
});

/**
 * Anything that costs money per call. Deliberately small: generating a training plan is
 * something a person does occasionally, not repeatedly, and the cost of being wrong here is
 * a bill rather than a slow page.
 */
export const expensiveLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: Number(process.env.RATE_LIMIT_AI_PER_HOUR) || 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: byUserOrIp,
  message: message('Plan generation is limited to a few per hour. Try again later.'),
  skip: () => process.env.NODE_ENV === 'test',
});
