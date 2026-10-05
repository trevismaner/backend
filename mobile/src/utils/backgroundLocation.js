import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';

/**
 * Keeps recording a run while the app is in the background or the phone is locked.
 *
 * Without this, tracking used `watchPositionAsync` with foreground permission only: the
 * moment the screen locked or the runner switched apps, the updates stopped and the rest of
 * the run was never recorded. Which is most of a run, for most runners.
 *
 * HOW IT WORKS
 * The OS runs `BACKGROUND_LOCATION_TASK` outside React — there is no component mounted to
 * receive the fixes, and on Android the app process may not even be in memory. So the task
 * appends each fix to a buffer in AsyncStorage, and the screen drains that buffer when it
 * comes back to the foreground. Nothing is lost if the app is killed mid-run: the buffer
 * survives, and the server-side active run (migration 005) holds the checkpointed copy.
 *
 * WHERE IT DOES NOT WORK
 * Expo Go cannot do background location at all — the native background modes are not part of
 * the Expo Go app, so `startLocationUpdatesAsync` fails there whatever permissions are
 * granted. That is a limitation of the client, not of this code, and it needs a development
 * or production build to lift. Everything here is written to fail softly: when background
 * tracking is unavailable the run still records normally while the screen is on, which is
 * exactly the behaviour there was before.
 */

export const BACKGROUND_LOCATION_TASK = 'run-league-background-location';

const BUFFER_KEY = 'runleague.backgroundLocations';

/** Appends fixes to the buffer. Called from the task, so it must never throw. */
async function bufferLocations(locations) {
  if (!Array.isArray(locations) || locations.length === 0) return;
  try {
    const existing = JSON.parse((await AsyncStorage.getItem(BUFFER_KEY)) || '[]');
    const points = locations
      .filter((l) => l?.coords && Number.isFinite(l.coords.latitude) && Number.isFinite(l.coords.longitude))
      .map((l) => ({
        latitude: l.coords.latitude,
        longitude: l.coords.longitude,
        timestamp: l.timestamp ?? Date.now(),
      }));
    if (points.length === 0) return;

    // Capped so a run left tracking for hours cannot grow the buffer without bound. The
    // oldest are dropped, since the screen has already drained anything older.
    const merged = [...existing, ...points].slice(-10000);
    await AsyncStorage.setItem(BUFFER_KEY, JSON.stringify(merged));
  } catch {
    // A failed write loses a few metres of route. It must not take the task down with it.
  }
}

/**
 * Defined at module scope, because the OS looks the task up by name when it delivers a fix —
 * possibly in a fresh process where no screen has mounted yet. Importing this module early
 * (App.js does) is what registers it.
 */
try {
  if (!TaskManager.isTaskDefined(BACKGROUND_LOCATION_TASK)) {
    TaskManager.defineTask(BACKGROUND_LOCATION_TASK, async ({ data, error }) => {
      if (error) return;
      await bufferLocations(data?.locations);
    });
  }
} catch {
  // Some runtimes (and the test harness) have no TaskManager. Tracking then stays foreground
  // only, which the start call below reports.
}

/**
 * Asks for "always" location and starts background updates.
 *
 * Returns `{ ok: true }` when the run will keep recording with the screen off, or
 * `{ ok: false, reason }` with something short enough to show the runner. Never throws: a
 * run must be able to start even when background tracking cannot.
 */
export async function startBackgroundTracking() {
  try {
    const foreground = await Location.requestForegroundPermissionsAsync();
    if (foreground.status !== 'granted') {
      return { ok: false, reason: 'Location permission is needed to track a run.' };
    }

    // Android shows this as "Allow all the time"; iOS as "Always Allow". Declining is a
    // normal choice, not an error — the run just stops recording when the screen locks.
    const background = await Location.requestBackgroundPermissionsAsync();
    if (background.status !== 'granted') {
      return {
        ok: false,
        reason: 'Tracking will pause when your screen locks. Allow location "all the time" to record a whole run.',
      };
    }

    const already = await Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK).catch(() => false);
    if (already) return { ok: true };

    await Location.startLocationUpdatesAsync(BACKGROUND_LOCATION_TASK, {
      accuracy: Location.Accuracy.BestForNavigation,
      timeInterval: 3000,
      distanceInterval: 5,

      // Android will not keep a background location service alive without a visible
      // notification, and requiring one is deliberate on the platform's part: the runner can
      // always see that their location is being recorded.
      foregroundService: {
        notificationTitle: 'Run League is recording your run',
        notificationBody: 'Tracking distance and route. Tap to return to the app.',
        notificationColor: '#CE0E2D',
      },

      // Tells iOS this is a fitness activity, which makes it handle pauses sensibly.
      activityType: Location.ActivityType.Fitness,
      pausesUpdatesAutomatically: false,
      showsBackgroundLocationIndicator: true,
    });

    return { ok: true };
  } catch (err) {
    // The usual cause is Expo Go, which has no background location support built in.
    return {
      ok: false,
      reason: 'Background tracking needs a development build — in Expo Go the run records only while the screen is on.',
      detail: err?.message,
    };
  }
}

/** Stops background updates. Safe to call when they were never started. */
export async function stopBackgroundTracking() {
  try {
    const running = await Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK).catch(() => false);
    if (running) await Location.stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
  } catch {
    // Nothing to do — the run is ending either way.
  }
}

/** Whether the OS is currently delivering background fixes for a run. */
export async function isBackgroundTrackingActive() {
  try {
    return await Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
  } catch {
    return false;
  }
}

/**
 * Takes everything the task has buffered and clears it, so the same points cannot be counted
 * twice. The screen calls this when it comes back to the foreground.
 */
export async function drainBufferedLocations() {
  try {
    const raw = await AsyncStorage.getItem(BUFFER_KEY);
    if (!raw) return [];
    await AsyncStorage.removeItem(BUFFER_KEY);
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** Throws the buffer away — for starting a new run, or discarding one. */
export async function clearBufferedLocations() {
  try {
    await AsyncStorage.removeItem(BUFFER_KEY);
  } catch {
    // Not worth failing a run over.
  }
}
