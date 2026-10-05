import AdminUpdateRewardController from '../control/AdminUpdateRewardController.js';
import { getAdminId, parseId, sendError } from './AdminBoundaryHelpers.js';

const controller = new AdminUpdateRewardController();

// PATCH /api/admin/rewards/:rewardId
// body: any of { name, description, pointsRequired, rewardType, stock, isActive }
export default async function adminUpdateRewardBoundary(req, res) {
  try {
    const reward = await controller.updateReward({
      adminId: getAdminId(req),
      rewardId: parseId(req.params.rewardId, 'rewardId'),
      input: req.body ?? {},
    });
    return res.json({ message: 'Reward updated', reward });
  } catch (err) {
    return sendError(res, err, 'update reward');
  }
}
