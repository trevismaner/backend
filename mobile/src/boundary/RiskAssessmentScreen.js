import { useState, useCallback } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { View, Text, ScrollView, Pressable, ActivityIndicator, StyleSheet } from 'react-native';
import { CHRONIC_CONDITIONS, CONDITION_LABELS } from '../entities/RiskAssessment.js';
import viewRiskScoreController from '../control/ViewRiskScoreController.js';
import updateRiskAssessmentFormController from '../control/UpdateRiskAssessmentFormController.js';
import { Screen, Header, Card, Field, Button, Chip, BottomNav } from '../components/AppUI.js';
import { colors } from '../theme/colors.js';
import { type, spacing, radius } from '../theme/typography.js';

const LEVEL = {
  low: ['LOW RISK', colors.riskLow, colors.riskLowBg],
  moderate: ['MODERATE RISK', colors.riskModerate, colors.riskModerateBg],
  high: ['HIGH RISK', colors.riskHigh, colors.riskHighBg],
};

const factorLabel = (k) => {
  const words = k.replace(/_/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
};

export default function RiskAssessmentScreen({ navigation }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);

  const [sick, setSick] = useState(false);
  const [conditions, setConditions] = useState([]);
  const [soreness, setSoreness] = useState(3);
  const [injuries, setInjuries] = useState([]);
  const [injuryText, setInjuryText] = useState('');

  const load = useCallback(async () => {
    const result = await viewRiskScoreController();
    if (result.success) {
      setData(result.data);
      const form = result.data.form;
      if (form) {
        setSick(form.isCurrentlySick);
        setConditions(form.chronicConditions || []);
        setSoreness(form.selfRatedSoreness ?? 3);
        setInjuries(form.pastInjuries || []);
      }
      setError('');
    } else {
      setError(result.message);
    }
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  function toggleCondition(c) {
    setConditions((prev) => (prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]));
  }

  function addInjury() {
    if (!injuryText.trim()) return;
    setInjuries((prev) => [...prev, { type: injuryText.trim(), resolved: false, date: null }]);
    setInjuryText('');
  }

  async function save() {
    setBusy(true);
    setError('');
    const result = await updateRiskAssessmentFormController({
      isCurrentlySick: sick,
      chronicConditions: conditions,
      pastInjuries: injuries,
      selfRatedSoreness: soreness,
    });
    setBusy(false);
    if (result.success) { setEditing(false); await load(); }
    else setError(result.message);
  }

  if (loading) {
    return (
      <Screen>
        <Header title="Risk Assessment" navigation={navigation} />
        <ActivityIndicator color={colors.primary} style={s.loading} />
      </Screen>
    );
  }

  const score = data?.score;
  const [levelText, levelColour, levelBg] = LEVEL[score?.riskLevel] ?? LEVEL.low;
  const factors = Object.entries(score?.contributingFactors || {}).sort((a, b) => b[1] - a[1]);

  return (
    <Screen>
      <Header title="Risk Assessment" navigation={navigation} />
      <ScrollView contentContainerStyle={s.page}>
        {!!error && <Text style={s.error}>{error}</Text>}

        {editing ? (
          <>
            {}
            <Text style={s.formTitle}>Update your assessment</Text>
            <Text style={s.formIntro}>
              Your score combines what you tell us here with your actual training load.
            </Text>

            <Text style={s.label}>Are you currently unwell?</Text>
            <View style={s.chips}>
              <Chip active={sick} onPress={() => setSick(true)}>Yes</Chip>
              <Chip active={!sick} onPress={() => setSick(false)}>No</Chip>
            </View>

            <Text style={s.label}>Soreness today: {soreness}/10</Text>
            <View style={s.scale}>
              {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                <Pressable
                  key={n}
                  onPress={() => setSoreness(n)}
                  style={[s.scaleDot, soreness === n && s.scaleDotActive, soreness >= n && s.scaleDotFilled]}
                >
                  <Text style={[s.scaleText, soreness === n && s.scaleTextActive]}>{n}</Text>
                </Pressable>
              ))}
            </View>
            <Text style={s.hint}>1 = fresh, 10 = very sore</Text>

            <Text style={s.label}>Ongoing conditions</Text>
            <View style={s.chips}>
              {(data?.chronicConditions || CHRONIC_CONDITIONS).map((c) => (
                <Chip key={c} active={conditions.includes(c)} onPress={() => toggleCondition(c)}>
                  {CONDITION_LABELS[c] ?? c}
                </Chip>
              ))}
            </View>

            <Text style={s.label}>Injuries</Text>
            {injuries.map((inj, i) => (
              <View key={`${inj.type}-${i}`} style={s.injury}>
                <View style={s.injuryCopy}>
                  <Text style={s.injuryName}>{inj.type}</Text>
                  <Pressable onPress={() => setInjuries((prev) => prev.map((x, j) => (j === i ? { ...x, resolved: !x.resolved } : x)))}>
                    <Text style={[s.injuryState, inj.resolved ? s.resolved : s.unresolved]}>
                      {inj.resolved ? 'Resolved — tap to change' : 'Still affecting me — tap to change'}
                    </Text>
                  </Pressable>
                </View>
                <Pressable hitSlop={10} onPress={() => setInjuries((prev) => prev.filter((_, j) => j !== i))}>
                  <Text style={s.remove}>Remove</Text>
                </Pressable>
              </View>
            ))}
            <View style={s.addRow}>
              <View style={s.addField}>
                <Field label="Add an injury" value={injuryText} onChangeText={setInjuryText} placeholder="e.g. shin splints" />
              </View>
            </View>
            <Button variant="secondary" onPress={addInjury} disabled={!injuryText.trim()}>Add Injury</Button>

            <Button style={s.gap} onPress={save} disabled={busy}>{busy ? 'Scoring…' : 'Save and Rescore'}</Button>
            {data?.form && (
              <Button variant="secondary" style={s.gap} onPress={() => { setEditing(false); load(); }} disabled={busy}>
                Cancel
              </Button>
            )}
          </>
        ) : data?.needsAssessment || !score ? (
          <>
            <Card style={s.empty}>
              <Text style={s.emptyTitle}>No assessment yet</Text>
              <Text style={s.emptyBody}>
                Fill in a short form about how you are feeling. Combined with your recent
                training load, it gives you a risk score and a recommendation.
              </Text>
            </Card>
            <Button style={s.gap} onPress={() => setEditing(true)}>Start Assessment</Button>
          </>
        ) : (
          <>
            {}
            <Card style={[s.hero, { backgroundColor: levelBg, borderColor: levelColour }]}>
              <Text style={[s.heroLevel, { color: levelColour }]}>{levelText}</Text>
              <Text style={s.heroScore}>{score.finalScore}</Text>
              <Text style={s.heroOutOf}>out of 100</Text>
            </Card>

            <Card style={s.card}>
              <Text style={s.cardTitle}>What to do</Text>
              <Text style={s.recommendation}>{score.recommendation}</Text>
            </Card>

            {factors.length > 0 && (
              <Card style={s.card}>
                <Text style={s.cardTitle}>What drove this</Text>
                {factors.map(([key, weight]) => (
                  <View key={key} style={s.factor}>
                    <View style={s.factorCopy}>
                      <Text style={s.factorLabel}>{factorLabel(key)}</Text>
                      <View style={s.factorBar}>
                        <View style={[s.factorFill, { width: `${Math.round(weight * 100)}%`, backgroundColor: levelColour }]} />
                      </View>
                    </View>
                    <Text style={s.factorPercent}>{Math.round(weight * 100)}%</Text>
                  </View>
                ))}
              </Card>
            )}

            <Card style={s.card}>
              <Text style={s.cardTitle}>How it was calculated</Text>
              <Breakdown label="Training load and soreness" value={score.mlBaseScore} />
              <Breakdown label="Heat and humidity" value={score.weatherModifier} />
              <Breakdown label="Heart-rate trend" value={score.biometricModifier} />
              <Breakdown label="Health conditions" value={score.healthConditionModifier} />
              <View style={s.totalRow}>
                <Text style={s.totalLabel}>Total</Text>
                <Text style={[s.totalValue, { color: levelColour }]}>{score.finalScore}</Text>
              </View>
            </Card>

            {data.runStats && (
              <Card style={s.card}>
                <Text style={s.cardTitle}>Your recent training</Text>
                <Text style={s.statLine}>
                  {data.runStats.last7DaysKm} km over {data.runStats.last7DaysRuns} run
                  {data.runStats.last7DaysRuns === 1 ? '' : 's'} in the last 7 days
                </Text>
                <Text style={s.statLine}>
                  {(data.runStats.previous28DaysKm / 4).toFixed(1)} km per week average over the 4 weeks before that
                </Text>
              </Card>
            )}

            {data.history?.length > 1 && (
              <Card style={s.card}>
                <Text style={s.cardTitle}>Recent scores</Text>
                <View style={s.chart}>
                  {data.history.map((h) => (
                    <View key={h.scoreId} style={s.barWrap}>
                      <View
                        style={[
                          s.bar,
                          { height: Math.max(6, (h.finalScore / 100) * 70) },
                          { backgroundColor: (LEVEL[h.riskLevel] ?? LEVEL.low)[1] },
                        ]}
                      />
                      <Text style={s.barLabel}>{Math.round(h.finalScore)}</Text>
                    </View>
                  ))}
                </View>
                <Text style={s.hint}>Oldest to newest</Text>
              </Card>
            )}

            <Text style={s.updated}>
              Last assessed {new Date(score.calculatedAt).toLocaleString()}
            </Text>
            <Button variant="secondary" style={s.gap} onPress={() => setEditing(true)}>Update Assessment</Button>
            <Text style={s.disclaimer}>
              This is a training-load indicator, not medical advice. If something hurts,
              see a professional.
            </Text>
          </>
        )}
      </ScrollView>
      <BottomNav navigation={navigation} active="Run" />
    </Screen>
  );
}

