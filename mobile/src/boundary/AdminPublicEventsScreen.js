import { useState, useCallback } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { View, Text, ScrollView, Pressable, StyleSheet } from 'react-native';
import viewPublicEventsController from '../control/ViewPublicEventsController.js';
import adminCreatePublicEventController from '../control/AdminCreatePublicEventController.js';
import adminUpdatePublicEventController from '../control/AdminUpdatePublicEventController.js';
import adminDeletePublicEventController from '../control/AdminDeletePublicEventController.js';
import { Screen, Header, Card, Field, Button } from '../components/AppUI.js';
import { AdminNav, Pill, Confirm, Loading, Empty, ErrorText, adminStyles } from '../components/AdminUI.js';
import { colors } from '../theme/colors.js';
import { type, spacing } from '../theme/typography.js';

const TONE = { upcoming: 'good', closed: 'warn', in_progress: 'warn', completed: 'neutral' };
const LABEL = { upcoming: 'Open', closed: 'Closed', in_progress: 'Running', completed: 'Finished' };

const toIso = (v) => (v.trim() === '' ? null : new Date(`${v.trim()}T09:00:00`).toISOString());
const fromIso = (v) => (v ? new Date(v).toISOString().slice(0, 10) : '');

const EMPTY_FORM = { name: '', description: '', maxParticipants: '', registrationDeadline: '', startDate: '', endDate: '' };

