import AdminViewStatsController from '../control/AdminViewStatsController.js';
import { sendError } from './AdminBoundaryHelpers.js';

const controller = new AdminViewStatsController();

// GET /api/admin/stats
export default async function adminViewStatsBoundary(req, res) {
  try {
    const stats = await controller.viewStats();
    return res.json({ stats });
  } catch (err) {
    return sendError(res, err, 'view stats');
  }
}
