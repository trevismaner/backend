import { View, Text, Image, StyleSheet } from 'react-native';
import Svg, { Path, Circle, Defs, LinearGradient, Stop, Rect } from 'react-native-svg';
import { projectRoute, toSvgPath, paceLabel } from '../utils/routeShare.js';
import { formatDuration } from '../utils/geo.js';

/**
 * The image that gets shared when someone shares a run.
 *
 * Sharing used to be `Share.share({ message: 'I just ran 5.2km on Run League! 🏃' })` — one
 * line of text, no route, no time, no pace, no date. This renders a card that is captured to
 * a PNG and shared as a file.
 *
 * WHY ITS COLOURS ARE HARDCODED AND NOT FROM THE THEME
 * The app's palette is adaptive: `colors.background` resolves to white in light mode and
 * black in dark mode. That is right for the app and wrong for this, because this is an image
 * that leaves the phone. Captured from a light-mode device it would be a white card, from a
 * dark-mode device a black one, and the same run would reach two recipients looking like two
 * different products. A shared artefact needs one fixed appearance, so the card carries its
 * own small palette below. `PRIMARY` is the one value shared with the app, because that red
 * is the identity.
 *
 * WHY THE ROUTE IS DRAWN AS WELL AS SNAPSHOTTED
 * When `mapSnapshotUri` is supplied — `MapView.takeSnapshot()` succeeded — the real map
 * sits behind the route and you get streets and parks. When it is not, the route is drawn on
 * a plain field instead. That fallback is not hypothetical for this project: the Google Maps
 * key has been rejected before, and a map that will not render tiles must not mean a blank
 * share card. The route trace needs no key, no network and no native map, so the card always
 * has something true to show.
 */

const CARD_WIDTH = 360;
const CARD_HEIGHT = 560;
const MAP_HEIGHT = 340;

const CARD = {
  bg: '#0B1016',
  panel: '#111A23',
  hairline: '#1F2B36',
  ink: '#FFFFFF',
  inkMuted: '#8C98A4',
  primary: '#CE0E2D',
  routeGlow: 'rgba(206,14,45,0.28)',
  startDot: '#FFFFFF',
};

export { CARD_WIDTH, CARD_HEIGHT };

