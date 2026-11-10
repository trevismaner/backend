/**
 * The GPS route pipeline, the map framing, and the share card's geometry.
 *
 *   npm run test:route
 *
 * These cover three faults reported from a real phone:
 *
 *   1. "The path goes wonky and goes back and forth when I background the app."
 *      Three causes, all reproduced below. The biggest was that the foreground watcher and
 *      the background task BOTH record for the whole run, and the old code appended the
 *      task's buffer onto the end of the watcher's route every 20 s — so the line ran
 *      forward, jumped back twenty seconds, and ran forward again. Nothing filtered on
 *      accuracy either, so wifi and cell fixes hundreds of metres out were drawn as
 *      positions. And distance was accumulated as it arrived, so a bad fix stayed in the
 *      total for ever.
 *
 *   2. "When I finish, it only shows the starting point of my run."
 *      The details screen centred on the first point with a fixed 0.01-degree span, about
 *      1.1 km, and disabled panning and zooming.
 *
 *   3. "Sharing only shares the text."
 *      There was no image at all. These check the geometry the card is drawn from.
 *
 * Section 11 covers the live pace on the run screen, which is a feature rather than a fault.
 * It is here because the figure is derived from the same route and the same distance
 * measurement as everything above, and because the cases worth pinning down are the ones
 * where there is no pace to report: standing still, signal lost, and the first few seconds.
 *
 * Needs no device, no map key, no server and no database: every function under test is pure.
 */
import {
  mergePoints,
  routeDistanceKm,
  regionForCoordinates,
  toPoint,
  isAccurateEnough,
  metresBetween,
  MAX_ACCURACY_M,
  rollingPaceSecondsPerKm,
  PACE_STALE_AFTER_MS,
} from '../src/utils/routeTrack.js';
import { projectRoute, toSvgPath, paceLabel, formatPace, shareMessage } from '../src/utils/routeShare.js';
import { distanceBetween, thinRoute } from '../src/utils/geo.js';

let passed = 0;
const failures = [];
const ok = (label, cond, detail = '') => {
  if (cond) { passed += 1; console.log(`  ok   ${label}`); }
  else { failures.push(label); console.log(`  FAIL ${label}${detail ? `\n       ${detail}` : ''}`); }
};
const near = (a, b, tolerance) => Math.abs(a - b) <= tolerance;

// Wollongong, where the app is being used.
const LAT = -34.4060;
const LON = 150.8780;
const T0 = 1760000000000;
const M_LAT = 1 / 111320;
const M_LON = 1 / (111320 * Math.cos((LAT * Math.PI) / 180));

/** How the old code measured a route: add every segment as it arrives. */
function accumulatedDistanceKm(points) {
  let km = 0;
  for (let i = 1; i < points.length; i += 1) km += distanceBetween(points[i - 1], points[i]);
  return km;
}

/** The largest single step in a drawn line — a zig-zag shows up here as a huge number. */
function biggestJumpM(points) {
  let worst = 0;
  for (let i = 1; i < points.length; i += 1) worst = Math.max(worst, metresBetween(points[i - 1], points[i]));
  return worst;
}

/** A straight run north: `count` fixes, `stepM` apart, one every 3 seconds. */
function straightRun({ count = 112, stepM = 9, accuracy = 5, speed = 3 } = {}) {
  return Array.from({ length: count }, (_, i) => ({
    latitude: LAT + i * stepM * M_LAT,
    longitude: LON,
    timestamp: T0 + i * 3000,
    accuracy,
    speed,
  }));
}

