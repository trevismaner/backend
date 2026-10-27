import express from 'express';
import createFitnessPlan from '../control/CreateFitnessPlanController.js';
import viewFitnessPlan from '../control/ViewFitnessPlanController.js';
import updateFitnessPlan from '../control/UpdateFitnessPlanController.js';
import deleteFitnessPlan from '../control/DeleteFitnessPlanController.js';
import activateFitnessPlan from '../control/ActivateFitnessPlanController.js';
import generateFitnessPlan from '../control/GenerateFitnessPlanController.js';
import { completePlanSession, clearPlanSession } from '../control/PlanSessionController.js';
import { requireAuth } from '../middleware/auth.js';
import { expensiveLimiter } from '../middleware/rateLimit.js';

const router = express.Router();

router.use(requireAuth);

router.post('/', createFitnessPlan);                     // RU-12
router.get('/', viewFitnessPlan);                        // RU-13
router.put('/:planId', updateFitnessPlan);               // RU-14
router.delete('/:planId', deleteFitnessPlan);            // RU-15
router.patch('/:planId/activate', activateFitnessPlan);  // switch back to an earlier plan

// Generating a schedule may call a paid API, so it carries the tighter limit. It answers 202
// and does the work afterwards — poll GET / for generationStatus.
router.post('/:planId/generate', expensiveLimiter, generateFitnessPlan);

// Ticking a planned session off against a run that was actually done.
router.patch('/sessions/:sessionId/complete', completePlanSession);
router.delete('/sessions/:sessionId/complete', clearPlanSession);

export default router;
