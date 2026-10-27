import express from 'express';
import viewGlobalLeaderboard from '../control/ViewGlobalLeaderboardController.js';
import { requireAuth } from '../middleware/auth.js';

const router = express.Router();

router.use(requireAuth);

router.get('/', viewGlobalLeaderboard);

export default router;
