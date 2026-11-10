import Tournament from '../entities/Tournament.js';

async function viewMyTournamentsController() {
  try {
    const data = await Tournament.getMine();
    return { success: true, field: null, message: '', data };
  } catch (err) {
    return { success: false, field: null, message: err.message };
  }
}

export default viewMyTournamentsController;
