import Group from '../entities/Group.js';
import User from '../entities/User.js';
import AdminAuditLog, { ADMIN_ACTIONS } from '../entities/AdminAuditLog.js';
import { AdminError, guard, withTransaction } from './AdminControlHelpers.js';
import { validateNewGroup } from './AdminValidators.js';

/**
 * Creating a group from the admin side, which completes create/read/update/delete for
 * groups at that level — list, update, suspend and delete already existed, so an
 * administrator could do everything to a group except bring one into being.
 *
 * Every group needs an owner: `groups.created_by` is NOT NULL, and a group with no active
 * group admin cannot be administered by anyone from inside the app. So the owner is either
 * the user named in `ownerId` or, failing that, the administrator making the call. Naming
 * someone else is the useful case — setting a group up on a runner's behalf — and it is
 * also why the administrator is not silently made a member of every group they create.
 */
export default class AdminCreateGroupController {
  async createGroup({ adminId, input }) {
    const { name, description, isPrivate, maxMembers, ownerId } = validateNewGroup(input);
    const owner = ownerId ?? adminId;

    return guard(
      () =>
        withTransaction(async (client) => {
          // Checked rather than left to the foreign key, which would surface as a 500 with
          // a constraint name in it instead of telling the administrator what was wrong.
          if (ownerId !== null && !(await User.findById(ownerId, client))) {
            throw AdminError.notFound('Owner not found');
          }

          // Group names are unique. Checked here for a clear message; the guard below still
          // catches the race where another request inserts the same name first.
          if (await Group.findByName(name, client)) {
            throw AdminError.conflict('Another group already uses this name');
          }

          // Passed this transaction's client so the group, its first member and the audit
          // entry commit together. Without it the group would be created by its own
          // transaction and survive a later failure in this one.
          const group = await Group.create(
            { name, description, isPrivate, maxMembers, createdBy: owner },
            client
          );

          await AdminAuditLog.record(
            {
              adminId,
              action: ADMIN_ACTIONS.CREATE_GROUP,
              targetType: 'group',
              targetId: group.groupId,
              details: { name, isPrivate, maxMembers, ownerId: owner },
            },
            client
          );

          return group.toJSON();
        }),
      { duplicate: 'Another group already uses this name' }
    );
  }
}
