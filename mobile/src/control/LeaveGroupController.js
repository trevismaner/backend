import Group from '../entities/Group.js';

async function leaveGroupController(groupId) {
  try {
    const data = await Group.leave(groupId);
    return { success: true, field: null, message: '', data };
  } catch (err) {
    return { success: false, field: null, message: err.message };
  }
}

export default leaveGroupController;
