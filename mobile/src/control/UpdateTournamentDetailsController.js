import Tournament from '../entities/Tournament.js';

async function updateTournamentDetailsController(tournamentId, updates) {
  if (updates.name !== undefined && !updates.name.trim()) {
    return { success: false, field: 'name', message: 'Tournament name cannot be empty.' };
  }

  try {
    const data = await Tournament.update(tournamentId, updates);
    return { success: true, field: null, message: '', data };
  } catch (err) {
    return { success: false, field: null, message: err.message };
  }
}

export default updateTournamentDetailsController;
