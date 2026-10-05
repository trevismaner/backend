import request from '../api/client.js';

class User {
  static async register({ email, password, name, accountType }) {
    return request('/auth/register', {
      method: 'POST',
      body: { email, password, name, accountType },
      auth: false,
    });
  }

  static async login({ email, password }) {
    return request('/auth/login', {
      method: 'POST',
      body: { email, password },
      auth: false,
    });
  }

  static async logout() {
    return request('/auth/logout', { method: 'POST' });
  }

  /** The session check — who this token belongs to. Used when restoring a saved session. */
  static async getCurrent() {
    return request('/auth/me');
  }

  /**
   * What the profile screen needs: the same user, plus the lifetime run totals it displays.
   * `/auth/me` does not carry those totals, which is why this is a separate call.
   */
  static async getProfile() {
    return request('/profile');
  }

  static async updateProfile({ name, bio, profilePhotoUrl }) {
    return request('/profile', {
      method: 'PUT',
      body: { name, bio, profilePhotoUrl },
    });
  }

  // IU-04: credentials an instructor submits for a System Admin to verify (SA-11).
  static async getCredentials() {
    return request('/profile/credentials');
  }

  static async submitCredentials({ qualification, reference }) {
    return request('/profile/credentials', {
      method: 'PUT',
      body: { qualification, reference },
    });
  }
}

export default User;
