import Group from '../entities/Group.js';
import Tournament from '../entities/Tournament.js';
import { ROLES } from '../entities/User.js';

const isPositiveInt = (value) => /^[1-9]\d*$/.test(String(value));
const isSystemAdmin = (req) => req.user?.role === ROLES.SYSTEM_ADMIN;

/**
 * router.param('groupId', blockSuspendedGroup)
 * 400 for a bad id, 404 if the group doesn't exist, 403 if it is suspended
 * (system admins can still access it). The loaded group is put on req.group.
 */
export async function blockSuspendedGroup(req, res, next, groupId) {
  try {
    if (!isPositiveInt(groupId)) return res.status(400).json({ error: 'Invalid group id' });

    const group = await Group.findById(groupId);
    if (!group) return res.status(404).json({ error: 'Group not found' });
    if (group.isSuspended && !isSystemAdmin(req)) {
      return res.status(403).json({ error: 'This group has been suspended' });
    }

    req.group = group;
    return next();
  } catch (err) {
    return next(err);
  }
}

/**
 * router.param('tournamentId', blockSuspendedTournamentGroup)
 * Same checks for tournaments; blocked when the tournament's group is suspended.
 */
export async function blockSuspendedTournamentGroup(req, res, next, tournamentId) {
  try {
    if (!isPositiveInt(tournamentId)) return res.status(400).json({ error: 'Invalid tournament id' });

    const tournament = await Tournament.findById(tournamentId);
    if (!tournament) return res.status(404).json({ error: 'Tournament not found' });

    const group = await Group.findById(tournament.groupId);
    if (group?.isSuspended && !isSystemAdmin(req)) {
      return res.status(403).json({ error: 'This tournament belongs to a suspended group' });
    }

    req.tournament = tournament;
    return next();
  } catch (err) {
    return next(err);
  }
}
