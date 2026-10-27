import FitnessPlan from '../entities/FitnessPlan.js';

// RU-15: As a Registered User, I want to delete my fitness plan, so that I can remove one
// that's no longer relevant.
async function deleteFitnessPlan(req, res) {
  try {
    const existing = await FitnessPlan.findByIdForUser(req.params.planId, req.user.userId);
    if (!existing) {
      return res.status(404).json({ error: 'Fitness plan not found' });
    }

    await FitnessPlan.delete(req.params.planId, req.user.userId);
    return res.status(200).json({ message: 'Fitness plan deleted' });
  } catch (err) {
    console.error('Delete fitness plan error:', err);
    return res.status(500).json({ error: 'Failed to delete fitness plan' });
  }
}

export default deleteFitnessPlan;
