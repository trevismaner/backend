/**
 * Live weather for the risk assessment (RU-10).
 *
 * Uses Open-Meteo, which needs no API key and no account — that is the whole reason it was
 * chosen, since every other weather provider wants a registered key before it will answer.
 *   https://open-meteo.com/en/docs
 *
 * Before this existed, `weather_modifier` was a fixed allowance for "hot and humid", which
 * was honest but never actually looked outside. Now it reflects the conditions the runner
 * would meet, and falls back to that same allowance if the service cannot be reached —
 * a risk score should never fail because a third party is down.
 */

const ENDPOINT = process.env.WEATHER_API_URL || 'https://api.open-meteo.com/v1/forecast';
const TIMEOUT_MS = 4000;
const CACHE_TTL_MS = 30 * 60 * 1000;   // weather does not move fast; don't hammer a free service

// Used when the user has no GPS history to locate them by.
const DEFAULT_LAT = Number(process.env.DEFAULT_LATITUDE ?? 1.3521);
const DEFAULT_LNG = Number(process.env.DEFAULT_LONGITUDE ?? 103.8198);

// The value the scorer used before this integration; still the fallback.
export const STANDING_ALLOWANCE = { value: 4, note: 'Standing allowance for hot, humid conditions' };

// key -> { at, data }. Rounded coordinates, so nearby runners share an entry.
const cache = new Map();
const cacheKey = (lat, lng) => `${lat.toFixed(2)},${lng.toFixed(2)}`;

/**
 * Fetches current conditions. Returns null on any failure — callers fall back rather than
 * surfacing a third-party outage to the user.
 */
export async function fetchCurrentWeather(lat = DEFAULT_LAT, lng = DEFAULT_LNG) {
  const key = cacheKey(lat, lng);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.data;

  const url = `${ENDPOINT}?latitude=${lat.toFixed(4)}&longitude=${lng.toFixed(4)}`
    + '&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code';

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) return null;

    const body = await response.json();
    const c = body?.current;
    if (!c || typeof c.temperature_2m !== 'number') return null;

    const data = {
      temperatureC: c.temperature_2m,
      apparentTemperatureC: typeof c.apparent_temperature === 'number' ? c.apparent_temperature : c.temperature_2m,
      humidityPercent: c.relative_humidity_2m ?? null,
      precipitationMm: c.precipitation ?? 0,
      weatherCode: c.weather_code ?? null,
      observedAt: c.time ?? null,
    };
    cache.set(key, { at: Date.now(), data });
    return data;
  } catch {
    // timeout, DNS failure, offline, malformed JSON — all handled the same way
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// WMO codes that mean conditions underfoot are poor. https://open-meteo.com/en/docs
const THUNDERSTORM = [95, 96, 99];
const HEAVY_RAIN = [65, 67, 82];
const ICE_OR_SNOW = [71, 73, 75, 77, 85, 86, 66, 67, 56, 57];

/**
 * Turns conditions into the weather_modifier the schema stores.
 * Apparent temperature ("feels like") is used rather than the raw reading, because it
 * already folds in humidity — which is what actually makes running hard here.
 */
export function weatherModifierFrom(weather) {
  if (!weather) return STANDING_ALLOWANCE;

  const feels = weather.apparentTemperatureC;
  const humidity = weather.humidityPercent;
  const notes = [];
  let value = 0;

  if (feels >= 40) { value += 14; notes.push(`feels like ${Math.round(feels)}°C`); }
  else if (feels >= 35) { value += 9; notes.push(`feels like ${Math.round(feels)}°C`); }
  else if (feels >= 30) { value += 5; notes.push(`feels like ${Math.round(feels)}°C`); }
  else if (feels <= 0) { value += 4; notes.push(`feels like ${Math.round(feels)}°C — icy underfoot`); }
  else notes.push(`feels like ${Math.round(feels)}°C`);

  if (humidity != null && humidity >= 85 && feels >= 25) { value += 3; notes.push(`${humidity}% humidity`); }

  if (THUNDERSTORM.includes(weather.weatherCode)) { value += 8; notes.push('thunderstorms'); }
  else if (ICE_OR_SNOW.includes(weather.weatherCode)) { value += 6; notes.push('ice or snow'); }
  else if (HEAVY_RAIN.includes(weather.weatherCode)) { value += 4; notes.push('heavy rain'); }
  else if (weather.precipitationMm > 0) { value += 2; notes.push('rain'); }

  return { value: Number(value.toFixed(2)), note: notes.join(' · '), live: true };
}

/** Convenience for the scorer: look up and convert in one call. */
export async function getWeatherModifier(lat, lng) {
  const weather = await fetchCurrentWeather(lat, lng);
  return weatherModifierFrom(weather);
}

// Exposed so tests can start from a clean slate.
export function __clearCache() {
  cache.clear();
}
