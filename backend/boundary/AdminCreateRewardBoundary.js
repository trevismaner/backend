import AdminCreateRewardController from '../control/AdminCreateRewardController.js';
import { getAdminId, sendError } from './AdminBoundaryHelpers.js';

const controller = new AdminCreateRewardController();

// POST /api/admin/rewards
// body: { name, pointsRequired, description?, rewardType?, stock? (null = unlimited), isActive? }
export default async function adminCreateRewardBoundary(req, res) {
  try {
    const reward = await controller.createReward({ adminId: getAdminId(req), input: req.body ?? {} });
    return res.status(201).json({ message: 'Reward created', reward });
  } catch (err) {
    return sendError(res, err, 'create reward');
  }
}
