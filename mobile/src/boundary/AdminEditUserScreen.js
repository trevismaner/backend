import { useState } from 'react';
import { Text, ScrollView, StyleSheet } from 'react-native';
import adminUpdateUserController from '../control/AdminUpdateUserController.js';
import { Screen, Header, Field, Button } from '../components/AppUI.js';
import { SectionLabel, ErrorText } from '../components/AdminUI.js';
import { colors } from '../theme/colors.js';
import { type, spacing } from '../theme/typography.js';

/**
 * SA-06: update a user account so a locked-out user can be helped — a mistyped email,
 * a forgotten password, a name to correct. Role and suspension live on the details
 * screen, since those are different decisions.
 */
export default function AdminEditUserScreen({ navigation, route }) {
  const { user } = route.params;

  const [name, setName] = useState(user.name ?? '');
  const [email, setEmail] = useState(user.email ?? '');
  const [bio, setBio] = useState(user.bio ?? '');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  // Only send what the admin actually changed.
  const changed = {
    ...(name.trim() !== (user.name ?? '') ? { name } : {}),
    ...(email.trim().toLowerCase() !== (user.email ?? '').toLowerCase() ? { email } : {}),
    ...(bio !== (user.bio ?? '') ? { bio } : {}),
    ...(password ? { password } : {}),
  };
  const nothingChanged = Object.keys(changed).length === 0;

  async function submit() {
    setBusy(true);
    setError('');
    const result = await adminUpdateUserController({ userId: user.userId, ...changed });
    setBusy(false);
    if (result.success) navigation.goBack();
    else setError(result.message);
  }

  return (
    <Screen>
      <Header title="Edit Account" navigation={navigation} />
      <ScrollView contentContainerStyle={s.page}>
        <Text style={s.intro}>
          For helping someone who cannot get into their account. Changing the email changes
          what they sign in with, so confirm it with them first.
        </Text>

        <Field label="Full name" value={name} onChangeText={setName} placeholder="e.g. Grace Chen" />
        <Field
          label="Email"
          value={email}
          onChangeText={setEmail}
          placeholder="name@example.com"
          keyboardType="email-address"
          autoCapitalize="none"
        />
        <Field label="Bio" value={bio} onChangeText={setBio} placeholder="Optional" multiline />

        <SectionLabel>Reset password</SectionLabel>
        <Field
          label="New password"
          value={password}
          onChangeText={setPassword}
          placeholder="Leave blank to keep the current one"
          secureTextEntry
        />
        {!!password && (
          <Text style={s.warn}>
            Their current password stops working immediately. Tell them the new one through a
            channel you trust.
          </Text>
        )}

        <ErrorText>{error}</ErrorText>

        <Button style={s.submit} onPress={submit} disabled={busy || nothingChanged}>
          {busy ? 'Saving…' : nothingChanged ? 'No changes' : 'Save Changes'}
        </Button>
      </ScrollView>
    </Screen>
  );
}

const s = StyleSheet.create({
  page: { paddingHorizontal: spacing.lg, paddingBottom: 48 },
  intro: { ...type.caption, color: colors.inkMuted, marginBottom: spacing.lg, lineHeight: 17 },
  warn: { ...type.caption, color: colors.riskModerate, marginTop: spacing.sm, lineHeight: 17 },
  submit: { marginTop: spacing.xl },
});
