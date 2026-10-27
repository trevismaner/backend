import express from 'express';
import listConnections from '../control/ListConnectionsController.js';
import startConnection from '../control/StartConnectionController.js';
import connectionCallback from '../control/ConnectionCallbackController.js';
import disconnectConnection from '../control/DisconnectConnectionController.js';
import syncWearable from '../control/SyncWearableController.js';
import { requireAuth } from '../middleware/auth.js';

const router = express.Router();

/**
 * The OAuth callback is deliberately NOT behind requireAuth: the provider redirects the
 * user's browser here, which carries no app token. The single-use `state` issued when the
 * handshake started is what identifies the user.
 */
router.get('/:provider/callback', connectionCallback);   // RU-16 / RU-49 step 2

router.use(requireAuth);

router.get('/', listConnections);                        // RU-16 / RU-49
router.post('/:provider/connect', startConnection);      // RU-16 / RU-49 step 1
router.delete('/:provider', disconnectConnection);       // RU-16 / RU-49
router.post('/:provider/sync', syncWearable);            // RU-16 — import activities

export default router;
