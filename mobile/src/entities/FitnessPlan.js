import request from '../api/client.js';

export const GOAL_TYPES = ['weight_loss', 'race_prep', 'general_fitness', 'endurance', 'speed'];

export const GOAL_LABELS = {
  weight_loss: 'Weight loss',
  race_prep: 'Race prep',
  general_fitness: 'General fitness',
  endurance: 'Endurance',
  speed: 'Speed',
};

class FitnessPlan {
  static async create({ goalType, targetDistanceKm, weeklyFrequency, durationWeeks }) {
    return request('/fitness-plans', {
      method: 'POST',
      body: { goalType, targetDistanceKm, weeklyFrequency, durationWeeks },
    });
  }

  static async get() {
    return request('/fitness-plans');
  }

  static async update(planId, changes) {
    return request(`/fitness-plans/${planId}`, { method: 'PUT', body: changes });
  }

  static async delete(planId) {
    return request(`/fitness-plans/${planId}`, { method: 'DELETE' });
  }

  static async activate(planId) {
    return request(`/fitness-plans/${planId}/activate`, { method: 'PATCH' });
  }

  /**
   * Asks for a week-by-week schedule. Answers 202 straight away — the work happens on the
   * server, so the screen polls `get()` until generationStatus stops being 'generating'.
   */
  static async generate(planId) {
    return request(`/fitness-plans/${planId}/generate`, { method: 'POST' });
  }

  static async completeSession(sessionId, runId) {
    return request(`/fitness-plans/sessions/${sessionId}/complete`, { method: 'PATCH', body: { runId } });
  }

  static async clearSession(sessionId) {
    return request(`/fitness-plans/sessions/${sessionId}/complete`, { method: 'DELETE' });
  }
}

export default FitnessPlan;
