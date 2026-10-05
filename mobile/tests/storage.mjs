const store = {};
export default {
  getItem: async (k) => (k in store ? store[k] : null),
  setItem: async (k, v) => { store[k] = v; },
  removeItem: async (k) => { delete store[k]; },
};
