import RiskAssessment, { CHRONIC_CONDITIONS } from '../entities/RiskAssessment.js';
import { scoreRisk } from './RiskScoringService.js';
import { getWeatherModifier } from './WeatherService.js';

// RU-11: As a Registered User, I want to update the form used for risk assessment, so that
// my score reflects current training, health, and biometric status.
// Submitting the form immediately rescores, so the user never sees a stale number.
async function updateRiskAssessmentForm(req, res) {
  try {
    const { isCurrentlySick, chronicConditions, pastInjuries, selfRatedSoreness } = req.body ?? {};

    if (typeof isCurrentlySick !== 'boolean') {
      return res.status(400).json({ error: 'isCurrentlySick must be true or false' });
    }
    if (!Number.isInteger(selfRatedSoreness) || selfRatedSoreness < 1 || selfRatedSoreness > 10) {
      return res.status(400).json({ error: 'Soreness must be a whole number between 1 and 10' });
    }

    const conditions = chronicConditions ?? [];
    if (!Array.isArray(conditions)) {
      return res.status(400).json({ error: 'chronicConditions must be a list' });
    }
    const unknown = conditions.filter((c) => !CHRONIC_CONDITIONS.includes(c));
    if (unknown.length) {
      return res.status(400).json({ error: `Unknown condition: ${unknown.join(', ')}` });
    }

    const injuries = pastInjuries ?? [];
    if (!Array.isArray(injuries)) {
      return res.status(400).json({ error: 'pastInjuries must be a list' });
    }
    for (const injury of injuries) {
      if (!injury || typeof injury.type !== 'string' || !injury.type.trim()) {
        return res.status(400).json({ error: 'Each past injury needs a type' });
      }
      if (injury.resolved !== undefined && typeof injury.resolved !== 'boolean') {
        return res.status(400).json({ error: 'Injury "resolved" must be true or false' });
      }
    }

    const form = await RiskAssessment.saveForm(req.user.userId, {
      isCurrentlySick,
      chronicConditions: conditions,
      pastInjuries: injuries.map((i) => ({
        type: i.type.trim(),
        date: i.date ?? null,
        resolved: i.resolved ?? true,
      })),
      selfRatedSoreness,
    });

    // Score against the form just saved plus the user's actual recent running.
    const runStats = await RiskAssessment.getRunStats(req.user.userId);

    // Where they run, taken from their most recent GPS track, so the weather lookup is
    // for their area rather than a fixed city. Falls back to the configured default.
    const where = await RiskAssessment.getLastKnownLocation(req.user.userId);
    const weather = await getWeatherModifier(where?.lat, where?.lng);

    const computed = scoreRisk({ form, runStats, weather });
    const score = await RiskAssessment.saveScore(req.user.userId, computed);

    return res.status(201).json({
      form: form.toJSON(),
      score: score.toJSON(),
      explanation: computed.explanation,
      runStats,
    });
  } catch (err) {
    console.error('Update risk assessment form error:', err);
    return res.status(500).json({ error: 'Failed to save risk assessment' });
  }
}

export default updateRiskAssessmentForm;
