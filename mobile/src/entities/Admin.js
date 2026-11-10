import request from '../api/client.js';

function query(params = {}) {
  const pairs = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`);
  return pairs.length ? `?${pairs.join('&')}` : '';
}

class Admin {
  static async getStats() {
    return request('/admin/stats');
  }

  static async getAuditLogs({ action, targetType, adminId, targetUserId, targetId, page, limit } = {}) {
    return request(`/admin/audit-logs${query({ action, targetType, adminId, targetUserId, targetId, page, limit })}`);
  }

  static async sendAnnouncement({ title, body, role }) {
    return request('/admin/announcements', { method: 'POST', body: { title, body, role } });
  }

  static async listUsers({ search, role, suspended, page, limit } = {}) {
    return request(`/admin/users${query({ search, role, suspended, page, limit })}`);
  }

  static async getUser(userId) {
    return request(`/admin/users/${userId}`);
  }

  static async createUser({ email, password, name, role }) {
    return request('/admin/users', { method: 'POST', body: { email, password, name, role } });
  }

  static async setUserSuspension(userId, isSuspended, reason) {
    return request(`/admin/users/${userId}/suspension`, {
      method: 'PATCH',
      body: { isSuspended, reason },
    });
  }

  static async updateUserRole(userId, role) {
    return request(`/admin/users/${userId}/role`, { method: 'PATCH', body: { role } });
  }

  static async setInstructorVerification(userId, verified, reason) {
    return request(`/admin/users/${userId}/instructor-verification`, {
      method: 'PATCH',
      body: { verified, reason },
    });
  }

  // SA-06: fix the things that lock a user out — name, email, password, bio.
  static async updateUser(userId, changes) {
    return request(`/admin/users/${userId}`, { method: 'PUT', body: changes });
  }

  static async deleteUser(userId) {
    return request(`/admin/users/${userId}`, { method: 'DELETE' });
  }

  static async awardBadge(userId, badgeId) {
    return request(`/admin/users/${userId}/badges`, { method: 'POST', body: { badgeId } });
  }

  static async revokeBadge(userId, badgeId) {
    return request(`/admin/users/${userId}/badges/${badgeId}`, { method: 'DELETE' });
  }

  static async listGroups({ search, suspended, page, limit } = {}) {
    return request(`/admin/groups${query({ search, suspended, page, limit })}`);
  }

  static async setGroupSuspension(groupId, isSuspended, reason) {
    return request(`/admin/groups/${groupId}/suspension`, {
      method: 'PATCH',
      body: { isSuspended, reason },
    });
  }

  // SA-21: rename or re-cap a group instead of deleting it and losing its members.
  static async updateGroup(groupId, changes) {
    return request(`/admin/groups/${groupId}`, { method: 'PUT', body: changes });
  }

  static async deleteGroup(groupId) {
    return request(`/admin/groups/${groupId}`, { method: 'DELETE' });
  }

  static async listRewards() {
    return request('/admin/rewards');
  }

  static async createReward({ name, description, pointsRequired, rewardType, stock }) {
    return request('/admin/rewards', {
      method: 'POST',
      body: { name, description, pointsRequired, rewardType, stock },
    });
  }

  static async updateReward(rewardId, changes) {
    return request(`/admin/rewards/${rewardId}`, { method: 'PATCH', body: changes });
  }

  static async listBadges() {
    return request('/admin/badges');
  }

  static async createBadge({ name, description, iconUrl }) {
    return request('/admin/badges', { method: 'POST', body: { name, description, iconUrl } });
  }

  static async updateBadge(badgeId, changes) {
    return request(`/admin/badges/${badgeId}`, { method: 'PATCH', body: changes });
  }

  static async deleteBadge(badgeId) {
    return request(`/admin/badges/${badgeId}`, { method: 'DELETE' });
  }

  static async listRuns({ userId, minDistanceKm, maxPaceSecondsPerKm, page, limit } = {}) {
    return request(`/admin/runs${query({ userId, minDistanceKm, maxPaceSecondsPerKm, page, limit })}`);
  }

  static async deleteRun(runId) {
    return request(`/admin/runs/${runId}`, { method: 'DELETE' });
  }
}

export default Admin;
