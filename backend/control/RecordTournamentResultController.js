import Group from '../entities/Group.js';
import Tournament from '../entities/Tournament.js';

const MAX_RESULT_SECONDS = 24 * 60 * 60; // a day; anything longer is a typo

/**
 * Records a participant's finishing time, which is what gives the standings and ranking
 * something to work with.
 *
 * Two people may record a time:
 *   - the group admin, for any participant (the authoritative path, and how corrections
 *     are made after the fact)
 *   - a participant, for themselves only
 *
 * Results are only accepted once the tournament is under way — there is nothing to record
 * while registration is still open. Recording against a completed tournament is allowed so
 * a mistake can be corrected, and re-ranks everyone when it happens.
 *
 * Passing resultTimeSeconds: null clears a time recorded in error.
 */
async function recordTournamentResult(req, res) {
  try {
    const tournament = await Tournament.findById(req.params.tournamentId);
    if (!tournament) {
      return res.status(404).json({ error: 'Tournament not found' });
    }

    const { userId, resultTimeSeconds } = req.body ?? {};
    const targetId = userId ?? req.user.userId;
    const isSelf = String(targetId) === String(req.user.userId);
    const isAdmin = await Group.isAdmin(tournament.groupId, req.user.userId);

    if (!isSelf && !isAdmin) {
      return res.status(403).json({ error: "Only a group admin can record another runner's result" });
    }

    if (tournament.status === 'open') {
      return res.status(409).json({
        error: 'This tournament has not started yet, so there are no results to record',
      });
    }

    if (resultTimeSeconds !== null) {
      if (!Number.isInteger(resultTimeSeconds) || resultTimeSeconds <= 0) {
        return res.status(400).json({ error: 'resultTimeSeconds must be a whole number of seconds above zero' });
      }
      if (resultTimeSeconds > MAX_RESULT_SECONDS) {
        return res.status(400).json({ error: 'resultTimeSeconds must be less than 24 hours' });
      }
    }

    const participation = await Tournament.getParticipation(tournament.tournamentId, targetId);
    if (!participation || participation.withdrawn) {
      return res.status(404).json({
        error: isSelf
          ? 'You are not registered for this tournament'
          : 'That runner is not registered for this tournament',
      });
    }

    const row = await Tournament.recordResultAndRank(
      tournament.tournamentId,
      targetId,
      resultTimeSeconds ?? null
    );
    if (!row) {
      return res.status(404).json({ error: 'That runner is not registered for this tournament' });
    }

    const standings = await Tournament.getStandings(tournament.tournamentId);
    return res.status(200).json({
      message: resultTimeSeconds === null ? 'Result cleared' : 'Result recorded',
      standings,
    });
  } catch (err) {
    console.error('Record tournament result error:', err);
    return res.status(500).json({ error: 'Failed to record result' });
  }
}

export default recordTournamentResult;
