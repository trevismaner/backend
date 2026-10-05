import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

import authRoutes from './boundary/authRoutes.js';
import profileRoutes from './boundary/profileRoutes.js';
import runRoutes from './boundary/runRoutes.js';
import groupRoutes from './boundary/groupRoutes.js';
import tournamentRoutes from './boundary/tournamentRoutes.js';
import rewardRoutes from './boundary/rewardRoutes.js';
import leaderboardRoutes from './boundary/leaderboardRoutes.js';
import notificationRoutes from './boundary/notificationRoutes.js';
import fitnessPlanRoutes from './boundary/fitnessPlanRoutes.js';
import publicEventRoutes from './boundary/publicEventRoutes.js';
import riskAssessmentRoutes from './boundary/riskAssessmentRoutes.js';
import connectionRoutes from './boundary/connectionRoutes.js';
import instructorPostRoutes from './boundary/instructorPostRoutes.js';
import adminRoutes from './boundary/adminRoutes.js';
import { startReminderScheduler } from './jobs/reminderScheduler.js';
import { checkConnection, describeConnection } from './config/db.js';
import { apiLimiter } from './middleware/rateLimit.js';

dotenv.config();

const app = express();

// Hosting platforms put a load balancer in front of the app, so the socket address is the
// proxy's, not the client's. Without this every request looks like one IP and the rate
// limits below would apply to the whole platform at once. `1` trusts exactly one hop, which
// is what Render, Fly and similar put in front; trusting all hops would let a client forge
// the header and bypass the limits entirely.
app.set('trust proxy', 1);

app.use(cors());

// 2 MB rather than Express's 100 kB default. A GPS-tracked run carries its whole route in
// the request body, and at one point every few seconds the default was exceeded part way
// through a long run — so a run over roughly 70 minutes could not be saved at all. The
// route itself is capped at MAX_ROUTE_POINTS in control/RunValidation.js; this is only the
// outer limit on the request.
app.use(express.json({ limit: '2mb' }));

// Liveness: is the process up. Deliberately does not touch the database — hosting platforms
// poll this every few seconds, and a free-tier database should not be paying for that.
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

// Readiness: is the database actually reachable from here. This is the endpoint to open first
// when a deployment is up but behaving as though it has no data. 503 when the database is
// unreachable, with the reason, so the answer is in the response rather than only the logs.
app.get('/health/db', async (req, res) => {
  const connection = describeConnection();
  try {
    await checkConnection();
    return res.status(200).json({ status: 'ok', database: connection });
  } catch (err) {
    return res.status(503).json({ status: 'unavailable', database: connection, error: err.message });
  }
});

// The backstop applies to every API route. Tighter limits sit on the routes that need them
// (sign-in in authRoutes, plan generation in fitnessPlanRoutes).
app.use('/api', apiLimiter);

app.use('/api/auth', authRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/runs', runRoutes);
app.use('/api/groups', groupRoutes);
app.use('/api/tournaments', tournamentRoutes);
app.use('/api/rewards', rewardRoutes);
app.use('/api/leaderboard', leaderboardRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/fitness-plans', fitnessPlanRoutes);
app.use('/api/public-events', publicEventRoutes);
app.use('/api/risk-assessment', riskAssessmentRoutes);
app.use('/api/connections', connectionRoutes);
app.use('/api/instructor-posts', instructorPostRoutes);
app.use('/api/admin', adminRoutes);


app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

app.use((err, req, res, next) => {
  // A body too large or malformed is the caller's problem, so it gets a 4xx that says so
  // rather than a bare 500 the app cannot explain to the user.
  if (err?.type === 'entity.too.large') {
    return res.status(413).json({
      error: 'That request is too large. If this was a run, its GPS route has too many points.',
    });
  }
  if (err?.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Request body is not valid JSON' });
  }

  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

const PORT = process.env.PORT || 3000;

// 0.0.0.0, not the default: a hosting platform routes traffic to the container's external
// interface, and a server bound only to localhost is unreachable however healthy it looks
// in the logs.
app.listen(PORT, '0.0.0.0', async () => {
  const connection = describeConnection();
  console.log(`Run League backend running on port ${PORT}`);
  console.log(
    `Database: ${connection.database ?? '(unnamed)'} at ${connection.host ?? '(unset)'}` +
      ` · SSL ${connection.ssl ? 'on' : 'off'} · via ${connection.via}`
  );

  // Say so at startup rather than letting the first request be the thing that discovers it.
  try {
    await checkConnection();
    console.log('Database reachable.');
  } catch (err) {
    console.error(`Database NOT reachable: ${err.message}`);
    console.error('The server is up but every request needing data will fail. Check');
    console.error('DATABASE_URL (or the DB_* variables) and whether this host is allowed to connect.');
  }

  startReminderScheduler();
});
