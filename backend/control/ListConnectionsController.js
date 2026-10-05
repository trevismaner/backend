import Connection from '../entities/Connection.js';
import { describeProviders } from './oauthProviders.js';

// RU-16 / RU-49 — what can be connected, and what this user has connected.
// Returns every provider (not just the configured ones) so the screen can explain why
// something is unavailable rather than silently hiding it.
async function listConnections(req, res) {
  try {
    const [wearables, social] = await Promise.all([
      Connection.listForUser(req.user.userId, 'wearable'),
      Connection.listForUser(req.user.userId, 'social'),
    ]);
    const connected = new Map(
      [...wearables, ...social].map((c) => [c.provider, c.toJSON()])
    );

    const providers = describeProviders().map((p) => ({
      ...p,
      ...(connected.get(p.provider) ?? { connected: false }),
    }));

    return res.status(200).json({
      providers,
      wearables: providers.filter((p) => p.kind === 'wearable'),
      social: providers.filter((p) => p.kind === 'social'),
    });
  } catch (err) {
    console.error('List connections error:', err);
    return res.status(500).json({ error: 'Failed to load connections' });
  }
}

export default listConnections;
