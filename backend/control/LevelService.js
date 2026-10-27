import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Run from '../entities/Run.js';
import { predict, validateModel } from './RandomForest.js';

/**
 * Runner level (beginner / intermediate / advanced), from the trained classifier.
 *
 * The model is the Random Forest built in RunLeague_Fitness_Plan_AI.ipynb: k-means over five
 * per-runner features defines the three levels, and the forest learns to predict them. The
 * notebook exports it as JSON (`backend/ml/export_model_json.py`) and it is evaluated here in
 * Node, so there is no Python process in the request path. `control/RandomForest.js` explains
 * why that is sound, and `tests/verify_random_forest.mjs` checks it agrees with scikit-learn
 * exactly rather than approximately.
 *
 * SAFE DEFAULT
 * Returns 'beginner' when the runner has too little history to compute features, or when no
 * model file is present. Beginner is the cautious answer: its plans are the gentlest, so a
 * wrong guess in that direction asks too little of someone rather than too much. This is one
 * fallback value, not a second classifier — there is no hand-written rule here quietly
 * competing with the trained one.
 *
 * CONFIGURE
 *   LEVEL_MODEL_PATH   where the exported model lives. Defaults to
 *                      backend/ml/level_classifier_rf.json.
 */

const DEFAULT_LEVEL = 'beginner';
const VALID = new Set(['beginner', 'intermediate', 'advanced']);

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_MODEL_PATH = path.join(HERE, '..', 'ml', 'level_classifier_rf.json');

/**
 * The model is read once and kept.
 *
 * It is a few hundred KB of numbers that never change while the process runs, so re-reading
 * and re-parsing it per request would be pure waste on a path a runner waits on. `null` means
 * "looked and there was nothing usable"; `undefined` means "not looked yet".
 */
let cached;
let warned = false;

function modelPath() {
  return process.env.LEVEL_MODEL_PATH?.trim() || DEFAULT_MODEL_PATH;
}

/**
 * Loads the model, or returns null.
 *
 * Every failure is reported once and then swallowed. A missing model must not take the
 * planner down — a plan built for a beginner is still a usable plan — but it also must not be
 * silent, because "everyone is a beginner" looks exactly like a working classifier on a
 * dataset of new users, and that is a very easy thing to deploy without noticing.
 */
export function loadModel({ force = false } = {}) {
  if (!force && cached !== undefined) return cached;

  const file = modelPath();
  try {
    if (!existsSync(file)) {
      if (!warned) {
        console.warn(
          `Level classifier: no model at ${file} — every runner will be classified as ` +
          `'${DEFAULT_LEVEL}'. Export one from the notebook (see backend/ml/README.md).`
        );
        warned = true;
      }
      cached = null;
      return cached;
    }

    const parsed = JSON.parse(readFileSync(file, 'utf8'));
    const problem = validateModel(parsed);
    if (problem) {
      console.error(`Level classifier: ${file} is not usable — ${problem}`);
      cached = null;
      return cached;
    }

    cached = parsed;
    console.log(
      `Level classifier loaded: ${parsed.trees.length} trees, ` +
      `classes ${parsed.classes.join('/')}, features ${parsed.features.join(', ')}`
    );
    return cached;
  } catch (err) {
    console.error(`Level classifier: could not read ${file} —`, err.message);
    cached = null;
    return cached;
  }
}

/** For tests, which swap models between cases. */
export function resetModelCache() {
  cached = undefined;
  warned = false;
  rangeWarned = false;
}

/**
 * Features so far outside the model's training range that something is wrong with how they
 * were computed, rather than with the runner.
 *
 * This is a blunt instrument and is meant to be. It catches scale mistakes — a tenure in days
 * instead of months, a pace in seconds instead of minutes, a weekly total that is really a
 * lifetime total — which are off by factors of 30 or 60 and would otherwise be scored as if
 * they were real. It does NOT catch subtle redefinitions: the `avg_pace` bug that actually
 * occurred was 12% off, which is comfortably inside any band wide enough not to fire on a
 * genuine outlier. The golden-feature suite is what catches those.
 *
 * The band is MULTIPLICATIVE, not a margin added to the training range, because the mistakes
 * it is looking for are multiplicative: months read as days is 30x, minutes read as seconds
 * is 60x. An additive band scaled to the training spread is useless here — tenure ranged
 * 0.3 to 141 months in training, so five spreads of slack put the limit at 850, and a tenure
 * wrongly given in days (600) sailed through. Measured, not assumed: that is exactly what the
 * first version of this function did.
 *
 * 4x the training maximum, and a quarter of the minimum. A runner three times beyond anyone
 * in the training data still passes without comment; a 30x unit slip does not.
 */
