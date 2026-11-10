import { useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, ActivityIndicator } from 'react-native';
import viewFitnessEstimateController from '../control/ViewFitnessEstimateController.js';
import { Screen, Header, Card } from '../components/AppUI.js';
import { colors } from '../theme/colors.js';
import { type, spacing, radius } from '../theme/typography.js';

/**
 * What the two models say about this runner.
 *
 * Both are shown with their own uncertainty rather than as verdicts. The fitness estimate
 * carries how many runs it is built on and whether it has passed its warm-up; the level
 * carries whether it came from the classifier or from the safe default, and how confident the
 * forest was. A number presented without that context invites more trust than it has earned,
 * and these are estimates from a handful of runs, not measurements.
 */

const LEVEL_COPY = {
  beginner: 'Building a base. Plans start gently, with run-walk sessions early on.',
  intermediate: 'Training consistently. Plans add tempo work and longer runs.',
  advanced: 'High volume and experience. Plans carry the most demanding sessions.',
};

/** mm:ss from a decimal minutes-per-km. */
function paceLabel(minPerKm) {
  if (minPerKm == null) return '—';
  const minutes = Math.floor(minPerKm);
  const seconds = Math.round((minPerKm - minutes) * 60);
  // 5.99 min/km rounds to 60 seconds, which would read as 5:60.
  const carry = seconds === 60;
  return `${minutes + (carry ? 1 : 0)}:${String(carry ? 0 : seconds).padStart(2, '0')}`;
}

/** A plain bar, because the score's position in the range is the point, not its exact value. */
function ScoreBar({ score }) {
  return (
    <View style={s.barTrack}>
      <View style={[s.barFill, { width: `${Math.max(2, Math.min(100, score))}%` }]} />
    </View>
  );
}

function Stat({ label, value, hint }) {
  return (
    <View style={s.stat}>
      <Text style={s.statValue}>{value}</Text>
      <Text style={s.statLabel}>{label}</Text>
      {!!hint && <Text style={s.statHint}>{hint}</Text>}
    </View>
  );
}

export default function FitnessEstimateScreen({ navigation }) {
  const [state, setState] = useState({ loading: true, error: null, data: null });

  useEffect(() => {
    let alive = true;
    (async () => {
      const result = await viewFitnessEstimateController();
      if (!alive) return;
      setState({
        loading: false,
        error: result.success ? null : result.message,
        data: result.success ? result.data : null,
      });
    })();
    return () => { alive = false; };
  }, []);

  if (state.loading) {
    return (
      <Screen>
        <Header title="Fitness" navigation={navigation} />
        <View style={s.centre}><ActivityIndicator color={colors.primary} /></View>
      </Screen>
    );
  }

  if (state.error) {
    return (
      <Screen>
        <Header title="Fitness" navigation={navigation} />
        <View style={s.centre}><Text style={s.error}>{state.error}</Text></View>
      </Screen>
    );
  }

  const { fitness, level, levelFeatures } = state.data ?? {};
  const trend = fitness?.history?.length > 1
    ? fitness.history[fitness.history.length - 1].score - fitness.history[0].score
    : null;

  return (
    <Screen>
      <Header title="Fitness" navigation={navigation} />
      <ScrollView contentContainerStyle={s.content}>

        <Card style={s.card}>
          <Text style={s.cardTitle}>Fitness estimate</Text>

          {fitness?.available ? (
            <>
              <View style={s.scoreRow}>
                <Text style={s.score}>{fitness.score}</Text>
                <Text style={s.scoreOutOf}>/ 100</Text>
              </View>
              <ScoreBar score={fitness.score} />

              <Text style={s.explain}>
                This is how your heart rate compares with a typical runner at the same pace and
                distance. You are currently {Math.abs(fitness.offsetBpm).toFixed(1)} bpm{' '}
                {fitness.offsetBpm <= 0 ? 'below' : 'above'} typical — {fitness.offsetBpm <= 0
                  ? 'lower is fitter.'
                  : 'there is room to improve.'}
              </Text>

              {/* The honest caveat, not buried. An estimate from two runs is a guess. */}
              {!fitness.confident && (
                <View style={s.provisional}>
                  <Text style={s.provisionalText}>
                    Provisional — built from {fitness.runsUsed}{' '}
                    {fitness.runsUsed === 1 ? 'run' : 'runs'}. It settles after about five.
                  </Text>
                </View>
              )}

              <View style={s.statRow}>
                <Stat
                  label="Pace at 150 bpm"
                  value={`${paceLabel(fitness.referencePaceMinPerKm)}/km`}
                  hint="what this estimate says you can hold"
                />
                <Stat
                  label="Runs used"
                  value={String(fitness.runsUsed)}
                  hint="runs with heart-rate data"
                />
              </View>

              {trend !== null && (
                <Text style={s.trend}>
                  {trend > 0 ? '▲' : trend < 0 ? '▼' : '■'} {trend > 0 ? '+' : ''}{trend} points
                  across the runs shown
                </Text>
              )}

              <Text style={s.sectionLabel}>Your training paces</Text>
              <View style={s.paceGrid}>
                {[
                  ['Easy', fitness.paces.easy],
                  ['Long', fitness.paces.long],
                  ['Tempo', fitness.paces.tempo],
                  ['Intervals', fitness.paces.intervals],
                ].map(([name, value]) => (
                  <View key={name} style={s.paceCell}>
                    <Text style={s.paceValue}>{paceLabel(value)}</Text>
                    <Text style={s.paceName}>{name}</Text>
                  </View>
                ))}
              </View>
            </>
          ) : (
            <Text style={s.empty}>{fitness?.reason}</Text>
          )}
        </Card>

        <Card style={s.card}>
          <Text style={s.cardTitle}>Your level</Text>
          <Text style={s.level}>{(level?.level ?? 'beginner').toUpperCase()}</Text>
          <Text style={s.explain}>{LEVEL_COPY[level?.level] ?? ''}</Text>

          {level?.source === 'model' ? (
            <Text style={s.meta}>
              Classified from your training history
              {level.confidence != null ? ` · ${Math.round(level.confidence * 100)}% confidence` : ''}
            </Text>
          ) : (
            <Text style={s.meta}>
              Using the default while {level?.reason ?? 'there is not enough history'}.
            </Text>
          )}

          {/* The numbers behind the call. Someone told they are a beginner deserves to see
              what that was based on, and it is the first thing to check when it looks wrong. */}
          {!!levelFeatures && (
            <>
              <Text style={s.sectionLabel}>What this is based on</Text>
              {[
                ['Weekly distance', `${levelFeatures.weekly_km.toFixed(1)} km`],
                ['Runs per week', levelFeatures.runs_per_week.toFixed(1)],
                ['Longest run', `${levelFeatures.longest_run_km.toFixed(1)} km`],
                ['Average pace', `${paceLabel(levelFeatures.avg_pace)}/km`],
                ['Running for', `${levelFeatures.tenure_months.toFixed(1)} months`],
              ].map(([label, value]) => (
                <View key={label} style={s.featureRow}>
                  <Text style={s.featureLabel}>{label}</Text>
                  <Text style={s.featureValue}>{value}</Text>
                </View>
              ))}
            </>
          )}
        </Card>

        <Text style={s.footnote}>
          Both figures are estimates from your recorded runs, not medical or clinical
          measurements.
        </Text>
      </ScrollView>
    </Screen>
  );
}

