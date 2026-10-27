import ActiveRun from '../entities/ActiveRun.js';
import Run from '../entities/Run.js';
import Reward from '../entities/Reward.js';
import Badge from '../entities/Badge.js';
import { withTransaction } from '../config/transaction.js';
import { validateRun, validateRouteGps, MAX_ROUTE_POINTS } from './RunValidation.js';
import { pointsFor } from './RunRewards.js';

/**
 * A run while it is still being recorded (RU-05).
 *
 * Before this existed, a run in progress lived only in the phone's memory, so the app being
 * killed — a crash, a low-memory kill, a flat battery — lost the whole run. The app now
 * checkpoints here as it tracks, and can pick the run back up where it left off.
 *
 * A user has at most one run in progress: active_runs is keyed by user_id, so starting a
 * second one is a conflict that hands back the first rather than quietly discarding it.
 */

/** POST /api/runs/active — start recording. */
export async function startActiveRun(req, res) {
  try {
    const startedAtRaw = req.body?.startedAt ?? new Date().toISOString();
    const startedAt = new Date(startedAtRaw);
    if (Number.isNaN(startedAt.getTime())) {
      return res.status(400).json({ error: 'startedAt must be a valid date' });
    }
    if (startedAt.getTime() > Date.now() + 5 * 60 * 1000) {
      return res.status(400).json({ error: 'startedAt cannot be in the future' });
    }

    const route = validateRouteGps(req.body?.routeGps);
    if (route.error) return res.status(400).json({ error: route.error });

    const started = await ActiveRun.start(
      req.user.userId,
      { startedAt: startedAt.toISOString(), routeGps: route.value },
      undefined
    );

    if (!started) {
      const existing = await ActiveRun.findByUserId(req.user.userId);
      return res.status(409).json({
        error: 'You already have a run in progress',
        activeRun: existing ? existing.toSummaryJSON() : null,
      });
    }

    return res.status(201).json({ activeRun: started.toJSON() });
  } catch (err) {
    console.error('Start active run error:', err);
    return res.status(500).json({ error: 'Failed to start tracking' });
  }
}

/** GET /api/runs/active — what, if anything, is being recorded. */
export async function viewActiveRun(req, res) {
  try {
    const active = await ActiveRun.findByUserId(req.user.userId);
    return res.status(200).json({ activeRun: active ? active.toJSON() : null });
  } catch (err) {
    console.error('View active run error:', err);
    return res.status(500).json({ error: 'Failed to load the run in progress' });
  }
}

/**
 * PATCH /api/runs/active — checkpoint progress.
 *
 * The phone sends the route it holds, which replaces the stored copy. Replacing rather than
 * appending means a checkpoint arriving late or twice cannot duplicate or interleave points.
 */
export async function saveActiveRunProgress(req, res) {
  try {
    const { distanceKm, durationSeconds, routeGps } = req.body ?? {};

    let distance;
    if (distanceKm !== undefined && distanceKm !== null) {
      distance = Number(distanceKm);
      if (!Number.isFinite(distance) || distance < 0) {
        return res.status(400).json({ error: 'distanceKm must be a number of 0 or more' });
      }
      distance = Math.round(distance * 100) / 100;
    }

    let duration;
    if (durationSeconds !== undefined && durationSeconds !== null) {
      duration = Number(durationSeconds);
      if (!Number.isInteger(duration) || duration < 0) {
        return res.status(400).json({ error: 'durationSeconds must be a whole number of 0 or more' });
      }
      if (duration > 86400) return res.status(400).json({ error: 'durationSeconds cannot be more than 24 hours' });
    }

    let route;
    if (routeGps !== undefined) {
      const checked = validateRouteGps(routeGps);
      if (checked.error) return res.status(400).json({ error: checked.error });
      route = checked.value;
    }

    const updated = await ActiveRun.saveProgress(req.user.userId, {
      distanceKm: distance,
      durationSeconds: duration,
      routeGps: route,
    });
    if (!updated) return res.status(404).json({ error: 'No run in progress' });

    return res.status(200).json({ activeRun: updated.toSummaryJSON() });
  } catch (err) {
    console.error('Save active run progress error:', err);
    return res.status(500).json({ error: 'Failed to save progress' });
  }
}

/** DELETE /api/runs/active — throw the run away without saving it. */
export async function discardActiveRun(req, res) {
  try {
    const discarded = await ActiveRun.discard(req.user.userId);
    if (!discarded) return res.status(404).json({ error: 'No run in progress' });
    return res.status(200).json({ discarded: true });
  } catch (err) {
    console.error('Discard active run error:', err);
    return res.status(500).json({ error: 'Failed to discard the run' });
  }
}

/**
 * POST /api/runs/active/finish — turn the run in progress into a saved run.
 *
 * The figures in the request win over the checkpointed ones, because the phone has the most
 * complete version; the checkpoint is the fallback for when the app had to be restarted.
 * Saving the run and clearing the active row happen together, so finishing twice cannot
 * store the run twice — the second call finds nothing in progress.
 */
export async function finishActiveRun(req, res) {
  try {
    const result = await withTransaction(async (client) => {
      const active = await ActiveRun.findByUserId(req.user.userId, client, { forUpdate: true });
      if (!active) return { status: 404, body: { error: 'No run in progress' } };

      const body = req.body ?? {};
      const candidate = {
        name: body.name,
        description: body.description,
        distanceKm: body.distanceKm ?? active.distanceKm,
        durationSeconds:
          body.durationSeconds
          ?? (active.durationSeconds > 0
            ? active.durationSeconds
            : Math.max(1, Math.round((Date.now() - new Date(active.startedAt).getTime()) / 1000))),
        startedAt: active.startedAt,
        endedAt: body.endedAt ?? new Date().toISOString(),
        caloriesBurned: body.caloriesBurned,
        avgHeartRate: body.avgHeartRate,
        maxHeartRate: body.maxHeartRate,
        routeGps: body.routeGps ?? active.routeGps,
        clientRunId: body.clientRunId,
      };

      const checked = validateRun(candidate);
      if (checked.error) return { status: 400, body: { error: checked.error } };

      const pointsEarned = pointsFor(checked.value.distanceKm);
      const run = await Run.create(req.user.userId, checked.value, client);
      await Reward.addPoints(req.user.userId, pointsEarned, client);
      await ActiveRun.discard(req.user.userId, client);

      return { status: 201, body: { run: run.toJSON(), pointsEarned } };
    });

    if (result.status === 201) {
      result.body.newBadges = await Badge.checkAndAwardRunMilestones(req.user.userId);
    }
    return res.status(result.status).json(result.body);
  } catch (err) {
    console.error('Finish active run error:', err);
    return res.status(500).json({ error: 'Failed to save the run' });
  }
}

export { MAX_ROUTE_POINTS };
