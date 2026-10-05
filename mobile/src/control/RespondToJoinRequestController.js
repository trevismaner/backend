import Group from '../entities/Group.js';

async function respondToJoinRequestController(groupId, userId, decision) {
  if (!['accept', 'reject'].includes(decision)) {
    return { success: false, field: 'decision', message: 'Decision must be accept or reject.' };
  }

  try {
    const data = await Group.respondToJoinRequest(groupId, userId, decision);
    return { success: true, field: null, message: '', data };
  } catch (err) {
    return { success: false, field: null, message: err.message };
  }
}

export default respondToJoinRequestController;
