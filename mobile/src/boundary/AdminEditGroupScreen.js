import { useState } from 'react';
import { Text, ScrollView, StyleSheet } from 'react-native';
import adminUpdateGroupController from '../control/AdminUpdateGroupController.js';
import { Screen, Header, Field, Button } from '../components/AppUI.js';
import { SectionLabel, ErrorText } from '../components/AdminUI.js';
import { colors } from '../theme/colors.js';
import { type, spacing } from '../theme/typography.js';

/**
 * SA-21: update group details, so platform standards can be enforced without deleting a
 * group and losing its members and tournaments — renaming an offensive name, say.
 */
export default function AdminEditGroupScreen({ navigation, route }) {
  const { group } = route.params;

  const [name, setName] = useState(group.name ?? '');
  const [description, setDescription] = useState(group.description ?? '');
  const [maxMembers, setMaxMembers] = useState(
    group.maxMembers == null ? '' : String(group.maxMembers)
  );
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const originalMax = group.maxMembers == null ? '' : String(group.maxMembers);
  const changed = {
    ...(name.trim() !== (group.name ?? '') ? { name } : {}),
    ...(description !== (group.description ?? '') ? { description } : {}),
    ...(maxMembers.trim() !== originalMax ? { maxMembers: maxMembers.trim() || null } : {}),
  };
  const nothingChanged = Object.keys(changed).length === 0;

  async function submit() {
    setBusy(true);
    setError('');
    const result = await adminUpdateGroupController({ groupId: group.groupId, ...changed });
    setBusy(false);
    if (result.success) navigation.goBack();
    else setError(result.message);
  }

  return (
    <Screen>
      <Header title="Edit Group" navigation={navigation} />
      <ScrollView contentContainerStyle={s.page}>
        <Text style={s.intro}>
          Renaming a group keeps its members, tournaments and history, so prefer this over
          deleting one that just needs a different name.
        </Text>

        <Field label="Group name" value={name} onChangeText={setName} placeholder="e.g. Wollongong Runners" />
        <Field
          label="Description"
          value={description}
          onChangeText={setDescription}
          placeholder="Optional"
          multiline
        />

        <SectionLabel>Member limit</SectionLabel>
        <Field
          label="Maximum members"
          value={maxMembers}
          onChangeText={setMaxMembers}
          placeholder="Leave blank for no limit"
          keyboardType="number-pad"
        />
        <Text style={s.hint}>
          Currently {group.memberCount ?? '—'} active member
          {group.memberCount === 1 ? '' : 's'}. The limit cannot be set below that.
        </Text>

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
  hint: { ...type.caption, color: colors.inkMuted, marginTop: spacing.sm, lineHeight: 17 },
  submit: { marginTop: spacing.xl },
});
