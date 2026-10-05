import AdminAuditLog, { ADMIN_ACTIONS, TARGET_TYPES } from '../entities/AdminAuditLog.js';
import { guard } from './AdminControlHelpers.js';
import { requireOneOf } from './AdminValidators.js';

export default class AdminViewAuditLogsController {
  async viewAuditLogs({ action, targetType, adminId, targetUserId, targetId, limit, offset }) {
    if (action) requireOneOf(action, Object.values(ADMIN_ACTIONS), 'action');
    if (targetType) requireOneOf(targetType, TARGET_TYPES, 'targetType');

    return guard(() =>
      AdminAuditLog.list({ action, targetType, adminId, targetUserId, targetId, limit, offset })
    );
  }
}
