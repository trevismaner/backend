/**
 * The two trained models, and the Node code that serves them.
 *
 *   npm run test:models
 *
 * WHAT IS BEING GUARDED
 * Both models were trained in Python and are evaluated here in JavaScript. That is the risky
 * part: a re-implementation can be wrong in ways that do not look wrong. A forest that routes
 * one sample down the wrong branch still returns a plausible level; a Kalman filter seeded
 * slightly differently still produces a believable fitness score. Nothing crashes, nothing
 * logs, and the model quietly stops being the model that was validated in the notebook.
 *
 * So the standard here is agreement with the original, not plausibility:
 *
 *   - The forest is checked against predictions captured from a REAL scikit-learn
 *     RandomForestClassifier (tests/fixtures/level_classifier_rf.cases.json), including cases
 *     sitting exactly on split thresholds, where an off-by-one comparison shows up.
 *   - The fitness estimate is checked against the notebook's own arithmetic, reproduced in
 *     the test from the numbers its section 9 printed.
 *
 * ABOUT THE FIXTURE MODEL
 * tests/fixtures/level_classifier_rf.fixture.json is a forest trained here on synthetic
 * runners, purely so the evaluator has something real to be checked against. It is NOT the
 * project's model and is not served to anyone — the real one is exported from the notebook to
 * backend/ml/level_classifier_rf.json. What these tests prove is that whatever forest is
 * exported will be evaluated exactly as scikit-learn would evaluate it.
 */
