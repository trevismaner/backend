import Run from '../entities/Run.js';
import Reward from '../entities/Reward.js';
import Badge from '../entities/Badge.js';
import { withTransaction } from '../config/transaction.js';
import { parseId, validateRun } from './RunValidation.js';
import { pointsFor } from './RunRewards.js';

const EDITABLE = [
  'name',
  'description',
  'distanceKm',
  'durationSeconds',
  'startedAt',
  'endedAt',
  'caloriesBurned',
  'avgHeartRate',
  'maxHeartRate',
];

/**
 * Corrects a run the user already saved — a GPS glitch that added a kilometre, a duration
 * typed in wrong, a forgotten calorie figure.
 *
 * The changes are merged onto the stored run and the whole thing is re-validated, so a
 * correction cannot sneak past the rules a new run has to satisfy (an end before the start,
 * an impossible pace). Points are adjusted by the difference, in the same transaction.
 */
async function updateRun(req, res) {
  try {
    const runId = parseId(req.params.runId);
    if (!runId) return res.status(400).json({ error: 'Invalid run id' });

    const supplied = EDITABLE.filter((field) => field in (req.body ?? {}));
    if (supplied.length === 0) {
      return res.status(400).json({ error: `Provide at least one of: ${EDITABLE.join(', ')}` });
    }

    const result = await withTransaction(async (client) => {
      const run = await Run.findById(runId, client);
      if (!run) return { status: 404, body: { error: 'Run not found' } };
      if (run.userId !== req.user.userId) {
        return { status: 403, body: { error: 'You do not own this run' } };
      }

      // Re-validate the run as it will be, not just the fields that changed.
      const merged = {
        name: run.name,
        description: run.description,
        distanceKm: run.distanceKm,
        durationSeconds: run.durationSeconds,
        startedAt: run.startedAt,
        endedAt: run.endedAt,
        caloriesBurned: run.caloriesBurned,
        avgHeartRate: run.avgHeartRate,
        maxHeartRate: run.maxHeartRate,
      };
      for (const field of supplied) merged[field] = req.body[field];

      const checked = validateRun(merged);
      if (checked.error) return { status: 400, body: { error: checked.error } };

      const changes = {};
      for (const field of supplied) changes[field] = checked.value[field];

      const updated = await Run.update(runId, req.user.userId, changes, client);
      if (!updated) return { status: 404, body: { error: 'Run not found' } };

      // Only the distance moves the points.
      const difference = pointsFor(updated.distanceKm) - pointsFor(run.distanceKm);
      if (difference > 0) await Reward.addPoints(req.user.userId, difference, client);
      if (difference < 0) await Reward.reclaimPoints(req.user.userId, -difference, client);

      return { status: 200, body: { run: updated.toJSON(), pointsAdjustment: difference } };
    });

    // A correction upwards can push the user past a milestone they had not reached.
    if (result.status === 200 && result.body.pointsAdjustment > 0) {
      result.body.newBadges = await Badge.checkAndAwardRunMilestones(req.user.userId);
    }

    return res.status(result.status).json(result.body);
  } catch (err) {
    console.error('Update run error:', err);
    return res.status(500).json({ error: 'Failed to update run' });
  }
}

export default updateRun;
