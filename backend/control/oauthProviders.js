/**
 * The providers this app can connect to (RU-16 wearables, RU-49 social).
 *
 * Every entry is inert until its client id and secret are set in .env — the app never
 * ships credentials, and an unconfigured provider is reported as such rather than failing
 * halfway through a redirect the user cannot complete.
 *
 * Endpoint URLs and scopes are each provider's documented values; check them against the
 * current docs when you register your app, since providers do move them.
 */

const env = (name) => {
  const v = process.env[name];
  return v && v.trim() ? v.trim() : null;
};

/**
 * Endpoint URLs can be overridden per provider, e.g. FITBIT_TOKEN_URL. That exists so the
 * handshake can be tested end to end against a local stub — without it, this code could
 * only ever be exercised by talking to the real service. Leave them unset in production.
 */
const endpoint = (providerName, field, fallback) =>
  env(`${providerName.toUpperCase()}_${field}_URL`) ?? fallback;

export const PROVIDERS = {
  // ── wearables (RU-16) ──
  fitbit: {
    kind: 'wearable',
    label: 'Fitbit',
    docs: 'https://dev.fitbit.com/build/reference/web-api/',
    get authorizeUrl() { return endpoint('fitbit', 'AUTHORIZE', 'https://www.fitbit.com/oauth2/authorize'); },
    get tokenUrl() { return endpoint('fitbit', 'TOKEN', 'https://api.fitbit.com/oauth2/token'); },
    get revokeUrl() { return endpoint('fitbit', 'REVOKE', 'https://api.fitbit.com/oauth2/revoke'); },
    scope: 'activity heartrate profile',
    usesPkce: true,
    // Fitbit wants the client id/secret as HTTP Basic on the token call.
    tokenAuth: 'basic',
    clientId: () => env('FITBIT_CLIENT_ID'),
    clientSecret: () => env('FITBIT_CLIENT_SECRET'),
    canSync: true,
  },
  /**
   * Google Health, the cloud successor to Google Fit.
   *
   * Fit is not an option: sign-ups closed on 1 May 2024 and the APIs are supported only to the
   * end of 2026. Health Connect is the other successor, but it is an on-device Android API
   * rather than REST, so it bypasses this backend entirely. Google Health is the one that fits
   * here — ordinary OAuth 2.0, and credentials are self-serve rather than approval-gated.
   *
   * An unverified client is capped at 100 users, and while the consent screen is in Testing
   * mode refresh tokens expire after 7 days. Both are fine for a project; neither is forever.
   */
  google_health: {
    kind: 'wearable',
    label: 'Google Health',
    docs: 'https://developers.google.com/health',
    get authorizeUrl() { return endpoint('google_health', 'AUTHORIZE', 'https://accounts.google.com/o/oauth2/v2/auth'); },
    get tokenUrl() { return endpoint('google_health', 'TOKEN', 'https://oauth2.googleapis.com/token'); },
    get revokeUrl() { return endpoint('google_health', 'REVOKE', 'https://oauth2.googleapis.com/revoke'); },
    scope: 'https://www.googleapis.com/auth/googlehealth.activity_and_fitness.readonly',
    usesPkce: true,
    tokenAuth: 'body',
    // See buildAuthorizeUrl in OAuthService.js: without these two there is no refresh token,
    // and the connection dies an hour after the user grants it.
    authParams: { access_type: 'offline', prompt: 'consent' },
    clientId: () => env('GOOGLE_HEALTH_CLIENT_ID'),
    clientSecret: () => env('GOOGLE_HEALTH_CLIENT_SECRET'),
    // The handshake works. The activity adapter is not written yet, for the same reason Garmin's
    // is not: one written from imagination would look like it worked and import nothing.
    // Capture a real /v4/users/me/dataTypes/exercise/dataPoints response first.
    canSync: false,
  },
  garmin: {
    kind: 'wearable',
    label: 'Garmin Connect',
    docs: 'https://developer.garmin.com/gc-developer-program/health-api/',
    get authorizeUrl() { return endpoint('garmin', 'AUTHORIZE', 'https://connect.garmin.com/oauth2Confirm'); },
    get tokenUrl() { return endpoint('garmin', 'TOKEN', 'https://diauth.garmin.com/di-oauth2-service/oauth/token'); },
    scope: 'ACTIVITY_EXPORT HEALTH_EXPORT',
    usesPkce: true,
    tokenAuth: 'body',
    clientId: () => env('GARMIN_CLIENT_ID'),
    clientSecret: () => env('GARMIN_CLIENT_SECRET'),
    // The handshake works, but no activity adapter is written yet — see wearableAdapters.js
    canSync: false,
  },
  /**
   * Samsung Health and Apple Health were listed here and were removed in migration 010.
   *
   * Both could be declared but never connected. Samsung's activity endpoints need a signed
   * developer agreement this project does not hold, and Apple HealthKit is an on-device
   * framework with no OAuth handshake and no server to call — the phone would have to read
   * HealthKit locally and post workouts up, which is a different feature from this one.
   * Listing them only put two permanently unavailable entries on the connections screen.
   */

  // ── social (RU-49) ──
  strava: {
    kind: 'social',
    label: 'Strava',
    docs: 'https://developers.strava.com/docs/authentication/',
    get authorizeUrl() { return endpoint('strava', 'AUTHORIZE', 'https://www.strava.com/oauth/authorize'); },
    get tokenUrl() { return endpoint('strava', 'TOKEN', 'https://www.strava.com/oauth/token'); },
    get revokeUrl() { return endpoint('strava', 'REVOKE', 'https://www.strava.com/oauth/deauthorize'); },
    scope: 'read,activity:write',
    usesPkce: false,
    tokenAuth: 'body',
    clientId: () => env('STRAVA_CLIENT_ID'),
    clientSecret: () => env('STRAVA_CLIENT_SECRET'),
  },
  facebook: {
    kind: 'social',
    label: 'Facebook',
    docs: 'https://developers.facebook.com/docs/facebook-login/',
    get authorizeUrl() { return endpoint('facebook', 'AUTHORIZE', 'https://www.facebook.com/v19.0/dialog/oauth'); },
    get tokenUrl() { return endpoint('facebook', 'TOKEN', 'https://graph.facebook.com/v19.0/oauth/access_token'); },
    scope: 'public_profile',
    usesPkce: false,
    tokenAuth: 'body',
    clientId: () => env('FACEBOOK_CLIENT_ID'),
    clientSecret: () => env('FACEBOOK_CLIENT_SECRET'),
  },
  instagram: {
    kind: 'social',
    label: 'Instagram',
    docs: 'https://developers.facebook.com/docs/instagram-basic-display-api/',
    get authorizeUrl() { return endpoint('instagram', 'AUTHORIZE', 'https://api.instagram.com/oauth/authorize'); },
    get tokenUrl() { return endpoint('instagram', 'TOKEN', 'https://api.instagram.com/oauth/access_token'); },
    scope: 'user_profile',
    usesPkce: false,
    tokenAuth: 'body',
    clientId: () => env('INSTAGRAM_CLIENT_ID'),
    clientSecret: () => env('INSTAGRAM_CLIENT_SECRET'),
  },
  x: {
    kind: 'social',
    label: 'X',
    docs: 'https://developer.x.com/en/docs/authentication/oauth-2-0',
    get authorizeUrl() { return endpoint('x', 'AUTHORIZE', 'https://twitter.com/i/oauth2/authorize'); },
    get tokenUrl() { return endpoint('x', 'TOKEN', 'https://api.twitter.com/2/oauth2/token'); },
    scope: 'tweet.read tweet.write users.read offline.access',
    usesPkce: true,
    tokenAuth: 'basic',
    clientId: () => env('X_CLIENT_ID'),
    clientSecret: () => env('X_CLIENT_SECRET'),
  },
  tiktok: {
    kind: 'social',
    label: 'TikTok',
    docs: 'https://developers.tiktok.com/doc/login-kit-web/',
    get authorizeUrl() { return endpoint('tiktok', 'AUTHORIZE', 'https://www.tiktok.com/v2/auth/authorize/'); },
    get tokenUrl() { return endpoint('tiktok', 'TOKEN', 'https://open.tiktokapis.com/v2/oauth/token/'); },
    scope: 'user.info.basic',
    usesPkce: true,
    tokenAuth: 'body',
    clientId: () => env('TIKTOK_CLIENT_ID'),
    clientSecret: () => env('TIKTOK_CLIENT_SECRET'),
  },
};

/** Where the provider sends the user back. Must match what you registered with them. */
export function redirectUri(providerName) {
  const base = process.env.OAUTH_REDIRECT_BASE || 'http://localhost:3000/api/connections';
  return `${base}/${providerName}/callback`;
}

export function getProvider(name) {
  return PROVIDERS[name] ?? null;
}

/** Configured = we hold credentials for it, so a connection attempt could actually finish. */
export function isConfigured(name) {
  const p = PROVIDERS[name];
  if (!p) return false;
  return Boolean(p.clientId?.() && p.clientSecret?.());
}

/**
 * What the app shows on its connections screen: every provider, whether it is available,
 * and if not, why. Never exposes the credentials themselves.
 */
export function describeProviders(kind = null) {
  return Object.entries(PROVIDERS)
    .filter(([, p]) => !kind || p.kind === kind)
    .map(([name, p]) => ({
      provider: name,
      label: p.label,
      kind: p.kind,
      available: isConfigured(name),
      canSync: Boolean(p.canSync),
      unavailableReason: isConfigured(name)
        ? null
        : `${p.label} is not set up on this server yet — an administrator needs to add its API credentials.`,
      docs: p.docs,
    }));
}
