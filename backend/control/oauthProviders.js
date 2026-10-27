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
  samsung_health: {
    kind: 'wearable',
    label: 'Samsung Health',
    docs: 'https://developer.samsung.com/health',
    get authorizeUrl() { return endpoint('samsung_health', 'AUTHORIZE', 'https://account.samsung.com/accounts/v1/SAMSUNGHEALTH/authorize'); },
    get tokenUrl() { return endpoint('samsung_health', 'TOKEN', 'https://account.samsung.com/accounts/v1/SAMSUNGHEALTH/token'); },
    scope: 'activity.read heartrate.read',
    usesPkce: false,
    tokenAuth: 'body',
    clientId: () => env('SAMSUNG_CLIENT_ID'),
    clientSecret: () => env('SAMSUNG_CLIENT_SECRET'),
    canSync: false,
  },
  /**
   * Apple HealthKit is deliberately different: it is an on-device framework, not a web API.
   * There is no OAuth handshake and no server to call — the phone reads HealthKit locally
   * and posts the workouts up. It also cannot work in Expo Go; it needs a development build
   * with the HealthKit entitlement. Listed so the app can say that plainly instead of
   * offering a "Connect" button that could never work.
   */
  apple_health: {
    kind: 'wearable',
    label: 'Apple Health',
    docs: 'https://developer.apple.com/documentation/healthkit',
    onDevice: true,
    reason: 'Apple Health is read on the device itself, so it needs a native build rather than a web sign-in. It cannot be connected from Expo Go.',
    canSync: false,
  },

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
  if (!p || p.onDevice) return false;
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
      onDevice: Boolean(p.onDevice),
      unavailableReason: p.onDevice
        ? p.reason
        : isConfigured(name)
          ? null
          : `${p.label} is not set up on this server yet — an administrator needs to add its API credentials.`,
      docs: p.docs,
    }));
}
