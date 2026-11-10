/**
 * The calorie figure on the run screen, and reading a weight out of a text field.
 *
 * The arithmetic is deliberately a copy of the server's control/CalorieEstimate.js: the
 * server fills the figure in when a run is saved, but the screen needs a number while the
 * run is still happening. The first group below exists to catch the two drifting apart,
 * which would show up to a runner as the total jumping the moment they pressed save.
 *
 *   node tests/calories.test.mjs
 */
import {
  estimateCalories,
  parseWeightInput,
  KCAL_PER_KG_PER_KM,
  MIN_WEIGHT_KG,
  MAX_WEIGHT_KG,
} from '../src/utils/calories.js';

let pass = 0;
let fail = 0;
const ok = (name, condition, detail = '') => {
  if (condition) { pass += 1; console.log(`  \u001b[32mok\u001b[0m    ${name}${detail ? `  ${detail}` : ''}`); }
  else { fail += 1; console.log(`  \u001b[31mFAIL\u001b[0m  ${name}  ${detail}`); }
};

console.log('\n━━━ 1. IT AGREES WITH THE SERVER ━━━');
{
  // These are the exact figures the backend returned over HTTP. If this file and
  // control/CalorieEstimate.js drift, the number would change when a run is saved.
  ok('the constant matches the server', KCAL_PER_KG_PER_KM === 1.03);
  ok('the bounds match the server and the column', MIN_WEIGHT_KG === 20 && MAX_WEIGHT_KG === 400);
  ok('70 kg over 5 km is 361, as the API returned',
    estimateCalories({ weightKg: 70, distanceKm: 5 }) === 361,
    String(estimateCalories({ weightKg: 70, distanceKm: 5 })));
  ok('100 kg over 1 km is 103',
    estimateCalories({ weightKg: 100, distanceKm: 1 }) === 103);
}

console.log('\n━━━ 2. THE FIGURE ITSELF ━━━');
{
  ok('it scales with distance', estimateCalories({ weightKg: 70, distanceKm: 10 }) === 721);
  ok('it scales with weight', estimateCalories({ weightKg: 90, distanceKm: 5 }) === 464);
  ok('pace does not change it — the function takes no duration',
    estimateCalories({ weightKg: 70, distanceKm: 5, durationSeconds: 1500 })
      === estimateCalories({ weightKg: 70, distanceKm: 5, durationSeconds: 2400 }));
  ok('a whole number comes back',
    Number.isInteger(estimateCalories({ weightKg: 72.4, distanceKm: 7.3 })));
  ok('it climbs as a run progresses', (() => {
    let last = 0;
    for (const km of [0.1, 0.5, 1, 2, 5]) {
      const c = estimateCalories({ weightKg: 70, distanceKm: km });
      if (c === null || c < last) return false;
      last = c;
    }
    return true;
  })());
}

console.log('\n━━━ 3. NULL, NOT ZERO ━━━');
{
  // The screen shows nothing at all rather than asserting the run cost no energy.
  for (const [label, input] of [
    ['no weight on the profile', { distanceKm: 5 }],
    ['a null weight', { weightKg: null, distanceKm: 5 }],
    ['the very start of a run', { weightKg: 70, distanceKm: 0 }],
    ['no arguments', undefined],
  ]) {
    let r;
    let threw = false;
    try { r = estimateCalories(input); } catch { threw = true; }
    ok(`${label} gives null`, !threw && r === null, threw ? 'THREW' : String(r));
  }
}

console.log('\n━━━ 4. READING THE WEIGHT FIELD ━━━');
{
  ok('a plain number', parseWeightInput('70').value === 70);
  ok('a decimal', parseWeightInput('72.5').value === 72.5);
  // A comma decimal separator is what most of the world types.
  ok('a comma decimal separator', parseWeightInput('72,5').value === 72.5,
    String(parseWeightInput('72,5').value));
  ok('surrounding spaces', parseWeightInput('  70  ').value === 70);
  ok('rounded to two places, as the NUMERIC(5,2) column stores',
    parseWeightInput('70.456').value === 70.46, String(parseWeightInput('70.456').value));

  // Blank is "not set", not an error: the weight is optional.
  for (const blank of ['', '   ', null, undefined]) {
    const r = parseWeightInput(blank);
    ok(`blank (${JSON.stringify(blank)}) is allowed and means "not set"`,
      r.ok === true && r.value === null, JSON.stringify(r));
  }

  for (const [label, input] of [
    ['text', 'heavy'],
    ['below the minimum', '15'],
    ['above the maximum', '401'],
    ['a negative', '-70'],
  ]) {
    const r = parseWeightInput(input);
    ok(`${label} is refused with a message`,
      r.ok === false && typeof r.problem === 'string' && r.problem.length > 0,
      JSON.stringify(r));
  }

  ok('the exact bounds are accepted',
    parseWeightInput(String(MIN_WEIGHT_KG)).ok && parseWeightInput(String(MAX_WEIGHT_KG)).ok);
  ok('the refusal names the range, so the field can explain itself',
    /20/.test(parseWeightInput('15').problem) && /400/.test(parseWeightInput('15').problem),
    parseWeightInput('15').problem);
}

console.log(`\n${'─'.repeat(64)}`);
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
