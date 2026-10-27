import Run from '../entities/Run.js';
import Reward from '../entities/Reward.js';
import { withTransaction } from '../config/transaction.js';
import { parseId } from './RunValidation.js';
import { pointsFor } from './RunRewards.js';

/**
 * Deletes one of the signed-in user's own runs, and takes back the points it earned.
 *
 * Reclaiming matters: without it, logging a run, collecting the points and deleting the run
 * would be a way to mint points indefinitely. The balance floors at zero, since the points
 * may already have been spent on a reward.
 *
 * Badges are deliberately left alone. They mark something the user did reach at the time,
 * and quietly removing an achievement over a corrected distance would be worse than
 * leaving it. An administrator can revoke a badge where a run was faked.
 */
async function deleteRun(req, res) {
  try {
    const runId = parseId(req.params.runId);
    if (!runId) return res.status(400).json({ error: 'Invalid run id' });

    const result = await withTransaction(async (client) => {
      const run = await Run.findById(runId, client);
      if (!run) return { status: 404, body: { error: 'Run not found' } };
      if (run.userId !== req.user.userId) {
        return { status: 403, body: { error: 'You do not own this run' } };
      }

      const pointsReclaimed = await Reward.reclaimPoints(run.userId, pointsFor(run.distanceKm), client);
      await Run.delete(runId, client);

      return { status: 200, body: { deleted: true, runId, pointsReclaimed } };
    });

    return res.status(result.status).json(result.body);
  } catch (err) {
    console.error('Delete run error:', err);
    return res.status(500).json({ error: 'Failed to delete run' });
  }
}

export default deleteRun;
