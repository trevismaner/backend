import request from '../api/client.js';

class Notification {
  static async getAll() {
    return request('/notifications');
  }

  static async markRead(notificationId) {
    return request(`/notifications/${notificationId}/read`, { method: 'PATCH' });
  }

  static async getPreferences() {
    return request('/notifications/preferences');
  }

  static async updatePreferences(prefs) {
    return request('/notifications/preferences', { method: 'PUT', body: prefs });
  }

  static async registerPushToken(pushToken) {
    return request('/notifications/push-token', { method: 'POST', body: { pushToken } });
  }
}

export default Notification;
