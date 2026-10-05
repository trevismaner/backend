import request from '../api/client.js';

class Run {
  static async create(runData) {
    return request('/runs', { method: 'POST', body: runData });
  }

  static async getHistory({ limit = 20, offset = 0 } = {}) {
    return request(`/runs?limit=${limit}&offset=${offset}`);
  }

  static async getInsights() {
    return request('/runs/insights');
  }

  static async search(query) {
    return request(`/runs/search?q=${encodeURIComponent(query)}`);
  }

  static async getById(runId) {
    return request(`/runs/${runId}`);
  }

  static async updateName(runId, name) {
    return request(`/runs/${runId}/name`, { method: 'PATCH', body: { name } });
  }

  static async updateDescription(runId, description) {
    return request(`/runs/${runId}/description`, { method: 'PATCH', body: { description } });
  }

  /** Corrects the recorded figures — distance, duration, calories, heart rate. */
  static async update(runId, changes) {
    return request(`/runs/${runId}`, { method: 'PATCH', body: changes });
  }

  static async remove(runId) {
    return request(`/runs/${runId}`, { method: 'DELETE' });
  }

  // ---------- a run while it is still being recorded ----------

  static async startTracking(startedAt) {
    return request('/runs/active', { method: 'POST', body: { startedAt } });
  }

  static async getActive() {
    return request('/runs/active');
  }

  static async saveProgress({ distanceKm, durationSeconds, routeGps }) {
    return request('/runs/active', { method: 'PATCH', body: { distanceKm, durationSeconds, routeGps } });
  }

  static async discardActive() {
    return request('/runs/active', { method: 'DELETE' });
  }

  static async finishActive(runData) {
    return request('/runs/active/finish', { method: 'POST', body: runData });
  }
}

export default Run;