console.log('\n━━━ 1. THE SAME STRETCH RECORDED BY BOTH SOURCES ━━━');
{
  const watcher = straightRun();
  const truth = routeDistanceKm(watcher);

  // The background task buffered the same twenty seconds the watcher already had, and the
  // checkpoint appended it. This is the exact shape of the reported bug.
  const asOldCodeSawIt = [...watcher, ...watcher.slice(40, 47)];

  ok('the old behaviour inflates the distance',
    accumulatedDistanceKm(asOldCodeSawIt) > truth * 1.3,
    `old ${accumulatedDistanceKm(asOldCodeSawIt).toFixed(3)} km vs ${truth.toFixed(3)} km`);
  ok('the old behaviour puts a huge backwards jump in the line',
    biggestJumpM(asOldCodeSawIt) > 200,
    `biggest jump ${biggestJumpM(asOldCodeSawIt).toFixed(0)} m`);

  const merged = mergePoints([], asOldCodeSawIt);
  ok('merging the same input removes the duplicates',
    merged.length === watcher.length, `kept ${merged.length} of ${watcher.length}`);

  // The harder, more realistic version: the two sources are separate subscriptions, so the
  // same stretch comes back with timestamps a fraction of a second apart rather than
  // identical. Sorting alone cannot collapse those — they are distinct moments — and without
  // the duplicate rule each near-copy adds its own small wobble to the distance.
  const nearDuplicates = [
    ...watcher,
    ...watcher.slice(40, 47).map((p) => ({
      ...p,
      timestamp: p.timestamp + 120,
      latitude: p.latitude + 0.6 * M_LAT,   // a sub-metre disagreement between the two fixes
    })),
  ];
  const mergedNear = mergePoints([], nearDuplicates);
  ok('near-duplicate fixes from the two sources collapse too',
    mergedNear.length === watcher.length,
    `kept ${mergedNear.length} of ${watcher.length}`);
  ok('and they do not add distance',
    near(routeDistanceKm(mergedNear), truth, 0.001),
    `${routeDistanceKm(mergedNear).toFixed(4)} vs ${truth.toFixed(4)}`);
  ok('and restores the true distance',
    near(routeDistanceKm(merged), truth, 0.001),
    `${routeDistanceKm(merged).toFixed(3)} vs ${truth.toFixed(3)}`);
  ok('and the line has no jump bigger than one stride',
    biggestJumpM(merged) < 15, `biggest jump ${biggestJumpM(merged).toFixed(0)} m`);
}

console.log('\n━━━ 2. THE MERGE DOES NOT CARE HOW POINTS ARRIVE ━━━');
{
  const run = straightRun({ count: 60 });
  const inOrder = routeDistanceKm(mergePoints([], run));

  const shuffled = [...run].sort(() => Math.random() - 0.5);
  ok('a shuffled delivery gives the same distance',
    near(routeDistanceKm(mergePoints([], shuffled)), inOrder, 0.0001));

  let chunked = [];
  for (let i = 0; i < run.length; i += 7) chunked = mergePoints(chunked, run.slice(i, i + 7));
  ok('arriving in chunks gives the same distance',
    near(routeDistanceKm(chunked), inOrder, 0.0001));
  ok('arriving in chunks gives the same points', chunked.length === mergePoints([], run).length);

  ok('merging the same batch twice changes nothing',
    routeDistanceKm(mergePoints(mergePoints([], run), run)) === inOrder);

  // Overlapping batches are what the drain actually produces.
  const overlapping = mergePoints(mergePoints([], run.slice(0, 40)), run.slice(30));
  ok('overlapping batches do not double-count',
    near(routeDistanceKm(overlapping), inOrder, 0.0001),
    `${routeDistanceKm(overlapping).toFixed(4)} vs ${inOrder.toFixed(4)}`);
}