const RANGE_FACTOR = 4;

export function featuresOutOfRange(model, features) {
  const stats = model?.featureStats;
  if (!stats) return [];

  const odd = [];
  for (const name of model.features) {
    const stat = stats[name];
    const value = Number(features?.[name]);
    if (!stat || !Number.isFinite(value)) continue;

    // All five features are strictly positive quantities. The additive fallback is there so
    // that a future feature which can be zero or negative does not silently skip the check.
    const positive = stat.min > 0 && stat.max > 0;
    const upper = positive ? stat.max * RANGE_FACTOR : stat.max + Math.max(stat.max - stat.min, 1) * RANGE_FACTOR;
    const lower = positive ? stat.min / RANGE_FACTOR : stat.min - Math.max(stat.max - stat.min, 1) * RANGE_FACTOR;

    if (value < lower || value > upper) {
      odd.push(`${name}=${value.toPrecision(4)} (trained on ${stat.min.toPrecision(3)}-${stat.max.toPrecision(3)})`);
    }
  }
  return odd;
}

/** Reported once per process, not per request: this is a deployment fault, not a user event. */
let rangeWarned = false;

/**
 * Classify one feature vector. Returns null when there is no model or the features do not
 * fit it, so the caller decides what the absence of an answer means.
 */
export function classifyFeatures(features) {
  const model = loadModel();
  if (!model) return null;

  const odd = featuresOutOfRange(model, features);
  if (odd.length && !rangeWarned) {
    rangeWarned = true;
    console.warn(
      'Level classifier: features far outside the range this model was trained on — ' +
      `${odd.join('; ')}. This usually means getLevelFeatures and the notebook have drifted ` +
      'apart (a unit or definition change). Levels will be unreliable until they agree.'
    );
  }

  try {
    const { label, confidence, probabilities } = predict(model, features);
    if (!VALID.has(label)) {
      console.error(`Level classifier returned an unknown level ${JSON.stringify(label)}`);
      return null;
    }
    return { level: label, confidence, probabilities };
  } catch (err) {
    // A feature the model wants and the query did not provide: a real mismatch between the
    // notebook and the backend, worth saying loudly rather than defaulting past.
    console.error('Level classifier could not score this runner —', err.message);
    return null;
  }
}

/**
 * Classify a user from their run history. Always resolves to a valid level.
 *
 * `source` says where the answer came from, so a caller can tell a classified runner from a
 * defaulted one — the difference matters when deciding whether to tell someone why their
 * plan looks the way it does.
 */
export async function classifyUserLevel(userId) {
  const features = await Run.getLevelFeatures(userId).catch((err) => {
    console.error('Level classifier: could not read run history —', err.message);
    return null;
  });
  if (!features) return DEFAULT_LEVEL;

  const result = classifyFeatures(features);
  return result?.level ?? DEFAULT_LEVEL;
}

/** The same thing with its workings, for the endpoint that explains a plan. */
export async function describeUserLevel(userId) {
  const features = await Run.getLevelFeatures(userId).catch(() => null);
  if (!features) {
    return { level: DEFAULT_LEVEL, source: 'default', reason: 'not enough run history yet', features: null };
  }

  const result = classifyFeatures(features);
  if (!result) {
    return { level: DEFAULT_LEVEL, source: 'default', reason: 'no classifier available', features };
  }

  return {
    level: result.level,
    source: 'model',
    confidence: Number(result.confidence.toFixed(3)),
    probabilities: result.probabilities,
    features,
    // Empty in normal operation. Non-empty means the numbers being fed to the model are not
    // the kind of numbers it was trained on, which is worth seeing in an API response rather
    // than only in a log nobody is reading.
    outOfRange: featuresOutOfRange(loadModel(), features),
  };
}

export { DEFAULT_LEVEL };

/** The same check against the loaded model, for callers that do not hold one. */
export function featuresOutOfRangeFor(features) {
  return featuresOutOfRange(loadModel(), features);
}
