import { useState, useEffect, useCallback } from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { useAuth } from '../context/AuthContext.js';
import viewProfileController from '../control/ViewProfileController.js';
import updateProfileController from '../control/UpdateProfileController.js';
import viewMyInstructorPostsController from '../control/ViewMyInstructorPostsController.js';
import { Screen, Header, Field, Button, Card } from '../components/AppUI.js';
import {
  InstructorNav, VerifiedTag, Confirm, Loading, ErrorText, instructorStyles,
} from '../components/InstructorUI.js';
import { colors } from '../theme/colors.js';
import { type, spacing } from '../theme/typography.js';

export default function InstructorProfileScreen({ navigation }) {
  const { user, setUser, signOut } = useAuth();
  const [profile, setProfile] = useState(null);
  const [stats, setStats] = useState(null);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState('');
  const [bio, setBio] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [confirmOut, setConfirmOut] = useState(false);

  const load = useCallback(async () => {
    const [me, mine] = await Promise.all([
      viewProfileController(),
      viewMyInstructorPostsController({ limit: 1 }),
    ]);
    if (me.success) {
      setProfile(me.data.user);
      setName(me.data.user.name || '');
      setBio(me.data.user.bio || '');
      setError('');
    } else {
      setError(me.message);
    }
    if (mine.success) setStats(mine.data.stats);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function save() {
    setBusy(true);
    setError('');
    const result = await updateProfileController({ name: name.trim(), bio });
    setBusy(false);
    if (result.success) {
      const updated = result.data.user || result.data;
      setProfile(updated);
      setUser(updated); // keep the app-wide session in step
      setEditing(false);
      setNotice('Profile updated.');
    } else {
      setError(result.message);
    }
  }

  function cancel() {
    setName(profile?.name || '');
    setBio(profile?.bio || '');
    setEditing(false);
    setError('');
  }

  if (loading) {
    return <Screen><Header title="Profile" navigation={navigation} back={false} /><Loading /></Screen>;
  }

  const verified = Boolean(profile?.credentialsVerified ?? user?.credentialsVerified);

  return (
    <Screen>
      <Header title="Profile" navigation={navigation} back={false} />
      <ScrollView contentContainerStyle={instructorStyles.content}>
        <View style={s.head}>
          <View style={s.avatar}>
            <Text style={s.initial}>{(profile?.name || 'C')[0]?.toUpperCase()}</Text>
          </View>
          <Text style={s.name}>{profile?.name}</Text>
          <Text style={s.email}>{profile?.email}</Text>
          <View style={s.tagRow}>
            <VerifiedTag verified={verified} />
          </View>
          <Text style={s.verifyNote}>
            {verified
              ? 'Your posts are visible on the Instructor Board.'
              : 'An admin has not verified your credentials yet, so your posts stay off the board.'}
          </Text>
          {/* IU-04: submit or update the credentials an admin verifies (SA-11). */}
          <Button
            variant="secondary"
            style={s.credentialsBtn}
            onPress={() => navigation.navigate('MyCredentials')}
          >
            {verified ? 'View My Credentials' : 'Submit Credentials for Review'}
          </Button>
        </View>

        {!!notice && <Text style={s.notice}>{notice}</Text>}
        <ErrorText>{error}</ErrorText>

        {editing ? (
          <>
            {}
            <Field label="Name" value={name} onChangeText={setName} />
            <Field label="Bio" value={bio} onChangeText={setBio} placeholder="Your coaching background" multiline />
            <Button onPress={save} disabled={busy || !name.trim()}>{busy ? 'Saving…' : 'Save Changes'}</Button>
            <Button variant="secondary" style={s.gap} onPress={cancel} disabled={busy}>Cancel</Button>
          </>
        ) : (
          <>
            {}
            <Card style={s.card}>
              <Text style={s.cardLabel}>Bio</Text>
              <Text style={s.cardValue}>{profile?.bio || 'No bio yet. Add one so runners know your background.'}</Text>
            </Card>

            <Card style={s.card}>
              <Text style={s.cardLabel}>Board activity</Text>
              <Text style={s.cardValue}>
                {stats?.totalPosts ?? 0} post{stats?.totalPosts === 1 ? '' : 's'} published
                {stats?.lastPostedAt ? ` · last on ${new Date(stats.lastPostedAt).toLocaleDateString()}` : ''}
              </Text>
            </Card>

            <Button variant="secondary" style={s.gap} onPress={() => { setNotice(''); setEditing(true); }}>
              Edit Profile
            </Button>
            {}
            <Button variant="danger" style={s.gap} onPress={() => setConfirmOut(true)}>Log Out</Button>
          </>
        )}
      </ScrollView>

      <Confirm
        visible={confirmOut}
        title="Log out?"
        message="You will need to sign in again to manage your posts."
        confirmLabel="Log out"
        onConfirm={signOut}
        onCancel={() => setConfirmOut(false)}
      />
      <InstructorNav navigation={navigation} active="Profile" />
    </Screen>
  );
}

const s = StyleSheet.create({
  head: { alignItems: 'center', paddingTop: spacing.sm, marginBottom: spacing.lg },
  avatar: { width: 84, height: 84, borderRadius: 42, backgroundColor: colors.surfaceRaised, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  initial: { ...type.hero, color: colors.ink },
  name: { ...type.title, color: colors.ink, marginTop: spacing.md },
  email: { ...type.caption, color: colors.inkMuted, marginTop: 4 },
  tagRow: { marginTop: spacing.md },
  credentialsBtn: { marginTop: spacing.md, alignSelf: 'stretch' },
  verifyNote: { ...type.caption, color: colors.inkFaint, marginTop: spacing.sm, textAlign: 'center', lineHeight: 17, paddingHorizontal: spacing.md },
  notice: { ...type.body, color: colors.success, marginBottom: spacing.md },
  card: { padding: 14, marginBottom: 12 },
  cardLabel: { ...type.label, color: colors.inkFaint, textTransform: 'uppercase' },
  cardValue: { ...type.body, color: colors.ink, marginTop: 8, lineHeight: 20 },
  gap: { marginTop: 12 },
});
