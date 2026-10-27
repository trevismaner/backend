import RiskAssessment from '../entities/RiskAssessment.js';
import { CHRONIC_CONDITIONS } from '../entities/RiskAssessment.js';

// RU-10: As a Registered User, I want to view my risk assessment score, so that I know
// whether I'm at elevated risk of overtraining or injury.
async function viewRiskScore(req, res) {
  try {
    const [score, form, history, runStats] = await Promise.all([
      RiskAssessment.getLatestScore(req.user.userId),
      RiskAssessment.getLatestForm(req.user.userId),
      RiskAssessment.getScoreHistory(req.user.userId),
      RiskAssessment.getRunStats(req.user.userId),
    ]);

    return res.status(200).json({
      score: score ? score.toJSON() : null,
      form: form ? form.toJSON() : null,
      history,
      runStats,
      chronicConditions: CHRONIC_CONDITIONS,
      // No form yet means no score can exist — the screen uses this to prompt for one.
      needsAssessment: form === null,
    });
  } catch (err) {
    console.error('View risk score error:', err);
    return res.status(500).json({ error: 'Failed to load risk assessment' });
  }
}

export default viewRiskScore;
