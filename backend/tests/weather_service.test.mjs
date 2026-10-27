/**
 * Tests WeatherService against a local stub that replicates Open-Meteo's documented
 * response shape. This container cannot reach the internet, so the live endpoint is
 * NOT exercised here — what is proven is the parsing, the scoring, the caching, and
 * every failure path.
 */
import http from 'node:http';

process.env.WEATHER_API_URL = 'http://localhost:4801/v1/forecast';
const W = await import('../control/WeatherService.js');
const { scoreRisk } = await import('../control/RiskScoringService.js');

let pass = 0, fail = 0;
function check(label, ok, detail) {
  if (ok) { pass++; console.log(`  ok   ${label}`); }
  else { fail++; console.log(`  FAIL ${label}\n         ${detail}`); }
}

// ── the stub. Payload copied from Open-Meteo's documented current-weather shape. ──
let mode = 'hot';
let requests = [];
const server = http.createServer((req, res) => {
  requests.push(req.url);
  if (mode === 'down') { res.writeHead(503); res.end('unavailable'); return; }
  if (mode === 'garbage') { res.writeHead(200, { 'Content-Type': 'text/html' }); res.end('<html>nope</html>'); return; }
  if (mode === 'hang') { return; } // never responds
  const current = {
    hot:   { temperature_2m: 31.4, relative_humidity_2m: 88, apparent_temperature: 38.2, precipitation: 0,   weather_code: 2 },
    mild:  { temperature_2m: 18.0, relative_humidity_2m: 55, apparent_temperature: 17.5, precipitation: 0,   weather_code: 1 },
    storm: { temperature_2m: 27.0, relative_humidity_2m: 90, apparent_temperature: 31.0, precipitation: 6.4, weather_code: 95 },
    icy:   { temperature_2m: -3.0, relative_humidity_2m: 70, apparent_temperature: -8.0, precipitation: 0.4, weather_code: 73 },
  }[mode];
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({
    latitude: 1.375, longitude: 103.875, generationtime_ms: 0.03, utc_offset_seconds: 0,
    timezone: 'GMT', elevation: 24.0,
    current_units: { time: 'iso8601', temperature_2m: '°C', relative_humidity_2m: '%', apparent_temperature: '°C', precipitation: 'mm', weather_code: 'wmo code' },
    current: { time: '2026-09-21T14:00', interval: 900, ...current },
  }));
});
await new Promise((r) => server.listen(4801, r));

console.log('\n━━━ PARSING A REAL-SHAPED RESPONSE ━━━');
W.__clearCache();
let weather = await W.fetchCurrentWeather(1.35, 103.82);
check('reads the current block', weather !== null, 'got null');
check('maps apparent_temperature (feels-like)', weather.apparentTemperatureC === 38.2, JSON.stringify(weather));
check('maps humidity', weather.humidityPercent === 88, JSON.stringify(weather));
check('maps weather_code', weather.weatherCode === 2, JSON.stringify(weather));
check('request asks for the fields we parse',
  /current=temperature_2m.*apparent_temperature.*weather_code/.test(decodeURIComponent(requests[0])),
  requests[0]);
check('coordinates are passed through', /latitude=1\.3500&longitude=103\.8200/.test(requests[0]), requests[0]);

console.log('\n━━━ CONDITIONS PRODUCE SENSIBLE MODIFIERS ━━━');
const hot = W.weatherModifierFrom(weather);
check('hot and humid scores a real penalty', hot.value >= 9 && hot.live === true, JSON.stringify(hot));
check('the note explains why, in words', /feels like 38°C/.test(hot.note) && /88% humidity/.test(hot.note), hot.note);

mode = 'mild'; W.__clearCache();
const mild = W.weatherModifierFrom(await W.fetchCurrentWeather(51.5, -0.12));
check('mild weather adds nothing', mild.value === 0, JSON.stringify(mild));

mode = 'storm'; W.__clearCache();
const storm = W.weatherModifierFrom(await W.fetchCurrentWeather(1.35, 103.82));
check('thunderstorms score higher than plain heat', storm.value > hot.value - 5 && /thunderstorm/.test(storm.note), JSON.stringify(storm));

mode = 'icy'; W.__clearCache();
const icy = W.weatherModifierFrom(await W.fetchCurrentWeather(60.1, 24.9));
check('freezing conditions are flagged too', icy.value > 0 && /ice or snow|icy/.test(icy.note), JSON.stringify(icy));

