import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform, PermissionsAndroid } from 'react-native';
import {
  HEART_RATE_SERVICE,
  HEART_RATE_MEASUREMENT,
  parseHeartRateMeasurement,
  createHeartRateTrack,
} from '../utils/heartRate.js';

/**
 * Live heart rate from a paired Bluetooth sensor.
 *
 * A phone has no heart rate sensor, so every app that shows a live rate is reading an
 * external one: a chest strap, an armband, or a watch put into "broadcast heart rate" mode.
 * All of them speak the same standard GATT service, which is why this works across brands
 * without a per-vendor integration.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────
 * NOT YET TESTED AGAINST HARDWARE. The packet decoding in utils/heartRate.js is covered by
 * 36 tests, but the scanning and connection below have never run against a real sensor.
 * Treat the first run with a strap as the real test, and expect to adjust.
 * ─────────────────────────────────────────────────────────────────────────────────────
 *
 * Requires a development build. react-native-ble-plx has a native component that Expo Go
 * cannot load, so in Expo Go `supported` stays false and the feature simply does not
 * appear — the app behaves exactly as it does today rather than crashing. That is the
 * reason for the guarded import and for every call being wrapped: a missing radio, a
 * refused permission and a sensor walking out of range must all degrade to "no reading"
 * rather than to a broken run screen. A run is still a run without a heart rate.
 */

// Guarded because the native side is absent in Expo Go. The package must still be
// installed for Metro to resolve this import at bundle time.
let BleManager = null;
try {
  ({ BleManager } = require('react-native-ble-plx'));
} catch {
  BleManager = null;
}

export const HR_STATUS = {
  UNSUPPORTED: 'unsupported',   // no native module — Expo Go, or the package is not installed
  IDLE: 'idle',
  SCANNING: 'scanning',
  CONNECTED: 'connected',
  ERROR: 'error',
};

/**
 * Android needs permission before it will let an app see Bluetooth devices at all.
 *
 * Which permission depends on the version. From Android 12 the Bluetooth permissions are
 * their own thing; before that, scanning counted as location because a list of nearby
 * devices can place you. Asking for the wrong pair fails silently — the scan simply never
 * reports a device — which is a miserable thing to debug.
 */
async function requestBluetoothPermission() {
  if (Platform.OS !== 'android') return true;
  try {
    if (Platform.Version >= 31) {
      const granted = await PermissionsAndroid.requestMultiple([
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
      ]);
      return Object.values(granted).every((v) => v === PermissionsAndroid.RESULTS.GRANTED);
    }
    const granted = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION
    );
    return granted === PermissionsAndroid.RESULTS.GRANTED;
  } catch {
    return false;
  }
}

/** Waits for the Bluetooth adapter to be on, rather than scanning into a switched-off radio. */
function whenPoweredOn(manager, timeoutMs = 8000) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      try { subscription?.remove(); } catch { /* already gone */ }
      clearTimeout(timer);
      resolve(value);
    };
    const timer = setTimeout(() => finish(false), timeoutMs);
    const subscription = manager.onStateChange((state) => {
      if (state === 'PoweredOn') finish(true);
    }, true);
  });
}

/**
 * @param {boolean} enabled  whether a run is in progress. Scanning and holding a connection
 *                           cost battery, so the radio is only used while it is being read.
 */
