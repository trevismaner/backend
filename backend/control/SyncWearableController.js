import Connection from '../entities/Connection.js';
import Run from '../entities/Run.js';
import { getProvider } from './oauthProviders.js';
import { validAccessToken } from './OAuthService.js';
import { fetchActivities, hasAdapter } from './wearableAdapters.js';

/**
 * RU-16's actual payoff: pull activities from the wearable so "biometric data feeds into
 * training insights automatically" — the imported runs carry heart rate and calories, so
 * they flow straight into RU-17/18/19 and the risk score.
 *
 * Imports are idempotent: each run keeps the provider's activity id, and a unique index on
 * (user_id, source, external_id) means syncing twice cannot create duplicates.
 */
async function syncWearable(req, res) {
  const name = req.params.provider;
  try {
    const provider = getProvider(name);
    if (!provider || provider.kind !== 'wearable') {
      return res.status(404).json({ error: 'Unknown wearable' });
    }
    if (provider.onDevice) {
      return res.status(400).json({ error: provider.reason });
    }
    if (!hasAdapter(name)) {
      return res.status(501).json({
        error: `Importing activities from ${provider.label} is not supported yet. The account is connected, but nothing can be pulled from it.`,
      });
    }

    const connection = await Connection.find(req.user.userId, name, 'wearable');
    if (!connection) {
      return res.status(404).json({ error: `${provider.label} is not connected` });
    }

    // Refresh the token first if it is close to expiring.
    const token = await validAccessToken(connection, (tokens) =>
      Connection.updateTokens(req.user.userId, name, 'wearable', tokens));
    if (!token.ok) {
      await Connection.recordSync(req.user.userId, name, { error: token.error });
      return res.status(401).json({ error: token.error });
    }

    // Only ask for what we have not seen, with a little overlap for late-arriving data.
    const since = connection.lastSyncedAt
      ? new Date(new Date(connection.lastSyncedAt).getTime() - 2 * 86400000)
      : null;

    const result = await fetchActivities(name, { accessToken: token.accessToken, since });
    if (!result.ok) {
      await Connection.recordSync(req.user.userId, name, { error: result.error });
      return res.status(502).json({ error: `${provider.label} could not be reached: ${result.error}` });
    }

    let imported = 0, skipped = 0;
    for (const activity of result.activities) {
      // Run.createImported returns null when this activity was already imported.
      const run = await Run.createImported(req.user.userId, {
        name: activity.name,
        distanceKm: activity.distanceKm,
        durationSeconds: activity.durationSeconds,
        caloriesBurned: activity.caloriesBurned,
        avgHeartRate: activity.avgHeartRate,
        maxHeartRate: activity.maxHeartRate,
        startedAt: activity.startedAt,
        endedAt: new Date(activity.startedAt.getTime() + (activity.durationSeconds || 0) * 1000),
        source: name,
        externalId: activity.externalId,
      });
      if (run) imported += 1; else skipped += 1;
    }

    await Connection.recordSync(req.user.userId, name, { error: null });

    return res.status(200).json({
      message: imported === 0
        ? 'Already up to date'
        : `Imported ${imported} run${imported === 1 ? '' : 's'} from ${provider.label}`,
      imported,
      skipped,
      provider: name,
    });
  } catch (err) {
    console.error('Sync wearable error:', err);
    await Connection.recordSync(req.user.userId, name, { error: 'Unexpected error during sync' }).catch(() => {});
    return res.status(500).json({ error: 'Failed to sync' });
  }
}

export default syncWearable;
