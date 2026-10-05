import { ROLES } from '../entities/User.js';

/**
 * Must run AFTER requireAuth, which loads the current user from the database
 * (so role changes apply immediately) and already rejects suspended accounts.
 */
export function requireSystemAdmin(req, res, next) {
  if (!req.user || req.user.role !== ROLES.SYSTEM_ADMIN) {
    return res.status(403).json({ error: 'System admin access required' });
  }
  req.admin = req.user;
  return next();
}
