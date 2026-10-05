import Group from '../entities/Group.js';

async function updateGroupDetailsController(groupId, { name, description, maxMembers }) {
  if (name !== undefined && !name.trim()) {
    return { success: false, field: 'name', message: 'Group name cannot be empty.' };
  }

  try {
    const data = await Group.update(groupId, { name, description, maxMembers });
    return { success: true, field: null, message: '', data };
  } catch (err) {
    return { success: false, field: null, message: err.message };
  }
}

export default updateGroupDetailsController;
