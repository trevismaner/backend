import FitnessPlan from '../entities/FitnessPlan.js';
import PlanSchedule from '../entities/PlanSchedule.js';
import RiskAssessment from '../entities/RiskAssessment.js';
import Run from '../entities/Run.js';
import { generatePlan, isAiConfigured } from './PlanGenerationService.js';
import { parseId } from './RunValidation.js';

/**
 * Turns a fitness plan into an actual week-by-week schedule.
 *
 * Generation does not happen inside the request. A language model takes seconds to answer,
 * and a mobile client holding a request open for that long is how a screen ends up looking
 * frozen or timing out on a slow connection. So this marks the plan as generating, answers
 * 202 immediately, and does the work after — the app polls the plan until the status changes,
 * the same shape as a run in progress.
 */
async function generateFitnessPlan(req, res) {
  try {
    const planId = parseId(req.params.planId);
    if (!planId) return res.status(400).json({ error: 'Invalid plan id' });

    const plan = await FitnessPlan.findByIdForUser(planId, req.user.userId);
    if (!plan) return res.status(404).json({ error: 'Fitness plan not found' });

    // One generation at a time. Without this a double-tapped button is two provider calls,
    // two bills, and two schedules racing to overwrite each other.
    const claimed = await PlanSchedule.markGenerating(planId, req.user.userId);
    if (!claimed) {
      return res.status(409).json({ error: 'This plan is already being generated.', generationStatus: 'generating' });
    }

    res.status(202).json({
      generationStatus: 'generating',
      usingAi: isAiConfigured(),
      message: 'Building your plan. This usually takes a few seconds.',
    });

    // Deliberately not awaited: the response has already gone.
    void runGeneration(planId, req.user.userId, plan);
  } catch (err) {
    console.error('Generate fitness plan error:', err);
    if (!res.headersSent) return res.status(500).json({ error: 'Failed to start plan generation' });
  }
}

/**
 * The work, after the response.
 *
 * Nothing here can reach the client, so every failure has to end with the plan's status
 * saying what happened — otherwise a plan sits on 'generating' for ever and the screen spins.
 */
async function runGeneration(planId, userId, plan) {
  try {
    // What the planner is given: the runner's own recent volume and their risk level. Both
    // are figures the app already holds, and neither identifies them.
    const [totals, insights, score] = await Promise.all([
      Run.getTotalsForUser(userId),
      Run.getInsights(userId).catch(() => null),
      RiskAssessment.getLatestScore(userId).catch(() => null),
    ]);

    const last28Km = insights?.trends?.longTerm?.current?.distanceKm ?? 0;

    const { plan: schedule, generatedBy, warning } = await generatePlan({
      goalType: plan.goalType,
      targetDistanceKm: plan.targetDistanceKm,
      weeklyFrequency: plan.weeklyFrequency,
      durationWeeks: plan.durationWeeks,
      recentWeeklyKm: Number((last28Km / 4).toFixed(1)),
      last7DaysRuns: insights?.trends?.shortTerm?.current?.runCount ?? 0,
      riskLevel: score?.riskLevel ?? null,
      totalRuns: totals.runCount,
    });

    const coachNotes = warning ? `${warning}\n\n${schedule.coachNotes ?? ''}`.trim() : schedule.coachNotes;

    await PlanSchedule.replace(planId, {
      weeks: schedule.weeks,
      coachNotes,
      generatedBy,
    });
  } catch (err) {
    console.error('Plan generation failed:', err);
    await PlanSchedule.markFailed(planId, err.message).catch(() => {});
  }
}

export default generateFitnessPlan;
