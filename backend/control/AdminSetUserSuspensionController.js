import User from '../entities/User.js';
import AdminAuditLog, { ADMIN_ACTIONS } from '../entities/AdminAuditLog.js';
import {
  AdminError,
  assertNotLastActiveAdmin,
  assertNotSelf,
  guard,
  lockTargetUser,
  withTransaction,
} from './AdminControlHelpers.js';
import { requireBoolean } from './AdminValidators.js';

export default class AdminSetUserSuspensionController {
  async setSuspension({ adminId, userId, isSuspended, reason }) {
    requireBoolean(isSuspended, 'isSuspended');
    assertNotSelf(adminId, userId, 'You cannot change your own suspension status');

    return guard(() =>
      withTransaction(async (client) => {
        const { target, activeAdminCount } = await lockTargetUser(client, userId);

        if (target.isSuspended === isSuspended) {
          throw AdminError.conflict(`User is already ${isSuspended ? 'suspended' : 'active'}`);
        }
        if (isSuspended) assertNotLastActiveAdmin(target, activeAdminCount);

        const updated = await User.setSuspended(userId, isSuspended, client);
        await AdminAuditLog.record(
          {
            adminId,
            action: isSuspended ? ADMIN_ACTIONS.SUSPEND_USER : ADMIN_ACTIONS.UNSUSPEND_USER,
            targetUserId: userId,
            details: { reason },
          },
          client
        );
        return updated.toAdminJSON();
      })
    );
  }
}
