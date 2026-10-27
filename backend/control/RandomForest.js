/**
 * Evaluates a scikit-learn Random Forest classifier in Node.
 *
 * WHY THIS EXISTS
 * The level classifier is trained in Python (RunLeague_Fitness_Plan_AI.ipynb) and scikit-learn
 * cannot run in Node, so the obvious deployment is a second Python service that the backend
 * calls over HTTP. That was the original design, and it works — but a trained Random Forest
 * is not really a program, it is a lookup table: a set of decision trees, each a few arrays of
 * numbers. Predicting is comparing a feature against a threshold and walking left or right.
 * There is nothing in it that needs Python at runtime.
 *
 * Running it here instead removes a whole service from the deployment: no second process to
 * host, no model file to ship beside it, no network call on the path of every plan, no
 * timeout to tune, and no "the classifier was unreachable so everyone is a beginner" in
 * production. The notebook exports the trees as JSON (see `export_model_json` in the
 * notebook, section 8) and this reads them.
 *
 * FAITHFULNESS TO SCIKIT-LEARN
 * `RandomForestClassifier.predict` is not a majority vote of the trees' predicted classes —
 * that is the common misreading. It averages each tree's predicted class PROBABILITIES and
 * takes the argmax of the mean. Those differ whenever trees disagree with different
 * confidences, so this implements the averaging version. `tests/verify_random_forest.mjs`
 * checks the two agree on thousands of random inputs against a model exported from a real
 * sklearn forest, because "it looked right" is not a standard worth deploying a model on.
 *
 * Ties go to the lowest class index, which is what numpy's argmax does.
 */

/** The export format this evaluator understands. Bumped if the layout ever changes. */
export const MODEL_FORMAT = 'runleague-rf-1';

/**
 * The version of the FEATURE DEFINITIONS this backend implements.
 *
 * Separate from the format above, because they fail differently. A format change breaks
 * parsing, which is obvious. A feature-definition change does not break anything: the
 * backend keeps computing five numbers, the forest keeps returning a confident level, and
 * the level is simply wrong for everyone.
 *
 * That is not hypothetical — it had already happened once. `avg_pace` was computed here as
 * total time over total distance while the notebook trained on the mean of each run's pace,
 * about 12% apart on a realistic history, with nothing anywhere reporting it.
 *
 * So the notebook stamps each exported model with the definitions it used
 * (`FEATURE_SPEC_VERSION` in ml/export_model_json.py) and this refuses a model built on
 * definitions it does not implement. It is a handshake, not a proof: it only works if
 * whoever changes a definition bumps the number. What proves the definitions on this side
 * are right is tests/verify_level_features.mjs, which pins every one of them against the
 * notebook's own pandas.
 *
 * Bump this only when entities/Run.js getLevelFeatures changes what a feature MEANS.
 */
export const FEATURE_SPEC_VERSION = 1;

/**
 * Checks a parsed model is the right shape before anything depends on it.
 *
 * A malformed model should fail loudly at load, once, rather than producing quietly wrong
 * levels for every runner — a classifier that is subtly broken looks exactly like one that
 * is working, which is the worst failure mode available here.
 */
export function validateModel(model) {
  if (!model || typeof model !== 'object') return 'model is not an object';
  if (model.format !== MODEL_FORMAT) {
    return `unknown model format ${JSON.stringify(model.format)} (expected ${MODEL_FORMAT})`;
  }
  if (!Array.isArray(model.features) || model.features.length === 0) return 'model has no features';
  if (!Array.isArray(model.classes) || model.classes.length === 0) return 'model has no classes';
  if (!Array.isArray(model.trees) || model.trees.length === 0) return 'model has no trees';

  // A model exported before the stamp existed has no version. Accepted, because refusing it
  // would break a model that is almost certainly fine; a mismatch is the thing worth
  // refusing, not an absence.
  if (model.featureSpecVersion !== undefined && model.featureSpecVersion !== FEATURE_SPEC_VERSION) {
    return `model was built on feature definitions v${model.featureSpecVersion}, but this ` +
      `backend implements v${FEATURE_SPEC_VERSION} — re-export the model, or update ` +
      'entities/Run.js getLevelFeatures to match the notebook';
  }

  for (let t = 0; t < model.trees.length; t += 1) {
    const tree = model.trees[t];
    const required = ['left', 'right', 'feature', 'threshold', 'value'];
    for (const key of required) {
      if (!Array.isArray(tree?.[key])) return `tree ${t} is missing the ${key} array`;
    }
    const n = tree.left.length;
    if (tree.right.length !== n || tree.feature.length !== n || tree.threshold.length !== n || tree.value.length !== n) {
      return `tree ${t} has arrays of differing lengths`;
    }
    for (const row of tree.value) {
      if (!Array.isArray(row) || row.length !== model.classes.length) {
        return `tree ${t} has a leaf whose value does not cover every class`;
      }
    }
  }
  return null;
}

