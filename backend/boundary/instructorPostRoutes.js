import express from 'express';
import createInstructorPost from '../control/CreateInstructorPostController.js';
import viewInstructorPosts from '../control/ViewInstructorPostsController.js';
import viewMyInstructorPosts from '../control/ViewMyInstructorPostsController.js';
import viewInstructorPostDetails from '../control/ViewInstructorPostDetailsController.js';
import updateInstructorPost from '../control/UpdateInstructorPostController.js';
import deleteInstructorPost from '../control/DeleteInstructorPostController.js';
import { requireAuth } from '../middleware/auth.js';
import { requireVerifiedInstructor } from '../middleware/requireVerifiedInstructor.js';

const router = express.Router();

// Everyone signed in can READ the board: instructors reviewing content (IU-07) and
// registered users looking for advice (RU-44).
router.use(requireAuth);

router.get('/', viewInstructorPosts);           // IU-07 / RU-44
router.get('/mine', viewMyInstructorPosts);     // IU-07 (own posts + dashboard stats)
router.get('/:postId', viewInstructorPostDetails); // IU-07 / RU-44 (single post)

// Writing is limited to verified instructors (and system admins) — see SA-11.
router.post('/', requireVerifiedInstructor, createInstructorPost);       // IU-05
router.put('/:postId', requireVerifiedInstructor, updateInstructorPost); // IU-06
router.delete('/:postId', requireVerifiedInstructor, deleteInstructorPost); // IU-08

export default router;
