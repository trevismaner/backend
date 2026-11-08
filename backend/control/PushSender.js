import { Expo } from 'expo-server-sdk';

const expo = new Expo();

export async function sendPushNotifications(pushMessages) {
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
