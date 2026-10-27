import express from 'express';
import viewTournamentDetails from '../control/ViewTournamentDetailsController.js';
import updateTournamentDetails from '../control/UpdateTournamentDetailsController.js';
import deleteTournament from '../control/DeleteTournamentController.js';
import setTournamentLimits from '../control/SetTournamentLimitsController.js';
import updateTournamentStatus from '../control/UpdateTournamentStatusController.js';
import joinTournament from '../control/JoinTournamentController.js';
import viewTournamentStandings from '../control/ViewTournamentStandingsController.js';
import recordTournamentResult from '../control/RecordTournamentResultController.js';
import withdrawFromTournament from '../control/WithdrawFromTournamentController.js';
import viewMyTournaments from '../control/ViewMyTournamentsController.js';
import viewAvailableTournaments from '../control/ViewAvailableTournamentsController.js';
import { requireAuth } from '../middleware/auth.js';
import { blockSuspendedTournamentGroup } from '../middleware/suspendedGroupGuard.js';

const router = express.Router();

router.use(requireAuth);
router.param('tournamentId', blockSuspendedTournamentGroup);

router.get('/mine', viewMyTournaments);
router.get('/available', viewAvailableTournaments);

router.get('/:tournamentId', viewTournamentDetails);
router.put('/:tournamentId', updateTournamentDetails);
router.delete('/:tournamentId', deleteTournament);
router.patch('/:tournamentId/limits', setTournamentLimits);
router.patch('/:tournamentId/status', updateTournamentStatus);
router.post('/:tournamentId/join', joinTournament);
router.get('/:tournamentId/standings', viewTournamentStandings);
// Group admin records for anyone; a participant records their own. Completing the
// tournament then ranks whatever has been recorded.
router.patch('/:tournamentId/results', recordTournamentResult);
router.post('/:tournamentId/withdraw', withdrawFromTournament);

export default router;
