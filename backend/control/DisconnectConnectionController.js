import Connection from '../entities/Connection.js';
import { getProvider } from './oauthProviders.js';
import { revokeToken } from './OAuthService.js';

// RU-16 / RU-49 — unlink an account. Tells the provider to forget us where it supports
// that, but always removes our own record, since that is what the user asked for.
async function disconnectConnection(req, res) {
  try {
    const name = req.params.provider;
    const provider = getProvider(name);
    if (!provider) {
      return res.status(404).json({ error: 'Unknown provider' });
    }

    const existing = await Connection.find(req.user.userId, name, provider.kind);
    if (!existing) {
      return res.status(404).json({ error: 'That account is not connected' });
    }

    await revokeToken(name, existing.accessToken).catch(() => {});
    await Connection.remove(req.user.userId, name, provider.kind);

    return res.status(200).json({ message: `${provider.label} disconnected`, provider: name });
  } catch (err) {
    console.error('Disconnect error:', err);
    return res.status(500).json({ error: 'Failed to disconnect' });
  }
}

export default disconnectConnection;
