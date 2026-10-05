// Badges awarded automatically by name (Badge.checkAndAwardRunMilestones etc.).
// Renaming or deleting them would silently stop them being awarded.
export const SYSTEM_BADGE_NAMES = Object.freeze([
  'First Steps',
  'Consistent Runner',
  'Marathoner',
  'Team Player',
  'Competitor',
]);

export const isSystemBadge = (name) => SYSTEM_BADGE_NAMES.includes(name);

export function toBadgeJSON(row) {
  return {
    badgeId: row.badge_id,
    name: row.name,
    description: row.description,
    iconUrl: row.icon_url,
    ...(row.earned_count !== undefined ? { earnedCount: row.earned_count } : {}),
  };
}
