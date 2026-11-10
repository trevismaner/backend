/**
 * Email verification during sign-up — the real one.
 *
 * This replaces a wireframe stub that kept the typed code in local state, never checked it,
 * and moved on regardless of what was entered (including nothing). Anyone could register
 * with an address they did not own.
 *
 * How it fits the flow: the address is verified before the account exists, so there is no
 * user to mark as verified. Confirming a code returns a short-lived signed token naming the
 * address, which is carried through the password and terms screens and handed to
 * registration. The server will only accept a token whose address matches the one being
 * registered, so the proof cannot be forged or moved to a different email.
 *
 * When the server reports that verification is not required, this screen does not make the
 * person sit through a step that proves nothing — it forwards straight on. That decision
 * comes from the server, not from a build-time flag, so it can change without a new build.
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, Alert, Pressable, ActivityIndicator, StyleSheet } from 'react-native';
import { Screen, Header, Field, Button } from '../components/AppUI.js';
import { colors } from '../theme/colors.js';
import requestCodeController from '../control/RequestEmailCodeController.js';
import confirmCodeController from '../control/ConfirmEmailCodeController.js';
import getAuthConfigController from '../control/GetAuthConfigController.js';

export default function EmailVerificationScreen({ navigation, route }) {
  const registration = route.params?.registration || {};
  const email = registration.email || '';
  const nextScreen = route.params?.next || 'CreatePassword';

  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [sending, setSending] = useState(true);
  const [status, setStatus] = useState('');
  const [devCode, setDevCode] = useState(null);
  const [error, setError] = useState('');

  // A ref, not state: this guards an effect that must run once, and setting state here
  // would re-run it. Without the guard, a re-render would email a second code.
  const requested = useRef(false);

  const goOn = useCallback((verificationToken) => {
    navigation.navigate(nextScreen, {
      ...route.params,
      registration: { ...registration, ...(verificationToken ? { verificationToken } : {}) },
    });
  }, [navigation, nextScreen, route.params, registration]);

  const send = useCallback(async (isResend) => {
    setSending(true);
    setError('');
    try {
      const result = await requestCodeController(email);
      setStatus(isResend ? 'A new code has been sent.' : `Code sent to ${email}.`);
      // Only ever present when the server has no mail provider configured and is not in
      // production. It is what makes the flow completable in development.
      if (result?.devCode) setDevCode(result.devCode);
      if (result?.warning) setError(result.warning);
    } catch (err) {
      setError(err.message || 'Could not send a code.');
    } finally {
      setSending(false);
    }
  }, [email]);

  useEffect(() => {
    if (requested.current) return;
    requested.current = true;

    (async () => {
      // Ask whether this step applies at all before emailing anything.
      //
      // Skipping it when the answer cannot be read is deliberate, and it is the safe
      // direction. The server decides: registration returns 403 with
      // needsEmailVerification when a proof is genuinely required, so forwarding here
      // cannot bypass anything. Doing the opposite would dead-end sign-up against any
      // backend that predates these endpoints — /auth/config and /verification/request
      // would both 404, this screen would show "could not send a code", and there would be
      // no way past it. An app is routinely newer than the server it is pointed at, so that
      // is not a hypothetical.
      const config = await getAuthConfigController();
      const required = config?.emailVerification?.required === true;

      if (!required) {
        goOn(null);
        return;
      }
      if (!email) {
        setSending(false);
        setError('No email address was carried into this step. Go back and enter it again.');
        return;
      }
      await send(false);
    })();
  }, [email, goOn, send]);

  async function verify() {
    if (!/^\d{6}$/.test(code.trim())) {
      return Alert.alert('Check the code', 'Enter the 6-digit code from your email.');
    }
    try {
      setBusy(true);
      setError('');
      const result = await confirmCodeController({ email, code: code.trim() });
      goOn(result.verificationToken);
    } catch (err) {
      setError(err.message || 'That code could not be checked.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <Header title="Verify email" navigation={navigation} />
      <View style={s.page}>
        <Text style={s.kicker}>EMAIL VERIFICATION</Text>
        <Text style={s.hero}>Check your inbox</Text>
        <Text style={s.copy}>
          {email
            ? `We sent a 6-digit code to ${email}. Enter it below to confirm the address is yours.`
            : 'Enter the verification code sent to your email address.'}
        </Text>

        {sending ? (
          <View style={s.sendingRow}>
            <ActivityIndicator color={colors.primary} />
            <Text style={s.sendingText}>Sending a code…</Text>
          </View>
        ) : null}

        {status && !error ? <Text style={s.status}>{status}</Text> : null}
        {error ? <Text style={s.error}>{error}</Text> : null}

        {devCode ? (
          <View style={s.devBox}>
            <Text style={s.devLabel}>DEVELOPMENT ONLY</Text>
            <Text style={s.devCode}>{devCode}</Text>
            <Text style={s.devNote}>
              No mail provider is configured on the server, so the code is shown here instead of
              being emailed. This never happens in production.
            </Text>
          </View>
        ) : null}

        <Field
          label="Verification code"
          value={code}
          onChangeText={(t) => setCode(t.replace(/\D/g, '').slice(0, 6))}
          placeholder="000000"
          keyboardType="number-pad"
        />

        {busy ? (
          <ActivityIndicator color={colors.primary} />
        ) : (
          <Button onPress={verify}>Verify &amp; Continue</Button>
        )}

        <Pressable onPress={() => send(true)} disabled={sending} hitSlop={10}>
          <Text style={[s.link, sending && s.linkDisabled]}>Resend code</Text>
        </Pressable>
      </View>
    </Screen>
  );
}

const s = StyleSheet.create({
  page: { padding: 20 },
  kicker: { fontSize: 10, fontWeight: '700', color: colors.primary, marginTop: 22, letterSpacing: 1 },
  hero: { fontSize: 28, fontWeight: '700', color: colors.ink, marginTop: 10 },
  copy: { fontSize: 13, lineHeight: 19, color: colors.inkMuted, marginTop: 8, marginBottom: 22 },
  sendingRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 14 },
  sendingText: { color: colors.inkMuted, marginLeft: 10, fontSize: 13 },
  status: { color: colors.inkMuted, fontSize: 12, marginBottom: 14 },
  error: { color: colors.danger ?? '#ff6b6b', fontSize: 13, marginBottom: 14, lineHeight: 18 },
  devBox: { borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 14, marginBottom: 20 },
  devLabel: { fontSize: 9, fontWeight: '700', color: colors.primary, letterSpacing: 1 },
  devCode: { fontSize: 30, fontWeight: '700', color: colors.ink, letterSpacing: 6, marginTop: 6 },
  devNote: { fontSize: 11, lineHeight: 16, color: colors.inkMuted, marginTop: 8 },
  link: { color: colors.primary, textAlign: 'center', marginTop: 18, fontSize: 13 },
  linkDisabled: { opacity: 0.4 },
});
