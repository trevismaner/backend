import express from 'express';
import { requireAuth } from '../middleware/auth.js';
import { requireSystemAdmin } from '../middleware/requireSystemAdmin.js';

// overview
import adminViewStats from './AdminViewStatsBoundary.js';
import adminViewAuditLogs from './AdminViewAuditLogsBoundary.js';
import adminSendAnnouncement from './AdminSendAnnouncementBoundary.js';

// users
import adminListUsers from './AdminListUsersBoundary.js';
import adminViewUser from './AdminViewUserBoundary.js';
import adminCreateUser from './AdminCreateUserBoundary.js';
import adminSetUserSuspension from './AdminSetUserSuspensionBoundary.js';
import adminUpdateUserRole from './AdminUpdateUserRoleBoundary.js';
import adminDeleteUser from './AdminDeleteUserBoundary.js';
import adminUpdateUser from './AdminUpdateUserBoundary.js';
import adminSetInstructorVerification from './AdminSetInstructorVerificationBoundary.js';
import adminAwardBadge from './AdminAwardBadgeBoundary.js';
import adminRevokeBadge from './AdminRevokeBadgeBoundary.js';

// groups
import adminListGroups from './AdminListGroupsBoundary.js';
import adminSetGroupSuspension from './AdminSetGroupSuspensionBoundary.js';
import adminDeleteGroup from './AdminDeleteGroupBoundary.js';
import adminUpdateGroup from './AdminUpdateGroupBoundary.js';

// rewards
import adminListRewards from './AdminListRewardsBoundary.js';
import adminCreateReward from './AdminCreateRewardBoundary.js';
import adminUpdateReward from './AdminUpdateRewardBoundary.js';

// badges
import adminListBadges from './AdminListBadgesBoundary.js';
import adminCreateBadge from './AdminCreateBadgeBoundary.js';
import adminUpdateBadge from './AdminUpdateBadgeBoundary.js';
import adminDeleteBadge from './AdminDeleteBadgeBoundary.js';

// public events (SA-12 to SA-15)
import adminCreatePublicEvent from './AdminCreatePublicEventBoundary.js';
import adminUpdatePublicEvent from './AdminUpdatePublicEventBoundary.js';
import adminDeletePublicEvent from './AdminDeletePublicEventBoundary.js';
import adminViewPublicEvents from './AdminListPublicEventsBoundary.js';
import adminViewPublicEventDetails from './AdminViewPublicEventBoundary.js';

// runs
import adminListRuns from './AdminListRunsBoundary.js';
import adminDeleteRun from './AdminDeleteRunBoundary.js';

const router = express.Router();

router.use(requireAuth, requireSystemAdmin);

router.get('/stats', adminViewStats);
router.get('/audit-logs', adminViewAuditLogs);
router.post('/announcements', adminSendAnnouncement);

router.get('/users', adminListUsers);
router.post('/users', adminCreateUser);
router.get('/users/:userId', adminViewUser);
router.patch('/users/:userId/suspension', adminSetUserSuspension);
router.patch('/users/:userId/role', adminUpdateUserRole);
router.patch('/users/:userId/instructor-verification', adminSetInstructorVerification);
router.put('/users/:userId', adminUpdateUser);   // SA-06
router.delete('/users/:userId', adminDeleteUser);
router.post('/users/:userId/badges', adminAwardBadge);
router.delete('/users/:userId/badges/:badgeId', adminRevokeBadge);

router.get('/groups', adminListGroups);
router.patch('/groups/:groupId/suspension', adminSetGroupSuspension);
router.put('/groups/:groupId', adminUpdateGroup);   // SA-21
router.delete('/groups/:groupId', adminDeleteGroup);

router.get('/rewards', adminListRewards);
router.post('/rewards', adminCreateReward);
router.patch('/rewards/:rewardId', adminUpdateReward);

router.get('/badges', adminListBadges);
router.post('/badges', adminCreateBadge);
router.patch('/badges/:badgeId', adminUpdateBadge);
router.delete('/badges/:badgeId', adminDeleteBadge);

router.get('/public-events', adminViewPublicEvents);                 // SA-13
router.post('/public-events', adminCreatePublicEvent);               // SA-12
router.get('/public-events/:eventId', adminViewPublicEventDetails);  // SA-13
router.put('/public-events/:eventId', adminUpdatePublicEvent);       // SA-14
router.delete('/public-events/:eventId', adminDeletePublicEvent);    // SA-15

router.get('/runs', adminListRuns);
router.delete('/runs/:runId', adminDeleteRun);

export default router;
