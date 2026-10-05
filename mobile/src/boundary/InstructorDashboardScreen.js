import { useState, useCallback } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { View, Text, ScrollView, RefreshControl, Pressable, StyleSheet } from 'react-native';
import viewMyInstructorPostsController from '../control/ViewMyInstructorPostsController.js';
import { Screen } from '../components/AppUI.js';
import { InstructorNav, VerificationBanner, ErrorText } from '../components/InstructorUI.js';
import { colors } from '../theme/colors.js';

function Metric({value,label}){return <View style={s.metric}><Text style={s.metricV}>{value ?? '—'}</Text><Text style={s.metricL}>{label}</Text></View>}
function Quick({title,sub,onPress}){return <Pressable style={({pressed})=>[s.quick,pressed&&s.pressed]} onPress={onPress}><Text style={s.quickTitle}>{title}</Text><Text style={s.quickSub}>{sub}</Text></Pressable>}

export default function InstructorDashboardScreen({navigation}){
  const [posts,setPosts]=useState([]); const [stats,setStats]=useState(null); const [verified,setVerified]=useState(true); const [error,setError]=useState(''); const [refreshing,setRefreshing]=useState(false);
  const load=useCallback(async()=>{const r=await viewMyInstructorPostsController({limit:50});if(r.success){setPosts(r.data.posts||[]);setStats(r.data.stats||null);setVerified(r.data.credentialsVerified);setError('')}else setError(r.message)},[]);
  useFocusEffect(useCallback(()=>{load()},[load]));
  async function refresh(){setRefreshing(true);await load();setRefreshing(false)}
  const featured=posts[0];
  return <Screen>
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.page} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.primary}/> }>
      <View style={s.brand}><Text style={s.rl}>RL</Text><Text style={s.role}>INSTRUCTOR</Text></View>
      <Text style={s.title}>Instructor Board</Text><Text style={s.copy}>Create guidance and manage your published posts.</Text>
      <VerificationBanner verified={verified}/><ErrorText>{error}</ErrorText>
      {/* Only a real post is tappable. Without one, say so plainly rather than showing
          placeholder text that looks like a post but goes nowhere. */}
      <Pressable
        disabled={!featured}
        style={({pressed})=>[s.feature,featured&&pressed&&s.pressed,!featured&&s.featureEmpty]}
        onPress={()=>navigation.navigate('InstructorPostDetails',{postId:featured.postId})}
      >
        <Text style={s.featureTag}>{featured?'YOUR LATEST POST':'NO POSTS YET'}</Text>
        {featured ? <>
          <Text numberOfLines={2} style={s.featureTitle}>{featured.title}</Text>
          <Text style={s.featureMeta}>{featured.category || 'Uncategorised'}</Text>
          <Text style={s.featureView}>View ›</Text>
        </> : <>
          <Text numberOfLines={2} style={s.featureTitle}>Nothing published yet</Text>
          <Text style={s.featureMeta}>{verified?'Use Create Post below to publish your first one.':'You can publish once an admin verifies your credentials.'}</Text>
        </>}
      </Pressable>
      <Text style={s.section}>Overview</Text>
      <View style={s.metrics}><Metric value={stats?.totalPosts ?? posts.length} label="Published"/><Metric value={stats?.postsLast30Days ?? '—'} label="Last 30 days"/><Metric value={stats?.categoriesUsed ?? '—'} label="Categories"/></View>
      <Text style={s.section}>Quick actions</Text>
      <View style={s.quickRow}><Quick title="Create Post" sub="Publish new coaching content" onPress={()=>navigation.navigate('InstructorCreatePost')}/><Quick title="Manage Posts" sub="Edit or remove existing posts" onPress={()=>navigation.navigate('InstructorPosts')}/></View>
      <Pressable style={({pressed})=>[s.profile,pressed&&s.pressed]} onPress={()=>navigation.navigate('InstructorProfile')}><Text style={s.profileTitle}>Instructor Profile</Text><Text style={s.profileSub}>Professional details and credentials</Text><Text style={s.chev}>›</Text></Pressable>
    </ScrollView>
    <InstructorNav navigation={navigation} active="Dashboard"/>
  </Screen>
}
const s=StyleSheet.create({
  page:{paddingHorizontal:20,paddingTop:18,paddingBottom:86},brand:{height:43,flexDirection:'row',alignItems:'flex-start'},rl:{fontSize:28,fontWeight:'800',color:colors.primary},role:{fontSize:10,fontWeight:'700',color:colors.inkMuted,marginLeft:12,marginTop:10},
  title:{fontSize:28,lineHeight:34,fontWeight:'700',color:colors.ink,marginTop:17},copy:{fontSize:13,lineHeight:18,color:colors.inkMuted,marginTop:5,marginBottom:20},
  feature:{height:160,borderWidth:1,borderColor:colors.border,borderRadius:20,backgroundColor:colors.surfaceRaised,padding:15,marginTop:4},featureEmpty:{borderStyle:'dashed',backgroundColor:colors.surface},featureTag:{fontSize:10,fontWeight:'700',color:colors.primary},featureTitle:{fontSize:21,lineHeight:25,fontWeight:'700',color:colors.ink,marginTop:17,maxWidth:318},featureMeta:{fontSize:11,color:colors.inkMuted,marginTop:14},featureView:{fontSize:12,fontWeight:'600',color:colors.ink,marginTop:12},
  section:{fontSize:18,fontWeight:'700',color:colors.ink,marginTop:30,marginBottom:14},metrics:{flexDirection:'row',gap:10},metric:{flex:1,height:82,borderWidth:1,borderColor:colors.border,borderRadius:15,backgroundColor:colors.surface,padding:13},metricV:{fontSize:22,fontWeight:'700',color:colors.ink},metricL:{fontSize:10,color:colors.inkMuted,marginTop:10},
  quickRow:{flexDirection:'row',gap:10},quick:{flex:1,height:104,borderWidth:1,borderColor:colors.border,borderRadius:17,backgroundColor:colors.surface,padding:13},quickTitle:{fontSize:15,fontWeight:'600',color:colors.ink},quickSub:{fontSize:10.5,lineHeight:14,color:colors.inkMuted,marginTop:10},
  profile:{height:74,borderWidth:1,borderColor:colors.border,borderRadius:16,backgroundColor:colors.surface,padding:15,marginTop:14},profileTitle:{fontSize:14,fontWeight:'600',color:colors.ink},profileSub:{fontSize:11,color:colors.inkMuted,marginTop:7},chev:{position:'absolute',right:18,top:22,fontSize:20,color:colors.inkMuted},pressed:{opacity:.76}
});
