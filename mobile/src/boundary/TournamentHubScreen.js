import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import viewMyTournamentsController from '../control/ViewMyTournamentsController.js';
import viewAvailableTournamentsController from '../control/ViewAvailableTournamentsController.js';
import { BottomNav, Field, Header, Screen } from '../components/AppUI.js';
import { colors } from '../theme/colors.js';

const PLACEHOLDER_TOURNAMENTS = [
  {
    tournamentId: 'preview-public-10k',
    name: 'East Coast 10K Challenge',
    description: 'A friendly 10 km community race for runners who want to test their pace and meet other Run League members.',
    distanceType: '10 km',
    startDate: '2026-10-18T07:00:00+08:00',
    participantCount: 18,
    maxParticipants: 60,
    groupName: 'East Coast Runners',
    visibility: 'public',
    preview: true,
  },
  {
    tournamentId: 'preview-private-5k',
    name: 'Sunrise Club 5K Cup',
    description: 'A private 5 km club tournament focused on consistency and friendly competition between approved members.',
    distanceType: '5 km',
    startDate: '2026-10-24T06:30:00+08:00',
    participantCount: 12,
    maxParticipants: 30,
    groupName: 'Sunrise Running Club',
    visibility: 'private',
    preview: true,
  },
];

function dateLabel(value) {
  if (!value) return 'Date to be confirmed';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return 'Date to be confirmed';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function TournamentCard({ tournament, state, onPress }) {
  const participants = Number(tournament.participantCount || 0);
  const capacity = tournament.maxParticipants ? ` / ${tournament.maxParticipants}` : '';
  return (
    <Pressable style={({ pressed }) => [styles.card, pressed && styles.pressed]} onPress={onPress}>
      <View style={styles.cardTop}>
        <Text style={[styles.state, state === 'JOINED' && styles.joined]}>{state}</Text>
        {!!tournament.groupName && <Text numberOfLines={1} style={styles.groupName}>{tournament.groupName}</Text>}
      </View>
      <Text numberOfLines={1} style={styles.cardTitle}>{tournament.name}</Text>
      <Text style={styles.details}>{tournament.distanceType || 'Open distance'} · {dateLabel(tournament.startDate)}</Text>
      <Text style={styles.note}>{participants}{capacity} participant{participants === 1 ? '' : 's'}</Text>
      <Text style={styles.chev}>›</Text>
    </Pressable>
  );
}

function matchesSearch(tournament, query) {
  if (!query.trim()) return true;
  const needle = query.trim().toLowerCase();
  return [tournament.name, tournament.groupName, tournament.distanceType, tournament.description]
    .filter(Boolean)
    .some((value) => String(value).toLowerCase().includes(needle));
}

export default function TournamentHubScreen({ navigation }) {
  const [tab, setTab] = useState('Joined');
  const [search, setSearch] = useState('');
  const [joined, setJoined] = useState([]);
  const [created, setCreated] = useState([]);
  const [available, setAvailable] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true);
    else setLoading(true);
    setError('');
    const [mineResult, availableResult] = await Promise.all([
      viewMyTournamentsController(),
      viewAvailableTournamentsController(),
    ]);
    if (mineResult.success) {
      setJoined(mineResult.data.joined || []);
      setCreated(mineResult.data.created || []);
    } else {
      setError(mineResult.message || 'Could not load your tournaments.');
    }
    if (availableResult.success) setAvailable(availableResult.data.tournaments || []);
    else if (!mineResult.success) setError(availableResult.message || 'Could not load tournaments.');
    setLoading(false);
    setRefreshing(false);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const primary = useMemo(
    () => (tab === 'Joined' ? joined : created).filter((item) => matchesSearch(item, search)),
    [tab, joined, created, search],
  );

  const availableVisible = useMemo(
    () => [...available, ...PLACEHOLDER_TOURNAMENTS].filter((item) => matchesSearch(item, search)),
    [available, search],
  );

  function openTournament(tournament, isCreated = false) {
    if (tournament.preview) {
      navigation.navigate('TournamentPreview', { tournament });
      return;
    }
    navigation.navigate('TournamentDetails', { tournamentId: tournament.tournamentId, isCreated });
  }

  return (
    <Screen>
      <Header title="Tournaments" navigation={navigation} back={false} leftAligned />
      <ScrollView
        contentContainerStyle={styles.page}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={colors.primary} />}
      >
        <Text style={styles.copy}>Compete with your groups, track registrations, and discover tournaments you can enter.</Text>

        <Field label="Search Tournaments" value={search} onChangeText={setSearch} placeholder="Search by name, group or distance" />

        <Pressable style={({ pressed }) => [styles.public, pressed && styles.pressed]} onPress={() => navigation.navigate('PublicEvents')}>
          <Text style={styles.publicTitle}>Public Events</Text>
          <Text style={styles.publicCopy}>Explore platform-wide events open to the Run League community.</Text>
          <Text style={styles.chev}>›</Text>
        </Pressable>

        <View style={styles.tabs}>
          {['Joined', 'Created'].map((item) => (
            <Pressable key={item} onPress={() => setTab(item)} style={[styles.tab, tab === item && styles.tabActive]}>
              <Text style={[styles.tabText, tab === item && styles.tabTextActive]}>{item}</Text>
            </Pressable>
          ))}
        </View>

        {loading ? <View style={styles.loading}><ActivityIndicator color={colors.primary} /></View> : null}
        {!!error && !loading ? <Text style={styles.error}>{error}</Text> : null}

        {!loading && !error ? (
          <>
            <Text style={styles.section}>{tab === 'Joined' ? 'Tournaments you joined' : 'Tournaments you created'}</Text>
            {primary.length ? primary.map((tournament) => (
              <TournamentCard
                key={tournament.tournamentId}
                tournament={tournament}
                state={tab === 'Joined' ? 'JOINED' : String(tournament.status || 'OPEN').toUpperCase()}
                onPress={() => openTournament(tournament, tab === 'Created')}
              />
            )) : (
              <View style={styles.empty}>
                <Text style={styles.emptyTitle}>{tab === 'Joined' ? 'No joined tournaments yet.' : 'You have not created a tournament yet.'}</Text>
                <Text style={styles.emptyCopy}>{tab === 'Joined' ? 'Open tournaments you can enter are shown below.' : 'Open one of your groups to create a tournament for its members.'}</Text>
              </View>
            )}

            {tab === 'Created' && (
              <Pressable style={styles.create} onPress={() => navigation.navigate('GroupsHub')}>
                <Text style={styles.createText}>Choose a Group to Create Tournament</Text>
              </Pressable>
            )}

            {tab === 'Joined' && (
              <>
                <Text style={styles.section}>Available to join</Text>
                {availableVisible.length ? availableVisible.map((tournament) => (
                  <TournamentCard
                    key={tournament.tournamentId}
                    tournament={tournament}
                    state={tournament.visibility === 'private' ? 'PRIVATE' : 'OPEN'}
                    onPress={() => openTournament(tournament)}
                  />
                )) : (
                  <View style={styles.empty}>
                    <Text style={styles.emptyTitle}>No available tournaments right now.</Text>
                    <Text style={styles.emptyCopy}>Try a different search or check again when your groups create new tournaments.</Text>
                  </View>
                )}
              </>
            )}
          </>
        ) : null}
      </ScrollView>
      <BottomNav navigation={navigation} active="Tournament" />
    </Screen>
  );
}

