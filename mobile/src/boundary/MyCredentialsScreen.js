import { useState, useCallback } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import viewInstructorCredentialsController from '../control/ViewInstructorCredentialsController.js';
import submitInstructorCredentialsController from '../control/SubmitInstructorCredentialsController.js';
import { Screen, Header, Field, Button } from '../components/AppUI.js';
import { Loading, ErrorText } from '../components/InstructorUI.js';
import { colors } from '../theme/colors.js';
import { type, spacing } from '../theme/typography.js';

const STATUS = {
  not_submitted: { label: 'Not submitted', tone: 'warn',
    copy: 'Submit your qualification so an administrator can verify your account. You cannot publish to the Instructor Board until they do.' },
  pending: { label: 'Awaiting review', tone: 'warn',
    copy: 'An administrator is reviewing your credentials. You will be able to publish once they approve them.' },
  verified: { label: 'Verified', tone: 'good',
    copy: 'Your credentials have been verified. You can publish to the Instructor Board.' },
};

const formatDate = (iso) =>
  iso ? new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

/**
 * IU-04: an instructor submits credentials for verification (SA-11 is the admin's half).
 * Reachable after sign-in, unlike the signup-flow screen — credentials can be added or
 * corrected at any time, and resubmitting sends the account back to pending.
 */
export default function MyCredentialsScreen({ navigation }) {
  const [credentials, setCredentials] = useState(null);
  const [qualification, setQualification] = useState('');
  const [reference, setReference] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    const result = await viewInstructorCredentialsController();
    if (result.success) {
      const c = result.data.credentials;
      setCredentials(c);
      setQualification(c.qualification ?? '');
      setReference(c.reference ?? '');
      setError('');
    } else {
      setError(result.message);
    }
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  async function submit() {
    setBusy(true);
    setNotice('');
    setError('');
    const result = await submitInstructorCredentialsController({ qualification, reference });
    setBusy(false);
    if (result.success) {
      setNotice(result.message || 'Submitted for review');
      await load();
    } else {
      setError(result.message);
    }
  }

  if (loading) {
    return <Screen><Header title="My Credentials" navigation={navigation} /><Loading /></Screen>;
  }

  const status = STATUS[credentials?.status] ?? STATUS.not_submitted;
  const resubmitting = credentials?.status === 'verified';

  return (
    <Screen>
      <Header title="My Credentials" navigation={navigation} />
      <ScrollView contentContainerStyle={s.page}>
        <View style={[s.status, status.tone === 'good' ? s.statusGood : s.statusWarn]}>
          <Text style={[s.statusLabel, status.tone === 'good' ? s.textGood : s.textWarn]}>
            {status.label.toUpperCase()}
          </Text>
          <Text style={s.statusCopy}>{status.copy}</Text>
          {!!credentials?.submittedAt && (
            <Text style={s.submitted}>Submitted {formatDate(credentials.submittedAt)}</Text>
          )}
        </View>

        <Field
          label="Qualification / certification"
          value={qualification}
          onChangeText={setQualification}
          placeholder="e.g. ACE Certified Personal Trainer"
        />
        <Field
          label="Credential reference (optional)"
          value={reference}
          onChangeText={setReference}
          placeholder="Certificate ID or reference"
          autoCapitalize="characters"
        />

        {resubmitting && (
          <Text style={s.warn}>
            Your account is already verified. Submitting again replaces these details and sends
            it back for review, so you will not be able to publish until it is approved again.
          </Text>
        )}

        {!!notice && <Text style={s.notice}>{notice}</Text>}
        <ErrorText>{error}</ErrorText>

        <Button style={s.submit} onPress={submit} disabled={busy || !qualification.trim()}>
          {busy ? 'Submitting…' : resubmitting ? 'Resubmit for Review' : 'Submit for Review'}
        </Button>
      </ScrollView>
    </Screen>
  );
}

const s = StyleSheet.create({
  page: { paddingHorizontal: spacing.lg, paddingBottom: 48 },
  status: { borderRadius: 16, borderWidth: 1, padding: spacing.md, marginBottom: spacing.lg },
  statusWarn: { borderColor: colors.riskModerate, backgroundColor: colors.riskModerateBg },
  statusGood: { borderColor: colors.riskLow, backgroundColor: colors.riskLowBg },
  statusLabel: { ...type.caption, fontWeight: '700' },
  textWarn: { color: colors.riskModerate },
  textGood: { color: colors.riskLow },
  statusCopy: { ...type.caption, color: colors.ink, marginTop: 6, lineHeight: 17 },
  submitted: { ...type.caption, color: colors.inkMuted, marginTop: 8 },
  warn: { ...type.caption, color: colors.riskModerate, marginTop: spacing.md, lineHeight: 17 },
  notice: { ...type.caption, color: colors.riskLow, marginTop: spacing.md },
  submit: { marginTop: spacing.xl },
});
