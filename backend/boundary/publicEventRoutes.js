import express from 'express';
import viewPublicEvents from '../control/ViewPublicEventsController.js';
import viewPublicEventDetails from '../control/ViewPublicEventDetailsController.js';
import joinPublicEvent from '../control/JoinPublicEventController.js';
import withdrawFromPublicEvent from '../control/WithdrawFromPublicEventController.js';
import { requireAuth } from '../middleware/auth.js';

const router = express.Router();

router.use(requireAuth);

router.get('/', viewPublicEvents);                          // RU-39
router.get('/:eventId', viewPublicEventDetails);            // RU-39
router.post('/:eventId/join', joinPublicEvent);             // RU-40
router.post('/:eventId/withdraw', withdrawFromPublicEvent); // RU-43

export default router;
