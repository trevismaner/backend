import Tournament from '../entities/Tournament.js';

async function viewGroupTournamentsController(groupId) {
  try {
    const data = await Tournament.getByGroup(groupId);
    return { success: true, field: null, message: '', data };
  } catch (err) {
    return { success: false, field: null, message: err.message };
  }
}

export default viewGroupTournamentsController;
