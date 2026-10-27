import { ROLES } from '../entities/User.js';

/**
 * Gate for writing to the Instructor Board (IU-05, IU-06, IU-08).
 *
 * SA-11 says an admin verifies credentials "so that only qualified professionals can post
 * on the Instructor Board", so an instructor whose credentials have not been verified yet
 * is authenticated but cannot publish. System admins pass too — SA-16 to SA-18 let them
 * post and moderate board content.
 *
 * Must run AFTER requireAuth, which loads the current user from the database (so a
 * verification granted a moment ago applies immediately) and rejects suspended accounts.
 */
export function requireVerifiedInstructor(req, res, next) {
  const user = req.user;

  if (!user) {
    return res.status(401).json({ error: 'No token provided' });
  }

  if (user.role === ROLES.SYSTEM_ADMIN) {
    return next();
  }

  if (user.role !== ROLES.INSTRUCTOR) {
    return res.status(403).json({ error: 'Only instructors can post to the Instructor Board' });
  }

  if (!user.credentialsVerified) {
    return res.status(403).json({
      error: 'Your credentials are still being reviewed. You can post once an admin verifies your account.',
    });
  }

  return next();
}
