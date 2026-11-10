import Run from '../entities/Run.js';

async function createRunController(runData) {
  const { distanceKm, durationSeconds, startedAt } = runData;
  if (distanceKm === undefined || distanceKm === null || !durationSeconds || !startedAt) {
    return { success: false, field: null, message: 'Missing required run data.' };
  }

  try {
    const data = await Run.create(runData);
    return { success: true, field: null, message: '', data };
  } catch (err) {
    return { success: false, field: null, message: err.message };
  }
}

export default createRunController;
