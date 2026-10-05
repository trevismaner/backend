import User, { ROLES } from '../entities/User.js';
import Notification from '../entities/Notification.js';
import AdminAuditLog, { ADMIN_ACTIONS } from '../entities/AdminAuditLog.js';
import { AdminError, guard, withTransaction } from './AdminControlHelpers.js';
import { requireBoolean } from './AdminValidators.js';

export default class AdminSetInstructorVerificationController {
  async setVerification({ adminId, userId, verified, reason }) {
    requireBoolean(verified, 'verified');

    return guard(() =>
      withTransaction(async (client) => {
        const target = await User.findById(userId, client, { forUpdate: true });
        if (!target) throw AdminError.notFound('User not found');
        if (target.role !== ROLES.INSTRUCTOR) throw AdminError.validation('User is not an instructor');
        if (!!target.credentialsVerified === verified) {
          throw AdminError.conflict(`Instructor is already ${verified ? 'verified' : 'unverified'}`);
        }

        const updated = await User.setCredentialsVerified(userId, verified, client);

        await Notification.create(
          userId,
          {
            type: 'account_update',
            title: verified ? 'Your instructor credentials are verified' : 'Instructor verification removed',
            body: verified
              ? 'You can now post on the instructor board.'
              : `Your instructor verification was removed.${reason ? ` Reason: ${reason}` : ''}`,
          },
          client
        );

        await AdminAuditLog.record(
          {
            adminId,
            action: verified ? ADMIN_ACTIONS.VERIFY_INSTRUCTOR : ADMIN_ACTIONS.UNVERIFY_INSTRUCTOR,
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