console.log('\n━━━ 3. FIXES THAT ARE NOT POSITIONS ━━━');
{
  const run = straightRun();
  const truth = routeDistanceKm(run);

  // The wifi/cell fallback the OS uses when the phone is pocketed: far away, and honest
  // about it in the accuracy field.
  //
  // The TIME GAP here is the whole point of the case, and getting it wrong made an earlier
  // version of this test prove nothing. A bad fix one second after the last good one implies
  // a speed of about 1 100 m/s, so the teleport gate catches it and the accuracy gate is
  // never reached — removing accuracy filtering altogether still passed. The case that
  // actually needs accuracy is the one the bug report describes: the app is backgrounded for
  // two minutes, the GPS sleeps, and the fix that arrives is 800 m away with a 1 200 m
  // radius. Over 120 seconds that is 6.7 m/s — a plausible cycling speed, well under the
  // gate. Only the accuracy field can reject it.
  const gapSeconds = 120;
  const withWifiFix = [
    ...run.slice(0, 50),
    {
      latitude: LAT + 50 * 9 * M_LAT + 800 * M_LAT,
      longitude: LON + 100 * M_LON,
      timestamp: T0 + 50 * 3000 + gapSeconds * 1000,
      accuracy: 1200,
      speed: 3,
    },
    ...run.slice(50).map((p) => ({ ...p, timestamp: p.timestamp + gapSeconds * 1000 })),
  ];
  const impliedSpeed = metresBetween(run[49], withWifiFix[50]) / gapSeconds;
  ok('the bad fix is slow enough to pass the teleport gate',
    impliedSpeed < 25, `implied ${impliedSpeed.toFixed(1)} m/s — so only accuracy can reject it`);
  ok('a low-accuracy fix wrecks the old measurement',
    accumulatedDistanceKm(withWifiFix) > truth * 1.5,
    `old ${accumulatedDistanceKm(withWifiFix).toFixed(3)} km vs ${truth.toFixed(3)} km`);
  ok('and is filtered out by accuracy',
    near(routeDistanceKm(mergePoints([], withWifiFix)), truth, 0.02),
    `${routeDistanceKm(mergePoints([], withWifiFix)).toFixed(3)} vs ${truth.toFixed(3)}`);

  // The nastier kind: a glitch that reports good accuracy while being 2 km away.
  const withTeleport = [...run];
  withTeleport.splice(70, 0, {
    latitude: LAT + 0.02, longitude: LON + 0.02,
    timestamp: T0 + 70 * 3000 + 1200, accuracy: 8, speed: 3,
  });
  ok('a plausible-looking teleport wrecks the old measurement',
    accumulatedDistanceKm(withTeleport) > truth * 4);
  ok('and is filtered out by speed, which accuracy alone would miss',
    near(routeDistanceKm(mergePoints([], withTeleport)), truth, 0.001),
    `${routeDistanceKm(mergePoints([], withTeleport)).toFixed(3)} vs ${truth.toFixed(3)}`);

  ok(`accuracy exactly ${MAX_ACCURACY_M} m is kept`,
    isAccurateEnough({ latitude: LAT, longitude: LON, accuracy: MAX_ACCURACY_M }));
  ok(`accuracy just over ${MAX_ACCURACY_M} m is dropped`,
    !isAccurateEnough({ latitude: LAT, longitude: LON, accuracy: MAX_ACCURACY_M + 0.1 }));
  ok('a missing accuracy field is NOT treated as inaccurate',
    isAccurateEnough({ latitude: LAT, longitude: LON }),
    'imported and hand-entered routes have no accuracy and must survive');

  ok('nonsense coordinates are dropped',
    mergePoints([], [
      { latitude: LAT, longitude: LON, timestamp: T0 },
      { latitude: NaN, longitude: LON, timestamp: T0 + 3000 },
      { latitude: 999, longitude: LON, timestamp: T0 + 6000 },
      null,
      undefined,
    ]).length === 1);
}

console.log('\n━━━ 4. ONE BAD FIX NO LONGER POISONS THE TOTAL ━━━');
{
  // The point of measuring rather than accumulating: filtering a bad fix must be able to
  // take its distance back out, which an accumulated total can never do.
  const run = straightRun({ count: 40 });
  const bad = { latitude: LAT + 0.02, longitude: LON + 0.02, timestamp: T0 + 20 * 3000 + 500, accuracy: 9, speed: 3 };
  const polluted = mergePoints([], [...run.slice(0, 20), bad, ...run.slice(20)]);
  ok('a route containing a teleport measures the same as one without it',
    near(routeDistanceKm(polluted), routeDistanceKm(mergePoints([], run)), 0.001));
}

