import Tournament from '../entities/Tournament.js';

async function joinTournamentController(tournamentId) {
  try {
    const data = await Tournament.join(tournamentId);
    return { success: true, field: null, message: '', data };
  } catch (err) {
    return { success: false, field: null, message: err.message };
  }
}

export default joinTournamentController;