const s = StyleSheet.create({
  content: { padding: spacing.lg, paddingBottom: 90 },
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  error: { ...type.body, color: colors.riskHigh, textAlign: 'center' },
  card: { padding: spacing.lg, marginBottom: spacing.lg },
  cardTitle: { ...type.label, color: colors.inkMuted, textTransform: 'uppercase', marginBottom: spacing.sm },

  scoreRow: { flexDirection: 'row', alignItems: 'flex-end' },
  score: { ...type.display, fontSize: 52, lineHeight: 54, color: colors.ink },
  scoreOutOf: { ...type.body, color: colors.inkMuted, marginLeft: 6, marginBottom: 8 },

  barTrack: {
    height: 8, borderRadius: radius.pill, backgroundColor: colors.surfaceRaised,
    marginTop: spacing.sm, marginBottom: spacing.md, overflow: 'hidden',
  },
  barFill: { height: 8, borderRadius: radius.pill, backgroundColor: colors.primary },

  explain: { ...type.body, color: colors.inkMuted, lineHeight: 20 },
  meta: { ...type.caption, color: colors.inkFaint, marginTop: spacing.sm },

  provisional: {
    backgroundColor: colors.riskModerateBg, borderRadius: radius.md,
    padding: spacing.md, marginTop: spacing.md,
  },
  provisionalText: { ...type.caption, color: colors.ink },

  statRow: { flexDirection: 'row', gap: spacing.lg, marginTop: spacing.lg },
  stat: { flex: 1 },
  statValue: { ...type.subtitle, color: colors.ink },
  statLabel: { ...type.caption, color: colors.inkMuted, marginTop: 2 },
  statHint: { ...type.caption, fontSize: 11, color: colors.inkFaint, marginTop: 2 },

  trend: { ...type.caption, color: colors.inkMuted, marginTop: spacing.md },

  sectionLabel: {
    ...type.label, color: colors.inkMuted, textTransform: 'uppercase',
    marginTop: spacing.lg, marginBottom: spacing.sm,
  },
  paceGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  paceCell: {
    flexGrow: 1, flexBasis: '45%', backgroundColor: colors.surfaceRaised,
    borderRadius: radius.md, padding: spacing.md,
  },
  paceValue: { ...type.subtitle, color: colors.ink },
  paceName: { ...type.caption, color: colors.inkMuted, marginTop: 2 },

  level: { ...type.title, color: colors.primary, marginBottom: spacing.xs },

  featureRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  featureLabel: { ...type.body, color: colors.inkMuted },
  featureValue: { ...type.bodyStrong, color: colors.ink },

  empty: { ...type.body, color: colors.inkMuted, lineHeight: 20 },
  footnote: { ...type.caption, color: colors.inkFaint, textAlign: 'center', marginTop: spacing.sm },
});
