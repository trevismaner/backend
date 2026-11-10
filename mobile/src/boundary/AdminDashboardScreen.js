import { useState, useCallback } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { View, Text, ScrollView, RefreshControl, Pressable, StyleSheet } from 'react-native';
import adminViewStatsController from '../control/AdminViewStatsController.js';
import { Screen } from '../components/AppUI.js';
import { AdminNav, Confirm, ErrorText } from '../components/AdminUI.js';
import { useAuth } from '../context/AuthContext.js';
import { colors } from '../theme/colors.js';

function Stat({value,title,sub,warn=false,onPress}){
  return <Pressable onPress={onPress} style={({pressed})=>[s.stat,pressed&&s.pressed]}>
    <Text style={s.statValue}>{value ?? '—'}</Text><Text style={s.statTitle}>{title}</Text><Text style={[s.statSub,warn&&s.warn]}>{sub}</Text>
  </Pressable>;
}
function Action({title,sub,onPress}){
  return <Pressable onPress={onPress} style={({pressed})=>[s.action,pressed&&s.pressed]}><Text style={s.actionTitle}>{title}</Text><Text style={s.actionSub}>{sub}</Text><Text style={s.chev}>›</Text></Pressable>;
}

export default function AdminDashboardScreen({navigation}){
  const [stats,setStats]=useState(null); const [error,setError]=useState(''); const [refreshing,setRefreshing]=useState(false);
  const [confirmSignOut,setConfirmSignOut]=useState(false); const [signingOut,setSigningOut]=useState(false);
  const { signOut } = useAuth();
  const load=useCallback(async()=>{const r=await adminViewStatsController(); if(r.success){setStats(r.data.stats);setError('')} else setError(r.message)},[]);
  useFocusEffect(useCallback(()=>{load()},[load]));
  async function refresh(){setRefreshing(true); await load(); setRefreshing(false)}
  const u=stats?.users||{}, g=stats?.groups||{};
  return <Screen style={s.screen}>
    <View style={s.topAccent}/><View style={s.headerWash}/>
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.page} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.primary}/> }>
      <View style={s.brandRow}>
        <Text style={s.rl}>RL</Text><Text style={s.admin}>ADMIN</Text>
        <View style={s.spacer}/>
        {/* SA-02: log out. Admins have no profile tab, so it lives here. */}
        <Pressable onPress={()=>setConfirmSignOut(true)} hitSlop={10} style={({pressed})=>[s.signOut,pressed&&s.pressed]}>
          <Text style={s.signOutText}>Sign Out</Text>
        </Pressable>
      </View>
      <Text style={s.title}>System Overview</Text><Text style={s.copy}>Platform health, moderation queues, and operational status.</Text>
      <ErrorText>{error}</ErrorText>
      <View style={s.grid}>
        <Stat value={(u.totalUsers ?? 0).toLocaleString()} title="Users" sub={`+${u.newUsersLast30Days ?? u.newUsersLast7Days ?? 0} this month`} onPress={()=>navigation.navigate('AdminUsers')}/>
        <Stat value={u.suspendedUsers ?? 0} title="Suspended" sub="Requires review" warn onPress={()=>navigation.navigate('AdminUsers',{suspended:true})}/>
        <Stat value={u.unverifiedInstructors ?? 0} title="Pending Instructors" sub="Credential checks" warn onPress={()=>navigation.navigate('AdminUsers',{role:'instructor'})}/>
        <Stat value={g.suspended ?? 0} title="Flagged Groups" sub="Moderation queue" warn onPress={()=>navigation.navigate('AdminGroups',{suspended:true})}/>
      </View>
      <Text style={s.section}>Needs Attention</Text>
      <Action title="Instructor verification" sub={`${u.unverifiedInstructors ?? 0} applications waiting`} onPress={()=>navigation.navigate('AdminUsers',{role:'instructor'})}/>
      <Action title="Flagged content" sub="Review platform content and moderation items" onPress={()=>navigation.navigate('AdminContent')}/>
      <Action title="Public event operations" sub="Create and manage platform-wide events" onPress={()=>navigation.navigate('AdminPublicEvents')}/>
      <Pressable style={({pressed})=>[s.management,pressed&&s.pressed]} onPress={()=>navigation.navigate('AdminContent')}><Text style={s.managementText}>Open Management Center</Text></Pressable>
    </ScrollView>
    <AdminNav navigation={navigation} active="Dashboard"/>
    <Confirm
      visible={confirmSignOut}
      title="Sign out?"
      message="You will need your email and password to sign back in."
      confirmLabel="Sign Out"
      destructive
      busy={signingOut}
      onCancel={()=>setConfirmSignOut(false)}
      onConfirm={async()=>{ setSigningOut(true); await signOut(); }}
    />
  </Screen>;
}
const s=StyleSheet.create({
  screen:{backgroundColor:colors.adminBackground}, topAccent:{position:'absolute',top:0,left:0,right:0,height:4,backgroundColor:colors.primary,zIndex:2},headerWash:{position:'absolute',top:0,left:0,right:0,height:86,backgroundColor:colors.surface,zIndex:0},
  page:{paddingHorizontal:19,paddingTop:13,paddingBottom:86},brandRow:{height:45,flexDirection:'row',alignItems:'flex-start'},spacer:{flex:1},
  signOut:{marginTop:4,paddingVertical:6,paddingHorizontal:12,borderRadius:14,borderWidth:1,borderColor:colors.border,backgroundColor:colors.surfaceRaised},
  signOutText:{fontSize:12,fontWeight:'600',color:colors.primary},rl:{fontSize:26,lineHeight:32,fontWeight:'700',color:colors.primary},admin:{fontSize:10,fontWeight:'700',color:colors.inkMuted,marginLeft:12,marginTop:8},
  title:{fontSize:28,lineHeight:34,fontWeight:'700',color:colors.ink,marginTop:10},copy:{fontSize:12,lineHeight:16,color:colors.inkMuted,marginTop:5,marginBottom:26},
  grid:{flexDirection:'row',flexWrap:'wrap',gap:10},stat:{width:'48.5%',height:96,borderWidth:1,borderColor:colors.border,borderRadius:16,backgroundColor:colors.surface,padding:13},statValue:{fontSize:25,fontWeight:'700',color:colors.ink},statTitle:{fontSize:12,fontWeight:'600',color:colors.ink,marginTop:2},statSub:{fontSize:10,color:colors.inkMuted,marginTop:6},warn:{color:colors.primary},
  section:{fontSize:19,fontWeight:'700',color:colors.ink,marginTop:26,marginBottom:14},action:{height:70,borderWidth:1,borderColor:colors.border,borderRadius:15,backgroundColor:colors.surface,justifyContent:'center',paddingHorizontal:13,marginBottom:12},actionTitle:{fontSize:14,fontWeight:'600',color:colors.ink},actionSub:{fontSize:11,color:colors.inkMuted,marginTop:7,paddingRight:28},chev:{position:'absolute',right:16,top:20,fontSize:22,color:colors.inkMuted},management:{height:64,borderRadius:16,backgroundColor:colors.primary,alignItems:'center',justifyContent:'center',marginTop:12},managementText:{fontSize:15,fontWeight:'700',color:colors.ink},pressed:{opacity:.76}
});
