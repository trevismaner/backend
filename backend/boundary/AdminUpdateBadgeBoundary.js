import AdminUpdateBadgeController from '../control/AdminUpdateBadgeController.js';
import { getAdminId, parseId, sendError } from './AdminBoundaryHelpers.js';

const controller = new AdminUpdateBadgeController();

// PATCH /api/admin/badges/:badgeId   body: any of { name, description, iconUrl }
export default async function adminUpdateBadgeBoundary(req, res) {
  try {
    const badge = await controller.updateBadge({
      adminId: getAdminId(req),
      badgeId: parseId(req.params.badgeId, 'badgeId'),
      input: req.body ?? {},
    });
    return res.json({ message: 'Badge updated', badge });
  } catch (err) {
    return sendError(res, err, 'update badge');
  }
}
