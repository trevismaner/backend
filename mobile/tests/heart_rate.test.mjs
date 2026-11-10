/**
 * The Bluetooth heart rate packet decoder, and the per-run summary built from it.
 *
 * These matter more than they look. The packet is variable length and its first byte
 * decides the layout, so every wrong assumption here produces a plausible-looking number
 * rather than an error: reading a two-byte rate as one byte halves it, and treating a
 * "lost skin contact" packet as valid feeds a stale reading into the run's average.
 *
 * The radio itself cannot be tested without hardware. This covers everything downstream
 * of it, which is where the arithmetic lives.
 *
 *   node tests/heart_rate.test.mjs
 */
import {
  parseHeartRateMeasurement,
  base64ToBytes,
  createHeartRateTrack,
  STORABLE_BPM_MIN,
  STORABLE_BPM_MAX,
  HEART_RATE_SERVICE,
  HEART_RATE_MEASUREMENT,
} from '../src/utils/heartRate.js';

let pass = 0;
let fail = 0;
const ok = (name, condition, detail = '') => {
  if (condition) {
    pass += 1;
    console.log(`  \u001b[32mok\u001b[0m    ${name}${detail ? `  ${detail}` : ''}`);
  } else {
    fail += 1;
    console.log(`  \u001b[31mFAIL\u001b[0m  ${name}  ${detail}`);
  }
};
const b64 = (...bytes) => Buffer.from(bytes).toString('base64');

console.log('\n━━━ 1. THE PACKET LAYOUT ━━━');
{
  // flags 0x00: one-byte rate, no optional fields. The commonest packet there is.
  let m = parseHeartRateMeasurement(b64(0x00, 72));
  ok('a plain one-byte reading', m?.bpm === 72, `bpm=${m?.bpm}`);

  // flags 0x01: two-byte rate, little-endian. Reading byte 1 alone would give 44.
  m = parseHeartRateMeasurement(b64(0x01, 0x2c, 0x01));
  ok('a two-byte reading is little-endian, not truncated', m?.bpm === 300, `bpm=${m?.bpm}`);

  m = parseHeartRateMeasurement(b64(0x01, 72, 0x00));
  ok('a two-byte reading with a high byte of zero', m?.bpm === 72, `bpm=${m?.bpm}`);

  // flags 0x08: energy expended follows the rate.
  m = parseHeartRateMeasurement(b64(0x08, 80, 0x64, 0x00));
  ok('energy expended is read when present', m?.bpm === 80 && m?.energyExpendedKJ === 100,
    `bpm=${m?.bpm} kJ=${m?.energyExpendedKJ}`);

  // flags 0x10: RR intervals, in units of 1/1024 s. 0x0400 = 1024 = exactly one second.
  m = parseHeartRateMeasurement(b64(0x10, 60, 0x00, 0x04));
  ok('an RR interval converts from 1/1024 s to ms', m?.rrIntervalsMs[0] === 1000,
    `${m?.rrIntervalsMs}`);

  m = parseHeartRateMeasurement(b64(0x10, 60, 0x00, 0x04, 0x00, 0x02));
  ok('several RR intervals in one packet', m?.rrIntervalsMs.join(',') === '1000,500',
    `${m?.rrIntervalsMs}`);

  // flags 0x19 = 0b11001: two-byte rate AND energy AND RR, all at once. This is the case
  // that punishes fixed offsets — the RR data starts at byte 5, not byte 2.
  m = parseHeartRateMeasurement(b64(0x19, 0x8c, 0x00, 0xc8, 0x00, 0x00, 0x04));
  ok('every optional field together, offsets still correct',
    m?.bpm === 140 && m?.energyExpendedKJ === 200 && m?.rrIntervalsMs[0] === 1000,
    `bpm=${m?.bpm} kJ=${m?.energyExpendedKJ} rr=${m?.rrIntervalsMs}`);
}

console.log('\n━━━ 2. SENSOR CONTACT ━━━');
{
  // Only the value 2 positively means "supported, and not on skin". 0 and 1 both mean the
  // sensor does not report contact, which must not be mistaken for bad data.
  let m = parseHeartRateMeasurement(b64(0x06, 80));   // bits = 3: supported, in contact
  ok('contact detected is reported and the reading kept', m?.bpm === 80 && m?.contactDetected === true);

  m = parseHeartRateMeasurement(b64(0x04, 80));       // bits = 2: supported, NOT in contact
  ok('a strap off the skin returns no reading, not a stale one', m === null, String(m));

  m = parseHeartRateMeasurement(b64(0x00, 80));       // bits = 0: not supported
  ok('a sensor that cannot report contact is still trusted',
    m?.bpm === 80 && m?.contactDetected === null, `contact=${m?.contactDetected}`);

  m = parseHeartRateMeasurement(b64(0x02, 80));       // bits = 1: also "not supported"
  ok('the second not-supported encoding is treated the same',
    m?.bpm === 80 && m?.contactDetected === null, `contact=${m?.contactDetected}`);
}

