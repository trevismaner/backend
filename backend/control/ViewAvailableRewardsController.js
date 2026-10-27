import Reward from '../entities/Reward.js';

async function viewAvailableRewards(req, res) {
  try {
    const rewards = await Reward.getActive();
    const points = await Reward.getUserPoints(req.user.userId);
    return res.status(200).json({ rewards: rewards.map((r) => r.toJSON()), points });
  } catch (err) {
    console.error('View available rewards error:', err);
    return res.status(500).json({ error: 'Failed to load rewards' });
  }
}

export default viewAvailableRewards;
