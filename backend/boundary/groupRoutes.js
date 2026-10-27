import express from 'express';
import createGroup from '../control/CreateGroupController.js';
import viewGroupDetails from '../control/ViewGroupDetailsController.js';
import updateGroupDetails from '../control/UpdateGroupDetailsController.js';
import searchGroups from '../control/SearchGroupsController.js';
import joinGroup from '../control/JoinGroupController.js';
import leaveGroup from '../control/LeaveGroupController.js';
import inviteUserToGroup from '../control/InviteUserToGroupController.js';
import respondToJoinRequest from '../control/RespondToJoinRequestController.js';
import removeMember from '../control/RemoveMemberController.js';
import promoteMember from '../control/PromoteMemberController.js';
import createTournament from '../control/CreateTournamentController.js';
import viewGroupTournaments from '../control/ViewGroupTournamentsController.js';
import viewGroupLeaderboard from '../control/ViewGroupLeaderboardController.js';
import viewMyGroups from '../control/ViewMyGroupsController.js';
import { requireAuth } from '../middleware/auth.js';
import { blockSuspendedGroup } from '../middleware/suspendedGroupGuard.js';

const router = express.Router();

router.use(requireAuth);
router.param('groupId', blockSuspendedGroup);

router.post('/', createGroup);
router.get('/mine', viewMyGroups);
router.get('/search', searchGroups);
router.get('/:groupId', viewGroupDetails);
router.put('/:groupId', updateGroupDetails);
router.post('/:groupId/join', joinGroup);
router.post('/:groupId/leave', leaveGroup);
router.post('/:groupId/invite', inviteUserToGroup);
router.post('/:groupId/requests/respond', respondToJoinRequest);
router.delete('/:groupId/members/:userId', removeMember);
router.post('/:groupId/members/:userId/promote', promoteMember);
router.post('/:groupId/tournaments', createTournament);
router.get('/:groupId/tournaments', viewGroupTournaments);
router.get('/:groupId/leaderboard', viewGroupLeaderboard);

export default router;
