import express from 'express';
import viewProfile from '../control/ViewProfileController.js';
import updateProfile from '../control/UpdateProfileController.js';
import viewInstructorCredentials from '../control/ViewInstructorCredentialsController.js';
import submitInstructorCredentials from '../control/SubmitInstructorCredentialsController.js';
import { requireAuth } from '../middleware/auth.js';

const router = express.Router();

router.get('/', requireAuth, viewProfile);
router.put('/', requireAuth, updateProfile);

// IU-04 / SA-11: instructors submit credentials for a System Admin to verify.
router.get('/credentials', requireAuth, viewInstructorCredentials);
router.put('/credentials', requireAuth, submitInstructorCredentials);

export default router;
