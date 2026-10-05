import { useState } from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import adminSendAnnouncementController from '../control/AdminSendAnnouncementController.js';
import { Screen, Header, Field, Button, Chip, Card } from '../components/AppUI.js';
import { SectionLabel, Confirm, ErrorText } from '../components/AdminUI.js';
import { colors } from '../theme/colors.js';
import { type, spacing } from '../theme/typography.js';

const AUDIENCES = [
  { value: null, label: 'Everyone' },
  { value: 'registered_user', label: 'Runners' },
  { value: 'instructor', label: 'Instructors' },
  { value: 'system_admin', label: 'Admins' },
];

export default function AdminAnnouncementScreen({ navigation }) {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [role, setRole] = useState(null);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(null);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);

  const audience = AUDIENCES.find((a) => a.value === role)?.label ?? 'Everyone';

  async function send() {
    setBusy(true);
    setError('');
    const result = await adminSendAnnouncementController({ title, body, role });
    setBusy(false);
    setConfirm(false);
    if (result.success) {
      setSent(result.data.recipients);
      setTitle('');
      setBody('');
    } else {
      setError(result.message);
    }
  }

  return (
    <Screen>
      <Header title="Announcement" navigation={navigation} />
      <ScrollView contentContainerStyle={s.page}>
        <Text style={s.intro}>
          This creates an in-app notification for every matching account. Suspended accounts are skipped.
        </Text>

        <Field label="Title" value={title} onChangeText={setTitle} placeholder="e.g. Scheduled maintenance Sunday" />
        <Field label="Message" value={body} onChangeText={setBody} placeholder="What users need to know" multiline />

        <SectionLabel>Send to</SectionLabel>
        <View style={s.chips}>
          {AUDIENCES.map((a) => (
            <Chip key={a.label} active={role === a.value} onPress={() => setRole(a.value)}>{a.label}</Chip>
          ))}
        </View>

        {sent != null && (
          <Card style={s.sent}>
            <Text style={s.sentTitle}>Announcement sent</Text>
            <Text style={s.sentBody}>Delivered to {sent} recipient{sent === 1 ? '' : 's'}.</Text>
          </Card>
        )}

        <ErrorText>{error}</ErrorText>

        <Button style={s.submit} onPress={() => setConfirm(true)} disabled={busy || !title.trim() || !body.trim()}>
          {busy ? 'Sending…' : 'Send Announcement'}
        </Button>
        <Text style={s.hint}>There is no undo — notifications cannot be recalled once sent.</Text>
      </ScrollView>

      <Confirm
        visible={confirm}
        title={`Send to ${audience.toLowerCase()}?`}
        message={`"${title.trim()}" will appear in the notifications list of every ${audience === 'Everyone' ? 'active account' : audience.toLowerCase().replace(/s$/, '') + ' account'}. This cannot be undone.`}
        confirmLabel="Send"
        destructive={false}
        busy={busy}
        onConfirm={send}
        onCancel={() => setConfirm(false)}
      />
    </Screen>
  );
}

const s = StyleSheet.create({
  page: { paddingHorizontal: spacing.lg, paddingBottom: 48 },
  intro: { ...type.caption, color: colors.inkMuted, marginBottom: spacing.lg, lineHeight: 17 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  sent: { padding: 14, marginTop: spacing.lg, borderColor: colors.success },
  sentTitle: { ...type.bodyStrong, color: colors.success },
  sentBody: { ...type.caption, color: colors.inkMuted, marginTop: 5 },
  submit: { marginTop: spacing.xl },
  hint: { ...type.caption, color: colors.inkFaint, marginTop: spacing.md, textAlign: 'center' },
});
