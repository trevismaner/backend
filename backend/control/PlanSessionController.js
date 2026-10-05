import PlanSchedule from '../entities/PlanSchedule.js';
import Run from '../entities/Run.js';
import { parseId } from './RunValidation.js';

/**
 * Ticking a planned session off against a run that was actually done.
 *
 * This is what makes a schedule more than a printed list: the plan knows which sessions were
 * followed, so "planned against actual" becomes a real figure rather than something the
 * runner works out in their head.
 *
 * Marked by hand rather than matched automatically. A run on the right day at the right
 * distance is only probably the planned session — it could be a different run entirely — and
 * a plan that silently ticks off the wrong thing is worse than one that asks.
 */

export async function completePlanSession(req, res) {
  try {
    const sessionId = parseId(req.params.sessionId);
    if (!sessionId) return res.status(400).json({ error: 'Invalid session id' });

    const runId = parseId(req.body?.runId);
    if (!runId) return res.status(400).json({ error: 'runId is required' });

    // The run has to be this user's, or a session could be ticked off against someone
    // else's run by guessing an id.
    const run = await Run.findById(runId);
    if (!run || run.userId !== req.user.userId) {
      return res.status(404).json({ error: 'Run not found' });
    }

    // The update itself is scoped to the signed-in user through the plan, so a session
    // belonging to someone else cannot be touched either.
    const updated = await PlanSchedule.completeSession(sessionId, req.user.userId, runId);
    if (!updated) return res.status(404).json({ error: 'Planned session not found' });

    return res.status(200).json({ completed: true, sessionId, runId });
  } catch (err) {
    console.error('Complete plan session error:', err);
    return res.status(500).json({ error: 'Failed to update the session' });
  }
}

export async function clearPlanSession(req, res) {
  try {
    const sessionId = parseId(req.params.sessionId);
    if (!sessionId) return res.status(400).json({ error: 'Invalid session id' });

    const updated = await PlanSchedule.clearSession(sessionId, req.user.userId);
    if (!updated) return res.status(404).json({ error: 'Planned session not found' });

    return res.status(200).json({ completed: false, sessionId });
  } catch (err) {
    console.error('Clear plan session error:', err);
    return res.status(500).json({ error: 'Failed to update the session' });
  }
}
