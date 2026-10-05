import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../context/AuthContext.js';
import viewGroupLeaderboardController from '../control/ViewGroupLeaderboardController.js';
import { Header, Screen } from '../components/AppUI.js';
import { colors } from '../theme/colors.js';
import { type, spacing } from '../theme/typography.js';

export default function GroupLeaderboardScreen({ route, navigation }) {
  const { groupId, groupName } = route.params || {};
  const { user } = useAuth();
  const [leaderboard, setLeaderboard] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { load(); }, [groupId]);

  async function load() {
    const result = await viewGroupLeaderboardController(groupId);
    if (result.success) setLeaderboard(result.data.leaderboard || []);
    setLoading(false);
  }

  const currentUserId = user?.userId ?? user?.user_id;

  return (
    <Screen>
      <Header title={`${groupName || 'Group'} Leaderboard`} navigation={navigation} />
      {loading ? <View style={styles.center}><ActivityIndicator color={colors.primary}/></View> : <FlatList
        data={leaderboard}
        keyExtractor={(item) => String(item.user_id)}
        contentContainerStyle={styles.listContent}
        renderItem={({ item, index }) => (
          <View style={[styles.row, Number(item.user_id) === Number(currentUserId) && styles.rowHighlight]}>
            <View style={styles.rankBubble}><Text style={styles.rank}>{index + 1}</Text></View>
            <Text style={styles.name}>{item.name}</Text>
            <Text style={styles.distance}>{Number(item.total_distance_km || 0).toFixed(1)} km</Text>
          </View>
        )}
        ListEmptyComponent={<Text style={styles.emptyText}>No runners on this leaderboard yet.</Text>}
      />}
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  listContent: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xl },
  row: { minHeight: 68, flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: colors.border, gap: spacing.md },
  rowHighlight: { backgroundColor: colors.surfaceMuted, borderRadius: 14, paddingHorizontal: spacing.sm, borderBottomWidth: 0, marginVertical: 4 },
  rankBubble: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.surfaceRaised, alignItems: 'center', justifyContent: 'center' },
  rank: { ...type.bodyStrong, color: colors.primary }, name: { ...type.body, color: colors.ink, flex: 1 }, distance: { ...type.bodyStrong, color: colors.ink },
  emptyText: { ...type.body, color: colors.inkMuted, textAlign: 'center', paddingVertical: spacing.xl },
});
