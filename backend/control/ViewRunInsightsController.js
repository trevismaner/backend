import Run from '../entities/Run.js';

// RU-17 (calories), RU-18 (heart rate) and RU-19 (short- and long-term trends), as
// aggregates over the user's own run history. The per-run figures for RU-17/RU-18 are
// served by ViewRunDetailsController; this is the "across my training" view.
async function viewRunInsights(req, res) {
  try {
    const insights = await Run.getInsights(req.user.userId);
    return res.status(200).json(insights);
  } catch (err) {
    console.error('View run insights error:', err);
    return res.status(500).json({ error: 'Failed to load insights' });
  }
}

export default viewRunInsights;