import { readFileSync, existsSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

import { predict, predictProbabilities, validateModel, MODEL_FORMAT, FEATURE_SPEC_VERSION } from '../control/RandomForest.js';
import {
  SETTINGS,
  typicalHeartRate,
  usableRuns,
  estimateOffset,
  displayScore,
  paceAtReference,
  trainingPaces,
  estimateFitness,
} from '../control/FitnessEstimateService.js';
import { classifyFeatures, loadModel, resetModelCache, featuresOutOfRangeFor, DEFAULT_LEVEL } from '../control/LevelService.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE = path.join(HERE, 'fixtures', 'level_classifier_rf.fixture.json');
const CASES = path.join(HERE, 'fixtures', 'level_classifier_rf.cases.json');

let passed = 0;
const failures = [];
const ok = (label, cond, detail = '') => {
  if (cond) { passed += 1; console.log(`  ok   ${label}`); }
  else { failures.push(label); console.log(`  FAIL ${label}${detail ? `\n       ${detail}` : ''}`); }
};
const near = (a, b, tol) => Math.abs(a - b) <= tol;

// ════════════════════════════════════════════════════════════════════
console.log('\n━━━ 1. THE FOREST AGREES WITH SCIKIT-LEARN ━━━');
// ════════════════════════════════════════════════════════════════════
if (!existsSync(FIXTURE) || !existsSync(CASES)) {
  ok('the fixture model and its captured predictions are present', false,
    `expected ${FIXTURE} and ${CASES}`);
} else {
  const model = JSON.parse(readFileSync(FIXTURE, 'utf8'));
  const { classes, cases } = JSON.parse(readFileSync(CASES, 'utf8'));

  ok('the fixture model is well formed', validateModel(model) === null, validateModel(model) ?? '');
  ok('the class order matches scikit-learn exactly',
    JSON.stringify(model.classes) === JSON.stringify(classes),
    'labels and the probability vector must line up or the forest returns the wrong level confidently');

  let labelMismatches = 0;
  let worstProbability = 0;
  for (const c of cases) {
    if (predict(model, c.features).label !== c.expected) labelMismatches += 1;
    const probabilities = predictProbabilities(model, c.features);
    for (let i = 0; i < probabilities.length; i += 1) {
      worstProbability = Math.max(worstProbability, Math.abs(probabilities[i] - c.proba[i]));
    }
  }
  ok(`every one of ${cases.length} predictions matches scikit-learn`, labelMismatches === 0,
    `${labelMismatches} mismatched`);
  // Exactness, not closeness. The averaging is over the same finite set of leaf
  // probabilities, so there is no reason for any drift at all — and a tolerance here would
  // hide exactly the kind of systematic error this test exists to catch.
  ok('and the class probabilities match to the bit', worstProbability === 0,
    `largest gap ${worstProbability.toExponential(3)}`);

  // A SECOND fixture, and the reason it exists: the forest above is fully grown, so every
  // leaf is pure and each tree's probabilities are one-hot. On a model like that, averaging
  // class probabilities and taking a majority vote of the trees give identical answers — so
  // a fixture like that cannot tell a correct implementation from the common wrong one.
  // Verified by rewriting the evaluator to vote: it still passed every check here.
  //
  // This fixture is deliberately shallow (max_depth 4, min_samples_leaf 12) on noisy,
  // overlapping data, so 99% of its leaves hold a mix of classes. A majority vote disagrees
  // with scikit-learn on about 3% of inputs, which is what makes the distinction testable.
  const shallowModel = path.join(HERE, 'fixtures', 'level_classifier_rf.shallow.json');
  const shallowCases = path.join(HERE, 'fixtures', 'level_classifier_rf.shallow-cases.json');
  if (existsSync(shallowModel) && existsSync(shallowCases)) {
    const sm = JSON.parse(readFileSync(shallowModel, 'utf8'));
    const sc = JSON.parse(readFileSync(shallowCases, 'utf8'));

    const impureLeaves = sm.trees.reduce((n, t) => n + t.value.filter((v, i) =>
      t.left[i] === -1 && v.filter((q) => q > 0).length > 1).length, 0);
    ok('the shallow fixture really does have impure leaves', impureLeaves > 100,
      `${impureLeaves} leaves hold more than one class`);

    let shallowMismatch = 0;
    let shallowProbGap = 0;
    let voteWouldDiffer = 0;
    for (const c of sc.cases) {
      if (predict(sm, c.features).label !== c.expected) shallowMismatch += 1;
      const p = predictProbabilities(sm, c.features);
      for (let i = 0; i < p.length; i += 1) shallowProbGap = Math.max(shallowProbGap, Math.abs(p[i] - c.proba[i]));

      // What a majority vote would have said, for comparison only.
      const tally = new Array(sm.classes.length).fill(0);
      for (const tree of sm.trees) {
        let node = 0;
        while (tree.left[node] !== -1) {
          const v = Math.fround(sm.features.map((f) => Number(c.features[f]))[tree.feature[node]]);
          node = v <= tree.threshold[node] ? tree.left[node] : tree.right[node];
        }
        const leaf = tree.value[node];
        let b = 0;
        for (let k = 1; k < leaf.length; k += 1) if (leaf[k] > leaf[b]) b = k;
        tally[b] += 1;
      }
      let vb = 0;
      for (let k = 1; k < tally.length; k += 1) if (tally[k] > tally[vb]) vb = k;
      if (sm.classes[vb] !== c.expected) voteWouldDiffer += 1;
    }

    ok(`all ${sc.cases.length} shallow-forest predictions match scikit-learn`, shallowMismatch === 0,
      `${shallowMismatch} mismatched`);
    // A few ULP here, not exact — and the difference from the check above is real rather
    // than a loosened standard. The fully grown forest's leaves are pure, so every tree
    // contributes exactly 0 or 1, and summing those in floating point is exact. These leaves
    // contribute fractions like 7/19, and adding sixty of them in a different order from
    // numpy's gives a different last bit. 1e-12 is far below anything that could change a
    // predicted level and far above the ~1e-16 that summation noise can reach.
    ok('and their probabilities match to within floating-point noise', shallowProbGap < 1e-12,
      `largest gap ${shallowProbGap.toExponential(3)}`);
    ok('a majority vote WOULD have got these wrong, so this is a real distinction',
      voteWouldDiffer > 20,
      `a vote disagrees with scikit-learn on ${voteWouldDiffer} of ${sc.cases.length} — ` +
      'sklearn averages class probabilities, it does not count votes');
  }

  // The float32 case, called out because it is the one that was actually wrong. scikit-learn
  // casts features to float32 before walking the trees; comparing in float64, as JavaScript
  // does by default, disagrees for values within float32 rounding distance of a threshold.
  const onThreshold = cases.filter((c) =>
    model.trees.some((t) => t.threshold.some((th) => th > -2 &&
      Object.values(c.features).some((v) => Math.fround(v) === Math.fround(th)))));
  ok('cases sitting exactly on a split threshold are covered', onThreshold.length > 0,
    `${onThreshold.length} such cases`);
  ok('and they agree too',
    onThreshold.every((c) => predict(model, c.features).label === c.expected));
}

// ════════════════════════════════════════════════════════════════════
console.log('\n━━━ 2. A BROKEN MODEL IS REFUSED, NOT SERVED ━━━');
// ════════════════════════════════════════════════════════════════════
{
  const good = { format: MODEL_FORMAT, features: ['a'], classes: ['x', 'y'],
    trees: [{ left: [-1], right: [-1], feature: [-2], threshold: [-2], value: [[1, 0]] }] };
  ok('a minimal valid model passes', validateModel(good) === null, validateModel(good) ?? '');

  const broken = {
    'a different format': { ...good, format: 'something-else' },
    'no trees': { ...good, trees: [] },
    'no classes': { ...good, classes: [] },
    'a tree missing an array': { ...good, trees: [{ left: [-1], right: [-1], feature: [-2], threshold: [-2] }] },
    'arrays of different lengths': { ...good, trees: [{ left: [-1, -1], right: [-1], feature: [-2], threshold: [-2], value: [[1, 0]] }] },
    'a leaf not covering every class': { ...good, trees: [{ left: [-1], right: [-1], feature: [-2], threshold: [-2], value: [[1]] }] },
    'not an object': 'nonsense',
    'null': null,
  };
  for (const [what, model] of Object.entries(broken)) {
    ok(`rejected: ${what}`, typeof validateModel(model) === 'string');
  }
}

// ════════════════════════════════════════════════════════════════════
console.log('\n━━━ 2b. THE FEATURE-DEFINITION HANDSHAKE ━━━');
// ════════════════════════════════════════════════════════════════════
{
  const base = { format: MODEL_FORMAT, features: ['a'], classes: ['x', 'y'],
    trees: [{ left: [-1], right: [-1], feature: [-2], threshold: [-2], value: [[1, 0]] }] };

  ok('a model stamped with the version this backend implements is accepted',
    validateModel({ ...base, featureSpecVersion: FEATURE_SPEC_VERSION }) === null);
  ok('a model built on DIFFERENT feature definitions is refused',
    typeof validateModel({ ...base, featureSpecVersion: FEATURE_SPEC_VERSION + 1 }) === 'string',
    'a redefinition must become a loud refusal, not silently wrong levels for everyone');
  ok('and the refusal says what to do about it',
    /re-export the model|getLevelFeatures/.test(
      validateModel({ ...base, featureSpecVersion: FEATURE_SPEC_VERSION + 1 })));
  ok('an unstamped model is still accepted',
    validateModel(base) === null,
    'refusing one would break a model that predates the stamp and is almost certainly fine');
  if (existsSync(FIXTURE)) {
    const m = JSON.parse(readFileSync(FIXTURE, 'utf8'));
    ok('the exporter stamps the version it used', m.featureSpecVersion === FEATURE_SPEC_VERSION,
      `fixture says v${m.featureSpecVersion}, backend implements v${FEATURE_SPEC_VERSION}`);
    ok('and records the range each feature was trained over',
      !!m.featureStats && Object.keys(m.featureStats).length === m.features.length,
      JSON.stringify(Object.keys(m.featureStats ?? {})));
  }
}

// ════════════════════════════════════════════════════════════════════
console.log('\n━━━ 3. THE LEVEL SERVICE FALLS BACK SAFELY ━━━');
// ════════════════════════════════════════════════════════════════════
{
  const tmp = path.join(os.tmpdir(), `rl-models-${Date.now()}`);
  mkdirSync(tmp, { recursive: true });
  const original = process.env.LEVEL_MODEL_PATH;
  const features = { weekly_km: 40, runs_per_week: 4, longest_run_km: 15, avg_pace: 5.5, tenure_months: 20 };

  try {
    process.env.LEVEL_MODEL_PATH = path.join(tmp, 'missing.json');
    resetModelCache();
    ok('no model file: loadModel returns null', loadModel() === null);
    ok('no model file: classifyFeatures returns null, it does not invent a level',
      classifyFeatures(features) === null);
    ok(`and the safe default is '${DEFAULT_LEVEL}'`, DEFAULT_LEVEL === 'beginner',
      'beginner plans are the gentlest, so a wrong guess asks too little rather than too much');

    const corrupt = path.join(tmp, 'corrupt.json');
    writeFileSync(corrupt, '{ not json');
    process.env.LEVEL_MODEL_PATH = corrupt;
    resetModelCache();
    ok('unparseable model: refused rather than thrown', loadModel() === null);

    const wrongShape = path.join(tmp, 'wrong.json');
    writeFileSync(wrongShape, JSON.stringify({ format: 'something-else', trees: [] }));
    process.env.LEVEL_MODEL_PATH = wrongShape;
    resetModelCache();
    ok('wrong format: refused', loadModel() === null);

    if (existsSync(FIXTURE)) {
      process.env.LEVEL_MODEL_PATH = FIXTURE;
      resetModelCache();
      const model = loadModel();
      ok('a good model loads', model !== null && model.trees.length > 0);
      // The model is read once and kept: it never changes while the process runs, and
      // re-parsing several hundred KB per request would be waste on a path a runner waits on.
      ok('and is cached rather than re-read', loadModel() === model);

      const result = classifyFeatures(features);
      ok('a classified runner comes back with a level', ['beginner', 'intermediate', 'advanced'].includes(result?.level),
        JSON.stringify(result));
      ok('with a confidence between 0 and 1', result.confidence > 0 && result.confidence <= 1);
      ok('and probabilities over every class',
        Object.keys(result.probabilities).length === model.classes.length);
      ok('the probabilities sum to 1',
        near(Object.values(result.probabilities).reduce((a, b) => a + b, 0), 1, 1e-9));

      // The scale check. A tenure in DAYS rather than months is the realistic version of
      // this: 600 instead of 20. It still classifies — the forest extrapolates — but the
      // answer is reported as built on features the model never saw.
      const flagged = classifyFeatures({ ...features, tenure_months: 600 });
      ok('a feature at the wrong scale is still classified', flagged !== null,
        'refusing would be worse than answering; the point is to say so, not to stop');
      ok('and a model with training stats can report it',
        loadModel()?.featureStats != null);

      // The band has to separate a unit slip from an exceptional runner. Checked through
      // describeUserLevel's `outOfRange`, which is the shape the API actually serves.
      const stats = loadModel().featureStats;
      const inRange = (f) => featuresOutOfRangeFor(f);
      ok('an ordinary runner is not flagged', inRange(features).length === 0,
        JSON.stringify(inRange(features)));
      ok('a runner three times beyond the training maximum is not flagged',
        inRange({ ...features, weekly_km: stats.weekly_km.max * 3 }).length === 0,
        'a real outlier must not look like a bug');
      ok('a tenure given in days rather than months IS flagged',
        inRange({ ...features, tenure_months: stats.tenure_months.max * 30 }).length > 0);
      ok('a pace given in seconds rather than minutes IS flagged',
        inRange({ ...features, avg_pace: features.avg_pace * 60 }).length > 0);
      ok('and the message names the feature and the range it was trained on',
        /avg_pace=.*trained on/.test(inRange({ ...features, avg_pace: features.avg_pace * 60 })[0] ?? ''),
        inRange({ ...features, avg_pace: features.avg_pace * 60 })[0]);

      ok('a missing feature is reported, not guessed past',
        classifyFeatures({ weekly_km: 40 }) === null);
      ok('a non-numeric feature is reported too',
        classifyFeatures({ ...features, avg_pace: 'quick' }) === null);
    }
  } finally {
    if (original === undefined) delete process.env.LEVEL_MODEL_PATH;
    else process.env.LEVEL_MODEL_PATH = original;
    resetModelCache();
    rmSync(tmp, { recursive: true, force: true });
  }
}

// ════════════════════════════════════════════════════════════════════
console.log('\n━━━ 4. THE FITNESS ESTIMATE MATCHES THE NOTEBOOK ━━━');
// ════════════════════════════════════════════════════════════════════
{
  // The notebook's own arithmetic, from the settings its section 9 printed. Written out
  // here rather than imported so that a change to the service cannot quietly change the
  // thing it is being checked against.
  const COEF = [173.065, -3.993, -0.076];
  const { Q, R, P0 } = { Q: 4.0, R: 178.4, P0: 1000.0 };
  const WARMUP = 5;
  const typical = (pace, dist) => COEF[0] + COEF[1] * pace + COEF[2] * dist;

  function notebookOffset(runs) {
    const residuals = runs.slice(0, WARMUP).map((r) => r.hr - typical(r.pace, r.dist));
    let offset = residuals.reduce((a, b) => a + b, 0) / residuals.length;
    let P = P0;
    for (const r of runs) {
      P += Q;
      const K = P / (P + R);
      offset += K * (r.hr - (typical(r.pace, r.dist) + offset));
      P *= 1 - K;
    }
    return offset;
  }

  ok('the settings are the ones the notebook printed',
    SETTINGS.line.intercept === 173.065 && SETTINGS.line.paceCoef === -3.993 &&
    SETTINGS.line.distanceCoef === -0.076 && SETTINGS.kalman.Q === 4.0 &&
    SETTINGS.kalman.R === 178.4 && SETTINGS.warmupRuns === 5 &&
    SETTINGS.displayScoreSpanBpm === 35.0,
    JSON.stringify(SETTINGS));
  ok('the typical-runner line agrees', near(typicalHeartRate(6, 10), typical(6, 10), 1e-12));

  // A deterministic pseudo-random spread of runners and run counts.
  let seed = 20261026;
  const rand = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };

  let worst = 0;
  let compared = 0;
  for (const n of [1, 2, 3, 5, 9, 25, 60]) {
    for (let trial = 0; trial < 25; trial += 1) {
      const trueOffset = (rand() - 0.5) * 30;
      const runs = [];
      for (let i = 0; i < n; i += 1) {
        const pace = 3.5 + rand() * 6;
        const dist = 2 + rand() * 20;
        const hr = typical(pace, dist) + trueOffset + (rand() - 0.5) * 14;
        runs.push({ pace, dist, hr: Math.min(210, Math.max(70, hr)) });
      }
      const mine = estimateOffset(runs.map((r) => ({
        distanceKm: r.dist, durationSeconds: r.pace * 60 * r.dist, avgHeartRate: r.hr,
      })));
      worst = Math.max(worst, Math.abs(mine.offset - notebookOffset(runs)));
      compared += 1;
    }
  }
  ok(`the filter matches the notebook across ${compared} runners (1 to 60 runs each)`,
    worst < 1e-9, `largest gap ${worst.toExponential(3)} bpm`);

  // The seeding rule is the part that was wrong first time round: seeding from the first run
  // alone rather than the mean of the first five. With few runs the difference is visible.
  const twoRuns = [
    { distanceKm: 10, durationSeconds: 6 * 60 * 10, avgHeartRate: 170 },
    { distanceKm: 10, durationSeconds: 6 * 60 * 10, avgHeartRate: 140 },
  ];
  const fromMeanSeed = estimateOffset(twoRuns).offset;
  const firstRunSeed = (() => {
    let offset = twoRuns[0].avgHeartRate - typical(6, 10);
    let P = P0;
    for (const r of twoRuns) {
      P += Q; const K = P / (P + R);
      offset += K * (r.avgHeartRate - (typical(6, 10) + offset)); P *= 1 - K;
    }
    return offset;
  })();
  ok('seeding from the mean of the warm-up runs differs from seeding from the first run',
    Math.abs(fromMeanSeed - firstRunSeed) > 0.5,
    `mean-seed ${fromMeanSeed.toFixed(2)} vs first-run-seed ${firstRunSeed.toFixed(2)} — the notebook uses the mean`);
  ok('and the service uses the notebook\'s rule',
    near(fromMeanSeed, notebookOffset([
      { pace: 6, dist: 10, hr: 170 }, { pace: 6, dist: 10, hr: 140 },
    ]), 1e-9));
}