console.log('\n━━━ 5. STANDING STILL ━━━');
{
  // Four minutes at traffic lights. Good accuracy, position wanders, speed reads ~0.
  const makeStop = (withSpeed) => Array.from({ length: 80 }, (_, i) => ({
    latitude: LAT + Math.sin(i * 2.3) * 3 * M_LAT,
    longitude: LON + Math.cos(i * 1.7) * 3 * M_LON,
    timestamp: T0 + i * 3000,
    accuracy: 6,
    ...(withSpeed ? { speed: 0.05 + (i % 3) * 0.05 } : {}),
  }));

  ok('the old behaviour invents distance while standing still',
    accumulatedDistanceKm(makeStop(false)) > 0.3,
    `${accumulatedDistanceKm(makeStop(false)).toFixed(3)} km from standing still`);
  ok('with speed readings, a stop adds nothing',
    routeDistanceKm(mergePoints([], makeStop(true))) === 0,
    `${routeDistanceKm(mergePoints([], makeStop(true))).toFixed(3)} km`);
  ok('without speed readings the noise floor still helps, but does not fix it',
    routeDistanceKm(mergePoints([], makeStop(false))) < accumulatedDistanceKm(makeStop(false)),
    'documented limitation, not a passing fiction');

  // The stop must not eat the run around it.
  const withStop = [];
  let lat = LAT;
  let t = T0;
  for (let i = 0; i < 60; i += 1) { lat += 9 * M_LAT; t += 3000; withStop.push({ latitude: lat, longitude: LON, timestamp: t, accuracy: 5, speed: 3 }); }
  for (let i = 0; i < 40; i += 1) { t += 3000; withStop.push({ latitude: lat + Math.sin(i * 2.1) * 3 * M_LAT, longitude: LON + Math.cos(i * 1.3) * 3 * M_LON, timestamp: t, accuracy: 6, speed: 0.1 }); }
  for (let i = 0; i < 60; i += 1) { lat += 9 * M_LAT; t += 3000; withStop.push({ latitude: lat, longitude: LON, timestamp: t, accuracy: 5, speed: 3 }); }
  const measured = routeDistanceKm(mergePoints([], withStop));
  ok('a run with a stop in the middle still measures the running part',
    near(measured, 1.07, 0.03), `${measured.toFixed(3)} km, expected about 1.07`);

  // Walking is slow but is not standing still.
  const walk = Array.from({ length: 100 }, (_, i) => ({
    latitude: LAT + i * 4.2 * M_LAT, longitude: LON, timestamp: T0 + i * 3000, accuracy: 8, speed: 1.4,
  }));
  ok('a slow walk is not mistaken for standing still',
    near(routeDistanceKm(mergePoints([], walk)), 0.4158, 0.002),
    `${routeDistanceKm(mergePoints([], walk)).toFixed(4)} km`);
}

console.log('\n━━━ 6. THE SHAPE OF A POINT ━━━');
{
  const fix = {
    coords: { latitude: LAT, longitude: LON, accuracy: 7, speed: 2.9 },
    timestamp: T0,
  };
  const point = toPoint(fix);
  ok('a location object becomes a flat point', point.latitude === LAT && point.longitude === LON);
  ok('accuracy is carried through', point.accuracy === 7,
    'without it nothing can tell a 5 m fix from a 1200 m one — the original bug');
  ok('speed is carried through', point.speed === 2.9);
  ok('a negative speed is treated as no reading',
    toPoint({ coords: { latitude: LAT, longitude: LON, speed: -1 } }).speed === undefined);
  ok('an already-flat point passes through', toPoint({ latitude: LAT, longitude: LON }).latitude === LAT);
  ok('rubbish gives null', toPoint(null) === null && toPoint({}) === null);
}

console.log('\n━━━ 7. FRAMING THE WHOLE ROUTE (the "only the start point" fault) ━━━');
{
  const run = straightRun({ count: 112, stepM: 9 }); // about 1 km north
  const span = run[run.length - 1].latitude - run[0].latitude;

  const region = regionForCoordinates(run);
  ok('the old fixed 0.01 span was too small even for a 1 km run', span > 0.008,
    `the run spans ${span.toFixed(5)} degrees; the hardcoded delta was 0.01 with the start at the centre`);
  ok('the computed region covers the whole route', region.latitudeDelta > span,
    `delta ${region.latitudeDelta.toFixed(5)} vs span ${span.toFixed(5)}`);
  ok('the region is centred on the route, not on its first point',
    near(region.latitude, (run[0].latitude + run[run.length - 1].latitude) / 2, 1e-9));
  ok('there is a margin around the line', region.latitudeDelta > span * 1.1);

  // A 10 km run is where the old frame failed worst.
  const long = straightRun({ count: 1000, stepM: 10 });
  const longSpan = long[long.length - 1].latitude - long[0].latitude;
  ok('a 10 km run is framed too', regionForCoordinates(long).latitudeDelta > longSpan,
    `needs ${longSpan.toFixed(4)} degrees; the old frame showed 0.01`);

  ok('a single point gets a usable zoom, not an infinite one',
    regionForCoordinates([{ latitude: LAT, longitude: LON }]).latitudeDelta >= 0.002);
  ok('an empty route gives null rather than NaN', regionForCoordinates([]) === null);
  ok('a route of only bad points gives null',
    regionForCoordinates([{ latitude: NaN, longitude: 1 }, null]) === null);
}

