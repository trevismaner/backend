import express from 'express';
import viewRiskScore from '../control/ViewRiskScoreController.js';
import updateRiskAssessmentForm from '../control/UpdateRiskAssessmentFormController.js';
import { requireAuth } from '../middleware/auth.js';

const router = express.Router();

router.use(requireAuth);

router.get('/', viewRiskScore);                  // RU-10
router.put('/form', updateRiskAssessmentForm);   // RU-11 (saving the form rescores)

export default router;
