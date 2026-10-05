import Run from '../entities/Run.js';
import Reward from '../entities/Reward.js';
import Badge from '../entities/Badge.js';
import { withTransaction } from '../config/transaction.js';
import { validateRun } from './RunValidation.js';
import { pointsFor } from './RunRewards.js';

/**
 * Saves a finished run (RU-05), awards its points and checks badge milestones.
 *
 * The run and its points are written in one transaction, so a failure part way through
 * cannot leave a run with no points or points with no run.
 */
async function createRun(req, res) {
  try {
    const checked = validateRun(req.body);
    if (checked.error) return res.status(400).json({ error: checked.error });
    const data = checked.value;

    // Idempotency: the same key means the app is retrying a save, not logging another run.
    if (data.clientRunId) {
      const existing = await Run.findByClientRunId(req.user.userId, data.clientRunId);
      if (existing) return res.status(200).json(alreadySaved(existing));
    }

    const pointsEarned = pointsFor(data.distanceKm);

    const run = await withTransaction(async (client) => {
      const created = await Run.create(req.user.userId, data, client);
      await Reward.addPoints(req.user.userId, pointsEarned, client);
      return created;
    });

    // Badge milestones read aggregates over every run, so they are checked once the run is
    // committed rather than inside the transaction.
    const newBadges = await Badge.checkAndAwardRunMilestones(req.user.userId);

    return res.status(201).json({ run: run.toJSON(), pointsEarned, newBadges });
  } catch (err) {
    // Two retries arriving at once can still collide on the unique index. That is the same
    // situation as above, just detected by the database, so answer it the same way.
    if (err?.code === '23505' && req.body?.clientRunId) {
      const existing = await Run.findByClientRunId(req.user.userId, req.body.clientRunId);
      if (existing) return res.status(200).json(alreadySaved(existing));
    }
    console.error('Create run error:', err);
    return res.status(500).json({ error: 'Failed to save run' });
  }
}

const alreadySaved = (run) => ({
  run: run.toJSON(),
  pointsEarned: pointsFor(run.distanceKm),
  newBadges: [],
  alreadySaved: true,
});

export default createRun;
