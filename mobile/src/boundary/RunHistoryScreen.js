import { useEffect, useState, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, FlatList } from 'react-native';
import viewRunHistoryController from '../control/ViewRunHistoryController.js';
import searchRunHistoryController from '../control/SearchRunHistoryController.js';
import { Screen, Header, Field, ListCard, StatCard, Chip, BottomNav } from '../components/AppUI.js';
import { colors } from '../theme/colors.js';
import { spacing, type } from '../theme/typography.js';
import { formatDuration } from '../utils/geo.js';

export default function RunHistoryScreen({ navigation }) {
  const [runs, setRuns] = useState([]); const [query, setQuery] = useState(''); const [period, setPeriod] = useState('MONTH');
  const loadRuns = useCallback(async () => { const r = await viewRunHistoryController({ limit: 50 }); if (r.success) setRuns(r.data.runs || []); }, []);
  useEffect(() => { loadRuns(); }, [loadRuns]);
  async function search(text) { setQuery(text); if (!text) return loadRuns(); const r = await searchRunHistoryController(text); if (r.success) setRuns(r.data.runs || []); }
  const total = useMemo(() => runs.reduce((s, r) => s + Number(r.distanceKm ?? 0), 0), [runs]);
  return <Screen>
    <Header title="Run History" navigation={navigation} />
    <FlatList data={runs} keyExtractor={(i)=>String(i.runId)} contentContainerStyle={styles.content}
      ListHeaderComponent={<>
        <View style={styles.stats}><StatCard value={`${total.toFixed(1)} km`} label="This Month"/><StatCard value={String(runs.length)} label="Runs"/></View>
        <View style={styles.chips}>{['WEEK','MONTH','YEAR'].map(x=><Chip key={x} active={period===x} onPress={()=>setPeriod(x)}>{x}</Chip>)}</View>
        <Field label="Search" value={query} onChangeText={search} placeholder="Morning Run" />
      </>}
      renderItem={({item})=><ListCard title={item.name || 'Untitled run'} subtitle={`${Number(item.distanceKm || 0).toFixed(1)} km • ${formatDuration(item.durationSeconds || 0)} • ${new Date(item.startedAt).toLocaleDateString()}`} onPress={()=>navigation.navigate('RunDetails',{runId:item.runId})}/>} 
      ListEmptyComponent={<Text style={styles.empty}>No runs found.</Text>} />
    <BottomNav navigation={navigation} active="Run" />
  </Screen>;
}
const styles=StyleSheet.create({content:{paddingHorizontal:spacing.lg,paddingBottom:85},stats:{flexDirection:'row',gap:18,marginTop:12,marginBottom:18},chips:{flexDirection:'row',gap:10,marginBottom:18},empty:{...type.body,color:colors.inkMuted,textAlign:'center',marginTop:30}});
