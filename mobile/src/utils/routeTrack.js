import { distanceBetween } from './geo.js';

/**
 * Cleaning and measuring a recorded GPS route.
 *
 * WHY THIS EXISTS
 * The route used to be built by pushing every fix straight onto an array and adding each
 * segment onto a running distance total. Three things went wrong with that, and together
 * they are why a backgrounded run drew a line that went back and forth:
 *
 *   1. NOTHING LOOKED AT ACCURACY. A fix carries an `accuracy` radius in metres, and when
 *      the phone is in a pocket, indoors, or has just woken the GPS, the OS happily reports
 *      positions with a 100–2000 m radius from wifi or cell towers. Those are not positions,
 *      they are neighbourhoods, and drawing a line to one and back is exactly the zig-zag.
 *
 *   2. THE SAME STRETCH WAS RECORDED TWICE. `watchPositionAsync` (foreground) and the
 *      background task both run for the whole run — the background task is started when the
 *      run starts, not when the app leaves the screen. The watcher pushed its fixes straight
 *      onto the route; the task buffered its own copies; and every 20 s the checkpoint
 *      drained that buffer and APPENDED it to the end. So the line ran forward with the
 *      watcher, then jumped back to where the runner had been 20 s earlier and ran forward
 *      again. A sawtooth, repeating every checkpoint, with the distance roughly doubling.
 *
 *   3. DISTANCE WAS ACCUMULATED, NOT MEASURED. Because each segment was added to a running
 *      total as it arrived, one bad fix inflated the distance permanently — there was no
 *      later point at which a wrong number could be corrected.
 *
 * HOW THIS FIXES IT
 * The route is treated as a set of observations to be merged, not a stream to be appended
 * to. `mergePoints` sorts by time, drops duplicates and implausible fixes, and returns a
 * fresh array; `routeDistanceKm` measures that array from scratch. Both are pure, so the
 * result does not depend on the order fixes arrived in, on how many times the same fix was
 * delivered, or on which source delivered it. Feed the watcher's fixes and the background
 * task's buffer into the same function and the duplicates collapse on their own.
 *
 * WHAT IT DOES NOT FIX
 * GPS drift while genuinely stationary is not solved here and cannot really be solved from
 * the fix stream alone: standing still produces a slow random walk of small, well-accuracy
 * fixes, and no threshold separates that from walking very slowly. The accuracy gate and
 * the per-segment noise floor below reduce it; they do not remove it. Treat a distance from
 * a run that included long stops as approximate, which is also why the run details screen
 * lets the figure be corrected by hand.
 */

/**
 * Worse than this and the fix is discarded.
 *
 * 50 m is chosen to be forgiving: a good phone outdoors reports 3–10 m, a phone that has
 * just woken reports 20–40 m before it settles, and the wifi/cell fallbacks that cause the
 * zig-zag report 100 m and up. Tightening this further starts throwing away the first
 * genuine fixes of a run, which is worse than a slightly loose line.
 */
export const MAX_ACCURACY_M = 50;

/**
 * Faster than this between two fixes and the later one is discarded as a teleport.
 *
 * 25 m/s is 90 km/h. That is deliberately far above anything this app records — the app
 * tracks runs and rides, and a fast descent on a bike is around 60 km/h — because the point
 * is not to police the athlete, it is to catch GPS failures, which are not marginal: a bad
 * fix is typically hundreds of metres away within a couple of seconds, which works out at
 * hundreds of m/s. A gate set near real athletic speeds would reject real data on a fast
 * descent and still catch nothing a loose gate misses.
 */
export const MAX_SPEED_MPS = 25;

/**
 * Two fixes closer together in time and space than this are the same observation.
 *
 * Kept deliberately tight. An earlier draft used 1.5 s and 3 m, which quietly deleted real
 * movement: a runner at 7 km/h covers about 3 m in 1.5 s, so every single fix of a
 * steady-paced run matched the rule and was dropped. These values only collapse fixes that
 * are genuinely the same moment — the duplicate delivery of case 2 above.
 */
export const DUPLICATE_WINDOW_MS = 250;
export const DUPLICATE_DISTANCE_M = 1;

