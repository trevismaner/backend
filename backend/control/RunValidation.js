/**
 * Shared validation for everything that writes or reads a run.
 *
 * It lives in control/ because these are business rules, not HTTP concerns: a run cannot
 * finish before it started, a human cannot cover 5 km in 10 seconds, and a GPS point has to
 * be somewhere on Earth. The boundary turns the returned message into a status code.
 *
 * Every function returns either `{ error }` with a message fit to show the user, or
 * `{ value }` with the cleaned-up input. Nothing throws.
 */

// A GPS route is capped so one run cannot grow without bound. The app records a point about
// every 10 m, so 5 000 points covers a 50 km run — well past a marathon.
export const MAX_ROUTE_POINTS = 5000;

// The men's 100 m world record is roughly 37 km/h. 45 km/h leaves room for GPS noise while
// still refusing figures that cannot be a run (a mis-entered duration, or a drive).
const MAX_SPEED_KMH = 45;

const MAX_DURATION_SECONDS = 86400;   // 24 hours
const MAX_DISTANCE_KM = 1000;
const MAX_NAME_LENGTH = 100;          // runs.name is VARCHAR(100)
const MAX_DESCRIPTION_LENGTH = 5000;
const EARLIEST_START = new Date('2000-01-01T00:00:00Z').getTime();
const FUTURE_SLACK_MS = 5 * 60 * 1000; // tolerate a phone clock a few minutes fast

const isBlank = (v) => v === undefined || v === null || (typeof v === 'string' && v.trim() === '');

/** Parses an id from the URL. Returns null for anything that is not a positive integer. */
export function parseId(raw) {
  if (typeof raw !== 'string' && typeof raw !== 'number') return null;
  const text = String(raw).trim();
  if (!/^[0-9]+$/.test(text)) return null;
  const id = Number(text);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

/**
 * Reads ?limit and ?offset. Rejects anything non-numeric or negative rather than letting it
 * reach PostgreSQL, which errors on a negative LIMIT.
 */
export function parsePaging(query, { defaultLimit = 20, maxLimit = 200 } = {}) {
  const read = (raw, name, fallback) => {
    if (isBlank(raw)) return { value: fallback };
    const text = String(raw).trim();
    if (!/^[0-9]+$/.test(text)) return { error: `${name} must be a whole number of 0 or more` };
    return { value: Number(text) };
  };

  const limit = read(query.limit, 'limit', defaultLimit);
  if (limit.error) return limit;
  const offset = read(query.offset, 'offset', 0);
  if (offset.error) return offset;

  if (limit.value < 1) return { error: 'limit must be at least 1' };
  if (limit.value > maxLimit) return { error: `limit cannot be more than ${maxLimit}` };

  return { value: { limit: limit.value, offset: offset.value } };
}

/**
 * Checks a GPS route and normalises it to the {latitude, longitude, timestamp} shape the app
 * draws. `lat`/`lng` are accepted too, since that is how schema.sql describes the column.
 */
export function validateRouteGps(raw) {
  if (raw === undefined || raw === null) return { value: [] };
  if (!Array.isArray(raw)) return { error: 'routeGps must be an array of GPS points' };
  if (raw.length > MAX_ROUTE_POINTS) {
    return { error: `routeGps cannot hold more than ${MAX_ROUTE_POINTS} points (received ${raw.length})` };
  }

  const points = [];
  for (let i = 0; i < raw.length; i += 1) {
    const point = raw[i];
    if (point === null || typeof point !== 'object' || Array.isArray(point)) {
      return { error: `routeGps[${i}] must be an object with latitude and longitude` };
    }

    const latitude = Number(point.latitude ?? point.lat);
    const longitude = Number(point.longitude ?? point.lng);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      return { error: `routeGps[${i}] is missing a numeric latitude and longitude` };
    }
    if (latitude < -90 || latitude > 90) return { error: `routeGps[${i}].latitude must be between -90 and 90` };
    if (longitude < -180 || longitude > 180) return { error: `routeGps[${i}].longitude must be between -180 and 180` };

    const cleaned = { latitude, longitude };
    const timestamp = Number(point.timestamp);
    if (Number.isFinite(timestamp)) cleaned.timestamp = timestamp;
    points.push(cleaned);
  }

  return { value: points };
}

/** An optional whole number within a range. Blank means "not provided", which is allowed. */
function optionalInteger(raw, name, min, max) {
  if (isBlank(raw)) return { value: null };
  const n = Number(raw);
  if (!Number.isFinite(n) || !Number.isInteger(n)) return { error: `${name} must be a whole number` };
  if (n < min || n > max) return { error: `${name} must be between ${min} and ${max}` };
  return { value: n };
}

