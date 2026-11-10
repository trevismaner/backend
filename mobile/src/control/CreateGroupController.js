import Group from '../entities/Group.js';

async function createGroupController({ name, description, isPrivate, maxMembers }) {
  if (!name || !name.trim()) {
    return { success: false, field: 'name', message: 'Group name is required.' };
  }

  try {
    const data = await Group.create({ name, description, isPrivate, maxMembers });
    return { success: true, field: null, message: '', data };
  } catch (err) {
    return { success: false, field: null, message: err.message };
  }
}

export default createGroupController;
