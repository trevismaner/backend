import Run from '../entities/Run.js';
import Reward from '../entities/Reward.js';
import Badge from '../entities/Badge.js';
import { withTransaction } from '../config/transaction.js';
import { validateRun } from './RunValidation.js';
import { pointsFor } from './RunRewards.js';
import User from '../entities/User.js';
import { estimateCalories } from './CalorieEstimate.js';

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

    /**
     * Fill in the calorie estimate when the app did not send one.
     *
     * Done here rather than only on the run screen so that every route into a run gets the
     * same figure: a run typed in by hand, one imported from a wearable, one saved by an
     * older build of the app. A client-supplied value always wins, because a wearable that
     * measured it knows better than this formula does.
     *
     * Silent when the runner has no weight on their profile — a run with no calorie figure
     * is correct, where one derived from a guessed body mass would not be.
     */
    if (data.caloriesBurned === null || data.caloriesBurned === undefined) {
      const user = await User.findById(req.user.userId);
      const estimated = estimateCalories({
        weightKg: user?.weightKg,
        distanceKm: data.distanceKm,
      });
      if (estimated !== null) data.caloriesBurned = estimated;
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
