import request from '../api/client.js';

class Reward {
  static async getAvailable() {
    return request('/rewards');
  }

  static async claim(rewardId) {
    return request(`/rewards/${rewardId}/claim`, { method: 'POST' });
  }

  static async getClaimed() {
    return request('/rewards/claimed');
  }

  static async getBadges() {
    return request('/rewards/badges');
  }

  static async setBadgeDisplay(badgeId, isDisplayed) {
    return request(`/rewards/badges/${badgeId}/display`, { method: 'PATCH', body: { isDisplayed } });
  }
}

export default Reward;