/**
 * One tree's class probabilities for one feature vector.
 *
 * Leaves are marked by `left[node] === -1`, matching sklearn's `children_left`, where -1
 * means TREE_LEAF. The stored value is the per-class sample counts at that leaf, so it is
 * normalised here into probabilities — which is what `tree.predict_proba` returns.
 */
function treeProbabilities(tree, x, classCount) {
  let node = 0;
  // Bounded by the node count: a malformed tree with a cycle would otherwise hang the
  // request rather than fail it.
  for (let step = 0; step <= tree.left.length; step += 1) {
    if (tree.left[node] === -1) {
      const counts = tree.value[node];
      let total = 0;
      for (let c = 0; c < classCount; c += 1) total += counts[c];
      if (total <= 0) return new Array(classCount).fill(1 / classCount);
      return counts.map((count) => count / total);
    }
    // sklearn's split test is `X[feature] <= threshold` goes left. Two details decide
    // whether this agrees with Python, and both were found by comparing against a real
    // forest rather than by reading the source:
    //
    //   `<=` not `<`     — a sample sitting exactly on a threshold goes LEFT. Using `<`
    //                      sends every such sample down the wrong branch.
    //
    //   Math.fround      — sklearn casts X to float32 before walking the trees (its
    //                      internal DTYPE), while thresholds stay float64. So the real
    //                      comparison is float32(value) <= float64(threshold). Comparing in
    //                      float64, as JavaScript does by default, disagrees whenever a
    //                      feature lands within float32 rounding distance of a threshold.
    //                      That is rare per tree and invisible in the final label most of
    //                      the time — it showed up here as a single tree out of 120 voting
    //                      differently, a 1/120 shift in the probabilities — but on a
    //                      borderline runner it is enough to change the level reported.
    const value = Math.fround(x[tree.feature[node]]);
    node = value <= tree.threshold[node] ? tree.left[node] : tree.right[node];
  }
  throw new Error('random forest: tree walk did not reach a leaf');
}

/**
 * Mean class probabilities across the forest, in the model's class order.
 *
 * Exposed separately from `predict` because the probabilities are worth having: a runner
 * sitting at 0.51 intermediate / 0.49 advanced is a different thing from one at 0.99, and
 * the caller may want to say so rather than present a borderline call as certain.
 */
export function predictProbabilities(model, features) {
  const x = model.features.map((name) => {
    const value = Number(features?.[name]);
    if (!Number.isFinite(value)) {
      throw new Error(`random forest: feature ${name} is missing or not a number`);
    }
    return value;
  });

  const classCount = model.classes.length;
  const totals = new Array(classCount).fill(0);
  for (const tree of model.trees) {
    const probabilities = treeProbabilities(tree, x, classCount);
    for (let c = 0; c < classCount; c += 1) totals[c] += probabilities[c];
  }
  return totals.map((sum) => sum / model.trees.length);
}

/** The predicted class, plus how confident the forest was in it. */
export function predict(model, features) {
  const probabilities = predictProbabilities(model, features);

  let best = 0;
  // Strictly greater, so a tie keeps the lowest index — numpy's argmax behaviour, and what
  // sklearn therefore returns.
  for (let c = 1; c < probabilities.length; c += 1) {
    if (probabilities[c] > probabilities[best]) best = c;
  }

  return {
    label: model.classes[best],
    confidence: probabilities[best],
    probabilities: Object.fromEntries(model.classes.map((name, i) => [name, probabilities[i]])),
  };
}
