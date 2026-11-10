import { useState, useCallback, useMemo } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import viewPublicEventsController from '../control/ViewPublicEventsController.js';
import { BottomNav, Chip, Header, Screen } from '../components/AppUI.js';
import { colors } from '../theme/colors.js';
import { type, spacing, radius } from '../theme/typography.js';

const PREVIEW_EVENT = {
  eventId: 'preview-community-run',
  name: 'Run League Community Challenge 2026',
  description: 'A platform-wide community running event open to every Run League user. Top finishers will receive partner vouchers, and participants can unlock limited event badges.',
  status: 'upcoming',
  startDate: '2026-11-08T07:00:00+08:00',
  registrationDeadline: '2026-11-06T23:59:00+08:00',
  participantCount: 84,
  maxParticipants: 300,
  spotsRemaining: 216,
  isRegistered: false,
  preview: true,
};

const STATUS = {
  upcoming: ['Open', colors.success],
  closed: ['Closed', colors.inkMuted],
  in_progress: ['Running', colors.warning],
  completed: ['Finished', colors.inkFaint],
};

const FILTERS = [
  { key: 'ALL', label: 'All' },
  { key: 'OPEN', label: 'Open' },
  { key: 'MINE', label: "I'm in" },
  { key: 'DONE', label: 'Finished' },
];

function when(event) {
  if (!event.startDate) return 'Date to be confirmed';
  const start = new Date(event.startDate);
  return start.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function PublicEventsScreen({ navigation }) {
  const [events, setEvents] = useState([]);
  const [filter, setFilter] = useState('ALL');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    const result = await viewPublicEventsController();
    if (result.success) { setEvents(result.data.events || []); setError(''); }
    else setError(result.message);
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const visible = useMemo(() => [PREVIEW_EVENT, ...events].filter((event) => {
    if (filter === 'OPEN') return event.status === 'upcoming';
    if (filter === 'MINE') return event.isRegistered;
    if (filter === 'DONE') return event.status === 'completed';
    return true;
  }), [events, filter]);

  return (
    <Screen>
      <Header title="Public Events" navigation={navigation} />
      <FlatList
        data={visible}
        keyExtractor={(item) => String(item.eventId)}
        contentContainerStyle={s.page}
        ListHeaderComponent={(
          <>
            <Text style={s.intro}>Platform-wide events anyone can enter — no group needed.</Text>
            <View style={s.chips}>{FILTERS.map((f) => <Chip key={f.key} active={filter === f.key} onPress={() => setFilter(f.key)}>{f.label}</Chip>)}</View>
            {!!error && <Text style={s.error}>{error}</Text>}
          </>
        )}
        renderItem={({ item }) => {
          const [label, colour] = STATUS[item.status] ?? STATUS.upcoming;
          return (
            <Pressable
              onPress={() => navigation.navigate('PublicEventDetails', item.preview ? { previewEvent: item } : { eventId: item.eventId })}
              style={({ pressed }) => [s.card, pressed && s.pressed]}
            >
              <View style={s.cardTop}>
                <Text style={[s.status, { color: colour }]}>{label.toUpperCase()}</Text>
                {item.preview && <Text style={s.featured}>FEATURED</Text>}
                {item.isRegistered && <Text style={s.joined}>Joined</Text>}
              </View>
              <Text numberOfLines={2} style={s.name}>{item.name}</Text>
              <Text numberOfLines={2} style={s.description}>{item.description}</Text>
              <Text style={s.meta}>{when(item)} · {item.participantCount} entered{item.maxParticipants != null ? ` / ${item.maxParticipants}` : ''}</Text>
            </Pressable>
          );
        }}
        ListEmptyComponent={loading ? <ActivityIndicator color={colors.primary} style={s.loading} /> : <Text style={s.empty}>No events match this filter.</Text>}
      />
      <BottomNav navigation={navigation} active="Tournament" />
    </Screen>
  );
}

const s = StyleSheet.create({
  page: { paddingHorizontal: spacing.lg, paddingBottom: 90 },
  intro: { ...type.caption, color: colors.inkMuted, marginBottom: spacing.md, lineHeight: 17 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: spacing.md },
  error: { ...type.body, color: colors.riskHigh, marginBottom: spacing.md },
  loading: { marginTop: 40 },
  card: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, padding: 15, marginBottom: 12 },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  status: { ...type.label, textTransform: 'uppercase' },
  featured: { ...type.label, color: colors.primary },
  joined: { ...type.label, color: colors.success },
  name: { ...type.subtitle, color: colors.ink, marginTop: 8 },
  description: { ...type.caption, color: colors.inkMuted, lineHeight: 17, marginTop: 6 },
  meta: { ...type.caption, color: colors.inkMuted, marginTop: 8 },
  empty: { ...type.body, color: colors.inkMuted, textAlign: 'center', paddingVertical: 28 },
  pressed: { opacity: 0.72 },
});
