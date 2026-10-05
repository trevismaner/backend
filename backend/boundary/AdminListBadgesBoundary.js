import AdminListBadgesController from '../control/AdminListBadgesController.js';
import { sendError } from './AdminBoundaryHelpers.js';

const controller = new AdminListBadgesController();

// GET /api/admin/badges
export default async function adminListBadgesBoundary(req, res) {
  try {
    const badges = await controller.listBadges();
    return res.json({ badges });
  } catch (err) {
    return sendError(res, err, 'list badges');
  }
}
