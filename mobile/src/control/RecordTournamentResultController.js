import Tournament from '../entities/Tournament.js';

const MAX_SECONDS = 24 * 60 * 60;

/**
 * Turns a typed time into seconds and records it.
 *
 * Accepts the shapes people actually type: "1:25:12", "25:12", or a plain number of
 * minutes. Pass clear: true to remove a time recorded in error.
 */
export function parseTimeToSeconds(input) {
  const text = String(input ?? '').trim();
  if (!text) return null;

  const parts = text.split(':').map((p) => p.trim());
  if (parts.some((p) => p === '' || !/^\d+$/.test(p))) return null;

  let seconds;
  if (parts.length === 1) seconds = Number(parts[0]) * 60;            // plain minutes
  else if (parts.length === 2) seconds = Number(parts[0]) * 60 + Number(parts[1]);
  else if (parts.length === 3) seconds = Number(parts[0]) * 3600 + Number(parts[1]) * 60 + Number(parts[2]);
  else return null;

  if (parts.length > 1 && parts.slice(1).some((p) => Number(p) > 59)) return null;
  return Number.isInteger(seconds) && seconds > 0 && seconds <= MAX_SECONDS ? seconds : null;
}

async function recordTournamentResultController({ tournamentId, userId, time, clear = false } = {}) {
  if (!tournamentId) {
    return { success: false, field: 'tournamentId', message: 'A tournament is required.' };
  }

  let resultTimeSeconds = null;
  if (!clear) {
    resultTimeSeconds = parseTimeToSeconds(time);
    if (resultTimeSeconds === null) {
      return {
        success: false,
        field: 'time',
        message: 'Enter a time as h:mm:ss, mm:ss, or a number of minutes.',
      };
    }
  }

  try {
    const data = await Tournament.recordResult(tournamentId, { userId, resultTimeSeconds });
    return { success: true, field: null, message: data.message, data };
  } catch (err) {
    return { success: false, field: null, message: err.message };
  }
}

export default recordTournamentResultController;