// ════════════════════════════════════════════════════════════════════
console.log('\n━━━ 5. WHAT THE RUNNER IS SHOWN ━━━');
// ════════════════════════════════════════════════════════════════════
{
  ok('an average runner scores 50', displayScore(0) === 50);
  ok('fitter than typical scores above 50', displayScore(-10) > 50);
  ok('slower than typical scores below 50', displayScore(10) < 50);
  ok('the scale is clamped at 100', displayScore(-200) === 100);
  ok('and at 0', displayScore(200) === 0);
  ok('the span matches the notebook: -35 bpm is 100', displayScore(-35) === 100);
  ok('and +35 bpm is 0', displayScore(35) === 0);
  ok('the score rises as the offset falls',
    displayScore(-20) > displayScore(-5) && displayScore(-5) > displayScore(5));

  // Faster is a LOWER pace number, which is the easy thing to get backwards.
  ok('a fitter runner gets a faster reference pace',
    paceAtReference(-15) < paceAtReference(0) && paceAtReference(0) < paceAtReference(15),
    `${paceAtReference(-15)} / ${paceAtReference(0)} / ${paceAtReference(15)}`);
  ok('the reference pace stays in a realistic range',
    paceAtReference(-500) >= 2.75 && paceAtReference(500) <= 12.0,
    `${paceAtReference(-500)} to ${paceAtReference(500)}`);

  const paces = trainingPaces(0);
  ok('easy is slower than tempo', paces.easy > paces.tempo);
  ok('long is slower than tempo', paces.long > paces.tempo);
  ok('intervals are the fastest', paces.intervals < paces.tempo);
  ok('the deltas are the notebook\'s (+0.6 / +0.5 / -0.4 / -0.8)',
    near(paces.easy - paceAtReference(0), 0.6, 0.011) &&
    near(paces.long - paceAtReference(0), 0.5, 0.011) &&
    near(paces.tempo - paceAtReference(0), -0.4, 0.011) &&
    near(paces.intervals - paceAtReference(0), -0.8, 0.011),
    JSON.stringify(paces));
  // The notebook clamps only the base pace, which would hand a very fit runner an interval
  // pace faster than any human has run. The service clamps each pace instead.
  ok('no pace escapes the realistic range even for an extreme runner',
    Object.values(trainingPaces(-500)).every((p) => p >= 2.75 && p <= 12.0),
    JSON.stringify(trainingPaces(-500)));
}

