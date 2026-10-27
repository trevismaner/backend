"""
Exports a trained scikit-learn RandomForestClassifier as JSON the Node backend can evaluate.

WHY
The classifier is trained in Python but served by the Node backend. Rather than running a
second Python service just to answer "is this runner a beginner?", the forest is exported as
plain numbers and evaluated in Node (backend/control/RandomForest.js). A trained forest is
only a set of decision trees — arrays of thresholds and child indices — so there is nothing
in prediction that needs Python at runtime.

HOW TO USE IT (in RunLeague_Fitness_Plan_AI.ipynb, after the Random Forest is fitted)

    # section 8, beside the joblib.dump
    from export_model_json import export_model_json
    export_model_json(rf, FEATURES, DIR + 'level_classifier_rf.json')

Then copy that file to backend/ml/level_classifier_rf.json and commit it. It is a few
hundred KB of numbers, it is not a secret, and keeping it in the repo means the deployed
backend always has the exact model the report describes.

WHAT IS EXPORTED
For each tree: children_left, children_right, feature, threshold and the per-class sample
counts at each node. Those five arrays are the entire model. Everything else sklearn keeps
(impurity, sample weights, the training data) matters for fitting, not for predicting.

The class order is sklearn's `classes_`, which is sorted, and the Node side keeps the same
order — the labels and the probability vector must line up or the forest will confidently
return the wrong level.
"""
import json


# Bump this whenever a FEATURE DEFINITION changes in the notebook — a different pace
# calculation, a different idea of an active week, a different tenure unit. The backend
# declares the version it implements and refuses a model it does not recognise, so a
# redefinition becomes a loud refusal instead of silently wrong levels. Retraining on more
# data does NOT need a bump; only changing what the five numbers mean does.
FEATURE_SPEC_VERSION = 1


def export_model_json(forest, features, path, training_data=None):
    """Write `forest` to `path` as JSON. Returns the path, so it can be printed in a notebook.

    `training_data` is optional: pass the DataFrame the forest was fitted on and the export
    records each feature's range. The backend uses it only to notice features that are wildly
    outside the space the model saw — a tenure in days rather than months, a pace in seconds
    rather than minutes. It catches unit and scale mistakes, not subtle ones.
    """
    classes = [str(c) for c in forest.classes_]

    trees = []
    for estimator in forest.estimators_:
        t = estimator.tree_
        # `value` is shaped (n_nodes, n_outputs, n_classes); this is a single-output
        # classifier, so n_outputs is 1 and that axis is dropped.
        #
        # From scikit-learn 1.3 these are normalised per node rather than raw counts. Either
        # way the Node evaluator re-normalises, so the export does not depend on which
        # version produced it — but the values are written out as given, not rounded, because
        # rounding a near-tie is exactly how an exported model starts disagreeing with the
        # one that was validated.
        value = t.value.reshape(t.value.shape[0], -1)

        trees.append({
            'left': t.children_left.tolist(),
            'right': t.children_right.tolist(),
            'feature': t.feature.tolist(),
            'threshold': t.threshold.tolist(),
            'value': [row.tolist() for row in value],
        })

    stats = None
    if training_data is not None:
        stats = {}
        for name in features:
            column = training_data[name]
            stats[name] = {
                'min': float(column.min()),
                'max': float(column.max()),
                'median': float(column.median()),
            }

    model = {
        'format': 'runleague-rf-1',
        'featureSpecVersion': FEATURE_SPEC_VERSION,
        'features': list(features),
        'classes': classes,
        'trees': trees,
        'featureStats': stats,
        'meta': {
            'n_estimators': len(forest.estimators_),
            'sklearn_class': type(forest).__name__,
        },
    }

    with open(path, 'w', encoding='utf-8') as f:
        json.dump(model, f)
    return path


if __name__ == '__main__':
    import sys
    import joblib

    if len(sys.argv) != 3:
        print('usage: python export_model_json.py <bundle.joblib> <out.json>')
        raise SystemExit(2)

    bundle = joblib.load(sys.argv[1])
    # The notebook saves {'model': rf, 'features': FEATURES}; a bare estimator also works.
    model = bundle['model'] if isinstance(bundle, dict) else bundle
    feats = bundle['features'] if isinstance(bundle, dict) else list(getattr(model, 'feature_names_in_', []))
    print(export_model_json(model, feats, sys.argv[2]))
