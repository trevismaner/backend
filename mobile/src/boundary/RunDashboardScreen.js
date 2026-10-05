import { ScrollView, View, Text, Pressable, StyleSheet } from 'react-native';
import { Screen, BottomNav } from '../components/AppUI.js';
import { colors } from '../theme/colors.js';

function Row({title,sub,onPress,primary=false,compact=false}){
  return <Pressable onPress={onPress} style={({pressed})=>[s.row,compact&&s.compact,primary&&s.primary,pressed&&s.pressed]}>
    <View style={s.copyWrap}><Text style={[s.rowTitle,compact&&s.compactTitle,primary&&s.primaryTitle]}>{title}</Text><Text style={[s.rowSub,compact&&s.compactSub,primary&&s.primarySub]}>{sub}</Text></View><Text style={[s.chev,primary&&s.primaryTitle]}>›</Text>
  </Pressable>
}
export default function RunDashboardScreen({navigation}){
  return <Screen>
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.page}>
      <View style={s.head}><View style={s.headCopy}><Text style={s.title}>Run</Text><Text style={s.copy}>Track, review, and understand your training.</Text></View><Pressable style={s.past} onPress={()=>navigation.navigate('LogPastRun')}><Text style={s.pastText}>Log Past Run</Text></Pressable></View>
      <Row primary title="Start a Run" sub="GPS tracking and live stats" onPress={()=>navigation.navigate('LogRun')}/>
      <Row title="Run History" sub="Review your recorded runs" onPress={()=>navigation.navigate('RunHistory')}/>
      <Row title="Search Runs" sub="Find runs by name, date, distance, or pace" onPress={()=>navigation.navigate('RunHistory',{search:true})}/>
      <Text style={s.section}>Insights</Text>
      <Row compact title="Calories" sub="Estimated energy burn" onPress={()=>navigation.navigate('RunInsights',{kind:'calories'})}/>
      <Row compact title="Heart Rate" sub="Average, maximum & zones" onPress={()=>navigation.navigate('RunInsights',{kind:'heart-rate'})}/>
      <Row compact title="Performance Trends" sub="Distance, pace & training load" onPress={()=>navigation.navigate('RunInsights',{kind:'trends'})}/>
      <Row compact title="Risk Assessment" sub="Recovery and injury-risk signals" onPress={()=>navigation.navigate('RiskAssessment')}/>
    </ScrollView>
    <BottomNav navigation={navigation} active="Run"/>
  </Screen>
}
const s=StyleSheet.create({
  page:{paddingHorizontal:20,paddingTop:18,paddingBottom:84},
  head:{height:82,flexDirection:'row',justifyContent:'space-between',alignItems:'flex-start'},headCopy:{flex:1,paddingRight:8},
  title:{fontSize:28,lineHeight:34,fontWeight:'700',color:colors.ink},copy:{fontSize:12,lineHeight:16,color:colors.inkMuted,marginTop:5},
  past:{height:38,width:118,borderRadius:12,borderWidth:1,borderColor:colors.border,backgroundColor:colors.surface,alignItems:'center',justifyContent:'center'},pastText:{fontSize:11,fontWeight:'600',color:colors.ink},
  row:{height:88,borderRadius:18,borderWidth:1,borderColor:colors.border,backgroundColor:colors.surfaceRaised,paddingHorizontal:17,marginBottom:14,justifyContent:'center'},
  compact:{height:56,borderRadius:14,paddingHorizontal:13,marginBottom:12},primary:{backgroundColor:colors.primary,borderColor:colors.primary},pressed:{opacity:.76},copyWrap:{paddingRight:34},
  rowTitle:{fontSize:16,fontWeight:'600',color:colors.ink},compactTitle:{fontSize:14},primaryTitle:{color:'#fff',fontWeight:'700'},rowSub:{fontSize:11,color:colors.inkMuted,marginTop:8},compactSub:{fontSize:10.5,marginTop:4},primarySub:{color:'#FFDDE4'},
  chev:{position:'absolute',right:18,fontSize:26,color:colors.inkMuted},section:{fontSize:18,fontWeight:'700',color:colors.ink,marginTop:14,marginBottom:16},
});