console.log('\n━━━ 8. THE SHARE CARD GEOMETRY ━━━');
{
  // A 400 m square lap. It has to be DRAWN square: a degree of longitude is shorter than a
  // degree of latitude away from the equator, so scaling both by degrees leans the shape.
  const square = [];
  for (let i = 0; i <= 40; i += 1) square.push({ latitude: LAT, longitude: LON + i * 10 * M_LON });
  for (let i = 0; i <= 40; i += 1) square.push({ latitude: LAT + i * 10 * M_LAT, longitude: LON + 400 * M_LON });
  for (let i = 0; i <= 40; i += 1) square.push({ latitude: LAT + 400 * M_LAT, longitude: LON + (400 - i * 10) * M_LON });
  for (let i = 0; i <= 40; i += 1) square.push({ latitude: LAT + (400 - i * 10) * M_LAT, longitude: LON });

  const projected = projectRoute(square, { width: 360, height: 340, padding: 30 });
  const xs = projected.points.map((p) => p.x);
  const ys = projected.points.map((p) => p.y);
  const drawnW = Math.max(...xs) - Math.min(...xs);
  const drawnH = Math.max(...ys) - Math.min(...ys);

  ok('a square lap is drawn square', near(drawnW, drawnH, 1),
    `drawn ${drawnW.toFixed(1)} x ${drawnH.toFixed(1)} px`);
  // Without the cosine correction it would be stretched by this much at this latitude.
  const stretch = (400 * M_LON) / (400 * M_LAT);
  ok('which it would not be without the longitude correction', stretch > 1.15,
    `scaling by raw degrees would stretch it ${stretch.toFixed(2)}x east-west`);

  const northmost = square.reduce((a, b) => (b.latitude > a.latitude ? b : a));
  ok('north is up', near(projected.points[square.indexOf(northmost)].y, Math.min(...ys), 0.01));
  ok('the route stays inside its padding',
    Math.min(...xs) >= 29.99 && Math.max(...xs) <= 330.01 &&
    Math.min(...ys) >= 29.99 && Math.max(...ys) <= 310.01);

  // The card puts the run's name across the top, so the route is pushed below it.
  const withHeader = projectRoute(square, { width: 360, height: 340, padding: 30, paddingTop: 76 });
  ok('a larger top padding keeps the route clear of the name overlay',
    Math.min(...withHeader.points.map((p) => p.y)) >= 75.99,
    `topmost y ${Math.min(...withHeader.points.map((p) => p.y)).toFixed(1)}`);

  ok('an empty route projects to nothing rather than throwing',
    projectRoute([]).points.length === 0);
  ok('a single point is centred rather than dividing by zero',
    projectRoute([{ latitude: LAT, longitude: LON }], { width: 360, height: 340 }).points.length === 1);
  ok('a dead-straight route does not divide by zero',
    projectRoute([{ latitude: LAT, longitude: LON }, { latitude: LAT, longitude: LON + 0.01 }],
      { width: 360, height: 340 }).points.length === 2);

  const path = toSvgPath(projectRoute(square.slice(0, 3), { width: 360, height: 340 }).points);
  ok('the svg path starts with a move and continues with lines',
    path.startsWith('M') && (path.match(/L/g) || []).length === 2, path);
  ok('an empty route gives an empty path', toSvgPath([]) === '');
}

