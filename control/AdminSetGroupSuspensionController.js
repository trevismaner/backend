import Group from '../entities/Group.js';
import Notification from '../entities/Notification.js';
import AdminAuditLog, { ADMIN_ACTIONS } from '../entities/AdminAuditLog.js';
import { AdminError, guard, withTransaction } from './AdminControlHelpers.js';
import { requireBoolean } from './AdminValidators.js';

export default class AdminSetGroupSuspensionController {
  async setSuspension({ adminId, groupId, isSuspended, reason }) {
    requireBoolean(isSuspended, 'isSuspended');

    return guard(() =>
      withTransaction(async (client) => {
        const group = await Group.findById(groupId, client, { forUpdate: true });
        if (!group) throw AdminError.notFound('Group not found');
        if (group.isSuspended === isSuspended) {
          throw AdminError.conflict(`Group is already ${isSuspended ? 'suspended' : 'active'}`);
        }

        const updated = await Group.setSuspended(groupId, isSuspended, client);

        await Notification.createForGroupMembers(
          groupId,
          {
            type: 'group_update',
            title: isSuspended ? `${group.name} has been suspended` : `${group.name} is active again`,
            body: isSuspended
              ? `This group has been suspended by an administrator.${reason ? ` Reason: ${reason}` : ''}`
              : 'This group has been reinstated by an administrator.',
          },
          client
        );

        await AdminAuditLog.record(
          {
            adminId,
            action: isSuspended ? ADMIN_ACTIONS.SUSPEND_GROUP : ADMIN_ACTIONS.UNSUSPEND_GROUP,
            targetType: 'group',
            targetId: groupId,
            details: { name: group.name, reason },
          },
          client
        );
        return updated.toJSON();
      })
    );
  }
}
