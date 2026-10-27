import FitnessPlan, { GOAL_TYPES } from '../entities/FitnessPlan.js';

// Shared field checks so create and update reject the same things.
function validate({ goalType, targetDistanceKm, weeklyFrequency, durationWeeks }, { partial = false } = {}) {
  const need = (v) => !partial || v !== undefined;

  if (need(goalType) && !GOAL_TYPES.includes(goalType)) {
    return `Goal type must be one of: ${GOAL_TYPES.join(', ')}`;
  }
  if (targetDistanceKm !== undefined && targetDistanceKm !== null) {
    const d = Number(targetDistanceKm);
    if (!Number.isFinite(d) || d <= 0 || d > 1000) return 'Target distance must be between 0 and 1000 km';
  }
  if (weeklyFrequency !== undefined && weeklyFrequency !== null) {
    if (!Number.isInteger(weeklyFrequency) || weeklyFrequency < 1 || weeklyFrequency > 14) {
      return 'Weekly frequency must be a whole number between 1 and 14';
    }
  }
  if (durationWeeks !== undefined && durationWeeks !== null) {
    if (!Number.isInteger(durationWeeks) || durationWeeks < 1 || durationWeeks > 104) {
      return 'Duration must be a whole number of weeks between 1 and 104';
    }
  }
  return null;
}

// RU-14: As a Registered User, I want to update my fitness plan, so that I can adjust it as
// goals or schedule change. Only the fields sent are changed.
async function updateFitnessPlan(req, res) {
  try {
    const { goalType, targetDistanceKm, weeklyFrequency, durationWeeks } = req.body;

    if (goalType === undefined && targetDistanceKm === undefined
        && weeklyFrequency === undefined && durationWeeks === undefined) {
      return res.status(400).json({ error: 'Nothing to update' });
    }
    const problem = validate({ goalType, targetDistanceKm, weeklyFrequency, durationWeeks }, { partial: true });
    if (problem) return res.status(400).json({ error: problem });

    const existing = await FitnessPlan.findByIdForUser(req.params.planId, req.user.userId);
    if (!existing) {
      return res.status(404).json({ error: 'Fitness plan not found' });
    }

    const plan = await FitnessPlan.update(req.params.planId, req.user.userId, {
      goalType, targetDistanceKm, weeklyFrequency, durationWeeks,
    });
    return res.status(200).json({ plan: plan.toJSON() });
  } catch (err) {
    console.error('Update fitness plan error:', err);
    return res.status(500).json({ error: 'Failed to update fitness plan' });
  }
}

export default updateFitnessPlan;
