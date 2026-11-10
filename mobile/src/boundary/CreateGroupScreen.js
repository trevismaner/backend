import { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import createGroupController from '../control/CreateGroupController.js';
import { Button, Chip, Field, Header, Screen } from '../components/AppUI.js';
import { colors } from '../theme/colors.js';
import { spacing, type } from '../theme/typography.js';

export default function CreateGroupScreen({ navigation }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isPrivate, setPrivate] = useState(false);
  const [maxMembers, setMax] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function create() {
    if (!name.trim()) return Alert.alert('Group name required');
    setSubmitting(true);
    const result = await createGroupController({
      name: name.trim(),
      description,
      isPrivate,
      maxMembers: maxMembers ? parseInt(maxMembers, 10) : undefined,
    });
    setSubmitting(false);
    if (result.success) navigation.replace('GroupDetails', { groupId: result.data.group.groupId });
    else Alert.alert('Could not create group', result.message);
  }

  return (
    <Screen>
      <Header title="Create Group" navigation={navigation} />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.avatar}><Text style={styles.avatarText}>{name.trim()?.[0]?.toUpperCase() || 'G'}</Text></View>
        <Text style={styles.add}>Group icon preview</Text>
        <Field label="Group Name" value={name} onChangeText={setName} placeholder="Morning Runners"/>
        <Field label="Description" value={description} onChangeText={setDescription} placeholder="Easy social runs around the city." multiline/>
        <Field label="Maximum Members" value={maxMembers} onChangeText={setMax} placeholder="Optional" keyboardType="number-pad"/>
        <Text style={styles.section}>Visibility</Text>
        <View style={styles.row}>
          <Chip active={!isPrivate} onPress={() => setPrivate(false)}>PUBLIC</Chip>
          <Chip active={isPrivate} onPress={() => setPrivate(true)}>PRIVATE</Chip>
        </View>
        <Text style={styles.help}>{isPrivate ? 'People must request to join this group.' : 'Anyone can join this group while space is available.'}</Text>
        <Button onPress={create} disabled={submitting} style={styles.create}>{submitting ? 'Creating…' : 'Create Group'}</Button>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: spacing.lg, paddingBottom: 40 },
  avatar: { width: 80, height: 80, borderRadius: 40, backgroundColor: colors.surfaceRaised, borderWidth: 1, borderColor: colors.border, alignSelf: 'center', marginTop: 18, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 30, fontWeight: '800', color: colors.primary },
  add: { ...type.body, color: colors.inkMuted, textAlign: 'center', marginVertical: 12 },
  section: { ...type.subtitle, color: colors.ink, marginTop: 6, marginBottom: 12 },
  row: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  help: { ...type.caption, color: colors.inkMuted, marginTop: 10, lineHeight: 16 },
  create: { marginTop: 34 },
});
