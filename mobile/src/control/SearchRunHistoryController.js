import Run from '../entities/Run.js';

async function searchRunHistoryController(query) {
  if (!query) {
    return { success: false, field: null, message: 'Search query is required.' };
  }

  try {
    const data = await Run.search(query);
    return { success: true, field: null, message: '', data };
  } catch (err) {
    return { success: false, field: null, message: err.message };
  }
}

export default searchRunHistoryController;
