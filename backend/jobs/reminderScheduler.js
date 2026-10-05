import cron from 'node-cron';
import { Expo } from 'expo-server-sdk';
import Notification from '../entities/Notification.js';

const expo = new Expo();

const NO_RUN_DAYS_THRESHOLD = 3;
const OVERTRAINING_RUN_COUNT = 5;
const OVERTRAINING_WINDOW_DAYS = 7;

async function sendPushNotifications(pushMessages) {
  const validMessages = pushMessages.filter((m) => Expo.isExpoPushToken(m.to));
  const chunks = expo.chunkPushNotifications(validMessages);

  for (const chunk of chunks) {
    try {
      await expo.sendPushNotificationsAsync(chunk);
    } catch (err) {
      console.error('Push notification send error:', err);
    }
  }
}

async function generateExerciseReminders() {
  const inactiveUsers = await Notification.getUsersWithNoRecentRun(NO_RUN_DAYS_THRESHOLD);
  const pushMessages = [];

  for (const user of inactiveUsers) {
    const title = 'Time for a run?';
    const body = `You haven't logged a run in ${NO_RUN_DAYS_THRESHOLD} days. Keep your streak going!`;
    await Notification.create(user.user_id, { type: 'exercise_reminder', title, body });

    if (user.push_token) {
      pushMessages.push({ to: user.push_token, sound: 'default', title, body });
    }
  }

  if (pushMessages.length > 0) {
    await sendPushNotifications(pushMessages);
  }

  console.log(`Exercise reminders sent to ${inactiveUsers.length} users`);
}

async function generateOvertrainingAlerts() {
  const activeUsers = await Notification.getUsersWithHighRecentFrequency(
    OVERTRAINING_RUN_COUNT,
    OVERTRAINING_WINDOW_DAYS
  );
  const pushMessages = [];

  for (const user of activeUsers) {
    const title = 'Consider a rest day';
    const body = `You've logged ${user.recent_run_count} runs in the past ${OVERTRAINING_WINDOW_DAYS} days. Recovery matters too.`;
    await Notification.create(user.user_id, { type: 'overtraining_alert', title, body });

    if (user.push_token) {
      pushMessages.push({ to: user.push_token, sound: 'default', title, body });
    }
  }

  if (pushMessages.length > 0) {
    await sendPushNotifications(pushMessages);
  }

  console.log(`Overtraining alerts sent to ${activeUsers.length} users`);
}

export function startReminderScheduler() {
  cron.schedule('0 9 * * *', async () => {
    console.log('Running daily reminder job:', new Date().toISOString());
    await generateExerciseReminders();
    await generateOvertrainingAlerts();
  });

  console.log('Reminder scheduler started (runs daily at 09:00 server time)');
}

export async function runReminderJobNow() {
  await generateExerciseReminders();
  await generateOvertrainingAlerts();
}
