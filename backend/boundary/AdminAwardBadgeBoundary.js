import AdminAwardBadgeController from '../control/AdminAwardBadgeController.js';
import { getAdminId, parseId, sendError } from './AdminBoundaryHelpers.js';

const controller = new AdminAwardBadgeController();

// POST /api/admin/users/:userId/badges   body: { badgeId }
export default async function adminAwardBadgeBoundary(req, res) {
  try {
    const badgeName = await controller.awardBadge({
      adminId: getAdminId(req),
      userId: parseId(req.params.userId, 'userId'),
      badgeId: parseId(req.body?.badgeId, 'badgeId'),
    });
    return res.status(201).json({ message: `Awarded "${badgeName}"` });
  } catch (err) {
    return sendError(res, err, 'award badge');
  }
}
