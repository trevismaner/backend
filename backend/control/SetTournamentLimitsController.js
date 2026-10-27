import Group from '../entities/Group.js';
import Tournament from '../entities/Tournament.js';
import { validateCount, parseCalendarDate } from './InputPolicy.js';

/** A tournament nobody could realistically run, but high enough never to block a real one. */
const MAX_PARTICIPANTS = 100000;

async function setTournamentLimits(req, res) {
  try {
    const tournament = await Tournament.findById(req.params.tournamentId);
    if (!tournament) {
      return res.status(404).json({ error: 'Tournament not found' });
    }

    const isAdmin = await Group.isAdmin(tournament.groupId, req.user.userId);
    if (!isAdmin) {
      return res.status(403).json({ error: 'Only a group admin can set tournament limits' });
    }

    const { maxParticipants, registrationDeadline } = req.body;

    // Neither field given. This used to return 200 and change nothing, so a request with a
    // misspelled field name looked like it had worked.
    if (maxParticipants === undefined && registrationDeadline === undefined) {
      return res.status(400).json({
        error: 'Provide maxParticipants, registrationDeadline, or both',
      });
    }

    let limit;
    if (maxParticipants !== undefined) {
      // The shape check has to come before the comparison below. Previously the only test
      // was against the registered count, which let `0` through (a tournament nobody can
      // join) and `100000000` through, sent `"many"` to the database as a 500, and refused
      // `-5` with "cannot be below the current registered count" — true, but not the reason.
      const checked = validateCount(maxParticipants, {
        label: 'Maximum participants',
        min: 1,
        max: MAX_PARTICIPANTS,
      });
      if (!checked.ok) {
        return res.status(400).json({ error: checked.problem });
      }
      limit = checked.value;

      const currentCount = await Tournament.countParticipants(tournament.tournamentId);
      if (limit < currentCount) {
        return res.status(400).json({
          error: `Participant limit cannot be below the ${currentCount} already registered`,
        });
      }
    }

    let deadline;
    if (registrationDeadline !== undefined) {
      // Parsed strictly, so an impossible date is refused as one. `2026-11-31` used to be
      // accepted silently as 1 December, or surface as a 500 from Postgres, depending on
      // whether the rolled-over date happened to land in the future.
      const checked = parseCalendarDate(registrationDeadline, {
        label: 'Registration deadline',
      });
      if (!checked.ok) {
        return res.status(400).json({ error: checked.problem });
      }
      deadline = checked.value;

      if (deadline < new Date()) {
        return res.status(400).json({ error: 'Registration deadline cannot be in the past' });
      }
      // A deadline after the tournament has finished is not a deadline. Checked against the
      // end date only when there is one, since a tournament can be created without dates.
      if (tournament.endDate && deadline > new Date(tournament.endDate)) {
        return res.status(400).json({
          error: 'Registration deadline cannot be after the tournament ends',
        });
      }
    }

    const updated = await Tournament.setLimits(req.params.tournamentId, {
      maxParticipants: limit,
      registrationDeadline: deadline,
    });
    return res.status(200).json({ tournament: updated.toJSON() });
  } catch (err) {
    console.error('Set tournament limits error:', err);
    return res.status(500).json({ error: 'Failed to update tournament limits' });
  }
}

export default setTournamentLimits;
