import Group from '../entities/Group.js';

async function viewGroupDetailsController(groupId) {
  try {
    const data = await Group.getDetails(groupId);
    return { success: true, field: null, message: '', data };
  } catch (err) {
    return { success: false, field: null, message: err.message };
  }
}

export default viewGroupDetailsController;
