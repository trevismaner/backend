import Group from '../entities/Group.js';
import Tournament from '../entities/Tournament.js';
import { validateText, validateDateRange, MAX_NAME_LENGTH, MAX_BIO_LENGTH } from './InputPolicy.js';

async function createTournament(req, res) {
  try {
    const isAdmin = await Group.isAdmin(req.params.groupId, req.user.userId);
    if (!isAdmin) {
      return res.status(403).json({ error: 'Only a group admin can create a tournament' });
    }

    const { name, description, distanceType, startDate, endDate } = req.body;

    const checkedName = validateText(name, { label: 'Tournament name', max: MAX_NAME_LENGTH });
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

    // Both dates parsed strictly and checked against each other. A tournament used to be
    // storable ending before it started, which gives it a negative duration — and anything
    // that works out progress over its window divides by that.
    const range = validateDateRange({ startDate, endDate });
    if (!range.ok) {
      return res.status(400).json({ error: range.problem });
    }

    const tournament = await Tournament.create({
      groupId: req.params.groupId,
      createdBy: req.user.userId,
      name: checkedName.value,
      description: checkedDescription.value,
      distanceType,
      startDate: range.value.startDate,
      endDate: range.value.endDate,
    });

    return res.status(201).json({ tournament: tournament.toJSON() });
  } catch (err) {
    console.error('Create tournament error:', err);
    return res.status(500).json({ error: 'Failed to create tournament' });
  }
}

export default createTournament;
