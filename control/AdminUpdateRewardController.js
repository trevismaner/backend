import Reward from '../entities/Reward.js';
import AdminAuditLog, { ADMIN_ACTIONS } from '../entities/AdminAuditLog.js';
import { AdminError, guard, withTransaction } from './AdminControlHelpers.js';
import { validateReward } from './AdminValidators.js';

// Rewards are never deleted (past claims reference them); set isActive: false instead.
export default class AdminUpdateRewardController {
  async updateReward({ adminId, rewardId, input }) {
    const changes = validateReward(input, { partial: true });

    return guard(() =>
      withTransaction(async (client) => {
        const before = await Reward.findById(rewardId, client, { forUpdate: true });
        if (!before) throw AdminError.notFound('Reward not found');

        const updated = await Reward.update(rewardId, changes, client);

        const previous = {};
        for (const key of Object.keys(changes)) previous[key] = before[key];

        await AdminAuditLog.record(
          {
            adminId,
            action: ADMIN_ACTIONS.UPDATE_REWARD,
            targetType: 'reward',
            targetId: rewardId,
            details: { name: before.name, from: previous, to: changes },
          },
          client
        );
        return updated.toAdminJSON();
      })
    );
  }
}
