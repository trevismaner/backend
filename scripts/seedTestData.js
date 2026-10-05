/**
 * Fills a database with a worked-through example of the whole app, so every role can be
 * logged into and demonstrated without clicking anything into existence first.
 *
 *   npm run seed            # seed, keeping whatever is already there
 *   npm run seed:reset      # wipe the app's tables first, then seed
 *
 * Every account uses the same password: Password123
 * The full list of logins is printed at the end.
 *
 * SAFETY: --reset deletes every row from the application tables. It refuses to run when
 * NODE_ENV=production. Point .env at a scratch database (e.g. run_league_demo) before using it.
 */
import bcrypt from 'bcryptjs';
import pool from '../config/db.js';
import { withTransaction } from '../config/transaction.js';
import User, { ROLES } from '../entities/User.js';
import Group from '../entities/Group.js';
import Tournament from '../entities/Tournament.js';
import Run from '../entities/Run.js';
import Reward from '../entities/Reward.js';
import Badge from '../entities/Badge.js';
import Notification from '../entities/Notification.js';
import PublicEvent from '../entities/PublicEvent.js';
import InstructorPost from '../entities/InstructorPost.js';
import FitnessPlan from '../entities/FitnessPlan.js';
import RiskAssessment from '../entities/RiskAssessment.js';

const PASSWORD = 'Password123';
const RESET = process.argv.includes('--reset');

// Tables the app owns, child-first so plain DELETEs are enough.
const APP_TABLES = [
  'admin_audit_logs', 'notifications', 'user_notification_preferences',
  'user_badges', 'user_claimed_rewards', 'user_points',
  'tournament_participants', 'tournaments',
  'public_event_participants', 'public_events',
  'group_members', 'groups',
  'instructor_posts', 'risk_scores', 'risk_assessment_forms', 'fitness_plans',
  'oauth_states', 'connected_wearables', 'connected_social_accounts',
  'active_runs', 'runs', 'users',
];

const daysAgo = (n) => new Date(Date.now() - n * 86400000);
const daysAhead = (n) => new Date(Date.now() + n * 86400000);
const log = (msg) => console.log(`  ${msg}`);

async function reset() {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Refusing to reset: NODE_ENV is production');
  }
  await withTransaction(async (client) => {
    // A table a migration has not been applied for yet is skipped rather than failing the
    // whole reset — active_runs, for instance, arrives with 005_run_tracking.sql.
    const present = new Set(
      (await client.query(
        `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`
      )).rows.map((row) => row.table_name)
    );

    for (const table of APP_TABLES) {
      if (!present.has(table)) {
        log(`skipping ${table} (not in this database yet — run the migrations)`);
        continue;
      }
      await client.query(`DELETE FROM ${table}`);
    }
    // Keep the reference catalogues from schema.sql, but restart ids so output is stable.
    await client.query('ALTER SEQUENCE users_user_id_seq RESTART WITH 1');
  });
  log(`cleared ${APP_TABLES.length} tables`);
}

/** The reward and badge catalogues come from schema.sql; re-insert if the DB was emptied. */
async function ensureCatalogues() {
  const { rows: [r] } = await pool.query('SELECT COUNT(*)::int AS c FROM rewards');
  if (r.c === 0) {
    await pool.query(
      `INSERT INTO rewards (name, description, points_required, reward_type, stock) VALUES
       ('$10 Sportswear Voucher', 'Redeemable at participating sportswear stores', 500, 'voucher', NULL),
       ('$25 Sportswear Voucher', 'Redeemable at participating sportswear stores', 1200, 'voucher', NULL),
       ('1-Month Gym Membership', 'One month access to a partner gym', 2000, 'membership', 50),
       ('Run League Cap', 'Limited edition cap', 300, 'voucher', 100)`
    );
    log('restored the reward catalogue');
  }
  const { rows: [b] } = await pool.query('SELECT COUNT(*)::int AS c FROM badges');
  if (b.c === 0) {
    await pool.query(
      `INSERT INTO badges (name, description, icon_url) VALUES
       ('First Steps', 'Completed your first run', NULL),
       ('Consistent Runner', 'Completed 10 runs', NULL),
       ('Marathoner', 'Accumulated 100km total distance', NULL),
       ('Team Player', 'Joined your first group', NULL),
       ('Competitor', 'Joined your first tournament', NULL)`
    );
    log('restored the badge catalogue');
  }
}

/** Creates the account, or reuses and re-roles it if the email is already taken. */
async function account({ email, name, role, bio = null, verified = false, suspended = false }) {
  const existing = await User.findByEmail(email);
  const hash = await bcrypt.hash(PASSWORD, 10);

  let user = existing;
  if (user) {
    await User.setRole(user.userId, role);
    user = await User.adminUpdate(user.userId, { name, passwordHash: hash, bio });
  } else {
    user = await User.create({ email, passwordHash: hash, name, role });
    if (bio) user = await User.updateProfile(user.userId, { bio });
  }

  if (role === ROLES.INSTRUCTOR) await User.setCredentialsVerified(user.userId, verified);
  if (suspended !== user.isSuspended) await User.setSuspended(user.userId, suspended);

  return user;
}

