import Group from '../entities/Group.js';

async function viewMyGroupsController() {
  try {
    const data = await Group.getMine();
    return { success: true, field: null, message: '', data };
  } catch (err) {
    return { success: false, field: null, message: err.message };
  }
}

export default viewMyGroupsController;
