import request from '../api/client.js';

class Connection {
  static async list() {
    return request('/connections');
  }

  static async start(provider) {
    return request(`/connections/${provider}/connect`, { method: 'POST' });
  }

  static async disconnect(provider) {
    return request(`/connections/${provider}`, { method: 'DELETE' });
  }

  static async sync(provider) {
    return request(`/connections/${provider}/sync`, { method: 'POST' });
  }
}

export default Connection;