console.log('\n━━━ 9. WHAT THE SHARE SAYS ━━━');
{
  ok('pace is minutes and seconds per km', paceLabel(5.2, 1560) === '5:00');
  ok('seconds are zero-padded', paceLabel(10, 3605) === '6:00' || paceLabel(4, 1000) === '4:10');
  ok('a zero distance has no pace', paceLabel(0, 1560) === null);
  ok('a zero duration has no pace', paceLabel(5, 0) === null);
  ok('rubbish has no pace', paceLabel('x', null) === null);

  const message = shareMessage({ name: 'Evening 5k', distanceKm: 5.2, durationSeconds: 1560 });
  ok('the message carries the distance', message.includes('5.20 km'));
  ok('the message carries the pace', message.includes('5:00 /km'),
    'the old message had distance only — no pace, no time, no date');
  ok('the message carries the run name', message.includes('Evening 5k'));
  ok('a run with no name still produces a message',
    shareMessage({ distanceKm: 3, durationSeconds: 900 }).includes('3.00 km'));
  ok('a run with nothing recorded does not produce "NaN km"',
    !/NaN/.test(shareMessage({})), shareMessage({}));
}

console.log('\n━━━ 10. THINNING STILL AGREES WITH THE MEASUREMENT ━━━');
{
  // The route is thinned before it is sent to the server. The drawn line must stay the same
  // shape, and the distance must not move much — this is why the recovered run trusts the
  // stored figure rather than re-measuring the thinned copy.
  const run = straightRun({ count: 600, stepM: 9 });
  const full = routeDistanceKm(mergePoints([], run));
  const thinned = routeDistanceKm(mergePoints([], thinRoute(run, { minMetres: 10 })));
  ok('thinning keeps the distance within 2%',
    Math.abs(thinned - full) / full < 0.02,
    `full ${full.toFixed(3)} km, thinned ${thinned.toFixed(3)} km`);
  ok('thinning actually removes points', thinRoute(run, { minMetres: 10 }).length < run.length);
}


