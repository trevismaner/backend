import Run from '../entities/Run.js';

/**
 * Deletes one of the signed-in user's own runs.
 *
 * The points that run earned are taken back by the server, and the number removed comes
 * back as `data.pointsReclaimed` so the screen can tell the user what the deletion cost.
 */
async function deleteRunController(runId) {
  if (!runId) return { success: false, field: null, message: 'No run to delete.' };

  try {
    const data = await Run.remove(runId);
    return { success: true, field: null, message: '', data };
  } catch (err) {
    return { success: false, field: null, message: err.message };
  }
}

export default deleteRunController;