// ════════════════════════════════════════════════════════════════════
console.log('\n━━━ 6. RUNS THAT CANNOT CARRY THE SIGNAL ━━━');
// ════════════════════════════════════════════════════════════════════
{
  const good = { distanceKm: 10, durationSeconds: 3600, avgHeartRate: 150 };
  ok('a usable run is kept', usableRuns([good]).length === 1);
  ok('no heart rate: dropped', usableRuns([{ ...good, avgHeartRate: null }]).length === 0,
    'a run without heart rate says nothing about fitness');
  ok('zero distance: dropped', usableRuns([{ ...good, distanceKm: 0 }]).length === 0);
  ok('zero duration: dropped', usableRuns([{ ...good, durationSeconds: 0 }]).length === 0);
  ok('an impossible heart rate: dropped', usableRuns([{ ...good, avgHeartRate: 15 }]).length === 0);
  ok('a sprint pace no human holds: dropped',
    usableRuns([{ ...good, durationSeconds: 60 }]).length === 0);
  ok('a walking pace: dropped', usableRuns([{ ...good, durationSeconds: 60 * 60 * 5 }]).length === 0);
  ok('snake_case rows from the database work too',
    usableRuns([{ distance_km: 10, duration_seconds: 3600, avg_heart_rate: 150 }]).length === 1);
  ok('rubbish is dropped rather than thrown on',
    usableRuns([null, undefined, {}, 'run']).length === 0);
  ok('a non-array is handled', usableRuns(null).length === 0);

  ok('no usable runs gives null, not a confident zero', estimateOffset([{ ...good, avgHeartRate: null }]) === null,
    'no data is not the same as average fitness');
}