const styles = StyleSheet.create({
  page: { padding: 20, paddingTop: 8, paddingBottom: 100 },
  copy: { fontSize: 13, lineHeight: 18, color: colors.inkMuted, marginTop: 2, marginBottom: 18 },
  public: { minHeight: 84, borderWidth: 1, borderColor: colors.primary, borderRadius: 18, backgroundColor: colors.surface, padding: 16, marginTop: 8 },
  publicTitle: { fontSize: 16, fontWeight: '700', color: colors.ink },
  publicCopy: { fontSize: 11, lineHeight: 15, color: colors.inkMuted, marginTop: 7, paddingRight: 32 },
  tabs: { flexDirection: 'row', gap: 10, marginTop: 22 },
  tab: { flex: 1, height: 44, borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  tabActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  tabText: { fontSize: 14, fontWeight: '600', color: colors.ink },
  tabTextActive: { color: '#FFFFFF' },
  section: { fontSize: 19, fontWeight: '700', color: colors.ink, marginTop: 26, marginBottom: 12 },
  card: { minHeight: 124, borderRadius: 18, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, padding: 15, marginBottom: 14 },
  cardTop: { flexDirection: 'row', alignItems: 'center', paddingRight: 28 },
  state: { fontSize: 10, fontWeight: '800', color: colors.primary, letterSpacing: 0.3 },
  joined: { color: colors.success },
  groupName: { flex: 1, textAlign: 'right', fontSize: 10, color: colors.inkMuted },
  cardTitle: { fontSize: 18, fontWeight: '700', color: colors.ink, marginTop: 10, paddingRight: 28 },
  details: { fontSize: 12, color: colors.inkMuted, marginTop: 5 },
  note: { fontSize: 11, color: colors.inkMuted, marginTop: 8 },
  chev: { position: 'absolute', right: 18, top: 39, fontSize: 24, color: colors.inkMuted },
  create: { minHeight: 50, borderRadius: 14, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', marginTop: 14 },
  createText: { fontSize: 13, fontWeight: '700', color: '#FFFFFF' },
  loading: { paddingVertical: 38 },
  error: { color: colors.riskHigh, fontSize: 13, lineHeight: 18, marginTop: 24 },
  empty: { borderWidth: 1, borderColor: colors.border, borderRadius: 16, backgroundColor: colors.surface, padding: 16 },
  emptyTitle: { fontSize: 14, fontWeight: '700', color: colors.ink },
  emptyCopy: { fontSize: 11, lineHeight: 16, color: colors.inkMuted, marginTop: 6 },
  pressed: { opacity: 0.76 },
});