export default function AdminPublicEventsScreen({ navigation }) {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState(null);       // null | { mode, eventId, ...fields }
  const [confirm, setConfirm] = useState(null);

  const load = useCallback(async () => {
    const result = await viewPublicEventsController();
    if (result.success) { setEvents(result.data.events || []); setError(''); }
    else setError(result.message);
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  function openCreate() {
    setError('');
    setForm({ mode: 'create', ...EMPTY_FORM });
  }

  function openEdit(event) {
    setError('');
    setForm({
      mode: 'edit',
      eventId: event.eventId,
      name: event.name || '',
      description: event.description || '',
      maxParticipants: event.maxParticipants != null ? String(event.maxParticipants) : '',
      registrationDeadline: fromIso(event.registrationDeadline),
      startDate: fromIso(event.startDate),
      endDate: fromIso(event.endDate),
    });
  }

  async function save() {
    setBusy(true);
    setError('');
    const fields = {
      name: form.name,
      description: form.description.trim() || null,
      maxParticipants: form.maxParticipants.trim() === '' ? null : Number(form.maxParticipants),
      registrationDeadline: toIso(form.registrationDeadline),
      startDate: toIso(form.startDate),
      endDate: toIso(form.endDate),
    };
    const result = form.mode === 'create'
      ? await adminCreatePublicEventController(fields)
      : await adminUpdatePublicEventController({ eventId: form.eventId, changes: fields });
    setBusy(false);
    if (result.success) { setForm(null); await load(); }
    else setError(result.message);
  }

  function askDelete(event) {
    setConfirm({
      title: `Delete "${event.name}"?`,
      message: `This removes the event and all ${event.participantCount} registration${event.participantCount === 1 ? '' : 's'}. It cannot be undone.`,
      run: async () => {
        setBusy(true);
        const result = await adminDeletePublicEventController(event.eventId);
        setBusy(false);
        setConfirm(null);
        if (result.success) await load();
        else setError(result.message);
      },
    });
  }

  return (
    <Screen>
      <Header title="Public Events" navigation={navigation} />
      <ScrollView contentContainerStyle={adminStyles.content}>
        <ErrorText>{error}</ErrorText>

        {form ? (
          <Card style={s.form}>
            <Text style={s.formTitle}>{form.mode === 'create' ? 'New event' : 'Edit event'}</Text>
            <Field label="Name" value={form.name} onChangeText={(v) => set('name', v)} placeholder="e.g. National Day 21K" />
            <Field label="Description" value={form.description} onChangeText={(v) => set('description', v)} placeholder="What entrants need to know" multiline />
            <Field label="Max participants (blank = unlimited)" value={form.maxParticipants} onChangeText={(v) => set('maxParticipants', v)} placeholder="500" keyboardType="number-pad" />
            <Field label="Registration closes (YYYY-MM-DD)" value={form.registrationDeadline} onChangeText={(v) => set('registrationDeadline', v)} placeholder="2026-10-01" />
            <Field label="Start date (YYYY-MM-DD)" value={form.startDate} onChangeText={(v) => set('startDate', v)} placeholder="2026-10-08" />
            <Field label="End date (YYYY-MM-DD)" value={form.endDate} onChangeText={(v) => set('endDate', v)} placeholder="2026-10-08" />
            <Text style={s.hint}>Registration must close on or before the start date.</Text>

            <Button style={s.gap} onPress={save} disabled={busy || !form.name.trim()}>
              {busy ? 'Saving…' : form.mode === 'create' ? 'Create Event' : 'Save Changes'}
            </Button>
            <Button variant="secondary" style={s.gap} onPress={() => setForm(null)} disabled={busy}>Cancel</Button>
          </Card>
        ) : (
          <>
            <Button style={s.create} onPress={openCreate}>Create Event</Button>

            {loading ? <Loading /> : events.length === 0 ? (
              <Empty>No platform-wide events yet.</Empty>
            ) : events.map((event) => (
              <Card key={event.eventId} style={s.card}>
                <View style={s.cardTop}>
                  <View style={s.cardCopy}>
                    <Text numberOfLines={1} style={s.cardTitle}>{event.name}</Text>
                    <Text style={s.cardMeta}>
                      {event.startDate ? new Date(event.startDate).toLocaleDateString() : 'no date'} ·{' '}
                      {event.participantCount} entered
                      {event.maxParticipants != null ? ` / ${event.maxParticipants}` : ''}
                    </Text>
                  </View>
                  <Pill tone={TONE[event.status] ?? 'neutral'}>{LABEL[event.status] ?? event.status}</Pill>
                </View>
                <View style={s.actions}>
                  <Pressable disabled={busy} onPress={() => openEdit(event)} style={({ pressed }) => [s.action, pressed && s.pressed]}>
                    <Text style={s.actionText}>Edit</Text>
                  </Pressable>
                  <Pressable disabled={busy} onPress={() => navigation.navigate('PublicEventDetails', { eventId: event.eventId })} style={({ pressed }) => [s.action, pressed && s.pressed]}>
                    <Text style={s.actionText}>View</Text>
                  </Pressable>
                  <Pressable disabled={busy} onPress={() => askDelete(event)} style={({ pressed }) => [s.action, s.danger, pressed && s.pressed]}>
                    <Text style={[s.actionText, s.dangerText]}>Delete</Text>
                  </Pressable>
                </View>
              </Card>
            ))}
          </>
        )}
      </ScrollView>

      <Confirm
        visible={!!confirm}
        title={confirm?.title}
        message={confirm?.message}
        confirmLabel="Delete permanently"
        busy={busy}
        onConfirm={() => confirm?.run()}
        onCancel={() => setConfirm(null)}
      />
      <AdminNav navigation={navigation} active="Events" />
    </Screen>
  );
}

const s = StyleSheet.create({
  form: { padding: 14, gap: 2 },
  formTitle: { ...type.subtitle, color: colors.ink, marginBottom: spacing.md },
  hint: { ...type.caption, color: colors.inkFaint, marginTop: 4 },
  gap: { marginTop: 12 },
  create: { marginBottom: spacing.lg },
  card: { padding: 14, marginBottom: 12 },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', gap: 10 },
  cardCopy: { flex: 1 },
  cardTitle: { ...type.bodyStrong, fontSize: 15, color: colors.ink },
  cardMeta: { ...type.caption, color: colors.inkMuted, marginTop: 5 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 14 },
  action: { flex: 1, minHeight: 40, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceRaised, alignItems: 'center', justifyContent: 'center' },
  danger: { backgroundColor: colors.riskHighBg, borderColor: colors.riskHigh },
  actionText: { ...type.caption, fontWeight: '600', color: colors.ink },
  dangerText: { color: colors.riskHigh },
  pressed: { opacity: 0.72 },
});
