import { useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import viewNotificationsController from '../control/ViewNotificationsController.js';
import markNotificationReadController from '../control/MarkNotificationReadController.js';
import { BottomNav, Chip, Header, ListCard, Screen } from '../components/AppUI.js';
import { colors } from '../theme/colors.js';
import { spacing, type } from '../theme/typography.js';

const PLACEHOLDER_NOTIFICATIONS = [
  { notification_id: 'preview-group', title: 'Group join request', body: 'A runner requested to join your group. Review the request in Group Management.', created_at: new Date(Date.now() - 18 * 60 * 1000).toISOString(), is_read: false, category: 'LEAGUE', preview: true },
  { notification_id: 'preview-tournament', title: 'Tournament request received', body: 'A runner requested access to your private tournament.', created_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(), is_read: false, category: 'LEAGUE', preview: true },
  { notification_id: 'preview-rest', title: 'Recovery reminder', body: "You've been exercising a lot recently. Consider taking a rest or easy recovery day.", created_at: new Date(Date.now() - 7 * 60 * 60 * 1000).toISOString(), is_read: true, category: 'RUNS', preview: true },
];

export default function NotificationsScreen({ navigation }) {
  const [data, setData] = useState([]);
  const [filter, setFilter] = useState('ALL');

  async function load() {
    const result = await viewNotificationsController();
    if (result.success) setData(result.data.notifications || []);
  }

  useEffect(() => { load(); }, []);

  async function press(notification) {
    if (notification.preview) return;
    if (!notification.is_read) {
      await markNotificationReadController(notification.notification_id);
      load();
    }
  }

  const source = data.length ? data : PLACEHOLDER_NOTIFICATIONS;
  const visible = useMemo(() => source.filter((item) => filter === 'ALL' || item.category === filter), [source, filter]);

  return (
    <Screen>
      <Header
        title="Notifications"
        navigation={navigation}
        right={(
          <Pressable onPress={() => navigation.navigate('NotificationPreferences')} style={styles.settingsButton}>
            <View style={styles.settingsLineA} />
            <View style={styles.settingsLineB} />
            <View style={styles.settingsLineC} />
          </Pressable>
        )}
      />
      <FlatList
        data={visible}
        keyExtractor={(item) => String(item.notification_id)}
        contentContainerStyle={styles.content}
        ListHeaderComponent={(
          <View style={styles.chips}>
            {['ALL', 'RUNS', 'LEAGUE'].map((item) => <Chip key={item} active={filter === item} onPress={() => setFilter(item)}>{item}</Chip>)}
          </View>
        )}
        renderItem={({ item }) => (
          <ListCard
            title={item.title}
            subtitle={`${item.body} • ${new Date(item.created_at).toLocaleString()}`}
            onPress={() => press(item)}
            leading={<Text style={[styles.dot, !item.is_read && styles.unread]}>●</Text>}
          />
        )}
        ListEmptyComponent={<Text style={styles.empty}>No notifications match this filter.</Text>}
      />
      <BottomNav navigation={navigation} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: spacing.lg, paddingBottom: 90 },
  chips: { flexDirection: 'row', gap: 10, marginVertical: 15 },
  settingsButton: { width: 28, height: 28, justifyContent: 'center', gap: 4 },
  settingsLineA: { height: 2, width: 22, backgroundColor: colors.inkMuted, borderRadius: 2 },
  settingsLineB: { height: 2, width: 16, backgroundColor: colors.inkMuted, borderRadius: 2 },
  settingsLineC: { height: 2, width: 20, backgroundColor: colors.inkMuted, borderRadius: 2 },
  dot: { fontSize: 28, color: colors.surfaceRaised },
  unread: { color: colors.primary },
  empty: { ...type.body, color: colors.inkMuted, textAlign: 'center', marginTop: 30 },
});
