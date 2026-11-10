import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, SafeAreaView, Pressable, Alert, AppState } from 'react-native';
import MapView, { Polyline, Marker } from 'react-native-maps';
import * as Location from 'expo-location';
import {
  startBackgroundTracking,
  stopBackgroundTracking,
  drainBufferedLocations,
  clearBufferedLocations,
} from '../utils/backgroundLocation.js';
import createRunController from '../control/CreateRunController.js';
import {
  startTrackingController,
  viewActiveRunController,
  saveRunProgressController,
  discardActiveRunController,
  finishActiveRunController,
} from '../control/TrackRunController.js';
import { formatDuration, thinRoute } from '../utils/geo.js';
import {
  mergePoints,
  routeDistanceKm,
  regionForCoordinates,
  toPoint,
  rollingPaceSecondsPerKm,
} from '../utils/routeTrack.js';
import { formatPace } from '../utils/routeShare.js';
import { useHeartRate, HR_STATUS } from '../control/HeartRateMonitor.js';
import { estimateCalories } from '../utils/calories.js';
import { useAuth } from '../context/AuthContext.js';
import { colors } from '../theme/colors.js';
import { type, spacing, radius } from '../theme/typography.js';

// How often the run in progress is mirrored to the server. Often enough that a crash costs
// at most this much of the run, rarely enough that it is not a drain while running.
const CHECKPOINT_EVERY_MS = 20000;

