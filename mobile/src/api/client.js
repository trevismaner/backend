import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Where the backend lives.
 *
 * Expo inlines EXPO_PUBLIC_* at build time, so a release build carries whatever was set when
 * it was built — which is why there is no hardcoded fallback any more. There used to be one
 * pointing at a developer's home network (192.168.x.x), and a release build that picked it up
 * looked completely broken on every other network: every screen empty, every sign-in failing,
 * with nothing on screen to say why.
 *
 * Unset in development, it falls back to localhost, which works for an iOS simulator and
 * tells you plainly what is wrong anywhere else. Unset in a release build, it throws at
 * startup, because shipping an app that cannot reach its own API is not a thing to discover
 * from a store review.
 */
function resolveBaseUrl() {
  const configured = process.env.EXPO_PUBLIC_API_URL?.trim();
  if (configured) return configured.replace(/\/+$/, '');

  // __DEV__ is injected by Metro, so it does not exist when these files are loaded under
  // plain Node by the test harness. Treat its absence as development.
  const isDev = typeof __DEV__ === 'undefined' || __DEV__;

  if (isDev) {
    console.warn(
      'EXPO_PUBLIC_API_URL is not set — falling back to http://localhost:3000/api. ' +
        'On a physical device set it to your computer\'s IP, e.g. http://192.168.1.42:3000/api'
    );
    return 'http://localhost:3000/api';
  }

  throw new Error(
    'EXPO_PUBLIC_API_URL was not set when this app was built. A release build has no ' +
      'default backend address. Set it in eas.json for the build profile and rebuild.'
  );
}

export const BASE_URL = resolveBaseUrl();

const TIMEOUT_MS = 15000;

let onUnauthorised = null;
export function setUnauthorisedHandler(fn) {
  onUnauthorised = fn;
}

function messageForStatus(status) {
  if (status === 401) return 'Your session has expired. Please sign in again.';
  if (status === 403) return 'You do not have permission to do that.';
  if (status === 404) return 'That could not be found.';
  if (status === 409) return 'That conflicts with something that already exists.';
  if (status >= 500) return 'The server is having trouble right now. Try again in a moment.';
  return 'Request failed';
}

async function readBody(response) {
  if (response.status === 204) return null;
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null; // an HTML error page, or a truncated response
  }
}

async function request(path, { method = 'GET', body, auth = true } = {}) {
  const headers = { 'Content-Type': 'application/json' };

  if (auth) {
    const token = await AsyncStorage.getItem('token');
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let response;
  try {
    response = await fetch(`${BASE_URL}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error('The server took too long to respond. Check your connection and try again.');
    }
    throw new Error('Could not reach the server. Check your connection, and that the backend is running.');
  } finally {
    clearTimeout(timer);
  }

  const data = await readBody(response);

  if (!response.ok) {
    if (response.status === 401) {
      await AsyncStorage.removeItem('token');
      if (onUnauthorised) onUnauthorised();
      throw new Error(messageForStatus(401));
    }
    throw new Error(data?.error || messageForStatus(response.status));
  }

  return data;
}

export default request;
