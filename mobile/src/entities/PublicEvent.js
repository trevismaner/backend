import request from '../api/client.js';

class PublicEvent {
  static async getAll() {
    return request('/public-events');
  }

  static async getById(eventId) {
    return request(`/public-events/${eventId}`);
  }

  static async join(eventId) {
    return request(`/public-events/${eventId}/join`, { method: 'POST' });
  }

  static async withdraw(eventId) {
    return request(`/public-events/${eventId}/withdraw`, { method: 'POST' });
  }

  static async adminCreate(fields) {
    return request('/admin/public-events', { method: 'POST', body: fields });
  }

  static async adminUpdate(eventId, changes) {
    return request(`/admin/public-events/${eventId}`, { method: 'PUT', body: changes });
  }

  static async adminDelete(eventId) {
    return request(`/admin/public-events/${eventId}`, { method: 'DELETE' });
  }
}

export default PublicEvent;
