import Group from '../entities/Group.js';
import Notification from '../entities/Notification.js';
import AdminAuditLog, { ADMIN_ACTIONS } from '../entities/AdminAuditLog.js';
import { AdminError, guard, withTransaction } from './AdminControlHelpers.js';

// Also deletes the group's memberships and tournaments (ON DELETE CASCADE).
export default class AdminDeleteGroupController {
  async deleteGroup({ adminId, groupId, reason }) {
    return guard(() =>
      withTransaction(async (client) => {
        const group = await Group.findById(groupId, client, { forUpdate: true });
        if (!group) throw AdminError.notFound('Group not found');

        // Notify before deleting, while the membership rows still exist.
        await Notification.createForGroupMembers(
          groupId,
          {
            type: 'group_update',
            title: `${group.name} has been removed`,
            body: `This group was removed by an administrator.${reason ? ` Reason: ${reason}` : ''}`,
          },
          client
        );

        await AdminAuditLog.record(
          {
            adminId,
            action: ADMIN_ACTIONS.DELETE_GROUP,
            targetType: 'group',
            targetId: groupId,
            details: { name: group.name, createdBy: group.createdBy, reason },
          },
          client
        );

        await Group.delete(groupId, client);
      })
    );
  }
}
