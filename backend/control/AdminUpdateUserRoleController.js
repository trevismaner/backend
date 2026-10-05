import User, { ROLES } from '../entities/User.js';
import AdminAuditLog, { ADMIN_ACTIONS } from '../entities/AdminAuditLog.js';
import {
  AdminError,
  assertNotLastActiveAdmin,
  assertNotSelf,
  guard,
  lockTargetUser,
  withTransaction,
} from './AdminControlHelpers.js';
import { requireRole } from './AdminValidators.js';

export default class AdminUpdateUserRoleController {
  async updateRole({ adminId, userId, role }) {
    requireRole(role);
    if (role !== ROLES.SYSTEM_ADMIN) {
      assertNotSelf(adminId, userId, 'You cannot remove your own system admin role');
    }

    return guard(() =>
      withTransaction(async (client) => {
        const { target, activeAdminCount } = await lockTargetUser(client, userId);

        if (target.role === role) throw AdminError.conflict(`User already has role '${role}'`);
        if (role !== ROLES.SYSTEM_ADMIN) assertNotLastActiveAdmin(target, activeAdminCount);

        const updated = await User.setRole(userId, role, client);
        await AdminAuditLog.record(
          {
            adminId,
            action: ADMIN_ACTIONS.CHANGE_ROLE,
            targetUserId: userId,
            details: { from: target.role, to: role },
          },
          client
        );
        return updated.toAdminJSON();
      })
    );
  }
}