/** An idempotency key, so a double-tapped Save cannot store the run twice. */
const newClientRunId = () => `run-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

export default function LogRunScreen({ navigation }) {
  const [status, setStatus] = useState('idle');
  const [distanceKm, setDistanceKm] = useState(0);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [isSaving, setIsSaving] = useState(false);
  const [routeCoords, setRouteCoords] = useState([]);
  const [currentRegion, setCurrentRegion] = useState(null);
  const [notice, setNotice] = useState(null);

  const watchSubscription = useRef(null);
  const routePoints = useRef([]);
  const timerRef = useRef(null);
  const checkpointRef = useRef(null);
  const startedAtRef = useRef(null);
  const mapRef = useRef(null);

  // The checkpoint runs on a timer, outside React's render cycle, so it reads these rather
  // than the state above — state would be captured stale by the interval closure.
  const distanceRef = useRef(0);
  const elapsedRef = useRef(0);
  const hasServerRun = useRef(false);
  const clientRunId = useRef(null);
  const trackingInBackground = useRef(false);

  /**
   * Folds new fixes into the run, from either source, and re-measures.
   *
   * This is the single way points enter the route, and it is deliberately the same call for
   * the live watcher and for the background buffer. Both sources run for the WHOLE run — the
   * background task is started when the run starts, not when the app leaves the screen — so
   * for any stretch recorded with the app on screen, both of them see it.
   *
   * The old code appended the buffer to the end of the route and added its distance on top.
   * Every checkpoint therefore ran the line forward with the watcher, jumped back to where
   * the runner had been twenty seconds earlier, and ran forward again: the sawtooth that
   * made a backgrounded run look like it was going back and forth, with the distance roughly
   * doubling. Measured on a simulated 1 km run with one 20 s stretch delivered twice: 1.807
   * km recorded, and a 638 m backwards jump in the drawn line.
   *
   * `mergePoints` is pure and order-independent, so feeding it the same fix twice is a
   * no-op, and the distance is re-measured from the whole cleaned route rather than
   * accumulated — which is what lets a bad fix stop counting once it is filtered out,
   * instead of staying baked into a running total.
   */
  const ingestPoints = useCallback((incoming) => {
    const points = (Array.isArray(incoming) ? incoming : [incoming]).map(toPoint).filter(Boolean);
    if (points.length === 0) return 0;

    const before = routePoints.current.length;
    routePoints.current = mergePoints(routePoints.current, points);
    distanceRef.current = routeDistanceKm(routePoints.current);

    setDistanceKm(distanceRef.current);
    setRouteCoords(routePoints.current);
    return routePoints.current.length - before;
  }, []);

  /** Takes whatever the background task has buffered and folds it in. */
  const absorbBackgroundPoints = useCallback(async () => {
    const buffered = await drainBufferedLocations();
    if (buffered.length === 0) return 0;
    ingestPoints(buffered);
    return buffered.length;
  }, [ingestPoints]);

  const stopTimers = useCallback(() => {
    clearInterval(timerRef.current);
    clearInterval(checkpointRef.current);
    timerRef.current = null;
    checkpointRef.current = null;
  }, []);

  /**
   * Picks up a run the app was recording when it was last killed.
   *
   * Tracking is not restarted automatically — the runner may be at home by now — so the
   * run is restored in the "finished" state, where they can save it or throw it away.
   */
  const recoverUnfinishedRun = useCallback(async () => {
    const result = await viewActiveRunController();
    const active = result.success ? result.data?.activeRun : null;
    if (!active) return;

    // Cleaned on the way back in as well: a run recorded by an older build of the app, or
    // checkpointed before the filtering existed, may hold the bad fixes that caused the
    // zig-zag. Merging them now means a recovered run is drawn and measured by today's rules.
    routePoints.current = mergePoints([], Array.isArray(active.routeGps) ? active.routeGps : []);
    startedAtRef.current = active.startedAt;
    hasServerRun.current = true;
    clientRunId.current = newClientRunId();

    // The stored figure wins, and the route is only used for the shape.
    //
    // Re-measuring the recovered route looks tempting — it would clean up a distance that an
    // older build inflated — but it is wrong in the normal case. The checkpointed route has
    // been through `thinRoute`, which drops points closer together than 10 m, so measuring
    // it gives a shorter line than the full-resolution one the figure was taken from. The
    // stored number was measured live from every fix; the stored route is a drawing copy.
    // Trust each for what it is.
    distanceRef.current = Number(active.distanceKm) || 0;
    elapsedRef.current = active.durationSeconds || 0;
    setDistanceKm(distanceRef.current);
    setElapsedSeconds(elapsedRef.current);
    setRouteCoords(routePoints.current);

    // Frame the recovered run so it is visible as a route, not as a dot.
    const region = regionForCoordinates(routePoints.current);
    if (region) setCurrentRegion(region);

    setStatus('finished');
    setNotice('This run was still being recorded when the app closed. Save it, or discard it and start again.');
  }, []);

  useEffect(() => {
    centerOnCurrentLocation();
    recoverUnfinishedRun();
    return () => {
      stopWatching();
      stopTimers();
    };
  }, [recoverUnfinishedRun, stopTimers]);

  /**
   * Catches up whenever the app is brought back to the foreground.
   *
   * The elapsed timer is recomputed from the clock rather than resumed, because JavaScript
   * timers do not run while the app is backgrounded — counting ticks would under-report the
   * time by however long the phone was in a pocket.
   */
  useEffect(() => {
    const subscription = AppState.addEventListener('change', async (next) => {
      if (next !== 'active' || status !== 'tracking') return;

      await absorbBackgroundPoints();

      if (startedAtRef.current) {
        elapsedRef.current = Math.max(
          elapsedRef.current,
          Math.round((Date.now() - new Date(startedAtRef.current).getTime()) / 1000)
        );
        setElapsedSeconds(elapsedRef.current);
      }
    });
    return () => subscription.remove();
  }, [status, absorbBackgroundPoints]);

  async function centerOnCurrentLocation() {
    const { status: permissionStatus } = await Location.requestForegroundPermissionsAsync();
    if (permissionStatus !== 'granted') return;
    const location = await Location.getCurrentPositionAsync({});
    setCurrentRegion({
      latitude: location.coords.latitude,
      longitude: location.coords.longitude,
      latitudeDelta: 0.005,
      longitudeDelta: 0.005,
    });
  }

  /** Mirrors the run in progress to the server. Never interrupts the run if it fails. */
  async function checkpoint() {
    if (!hasServerRun.current) return;
    // Fold in anything the background task recorded first, so a checkpoint taken while the
    // app is backgrounded still sends the whole run rather than where it was last on screen.
    if (trackingInBackground.current) await absorbBackgroundPoints();
    await saveRunProgressController({
      distanceKm: distanceRef.current,
      durationSeconds: elapsedRef.current,
      routeGps: routePoints.current,
    });
  }

  async function handleStart() {
    const { status: permissionStatus } = await Location.requestForegroundPermissionsAsync();
    if (permissionStatus !== 'granted') {
      Alert.alert('Location needed', 'Run League needs location access to track your run.');
      return;
    }

    startedAtRef.current = new Date().toISOString();
    routePoints.current = [];
    distanceRef.current = 0;
    elapsedRef.current = 0;
    clientRunId.current = newClientRunId();
    await clearBufferedLocations(); // nothing from a previous run may leak into this one
    setRouteCoords([]);
    setDistanceKm(0);
    setElapsedSeconds(0);
    setNotice(null);
    setStatus('tracking');

    // Keep recording when the screen locks. Declining the permission, or running in Expo Go,
    // is not a failure — the run records while the screen is on, as it always did, and the
    // reason is put on screen so it is not a silent difference.
    const background = await startBackgroundTracking();
    trackingInBackground.current = background.ok;
    if (!background.ok) setNotice(background.reason);

    // Register the run with the server so it is recoverable. If this fails the run still
    // goes ahead in memory — it just cannot be recovered, which is how it used to work.
    const started = await startTrackingController(startedAtRef.current);
    hasServerRun.current = started.success;
    if (!started.success) {
      setNotice('Recording offline — this run cannot be recovered if the app closes.');
    }

    timerRef.current = setInterval(() => {
      elapsedRef.current += 1;
      setElapsedSeconds(elapsedRef.current);
    }, 1000);

    checkpointRef.current = setInterval(checkpoint, CHECKPOINT_EVERY_MS);

    watchSubscription.current = await Location.watchPositionAsync(
      { accuracy: Location.Accuracy.BestForNavigation, timeInterval: 3000, distanceInterval: 5 },
      // One shared entry point, so a fix the background task also recorded collapses into
      // the same observation instead of being counted twice.
      (location) => { ingestPoints(location); }
      // No animateToRegion here. The map already has followsUserLocation while tracking, and
      // driving the camera from both at once made it lurch and fight itself on every fix —
      // which looks exactly like the map "going wonky", separately from the drawn path.
    );
  }

  function stopWatching() {
    if (watchSubscription.current) {
      watchSubscription.current.remove();
      watchSubscription.current = null;
    }
  }

  async function handleStop() {
    stopWatching();
    stopTimers();

    // Take the last of what the background task recorded before shutting it down, or the
    // final stretch of a run finished with the phone in a pocket would be missing.
    if (trackingInBackground.current) {
      await absorbBackgroundPoints();
      await stopBackgroundTracking();
      trackingInBackground.current = false;
    }

    setStatus('finished');

    // Pull the camera back to show the whole run. While tracking, the map follows the runner
    // at street level, which is right then and useless the moment they stop — they want to
    // see where they went, not where they are standing.
    const region = regionForCoordinates(routePoints.current);
    if (region) {
      setCurrentRegion(region);
      mapRef.current?.animateToRegion(region, 600);
    }

    await checkpoint(); // so the finished run is safe even before they tap Save
  }

  async function handleSave() {
    setIsSaving(true);

    // The route is thinned before it is sent: location updates arrive every few seconds
    // whether or not the runner moved, and the raw list used to be large enough that the
    // request was rejected and the run could not be saved at all.
    const runData = {
      distanceKm: Number(distanceRef.current.toFixed(2)),
      durationSeconds: elapsedRef.current,
      startedAt: startedAtRef.current,
      endedAt: new Date().toISOString(),
      routeGps: thinRoute(routePoints.current),
      clientRunId: clientRunId.current,
      // Null unless a sensor was connected, which is what the columns already expect.
      // Averaged per second rather than per packet, so the figure means the same thing
      // whatever rate the sensor happened to report at.
      ...hr.summary(),
    };

    // Finishing the server-side run and saving it are one step, so it cannot be stored
    // twice. Without one (the start call failed), fall back to saving it outright.
    const result = hasServerRun.current
      ? await finishActiveRunController(runData)
      : await createRunController(runData);

    setIsSaving(false);

    if (result.success) {
      hasServerRun.current = false;
      await clearBufferedLocations();
      navigation.navigate('Dashboard');
    } else {
      Alert.alert('Could not save run', result.message);
    }
  }

  function handleDiscard() {
    Alert.alert('Discard run', 'This run will not be saved.', [
      { text: 'Keep editing', style: 'cancel' },
      {
        text: 'Discard',
        style: 'destructive',
        onPress: async () => {
          // Stop the OS recording too, or the notification stays up and the buffer keeps
          // growing for a run that no longer exists.
          await stopBackgroundTracking();
          await clearBufferedLocations();
          trackingInBackground.current = false;
          if (hasServerRun.current) await discardActiveRunController();
          hasServerRun.current = false;
          navigation.navigate('Dashboard');
        },
      },
    ]);
  }

  /**
   * Live heart rate from a paired Bluetooth sensor.
   *
   * `supported` is false in Expo Go, where the native Bluetooth module cannot load, so
   * everything below renders nothing at all and the screen is exactly as it was. The
   * reading only matters while a run is in progress, hence `enabled`.
   */
  const hr = useHeartRate({ enabled: status === 'tracking' });

  /**
   * Calories burned so far.
   *
   * Null without a weight on the profile, which is the honest answer — a figure derived
   * from a guessed body mass would look just as authoritative as a real one. The same
   * arithmetic runs on the server when a run is saved, so this number does not jump the
   * moment the run is stored.
   */
  const { user } = useAuth();
  const calories = useMemo(
    () => estimateCalories({ weightKg: user?.weightKg, distanceKm }),
    [user?.weightKg, distanceKm]
  );

  /** Pace over the whole run so far. Settles as the run goes on. */
  const averagePace = useMemo(
    () => (distanceKm > 0 && elapsedSeconds > 0 ? formatPace(elapsedSeconds / distanceKm) : null),
    [distanceKm, elapsedSeconds]
  );

  /**
   * Pace over the trailing window — how fast the runner is going now.
   *
   * Depends on elapsedSeconds as well as the route so that it is recomputed on every tick of
   * the clock, not only when a fix arrives. That is what makes the staleness rule visible: if
   * the fixes stop, this keeps re-running and starts returning null within twenty seconds,
   * rather than leaving the last known pace on screen as though it were still current.
   * elapsedSeconds is therefore a dependency despite being unused in the body; dropping it
   * would be the bug, not the lint fix.
   */
  const livePace = useMemo(
    // eslint-disable-next-line react-hooks/exhaustive-deps
    () => formatPace(rollingPaceSecondsPerKm(routeCoords)),
    [routeCoords, elapsedSeconds]
  );

  /**
   * A finished run shows its average instead of its last rolling pace.
   *
   * Once the run ends neither the route nor the clock moves again, so the trailing window
   * would freeze on whatever the final minute happened to be and present it as current.
   * The average is both stable and the figure that actually describes the run.
   */
  const isFinished = status === 'finished';
  const paceShown = isFinished ? averagePace : livePace;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.mapContainer}>
        {currentRegion ? (
          <MapView
            ref={mapRef}
            style={styles.map}
            initialRegion={currentRegion}
            showsUserLocation
            followsUserLocation={status === 'tracking'}
          >
            {routeCoords.length > 1 && (
              <Polyline
                coordinates={routeCoords}
                strokeColor={colors.primary}
                strokeWidth={5}
                lineCap="round"
                lineJoin="round"
              />
            )}
            {routeCoords.length > 0 && (
              <Marker coordinate={routeCoords[0]} title="Start" pinColor={colors.riskLow} />
            )}
            {status === 'finished' && routeCoords.length > 1 && (
              <Marker
                coordinate={routeCoords[routeCoords.length - 1]}
                title="Finish"
                pinColor={colors.primary}
              />
            )}
          </MapView>
        ) : (
          <View style={styles.mapPlaceholder}>
            <Text style={styles.mapPlaceholderText}>Getting your location…</Text>
          </View>
        )}
      </View>

      {notice ? <Text style={styles.notice}>{notice}</Text> : null}

      <View style={styles.statsPanel}>
        <View style={styles.statBlock}>
          <Text style={styles.statValue}>{distanceKm.toFixed(2)}</Text>
          <Text style={styles.statLabel}>km</Text>
        </View>
        <View style={styles.statBlock}>
          <Text style={styles.statValue}>{formatDuration(elapsedSeconds)}</Text>
          <Text style={styles.statLabel}>time</Text>
        </View>
        {/* A dash, not a stale or invented number, whenever the pace cannot be worked out:
            the first few seconds of a run, standing still, or signal lost. */}
        <View style={styles.statBlock}>
          <Text style={[styles.statValue, !paceShown && styles.statValueIdle]}>
            {paceShown ?? '—'}
          </Text>
          <Text style={styles.statLabel}>{isFinished ? 'avg /km' : '/km'}</Text>
        </View>
      </View>

      {/* Only while running: on a finished run the pace stat above already shows it. */}
      {(averagePace || calories !== null) && (
        <Text style={styles.averagePace}>
          {!isFinished && averagePace ? `${averagePace} /km average so far` : ''}
          {!isFinished && averagePace && calories !== null ? '  ·  ' : ''}
          {calories !== null ? `${calories} kcal` : ''}
        </Text>
      )}

      {/* Shown only before a run starts, so it cannot nag mid-run. */}
      {status === 'idle' && calories === null && (
        <Pressable onPress={() => navigation.navigate('Profile')} hitSlop={8}>
          <Text style={styles.calorieHint}>Add your weight in Profile to see calories</Text>
        </Pressable>
      )}

      {/* Hidden entirely without the native Bluetooth module, so Expo Go is unaffected. */}
      {hr.supported && !isFinished && (
        <View style={styles.hrRow}>
          {hr.status === HR_STATUS.CONNECTED ? (
            <>
              <Text style={styles.hrGlyph}>♥</Text>
              <Text style={styles.hrValue}>{hr.bpm ?? '—'}</Text>
              <Text style={styles.hrUnit}>bpm</Text>
              <Text style={styles.hrDevice} numberOfLines={1}>{hr.deviceName}</Text>
            </>
          ) : (
            <Pressable
              onPress={hr.connect}
              disabled={hr.status === HR_STATUS.SCANNING}
              hitSlop={8}
            >
              <Text style={[styles.hrConnect, hr.error && styles.hrConnectError]}>
                {hr.status === HR_STATUS.SCANNING
                  ? 'Searching for a heart rate sensor…'
                  : hr.error
                    ? `${hr.error} · tap to retry`
                    : 'Connect a heart rate sensor'}
              </Text>
            </Pressable>
          )}
        </View>
      )}

      <View style={styles.controls}>
        {status === 'idle' && (
          <Pressable style={styles.startButton} onPress={handleStart}>
            <Text style={styles.startButtonText}>Start</Text>
          </Pressable>
        )}

        {status === 'tracking' && (
          <Pressable style={styles.stopButton} onPress={handleStop}>
            <Text style={styles.stopButtonText}>Stop</Text>
          </Pressable>
        )}

        {status === 'finished' && (
          <View style={styles.finishedRow}>
            <Pressable style={styles.discardButton} onPress={handleDiscard}>
              <Text style={styles.discardButtonText}>Discard</Text>
            </Pressable>
            <Pressable style={styles.saveButton} onPress={handleSave} disabled={isSaving}>
              <Text style={styles.saveButtonText}>{isSaving ? 'Saving…' : 'Save run'}</Text>
            </Pressable>
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  mapContainer: { height: 280 },
  map: { flex: 1 },
  mapPlaceholder: {
    flex: 1,
    backgroundColor: colors.surfaceMuted,
    justifyContent: 'center',
    alignItems: 'center',
  },
  mapPlaceholderText: { ...type.caption, color: colors.inkMuted },
  notice: {
    ...type.caption,
    color: colors.ink,
    backgroundColor: colors.surfaceRaised,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.md,
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    padding: spacing.md,
  },
  statsPanel: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: spacing.xl,
  },
  statBlock: { alignItems: 'center' },
  statValue: { ...type.display, color: colors.ink },
  statValueIdle: { color: colors.inkFaint },
  statLabel: { ...type.label, color: colors.inkMuted, textTransform: 'lowercase' },
  averagePace: {
    ...type.label,
    color: colors.inkFaint,
    textAlign: 'center',
    marginTop: -spacing.md,
    marginBottom: spacing.sm,
  },
  hrRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'center',
    gap: 6,
    paddingBottom: spacing.sm,
  },
  hrGlyph: { fontSize: 13, color: colors.primary },
  hrValue: { fontSize: 17, fontWeight: '700', color: colors.ink },
  hrUnit: { ...type.label, color: colors.inkMuted },
  hrDevice: { ...type.label, color: colors.inkFaint, flexShrink: 1, marginLeft: 4 },
  hrConnect: { ...type.label, color: colors.primary, textAlign: 'center' },
  hrConnectError: { color: colors.warning },
  calorieHint: { ...type.label, color: colors.primary, textAlign: 'center', paddingBottom: spacing.sm },
  controls: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xl },
  startButton: {
    backgroundColor: colors.primary,
    borderRadius: radius.pill,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  startButtonText: { ...type.subtitle, color: colors.onPrimary },
  stopButton: {
    backgroundColor: colors.riskHigh,
    borderRadius: radius.pill,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  stopButtonText: { ...type.subtitle, color: colors.onPrimary },
  finishedRow: { flexDirection: 'row', gap: spacing.sm },
  discardButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  discardButtonText: { ...type.bodyStrong, color: colors.inkMuted },
  saveButton: {
    flex: 1,
    backgroundColor: colors.primary,
    borderRadius: radius.pill,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  saveButtonText: { ...type.bodyStrong, color: colors.onPrimary },
});
