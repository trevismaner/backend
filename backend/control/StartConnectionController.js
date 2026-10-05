import Connection from '../entities/Connection.js';
import { getProvider, isConfigured } from './oauthProviders.js';
import { buildAuthorizeUrl, createPkcePair } from './OAuthService.js';

// In-memory PKCE verifiers, keyed by state. They live for one handshake only, so there is
// no value in persisting them; a server restart mid-handshake simply means starting again.
export const pkceStore = new Map();

/**
 * RU-16 / RU-49 step 1: hand the app a URL to open so the user can approve access.
 * Nothing is stored against the account until they come back through the callback.
 */
async function startConnection(req, res) {
  try {
    const name = req.params.provider;
    const provider = getProvider(name);

    if (!provider) {
      return res.status(404).json({ error: 'Unknown provider' });
    }
    if (provider.onDevice) {
      return res.status(400).json({ error: provider.reason });
    }
    if (!isConfigured(name)) {
      return res.status(503).json({
        error: `${provider.label} is not set up on this server yet — an administrator needs to add its API credentials.`,
      });
    }

    const state = await Connection.createState({
      userId: req.user.userId,
      provider: name,
      kind: provider.kind,
      redirectTo: typeof req.query.redirectTo === 'string' ? req.query.redirectTo : null,
    });

    let codeChallenge;
    if (provider.usesPkce) {
      const { verifier, challenge } = createPkcePair();
      pkceStore.set(state, verifier);
      codeChallenge = challenge;
    }

    return res.status(200).json({
      authorizeUrl: buildAuthorizeUrl(name, { state, codeChallenge }),
      provider: name,
      label: provider.label,
      state,
    });
  } catch (err) {
    console.error('Start connection error:', err);
    return res.status(500).json({ error: 'Failed to start the connection' });
  }
}

export default startConnection;
