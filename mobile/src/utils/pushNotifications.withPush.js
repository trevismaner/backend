import registerPushTokenController from '../control/RegisterPushTokenController.js';

/**
 * THE REAL IMPLEMENTATION — not used by default.
 *
 * `pushNotifications.js` is a no-op stub, because any reference to `expo-notifications`
 * (even a dynamic import) is enough for Metro to bundle it, and loading it inside Expo Go
 * crashes the app. To turn push on for a development build, swap this file in:
 *
 *   Copy-Item src\utils\pushNotifications.js src\utils\pushNotifications.stub.js
 *   Copy-Item src\utils\pushNotifications.withPush.js src\utils\pushNotifications.js
 *   $env:EXPO_PUBLIC_ENABLE_PUSH = "1"; npx expo start -c
 *
 * Registers this device for push notifications — and does nothing in Expo Go.
 *
 * Expo removed Android remote-push support from Expo Go in SDK 53. Since then, simply
 * importing `expo-notifications` throws there: the module calls `addPushTokenListener`
 * while it loads, which throws `warnOfExpoGoPushUsage`. Because that happens during module
 * evaluation, it crashes the app with "[runtime not ready]" before React mounts — a static
 * import of this file was enough to take the whole app down.
 *
 * So the import is opt-in. Push stays off unless EXPO_PUBLIC_ENABLE_PUSH is set, which you
 * only do in a development build:
 *
 *   # Expo Go — push off, app runs normally (the default)
 *   npx expo start
 *
 *   # development build — push on
 *   $env:EXPO_PUBLIC_ENABLE_PUSH = "1"; npx expo start
 *
 * Nothing else is affected: notifications still arrive in-app through /api/notifications.
 * Only the device-level push banner needs this.
 */

const PUSH_ENABLED = process.env.EXPO_PUBLIC_ENABLE_PUSH === '1';

let handlerInstalled = false;

/** Imports expo-notifications only when push is switched on. Returns null otherwise. */
async function loadNotifications() {
  if (!PUSH_ENABLED) return null; // never import it in Expo Go — the import itself throws

  try {
    const Notifications = await import('expo-notifications');

    // Install the foreground handler once, tolerating it being renamed between SDK versions.
    if (!handlerInstalled && typeof Notifications.setNotificationHandler === 'function') {
      Notifications.setNotificationHandler({
        handleNotification: async () => ({
          shouldShowBanner: true,
          shouldShowList: true,
          shouldPlaySound: true,
          shouldSetBadge: false,
        }),
      });
      handlerInstalled = true;
    }

    return Notifications;
  } catch (err) {
    console.warn('Push notifications unavailable:', err?.message ?? err);
    return null;
  }
}

/** The EAS project id, if this build has one. Expo Go does not. */
async function getProjectId() {
  try {
    const Constants = (await import('expo-constants')).default;
    return (
      Constants?.expoConfig?.extra?.eas?.projectId ??
      Constants?.easConfig?.projectId ??
      null
    );
  } catch {
    return null; // expo-constants not installed
  }
}

/**
 * Returns the Expo push token on success, or null when push is unavailable for any reason.
 * Never throws — AuthContext calls this on every sign-in, and signing in must not depend
 * on push notifications working.
 */
export async function registerForPushNotifications() {
  try {
    const Notifications = await loadNotifications();
    if (!Notifications) return null;

    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    if (finalStatus !== 'granted') return null;

    const projectId = await getProjectId();
    if (!projectId) return null;

    const tokenData = await Notifications.getExpoPushTokenAsync({ projectId });
    await registerPushTokenController(tokenData.data);
    return tokenData.data;
  } catch (err) {
    console.warn('Push registration skipped:', err?.message ?? err);
    return null;
  }
}
