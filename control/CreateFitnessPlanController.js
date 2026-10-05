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

// RU-12: As a Registered User, I want to create a new fitness plan, so that I have a
// structured training goal to follow. The new plan becomes the active one.
async function createFitnessPlan(req, res) {
  try {
    const { goalType, targetDistanceKm, weeklyFrequency, durationWeeks } = req.body;

    if (!goalType) {
      return res.status(400).json({ error: 'Goal type is required' });
    }
    const problem = validate({ goalType, targetDistanceKm, weeklyFrequency, durationWeeks });
    if (problem) return res.status(400).json({ error: problem });

    const plan = await FitnessPlan.create(req.user.userId, {
      goalType,
      targetDistanceKm: targetDistanceKm ?? null,
      weeklyFrequency: weeklyFrequency ?? null,
      durationWeeks: durationWeeks ?? null,
    });

    return res.status(201).json({ plan: plan.toJSON() });
  } catch (err) {
    console.error('Create fitness plan error:', err);
    return res.status(500).json({ error: 'Failed to create fitness plan' });
  }
}

export default createFitnessPlan;