console.log('\n━━━ 11. LIVE PACE ━━━');
{
  // straightRun steps 9 m every 3 s, which is 3 m/s, or 5:33 per kilometre.
  const endOf = (run) => run[run.length - 1].timestamp;

  // Checked against the true figure with a tolerance rather than an exact mm:ss string: the
  // fixture's 1/111320-degree step is not exactly 9 m at this latitude, so the run is a shade
  // slower than 333.3 s/km and an exact assertion would be testing the fixture's geodesy.
  const steady = straightRun({ count: 112 });
  const secPerKm = rollingPaceSecondsPerKm(steady, { now: endOf(steady) });
  ok('a steady 3 m/s run reads back as 5:33-5:34 /km',
    near(secPerKm, 1000 / 3, 2),
    `${formatPace(secPerKm)} (${secPerKm?.toFixed(1)} s/km, expected ~${(1000 / 3).toFixed(1)})`);

  // The whole point of a trailing window: it must follow a change of pace rather than
  // converge on the average of the run so far.
  const slow = straightRun({ count: 200, stepM: 6 });            // 2 m/s, 8:20 /km
  const last = slow[slow.length - 1];
  const sprint = Array.from({ length: 15 }, (_, i) => ({
    latitude: last.latitude + (i + 1) * 12 * M_LAT,              // 4 m/s, 4:10 /km
    longitude: LON,
    timestamp: last.timestamp + (i + 1) * 3000,
    accuracy: 5,
    speed: 4,
  }));
  const mixed = [...slow, ...sprint];
  const current = rollingPaceSecondsPerKm(mixed, { now: endOf(mixed) });
  const average = paceLabel(
    routeDistanceKm(mixed),
    (endOf(mixed) - mixed[0].timestamp) / 1000
  );
  const averageSecPerKm = (endOf(mixed) - mixed[0].timestamp) / 1000 / routeDistanceKm(mixed);
  ok('after speeding up, the live pace follows the sprint (~4:10)',
    near(current, 250, 3),
    `live ${formatPace(current)}, expected ~4:10`);
  ok('…while the average for the whole run is still far slower',
    averageSecPerKm - current > 200,
    `average ${average} vs live ${formatPace(current)}`);

  // Standing still must produce no pace at all. Dividing the window by whatever drift
  // survives filtering gives a number that depends on nothing, and showing it as a very slow
  // pace would be worse than showing a dash.
  const stationary = Array.from({ length: 21 }, (_, i) => ({
    latitude: LAT + Math.sin(i) * 2 * M_LAT,
    longitude: LON,
    timestamp: T0 + i * 3000,
    accuracy: 5,
    speed: 0.1,
  }));
  ok('standing still reports no pace rather than a very slow one',
    rollingPaceSecondsPerKm(stationary, { now: endOf(stationary) }) === null,
    String(rollingPaceSecondsPerKm(stationary, { now: endOf(stationary) })));

  // Losing signal must read as unknown, not as unchanged. Without the staleness rule the
  // window is measured against the newest fix, which stops moving, so the last pace would
  // sit on screen for the rest of the run.
  ok('a pace is reported while fixes are arriving',
    rollingPaceSecondsPerKm(steady, { now: endOf(steady) }) !== null);
  ok('no fix for longer than the staleness limit reports no pace',
    rollingPaceSecondsPerKm(steady, { now: endOf(steady) + PACE_STALE_AFTER_MS + 1000 }) === null);
  ok('a gap inside the limit still reports a pace',
    rollingPaceSecondsPerKm(steady, { now: endOf(steady) + PACE_STALE_AFTER_MS - 1000 }) !== null);

  // The opening seconds, where a window holds almost no distance and the naive calculation
  // produces a wild figure.
  const justStarted = straightRun({ count: 3 });                  // 18 m covered
  ok('the first few seconds report no pace, not a wild one',
    rollingPaceSecondsPerKm(justStarted, { now: endOf(justStarted) }) === null,
    String(rollingPaceSecondsPerKm(justStarted, { now: endOf(justStarted) })));
  const warmedUp = straightRun({ count: 6 });                     // 45 m covered
  ok('once enough ground is covered a pace appears',
    near(rollingPaceSecondsPerKm(warmedUp, { now: endOf(warmedUp) }), 1000 / 3, 2),
    formatPace(rollingPaceSecondsPerKm(warmedUp, { now: endOf(warmedUp) })));

  // The pace is derived from routeDistanceKm, so it must agree with the distance shown on
  // the same screen rather than applying its own rules.
  const twoMinutes = straightRun({ count: 41 });                  // 120 s, 360 m
  const windowOnly = straightRun({ count: 16 });                  // the trailing 45 s
  ok('the pace agrees with the distance it is derived from',
    near(
      rollingPaceSecondsPerKm(twoMinutes, { now: endOf(twoMinutes) }),
      45 / routeDistanceKm(windowOnly),
      1
    ),
    `${rollingPaceSecondsPerKm(twoMinutes, { now: endOf(twoMinutes) })?.toFixed(1)} vs ${(45 / routeDistanceKm(windowOnly)).toFixed(1)}`);

  for (const [label, input] of [
    ['no route', null],
    ['an empty route', []],
    ['a single fix', [{ latitude: LAT, longitude: LON, timestamp: T0 }]],
    ['fixes with no timestamps', [{ latitude: LAT, longitude: LON }, { latitude: LAT + 0.001, longitude: LON }]],
  ]) {
    let result, threw = false;
    try { result = rollingPaceSecondsPerKm(input, { now: T0 }); } catch { threw = true; }
    ok(`${label} reports no pace without throwing`, !threw && result === null,
      threw ? 'threw' : String(result));
  }

  // formatPace was split out of paceLabel; saved runs must format exactly as before.
  ok('paceLabel is unchanged for a saved run', paceLabel(5, 1650) === '5:30', paceLabel(5, 1650));
  ok('formatPace pads the seconds', formatPace(365) === '6:05', formatPace(365));
  ok('formatPace refuses a zero', formatPace(0) === null, String(formatPace(0)));
  ok('formatPace refuses nonsense', formatPace(NaN) === null && formatPace(-1) === null);
}

console.log(`\n${'─'.repeat(64)}`);
if (failures.length === 0) console.log(`  ${passed} checks passed, 0 failed`);
else {
  console.log(`  ${passed} passed, ${failures.length} FAILED`);
  for (const f of failures) console.log(`    - ${f}`);
}
console.log(`${'─'.repeat(64)}\n`);
process.exit(failures.length > 0 ? 1 : 0);
