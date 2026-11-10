import request from '../api/client.js';

class User {
  static async register({ email, password, name, accountType, verificationToken }) {
    return request('/auth/register', {
      method: 'POST',
      body: { email, password, name, accountType, verificationToken },
      auth: false,
    });
  }

  /**
   * The sign-up rules, read from the server rather than duplicated here.
   *
   * This matters more than it looks: EXPO_PUBLIC_* values are frozen into the binary at
   * build time, so anything the app decides for itself cannot be changed without a new
   * build and a new store review. Asking the server means turning email verification on or
   * tightening the password rule takes effect immediately, on apps already installed.
   */
  static async getAuthConfig() {
    return request('/auth/config', { method: 'GET', auth: false });
  }

  /** Ask for a 6-digit code to be emailed. Safe to call again to resend. */
  static async requestEmailCode(email) {
    return request('/auth/verification/request', {
      method: 'POST',
      body: { email },
      auth: false,
    });
  }

  /** Check a code. On success the reply carries the verificationToken register() needs. */
  static async confirmEmailCode({ email, code }) {
    return request('/auth/verification/confirm', {
      method: 'POST',
      body: { email, code },
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
