import Group from '../entities/Group.js';

async function joinGroupController(groupId) {
  try {
    const data = await Group.join(groupId);
    return { success: true, field: null, message: '', data };
  } catch (err) {
    return { success: false, field: null, message: err.message };
  }
}

export default joinGroupController;
