import Leaderboard from '../entities/Leaderboard.js';

async function viewGlobalLeaderboard(req, res) {
  try {
    const leaderboard = await Leaderboard.getGlobal();
    return res.status(200).json({ leaderboard });
  } catch (err) {
    console.error('View global leaderboard error:', err);
    return res.status(500).json({ error: 'Failed to load leaderboard' });
  }
}

export default viewGlobalLeaderboard;
