import crypto from 'node:crypto';
import { getProvider, redirectUri } from './oauthProviders.js';

/**
 * The OAuth 2.0 authorization-code exchange, shared by every provider.
 *
 * Providers differ in small, annoying ways — some want the client secret as HTTP Basic,
 * some in the form body; some require PKCE, some ignore it; expiry comes back as
 * `expires_in` seconds or sometimes `expires_at` epoch seconds. Those differences are
 * handled here so the controllers stay the same shape for all of them.
 */

const TIMEOUT_MS = 10000;

/**
 * PKCE: a random secret is kept server-side and only its hash goes out in the redirect,
 * so intercepting the redirect is not enough to trade the code for a token.
 */
export function createPkcePair() {
  const verifier = crypto.randomBytes(32).toString('base64url');
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
  return { verifier, challenge };
}

/** The URL the app opens so the user can approve access at the provider. */
export function buildAuthorizeUrl(providerName, { state, codeChallenge }) {
  const p = getProvider(providerName);
  const params = new URLSearchParams({
    client_id: p.clientId(),
    response_type: 'code',
    redirect_uri: redirectUri(providerName),
    scope: p.scope,
    state,
  });
  if (p.usesPkce && codeChallenge) {
    params.set('code_challenge', codeChallenge);
    params.set('code_challenge_method', 'S256');
  }
  return `${p.authorizeUrl}?${params.toString()}`;
}

async function postForm(url, { body, headers = {} }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json', ...headers },
      body: new URLSearchParams(body).toString(),
      signal: controller.signal,
    });
    const text = await response.text();
    let payload = null;
    try { payload = text ? JSON.parse(text) : null; } catch { payload = null; }
    return { ok: response.ok, status: response.status, payload, raw: text };
  } catch (err) {
    return { ok: false, status: 0, payload: null, raw: err.name === 'AbortError' ? 'timeout' : String(err.message) };
  } finally {
    clearTimeout(timer);
  }
}

function authHeaders(p) {
  if (p.tokenAuth !== 'basic') return {};
  const basic = Buffer.from(`${p.clientId()}:${p.clientSecret()}`).toString('base64');
  return { Authorization: `Basic ${basic}` };
}

// Providers report expiry as seconds-from-now, or occasionally as an absolute epoch.
function expiryFrom(payload) {
  if (typeof payload?.expires_in === 'number') return new Date(Date.now() + payload.expires_in * 1000);
  if (typeof payload?.expires_at === 'number') return new Date(payload.expires_at * 1000);
  return null;
}

/** Where the provider puts the account id varies; check the documented places. */
function providerUserIdFrom(payload) {
  return payload?.user_id ?? payload?.athlete?.id ?? payload?.open_id
    ?? payload?.data?.user_id ?? payload?.encodedId ?? null;
}

/** Trades the one-time code for tokens. Returns { ok, tokens } or { ok:false, error }. */
export async function exchangeCodeForTokens(providerName, { code, codeVerifier }) {
  const p = getProvider(providerName);
  const body = {
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri(providerName),
    client_id: p.clientId(),
  };
  if (p.tokenAuth !== 'basic') body.client_secret = p.clientSecret();
  if (p.usesPkce && codeVerifier) body.code_verifier = codeVerifier;

  const result = await postForm(p.tokenUrl, { body, headers: authHeaders(p) });

  if (!result.ok || !result.payload?.access_token) {
    // Providers describe failures inconsistently; surface whatever they gave us.
    const detail = result.payload?.error_description || result.payload?.error
      || result.payload?.message || result.raw?.slice(0, 200) || `HTTP ${result.status}`;
    return { ok: false, error: detail };
  }

  return {
    ok: true,
    tokens: {
      accessToken: result.payload.access_token,
      refreshToken: result.payload.refresh_token ?? null,
      expiresAt: expiryFrom(result.payload),
      scope: result.payload.scope ?? p.scope,
      providerUserId: providerUserIdFrom(result.payload),
    },
  };
}

/** Swaps a refresh token for a fresh access token. */
export async function refreshAccessToken(providerName, refreshToken) {
  const p = getProvider(providerName);
  const body = {
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: p.clientId(),
  };
  if (p.tokenAuth !== 'basic') body.client_secret = p.clientSecret();

  const result = await postForm(p.tokenUrl, { body, headers: authHeaders(p) });
  if (!result.ok || !result.payload?.access_token) {
    return { ok: false, error: result.payload?.error_description || result.payload?.error || `HTTP ${result.status}` };
  }
  return {
    ok: true,
    tokens: {
      accessToken: result.payload.access_token,
      refreshToken: result.payload.refresh_token ?? null,
      expiresAt: expiryFrom(result.payload),
    },
  };
}

/**
 * Tells the provider to forget us. Best-effort: if it fails we still drop our own record,
 * because leaving a row the user asked to remove is worse than a stale grant upstream.
 */
export async function revokeToken(providerName, accessToken) {
  const p = getProvider(providerName);
  if (!p?.revokeUrl) return { ok: true, skipped: true };
  const result = await postForm(p.revokeUrl, {
    body: { token: accessToken, client_id: p.clientId(), access_token: accessToken },
    headers: authHeaders(p),
  });
  return { ok: result.ok };
}

/**
 * Returns a usable access token, refreshing first if it is expired or nearly so.
 * `onRefresh` persists the new tokens.
 */
export async function validAccessToken(connection, onRefresh) {
  const soon = new Date(Date.now() + 60_000); // refresh a minute early rather than racing expiry
  const needsRefresh = connection.expiresAt && new Date(connection.expiresAt) <= soon;
  if (!needsRefresh) return { ok: true, accessToken: connection.accessToken };

  if (!connection.refreshToken) {
    return { ok: false, error: 'This connection has expired. Reconnect the account to continue.' };
  }

  const refreshed = await refreshAccessToken(connection.provider, connection.refreshToken);
  if (!refreshed.ok) {
    return { ok: false, error: `Could not refresh the connection: ${refreshed.error}` };
  }
  await onRefresh(refreshed.tokens);
  return { ok: true, accessToken: refreshed.tokens.accessToken };
}