export function useHeartRate({ enabled = false } = {}) {
  const [status, setStatus] = useState(BleManager ? HR_STATUS.IDLE : HR_STATUS.UNSUPPORTED);
  const [bpm, setBpm] = useState(null);
  const [deviceName, setDeviceName] = useState(null);
  const [error, setError] = useState(null);

  const managerRef = useRef(null);
  const deviceRef = useRef(null);
  const subsRef = useRef([]);
  // A ref, not state: every packet would otherwise re-render the whole run screen.
  const trackRef = useRef(createHeartRateTrack());
  const mountedRef = useRef(true);

  const cleanup = useCallback(() => {
    for (const s of subsRef.current) {
      try { s.remove(); } catch { /* already removed */ }
    }
    subsRef.current = [];
    try { managerRef.current?.stopDeviceScan(); } catch { /* not scanning */ }
    try { deviceRef.current?.cancelConnection(); } catch { /* already disconnected */ }
    deviceRef.current = null;
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      cleanup();
      try { managerRef.current?.destroy(); } catch { /* never created */ }
      managerRef.current = null;
    };
  }, [cleanup]);

  const set = useCallback((fn) => { if (mountedRef.current) fn(); }, []);

  const listen = useCallback((device) => {
    const sub = device.monitorCharacteristicForService(
      HEART_RATE_SERVICE,
      HEART_RATE_MEASUREMENT,
      (err, characteristic) => {
        if (err) {
          // Range, a flat sensor battery, or Bluetooth switched off mid-run. The run keeps
          // going; only the reading stops.
          set(() => {
            setStatus(HR_STATUS.ERROR);
            setError('Lost the heart rate sensor');
            setBpm(null);
          });
          return;
        }
        const reading = parseHeartRateMeasurement(characteristic?.value);
        if (!reading) return;          // a dropped packet is not worth showing as an error
        trackRef.current.add(reading.bpm);
        set(() => setBpm(reading.bpm));
      }
    );
    subsRef.current.push(sub);
  }, [set]);

  const connect = useCallback(async () => {
    if (!BleManager) {
      set(() => setStatus(HR_STATUS.UNSUPPORTED));
      return;
    }
    set(() => { setError(null); setStatus(HR_STATUS.SCANNING); });

    if (!(await requestBluetoothPermission())) {
      set(() => {
        setStatus(HR_STATUS.ERROR);
        setError('Bluetooth permission is needed to find your heart rate sensor');
      });
      return;
    }

    managerRef.current ??= new BleManager();
    const manager = managerRef.current;

    if (!(await whenPoweredOn(manager))) {
      set(() => { setStatus(HR_STATUS.ERROR); setError('Turn Bluetooth on to connect a sensor'); });
      return;
    }

    // Filtered to the heart rate service, so only sensors that can actually serve a reading
    // come back — not every phone, speaker and television in range.
    manager.startDeviceScan([HEART_RATE_SERVICE], null, async (scanError, device) => {
      if (scanError) {
        set(() => { setStatus(HR_STATUS.ERROR); setError('Could not search for sensors'); });
        return;
      }
      if (!device) return;

      // First match wins. A runner wearing two heart rate straps is not a case worth
      // building a picker for.
      try { manager.stopDeviceScan(); } catch { /* already stopped */ }

      try {
        const connected = await device.connect();
        await connected.discoverAllServicesAndCharacteristics();
        deviceRef.current = connected;

        subsRef.current.push(
          connected.onDisconnected(() => {
            set(() => { setStatus(HR_STATUS.ERROR); setError('Heart rate sensor disconnected'); setBpm(null); });
          })
        );

        listen(connected);
        set(() => {
          setDeviceName(connected.name || connected.localName || 'Heart rate sensor');
          setStatus(HR_STATUS.CONNECTED);
        });
      } catch {
        set(() => { setStatus(HR_STATUS.ERROR); setError('Could not connect to the sensor'); });
      }
    });
  }, [listen, set]);

  const disconnect = useCallback(() => {
    cleanup();
    set(() => { setStatus(BleManager ? HR_STATUS.IDLE : HR_STATUS.UNSUPPORTED); setBpm(null); setDeviceName(null); });
  }, [cleanup, set]);

  // Drop the connection when the run ends, so the radio is not held open in the background.
  useEffect(() => {
    if (!enabled && deviceRef.current) disconnect();
  }, [enabled, disconnect]);

  return {
    supported: Boolean(BleManager),
    status,
    bpm,
    deviceName,
    error,
    connect,
    disconnect,
    /** { avgHeartRate, maxHeartRate } for the run record, or nulls if nothing was captured. */
    summary: () => trackRef.current.summary(),
    reset: () => { trackRef.current = createHeartRateTrack(); },
  };
}

export default useHeartRate;
