import Reward from '../entities/Reward.js';
import AdminAuditLog, { ADMIN_ACTIONS } from '../entities/AdminAuditLog.js';
import { guard, withTransaction } from './AdminControlHelpers.js';
import { validateReward } from './AdminValidators.js';

export default class AdminCreateRewardController {
  async createReward({ adminId, input }) {
    const data = validateReward(input);

    return guard(() =>
      withTransaction(async (client) => {
        const reward = await Reward.create(data, client);
        await AdminAuditLog.record(
          {
            adminId,
            action: ADMIN_ACTIONS.CREATE_REWARD,
            targetType: 'reward',
            targetId: reward.rewardId,
            details: data,
          },
          client
        );
        return reward.toAdminJSON();
      })
    );
  }
}
