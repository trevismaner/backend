import FitnessPlan, { GOAL_TYPES } from '../entities/FitnessPlan.js';
import PlanSchedule from '../entities/PlanSchedule.js';
import { isAiConfigured } from './PlanGenerationService.js';

// RU-13: As a Registered User, I want to view my fitness plan, so that I know my current
// training goals. Returns the active plan with this week's progress, plus any past plans.
//
// Since migration 007 it also returns the generated schedule — the weeks and sessions — and
// how much of it has actually been run. `schedule` is an empty array for a plan that has
// never been generated, which is every plan made before the feature existed.
async function viewFitnessPlan(req, res) {
  try {
    const [plan, all] = await Promise.all([
      FitnessPlan.findActiveByUserId(req.user.userId),
      FitnessPlan.findAllByUserId(req.user.userId),
    ]);
    const progress = await FitnessPlan.getProgress(req.user.userId, plan);

    // Only the active plan's schedule is loaded: a past plan's weeks are not worth the query
    // on a screen that does not show them.
    const [schedule, scheduleProgress] = plan
      ? await Promise.all([PlanSchedule.findByPlanId(plan.planId), PlanSchedule.getProgress(plan.planId)])
      : [[], null];

    return res.status(200).json({
      plan: plan ? plan.toJSON() : null,
      progress,
      schedule,
      scheduleProgress,
      pastPlans: all.filter((p) => !p.isActive).map((p) => p.toJSON()),
      goalTypes: GOAL_TYPES, // lets the form render the same options the API accepts
      // So the app can say whether a generated plan will be written by the model or built
      // from the standard progression, rather than implying one and delivering the other.
      planGenerationUsesAi: isAiConfigured(),
    });
  } catch (err) {
    console.error('View fitness plan error:', err);
    return res.status(500).json({ error: 'Failed to load fitness plan' });
  }
}

export default viewFitnessPlan;
