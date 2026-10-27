import AdminDeleteBadgeController from '../control/AdminDeleteBadgeController.js';
import { getAdminId, parseId, sendError } from './AdminBoundaryHelpers.js';

const controller = new AdminDeleteBadgeController();

// DELETE /api/admin/badges/:badgeId
export default async function adminDeleteBadgeBoundary(req, res) {
  try {
    await controller.deleteBadge({
      adminId: getAdminId(req),
      badgeId: parseId(req.params.badgeId, 'badgeId'),
    });
    return res.json({ message: 'Badge deleted' });
  } catch (err) {
    return sendError(res, err, 'delete badge');
  }
}