/**
 * Segments shorter than this add no distance.
 *
 * Each fix has its own error, so the gap between two consecutive fixes taken while barely
 * moving is mostly noise rather than travel. Summing it anyway is how a run that waited at
 * traffic lights came back half a kilometre long. 4 m is just above the error of a good
 * outdoor fix, so real movement is not shaved off at running speed, where fixes three
 * seconds apart are 5–10 m apart.
 */
export const NOISE_FLOOR_M = 4;

/**
 * Below this reported speed, both ends of a segment are considered not to be moving.
 *
 * The distance floor above is a blunt instrument against drift: standing at traffic lights
 * produces a slow random walk of well-accuracy fixes whose steps sit just above any floor
 * low enough to keep slow walking. Measured on a simulated four-minute stop with +/-3 m
 * jitter, the floor alone brought 351 m of invented distance down to 273 m — better, not
 * fixed.
 *
 * The fix stream has a much better signal for this: `coords.speed`, which the OS derives
 * from the doppler shift rather than from differencing positions, so it reads near zero
 * while stationary even as the reported position wanders. 0.5 m/s is below a slow walk
 * (about 1.4 m/s), so real walking still counts.
 *
 * Only applied when BOTH ends actually report a speed. It is -1 or absent on hand-entered
 * runs, on imported wearable data, and on some Android devices, and a missing field must
 * never be read as "not moving" — that would silently zero a real run's distance.
 */
export const STATIONARY_SPEED_MPS = 0.5;

const EARTH_METRES_PER_KM = 1000;

/** True for something that could be a position. */
function isUsableShape(point) {
  return (
    point &&
    Number.isFinite(point.latitude) &&
    Number.isFinite(point.longitude) &&
    Math.abs(point.latitude) <= 90 &&
    Math.abs(point.longitude) <= 180
  );
}

/**
 * Normalises one fix into the stored point shape.
 *
 * `accuracy` is kept because filtering without it is guesswork, and it was the field whose
 * absence caused the original bug. It is optional on purpose: points that come from a
 * wearable import or a hand-entered run have no accuracy, and those must not be thrown away
 * for lacking a field GPS alone provides.
 */
export function toPoint(raw) {
  if (!raw) return null;
  const coords = raw.coords ?? raw;
  if (!isUsableShape(coords)) return null;

  const point = {
    latitude: coords.latitude,
    longitude: coords.longitude,
    timestamp: Number.isFinite(raw.timestamp)
      ? raw.timestamp
      : Number.isFinite(coords.timestamp)
        ? coords.timestamp
        : Date.now(),
  };

  if (Number.isFinite(coords.accuracy)) point.accuracy = coords.accuracy;
  // Negative means "no reading" in the platform APIs, so it is dropped rather than stored as
  // a number that later looks like a very slow speed.
  if (Number.isFinite(coords.speed) && coords.speed >= 0) point.speed = coords.speed;
  return point;
}

/** True only when both ends report a speed and both are below walking pace. */
function bothStationary(a, b, stationarySpeedMps) {
  return (
    Number.isFinite(a.speed) &&
    Number.isFinite(b.speed) &&
    a.speed < stationarySpeedMps &&
    b.speed < stationarySpeedMps
  );
}

/** Whether a fix is precise enough to be part of a route. Missing accuracy is allowed. */
export function isAccurateEnough(point, { maxAccuracyM = MAX_ACCURACY_M } = {}) {
  if (!isUsableShape(point)) return false;
  if (!Number.isFinite(point.accuracy)) return true;
  // A non-positive radius is not a real reading.
  if (point.accuracy <= 0) return true;
  return point.accuracy <= maxAccuracyM;
}

/** Metres between two points. */
export function metresBetween(a, b) {
  return distanceBetween(a, b) * EARTH_METRES_PER_KM;
}

/**
 * Merges new fixes into a route and returns a cleaned copy.
 *
 * Pure, and the whole reason the double-recording bug cannot come back: the output depends
 * only on the SET of observations, not on the order they arrived or how often. Calling it
 * twice with the same fixes gives the same route.
 *
 * Order of operations matters. Accuracy first, because a bad fix must not become the anchor
 * that the speed gate then measures the next good fix against. Sorting second, because the
 * two sources interleave in time. Duplicates third. The speed gate last, walking forward
 * from the last ACCEPTED point so that one teleport cannot drag the rest of the route out
 * with it.
 */
