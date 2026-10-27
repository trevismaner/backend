import Run from '../entities/Run.js';
import { estimateFitness } from './FitnessEstimateService.js';
import { describeUserLevel } from './LevelService.js';

/**
 * GET /api/fitness-estimate
 *
 * The runner's current fitness estimate and the level the classifier puts them at. Both of
 * the project's two models answer here, because from the runner's side they are one question
 * — "where am I?" — and splitting them across two requests would only make the screen wait
 * twice.
 *
 * Neither model is required for the endpoint to succeed. With no heart-rate runs the estimate
 * comes back `available: false` with a reason to show; with no exported classifier the level
 * is the safe default and says so in `source`. A screen that renders this never has to handle
 * an error just because a model is missing.
 */
async function viewFitnessEstimate(req, res) {
  try {
    const userId = req.user.userId;

    const [runs, level] = await Promise.all([
      Run.getFitnessHistory(userId),
      describeUserLevel(userId),
    ]);

    const fitness = estimateFitness(runs);

    return res.status(200).json({
      fitness,
      level: {
        level: level.level,
        source: level.source,            // 'model' or 'default'
        confidence: level.confidence ?? null,
        reason: level.reason ?? null,
      },
      // What the classifier actually looked at. Returned because a runner being told they are
      // a beginner deserves to see the numbers behind it, and because it is the first thing
      // worth checking when a level looks wrong.
      levelFeatures: level.features,
    });
  } catch (err) {
    console.error('View fitness estimate error:', err);
    return res.status(500).json({ error: 'Failed to load your fitness estimate' });
  }
}

export default viewFitnessEstimate;
