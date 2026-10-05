import { useCallback, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import viewMyGroupsController from '../control/ViewMyGroupsController.js';
import { BottomNav, FeatureCard, Header, ListCard, Screen } from '../components/AppUI.js';
import { colors } from '../theme/colors.js';
import { spacing, type } from '../theme/typography.js';

export default function GroupsHubScreen({ navigation }) {
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true);
    else setLoading(true);
    setError('');
    const result = await viewMyGroupsController();
    if (result.success) setGroups(result.data.groups || []);
    else setError(result.message || 'Could not load your groups.');
    setLoading(false);
    setRefreshing(false);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  return (
    <Screen>
      <Header title="Groups" navigation={navigation} />
      <ScrollView
        contentContainerStyle={styles.page}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={colors.primary} />}
      >
        <Text style={styles.hero}>Run better together.</Text>
        <Text style={styles.copy}>See the communities you belong to, discover new groups, or create your own.</Text>

        <View style={styles.grid}>
          <FeatureCard title="Discover Groups" subtitle="Search public and private running communities" onPress={() => navigation.navigate('GroupsList')} />
          <FeatureCard title="Create Group" subtitle="Start a community and invite runners" onPress={() => navigation.navigate('CreateGroup')} />
        </View>

        <Text style={styles.section}>Your groups</Text>
        {loading ? (
          <View style={styles.loading}><ActivityIndicator color={colors.primary} /></View>
        ) : error ? (
          <Text style={styles.error}>{error}</Text>
        ) : groups.length ? (
          groups.map((group) => (
            <ListCard
              key={group.groupId}
              title={group.name}
              subtitle={`${group.isPrivate ? 'Private' : 'Public'} group${group.description ? ` · ${group.description}` : ''}`}
              leading={<View style={styles.groupLogo}><Text style={styles.groupLogoText}>{group.name?.trim()?.[0]?.toUpperCase() || 'G'}</Text></View>}
              onPress={() => navigation.navigate('GroupDetails', { groupId: group.groupId })}
            />
          ))
        ) : (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>You have not joined a group yet.</Text>
            <Text style={styles.emptyCopy}>Discover a group or create one to start training with others.</Text>
          </View>
        )}
      </ScrollView>
      <BottomNav navigation={navigation} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  page: { paddingHorizontal: spacing.lg, paddingBottom: 94 },
  hero: { fontSize: 26, lineHeight: 32, fontWeight: '700', color: colors.ink, marginTop: 8 },
  copy: { ...type.body, color: colors.inkMuted, lineHeight: 19, marginTop: 8, marginBottom: 24 },
  grid: { flexDirection: 'row', justifyContent: 'space-between', gap: 10 },
  section: { ...type.subtitle, color: colors.ink, marginTop: 30, marginBottom: 12 },
  loading: { paddingVertical: 28 },
  error: { ...type.body, color: colors.riskHigh, lineHeight: 20 },
  empty: { borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, borderRadius: 18, padding: 18 },
  emptyTitle: { ...type.bodyStrong, color: colors.ink },
  emptyCopy: { ...type.caption, color: colors.inkMuted, lineHeight: 16, marginTop: 6 },
  groupLogo: { width: 44, height: 44, borderRadius: 12, backgroundColor: colors.surfaceRaised, borderWidth: 1, borderColor: colors.borderStrong, alignItems: 'center', justifyContent: 'center' },
  groupLogoText: { fontSize: 18, fontWeight: '800', color: colors.primary },
});