console.log('\n━━━ 3. RUBBISH IN ━━━');
{
  const cases = [
    ['zero bpm', b64(0x00, 0)],
    ['an impossible 301 bpm', b64(0x01, 0x2d, 0x01)],
    ['a one-byte packet', b64(0x00)],
    ['an empty packet', b64()],
    ['a truncated two-byte rate', b64(0x01, 0x48)],
    ['an empty string', ''],
    ['null', null],
    ['undefined', undefined],
    ['a number', 12345],
    ['not base64 at all', '!!!not base64!!!'],
  ];
  for (const [label, input] of cases) {
    let result;
    let threw = false;
    try { result = parseHeartRateMeasurement(input); } catch { threw = true; }
    ok(`${label} returns null without throwing`, !threw && result === null,
      threw ? 'THREW' : JSON.stringify(result));
  }

  // A truncated energy field must not invent a value or derail the reading.
  const m = parseHeartRateMeasurement(b64(0x08, 70, 0x64));
  ok('a truncated energy field leaves the rate usable',
    m?.bpm === 70 && m?.energyExpendedKJ === null, JSON.stringify(m));
}

console.log('\n━━━ 4. BASE64 DECODING ━━━');
{
  const bytes = base64ToBytes(b64(0x00, 0x48, 0xff));
  ok('round-trips bytes', bytes.length === 3 && bytes[1] === 0x48 && bytes[2] === 0xff,
    `[${Array.from(bytes)}]`);
  ok('an empty string gives no bytes', base64ToBytes('').length === 0);
  ok('a non-string gives no bytes', base64ToBytes(null).length === 0);
  ok('raw bytes pass straight through',
    parseHeartRateMeasurement(new Uint8Array([0x00, 99]))?.bpm === 99);
}

console.log('\n━━━ 5. THE RUN SUMMARY ━━━');
{
  let track = createHeartRateTrack();
  ok('an empty track has no average', track.summary().avgHeartRate === null);
  ok('an empty track has no maximum', track.summary().maxHeartRate === null);

  // Sensors report at different and uneven rates. Averaging per second rather than per
  // packet keeps the figure comparable between a strap sending once a second and one
  // sending four times a second.
  track = createHeartRateTrack();
  const t0 = 1_700_000_000_000;
  track.add(100, t0);
  track.add(200, t0 + 100);      // same second as above, so these two average to 150
  track.add(150, t0 + 1000);     // the next second
  ok('readings inside one second are averaged, not counted twice',
    track.summary().avgHeartRate === 150, JSON.stringify(track.summary()));
  ok('two seconds of data are two samples', track.sampleCount === 2, String(track.sampleCount));

  // A burst of high readings in a single second must not become the run's maximum on its own.
  track = createHeartRateTrack();
  track.add(120, t0);
  track.add(180, t0 + 10);
  track.add(120, t0 + 20);       // this second averages to 140
  track.add(130, t0 + 1000);
  ok('the maximum is the highest second, not the highest packet',
    track.summary().maxHeartRate === 140, JSON.stringify(track.summary()));

  track = createHeartRateTrack();
  for (const bad of [0, -5, NaN, null, undefined, 'abc']) track.add(bad, t0);
  ok('unusable readings are ignored entirely', track.sampleCount === 0, String(track.sampleCount));

  // The server rejects a run outright if avgHeartRate or maxHeartRate falls outside 20-260,
  // so one artefact reaching the summary would cost the runner the whole run, not one reading.
  track = createHeartRateTrack();
  track.add(140, t0);
  track.add(280, t0 + 1000);     // above what the run record accepts
  track.add(5, t0 + 2000);       // below it
  const guarded = track.summary();
  ok('a reading the server would reject never reaches the summary',
    track.sampleCount === 1 && guarded.maxHeartRate === 140, JSON.stringify(guarded));
  ok('the summary always sits inside the storable range',
    guarded.maxHeartRate <= STORABLE_BPM_MAX && guarded.avgHeartRate >= STORABLE_BPM_MIN,
    JSON.stringify(guarded));
  ok('the exact bounds are accepted', (() => {
    const t = createHeartRateTrack();
    t.add(STORABLE_BPM_MIN, t0); t.add(STORABLE_BPM_MAX, t0 + 1000);
    return t.sampleCount === 2;
  })());

  track = createHeartRateTrack();
  track.add(142, t0);
  const s = track.summary();
  ok('a single reading gives a whole-number average and maximum',
    s.avgHeartRate === 142 && s.maxHeartRate === 142, JSON.stringify(s));

  // What the run screen actually sends: these two columns already exist on the runs table.
  track = createHeartRateTrack();
  [128, 134, 141, 149, 155, 152, 147].forEach((bpm, i) => track.add(bpm, t0 + i * 1000));
  const run = track.summary();
  ok('a realistic run summarises to sane integers',
    run.avgHeartRate === 144 && run.maxHeartRate === 155, JSON.stringify(run));
}

console.log('\n━━━ 6. THE STANDARD UUIDS ━━━');
{
  ok('the heart rate service UUID is the standard 0x180D',
    HEART_RATE_SERVICE === '0000180d-0000-1000-8000-00805f9b34fb');
  ok('the measurement characteristic UUID is the standard 0x2A37',
    HEART_RATE_MEASUREMENT === '00002a37-0000-1000-8000-00805f9b34fb');
}

console.log(`\n${'─'.repeat(64)}`);
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
