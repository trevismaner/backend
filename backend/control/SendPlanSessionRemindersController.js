import PlanSchedule from '../entities/PlanSchedule.js';
import Notification from '../entities/Notification.js';
import { sendPushNotifications } from './PushSender.js';

export const PLAN_TIMEZONE = process.env.PLAN_TIMEZONE || 'Asia/Singapore';

export const REMINDER_TYPE = 'plan_session_reminder';
export const MISSED_TYPE = 'plan_session_missed';

const SESSION_LABELS = {
  easy: 'Easy run',
  long: 'Long run',
  tempo: 'Tempo run',
  intervals: 'Intervals',
  recovery: 'Recovery run',
  cross_training: 'Cross-training',
};

export function describeSession(session) {
  const label = SESSION_LABELS[session.session_type] || 'Run';
  if (session.distance_km !== null && Number(session.distance_km) > 0) {
    return `${label}, ${Number(session.distance_km)} km`;
  }
  if (session.duration_minutes) {
    return `${label}, ${session.duration_minutes} min`;
  }
  return label;
}

export function buildReminderMessage(session) {
  return {
    title: 'Run day',
    body: `Today's plan: ${describeSession(session)}.`,
  };
}

export function buildMissedMessage(session) {
  return {
    title: 'Still time to run',
    body: `Today's ${describeSession(session)} is not done yet.`,
  };
}

async function deliver(sessions, type, buildMessage) {
  const pushMessages = [];

  for (const session of sessions) {
    const { title, body } = buildMessage(session);
    await Notification.create(session.user_id, { type, title, body });

    if (session.push_token) {
      pushMessages.push({ to: session.push_token, sound: 'default', title, body });
    }
  }

  if (pushMessages.length > 0) {
    await sendPushNotifications(pushMessages);
  }

  return sessions.length;
}

export async function sendPlanSessionReminders() {
  const sessions = await PlanSchedule.findSessionsDueToday({
    timezone: PLAN_TIMEZONE,
    notifiedType: REMINDER_TYPE,
    onlyIfNoRunToday: false,
  });
  const count = await deliver(sessions, REMINDER_TYPE, buildReminderMessage);
  console.log(`Plan session reminders sent to ${count} users`);
  return count;
}

export async function sendMissedSessionNudges() {
  const sessions = await PlanSchedule.findSessionsDueToday({
    timezone: PLAN_TIMEZONE,
    notifiedType: MISSED_TYPE,
    onlyIfNoRunToday: true,
  });
  const count = await deliver(sessions, MISSED_TYPE, buildMissedMessage);
  console.log(`Missed session nudges sent to ${count} users`);
  return count;
}
