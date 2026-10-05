import Group from '../entities/Group.js';
import AdminAuditLog, { ADMIN_ACTIONS } from '../entities/AdminAuditLog.js';
import { AdminError, guard, withTransaction } from './AdminControlHelpers.js';
import { validateGroupEdit } from './AdminValidators.js';

/**
 * SA-21: As a System Admin, I want to update group details, so that I can enforce platform
 * standards where needed — e.g. renaming a group with an offensive name rather than having
 * to delete it and lose its members and tournaments.
 */
export default class AdminUpdateGroupController {
  async updateGroup({ adminId, groupId, input }) {
    const changes = validateGroupEdit(input);

    return guard(
      () =>
        withTransaction(async (client) => {
          const group = await Group.findById(groupId, client, { forUpdate: true });
          if (!group) throw AdminError.notFound('Group not found');

          // Group names are unique, so a clash gets its own error rather than a 500.
          if (changes.name !== undefined) {
            const clash = await Group.findByName(changes.name, client);
            if (clash && clash.groupId !== group.groupId) {
              throw AdminError.conflict('Another group already uses this name');
            }
          }

          // Shrinking the cap below current membership would leave the group over capacity.
          if (changes.maxMembers != null) {
            const active = await Group.countActiveMembers(groupId, client);
            if (changes.maxMembers < active) {
              throw AdminError.conflict(
                `This group already has ${active} members, so the limit cannot be set below that`
              );
            }
          }

          const updated = await Group.update(groupId, changes, client);

          await AdminAuditLog.record(
            {
              adminId,
              action: ADMIN_ACTIONS.UPDATE_GROUP,
              targetType: 'group',
              targetId: groupId,
              details: { from: { name: group.name }, fields: Object.keys(changes) },
            },
            client
          );

          return updated.toJSON();
        }),
      { duplicate: 'Another group already uses this name' }
    );
  }
}
