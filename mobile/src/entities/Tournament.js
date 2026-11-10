import request from '../api/client.js';

class Tournament {
  static async create(groupId, { name, description, distanceType, startDate, endDate }) {
    return request(`/groups/${groupId}/tournaments`, {
      method: 'POST',
      body: { name, description, distanceType, startDate, endDate },
    });
  }

  static async getMine() {
    return request('/tournaments/mine');
  }

  static async getAvailable() {
    return request('/tournaments/available');
  }

  static async getDetails(tournamentId) {
    return request(`/tournaments/${tournamentId}`);
  }

  static async update(tournamentId, data) {
    return request(`/tournaments/${tournamentId}`, { method: 'PUT', body: data });
  }

  static async remove(tournamentId) {
    return request(`/tournaments/${tournamentId}`, { method: 'DELETE' });
  }

  static async setLimits(tournamentId, { maxParticipants, registrationDeadline }) {
    return request(`/tournaments/${tournamentId}/limits`, {
      method: 'PATCH',
      body: { maxParticipants, registrationDeadline },
    });
  }

  static async updateStatus(tournamentId, status) {
    return request(`/tournaments/${tournamentId}/status`, { method: 'PATCH', body: { status } });
  }

  static async join(tournamentId) {
    return request(`/tournaments/${tournamentId}/join`, { method: 'POST' });
  }

  static async getStandings(tournamentId) {
    return request(`/tournaments/${tournamentId}/standings`);
  }

  /**
   * Records a finishing time. Omit userId to record your own; a group admin may pass one
   * to record for any participant. Pass resultTimeSeconds: null to clear a time.
   */
  static async recordResult(tournamentId, { userId, resultTimeSeconds }) {
    return request(`/tournaments/${tournamentId}/results`, {
      method: 'PATCH',
      body: { ...(userId ? { userId } : {}), resultTimeSeconds },
    });
  }

  static async withdraw(tournamentId) {
    return request(`/tournaments/${tournamentId}/withdraw`, { method: 'POST' });
  }

  static async getByGroup(groupId) {
    return request(`/groups/${groupId}/tournaments`);
  }
}

export default Tournament;
