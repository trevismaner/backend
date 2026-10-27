import User from '../entities/User.js';
import AdminAuditLog, { ADMIN_ACTIONS } from '../entities/AdminAuditLog.js';
import {
  assertNotLastActiveAdmin,
  assertNotSelf,
  guard,
  lockTargetUser,
  withTransaction,
} from './AdminControlHelpers.js';

export default class AdminDeleteUserController {
  async deleteUser({ adminId, userId }) {
    assertNotSelf(adminId, userId, 'You cannot delete your own account from the admin panel');

    return guard(
      () =>
        withTransaction(async (client) => {
          const { target, activeAdminCount } = await lockTargetUser(client, userId);
          assertNotLastActiveAdmin(target, activeAdminCount);

          // Recorded first, keeping a snapshot since the row is about to disappear.
          await AdminAuditLog.record(
            {
              adminId,
              action: ADMIN_ACTIONS.DELETE_USER,
              targetUserId: userId,
              details: { email: target.email, name: target.name, role: target.role },
            },
            client
          );
          await User.delete(userId, client);
        }),
      {
        referenced:
          'This user created groups, tournaments, events or instructor posts. Suspend the account instead.',
      }
    );
  }
}
