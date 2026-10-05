import Leaderboard from '../entities/Leaderboard.js';

async function viewGroupLeaderboardController(groupId) {
  try {
    const data = await Leaderboard.getForGroup(groupId);
    return { success: true, field: null, message: '', data };
  } catch (err) {
    return { success: false, field: null, message: err.message };
  }
}

export default viewGroupLeaderboardController;
