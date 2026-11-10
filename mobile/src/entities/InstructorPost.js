import request from '../api/client.js';

export const POST_CATEGORIES = ['training', 'nutrition', 'recovery', 'injury_prevention'];

function query(params = {}) {
  const pairs = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`);
  return pairs.length ? `?${pairs.join('&')}` : '';
}

class InstructorPost {
  static async getAll({ category, search, page, limit } = {}) {
    return request(`/instructor-posts${query({ category, search, page, limit })}`);
  }

  static async getMine({ page, limit } = {}) {
    return request(`/instructor-posts/mine${query({ page, limit })}`);
  }

  static async getById(postId) {
    return request(`/instructor-posts/${postId}`);
  }

  static async create({ title, content, category }) {
    return request('/instructor-posts', { method: 'POST', body: { title, content, category } });
  }

  static async update(postId, changes) {
    return request(`/instructor-posts/${postId}`, { method: 'PUT', body: changes });
  }

  static async delete(postId) {
    return request(`/instructor-posts/${postId}`, { method: 'DELETE' });
  }
}

export default InstructorPost;
