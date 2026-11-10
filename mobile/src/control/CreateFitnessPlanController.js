import FitnessPlan from '../entities/FitnessPlan.js';

async function createFitnessPlanController({ goalType, targetDistanceKm = null, weeklyFrequency = null, durationWeeks = null }) {
  if (!goalType) {
    return { success: false, field: 'goalType', message: 'Choose a goal for your plan.' };
  }

  if (targetDistanceKm !== null && targetDistanceKm !== undefined && !(Number(targetDistanceKm) > 0)) {
    return { success: false, field: 'targetDistanceKm', message: 'Target distance must be greater than 0.' };
  }

  if (weeklyFrequency !== null && weeklyFrequency !== undefined && !(Number(weeklyFrequency) >= 1 && Number(weeklyFrequency) <= 14)) {
    return { success: false, field: 'weeklyFrequency', message: 'Runs per week must be between 1 and 14.' };
  }

  if (durationWeeks !== null && durationWeeks !== undefined && !(Number(durationWeeks) >= 1 && Number(durationWeeks) <= 104)) {
    return { success: false, field: 'durationWeeks', message: 'Plan length must be between 1 and 104 weeks.' };
  }

  try {
    const data = await FitnessPlan.create({ goalType, targetDistanceKm, weeklyFrequency, durationWeeks });
    return { success: true, field: null, message: '', data };
  } catch (err) {
    return { success: false, field: null, message: err.message };
  }
}

export default createFitnessPlanController;
