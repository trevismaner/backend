import Tournament from '../entities/Tournament.js';

async function createTournamentController(groupId, { name, description, distanceType, startDate, endDate }) {
  if (!name || !name.trim()) {
    return { success: false, field: 'name', message: 'Tournament name is required.' };
  }

  try {
    const data = await Tournament.create(groupId, { name, description, distanceType, startDate, endDate });
    return { success: true, field: null, message: '', data };
  } catch (err) {
    return { success: false, field: null, message: err.message };
  }
}

export default createTournamentController;
