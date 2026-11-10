import RiskAssessment from '../entities/RiskAssessment.js';

async function viewRiskScoreController() {
  try {
    const data = await RiskAssessment.get();
    return { success: true, field: null, message: '', data };
  } catch (err) {
    return { success: false, field: null, message: err.message };
  }
}

export default viewRiskScoreController;
