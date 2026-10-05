/**
 * Push notifications — intentionally a no-op.
 *
 * Expo removed Android remote-push support from Expo Go in SDK 53. Since then, loading
 * `expo-notifications` inside Expo Go throws: the module calls `addPushTokenListener` while
 * it initialises, which raises `warnOfExpoGoPushUsage`. That happens during module
 * evaluation, so it crashes the app with "[runtime not ready]" before React ever mounts.
 *
 * A try/catch around the import is not enough, because Metro bundles any module it can see
 * referenced — including inside `await import(...)`. The only reliable fix is for this file
 * to not mention `expo-notifications` anywhere, which is why this stub exists.
 *
 * Nothing else is affected. In-app notifications still work: the notifications screen reads
 * them from GET /api/notifications, and the backend's reminder job still writes them. Only
 * the device-level push banner needs a development build, and that cannot be tested in
 * Expo Go regardless.
 *
 * To enable push in a development build, swap in the real implementation kept alongside
 * this file:
 *
 *   Copy-Item src\utils\pushNotifications.withPush.js src\utils\pushNotifications.js
 *   $env:EXPO_PUBLIC_ENABLE_PUSH = "1"; npx expo start -c
 */

/**
 * Always resolves to null. AuthContext calls this on every sign-in and session restore, so
 * it must never throw — signing in cannot be allowed to depend on push notifications.
 */
export async function registerForPushNotifications() {
  return null;
}