export function mergePoints(existing, incoming, options = {}) {
  const {
    maxAccuracyM = MAX_ACCURACY_M,
    maxSpeedMps = MAX_SPEED_MPS,
    duplicateWindowMs = DUPLICATE_WINDOW_MS,
    duplicateDistanceM = DUPLICATE_DISTANCE_M,
  } = options;

  const candidates = [...(Array.isArray(existing) ? existing : []), ...(Array.isArray(incoming) ? incoming : [])]
    .map(toPoint)
    .filter((point) => point && isAccurateEnough(point, { maxAccuracyM }));

  // Stable by timestamp, then by accuracy so that when two fixes share a moment the more
  // precise one is the one the duplicate rule keeps.
  candidates.sort((a, b) => {
    if (a.timestamp !== b.timestamp) return a.timestamp - b.timestamp;
    const accA = Number.isFinite(a.accuracy) ? a.accuracy : Number.POSITIVE_INFINITY;
    const accB = Number.isFinite(b.accuracy) ? b.accuracy : Number.POSITIVE_INFINITY;
    return accA - accB;
  });

  const kept = [];
  for (const point of candidates) {
    const last = kept[kept.length - 1];
    if (!last) {
      kept.push(point);
      continue;
    }

    const gapMs = point.timestamp - last.timestamp;
    const gapM = metresBetween(last, point);

    // The same observation, delivered twice or by both sources.
    if (gapMs <= duplicateWindowMs && gapM <= duplicateDistanceM) continue;

    // A teleport. Judged only when there is a time gap to judge it by: two fixes sharing a
    // timestamp give an infinite speed and would always be rejected, which would throw away
    // the second source's genuinely different reading rather than the duplicate.
    if (gapMs > 0) {
      const speedMps = gapM / (gapMs / 1000);
      if (speedMps > maxSpeedMps) continue;
    }

    kept.push(point);
  }

  return kept;
}

/**
 * Measures a cleaned route, in kilometres.
 *
 * Measured, not accumulated: call it on the whole route every time rather than adding each
 * new segment to a stored total. That is what makes a wrong distance self-correcting once a
 * bad fix is filtered out, instead of permanently baked in.
 */
export function routeDistanceKm(
  points,
  { noiseFloorM = NOISE_FLOOR_M, stationarySpeedMps = STATIONARY_SPEED_MPS } = {}
) {
  if (!Array.isArray(points) || points.length < 2) return 0;

  let metres = 0;
  for (let i = 1; i < points.length; i += 1) {
    const from = points[i - 1];
    const to = points[i];

    // Both ends report standing still, so the gap between them is drift, however large it
    // looks. This is the only rule that can discard a segment above the noise floor, and it
    // needs real speed readings at both ends to fire.
    if (bothStationary(from, to, stationarySpeedMps)) continue;

    const segment = metresBetween(from, to);
    // Below the floor the gap is mostly the error of the two fixes, not travel.
    if (segment >= noiseFloorM) metres += segment;
  }
  return metres / EARTH_METRES_PER_KM;
}

/**
 * The trailing stretch of the run that "current pace" is measured over.
 *
 * Instantaneous pace — the gap between the last two fixes — is unusable. At a 5:30/km pace
 * fixes three seconds apart are about 9 m apart, so the 4-5 m error of a good outdoor fix
 * swings the reading by well over a minute per kilometre, and the number flickers too fast
 * to read. Averaging over a window trades a little responsiveness for a figure that holds
 * still: 45 s covers roughly 135 m at that pace, where the same error is about 4%.
 */
export const PACE_WINDOW_MS = 45000;

/**
 * Below this much ground covered in the window, no pace is reported.
 *
 * Standing still does not produce a very slow pace, it produces a meaningless one: what
 * distance survives filtering is drift, and dividing the window by it gives a number that
 * depends on nothing. The screen shows a dash instead, which is the honest answer.
 */
export const PACE_MIN_WINDOW_M = 30;

/**
 * With no fix for this long, the current pace is unknown rather than unchanged.
 *
 * Without this, a run that loses signal under a bridge keeps the last pace on screen
 * indefinitely, because the window is measured against the newest fix and that fix stops
 * moving. Showing a stale pace as the current one is worse than showing none.
 */
