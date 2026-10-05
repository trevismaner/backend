import Tournament from '../entities/Tournament.js';

async function setTournamentLimitsController(tournamentId, { maxParticipants, registrationDeadline }) {
  try {
    const data = await Tournament.setLimits(tournamentId, { maxParticipants, registrationDeadline });
    return { success: true, field: null, message: '', data };
  } catch (err) {
    return { success: false, field: null, message: err.message };
  }
}

export default setTournamentLimitsController;
