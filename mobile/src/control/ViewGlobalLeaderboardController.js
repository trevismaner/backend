import Leaderboard from '../entities/Leaderboard.js';

async function viewGlobalLeaderboardController() {
  try {
    const data = await Leaderboard.getGlobal();
    return { success: true, field: null, message: '', data };
  } catch (err) {
    return { success: false, field: null, message: err.message };
  }
}

export default viewGlobalLeaderboardController;