export const PACE_STALE_AFTER_MS = 20000;

/**
 * How fast the runner is going now, in seconds per kilometre, or null if it cannot be said.
 *
 * Measured over the trailing window with `routeDistanceKm`, so it applies exactly the same
 * noise floor and stationary filtering as the distance shown beside it. A different rule
 * here would let the pace disagree with the distance it is derived from.
 *
 * `now` is a parameter rather than a Date.now() call inside, so the staleness rule can be
 * tested without waiting for it.
 */
export function rollingPaceSecondsPerKm(
  points,
  {
    windowMs = PACE_WINDOW_MS,
    minWindowM = PACE_MIN_WINDOW_M,
    staleAfterMs = PACE_STALE_AFTER_MS,
    now = Date.now(),
    ...distanceOptions
  } = {}
) {
  if (!Array.isArray(points) || points.length < 2) return null;

  const newest = points[points.length - 1];
  if (!Number.isFinite(newest?.timestamp)) return null;
  if (now - newest.timestamp > staleAfterMs) return null;

  // Back to the first fix still inside the window. mergePoints keeps the route sorted by
  // timestamp, so this walks only the window rather than scanning the whole run.
  const cutoff = newest.timestamp - windowMs;
  let first = points.length - 1;
  while (first > 0 && Number.isFinite(points[first - 1].timestamp) && points[first - 1].timestamp >= cutoff) {
    first -= 1;
  }

  const window = points.slice(first);
  if (window.length < 2) return null;

  const seconds = (newest.timestamp - window[0].timestamp) / 1000;
  const metres = routeDistanceKm(window, distanceOptions) * EARTH_METRES_PER_KM;
  if (seconds <= 0 || metres < minWindowM) return null;

  return (seconds / metres) * EARTH_METRES_PER_KM;
}

/**
 * How much of a route was thrown away, for telling the runner something useful.
 *
 * A run recorded with the phone indoors can lose most of its fixes, and silently showing a
 * short distance is worse than saying the signal was poor.
 */
export function mergeReport(existing, incoming, options = {}) {
  const submitted = [...(Array.isArray(existing) ? existing : []), ...(Array.isArray(incoming) ? incoming : [])];
  const points = mergePoints(existing, incoming, options);
  return {
    points,
    distanceKm: routeDistanceKm(points, options),
    submitted: submitted.length,
    kept: points.length,
    discarded: Math.max(0, submitted.length - points.length),
  };
}

/**
 * The map region that contains a whole route, with a margin.
 *
 * The run details screen used to centre on the FIRST point with a fixed 0.01° span — about
 * 1.1 km — and then disable panning and zooming. Any run longer than that showed its start
 * and a line leaving the frame, with no way to follow it, which is why a finished run looked
 * like it had only recorded one point.
 *
 * Returned as a plain region rather than relying on `fitToCoordinates` alone, so the map is
 * framed correctly on first paint instead of jumping after the native call lands — and so
 * this is testable without a device.
 */
export function regionForCoordinates(points, { paddingRatio = 0.25, minDelta = 0.002 } = {}) {
  const usable = (Array.isArray(points) ? points : []).filter(isUsableShape);
  if (usable.length === 0) return null;

  let minLat = usable[0].latitude;
  let maxLat = usable[0].latitude;
  let minLon = usable[0].longitude;
  let maxLon = usable[0].longitude;

  for (const point of usable) {
    if (point.latitude < minLat) minLat = point.latitude;
    if (point.latitude > maxLat) maxLat = point.latitude;
    if (point.longitude < minLon) minLon = point.longitude;
    if (point.longitude > maxLon) maxLon = point.longitude;
  }

  const latSpan = maxLat - minLat;
  const lonSpan = maxLon - minLon;

  return {
    latitude: (minLat + maxLat) / 2,
    longitude: (minLon + maxLon) / 2,
    // The margin keeps the line off the edge of the frame. `minDelta` stops a very short
    // run, or a single point, from being zoomed in to street-furniture level.
    latitudeDelta: Math.max(latSpan * (1 + paddingRatio), minDelta),
    longitudeDelta: Math.max(lonSpan * (1 + paddingRatio), minDelta),
  };
}
