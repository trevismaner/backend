/**
 * How a run turns into reward points.
 *
 * Shared by every path that creates, corrects or removes a run, so the three can never
 * disagree about what a kilometre is worth — which is how deleting a run used to leave its
 * points behind.
 */
export const POINTS_PER_KM = 10;

export const pointsFor = (distanceKm) => Math.round(Number(distanceKm ?? 0) * POINTS_PER_KM);
