import FitnessPlan from '../entities/FitnessPlan.js';

// Supports RU-14: switching back to an earlier plan rather than rebuilding it. Making one
// plan active stands the others down, so "my fitness plan" stays unambiguous.
async function activateFitnessPlan(req, res) {
  try {
    const existing = await FitnessPlan.findByIdForUser(req.params.planId, req.user.userId);
    if (!existing) {
      return res.status(404).json({ error: 'Fitness plan not found' });
    }

    const plan = await FitnessPlan.setActive(req.params.planId, req.user.userId);
    return res.status(200).json({ plan: plan.toJSON() });
  } catch (err) {
    console.error('Activate fitness plan error:', err);
    return res.status(500).json({ error: 'Failed to activate fitness plan' });
  }
}

export default activateFitnessPlan;
