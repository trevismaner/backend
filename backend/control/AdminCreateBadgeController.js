import Badge from '../entities/Badge.js';
import AdminAuditLog, { ADMIN_ACTIONS } from '../entities/AdminAuditLog.js';
import { guard, withTransaction } from './AdminControlHelpers.js';
import { validateBadge } from './AdminValidators.js';
import { toBadgeJSON } from './AdminBadgeRules.js';

export default class AdminCreateBadgeController {
  async createBadge({ adminId, input }) {
    const data = validateBadge(input);

    return guard(
      () =>
        withTransaction(async (client) => {
          const badge = await Badge.create(data, client);
          await AdminAuditLog.record(
            {
              adminId,
              action: ADMIN_ACTIONS.CREATE_BADGE,
              targetType: 'badge',
              targetId: badge.badge_id,
              details: data,
            },
            client
          );
          return toBadgeJSON(badge);
        }),
      { duplicate: 'A badge with this name already exists' }
    );
  }
}
