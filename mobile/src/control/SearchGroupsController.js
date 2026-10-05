import Group from '../entities/Group.js';

async function searchGroupsController(query) {
  if (!query) {
    return { success: false, field: null, message: 'Search query is required.' };
  }

  try {
    const data = await Group.search(query);
    return { success: true, field: null, message: '', data };
  } catch (err) {
    return { success: false, field: null, message: err.message };
  }
}

export default searchGroupsController;
