# The trained models

Run League has two models. They are deployed very differently, and the reason is worth
stating because it is the main decision in this folder.

| | Fitness estimate | Level classifier |
| --- | --- | --- |
| Built in | `RunLeague_Fitness_Estimate_AI.ipynb` | `RunLeague_Fitness_Plan_AI.ipynb` |
| What it is | a fitted line plus a Kalman filter | a Random Forest over 5 features |
| The trained artefact | seven numbers | ~900 KB of decision trees |
| Where it runs | `control/FitnessEstimateService.js` | `control/RandomForest.js` |
| Needs a file | no — the numbers are in the source | yes — `level_classifier_rf.json` |

Neither needs Python at runtime.

## Why there is no Python service

The obvious way to deploy a scikit-learn model is a small Flask service that the Node backend
calls over HTTP, and that is how this started. It works, but it costs a second process to
host, a model file to ship beside it, a network call on the path of every plan, a timeout to
tune, and a failure mode — "the classifier was unreachable, so everyone is a beginner" — that
looks exactly like a working classifier on a dataset of new users.

A trained Random Forest does not need any of that. It is not a program; it is a lookup table.
Predicting means comparing a feature against a threshold and walking left or right, a few
hundred times. `control/RandomForest.js` does that, and `tests/verify_ai_models.mjs` checks it
agrees with scikit-learn **exactly** — same labels and same class probabilities, on thousands
of inputs including ones sitting on split thresholds — rather than approximately.

The fitness estimate never needed a service at all: its whole trained state is seven numbers
and the filter is four lines of arithmetic.

## Exporting the level classifier

In `RunLeague_Fitness_Plan_AI.ipynb`, section 8 already saves the model for Python with
`joblib.dump`. The notebook in this folder's parent delivery has a cell added beside it that
also writes the JSON. If you are working from your own copy, add this after the forest is
fitted:

```python
import json

def export_model_json(forest, features, path):
    trees = []
    for est in forest.estimators_:
        t = est.tree_
        value = t.value.reshape(t.value.shape[0], -1)
        trees.append({'left': t.children_left.tolist(),
                      'right': t.children_right.tolist(),
                      'feature': t.feature.tolist(),
                      'threshold': t.threshold.tolist(),
                      'value': [r.tolist() for r in value]})
    json.dump({'format': 'runleague-rf-1',
               'features': list(features),
               'classes': [str(c) for c in forest.classes_],
               'trees': trees}, open(path, 'w'))
    return path

export_model_json(rf, FEATURES, DIR + 'level_classifier_rf.json')
```

Then put that file here:

```
backend/ml/level_classifier_rf.json
```

Commit it. It is a few hundred KB of numbers, it is not a secret, and keeping it in the repo
means the deployed backend always has the exact model the report describes. `LEVEL_MODEL_PATH`
overrides the location if you need it somewhere else.

`export_model_json.py` in this folder is the same function as an importable module, and can
also convert an existing `.joblib`:

```
python export_model_json.py level_classifier_rf.joblib level_classifier_rf.json
```

## Until the model is exported

Everything works. `LevelService` logs once that no model is present and classifies every
runner as **beginner**, which is the cautious answer — beginner plans are the gentlest, so a
wrong guess in that direction asks too little of someone rather than too much. The API reports
`level.source: "default"` so the app can tell a classified runner from a defaulted one.

What you lose is only the personalisation: plans are still built, still safe, still validated.

## Keeping the features honest

**This is the part most likely to break, and it broke once already.** `avg_pace` was computed
in the backend as total time over total distance while the notebook trained on the mean of
each run's pace — about 12% apart on a realistic history, on a feature the forest splits on.
Nothing failed. The model simply returned confident, wrong levels.

Three things now stand between that and a repeat, and it is worth knowing what each one does
and does not catch:

| Guard | Catches | Misses |
| --- | --- | --- |
| `npm run test:level-features` | any change to the backend's definitions — the values are pinned against the notebook's own pandas output | a change made in the notebook instead |
| `featureSpecVersion` in the model | a notebook redefinition, **if whoever made it bumps the number** — the backend then refuses the model outright | a redefinition where nobody bumped it |
| The training-range check | unit and scale slips (months read as days, minutes as seconds) — logged once and reported in the API as `outOfRange` | anything subtle: the 12% pace bug sat comfortably inside the band |

None of them is sufficient alone. Together they mean a definition change has to get past a
failing test, a version stamp and a range check before it can quietly reach a runner.



The five features are computed in `entities/Run.js` (`getLevelFeatures`) and **must** match
the notebook's definitions:

```
weekly_km       total distance / number of active weeks
runs_per_week   run count / number of active weeks
longest_run_km  the longest single run
avg_pace        total minutes / total km
tenure_months   first run to last run, in months, floored at 0.3
```

"Active weeks" means weeks in which the runner actually ran, not weeks since they signed up.
If those drift apart, the model's accuracy drops silently — the forest will still return a
confident level, just a wrong one. That is the single most likely way this breaks, and nothing
in the system will tell you it has happened.
