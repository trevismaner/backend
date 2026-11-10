import { useState, useCallback } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { View, Text, ScrollView, Modal, ActivityIndicator, StyleSheet, Alert } from 'react-native';
import viewPublicEventDetailsController from '../control/ViewPublicEventDetailsController.js';
import joinPublicEventController from '../control/JoinPublicEventController.js';
import withdrawFromPublicEventController from '../control/WithdrawFromPublicEventController.js';
import { Screen, Header, Card, Button } from '../components/AppUI.js';
import { colors } from '../theme/colors.js';
import { type, spacing, radius } from '../theme/typography.js';

const STATUS_COPY = {
  upcoming: 'Registration open',
  closed: 'Registration closed',
  in_progress: 'Event in progress',
  completed: 'Event finished',
};

function dateLine(value) {
  if (!value) return '—';
  return new Date(value).toLocaleString(undefined, {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

function time(seconds) {
  if (seconds == null) return '—';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const sec = String(seconds % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
}

export default function PublicEventDetailsScreen({ navigation, route }) {
  const previewEvent = route.params?.previewEvent;
  const eventId = route.params?.eventId;
  const [event, setEvent] = useState(previewEvent || null);
  const [participants, setParticipants] = useState([]);
  const [loading, setLoading] = useState(!previewEvent);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [confirmWithdraw, setConfirmWithdraw] = useState(false);
  const [previewJoined, setPreviewJoined] = useState(false);

  const load = useCallback(async () => {
    if (previewEvent) {
      setEvent(previewEvent);
      setLoading(false);
      return;
    }
    const result = await viewPublicEventDetailsController(eventId);
    if (result.success) {
      setEvent(result.data.event);
      setParticipants(result.data.participants || []);
      setError('');
    } else setError(result.message);
    setLoading(false);
  }, [eventId, previewEvent]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  async function join() {
    if (previewEvent) {
      setPreviewJoined(true);
      Alert.alert('Event joined', 'You have joined this public event preview.');
      return;
    }
    setBusy(true);
    setError('');
    const result = await joinPublicEventController(eventId);
    setBusy(false);
    if (result.success) await load();
    else setError(result.message);
  }

  async function withdraw() {
    if (previewEvent) {
      setPreviewJoined(false);
      setConfirmWithdraw(false);
      return;
    }
    setBusy(true);
    const result = await withdrawFromPublicEventController(eventId);
    setBusy(false);
    setConfirmWithdraw(false);
    if (result.success) await load();
    else setError(result.message);
  }

  if (loading) return <Screen><Header title="Event" navigation={navigation} /><ActivityIndicator color={colors.primary} style={s.loading} /></Screen>;
  if (!event) return <Screen><Header title="Event" navigation={navigation} /><View style={s.page}><Text style={s.error}>{error || 'This event could not be loaded.'}</Text></View></Screen>;

  const registered = previewEvent ? previewJoined : event.isRegistered;
  const full = event.spotsRemaining === 0 && !registered;
  const ranked = participants.some((p) => p.rank != null);

  return (
    <Screen>
      <Header title="Event" navigation={navigation} />
      <ScrollView contentContainerStyle={s.page}>
        <Text style={s.status}>{(STATUS_COPY[event.status] ?? '').toUpperCase()}</Text>
        <Text style={s.name}>{event.name}</Text>
        {!!event.description && <Text style={s.description}>{event.description}</Text>}

        {previewEvent && (
          <Card style={s.rewardCard}>
            <Text style={s.rewardTitle}>Event Rewards</Text>
            <Text style={s.rewardText}>Top finishers can receive partner vouchers, while eligible participants can unlock limited Run League event badges.</Text>
          </Card>
        )}

        <Card style={s.card}>
          <Row label="Starts" value={dateLine(event.startDate)} />
          <Row label="Registration closes" value={dateLine(event.registrationDeadline)} />
          <Row label="Entered" value={`${event.participantCount}${event.maxParticipants != null ? ` / ${event.maxParticipants}` : ''}`} />
          {event.creatorName && <Row label="Organiser" value={event.creatorName} />}
        </Card>

        {!!error && <Text style={s.error}>{error}</Text>}

        {registered ? (
          <>
            <View style={s.joinedBanner}><Text style={s.joinedText}>You are registered for this event.</Text></View>
            <Button variant="danger" style={s.action} onPress={() => setConfirmWithdraw(true)} disabled={busy}>Withdraw</Button>
          </>
        ) : event.status === 'upcoming' ? (
          <Button style={s.action} onPress={join} disabled={busy || full}>{busy ? 'Joining…' : full ? 'Event Full' : 'Join Event'}</Button>
        ) : (
          <Text style={s.note}>This event is no longer accepting entries.</Text>
        )}

        {!previewEvent && <>
          <Text style={s.section}>{ranked ? 'Results' : `Entrants (${participants.length})`}</Text>
          {participants.length === 0 ? <Text style={s.empty}>Nobody has entered yet.</Text> : participants.map((p, i) => (
            <View key={p.userId} style={s.row}>
              <Text style={s.rank}>{p.rank ?? i + 1}</Text>
              <Text numberOfLines={1} style={s.participant}>{p.name}</Text>
              {ranked && <Text style={s.time}>{time(p.resultTimeSeconds)}</Text>}
            </View>
          ))}
        </>}
      </ScrollView>

      <Modal visible={confirmWithdraw} transparent animationType="fade" onRequestClose={() => setConfirmWithdraw(false)}>
        <View style={s.backdrop}>
          <View style={s.sheet}>
            <Text style={s.sheetTitle}>Withdraw from this event?</Text>
            <Text style={s.sheetBody}>Your place is freed up for someone else.</Text>
            <Button variant="danger" onPress={withdraw} disabled={busy}>{busy ? 'Withdrawing…' : 'Withdraw'}</Button>
            <Button variant="secondary" style={s.action} onPress={() => setConfirmWithdraw(false)} disabled={busy}>Cancel</Button>
          </View>
        </View>
      </Modal>
    </Screen>
  );
}

function Row({ label, value }) {
  return <View style={s.detailRow}><Text style={s.detailLabel}>{label}</Text><Text style={s.detailValue}>{value}</Text></View>;
}

const s = StyleSheet.create({
  page: { paddingHorizontal: spacing.lg, paddingBottom: 48 },
  loading: { marginTop: 48 },
  status: { ...type.label, color: colors.primary, textTransform: 'uppercase', marginTop: spacing.sm },
  name: { ...type.title, color: colors.ink, marginTop: 8 },
  description: { ...type.body, color: colors.inkMuted, marginTop: spacing.md, lineHeight: 20 },
  rewardCard: { padding: 14, marginTop: spacing.lg, borderColor: colors.primary },
  rewardTitle: { ...type.bodyStrong, color: colors.ink },
  rewardText: { ...type.caption, color: colors.inkMuted, lineHeight: 17, marginTop: 6 },
  card: { padding: 14, marginTop: spacing.lg },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 9, gap: 12 },
  detailLabel: { ...type.body, color: colors.inkMuted },
  detailValue: { ...type.bodyStrong, color: colors.ink, flexShrink: 1, textAlign: 'right' },
  joinedBanner: { backgroundColor: colors.riskLowBg, borderWidth: 1, borderColor: colors.riskLow, borderRadius: radius.md, padding: 12, marginTop: spacing.lg },
  joinedText: { ...type.bodyStrong, color: colors.riskLow },
  action: { marginTop: 12 },
  note: { ...type.caption, color: colors.inkFaint, marginTop: spacing.md, lineHeight: 17 },
  error: { ...type.body, color: colors.riskHigh, marginTop: spacing.md },
  section: { ...type.subtitle, color: colors.ink, marginTop: spacing.xl, marginBottom: spacing.sm },
  empty: { ...type.body, color: colors.inkMuted, paddingVertical: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: 1, borderBottomColor: colors.border, paddingVertical: 12 },
  rank: { ...type.bodyStrong, color: colors.inkMuted, width: 28 },
  participant: { ...type.body, color: colors.ink, flex: 1 },
  time: { ...type.bodyStrong, color: colors.ink },
  backdrop: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.surface, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, borderWidth: 1, borderColor: colors.border, padding: spacing.lg, paddingBottom: 34 },
  sheetTitle: { ...type.title, color: colors.ink },
  sheetBody: { ...type.body, color: colors.inkMuted, marginTop: 8, marginBottom: spacing.lg },
});
