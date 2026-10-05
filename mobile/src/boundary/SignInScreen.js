import { useState } from 'react';
import { View, Text, Pressable, StyleSheet, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { useAuth } from '../context/AuthContext.js';
import { Screen, Brand, Field, Button } from '../components/AppUI.js';
import { colors } from '../theme/colors.js';
import { spacing, type } from '../theme/typography.js';

export default function SignInScreen({ navigation }) {
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSignIn() {
    if (!email || !password) return Alert.alert('Missing details', 'Enter your email and password to continue.');
    setSubmitting(true);
    try { await signIn({ email, password }); }
    catch (err) { Alert.alert('Sign in failed', err.message); }
    finally { setSubmitting(false); }
  }

  return (
    <Screen>
      <KeyboardAvoidingView style={styles.page} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Brand large />
        <Text style={styles.title}>Welcome back</Text>
        <Text style={styles.subtitle}>Sign in to continue your Run League journey.</Text>
        <View style={styles.form}>
          <Field label="Email" value={email} onChangeText={setEmail} placeholder="alex@example.com" autoCapitalize="none" keyboardType="email-address" />
          <Field label="Password" value={password} onChangeText={setPassword} placeholder="••••••••" secureTextEntry />
          <Button onPress={handleSignIn} disabled={submitting}>{submitting ? 'Signing in…' : 'Log In'}</Button>
          <Pressable onPress={() => navigation.navigate('ForgotPassword')} hitSlop={10}>
            <Text style={styles.forgot}>Forgot password?</Text>
          </Pressable>
        </View>
        <Pressable style={styles.create} onPress={() => navigation.navigate('ChooseAccountType')}>
          <Text style={styles.createText}>New to Run League? <Text style={styles.createStrong}>Create account</Text></Text>
        </Pressable>
      </KeyboardAvoidingView>
    </Screen>
  );
}
const styles = StyleSheet.create({
  page: { flex: 1, paddingHorizontal: spacing.lg, paddingTop: 68 },
  title: { ...type.display, color: colors.ink, marginTop: 28 },
  subtitle: { fontSize: 13, color: colors.inkMuted, marginTop: 2 },
  form: { marginTop: 40 },
  forgot: { fontSize: 12, color: colors.inkMuted, marginTop: 14, marginLeft: 4 },
  create: { position: 'absolute', left: spacing.lg, bottom: 72 },
  createText: { fontSize: 12, color: colors.inkMuted },
  createStrong: { color: colors.ink },
});
