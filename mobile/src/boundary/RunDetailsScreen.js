import { useEffect, useState } from 'react';
import { View, Text, TextInput, StyleSheet, Pressable, Alert, ScrollView } from 'react-native';
import MapView, { Polyline } from 'react-native-maps';
import viewRunDetailsController from '../control/ViewRunDetailsController.js';
import updateRunNameController from '../control/UpdateRunNameController.js';
import updateRunDescriptionController from '../control/UpdateRunDescriptionController.js';
import updateRunController from '../control/UpdateRunController.js';
import deleteRunController from '../control/DeleteRunController.js';
import shareRunController from '../control/ShareRunController.js';
import { colors } from '../theme/colors.js';
import { type, spacing, radius } from '../theme/typography.js';
import { formatDuration } from '../utils/geo.js';
import { Header, Screen } from '../components/AppUI.js';

export default function RunDetailsScreen({ route, navigation }) {
  const { runId } = route.params;
  const [run, setRun] = useState(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isSavingName, setIsSavingName] = useState(false);
  const [isSavingDescription, setIsSavingDescription] = useState(false);

  // Corrections are held as text so a field can be cleared without becoming 0.
  const [editDistance, setEditDistance] = useState('');
  const [editMinutes, setEditMinutes] = useState('');
  const [editCalories, setEditCalories] = useState('');
  const [editAvgHeartRate, setEditAvgHeartRate] = useState('');
  const [isSavingCorrections, setIsSavingCorrections] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    loadRun();
  }, [runId]);

  async function loadRun() {
    const result = await viewRunDetailsController(runId);
    if (result.success) {
      const loaded = result.data.run;
      setRun(loaded);
      setName(loaded.name || '');
      setDescription(loaded.description || '');
      setEditDistance(loaded.distanceKm != null ? String(loaded.distanceKm) : '');
      setEditMinutes(loaded.durationSeconds ? String(Math.round(loaded.durationSeconds / 60)) : '');
      setEditCalories(loaded.caloriesBurned != null ? String(loaded.caloriesBurned) : '');
      setEditAvgHeartRate(loaded.avgHeartRate != null ? String(loaded.avgHeartRate) : '');
    } else {
      Alert.alert('Could not load run', result.message);
    }
  }

  /**
   * Sends only what the user actually changed. The server re-validates the whole run and
   * moves the points by the difference in distance.
   */
  async function handleSaveCorrections() {
    const changes = {};
    const distance = Number(editDistance);
    if (editDistance !== '' && distance !== Number(run.distanceKm)) changes.distanceKm = distance;

    const seconds = Math.round(Number(editMinutes) * 60);
    if (editMinutes !== '' && seconds !== run.durationSeconds) changes.durationSeconds = seconds;

    if (editCalories !== '' && Number(editCalories) !== run.caloriesBurned) changes.caloriesBurned = editCalories;
    if (editAvgHeartRate !== '' && Number(editAvgHeartRate) !== run.avgHeartRate) {
      changes.avgHeartRate = editAvgHeartRate;
    }

    if (Object.keys(changes).length === 0) {
      Alert.alert('Nothing to change', 'These figures already match the saved run.');
      return;
    }

    setIsSavingCorrections(true);
    const result = await updateRunController(runId, changes);
    setIsSavingCorrections(false);

    if (!result.success) {
      Alert.alert('Could not save corrections', result.message);
      return;
    }

    setRun(result.data.run);
    const adjustment = result.data.pointsAdjustment ?? 0;
    Alert.alert(
      'Run updated',
      adjustment === 0
        ? 'Your changes have been saved.'
        : `Your changes have been saved, and your points ${adjustment > 0 ? 'went up' : 'came down'} by ${Math.abs(adjustment)}.`
    );
  }

  function handleDelete() {
    Alert.alert(
      'Delete this run',
      'The run will be removed from your history, and the points it earned will be taken back.',
      [
        { text: 'Keep it', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setIsDeleting(true);
            const result = await deleteRunController(runId);
            setIsDeleting(false);
            if (!result.success) {
              Alert.alert('Could not delete run', result.message);
              return;
            }
            navigation.goBack();
          },
        },
      ]
    );
  }

  async function handleSaveName() {
    setIsSavingName(true);
    const result = await updateRunNameController(runId, name);
    setIsSavingName(false);
    if (!result.success) {
      Alert.alert('Could not update name', result.message);
    }
  }

  async function handleSaveDescription() {
    setIsSavingDescription(true);
    const result = await updateRunDescriptionController(runId, description);
    setIsSavingDescription(false);
    if (!result.success) {
      Alert.alert('Could not update description', result.message);
    }
  }

  if (!run) {
    return (
      <Screen><Header title="Run Details" navigation={navigation}/><Text style={styles.loadingText}>Loading run…</Text></Screen>
    );
  }

  async function handleShare() {
    await shareRunController(run);
  }

  const routePoints = Array.isArray(run.routeGps) ? run.routeGps : [];
  const hasRoute = routePoints.length > 1;

  return (
    <Screen>
      <Header title="Run Details" navigation={navigation}/>
      <ScrollView contentContainerStyle={styles.content}>
        {hasRoute && (
          <MapView
            style={styles.map}
            initialRegion={{
              latitude: routePoints[0].latitude,
              longitude: routePoints[0].longitude,
              latitudeDelta: 0.01,
              longitudeDelta: 0.01,
            }}
            scrollEnabled={false}
            zoomEnabled={false}
          >
            <Polyline coordinates={routePoints} strokeColor={colors.primary} strokeWidth={4} />
          </MapView>
        )}

        <View style={styles.statsRow}>
          <View style={styles.statBlock}>
            <Text style={styles.statValue}>{run.distanceKm}</Text>
            <Text style={styles.statLabel}>km</Text>
          </View>
          <View style={styles.statBlock}>
            <Text style={styles.statValue}>{formatDuration(run.durationSeconds)}</Text>
            <Text style={styles.statLabel}>time</Text>
          </View>
          <View style={styles.statBlock}>
            <Text style={styles.statValue}>{run.caloriesBurned ?? '—'}</Text>
            <Text style={styles.statLabel}>calories</Text>
          </View>
        </View>

        <Text style={styles.label}>Name</Text>
        <TextInput style={styles.input} value={name} onChangeText={setName} />
        <Pressable style={styles.saveLink} onPress={handleSaveName} disabled={isSavingName}>
          <Text style={styles.saveLinkText}>{isSavingName ? 'Saving…' : 'Save name'}</Text>
        </Pressable>

        <Text style={styles.label}>Description</Text>
        <TextInput
          style={[styles.input, styles.textArea]}
          value={description}
          onChangeText={setDescription}
          multiline
        />
        <Pressable style={styles.saveLink} onPress={handleSaveDescription} disabled={isSavingDescription}>
          <Text style={styles.saveLinkText}>{isSavingDescription ? 'Saving…' : 'Save description'}</Text>
        </Pressable>

        <Text style={styles.label}>Correct the figures</Text>
        <Text style={styles.hint}>
          Fix a distance GPS got wrong, or fill in calories and heart rate. Changing the
          distance adjusts the points this run earned.
        </Text>
        <View style={styles.correctionRow}>
          {[
            ['Distance (km)', editDistance, setEditDistance, 'decimal-pad'],
            ['Duration (min)', editMinutes, setEditMinutes, 'decimal-pad'],
          ].map(([label, value, onChange, keyboardType]) => (
            <View key={label} style={styles.correctionField}>
              <Text style={styles.smallLabel}>{label}</Text>
              <TextInput style={styles.input} value={value} onChangeText={onChange} keyboardType={keyboardType} />
            </View>
          ))}
        </View>
        <View style={styles.correctionRow}>
          {[
            ['Calories', editCalories, setEditCalories],
            ['Avg heart rate', editAvgHeartRate, setEditAvgHeartRate],
          ].map(([label, value, onChange]) => (
            <View key={label} style={styles.correctionField}>
              <Text style={styles.smallLabel}>{label}</Text>
              <TextInput style={styles.input} value={value} onChangeText={onChange} keyboardType="number-pad" />
            </View>
          ))}
        </View>
        <Pressable style={styles.saveLink} onPress={handleSaveCorrections} disabled={isSavingCorrections}>
          <Text style={styles.saveLinkText}>{isSavingCorrections ? 'Saving…' : 'Save corrections'}</Text>
        </Pressable>

        <Pressable style={styles.shareButton} onPress={handleShare}>
          <Text style={styles.shareButtonText}>Share this run</Text>
        </Pressable>

        <Pressable style={styles.deleteButton} onPress={handleDelete} disabled={isDeleting}>
          <Text style={styles.deleteButtonText}>{isDeleting ? 'Deleting…' : 'Delete this run'}</Text>
        </Pressable>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg },
  loadingText: { ...type.body, color: colors.inkMuted, textAlign: 'center', marginTop: spacing.xl },
  map: { height: 180, borderRadius: radius.lg, marginBottom: spacing.lg },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    paddingVertical: spacing.lg,
    marginBottom: spacing.lg,
  },
  statBlock: { alignItems: 'center' },
  statValue: { ...type.title, color: colors.ink },
  statLabel: { ...type.caption, color: colors.inkMuted },
  label: { ...type.label, color: colors.inkMuted, marginBottom: spacing.xs, marginTop: spacing.md },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 4,
    fontSize: type.body.fontSize,
    color: colors.ink,
  },
  textArea: { minHeight: 90, textAlignVertical: 'top' },
  saveLink: { alignSelf: 'flex-end', marginTop: spacing.xs },
  saveLinkText: { ...type.caption, color: colors.primary, fontWeight: '600' },
  shareButton: {
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: spacing.sm + 4,
    alignItems: 'center',
    marginTop: spacing.lg,
  },
  shareButtonText: { ...type.bodyStrong, color: colors.primary },
  hint: { ...type.caption, color: colors.inkMuted, marginBottom: spacing.sm },
  correctionRow: { flexDirection: 'row', gap: spacing.md },
  correctionField: { flex: 1 },
  smallLabel: { ...type.caption, color: colors.inkMuted, marginBottom: spacing.xs },
  deleteButton: {
    borderWidth: 1,
    borderColor: colors.riskHigh,
    borderRadius: radius.md,
    paddingVertical: spacing.sm + 4,
    alignItems: 'center',
    marginTop: spacing.lg,
  },
  deleteButtonText: { ...type.bodyStrong, color: colors.riskHigh },
});
