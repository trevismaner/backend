import Group from '../entities/Group.js';

async function promoteMemberController(groupId, userId) {
  try {
    const data = await Group.promoteMember(groupId, userId);
    return { success: true, field: null, message: '', data };
  } catch (err) {
    return { success: false, field: null, message: err.message };
  }
}

export default promoteMemberController;
