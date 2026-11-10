import { useState } from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import adminCreateUserController from '../control/AdminCreateUserController.js';
import { Screen, Header, Field, Button, Chip } from '../components/AppUI.js';
import { SectionLabel, ErrorText } from '../components/AdminUI.js';
import { colors } from '../theme/colors.js';
import { type, spacing } from '../theme/typography.js';

const ROLES = [
  { value: 'registered_user', label: 'Runner' },
  { value: 'instructor', label: 'Instructor' },
  { value: 'system_admin', label: 'Admin' },
];

export default function AdminCreateUserScreen({ navigation }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('registered_user');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    setError('');
    const result = await adminCreateUserController({ name, email, password, role });
    setBusy(false);
    if (result.success) navigation.goBack();
    else setError(result.message);
  }

  return (
    <Screen>
      <Header title="Create Account" navigation={navigation} />
      <ScrollView contentContainerStyle={s.page}>
        <Text style={s.intro}>The account is active straight away — there is no email verification step for accounts made here.</Text>

        <Field label="Full name" value={name} onChangeText={setName} placeholder="e.g. Grace Chen" />
        <Field label="Email" value={email} onChangeText={setEmail} placeholder="name@example.com" keyboardType="email-address" autoCapitalize="none" />
        <Field label="Password" value={password} onChangeText={setPassword} placeholder="At least 8 characters" secureTextEntry />

        <SectionLabel>Role</SectionLabel>
        <View style={s.chips}>
          {ROLES.map((r) => (
            <Chip key={r.value} active={role === r.value} onPress={() => setRole(r.value)}>{r.label}</Chip>
          ))}
        </View>
        {role === 'system_admin' && (
          <Text style={s.warn}>This account will have full admin access, including deleting other accounts.</Text>
        )}

        <ErrorText>{error}</ErrorText>

        <Button style={s.submit} onPress={submit} disabled={busy}>
          {busy ? 'Creating…' : 'Create Account'}
        </Button>
      </ScrollView>
    </Screen>
  );
}

const s = StyleSheet.create({
  page: { paddingHorizontal: spacing.lg, paddingBottom: 48 },
  intro: { ...type.caption, color: colors.inkMuted, marginBottom: spacing.lg, lineHeight: 17 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  warn: { ...type.caption, color: colors.riskModerate, marginTop: spacing.md, lineHeight: 17 },
  submit: { marginTop: spacing.xl },
});
