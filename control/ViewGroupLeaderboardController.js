import Leaderboard from '../entities/Leaderboard.js';

async function viewGroupLeaderboard(req, res) {
  try {
    const leaderboard = await Leaderboard.getForGroup(req.params.groupId);
    return res.status(200).json({ leaderboard });
  } catch (err) {
    console.error('View group leaderboard error:', err);
    return res.status(500).json({ error: 'Failed to load leaderboard' });
  }
}

export default viewGroupLeaderboard;
