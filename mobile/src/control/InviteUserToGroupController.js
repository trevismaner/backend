import Group from '../entities/Group.js';

async function inviteUserToGroupController(groupId, userId) {
  if (!userId) {
    return { success: false, field: 'userId', message: 'A user must be selected to invite.' };
  }

  try {
    const data = await Group.inviteUser(groupId, userId);
    return { success: true, field: null, message: '', data };
  } catch (err) {
    return { success: false, field: null, message: err.message };
  }
}

export default inviteUserToGroupController;
