import express from 'express';
import register from '../control/RegisterController.js';
import login from '../control/LoginController.js';
import logout from '../control/LogoutController.js';
import getCurrentUser from '../control/GetCurrentUserController.js';
import { requireAuth } from '../middleware/auth.js';
import { authLimiter } from '../middleware/rateLimit.js';

const router = express.Router();

// Only failed attempts count towards the limit, so signing in correctly is never
// penalised — it is guessing that gets slowed down.
router.post('/register', authLimiter, register);
router.post('/login', authLimiter, login);
router.post('/logout', requireAuth, logout);
router.get('/me', requireAuth, getCurrentUser);

export default router;
