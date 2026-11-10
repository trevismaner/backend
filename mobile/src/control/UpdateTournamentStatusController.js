import Tournament from '../entities/Tournament.js';

async function updateTournamentStatusController(tournamentId, status) {
  if (!['open', 'in_progress', 'completed'].includes(status)) {
    return { success: false, field: 'status', message: 'Invalid status value.' };
  }

  try {
    const data = await Tournament.updateStatus(tournamentId, status);
    return { success: true, field: null, message: '', data };
  } catch (err) {
    return { success: false, field: null, message: err.message };
  }
}

export default updateTournamentStatusController;