function Breakdown({ label, value }) {
  const sign = value > 0 ? '+' : '';
  return (
    <View style={s.breakdown}>
      <Text style={s.breakdownLabel}>{label}</Text>
      <Text style={s.breakdownValue}>{sign}{value}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  page: { paddingHorizontal: spacing.lg, paddingBottom: 100 },
  loading: { marginTop: 48 },
  error: { ...type.body, color: colors.riskHigh, marginBottom: spacing.md },
  formTitle: { ...type.title, color: colors.ink, marginTop: spacing.sm },
  formIntro: { ...type.caption, color: colors.inkMuted, marginTop: 8, marginBottom: spacing.lg, lineHeight: 17 },
  label: { ...type.label, color: colors.inkFaint, textTransform: 'uppercase', marginTop: spacing.lg, marginBottom: spacing.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  scale: { flexDirection: 'row', gap: 5 },
  scaleDot: { flex: 1, height: 38, borderRadius: 9, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  scaleDotFilled: { backgroundColor: colors.surfaceRaised },
  scaleDotActive: { borderColor: colors.primary, backgroundColor: colors.primary },
  scaleText: { ...type.caption, color: colors.inkMuted },
  scaleTextActive: { color: colors.onPrimary, fontWeight: '700' },
  hint: { ...type.caption, color: colors.inkFaint, marginTop: 8 },
  injury: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: 12, marginBottom: 10 },
  injuryCopy: { flex: 1 },
  injuryName: { ...type.bodyStrong, color: colors.ink },
  injuryState: { ...type.caption, marginTop: 5 },
  resolved: { color: colors.inkMuted },
  unresolved: { color: colors.riskModerate },
  remove: { ...type.caption, color: colors.riskHigh, fontWeight: '600' },
  addRow: { marginTop: 4 },
  addField: { marginBottom: 4 },
  gap: { marginTop: 12 },
  hero: { alignItems: 'center', paddingVertical: 28, borderWidth: 1, marginBottom: 12 },
  heroLevel: { ...type.label, textTransform: 'uppercase' },
  heroScore: { fontSize: 52, fontWeight: '700', color: colors.ink, marginTop: 8 },
  heroOutOf: { ...type.caption, color: colors.inkMuted },
  card: { padding: 16, marginBottom: 12 },
  cardTitle: { ...type.bodyStrong, color: colors.ink, marginBottom: 10 },
  recommendation: { ...type.body, color: colors.inkMuted, lineHeight: 21 },
  factor: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
  factorCopy: { flex: 1 },
  factorLabel: { ...type.caption, color: colors.ink },
  factorBar: { height: 6, borderRadius: 3, backgroundColor: colors.surfaceRaised, marginTop: 6, overflow: 'hidden' },
  factorFill: { height: 6, borderRadius: 3 },
  factorPercent: { ...type.caption, color: colors.inkMuted, width: 38, textAlign: 'right' },
  breakdown: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 7 },
  breakdownLabel: { ...type.caption, color: colors.inkMuted },
  breakdownValue: { ...type.caption, color: colors.ink, fontWeight: '600' },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: colors.border, marginTop: 8, paddingTop: 12 },
  totalLabel: { ...type.bodyStrong, color: colors.ink },
  totalValue: { ...type.bodyStrong },
  statLine: { ...type.caption, color: colors.inkMuted, marginBottom: 6, lineHeight: 17 },
  chart: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-around', height: 88, gap: 6 },
  barWrap: { alignItems: 'center', flex: 1 },
  bar: { width: '100%', maxWidth: 26, borderRadius: 5 },
  barLabel: { ...type.caption, color: colors.inkFaint, marginTop: 5 },
  updated: { ...type.caption, color: colors.inkFaint, textAlign: 'center', marginTop: spacing.sm },
  disclaimer: { ...type.caption, color: colors.inkFaint, marginTop: spacing.lg, lineHeight: 17, textAlign: 'center' },
  empty: { padding: 20 },
  emptyTitle: { ...type.subtitle, color: colors.ink },
  emptyBody: { ...type.caption, color: colors.inkMuted, marginTop: 8, lineHeight: 18 },
});
