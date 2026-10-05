import Badge from '../entities/Badge.js';
import User from '../entities/User.js';
import Notification from '../entities/Notification.js';
import AdminAuditLog, { ADMIN_ACTIONS } from '../entities/AdminAuditLog.js';
import { AdminError, guard, withTransaction } from './AdminControlHelpers.js';

export default class AdminAwardBadgeController {
  // Returns the badge name.
  async awardBadge({ adminId, userId, badgeId }) {
    return guard(() =>
      withTransaction(async (client) => {
        if (!(await User.findById(userId, client))) throw AdminError.notFound('User not found');

        const badge = await Badge.findById(badgeId, client);
        if (!badge) throw AdminError.notFound('Badge not found');

        if (!(await Badge.awardById(userId, badgeId, client))) {
          throw AdminError.conflict('User already has this badge');
        }

        await Notification.create(
          userId,
          {
            type: 'new_badge',
            title: 'New badge earned!',
            body: `You've been awarded the "${badge.name}" badge.`,
          },
          client
        );

        await AdminAuditLog.record(
          {
            adminId,
            action: ADMIN_ACTIONS.AWARD_BADGE,
            targetUserId: userId,
            details: { badgeId, badgeName: badge.name },
          },
          client
        );
        return badge.name;
      })
    );
  }
}
