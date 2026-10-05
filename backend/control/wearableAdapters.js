/**
 * Turning a provider's activity list into Run League runs (RU-16).
 *
 * Each provider returns a different shape, so each gets an adapter with the same job:
 * fetch recent activities, keep the runs, and describe each one in our own terms.
 * Adding a provider means adding an entry here — nothing else changes.
 *
 * Fitbit is implemented as the worked example because its Web API is the best documented
 * of the three. Garmin and Samsung Health need a signed developer agreement before their
 * activity endpoints can even be called, so they are declared but not guessed at: an
 * adapter written from imagination would look like it worked and quietly import nothing.
 */

const TIMEOUT_MS = 10000;

/**
 * API bases are overridable per provider (e.g. FITBIT_API_URL) for the same reason the
 * OAuth endpoints are: without it this code could only be exercised against the live
 * service. Leave unset in production.
 */
const apiBase = (provider, fallback) =>
  process.env[`${provider.toUpperCase()}_API_URL`]?.trim() || fallback;

async function getJson(url, accessToken) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
      signal: controller.signal,
    });
    const text = await response.text();
    let payload = null;
    try { payload = text ? JSON.parse(text) : null; } catch { payload = null; }
    if (!response.ok) {
      return { ok: false, status: response.status, error: payload?.errors?.[0]?.message || `HTTP ${response.status}` };
    }
    return { ok: true, payload };
  } catch (err) {
    return { ok: false, status: 0, error: err.name === 'AbortError' ? 'The service took too long to respond' : err.message };
  } finally {
    clearTimeout(timer);
  }
}

// Fitbit reports distance in the unit the account is set to; ask for metric explicitly.
const FITBIT_RUN_TYPES = ['Run', 'Treadmill', 'Sport', 'Walk'];

const adapters = {
  /**
   * https://dev.fitbit.com/build/reference/web-api/activity/get-activity-log-list/
   * Returns activities after `afterDate`, newest last.
   */
  fitbit: async ({ accessToken, since }) => {
    const after = (since ?? new Date(Date.now() - 30 * 86400000)).toISOString().slice(0, 10);
    const url = `${apiBase('fitbit', 'https://api.fitbit.com')}/1/user/-/activities/list.json`
      + `?afterDate=${after}&sort=asc&offset=0&limit=100`;

    const result = await getJson(url, accessToken);
    if (!result.ok) return result;

    const activities = result.payload?.activities ?? [];
    const runs = activities
      .filter((a) => FITBIT_RUN_TYPES.includes(a.activityName) || /run/i.test(a.activityName ?? ''))
      .map((a) => ({
        externalId: String(a.logId),
        name: a.activityName || 'Run',
        // distance comes back in km when the account is metric; Fitbit states the unit
        distanceKm: a.distanceUnit === 'Kilometer' || a.distanceUnit === 'km'
          ? Number(a.distance)
          : Number(a.distance) * 1.609344,
        durationSeconds: Math.round((a.activeDuration ?? a.duration ?? 0) / 1000),
        caloriesBurned: a.calories ?? null,
        avgHeartRate: a.averageHeartRate ?? null,
        maxHeartRate: Array.isArray(a.heartRateZones)
          ? a.heartRateZones.reduce((max, z) => Math.max(max, z.max ?? 0), 0) || null
          : null,
        startedAt: a.startTime ? new Date(a.startTime) : null,
      }))
      .filter((r) => r.startedAt && Number.isFinite(r.distanceKm) && r.distanceKm > 0);

    return { ok: true, activities: runs };
  },
};

export function hasAdapter(provider) {
  return Object.prototype.hasOwnProperty.call(adapters, provider);
}

export async function fetchActivities(provider, options) {
  if (!hasAdapter(provider)) {
    return { ok: false, error: `Importing activities from this service is not supported yet` };
  }
  return adapters[provider](options);
}

export default adapters;
