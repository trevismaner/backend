import Connection from '../entities/Connection.js';

/**
 * Providers the backend supports but this app does not offer.
 *
 * Fitbit is fully implemented server-side — it is the one wearable with a working activity
 * importer, and the connections test exercises its whole handshake, refresh and import path
 * against a stub. It is hidden here rather than deleted so that work, and RU-16's only
 * actual implementation, both stay intact.
 *
 * Hidden in the control layer rather than in the screen so the rule lives in one place and
 * anything else that lists connections gets it too.
 */
const HIDDEN_PROVIDERS = ['fitbit'];

/**
 * A hidden provider is still shown if the user has already connected it, because otherwise
 * that connection becomes unreachable: no way to sync it and, worse, no way to disconnect it.
 */
const visible = (list) =>
  (Array.isArray(list) ? list : []).filter(
    (p) => !HIDDEN_PROVIDERS.includes(p.provider) || p.connected
  );

async function viewConnectionsController() {
  try {
    const data = await Connection.list();
    return {
      success: true,
      field: null,
      message: '',
      data: { ...data, wearables: visible(data?.wearables), social: data?.social },
    };
  } catch (err) {
    return { success: false, field: null, message: err.message };
  }
}

export default viewConnectionsController;
