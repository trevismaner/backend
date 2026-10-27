import Reward from '../entities/Reward.js';

async function viewClaimedRewards(req, res) {
  try {
    const claims = await Reward.getClaimedByUser(req.user.userId);
    return res.status(200).json({ claims });
  } catch (err) {
    console.error('View claimed rewards error:', err);
    return res.status(500).json({ error: 'Failed to load claimed rewards' });
  }
}

export default viewClaimedRewards;