/** A run with a plausible pace, so insights and the risk score have something to chew on. */
async function run(userId, { name, km, daysBack, minutesPerKm = 5.5, hr = null, calories = null }) {
  const durationSeconds = Math.round(km * minutesPerKm * 60);
  const startedAt = daysAgo(daysBack);
  return Run.create(userId, {
    name,
    distanceKm: km,
    durationSeconds,
    startedAt,
    endedAt: new Date(startedAt.getTime() + durationSeconds * 1000),
    caloriesBurned: calories ?? Math.round(km * 62),
    avgHeartRate: hr,
    maxHeartRate: hr ? hr + 18 : null,
  });
}

async function main() {
  console.log(`\nSeeding "${process.env.DB_NAME}" on ${process.env.DB_HOST}:${process.env.DB_PORT}\n`);

  if (RESET) await reset();
  await ensureCatalogues();

  // ─────────────── accounts, one per role ───────────────
  console.log('\nAccounts');
  const admin = await account({
    email: 'admin@runleague.test', name: 'Priya Admin', role: ROLES.SYSTEM_ADMIN,
    bio: 'Keeps the platform tidy.',
  });
  const coach = await account({
    email: 'coach@runleague.test', name: 'Marcus Webb', role: ROLES.INSTRUCTOR, verified: true,
    bio: 'Level 3 running coach. 12 years with distance runners.',
  });
  const newCoach = await account({
    email: 'newcoach@runleague.test', name: 'Hana Okafor', role: ROLES.INSTRUCTOR, verified: false,
    bio: 'Just joined — credentials pending review.',
  });
  const alice = await account({
    email: 'alice@runleague.test', name: 'Alice Tan', role: ROLES.REGISTERED_USER,
    bio: 'Training for my first half marathon.',
  });
  const ben = await account({
    email: 'ben@runleague.test', name: 'Ben Carter', role: ROLES.REGISTERED_USER,
    bio: 'Parkrun every Saturday.',
  });
  const chloe = await account({
    email: 'chloe@runleague.test', name: 'Chloe Nguyen', role: ROLES.REGISTERED_USER,
    bio: 'Back after injury, taking it slow.',
  });
  const dan = await account({
    email: 'dan@runleague.test', name: 'Dan Fischer', role: ROLES.REGISTERED_USER,
    bio: 'Brand new here.',
  });
  const banned = await account({
    email: 'suspended@runleague.test', name: 'Sam Rowe', role: ROLES.REGISTERED_USER, suspended: true,
  });
  log(`8 accounts (1 admin, 2 instructors, 5 runners — one suspended)`);

  // ─────────────── runs ───────────────
  console.log('\nRuns');
  // Alice: a consistent block, enough for the 10-run badge and a visible weekly trend
  for (let i = 0; i < 12; i++) {
    await run(alice.userId, {
      name: ['Morning loop', 'River path', 'Hill repeats', 'Easy shakeout'][i % 4],
      km: [5, 8, 6.5, 4][i % 4],
      daysBack: 26 - i * 2,
      minutesPerKm: 5.4 + (i % 3) * 0.2,
      hr: 148 + (i % 4) * 5,
    });
  }
  // Ben: high mileage, tops the leaderboard, and 5 runs in 7 days triggers the overtraining alert
  for (let i = 0; i < 16; i++) {
    await run(ben.userId, {
      name: i % 5 === 0 ? 'Long run' : 'Tempo',
      km: i % 5 === 0 ? 21.1 : 10,
      daysBack: i < 6 ? i : 6 + i * 2,
      minutesPerKm: 4.8,
      hr: 160,
    });
  }
  // Chloe: a single recent run, so she is neither idle nor overtrained
  await run(chloe.userId, { name: 'First run back', km: 3, daysBack: 1, minutesPerKm: 7.2, hr: 138 });
  // Dan: nothing logged, and no runs for 3+ days means the exercise reminder has someone to find
  log('29 runs across 3 runners; Dan has none (so the reminder job has a target)');

  // points and badges follow from the runs, the same way CreateRunController does it
  for (const u of [alice, ben, chloe]) {
    const { rows: [{ total }] } = await pool.query(
      'SELECT COALESCE(SUM(distance_km), 0)::float AS total FROM runs WHERE user_id = $1', [u.userId]
    );
    await Reward.addPoints(u.userId, Math.round(total * 10));
    await Badge.checkAndAwardRunMilestones(u.userId);
  }
  log('points awarded at 10/km, run milestone badges checked');

  // ─────────────── groups ───────────────
  console.log('\nGroups');
  const wollongong = await Group.create({
    name: 'Wollongong Runners', description: 'Weekly social runs around the lighthouse.',
    isPrivate: false, maxMembers: 20, createdBy: alice.userId,
  });
  await Group.addMemberWithCapacity(wollongong.groupId, ben.userId);
  await Group.addMemberWithCapacity(wollongong.groupId, chloe.userId);
  await Group.addMemberWithCapacity(wollongong.groupId, coach.userId);
  await Group.promoteMember(wollongong.groupId, ben.userId);

  const dawn = await Group.create({
    name: 'Dawn Patrol', description: 'Invite only. 5am starts.',
    isPrivate: true, maxMembers: 6, createdBy: ben.userId,
  });
  await Group.addMemberWithCapacity(dawn.groupId, alice.userId);
  await Group.addMemberWithCapacity(dawn.groupId, dan.userId, 'pending'); // a request to approve
  await Group.addMember(dawn.groupId, chloe.userId, 'invited');           // an invite to accept

  const flagged = await Group.create({
    name: 'Under Review', description: 'Reported by members — left suspended on purpose.',
    isPrivate: false, createdBy: dan.userId,
  });
  await Group.setSuspended(flagged.groupId, true);
  log('3 groups: public (4 members), private (1 pending + 1 invited), 1 suspended');

  // ─────────────── tournaments, one per status ───────────────
  console.log('\nTournaments');
  const openTour = await Tournament.create({
    groupId: wollongong.groupId, createdBy: alice.userId,
    name: 'Spring 5K', description: 'Flat and fast.', distanceType: '5K',
    startDate: daysAhead(10), endDate: daysAhead(10),
  });
  await Tournament.setLimits(openTour.tournamentId, { maxParticipants: 10, registrationDeadline: daysAhead(7) });
  await Tournament.joinWithCapacity(openTour.tournamentId, alice.userId);
  await Tournament.joinWithCapacity(openTour.tournamentId, ben.userId);

  const runningTour = await Tournament.create({
    groupId: wollongong.groupId, createdBy: alice.userId,
    name: 'Winter 10K', distanceType: '10K', startDate: daysAgo(2), endDate: daysAhead(5),
  });
  await Tournament.joinWithCapacity(runningTour.tournamentId, alice.userId);
  await Tournament.joinWithCapacity(runningTour.tournamentId, ben.userId);
  await Tournament.joinWithCapacity(runningTour.tournamentId, chloe.userId);
  await Tournament.updateStatus(runningTour.tournamentId, 'in_progress');

  const doneTour = await Tournament.create({
    groupId: wollongong.groupId, createdBy: alice.userId,
    name: 'Summer Half', distanceType: 'Half Marathon', startDate: daysAgo(30), endDate: daysAgo(30),
  });
  for (const u of [alice, ben, chloe]) await Tournament.joinWithCapacity(doneTour.tournamentId, u.userId);
  await Tournament.updateStatus(doneTour.tournamentId, 'in_progress');
  await Tournament.recordResult(doneTour.tournamentId, ben.userId, 5112);    // 1:25:12
  await Tournament.recordResult(doneTour.tournamentId, alice.userId, 6840);  // 1:54:00
  await Tournament.recordResult(doneTour.tournamentId, chloe.userId, 8130);  // 2:15:30
  await Tournament.updateStatus(doneTour.tournamentId, 'completed');         // ranks calculated here
  log('3 tournaments: open (2 entries), in progress (3), completed with ranked results');

  // ─────────────── public events (admin-run) ───────────────
  console.log('\nPublic events');
  const cityRun = await PublicEvent.create({
    createdBy: admin.userId, name: 'City Harbour 10K',
    description: 'Platform-wide event, open to everyone.',
    maxParticipants: 500, registrationDeadline: daysAhead(14),
    startDate: daysAhead(21), endDate: daysAhead(21),
  });
  await PublicEvent.join(cityRun.eventId, alice.userId);
  await PublicEvent.join(cityRun.eventId, ben.userId);
  await PublicEvent.create({
    createdBy: admin.userId, name: 'New Year Fun Run',
    description: 'Untimed, all paces welcome.',
    maxParticipants: null, startDate: daysAhead(90), endDate: daysAhead(90),
  });
  log('2 public events, one with 2 entries');

  // ─────────────── instructor board ───────────────
  console.log('\nInstructor board');
  await InstructorPost.create({
    authorId: coach.userId, title: 'Why your easy runs should feel too easy',
    category: 'training',
    content: 'Most runners run their easy days too hard, which leaves them too tired to make '
      + 'the hard days count. If you can hold a conversation, you are in the right zone.',
  });
  await InstructorPost.create({
    authorId: coach.userId, title: 'Eating before an early run',
    category: 'nutrition',
    content: 'For anything under an hour, water is usually enough. Beyond that, something '
      + 'small and familiar 30 minutes beforehand beats anything new on race day.',
  });
  await InstructorPost.create({
    authorId: admin.userId, title: 'Platform update: public events are live',
    category: 'announcement',
    content: 'You can now enter platform-wide events from the Events tab, without joining a group first.',
  });
  log('3 posts (2 from the verified instructor, 1 from the admin)');

  // ─────────────── fitness plans and risk assessment ───────────────
  console.log('\nPlans and risk');
  await FitnessPlan.create(alice.userId, {
    goalType: 'race_prep', targetDistanceKm: 21.1, weeklyFrequency: 4, durationWeeks: 12,
  });
  await FitnessPlan.create(chloe.userId, {
    goalType: 'general_fitness', targetDistanceKm: 5, weeklyFrequency: 2, durationWeeks: 8,
  });
  await RiskAssessment.saveForm(chloe.userId, {
    isCurrentlySick: false, chronicConditions: ['asthma'],
    pastInjuries: [{ type: 'shin splints', date: '2026-05-02', resolved: true }],
    selfRatedSoreness: 6,
  });
  await RiskAssessment.saveForm(alice.userId, {
    isCurrentlySick: false, chronicConditions: [], pastInjuries: [], selfRatedSoreness: 2,
  });
  log('2 fitness plans, 2 risk assessment forms');

  // ─────────────── rewards claimed ───────────────
  console.log('\nRewards');
  const cap = (await Reward.getActive()).find((r) => r.name === 'Run League Cap');
  if (cap) {
    const claim = await Reward.claim(ben.userId, cap.rewardId);
    log(claim.ok ? `Ben claimed "${cap.name}" (${claim.remainingPoints} points left)` : `claim skipped: ${claim.reason}`);
  }

  // ─────────────── notifications ───────────────
  console.log('\nNotifications');
  await Notification.broadcast({
    type: 'announcement', title: 'Welcome to Run League',
    body: 'Log a run to start earning points towards rewards.',
  });
  await Notification.create(alice.userId, {
    type: 'tournament_update', title: 'Winter 10K has started',
    body: 'Your tournament is now in progress. Log your run before it closes.',
  });
  log('welcome announcement to everyone, plus 1 tournament update');

  // ─────────────── summary ───────────────
  const counts = await pool.query(
    `SELECT (SELECT COUNT(*)::int FROM users) AS users,
            (SELECT COUNT(*)::int FROM runs) AS runs,
            (SELECT COUNT(*)::int FROM groups) AS groups,
            (SELECT COUNT(*)::int FROM tournaments) AS tournaments,
            (SELECT COUNT(*)::int FROM public_events) AS events,
            (SELECT COUNT(*)::int FROM instructor_posts) AS posts,
            (SELECT COUNT(*)::int FROM notifications) AS notifications`
  );
  const c = counts.rows[0];

  const rows = [
    ['System admin', admin.email, 'everything under /api/admin'],
    ['Instructor (verified)', coach.email, 'can post to the instructor board'],
    ['Instructor (unverified)', newCoach.email, 'awaiting SA-11 verification'],
    ['Runner — active', alice.email, '12 runs, group admin, 3 tournaments, a plan'],
    ['Runner — top of board', ben.email, '16 runs, claimed a reward, overtraining alert'],
    ['Runner — returning', chloe.email, '1 run, risk assessment on file'],
    ['Runner — brand new', dan.email, 'no runs: the reminder job targets him'],
    ['Runner — suspended', banned.email, 'login is refused (403)'],
  ];

  const w = Math.max(...rows.map((r) => r[0].length));
  console.log('\n' + '─'.repeat(78));
  console.log(`  Seeded: ${c.users} users · ${c.runs} runs · ${c.groups} groups · ${c.tournaments} tournaments`);
  console.log(`          ${c.events} public events · ${c.posts} posts · ${c.notifications} notifications`);
  console.log('─'.repeat(78));
  console.log(`\n  Every account's password is:  ${PASSWORD}\n`);
  for (const [label, email, note] of rows) {
    console.log(`  ${label.padEnd(w)}  ${email.padEnd(28)} ${note}`);
  }
  console.log('\n─'.repeat(1) + '─'.repeat(77));
  console.log('  Log in with:');
  console.log(`    curl -X POST http://localhost:${process.env.PORT || 3000}/api/auth/login \\`);
  console.log(`      -H 'Content-Type: application/json' \\`);
  console.log(`      -d '{"email":"${admin.email}","password":"${PASSWORD}"}'`);
  console.log('─'.repeat(78) + '\n');
}

main()
  .catch((err) => {
    console.error('\nSeed failed:', err.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
