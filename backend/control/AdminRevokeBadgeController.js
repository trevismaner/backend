import Badge from '../entities/Badge.js';
import AdminAuditLog, { ADMIN_ACTIONS } from '../entities/AdminAuditLog.js';
import { AdminError, guard, withTransaction } from './AdminControlHelpers.js';

export default class AdminRevokeBadgeController {
  async revokeBadge({ adminId, userId, badgeId, reason }) {
    return guard(() =>
      withTransaction(async (client) => {
        const badge = await Badge.findById(badgeId, client);
        if (!badge) throw AdminError.notFound('Badge not found');

        if (!(await Badge.revoke(userId, badgeId, client))) {
          throw AdminError.notFound('User does not have this badge');
        }

        await AdminAuditLog.record(
          {
            adminId,
            action: ADMIN_ACTIONS.REVOKE_BADGE,
            targetUserId: userId,
            details: { badgeId, badgeName: badge.name, reason },
          },
          client
        );
      })
    );
  }
}
