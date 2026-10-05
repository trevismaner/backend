import { useState, useCallback } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { View, Text, ScrollView, Pressable, Linking, Alert, ActivityIndicator, StyleSheet } from 'react-native';
import viewConnectionsController from '../control/ViewConnectionsController.js';
import connectAccountController from '../control/ConnectAccountController.js';
import disconnectAccountController from '../control/DisconnectAccountController.js';
import syncWearableController from '../control/SyncWearableController.js';
import { Screen, Header, Card, Button, BottomNav } from '../components/AppUI.js';
import { colors } from '../theme/colors.js';
import { type, spacing, radius } from '../theme/typography.js';

export default function ConnectionsScreen({ navigation, route }) {
  const kind = route?.params?.kind === 'social' ? 'social' : 'wearable';
  const [providers, setProviders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(null);      // provider name currently working
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    const result = await viewConnectionsController();
    if (result.success) {
      setProviders(kind === 'social' ? result.data.social : result.data.wearables);
      setError('');
    } else {
      setError(result.message);
    }
    setLoading(false);
  }, [kind]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  async function connect(p) {
    setBusy(p.provider);
    setError('');
    setNotice('');
    const result = await connectAccountController(p.provider);
    setBusy(null);
    if (!result.success) { setError(result.message); return; }

    const url = result.data.authorizeUrl;
    const canOpen = await Linking.canOpenURL(url).catch(() => false);
    if (!canOpen) { setError('Could not open the sign-in page on this device.'); return; }
    await Linking.openURL(url);
    setNotice(`Approve access in the browser, then come back here.`);
  }

  function confirmDisconnect(p) {
    Alert.alert(
      `Disconnect ${p.label}?`,
      p.kind === 'wearable'
        ? 'Runs already imported are kept. New activities will stop arriving.'
        : 'You can still share using your phone’s share sheet.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Disconnect',
          style: 'destructive',
          onPress: async () => {
            setBusy(p.provider);
            const result = await disconnectAccountController(p.provider);
            setBusy(null);
            if (result.success) { setNotice(`${p.label} disconnected.`); await load(); }
            else setError(result.message);
          },
        },
      ]
    );
  }

  async function sync(p) {
    setBusy(p.provider);
    setError('');
    setNotice('');
    const result = await syncWearableController(p.provider);
    setBusy(null);
    if (result.success) { setNotice(result.data.message); await load(); }
    else setError(result.message);
  }

  const title = kind === 'social' ? 'Social Accounts' : 'Devices';

  return (
    <Screen>
      <Header title={title} navigation={navigation} />
      <ScrollView contentContainerStyle={s.page}>
        <Text style={s.intro}>
          {kind === 'social'
            ? 'Link an account to share runs and achievements. You can always share through your phone’s share sheet without connecting anything.'
            : 'Connect a device to bring your activities in automatically, with heart rate and calories.'}
        </Text>

        {!!notice && <Text style={s.notice}>{notice}</Text>}
        {!!error && <Text style={s.error}>{error}</Text>}

        {loading ? <ActivityIndicator color={colors.primary} style={s.loading} /> : providers.map((p) => {
          const working = busy === p.provider;
          return (
            <Card key={p.provider} style={[s.card, !p.available && !p.connected && s.cardMuted]}>
              <View style={s.cardTop}>
                <View style={s.cardCopy}>
                  <Text style={s.name}>{p.label}</Text>
                  <Text style={[s.status, p.connected && s.statusOn]}>
                    {p.connected
                      ? p.expired ? 'Connection expired — reconnect' : 'Connected'
                      : p.available ? 'Not connected' : 'Unavailable'}
                  </Text>
                </View>
                {p.connected && <View style={[s.dot, p.expired ? s.dotWarn : s.dotOn]} />}
              </View>

              {}
              {!p.available && !p.connected && (
                <Text style={s.reason}>{p.unavailableReason}</Text>
              )}

              {p.connected && p.kind === 'wearable' && (
                <Text style={s.meta}>
                  {p.lastSyncedAt
                    ? `Last import ${new Date(p.lastSyncedAt).toLocaleString()}`
                    : 'No activities imported yet'}
                  {p.lastSyncError ? ` · ${p.lastSyncError}` : ''}
                </Text>
              )}

              <View style={s.actions}>
                {p.connected ? (
                  <>
                    {p.kind === 'wearable' && p.canSync && (
                      <Pressable disabled={working} onPress={() => sync(p)} style={({ pressed }) => [s.action, pressed && s.pressed]}>
                        <Text style={s.actionText}>{working ? 'Importing…' : 'Import activities'}</Text>
                      </Pressable>
                    )}
                    <Pressable disabled={working} onPress={() => confirmDisconnect(p)} style={({ pressed }) => [s.action, s.danger, pressed && s.pressed]}>
                      <Text style={[s.actionText, s.dangerText]}>Disconnect</Text>
                    </Pressable>
                  </>
                ) : p.available ? (
                  <Button style={s.connect} onPress={() => connect(p)} disabled={working}>
                    {working ? 'Opening…' : `Connect ${p.label}`}
                  </Button>
                ) : null}
              </View>
            </Card>
          );
        })}

        <Text style={s.footnote}>
          Run League never sees your password for these services — you sign in with them
          directly, and can disconnect at any time.
        </Text>
      </ScrollView>
      <BottomNav navigation={navigation} active="Profile" />
    </Screen>
  );
}

const s = StyleSheet.create({
  page: { paddingHorizontal: spacing.lg, paddingBottom: 100 },
  intro: { ...type.caption, color: colors.inkMuted, lineHeight: 18, marginBottom: spacing.lg },
  notice: { ...type.body, color: colors.success, marginBottom: spacing.md },
  error: { ...type.body, color: colors.riskHigh, marginBottom: spacing.md },
  loading: { marginTop: 40 },
  card: { padding: 16, marginBottom: 12 },
  cardMuted: { opacity: 0.6 },
  cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cardCopy: { flex: 1 },
  name: { ...type.subtitle, color: colors.ink },
  status: { ...type.caption, color: colors.inkMuted, marginTop: 5 },
  statusOn: { color: colors.success },
  dot: { width: 10, height: 10, borderRadius: 5 },
  dotOn: { backgroundColor: colors.success },
  dotWarn: { backgroundColor: colors.warning },
  reason: { ...type.caption, color: colors.inkFaint, marginTop: 10, lineHeight: 17 },
  meta: { ...type.caption, color: colors.inkFaint, marginTop: 10 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 14 },
  action: { flex: 1, minHeight: 40, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceRaised, alignItems: 'center', justifyContent: 'center' },
  danger: { backgroundColor: colors.riskHighBg, borderColor: colors.riskHigh },
  actionText: { ...type.caption, fontWeight: '600', color: colors.ink },
  dangerText: { color: colors.riskHigh },
  connect: { flex: 1 },
  pressed: { opacity: 0.72 },
  footnote: { ...type.caption, color: colors.inkFaint, marginTop: spacing.lg, lineHeight: 17, textAlign: 'center' },
});
