/**
 * Turning a recorded route into something that can be drawn on a share card.
 *
 * The share used to be one line of text — `I just ran 5.2km on Run League! 🏃` — with no
 * route, no time, no pace and no date. This projects the route's latitude/longitude into a
 * flat box of pixels so it can be drawn as an SVG path on the card.
 *
 * WHY THE PROJECTION IS NOT JUST A LINEAR SCALE
 * A degree of latitude is about 111 km everywhere, but a degree of longitude shrinks towards
 * the poles — at Wollongong's latitude it is about 92 km. Scaling both axes by the same
 * number of degrees therefore stretches the route east-west: a square lap is drawn as a
 * rectangle, and a figure-of-eight leans. Multiplying the longitude span by cos(latitude)
 * corrects it, which matters because a wrong-shaped route is immediately obvious to the
 * person who ran it, even if they could not say why it looks off.
 *
 * Everything here is pure, so the card's geometry can be tested without a phone, a map key
 * or a screenshot.
 */

const DEG_TO_RAD = Math.PI / 180;

function isUsable(point) {
  return (
    point &&
    Number.isFinite(point.latitude) &&
    Number.isFinite(point.longitude) &&
    Math.abs(point.latitude) <= 90 &&
    Math.abs(point.longitude) <= 180
  );
}

/**
 * Projects a route into a width x height box, preserving its shape.
 *
 * Returns `{ points, width, height }` where `points` are `{ x, y }` in pixels, y already
 * flipped so that north is up — screen coordinates grow downwards and latitude grows
 * upwards, and getting that wrong draws the route upside down.
 *
 * A route that is a single point, or all on one line, still works: the span collapses to
 * zero on one axis and the route is centred on it rather than dividing by zero.
 */
export function projectRoute(points, options = {}) {
  const {
    width = 320,
    height = 200,
    padding = 16,
    // Per-side, because the share card puts the run's name and date across the top of the
    // map area. With one uniform padding the route ran straight under that text and the
    // start/finish dots sat on the title, while the bottom of the frame stayed empty.
    paddingTop = padding,
    paddingRight = padding,
    paddingBottom = padding,
    paddingLeft = padding,
  } = options;

  const usable = (Array.isArray(points) ? points : []).filter(isUsable);
  if (usable.length === 0) return { points: [], width, height };

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

  const midLat = (minLat + maxLat) / 2;
  // The east-west correction. cos() of the mid-latitude is the standard small-area
  // approximation and is accurate to well under a pixel over the few kilometres a run covers.
  const lonScale = Math.max(Math.cos(midLat * DEG_TO_RAD), 0.01);

  const latSpan = maxLat - minLat;
  const lonSpan = (maxLon - minLon) * lonScale;

  const boxWidth = Math.max(width - paddingLeft - paddingRight, 1);
  const boxHeight = Math.max(height - paddingTop - paddingBottom, 1);

  // One scale for both axes, chosen by whichever axis is the tighter fit, so the route keeps
  // its proportions instead of being stretched to fill the box.
  const scale =
    latSpan === 0 && lonSpan === 0
      ? 1
      : Math.min(
          lonSpan === 0 ? Number.POSITIVE_INFINITY : boxWidth / lonSpan,
          latSpan === 0 ? Number.POSITIVE_INFINITY : boxHeight / latSpan
        );
  const usableScale = Number.isFinite(scale) ? scale : 1;

  const drawnWidth = lonSpan * usableScale;
  const drawnHeight = latSpan * usableScale;
  // Centre whatever is left over, so a long thin route sits in the middle of the card rather
  // than hugging a corner.
  const offsetX = paddingLeft + (boxWidth - drawnWidth) / 2;
  const offsetY = paddingTop + (boxHeight - drawnHeight) / 2;

  const projected = usable.map((point) => ({
    x: offsetX + (point.longitude - minLon) * lonScale * usableScale,
    // Flipped: north up.
    y: offsetY + (maxLat - point.latitude) * usableScale,
  }));

  return { points: projected, width, height };
}

/** An SVG `d` attribute for a projected route. */
export function toSvgPath(projectedPoints, { decimals = 2 } = {}) {
  if (!Array.isArray(projectedPoints) || projectedPoints.length === 0) return '';
  const round = (n) => Number(n.toFixed(decimals));
  return projectedPoints
    .map((point, index) => `${index === 0 ? 'M' : 'L'}${round(point.x)} ${round(point.y)}`)
    .join(' ');
}

/**
 * mm:ss from a seconds-per-kilometre figure. Returns null when there is nothing to show.
 *
 * Split out of paceLabel so the live run screen, which already holds a pace in seconds per
 * km from its rolling window, formats it the same way a saved run's caption does instead of
 * carrying a second copy of this arithmetic.
 */
export function formatPace(secondsPerKm) {
  if (!Number.isFinite(secondsPerKm) || secondsPerKm <= 0) return null;
  const perKm = Math.round(secondsPerKm);
  const minutes = Math.floor(perKm / 60);
  const secs = perKm % 60;
  return `${minutes}:${String(secs).padStart(2, '0')}`;
}

/** Pace as mm:ss per km, from a distance and a duration. Null when it cannot be worked out. */
export function paceLabel(distanceKm, durationSeconds) {
  const km = Number(distanceKm);
  const seconds = Number(durationSeconds);
  if (!Number.isFinite(km) || !Number.isFinite(seconds) || km <= 0 || seconds <= 0) return null;
  return formatPace(seconds / km);
}

/**
 * The text that goes with a shared run.
 *
 * Still produced even when an image is attached, because every target does something
 * different with a shared file: some show the caption, some ignore it, and a few — SMS among
 * them — cannot take the image at all and show only this. It is also the fallback when the
 * card cannot be rendered.
 */
export function shareMessage(run) {
  const distance = Number(run?.distanceKm);
  const parts = [];

  parts.push(
    Number.isFinite(distance) && distance > 0
      ? `${distance.toFixed(2)} km`
      : 'A run'
  );

  const pace = paceLabel(run?.distanceKm, run?.durationSeconds);
  if (pace) parts.push(`${pace} /km`);

  const headline = run?.name?.trim() ? `${run.name.trim()} — ${parts.join(' · ')}` : parts.join(' · ');
  return `${headline}\n\nTracked with Run League.`;
}