console.log('\n━━━ FAILURE PATHS FALL BACK, NEVER THROW ━━━');
mode = 'down'; W.__clearCache();
const whenDown = await W.fetchCurrentWeather(1.35, 103.82);
check('a 503 returns null rather than throwing', whenDown === null, JSON.stringify(whenDown));
check('null falls back to the standing allowance', W.weatherModifierFrom(null).value === W.STANDING_ALLOWANCE.value, JSON.stringify(W.weatherModifierFrom(null)));
check('the fallback is not marked live', W.weatherModifierFrom(null).live !== true, JSON.stringify(W.weatherModifierFrom(null)));

mode = 'garbage'; W.__clearCache();
check('an HTML response returns null rather than throwing', (await W.fetchCurrentWeather(1.35, 103.82)) === null);

W.__clearCache();
process.env.WEATHER_API_URL = 'http://localhost:4899/v1/forecast'; // nothing listening
const offline = await import('../control/WeatherService.js?v=offline');
check('an unreachable host returns null rather than throwing', (await offline.fetchCurrentWeather(1.35, 103.82)) === null);
process.env.WEATHER_API_URL = 'http://localhost:4801/v1/forecast';

console.log('\n━━━ TIMEOUT ━━━');
mode = 'hang'; W.__clearCache();
const sockets = new Set();
server.on('connection', (s) => sockets.add(s));
const started = Date.now();
const hung = await W.fetchCurrentWeather(2.2, 104.4);
const elapsed = Date.now() - started;
check('a hanging service is abandoned, not waited on forever', hung === null && elapsed < 6000, `returned ${hung} after ${elapsed}ms`);
for (const s of sockets) s.destroy();

console.log('\n━━━ CACHING (a free service should not be hammered) ━━━');
mode = 'hot'; W.__clearCache(); requests = [];
await W.fetchCurrentWeather(1.3521, 103.8198);
await W.fetchCurrentWeather(1.3521, 103.8198);
await W.fetchCurrentWeather(1.3525, 103.8195);   // same 2dp bucket
check('repeat lookups hit the cache', requests.length === 1, `${requests.length} requests made`);
await W.fetchCurrentWeather(48.85, 2.35);
check('a different location is fetched separately', requests.length === 2, `${requests.length} requests made`);

console.log('\n━━━ IT ACTUALLY CHANGES THE RISK SCORE ━━━');
const form = { selfRatedSoreness: 4, chronicConditions: [], pastInjuries: [], isCurrentlySick: false };
const runStats = { last7DaysKm: 20, last7DaysRuns: 3, previous28DaysKm: 72, recentAvgHeartRate: null, baselineAvgHeartRate: null };

mode = 'mild'; W.__clearCache();
const scoreMild = scoreRisk({ form, runStats, weather: W.weatherModifierFrom(await W.fetchCurrentWeather(51.5, -0.12)) });
mode = 'hot'; W.__clearCache();
const scoreHot = scoreRisk({ form, runStats, weather: W.weatherModifierFrom(await W.fetchCurrentWeather(1.35, 103.82)) });

check('the same runner scores higher in dangerous heat', scoreHot.finalScore > scoreMild.finalScore,
  `mild ${scoreMild.finalScore} vs hot ${scoreHot.finalScore}`);
check('the weather modifier is what differs',
  scoreHot.weatherModifier > scoreMild.weatherModifier && scoreHot.mlBaseScore === scoreMild.mlBaseScore,
  `mild ${scoreMild.weatherModifier} vs hot ${scoreHot.weatherModifier}`);
check('the explanation says the reading is live', scoreHot.explanation.weatherIsLive === true, JSON.stringify(scoreHot.explanation));
check('heat shows up in the contributing factors', 'heat_and_humidity' in scoreHot.contributingFactors, JSON.stringify(scoreHot.contributingFactors));

const scoreNoWeather = scoreRisk({ form, runStats });
check('scoring still works with no weather at all (fallback)', scoreNoWeather.weatherModifier === 4 && scoreNoWeather.explanation.weatherIsLive === false,
  JSON.stringify({ mod: scoreNoWeather.weatherModifier, live: scoreNoWeather.explanation.weatherIsLive }));

server.close();
console.log(`\n${'─'.repeat(62)}\n  ${pass} passed, ${fail} failed\n${'─'.repeat(62)}`);
process.exit(fail ? 1 : 0);
