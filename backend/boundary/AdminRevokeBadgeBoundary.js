import AdminRevokeBadgeController from '../control/AdminRevokeBadgeController.js';
import { getAdminId, parseId, readReason, sendError } from './AdminBoundaryHelpers.js';

const controller = new AdminRevokeBadgeController();

// DELETE /api/admin/users/:userId/badges/:badgeId   body (optional): { reason }
export default async function adminRevokeBadgeBoundary(req, res) {
  try {
    await controller.revokeBadge({
      adminId: getAdminId(req),
      userId: parseId(req.params.userId, 'userId'),
      badgeId: parseId(req.params.badgeId, 'badgeId'),
      reason: readReason(req.body),
    });
    return res.json({ message: 'Badge revoked' });
  } catch (err) {
    return sendError(res, err, 'revoke badge');
  }
}
