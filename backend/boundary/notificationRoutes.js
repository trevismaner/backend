import express from 'express';
import viewNotifications from '../control/ViewNotificationsController.js';
import markNotificationRead from '../control/MarkNotificationReadController.js';
import viewNotificationPreferences from '../control/ViewNotificationPreferencesController.js';
import updateNotificationPreferences from '../control/UpdateNotificationPreferencesController.js';
import registerPushToken from '../control/RegisterPushTokenController.js';
import { requireAuth } from '../middleware/auth.js';

const router = express.Router();

router.use(requireAuth);

router.get('/', viewNotifications);
router.patch('/:notificationId/read', markNotificationRead);
router.get('/preferences', viewNotificationPreferences);
router.put('/preferences', updateNotificationPreferences);
router.post('/push-token', registerPushToken);

export default router;
