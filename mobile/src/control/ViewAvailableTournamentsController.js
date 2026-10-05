import Tournament from '../entities/Tournament.js';

async function viewAvailableTournamentsController() {
  try {
    const data = await Tournament.getAvailable();
    return { success: true, field: null, message: '', data };
  } catch (err) {
    return { success: false, field: null, message: err.message };
  }
}

export default viewAvailableTournamentsController;
