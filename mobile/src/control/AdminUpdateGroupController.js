import Admin from '../entities/Admin.js';

/**
 * SA-21: update group details so platform standards can be enforced — e.g. renaming a
 * group rather than deleting it and losing its members and tournaments.
 * `maxMembers: null` clears the limit.
 */
async function adminUpdateGroupController({ groupId, name, description, maxMembers } = {}) {
  if (!groupId) {
    return { success: false, field: 'groupId', message: 'A group id is required.' };
  }

  const changes = {};

  if (name !== undefined && name !== null) {
    if (!name.trim()) {
      return { success: false, field: 'name', message: 'Group name cannot be empty.' };
    }
    if (name.trim().length > 100) {
      return { success: false, field: 'name', message: 'Group name must be 100 characters or fewer.' };
    }
    changes.name = name.trim();
  }

  if (description !== undefined) changes.description = description;

  if (maxMembers !== undefined) {
    if (maxMembers === null || maxMembers === '') {
      changes.maxMembers = null; // no limit
    } else {
      const n = Number(maxMembers);
      if (!Number.isInteger(n) || n < 1) {
        return { success: false, field: 'maxMembers', message: 'Member limit must be a whole number of 1 or more.' };
      }
      changes.maxMembers = n;
    }
  }

  if (Object.keys(changes).length === 0) {
    return { success: false, field: null, message: 'Change something first.' };
  }

  try {
    const data = await Admin.updateGroup(groupId, changes);
    return { success: true, field: null, message: 'Group updated', data };
  } catch (err) {
    return { success: false, field: null, message: err.message };
  }
}

export default adminUpdateGroupController;
