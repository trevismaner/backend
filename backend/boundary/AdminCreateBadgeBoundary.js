import AdminCreateBadgeController from '../control/AdminCreateBadgeController.js';
import { getAdminId, sendError } from './AdminBoundaryHelpers.js';

const controller = new AdminCreateBadgeController();

// POST /api/admin/badges   body: { name, description?, iconUrl? }
export default async function adminCreateBadgeBoundary(req, res) {
  try {
    const badge = await controller.createBadge({ adminId: getAdminId(req), input: req.body ?? {} });
    return res.status(201).json({ message: 'Badge created', badge });
  } catch (err) {
    return sendError(res, err, 'create badge');
  }
}
