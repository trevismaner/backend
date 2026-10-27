import AdminListRewardsController from '../control/AdminListRewardsController.js';
import { sendError } from './AdminBoundaryHelpers.js';

const controller = new AdminListRewardsController();

// GET /api/admin/rewards
export default async function adminListRewardsBoundary(req, res) {
  try {
    const rewards = await controller.listRewards();
    return res.json({ rewards });
  } catch (err) {
    return sendError(res, err, 'list rewards');
  }
}
