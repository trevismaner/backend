import Tournament from '../entities/Tournament.js';

async function viewTournamentDetailsController(tournamentId) {
  try {
    const data = await Tournament.getDetails(tournamentId);
    return { success: true, field: null, message: '', data };
  } catch (err) {
    return { success: false, field: null, message: err.message };
  }
}

export default viewTournamentDetailsController;
