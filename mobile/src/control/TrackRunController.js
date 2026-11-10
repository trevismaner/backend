import Run from '../entities/Run.js';
import { thinRoute, MAX_ROUTE_POINTS } from '../utils/geo.js';

/**
 * The run currently being recorded.
 *
 * The screen keeps the authoritative copy in memory; these functions mirror it to the
 * server every so often so that the app being killed mid-run — a crash, a low-memory kill,
 * a flat battery — no longer loses the run.
 *
 * Every function follows the project's controller contract and returns
 * { success, field, message, data } rather than throwing, because none of this is worth
 * interrupting a run over: if a checkpoint fails the run carries on in memory and the next
 * checkpoint tries again.
 */

const ok = (data) => ({ success: true, field: null, message: '', data });
const failed = (err) => ({ success: false, field: null, message: err.message });

export async function startTrackingController(startedAt) {
  try {
    return ok(await Run.startTracking(startedAt));
  } catch (err) {
    return failed(err);
  }
}

/** What, if anything, was left part-recorded. `data.activeRun` is null when there is none. */
export async function viewActiveRunController() {
  try {
    return ok(await Run.getActive());
  } catch (err) {
    return failed(err);
  }
}

/** Checkpoints progress. The route is thinned first, so a long run still fits. */
export async function saveRunProgressController({ distanceKm, durationSeconds, routeGps }) {
  try {
    return ok(
      await Run.saveProgress({
        distanceKm: Number(Number(distanceKm ?? 0).toFixed(2)),
        durationSeconds: Math.round(durationSeconds ?? 0),
        routeGps: thinRoute(routeGps ?? [], { maxPoints: MAX_ROUTE_POINTS }),
      })
    );
  } catch (err) {
    return failed(err);
  }
}

export async function discardActiveRunController() {
  try {
    return ok(await Run.discardActive());
  } catch (err) {
    return failed(err);
  }
}

/** Turns the run in progress into a saved run. */
export async function finishActiveRunController(runData) {
  try {
    return ok(
      await Run.finishActive({
        ...runData,
        routeGps: thinRoute(runData.routeGps ?? [], { maxPoints: MAX_ROUTE_POINTS }),
      })
    );
  } catch (err) {
    return failed(err);
  }
}
