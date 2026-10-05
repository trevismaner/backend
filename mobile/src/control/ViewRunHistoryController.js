import Run from '../entities/Run.js';

async function viewRunHistoryController({ limit = 20, offset = 0 } = {}) {
  try {
    const data = await Run.getHistory({ limit, offset });
    return { success: true, field: null, message: '', data };
  } catch (err) {
    return { success: false, field: null, message: err.message };
  }
}

export default viewRunHistoryController;
