import request from '../api/client.js';

class Group {
  static async create({ name, description, isPrivate, maxMembers }) {
    return request('/groups', { method: 'POST', body: { name, description, isPrivate, maxMembers } });
  }

  static async getMine() {
    return request('/groups/mine');
  }

  static async getDetails(groupId) {
    return request(`/groups/${groupId}`);
  }

  static async update(groupId, { name, description, maxMembers }) {
    return request(`/groups/${groupId}`, { method: 'PUT', body: { name, description, maxMembers } });
  }

  static async search(query) {
    return request(`/groups/search?q=${encodeURIComponent(query)}`);
  }

  static async join(groupId) {
    return request(`/groups/${groupId}/join`, { method: 'POST' });
  }

  static async leave(groupId) {
    return request(`/groups/${groupId}/leave`, { method: 'POST' });
  }

  static async inviteUser(groupId, userId) {
    return request(`/groups/${groupId}/invite`, { method: 'POST', body: { userId } });
  }

  static async respondToJoinRequest(groupId, userId, decision) {
    return request(`/groups/${groupId}/requests/respond`, { method: 'POST', body: { userId, decision } });
  }

  static async removeMember(groupId, userId) {
    return request(`/groups/${groupId}/members/${userId}`, { method: 'DELETE' });
  }

  static async promoteMember(groupId, userId) {
    return request(`/groups/${groupId}/members/${userId}/promote`, { method: 'POST' });
  }
}

export default Group;
