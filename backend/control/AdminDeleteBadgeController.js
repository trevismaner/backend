import Badge from '../entities/Badge.js';
import AdminAuditLog, { ADMIN_ACTIONS } from '../entities/AdminAuditLog.js';
import { AdminError, guard, withTransaction } from './AdminControlHelpers.js';
import { isSystemBadge } from './AdminBadgeRules.js';

// Only badges nobody has earned can be deleted (user_badges has no ON DELETE rule).
export default class AdminDeleteBadgeController {
  async deleteBadge({ adminId, badgeId }) {
    return guard(
      () =>
        withTransaction(async (client) => {
          const badge = await Badge.findById(badgeId, client);
          if (!badge) throw AdminError.notFound('Badge not found');

          if (isSystemBadge(badge.name)) {
            throw AdminError.validation(`'${badge.name}' is awarded automatically and cannot be deleted`);
          }

          const earned = await Badge.countEarned(badgeId, client);
          if (earned > 0) {
            throw AdminError.conflict(
              `This badge has been earned by ${earned} user(s). Revoke it from them before deleting.`
            );
          }

          await AdminAuditLog.record(
            {
              adminId,
              action: ADMIN_ACTIONS.DELETE_BADGE,
              targetType: 'badge',
              targetId: badgeId,
              details: { name: badge.name },
            },
            client
          );
          await Badge.delete(badgeId, client);
        }),
      { referenced: 'This badge was just earned by a user. Revoke it before deleting.' }
    );
  }
}
