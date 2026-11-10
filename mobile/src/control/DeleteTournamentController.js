import Tournament from '../entities/Tournament.js';

async function deleteTournamentController(tournamentId) {
  try {
    const data = await Tournament.remove(tournamentId);
    return { success: true, field: null, message: '', data };
  } catch (err) {
    return { success: false, field: null, message: err.message };
  }
}

export default deleteTournamentController;
