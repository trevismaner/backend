import Group from '../entities/Group.js';

async function removeMemberController(groupId, userId) {
  try {
    const data = await Group.removeMember(groupId, userId);
    return { success: true, field: null, message: '', data };
  } catch (err) {
    return { success: false, field: null, message: err.message };
  }
}

export default removeMemberController;
