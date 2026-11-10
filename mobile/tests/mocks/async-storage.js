// Babel's interop reads `.default` when __esModule is set, so mark it explicitly.
const store = {};
const AsyncStorage = {
  getItem: async (k) => (k in store ? store[k] : null),
  setItem: async (k, v) => { store[k] = v; },
  removeItem: async (k) => { delete store[k]; },
  clear: async () => { for (const k of Object.keys(store)) delete store[k]; },
};
module.exports = { __esModule: true, default: AsyncStorage };
