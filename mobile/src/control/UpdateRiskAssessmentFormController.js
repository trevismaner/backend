import RiskAssessment from '../entities/RiskAssessment.js';

async function updateRiskAssessmentFormController({
  isCurrentlySick,
  chronicConditions = [],
  pastInjuries = [],
  selfRatedSoreness,
}) {
  if (typeof isCurrentlySick !== 'boolean') {
    return { success: false, field: 'isCurrentlySick', message: 'Say whether you are currently unwell.' };
  }

  if (!Number.isInteger(selfRatedSoreness) || selfRatedSoreness < 1 || selfRatedSoreness > 10) {
    return { success: false, field: 'selfRatedSoreness', message: 'Rate your soreness from 1 to 10.' };
  }

  if (pastInjuries.some((i) => !i?.type?.trim())) {
    return { success: false, field: 'pastInjuries', message: 'Each injury needs a description.' };
  }

  try {
    const data = await RiskAssessment.updateForm({
      isCurrentlySick,
      chronicConditions,
      pastInjuries,
      selfRatedSoreness,
    });
    return { success: true, field: null, message: '', data };
  } catch (err) {
    return { success: false, field: null, message: err.message };
  }
}

export default updateRiskAssessmentFormController;
