import { useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import searchGroupsController from '../control/SearchGroupsController.js';
import { BottomNav, Chip, Field, Header, ListCard, Screen } from '../components/AppUI.js';
import { colors } from '../theme/colors.js';
import { spacing, type } from '../theme/typography.js';

export default function GroupsListScreen({ navigation }) {
  const [query, setQuery] = useState('');
  const [groups, setGroups] = useState([]);
  const [searched, setSearched] = useState(false);
  const [filter, setFilter] = useState('POPULAR');

  async function search(text) {
    setQuery(text);
    if (!text.trim()) {
      setGroups([]);
      setSearched(false);
      return;
    }
    const result = await searchGroupsController(text);
    setSearched(true);
    if (result.success) setGroups(result.data.groups || []);
  }

  return (
    <Screen>
      <Header title="Discover Groups" navigation={navigation} />
      <FlatList
        data={groups}
        keyExtractor={(item) => String(item.groupId)}
        contentContainerStyle={styles.content}
        ListHeaderComponent={(
          <>
            <Field label="Search Groups" value={query} onChangeText={search} placeholder="Search by group name" />
            <View style={styles.chips}>{['POPULAR', 'NEARBY', 'PUBLIC'].map((item) => <Chip key={item} active={filter === item} onPress={() => setFilter(item)}>{item}</Chip>)}</View>
          </>
        )}
        renderItem={({ item }) => <ListCard title={item.name} subtitle={item.description || 'Running group'} onPress={() => navigation.navigate('GroupDetails', { groupId: item.groupId })} />}
        ListEmptyComponent={<Text style={styles.empty}>{searched ? 'No groups found.' : 'Search for a running group to join.'}</Text>}
      />
      <BottomNav navigation={navigation} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: spacing.lg, paddingBottom: 90 },
  chips: { flexDirection: 'row', gap: 10, marginBottom: 20 },
  empty: { ...type.body, color: colors.inkMuted, textAlign: 'center', paddingVertical: 28 },
});
