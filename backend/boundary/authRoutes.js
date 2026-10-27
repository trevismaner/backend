import express from 'express';
import register from '../control/RegisterController.js';
import login from '../control/LoginController.js';
import logout from '../control/LogoutController.js';
import getCurrentUser from '../control/GetCurrentUserController.js';
import {
  getAuthConfig, requestVerificationCode, confirmVerificationCode,
} from '../control/EmailVerificationController.js';
import { requireAuth } from '../middleware/auth.js';
import { authLimiter, expensiveLimiter } from '../middleware/rateLimit.js';

const router = express.Router();

// The app reads this to know the password rules and whether the verification step applies,
// so the server can change its mind without the app being rebuilt. Unauthenticated by
// necessity — it is read on the sign-up screens — and it contains no user data.
router.get('/config', getAuthConfig);

// Sending email costs money and can be used to bother someone else's inbox, so requesting a
// code goes through the expensive limiter as well as the per-address cap inside the
// controller. Confirming is a guess at a code, so it belongs with the auth limiter.
router.post('/verification/request', expensiveLimiter, requestVerificationCode);
router.post('/verification/confirm', authLimiter, confirmVerificationCode);

// Only failed attempts count towards the limit, so signing in correctly is never
// penalised — it is guessing that gets slowed down.
router.post('/register', authLimiter, register);
router.post('/login', authLimiter, login);
router.post('/logout', requireAuth, logout);
router.get('/me', requireAuth, getCurrentUser);

export default router;