// ════════════════════════════════════════════════════════════════════
console.log('\n━━━ 7. THE SHAPE SERVED TO THE APP ━━━');
// ════════════════════════════════════════════════════════════════════
{
  const none = estimateFitness([]);
  ok('with nothing to go on, available is false', none.available === false);
  ok('and there is a reason to show the runner', typeof none.reason === 'string' && none.reason.length > 10);
  ok('and no invented score', none.score === null && none.paces === null);

  const runs = Array.from({ length: 3 }, (_, i) => ({
    distanceKm: 8, durationSeconds: 6 * 60 * 8, avgHeartRate: 150 - i,
    startedAt: new Date(Date.now() - (3 - i) * 86400000).toISOString(),
  }));
  const few = estimateFitness(runs);
  ok('three runs still produce an estimate', few.available === true && few.score !== null);
  ok('but it is marked as not yet confident', few.confident === false,
    `warm-up is ${SETTINGS.warmupRuns} runs; an early estimate is provisional, not a verdict`);

  const many = estimateFitness(Array.from({ length: 9 }, (_, i) => ({
    distanceKm: 8, durationSeconds: 6 * 60 * 8, avgHeartRate: 150 - i,
    startedAt: new Date(Date.now() - (9 - i) * 86400000).toISOString(),
  })));
  ok('past the warm-up it is confident', many.confident === true);
  ok('the history is one point per run', many.history.length === 9);
  ok('each history point carries a score', many.history.every((h) => Number.isInteger(h.score)));
  ok('and a date', many.history.every((h) => typeof h.startedAt === 'string'));
  ok('runsUsed reports how much evidence there is', many.runsUsed === 9);

  // A runner getting fitter must score higher than one getting slower, from the same start.
  const improving = estimateFitness(Array.from({ length: 12 }, (_, i) => ({
    distanceKm: 10, durationSeconds: 6 * 60 * 10, avgHeartRate: 165 - i * 2,
  })));
  const declining = estimateFitness(Array.from({ length: 12 }, (_, i) => ({
    distanceKm: 10, durationSeconds: 6 * 60 * 10, avgHeartRate: 145 + i * 2,
  })));
  ok('a runner whose heart rate is falling scores higher than one whose is rising',
    improving.score > declining.score, `${improving.score} vs ${declining.score}`);
  ok('the history shows the improvement',
    improving.history[0].score < improving.history.at(-1).score,
    `${improving.history[0].score} -> ${improving.history.at(-1).score}`);

  // A very long history must not be shipped back whole.
  const long = estimateFitness(Array.from({ length: 400 }, () => ({
    distanceKm: 8, durationSeconds: 6 * 60 * 8, avgHeartRate: 150,
  })));
  ok('the history returned to the app is capped', long.history.length <= 30,
    `${long.history.length} points`);
  ok('while every run still informs the estimate', long.runsUsed === 400);
}

console.log(`\n${'─'.repeat(70)}`);
if (failures.length === 0) console.log(`  ${passed} checks passed, 0 failed`);
else {
  console.log(`  ${passed} passed, ${failures.length} FAILED`);
  for (const f of failures) console.log(`    - ${f}`);
}
console.log(`${'─'.repeat(70)}\n`);
process.exit(failures.length > 0 ? 1 : 0);
