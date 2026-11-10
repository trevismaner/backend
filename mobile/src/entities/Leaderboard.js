import request from '../api/client.js';

class Leaderboard {
  static async getGlobal() {
    return request('/leaderboard');
  }

  static async getForGroup(groupId) {
    return request(`/groups/${groupId}/leaderboard`);
  }
}

export default Leaderboard;
