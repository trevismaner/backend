export function distanceBetween(pointA, pointB) {
  const R = 6371;
  const dLat = toRad(pointB.latitude - pointA.latitude);
  const dLon = toRad(pointB.longitude - pointA.longitude);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(pointA.latitude)) *
      Math.cos(toRad(pointB.latitude)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function toRad(value) {
  return (value * Math.PI) / 180;
}

/**
 * The most GPS points one run may carry. Matches MAX_ROUTE_POINTS in the backend's
 * control/RunValidation.js — the server refuses more, so the app must not send more.
 */
export const MAX_ROUTE_POINTS = 5000;

/**
 * Drops GPS points that are too close together to draw.
 *
 * Location updates arrive every few seconds whether or not the runner has moved, so a long
 * run accumulates far more points than the route needs — enough that the request body used
 * to exceed the server's limit and the run could not be saved at all. Keeping one point per
 * ~10 m leaves the drawn line indistinguishable while cutting the payload several-fold.
 *
 * The first and last points are always kept, so the route still starts and ends where the
 * run did. If thinning is not enough on its own (a very long run), what is left is thinned
 * further until it fits maxPoints.
 */
export function thinRoute(points, { minMetres = 10, maxPoints = MAX_ROUTE_POINTS } = {}) {
  if (!Array.isArray(points)) return [];
  if (points.length <= 2) return [...points];

  const minKm = minMetres / 1000;
  const kept = [points[0]];
  for (let i = 1; i < points.length - 1; i += 1) {
    if (distanceBetween(kept[kept.length - 1], points[i]) >= minKm) kept.push(points[i]);
  }
  kept.push(points[points.length - 1]);

  if (kept.length <= maxPoints) return kept;

  // Still too many: keep every nth point, and make sure the finish is among them.
  const step = Math.ceil(kept.length / maxPoints);
  const reduced = kept.filter((_, i) => i % step === 0);
  const last = kept[kept.length - 1];
  if (reduced[reduced.length - 1] !== last) reduced.push(last);
  return reduced.slice(0, maxPoints);
}

export function formatDuration(totalSeconds) {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const pad = (n) => String(n).padStart(2, '0');
  return hours > 0 ? `${pad(hours)}:${pad(minutes)}:${pad(seconds)}` : `${pad(minutes)}:${pad(seconds)}`;
}
