import { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text } from 'react-native';
import createRunController from '../control/CreateRunController.js';
import { Button, Field, Header, Screen } from '../components/AppUI.js';
import { colors } from '../theme/colors.js';
import { spacing, type } from '../theme/typography.js';

export default function LogPastRunScreen({ navigation }) {
  const [name, setName] = useState('');
  const [date, setDate] = useState('');
  const [distance, setDistance] = useState('');
  const [durationMinutes, setDurationMinutes] = useState('');
  const [calories, setCalories] = useState('');
  const [avgHeartRate, setAvgHeartRate] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);

  async function save() {
    const distanceKm = Number(distance);
    const minutes = Number(durationMinutes);
    const parsedDate = date.trim() ? new Date(`${date.trim()}T12:00:00`) : null;

    if (!Number.isFinite(distanceKm) || distanceKm <= 0) return Alert.alert('Enter a valid distance');
    if (!Number.isFinite(minutes) || minutes <= 0) return Alert.alert('Enter a valid duration');
    if (!parsedDate || Number.isNaN(parsedDate.getTime())) return Alert.alert('Enter the date as YYYY-MM-DD');

    const durationSeconds = Math.round(minutes * 60);
    const startedAt = parsedDate.toISOString();
    const endedAt = new Date(parsedDate.getTime() + durationSeconds * 1000).toISOString();

    setSaving(true);
    const result = await createRunController({
      name: name.trim() || 'Past Run',
      description: description.trim() || null,
      distanceKm,
      durationSeconds,
      caloriesBurned: calories ? Number(calories) : null,
      avgHeartRate: avgHeartRate ? Number(avgHeartRate) : null,
      maxHeartRate: null,
      routeGps: [],
      startedAt,
      endedAt,
    });
    setSaving(false);

    if (!result.success) return Alert.alert('Could not save run', result.message);
    Alert.alert('Run saved', 'Your past run has been added to your history.', [
      { text: 'View Run History', onPress: () => navigation.replace('RunHistory') },
    ]);
  }

  return (
    <Screen>
      <Header title="Log Past Run" navigation={navigation} />
      <ScrollView contentContainerStyle={s.page} keyboardShouldPersistTaps="handled">
        <Text style={s.copy}>Record a run you completed earlier. GPS tracking is not required for past runs.</Text>
        <Field label="Run Name" value={name} onChangeText={setName} placeholder="Evening 5K" />
        <Field label="Date" value={date} onChangeText={setDate} placeholder="YYYY-MM-DD" autoCapitalize="none" />
        <Field label="Distance (km)" value={distance} onChangeText={setDistance} placeholder="5.0" keyboardType="decimal-pad" />
        <Field label="Duration (minutes)" value={durationMinutes} onChangeText={setDurationMinutes} placeholder="30" keyboardType="decimal-pad" />
        <Field label="Calories Burned" value={calories} onChangeText={setCalories} placeholder="Optional" keyboardType="number-pad" />
        <Field label="Average Heart Rate" value={avgHeartRate} onChangeText={setAvgHeartRate} placeholder="Optional" keyboardType="number-pad" />
        <Field label="Notes" value={description} onChangeText={setDescription} placeholder="How did the run feel?" multiline />
        <Button onPress={save} disabled={saving} style={s.save}>{saving ? 'Saving…' : 'Save Past Run'}</Button>
      </ScrollView>
    </Screen>
  );
}

const s = StyleSheet.create({
  page: { paddingHorizontal: spacing.lg, paddingBottom: 48 },
  copy: { ...type.body, color: colors.inkMuted, lineHeight: 19, marginTop: 4, marginBottom: 20 },
  save: { marginTop: 10 },
});
