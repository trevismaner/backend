import { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Button, Card, Header, Screen } from '../components/AppUI.js';
import { colors } from '../theme/colors.js';
import { spacing, type } from '../theme/typography.js';

function dateLabel(value) {
  if (!value) return 'To be confirmed';
  const date = new Date(value);
  return date.toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function TournamentPreviewScreen({ navigation, route }) {
  const tournament = route.params?.tournament;
  const [requested, setRequested] = useState(false);

  if (!tournament) {
    return <Screen><Header title="Tournament" navigation={navigation} /><View style={s.page}><Text style={s.description}>Tournament preview unavailable.</Text></View></Screen>;
  }

  const isPrivate = tournament.visibility === 'private';

  function act() {
    setRequested(true);
    Alert.alert(
      isPrivate ? 'Request sent' : 'Tournament joined',
      isPrivate ? 'Your request has been sent to the tournament organiser.' : `You have joined ${tournament.name}.`,
    );
  }

  return (
    <Screen>
      <Header title="Tournament Details" navigation={navigation} />
      <ScrollView contentContainerStyle={s.page}>
        <Text style={s.kicker}>{isPrivate ? 'PRIVATE TOURNAMENT' : 'PUBLIC TOURNAMENT'}</Text>
        <Text style={s.title}>{tournament.name}</Text>
        <Text style={s.description}>{tournament.description}</Text>

        <Card style={s.card}>
          <Row label="Group" value={tournament.groupName} />
          <Row label="Distance" value={tournament.distanceType} />
          <Row label="Starts" value={dateLabel(tournament.startDate)} />
          <Row label="Participants" value={`${tournament.participantCount} / ${tournament.maxParticipants}`} />
          <Row label="Access" value={isPrivate ? 'Approval required' : 'Open registration'} />
        </Card>

        <Button onPress={act} disabled={requested} style={s.action}>
          {requested ? (isPrivate ? 'Request Sent' : 'Joined') : (isPrivate ? 'Request to Join' : 'Join Tournament')}
        </Button>
      </ScrollView>
    </Screen>
  );
}

function Row({ label, value }) {
  return <View style={s.row}><Text style={s.label}>{label}</Text><Text style={s.value}>{value}</Text></View>;
}

const s = StyleSheet.create({
  page: { paddingHorizontal: spacing.lg, paddingBottom: 48 },
  kicker: { ...type.label, color: colors.primary, marginTop: spacing.sm },
  title: { ...type.title, color: colors.ink, marginTop: 8 },
  description: { ...type.body, color: colors.inkMuted, lineHeight: 21, marginTop: 12 },
  card: { padding: 14, marginTop: spacing.lg },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 14, paddingVertical: 10 },
  label: { ...type.body, color: colors.inkMuted },
  value: { ...type.bodyStrong, color: colors.ink, flexShrink: 1, textAlign: 'right' },
  action: { marginTop: spacing.lg },
});