function Stat({ label, value }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

/** "Sun 12 Oct 2026". Falls back to nothing rather than printing "Invalid Date". */
function dateLabel(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export default function RunShareCard({ run, routePoints = [], mapSnapshotUri = null }) {
  const projected = projectRoute(routePoints, {
    width: CARD_WIDTH,
    height: MAP_HEIGHT,
    padding: 30,
    // The name and date sit across the top of the map area. Without the extra room the
    // route ran under them and the start dot landed on the title.
    paddingTop: 76,
    paddingBottom: 34,
  });
  const path = toSvgPath(projected.points);
  const hasRoute = projected.points.length > 1;

  const distance = Number(run?.distanceKm);
  const distanceText = Number.isFinite(distance) ? distance.toFixed(2) : '—';
  const pace = paceLabel(run?.distanceKm, run?.durationSeconds);
  const when = dateLabel(run?.startedAt ?? run?.createdAt);

  const first = projected.points[0];
  const last = projected.points[projected.points.length - 1];

  return (
    <View style={styles.card} collapsable={false}>
      <View style={styles.mapArea}>
        {mapSnapshotUri ? (
          <Image source={{ uri: mapSnapshotUri }} style={styles.snapshot} resizeMode="cover" />
        ) : null}

        <Svg width={CARD_WIDTH} height={MAP_HEIGHT} style={styles.svg}>
          {!mapSnapshotUri && (
            <>
              <Defs>
                {/* A slight vertical lift stops the plain fallback reading as "failed to
                    load" — it looks like a deliberate dark field rather than a void. */}
                <LinearGradient id="field" x1="0" y1="0" x2="0" y2="1">
                  <Stop offset="0" stopColor="#15202B" />
                  <Stop offset="1" stopColor="#0B1016" />
                </LinearGradient>
              </Defs>
              <Rect x="0" y="0" width={CARD_WIDTH} height={MAP_HEIGHT} fill="url(#field)" />
            </>
          )}

          {hasRoute && (
            <>
              {/* Drawn twice: a wide translucent pass under a solid one, which reads as a
                  glow and keeps the line legible over a busy map snapshot. */}
              <Path d={path} stroke={CARD.routeGlow} strokeWidth={14} fill="none"
                strokeLinecap="round" strokeLinejoin="round" />
              <Path d={path} stroke={CARD.primary} strokeWidth={5} fill="none"
                strokeLinecap="round" strokeLinejoin="round" />
              <Circle cx={first.x} cy={first.y} r={6} fill={CARD.startDot} />
              <Circle cx={last.x} cy={last.y} r={6} fill={CARD.primary}
                stroke={CARD.startDot} strokeWidth={2.5} />
            </>
          )}
        </Svg>

        <View style={styles.mapOverlay}>
          {run?.name?.trim() ? (
            <Text style={styles.runName} numberOfLines={1}>{run.name.trim()}</Text>
          ) : null}
          {when ? <Text style={styles.runDate}>{when}</Text> : null}
        </View>

        {!hasRoute && (
          <View style={styles.noRouteBadge}>
            <Text style={styles.noRouteText}>No route recorded</Text>
          </View>
        )}
      </View>

      <View style={styles.panel}>
        <View style={styles.distanceRow}>
          <Text style={styles.distanceValue}>{distanceText}</Text>
          <Text style={styles.distanceUnit}>km</Text>
        </View>

        <View style={styles.statsRow}>
          <Stat label="Time" value={formatDuration(run?.durationSeconds ?? 0)} />
          <View style={styles.divider} />
          <Stat label="Pace" value={pace ? `${pace}/km` : '—'} />
          {run?.caloriesBurned != null && (
            <>
              <View style={styles.divider} />
              <Stat label="Calories" value={String(run.caloriesBurned)} />
            </>
          )}
        </View>

        <View style={styles.footer}>
          <View style={styles.mark} />
          <Text style={styles.wordmark}>RUN LEAGUE</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { width: CARD_WIDTH, height: CARD_HEIGHT, backgroundColor: CARD.bg, overflow: 'hidden' },
  mapArea: { width: CARD_WIDTH, height: MAP_HEIGHT, backgroundColor: CARD.bg },
  snapshot: { position: 'absolute', top: 0, left: 0, width: CARD_WIDTH, height: MAP_HEIGHT },
  svg: { position: 'absolute', top: 0, left: 0 },
  mapOverlay: { position: 'absolute', top: 18, left: 20, right: 20 },
  runName: { color: CARD.ink, fontSize: 19, fontWeight: '700', letterSpacing: -0.3 },
  runDate: { color: CARD.inkMuted, fontSize: 12, fontWeight: '500', marginTop: 2 },
  noRouteBadge: {
    position: 'absolute',
    alignSelf: 'center',
    top: MAP_HEIGHT / 2 - 14,
    borderWidth: 1,
    borderColor: CARD.hairline,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  noRouteText: { color: CARD.inkMuted, fontSize: 12 },

  panel: {
    flex: 1,
    backgroundColor: CARD.panel,
    borderTopWidth: 1,
    borderTopColor: CARD.hairline,
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 18,
    justifyContent: 'space-between',
  },
  // Baseline-aligned, so the unit sits on the bottom of the big figure rather than floating.
  distanceRow: { flexDirection: 'row', alignItems: 'flex-end' },
  distanceValue: { color: CARD.ink, fontSize: 66, fontWeight: '800', letterSpacing: -2.5, lineHeight: 66 },
  distanceUnit: { color: CARD.inkMuted, fontSize: 20, fontWeight: '700', marginLeft: 8, marginBottom: 8 },

  statsRow: { flexDirection: 'row', alignItems: 'center' },
  stat: { flex: 1 },
  statValue: { color: CARD.ink, fontSize: 19, fontWeight: '700' },
  statLabel: { color: CARD.inkMuted, fontSize: 10, fontWeight: '600', letterSpacing: 0.6, marginTop: 3, textTransform: 'uppercase' },
  divider: { width: 1, height: 30, backgroundColor: CARD.hairline, marginHorizontal: 14 },

  footer: { flexDirection: 'row', alignItems: 'center' },
  mark: { width: 14, height: 14, borderRadius: 4, backgroundColor: CARD.primary, marginRight: 9 },
  wordmark: { color: CARD.inkMuted, fontSize: 11, fontWeight: '800', letterSpacing: 1.8 },
});
