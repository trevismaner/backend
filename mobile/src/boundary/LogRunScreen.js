import { useState, useRef, useEffect, useCallback } from 'react';
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
import { distanceBetween, formatDuration, thinRoute } from '../utils/geo.js';
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
  const lastPoint = useRef(null);
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
   * Folds fixes the background task recorded into the run.
   *
   * While the app is backgrounded the OS delivers locations to the task, not to this screen,
   * so they pile up in a buffer. This takes them in order, extends the route and adds the
   * distance — the same arithmetic the live watcher does, just catching up at once.
   */
  const absorbBackgroundPoints = useCallback(async () => {
    const buffered = await drainBufferedLocations();
    if (buffered.length === 0) return 0;

    let added = 0;
    for (const point of buffered) {
      if (lastPoint.current) added += distanceBetween(lastPoint.current, point);
      routePoints.current.push(point);
      lastPoint.current = point;
    }

    distanceRef.current += added;
    setDistanceKm(distanceRef.current);
    setRouteCoords([...routePoints.current]);
    return buffered.length;
  }, []);

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

    routePoints.current = Array.isArray(active.routeGps) ? active.routeGps : [];
    lastPoint.current = routePoints.current[routePoints.current.length - 1] ?? null;
    startedAtRef.current = active.startedAt;
    hasServerRun.current = true;
    clientRunId.current = newClientRunId();

    distanceRef.current = Number(active.distanceKm) || 0;
    elapsedRef.current = active.durationSeconds || 0;
    setDistanceKm(distanceRef.current);
    setElapsedSeconds(elapsedRef.current);
    setRouteCoords(routePoints.current);
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
    lastPoint.current = null;
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
      (location) => {
        const point = {
          latitude: location.coords.latitude,
          longitude: location.coords.longitude,
          timestamp: location.timestamp,
        };
        routePoints.current.push(point);
        setRouteCoords((prev) => [...prev, point]);

        if (lastPoint.current) {
          const segment = distanceBetween(lastPoint.current, point);
          distanceRef.current += segment;
          setDistanceKm(distanceRef.current);
        }
        lastPoint.current = point;

        mapRef.current?.animateToRegion(
          { latitude: point.latitude, longitude: point.longitude, latitudeDelta: 0.005, longitudeDelta: 0.005 },
          500
        );
      }
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
              <Polyline coordinates={routeCoords} strokeColor={colors.primary} strokeWidth={4} />
            )}
            {routeCoords.length > 0 && (
              <Marker coordinate={routeCoords[0]} title="Start" pinColor={colors.riskLow} />
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
      </View>

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
  statLabel: { ...type.label, color: colors.inkMuted, textTransform: 'lowercase' },
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
