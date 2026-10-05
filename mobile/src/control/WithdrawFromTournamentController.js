import Tournament from '../entities/Tournament.js';

async function withdrawFromTournamentController(tournamentId) {
  try {
    const data = await Tournament.withdraw(tournamentId);
    return { success: true, field: null, message: '', data };
  } catch (err) {
    return { success: false, field: null, message: err.message };
  }
}

export default withdrawFromTournamentController;
