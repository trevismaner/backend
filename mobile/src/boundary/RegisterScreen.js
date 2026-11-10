import { useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useAuth } from '../context/AuthContext.js';

const figma = {
  background: '#FAFAFA',
  ink: '#1F1F1F',
  muted: '#666666',
  border: '#C7C7C7',
  button: '#1F1F1F',
  secondary: '#F0F0F0',
  white: '#FFFFFF',
};

export default function RegisterScreen({ navigation }) {
  const { register } = useAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleRegister() {
    if (!name.trim() || !email.trim() || !password || !confirmPassword) {
      Alert.alert('Missing details', 'Fill in all fields.');
      return;
    }
    if (password !== confirmPassword) {
      Alert.alert('Passwords do not match', 'Please enter the same password in both password fields.');
      return;
    }

    setIsSubmitting(true);
    try {
      await register({
        name: name.trim(),
        email: email.trim(),
        password,
        accountType: 'registered_user',
      });
    } catch (err) {
      Alert.alert('Registration failed', err.message);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.phoneFrame}>
            <Text style={styles.flowLabel}>01 Registration (Regular User)</Text>
            <Text style={styles.title}>Create Account</Text>
            <Text style={styles.subtitle}>Create your Run League account.</Text>

            <TextInput
              style={styles.input}
              placeholder="Full name"
              placeholderTextColor={figma.muted}
              value={name}
              onChangeText={setName}
              autoCapitalize="words"
            />
            <TextInput
              style={styles.input}
              placeholder="Email"
              placeholderTextColor={figma.muted}
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
            />
            <TextInput
              style={styles.input}
              placeholder="Password"
              placeholderTextColor={figma.muted}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
            />
            <TextInput
              style={styles.input}
              placeholder="Confirm password"
              placeholderTextColor={figma.muted}
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              secureTextEntry
            />

            <Pressable
              style={({ pressed }) => [styles.submitButton, pressed && styles.pressed]}
              onPress={handleRegister}
              disabled={isSubmitting}
            >
              <Text style={styles.submitText}>{isSubmitting ? 'Submitting…' : 'Submit'}</Text>
            </Pressable>

            <Pressable
              style={({ pressed }) => [styles.cancelButton, pressed && styles.pressed]}
              onPress={() => navigation.navigate('SignIn')}
              disabled={isSubmitting}
            >
              <Text style={styles.cancelText}>Cancel</Text>
            </Pressable>

            {}
            <Pressable onPress={() => navigation.navigate('CreateInstructorAccount')}>
              <Text style={styles.instructorLink}>Register as a Fitness Instructor</Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  safeArea: { flex: 1, backgroundColor: figma.background },
  scrollContent: { flexGrow: 1, backgroundColor: figma.background },
  phoneFrame: {
    flex: 1,
    minHeight: 844,
    backgroundColor: figma.background,
    borderColor: '#595959',
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 19,
    paddingTop: 23,
    paddingBottom: 32,
  },
  flowLabel: {
    color: figma.muted,
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 17,
  },
  title: {
    color: figma.ink,
    fontSize: 25,
    fontWeight: '600',
    marginBottom: 6,
  },
  subtitle: {
    color: figma.ink,
    fontSize: 13,
    fontWeight: '400',
    marginBottom: 13,
  },
  input: {
    height: 48,
    width: '100%',
    backgroundColor: figma.white,
    borderWidth: 1,
    borderColor: figma.border,
    borderRadius: 4,
    paddingHorizontal: 9,
    color: figma.ink,
    fontSize: 13,
    marginBottom: 14,
  },
  submitButton: {
    height: 48,
    width: '100%',
    backgroundColor: figma.button,
    borderWidth: 1,
    borderColor: figma.button,
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  submitText: { color: figma.white, fontSize: 14, fontWeight: '600' },
  cancelButton: {
    height: 48,
    width: '100%',
    backgroundColor: figma.secondary,
    borderWidth: 1,
    borderColor: figma.border,
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelText: { color: figma.ink, fontSize: 14, fontWeight: '600' },
  instructorLink: {
    marginTop: 18,
    color: figma.ink,
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
    textDecorationLine: 'underline',
  },
  pressed: { opacity: 0.82 },
});
