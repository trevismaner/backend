/**
 * The calorie estimate.
 *
 * Small enough to read in a minute, and worth pinning down because every failure mode is
 * silent: a missing weight that becomes a zero, a weight in pounds that doubles the figure,
 * or a derived value out of the column's range that fails the whole run save rather than
 * just the calorie field.
 *
 *   node tests/calorie_estimate.test.mjs
 */
import {
  estimateCalories,
  KCAL_PER_KG_PER_KM,
  MIN_WEIGHT_KG,
  MAX_WEIGHT_KG,
} from '../control/CalorieEstimate.js';

let pass = 0;
let fail = 0;
const ok = (name, condition, detail = '') => {
  if (condition) { pass += 1; console.log(`  \u001b[32mok\u001b[0m    ${name}${detail ? `  ${detail}` : ''}`); }
  else { fail += 1; console.log(`  \u001b[31mFAIL\u001b[0m  ${name}  ${detail}`); }
};

console.log('\n━━━ THE FIGURE ━━━');
{
  // 70 kg over 5 km: 70 × 5 × 1.03 = 360.5, rounded to 361.
  const c = estimateCalories({ weightKg: 70, distanceKm: 5 });
  ok('70 kg over 5 km', c === 361, String(c));

  ok('it scales with distance',
    estimateCalories({ weightKg: 70, distanceKm: 10 }) === 721,
    String(estimateCalories({ weightKg: 70, distanceKm: 10 })));

  ok('it scales with weight',
    estimateCalories({ weightKg: 90, distanceKm: 5 }) === 464,
    String(estimateCalories({ weightKg: 90, distanceKm: 5 })));

  // The whole reason one constant is defensible for running: pace does not enter the sum.
  // Asserted as the property itself rather than by inspecting the signature — a 25-minute
  // 5 km and a 40-minute 5 km cost the same, and if that ever stops being true the formula
  // has changed and this test should be the thing that says so.
  ok('pace does not change the figure — same distance, same calories',
    estimateCalories({ weightKg: 70, distanceKm: 5, durationSeconds: 1500 })
      === estimateCalories({ weightKg: 70, distanceKm: 5, durationSeconds: 2400 }),
    `${estimateCalories({ weightKg: 70, distanceKm: 5, durationSeconds: 1500 })} vs ${estimateCalories({ weightKg: 70, distanceKm: 5, durationSeconds: 2400 })}`);
  ok('the published constant is the one being applied',
    estimateCalories({ weightKg: 100, distanceKm: 1 }) === Math.round(100 * KCAL_PER_KG_PER_KM),
    String(estimateCalories({ weightKg: 100, distanceKm: 1 })));

  ok('a whole number comes back',
    Number.isInteger(estimateCalories({ weightKg: 72.4, distanceKm: 7.3 })),
    String(estimateCalories({ weightKg: 72.4, distanceKm: 7.3 })));

  ok('a short run still produces a figure',
    estimateCalories({ weightKg: 70, distanceKm: 0.5 }) === 36,
    String(estimateCalories({ weightKg: 70, distanceKm: 0.5 })));
}

console.log('\n━━━ NO FIGURE RATHER THAN A WRONG ONE ━━━');
{
  // Null, not zero. Zero asserts the run cost no energy; null says the app does not know,
  // and the runs table stores exactly that difference.
  const noWeight = [
    ['no weight at all', { distanceKm: 5 }],
    ['a null weight', { weightKg: null, distanceKm: 5 }],
    ['an empty-string weight', { weightKg: '', distanceKm: 5 }],
    ['a non-numeric weight', { weightKg: 'seventy', distanceKm: 5 }],
    ['a zero weight', { weightKg: 0, distanceKm: 5 }],
    ['a negative weight', { weightKg: -70, distanceKm: 5 }],
    ['NaN', { weightKg: NaN, distanceKm: 5 }],
  ];
  for (const [label, input] of noWeight) {
    ok(`${label} gives null, not 0`, estimateCalories(input) === null, String(estimateCalories(input)));
  }

  const noDistance = [
    ['no distance', { weightKg: 70 }],
    ['zero distance', { weightKg: 70, distanceKm: 0 }],
    ['negative distance', { weightKg: 70, distanceKm: -5 }],
    ['non-numeric distance', { weightKg: 70, distanceKm: 'five' }],
  ];
  for (const [label, input] of noDistance) {
    ok(`${label} gives null`, estimateCalories(input) === null, String(estimateCalories(input)));
  }

  let threw = false;
  try { estimateCalories(); } catch { threw = true; }
  ok('called with nothing at all, it does not throw', !threw);
}

console.log('\n━━━ THE RANGE GUARD ━━━');
{
  // A weight typed in pounds, or mistyped by a digit, is the realistic error. Both would
  // otherwise produce a confident figure that is wrong by roughly a factor of two.
  ok('a weight below the minimum is refused',
    estimateCalories({ weightKg: MIN_WEIGHT_KG - 0.01, distanceKm: 5 }) === null);
  ok('a weight above the maximum is refused',
    estimateCalories({ weightKg: MAX_WEIGHT_KG + 0.01, distanceKm: 5 }) === null);
  ok('the exact minimum is accepted',
    estimateCalories({ weightKg: MIN_WEIGHT_KG, distanceKm: 5 }) !== null);
  ok('the exact maximum is accepted',
    estimateCalories({ weightKg: MAX_WEIGHT_KG, distanceKm: 5 }) !== null);
  ok('a weight of 154 (pounds, not kg) is still in range and so is NOT caught',
    estimateCalories({ weightKg: 154, distanceKm: 5 }) !== null,
    'the bounds catch gross errors, not plausible-but-wrong units — the UI must label the field kg');

  // runs.calories_burned accepts 0-30000. Nothing reachable should exceed it, but a run
  // that fails to save because a derived field went out of range would be a bad trade.
  const extreme = estimateCalories({ weightKg: MAX_WEIGHT_KG, distanceKm: 100 });
  ok('an extreme but valid run stays inside the column range',
    extreme === null || (extreme > 0 && extreme <= 30000), String(extreme));
}

console.log(`\n${'─'.repeat(64)}`);
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
