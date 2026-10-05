import Tournament from '../entities/Tournament.js';

async function viewTournamentStandingsController(tournamentId) {
  try {
    const data = await Tournament.getStandings(tournamentId);
    return { success: true, field: null, message: '', data };
  } catch (err) {
    return { success: false, field: null, message: err.message };
  }
}

export default viewTournamentStandingsController;
