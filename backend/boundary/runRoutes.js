import express from 'express';
import createRun from '../control/CreateRunController.js';
import viewRunHistory from '../control/ViewRunHistoryController.js';
import searchRunHistory from '../control/SearchRunHistoryController.js';
import viewRunDetails from '../control/ViewRunDetailsController.js';
import viewRunInsights from '../control/ViewRunInsightsController.js';
import updateRun from '../control/UpdateRunController.js';
import deleteRun from '../control/DeleteRunController.js';
import updateRunName from '../control/UpdateRunNameController.js';
import updateRunDescription from '../control/UpdateRunDescriptionController.js';
import {
  startActiveRun,
  viewActiveRun,
  saveActiveRunProgress,
  discardActiveRun,
  finishActiveRun,
} from '../control/TrackRunController.js';
import { requireAuth } from '../middleware/auth.js';

const router = express.Router();

router.use(requireAuth);

// A run while it is still being recorded. These sit above '/:runId' so that "active" is
// not read as a run id.
router.post('/active', startActiveRun);
router.get('/active', viewActiveRun);
router.patch('/active', saveActiveRunProgress);
router.delete('/active', discardActiveRun);
router.post('/active/finish', finishActiveRun);

router.post('/', createRun);
router.get('/', viewRunHistory);
router.get('/search', searchRunHistory);
router.get('/insights', viewRunInsights); // RU-17/18/19 — before '/:runId' so it isn't read as an id

router.get('/:runId', viewRunDetails);
router.patch('/:runId', updateRun);    // correct the recorded figures
router.delete('/:runId', deleteRun);   // remove a run, reclaiming its points
router.patch('/:runId/name', updateRunName);
router.patch('/:runId/description', updateRunDescription);

export default router;
