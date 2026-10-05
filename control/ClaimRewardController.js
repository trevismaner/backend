import Reward from '../entities/Reward.js';

// Reward.claim() checks stock and points and records the claim in one transaction,
// so double-taps or simultaneous claims can't overspend points or stock.
const CLAIM_ERRORS = {
  not_found: [404, 'Reward not found'],
  unavailable: [409, 'This reward is no longer available'],
  insufficient_points: [409, 'Insufficient points to claim this reward'],
};

async function claimReward(req, res) {
  try {
    const rewardId = Number(req.params.rewardId);
    if (!Number.isInteger(rewardId) || rewardId <= 0) {
      return res.status(400).json({ error: 'Invalid reward id' });
    }

    const result = await Reward.claim(req.user.userId, rewardId);
    if (!result.ok) {
      const [status, error] = CLAIM_ERRORS[result.reason];
      return res.status(status).json({ error });
    }

    return res.status(200).json({
      message: 'Reward claimed',
      claim: result.claim,
      remainingPoints: result.remainingPoints,
    });
  } catch (err) {
    console.error('Claim reward error:', err);
    return res.status(500).json({ error: 'Failed to claim reward' });
  }
}

export default claimReward;
