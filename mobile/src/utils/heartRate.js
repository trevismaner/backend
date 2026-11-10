/**
 * Decoding the Bluetooth Heart Rate Measurement characteristic (GATT 0x2A37).
 *
 * Every BLE heart rate sensor — chest straps, armbands, and watches in "broadcast" mode —
 * speaks this one standard format, which is why pairing works the same whatever the brand.
 * The packet is variable length and the first byte decides the shape of the rest, so the
 * reading cannot be taken from a fixed offset:
 *
 *   byte 0   flags
 *            bit 0   0 = the rate is one byte, 1 = two bytes little-endian
 *            bit 1-2 sensor contact: 0 or 1 = the sensor cannot tell,
 *                    2 = supported and NOT in contact, 3 = supported and in contact
 *            bit 3   energy expended follows the rate (two bytes, kilojoules)
 *            bit 4   RR intervals follow (two bytes each, units of 1/1024 s)
 *   byte 1+  the heart rate, then the optional fields in that order
 *
 * The two-byte form exists because the field has to carry rates above 255, which happens
 * with artefacts rather than athletes. Reading it as one byte would silently halve a
 * reading, so the flag is honoured rather than assumed.
 *
 * Kept free of react-native-ble-plx so it can be tested without a radio: the library hands
 * over a base64 string, and that is all this needs.
 */

/** The standard 16-bit UUIDs, expanded to the 128-bit form the BLE library expects. */
export const HEART_RATE_SERVICE = '0000180d-0000-1000-8000-00805f9b34fb';
export const HEART_RATE_MEASUREMENT = '00002a37-0000-1000-8000-00805f9b34fb';

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/**
 * base64 to bytes.
 *
 * atob exists in current React Native, but not in every JS runtime this file might be
 * tested or bundled in, so there is a fallback rather than a crash on an older engine.
 */
export function base64ToBytes(input) {
  if (typeof input !== 'string' || input.length === 0) return new Uint8Array(0);

  if (typeof atob === 'function') {
    try {
      const binary = atob(input);
      const out = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
      return out;
    } catch {
      return new Uint8Array(0);
    }
  }

  const clean = input.replace(/[^A-Za-z0-9+/]/g, '');
  const out = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let bits = 0;
  let acc = 0;
  let n = 0;
  for (const ch of clean) {
    const value = B64.indexOf(ch);
    if (value < 0) continue;
    acc = (acc << 6) | value;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[n] = (acc >> bits) & 0xff;
      n += 1;
    }
  }
  return out.subarray(0, n);
}

/**
 * Reads one measurement packet.
 *
 * Returns null for anything it cannot read rather than a zero, because a zero would flow
 * into the run's average as though the runner's heart had stopped. A sensor reporting that
 * it has lost skin contact also returns null: the number it sends in that state is stale.
 *
 * Accepts the base64 string the BLE library provides, or raw bytes for testing.
 */
export function parseHeartRateMeasurement(payload) {
  const bytes = payload instanceof Uint8Array ? payload : base64ToBytes(payload);
  if (bytes.length < 2) return null;

  const flags = bytes[0];
  const isUint16 = (flags & 0x01) !== 0;
  const contactBits = (flags & 0x06) >> 1;
  const hasEnergy = (flags & 0x08) !== 0;
  const hasRr = (flags & 0x10) !== 0;

  let i = 1;
  let bpm;
  if (isUint16) {
    if (bytes.length < 3) return null;
    bpm = bytes[1] | (bytes[2] << 8);
    i = 3;
  } else {
    bpm = bytes[1];
    i = 2;
  }

  // 0 means no reading. The upper bound is a sanity check: the field can carry more, but a
  // human cannot, and letting an artefact through would distort the run's maximum.
  if (!Number.isFinite(bpm) || bpm <= 0 || bpm > 300) return null;

  // 2 is the one value that positively means "supported, and not touching skin". 0 and 1
  // both mean the sensor does not report contact at all, which is not the same as bad data.
  const contactDetected = contactBits === 3 ? true : contactBits === 2 ? false : null;
  if (contactDetected === false) return null;

  let energyExpendedKJ = null;
  if (hasEnergy && bytes.length >= i + 2) {
    energyExpendedKJ = bytes[i] | (bytes[i + 1] << 8);
    i += 2;
  }

  const rrIntervalsMs = [];
  if (hasRr) {
    for (; i + 1 < bytes.length; i += 2) {
      // Sent in units of 1/1024 s, not milliseconds.
      rrIntervalsMs.push(Math.round(((bytes[i] | (bytes[i + 1] << 8)) * 1000) / 1024));
    }
  }

  return { bpm, contactDetected, energyExpendedKJ, rrIntervalsMs };
}

/**
 * Running summary of a run's heart rate, for the average and maximum the runs table stores.
 *
 * A plain mean over every packet would be weighted by how often the sensor happened to
 * report, which varies between devices and drops during interference. Averaging per whole
 * second instead makes the figure mean the same thing whatever sensor produced it.
 */
export const STORABLE_BPM_MIN = 20;
export const STORABLE_BPM_MAX = 260;

export function createHeartRateTrack() {
  const perSecond = new Map();
  return {
    add(bpm, at = Date.now()) {
      // The server accepts 20-260 for avgHeartRate and maxHeartRate and rejects the whole
      // run otherwise, so a single artefact outside that range would cost the runner their
      // entire run rather than one reading. The parser is deliberately looser — a brief
      // spike is fine to display — but nothing out of range reaches the saved record.
      if (!Number.isFinite(bpm) || bpm < STORABLE_BPM_MIN || bpm > STORABLE_BPM_MAX) return;
      const second = Math.floor(at / 1000);
      const slot = perSecond.get(second);
      if (slot) {
        slot.total += bpm;
        slot.count += 1;
      } else {
        perSecond.set(second, { total: bpm, count: 1 });
      }
    },
    get sampleCount() {
      return perSecond.size;
    },
    summary() {
      if (perSecond.size === 0) return { avgHeartRate: null, maxHeartRate: null };
      let sum = 0;
      let max = 0;
      for (const { total, count } of perSecond.values()) {
        const mean = total / count;
        sum += mean;
        if (mean > max) max = mean;
      }
      return {
        avgHeartRate: Math.round(sum / perSecond.size),
        maxHeartRate: Math.round(max),
      };
    },
  };
}
