import assert from 'node:assert/strict';
import { describeSession, buildReminderMessage, buildMissedMessage } from '../control/SendPlanSessionRemindersController.js';

assert.equal(describeSession({ session_type: 'tempo', distance_km: '5.00' }), 'Tempo run, 5 km');
assert.equal(describeSession({ session_type: 'long', distance_km: '7.50' }), 'Long run, 7.5 km');
assert.equal(describeSession({ session_type: 'easy', distance_km: null, duration_minutes: 30 }), 'Easy run, 30 min');
assert.equal(describeSession({ session_type: 'cross_training', distance_km: null, duration_minutes: null }), 'Cross-training');
assert.equal(buildReminderMessage({ session_type: 'intervals', distance_km: '6' }).body, "Today's plan: Intervals, 6 km.");
assert.equal(buildMissedMessage({ session_type: 'easy', distance_km: '4' }).body, "Today's Easy run, 4 km is not done yet.");

console.log('plan reminder message tests passed');
