import Badge from '../entities/Badge.js';
import AdminAuditLog, { ADMIN_ACTIONS } from '../entities/AdminAuditLog.js';
import { AdminError, guard, withTransaction } from './AdminControlHelpers.js';
import { validateBadge } from './AdminValidators.js';
import { isSystemBadge, toBadgeJSON } from './AdminBadgeRules.js';

export default class AdminUpdateBadgeController {
  async updateBadge({ adminId, badgeId, input }) {
    const changes = validateBadge(input, { partial: true });

    return guard(
      () =>
        withTransaction(async (client) => {
          const before = await Badge.findById(badgeId, client);
          if (!before) throw AdminError.notFound('Badge not found');

          if (changes.name && changes.name !== before.name && isSystemBadge(before.name)) {
            throw AdminError.validation(`'${before.name}' is awarded automatically and cannot be renamed`);
          }

          const updated = await Badge.update(badgeId, changes, client);
          await AdminAuditLog.record(
            {
              adminId,
              action: ADMIN_ACTIONS.UPDATE_BADGE,
              targetType: 'badge',
              targetId: badgeId,
              details: { name: before.name, from: toBadgeJSON(before), to: changes },
            },
            client
          );
          return toBadgeJSON(updated);
        }),
      { duplicate: 'A badge with this name already exists' }
    );
  }
}
