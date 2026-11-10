import { ScrollView, StyleSheet, Text } from 'react-native';
import { Header, ListCard, Screen } from '../components/AppUI.js';
import { colors } from '../theme/colors.js';
import { spacing, type } from '../theme/typography.js';

const ITEMS = [
  { key: 'edit', title: 'Edit Group Details', subtitle: 'Update the group name, description and member limit.' },
  { key: 'invite', title: 'Invite a User', subtitle: 'Send an invitation using a runner user ID.' },
  { key: 'requests', title: 'Pending Requests', subtitle: 'Approve or reject requests to join the group.' },
  { key: 'members', title: 'Manage Members', subtitle: 'Promote members or remove them from the group.' },
];

export default function ManageGroupScreen({ navigation, route }) {
  const groupId = route.params?.groupId;
  return (
    <Screen>
      <Header title="Group Management" navigation={navigation} />
      <ScrollView contentContainerStyle={s.page} showsVerticalScrollIndicator={false}>
        <Text style={s.copy}>Choose what you want to manage.</Text>
        {ITEMS.map((item) => (
          <ListCard
            key={item.key}
            title={item.title}
            subtitle={item.subtitle}
            leading={false}
            onPress={() => navigation.navigate('ManageGroupSection', { groupId, section: item.key, title: item.title })}
          />
        ))}
      </ScrollView>
    </Screen>
  );
}

const s = StyleSheet.create({
  page: { paddingHorizontal: spacing.lg, paddingBottom: 48 },
  copy: { ...type.body, color: colors.inkMuted, lineHeight: 19, marginTop: 4, marginBottom: 20 },
});
