import express from 'express';
import viewAvailableRewards from '../control/ViewAvailableRewardsController.js';
import claimReward from '../control/ClaimRewardController.js';
import viewClaimedRewards from '../control/ViewClaimedRewardsController.js';
import viewUserBadges from '../control/ViewUserBadgesController.js';
import setBadgeDisplay from '../control/SetBadgeDisplayController.js';
import { requireAuth } from '../middleware/auth.js';

const router = express.Router();

router.use(requireAuth);

router.get('/', viewAvailableRewards);
router.post('/:rewardId/claim', claimReward);
router.get('/claimed', viewClaimedRewards);
router.get('/badges', viewUserBadges);
router.patch('/badges/:badgeId/display', setBadgeDisplay);

export default router;
