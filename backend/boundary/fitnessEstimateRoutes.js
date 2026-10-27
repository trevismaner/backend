import express from 'express';
import viewFitnessEstimate from '../control/ViewFitnessEstimateController.js';
import { requireAuth } from '../middleware/auth.js';

const router = express.Router();

router.use(requireAuth);

// The fitness estimate AI (Kalman filter over heart rate vs pace) and the level classifier
// (Random Forest), answered together — see ViewFitnessEstimateController for why.
router.get('/', viewFitnessEstimate);

export default router;