function optionalText(raw, name, maxLength) {
  if (isBlank(raw)) return { value: null };
  if (typeof raw !== 'string') return { error: `${name} must be text` };
  const text = raw.trim();
  if (text.length > maxLength) return { error: `${name} cannot be longer than ${maxLength} characters` };
  return { value: text };
}

/**
 * Validates a whole run. `partial: true` skips the required-field check, for a PATCH where
 * the caller has already merged the changes onto the stored run.
 */
export function validateRun(input, { partial = false } = {}) {
  const out = {};

  // ---- distance ----
  if (!partial && (input.distanceKm === undefined || input.distanceKm === null)) {
    return { error: 'distanceKm, durationSeconds, and startedAt are required' };
  }
  const distanceKm = Number(input.distanceKm);
  if (!Number.isFinite(distanceKm)) return { error: 'distanceKm must be a number' };
  if (distanceKm < 0) return { error: 'distanceKm cannot be negative' };
  if (distanceKm > MAX_DISTANCE_KM) return { error: `distanceKm cannot be more than ${MAX_DISTANCE_KM}` };
  out.distanceKm = Math.round(distanceKm * 100) / 100; // the column is NUMERIC(6,2)

  // ---- duration ----
  if (!partial && isBlank(input.durationSeconds)) {
    return { error: 'distanceKm, durationSeconds, and startedAt are required' };
  }
  const durationSeconds = Number(input.durationSeconds);
  if (!Number.isInteger(durationSeconds)) return { error: 'durationSeconds must be a whole number' };
  if (durationSeconds <= 0) return { error: 'durationSeconds must be a positive whole number' };
  if (durationSeconds > MAX_DURATION_SECONDS) {
    return { error: 'durationSeconds cannot be more than 24 hours' };
  }
  out.durationSeconds = durationSeconds;

  // ---- the two together have to be physically possible ----
  const speedKmh = out.distanceKm / (durationSeconds / 3600);
  if (out.distanceKm > 0 && speedKmh > MAX_SPEED_KMH) {
    return { error: `that pace is not possible on foot (${speedKmh.toFixed(1)} km/h) — check the distance and duration` };
  }

  // ---- when ----
  if (!partial && isBlank(input.startedAt)) {
    return { error: 'distanceKm, durationSeconds, and startedAt are required' };
  }
  const startedAt = new Date(input.startedAt);
  if (Number.isNaN(startedAt.getTime())) return { error: 'startedAt must be a valid date' };
  if (startedAt.getTime() > Date.now() + FUTURE_SLACK_MS) return { error: 'startedAt cannot be in the future' };
  if (startedAt.getTime() < EARLIEST_START) return { error: 'startedAt is implausibly far in the past' };
  out.startedAt = startedAt.toISOString();

  if (isBlank(input.endedAt)) {
    out.endedAt = null;
  } else {
    const endedAt = new Date(input.endedAt);
    if (Number.isNaN(endedAt.getTime())) return { error: 'endedAt must be a valid date' };
    if (endedAt.getTime() < startedAt.getTime()) return { error: 'endedAt cannot be before startedAt' };
    if (endedAt.getTime() > Date.now() + FUTURE_SLACK_MS) return { error: 'endedAt cannot be in the future' };
    out.endedAt = endedAt.toISOString();
  }

  // ---- optional detail ----
  for (const [field, name, min, max] of [
    ['caloriesBurned', 'caloriesBurned', 0, 30000],
    ['avgHeartRate', 'avgHeartRate', 20, 260],
    ['maxHeartRate', 'maxHeartRate', 20, 260],
  ]) {
    const checked = optionalInteger(input[field], name, min, max);
    if (checked.error) return checked;
    out[field] = checked.value;
  }
  if (out.avgHeartRate !== null && out.maxHeartRate !== null && out.maxHeartRate < out.avgHeartRate) {
    return { error: 'maxHeartRate cannot be lower than avgHeartRate' };
  }

  const name = optionalText(input.name, 'name', MAX_NAME_LENGTH);
  if (name.error) return name;
  out.name = name.value;

  const description = optionalText(input.description, 'description', MAX_DESCRIPTION_LENGTH);
  if (description.error) return description;
  out.description = description.value;

  const route = validateRouteGps(input.routeGps);
  if (route.error) return route;
  out.routeGps = route.value;

  // An idempotency key, so a double-tapped Save cannot store the run twice.
  const clientRunId = optionalText(input.clientRunId, 'clientRunId', 64);
  if (clientRunId.error) return clientRunId;
  out.clientRunId = clientRunId.value;

  return { value: out };
}
