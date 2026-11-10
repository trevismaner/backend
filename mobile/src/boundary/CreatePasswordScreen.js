/**
 * Choose a password during sign-up.
 *
 * This used to ask for 6 characters and nothing else, while the server asked for 8 plus a
 * letter and a number — so a password typed here could pass this screen and then be refused
 * on the final step two screens later, with nothing to say which rule it broke.
 *
 * Now the rules come from the server (GET /api/auth/config) and are shown as a live
 * checklist, so what is still missing is visible while typing rather than discovered on
 * submit. The defaults in PasswordRules mirror the server's, so the list is correct even
 * before the config arrives — and if the server tightens its rule, the app obeys without
 * needing a new build.
 */
import { useState, useEffect } from 'react';
import { View, Text, Alert, StyleSheet } from 'react-native';
import { Screen, Header, Field, Button } from '../components/AppUI.js';
import { colors } from '../theme/colors.js';
import { checkRequirements, meetsPolicy, DEFAULT_POLICY } from '../control/PasswordRules.js';
import getAuthConfigController from '../control/GetAuthConfigController.js';

export default function CreatePasswordScreen({ navigation, route }) {
  const registration = route.params?.registration || {};
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [policy, setPolicy] = useState(DEFAULT_POLICY);
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      const config = await getAuthConfigController();
      if (alive && config?.passwordPolicy) setPolicy(config.passwordPolicy);
    })();
    return () => { alive = false; };
  }, []);

  const context = { policy, email: registration.email, name: registration.name };
  const requirements = checkRequirements(password, context);
  const strong = meetsPolicy(password, context);
  const matches = password.length > 0 && password === confirm;

  function next() {
    if (!strong) {
      const missing = requirements.filter((r) => !r.met).map((r) => r.label);
      return Alert.alert('Password not strong enough', `Still needed:\n\n• ${missing.join('\n• ')}`);
    }
    if (!matches) return Alert.alert('Passwords do not match');
    navigation.navigate('TermsConditions', {
      ...route.params,
      registration: { ...registration, password },
    });
  }

  return (
    <Screen>
      <Header title="Create password" navigation={navigation} />
      <View style={s.page}>
        <Text style={s.title}>Secure your account</Text>
        <Text style={s.copy}>Create a password for your Run League account.</Text>

        <Field
          label="Password"
          value={password}
          onChangeText={(t) => { setPassword(t); setTouched(true); }}
          secureTextEntry
          placeholder={`At least ${policy.minLength ?? 8} characters`}
        />

        <View style={s.rules}>
          {requirements.map((r) => (
            <View key={r.label} style={s.ruleRow}>
              <Text style={[s.ruleMark, r.met ? s.ruleMet : (touched ? s.ruleUnmet : s.ruleIdle)]}>
                {r.met ? '✓' : '•'}
              </Text>
              <Text style={[s.ruleText, r.met && s.ruleTextMet]}>{r.label}</Text>
            </View>
          ))}
        </View>

        <Field
          label="Confirm password"
          value={confirm}
          onChangeText={setConfirm}
          secureTextEntry
          placeholder="Repeat password"
        />
        {confirm.length > 0 && !matches ? (
          <Text style={s.mismatch}>The two passwords do not match.</Text>
        ) : null}

        <Button onPress={next} style={s.btn}>Continue</Button>
      </View>
    </Screen>
  );
}

const s = StyleSheet.create({
  page: { padding: 20 },
  title: { fontSize: 28, fontWeight: '700', color: colors.ink, marginTop: 28 },
  copy: { fontSize: 13, color: colors.inkMuted, marginTop: 8, marginBottom: 26 },
  rules: { marginTop: 4, marginBottom: 22 },
  ruleRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 6 },
  ruleMark: { width: 18, fontSize: 13, fontWeight: '700' },
  ruleMet: { color: colors.primary },
  ruleUnmet: { color: colors.inkMuted },
  ruleIdle: { color: colors.inkMuted },
  ruleText: { fontSize: 12, color: colors.inkMuted, flex: 1, lineHeight: 17 },
  ruleTextMet: { color: colors.ink },
  mismatch: { color: colors.danger ?? '#ff6b6b', fontSize: 12, marginTop: -8, marginBottom: 14 },
  btn: { marginTop: 10 },
});
