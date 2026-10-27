import Group from '../entities/Group.js';
import Tournament from '../entities/Tournament.js';
import { validateText, validateDateRange, MAX_NAME_LENGTH, MAX_BIO_LENGTH } from './InputPolicy.js';

async function updateTournamentDetails(req, res) {
  try {
    const tournament = await Tournament.findById(req.params.tournamentId);
    if (!tournament) {
      return res.status(404).json({ error: 'Tournament not found' });
    }

    const isAdmin = await Group.isAdmin(tournament.groupId, req.user.userId);
    if (!isAdmin) {
      return res.status(403).json({ error: 'Only a group admin can update this tournament' });
    }

    const { name, description, distanceType, startDate, endDate } = req.body;

    const checkedName = validateText(name, {
      label: 'Tournament name',
      max: MAX_NAME_LENGTH,
      required: false,
    });
    if (!checkedName.ok) {
      return res.status(400).json({ error: checkedName.problem });
    }

    const checkedDescription = validateText(description, {
      label: 'Description',
      max: MAX_BIO_LENGTH,
      required: false,
    });
    if (!checkedDescription.ok) {
      return res.status(400).json({ error: checkedDescription.problem });
    }

    // `current` matters here: a request that moves only the end date still has to be checked
    // against the start date already stored, or the pair can be made backwards in two steps.
    const range = validateDateRange(
      { startDate, endDate },
      { current: { startDate: tournament.startDate, endDate: tournament.endDate } }
    );
    if (!range.ok) {
      return res.status(400).json({ error: range.problem });
    }

    const updated = await Tournament.update(req.params.tournamentId, {
      name: checkedName.value,
      description: checkedDescription.value,
      distanceType,
      startDate: range.value.startDate,
      endDate: range.value.endDate,
    });
    return res.status(200).json({ tournament: updated.toJSON() });
  } catch (err) {
    console.error('Update tournament details error:', err);
    return res.status(500).json({ error: 'Failed to update tournament' });
  }
}

export default updateTournamentDetails;
