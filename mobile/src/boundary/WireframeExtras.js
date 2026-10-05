import { useEffect, useState } from 'react';
import { ScrollView, View, Text, Pressable, StyleSheet, Switch, Alert } from 'react-native';
import { Screen, Header, Field, Button } from '../components/AppUI.js';
import { colors } from '../theme/colors.js';
import { useAppTheme } from '../context/ThemeContext.js';
import viewTournamentDetailsController from '../control/ViewTournamentDetailsController.js';
import updateTournamentDetailsController from '../control/UpdateTournamentDetailsController.js';
import setTournamentLimitsController from '../control/SetTournamentLimitsController.js';
import updateTournamentStatusController from '../control/UpdateTournamentStatusController.js';
import deleteTournamentController from '../control/DeleteTournamentController.js';

function Page({navigation,title,subtitle,children,right}){return <Screen><Header title={title} navigation={navigation} right={right}/><ScrollView contentContainerStyle={s.page} showsVerticalScrollIndicator={false}>{subtitle?<Text style={s.sub}>{subtitle}</Text>:null}{children}</ScrollView></Screen>}
function Row({title,subtitle,onPress,tone}){const content=<><View style={{flex:1}}><Text style={[s.rowTitle,tone&&{color:tone}]}>{title}</Text>{subtitle?<Text style={s.rowSub}>{subtitle}</Text>:null}</View>{onPress?<Text style={s.chev}>›</Text>:null}</>;return onPress?<Pressable onPress={onPress} style={s.row}>{content}</Pressable>:<View style={[s.row,s.rowStatic]}>{content}</View>}
function Section({children}){return <Text style={s.section}>{children}</Text>}

export function EmailVerificationScreen({navigation,route}){const [code,setCode]=useState('');return <Page navigation={navigation} title="Verify email" subtitle="Enter the verification code sent to your email address."><Text style={s.kicker}>EMAIL VERIFICATION</Text><Text style={s.hero}>Check your inbox</Text><Field label="Verification code" value={code} onChangeText={setCode} placeholder="000000" keyboardType="number-pad"/><Button onPress={()=>navigation.navigate(route.params?.next||'CreatePassword',{registration:route.params?.registration})}>Verify & Continue</Button><Pressable onPress={()=>Alert.alert('Verification code','A new code has been requested.')}><Text style={s.link}>Resend code</Text></Pressable></Page>}
export function AccountCreatedScreen({navigation}){return <Page navigation={navigation} title="Account created"><View style={s.successCircle}><Text style={s.successTick}>✓</Text></View><Text style={[s.hero,{textAlign:'center'}]}>You’re ready to run.</Text><Text style={[s.sub,{textAlign:'center'}]}>Your Run League account has been created successfully.</Text><Button style={{marginTop:30}} onPress={()=>navigation.navigate('SignIn')}>Continue to Log In</Button></Page>}
export function GroupInvitesScreen({navigation}){return <Page navigation={navigation} title="Invites & Requests" subtitle="Review group invitations and membership requests."><Section>Invitations</Section><Row title="East Coast Runners" subtitle="Invited by Jordan • 42 members" onPress={()=>Alert.alert('Invitation','Accept or decline this invitation.')}/><Section>Pending requests</Section><Row title="City Tempo Club" subtitle="Request pending"/></Page>}
export function GroupManagementScreen({navigation}){return <Page navigation={navigation} title="Group Management" subtitle="Manage members, invitations and group details."><Row title="Edit Group" subtitle="Name, description and visibility" onPress={()=>navigation.navigate('CreateGroup',{editing:true})}/><Row title="Invite Runners" subtitle="Send an invitation to a runner"/><Row title="Join Requests" subtitle="Approve or reject membership requests"/><Row title="Members" subtitle="Promote or remove group members"/><Row title="Group Leaderboard" subtitle="View rankings for this group" onPress={()=>navigation.navigate('GroupLeaderboard')}/><Row title="Leave Group" subtitle="Leave this running community" tone={colors.primary}/></Page>}
export function TournamentManagementScreen({navigation,route}){
  const tournamentId=route.params?.tournamentId;
  const [tournament,setTournament]=useState(route.params?.tournament||null);
  const [panel,setPanel]=useState(null);
  const [saving,setSaving]=useState(false);
  const [name,setName]=useState(route.params?.tournament?.name||'');
  const [description,setDescription]=useState(route.params?.tournament?.description||'');
  const [distanceType,setDistanceType]=useState(route.params?.tournament?.distanceType||'');
  const [maxParticipants,setMaxParticipants]=useState(route.params?.tournament?.maxParticipants?String(route.params.tournament.maxParticipants):'');
  const [registrationDeadline,setRegistrationDeadline]=useState(route.params?.tournament?.registrationDeadline||'');

  useEffect(()=>{(async()=>{
    if(!tournamentId)return;
    const result=await viewTournamentDetailsController(tournamentId);
    if(result.success){
      const t=result.data.tournament;
      setTournament(t);
      setName(t.name||'');
      setDescription(t.description||'');
      setDistanceType(t.distanceType||'');
      setMaxParticipants(t.maxParticipants?String(t.maxParticipants):'');
      setRegistrationDeadline(t.registrationDeadline||'');
    }
  })()},[tournamentId]);

  async function saveDetails(){
    setSaving(true);
    const result=await updateTournamentDetailsController(tournamentId,{name,description,distanceType});
    setSaving(false);
    if(result.success){
      setTournament(result.data.tournament||result.data);
      setPanel(null);
      Alert.alert('Saved','Tournament details updated.');
    }else Alert.alert('Could not update tournament',result.message);
  }

  async function saveLimits(){
    const parsed=maxParticipants.trim()===''?null:Number(maxParticipants);
    if(parsed!==null&&(!Number.isInteger(parsed)||parsed<1)){
      Alert.alert('Invalid participant limit','Enter a positive whole number.');
      return;
    }
    setSaving(true);
    const result=await setTournamentLimitsController(tournamentId,{
      maxParticipants:parsed,
      registrationDeadline:registrationDeadline.trim()||null,
    });
    setSaving(false);
    if(result.success){
      setTournament(result.data.tournament||result.data);
      setPanel(null);
      Alert.alert('Saved','Registration limits updated.');
    }else Alert.alert('Could not update limits',result.message);
  }

  async function changeStatus(status){
    setSaving(true);
    const result=await updateTournamentStatusController(tournamentId,status);
    setSaving(false);
    if(result.success){
      setTournament(result.data.tournament||result.data);
      setPanel(null);
      Alert.alert('Status updated',`Tournament is now ${status.replace('_',' ')}.`);
    }else Alert.alert('Could not update status',result.message);
  }

  function removeTournament(){
    Alert.alert('Delete tournament','This cannot be undone.',[
      {text:'Cancel',style:'cancel'},
      {text:'Delete',style:'destructive',onPress:async()=>{
        const result=await deleteTournamentController(tournamentId);
        if(result.success) navigation.navigate('TournamentHub');
        else Alert.alert('Could not delete tournament',result.message);
      }},
    ]);
  }

  return <Page navigation={navigation} title="Tournament Management" subtitle="Choose what you want to manage for this tournament.">
    <Row title="Edit Tournament Details" subtitle="Update the name, distance and description" onPress={()=>setPanel(panel==='details'?null:'details')}/>
    {panel==='details'?<View style={s.managerPanel}>
      <Field label="Tournament Name" value={name} onChangeText={setName}/>
      <Field label="Distance / Type" value={distanceType} onChangeText={setDistanceType} placeholder="e.g. 5 km"/>
      <Field label="Description" value={description} onChangeText={setDescription} multiline/>
      <Button disabled={saving} onPress={saveDetails}>{saving?'Saving…':'Save Details'}</Button>
    </View>:null}

    <Row title="Participant Limit & Deadline" subtitle="Control registration capacity and closing date" onPress={()=>setPanel(panel==='limits'?null:'limits')}/>
    {panel==='limits'?<View style={s.managerPanel}>
      <Field label="Maximum Participants" value={maxParticipants} onChangeText={setMaxParticipants} keyboardType="number-pad" placeholder="Leave blank for no limit"/>
      <Field label="Registration Deadline" value={registrationDeadline} onChangeText={setRegistrationDeadline} placeholder="YYYY-MM-DD or ISO date"/>
      <Button disabled={saving} onPress={saveLimits}>{saving?'Saving…':'Save Limits'}</Button>
    </View>:null}

    <Row title="Update Tournament Status" subtitle={`Current status: ${(tournament?.status||'open').replace('_',' ')}`} onPress={()=>setPanel(panel==='status'?null:'status')}/>
    {panel==='status'?<View style={s.managerPanel}>
      <Text style={s.managerHint}>Tournament status moves forward in order.</Text>
      {tournament?.status==='open'?<Button disabled={saving} onPress={()=>changeStatus('in_progress')}>Start Tournament</Button>:null}
      {tournament?.status==='in_progress'?<Button disabled={saving} onPress={()=>changeStatus('completed')}>Mark as Completed</Button>:null}
      {tournament?.status==='completed'?<Text style={s.managerHint}>This tournament is completed.</Text>:null}
    </View>:null}

    <Row title="View Tournament" subtitle="Return to tournament details and standings" onPress={()=>navigation.navigate('TournamentDetails',{tournamentId,isCreated:true})}/>
    <Row title="Delete Tournament" subtitle="Permanently remove this tournament" tone={colors.primary} onPress={removeTournament}/>
  </Page>
}
export function WearableScreen({navigation}){return <Page navigation={navigation} title="Connected Devices" subtitle="Connect a wearable to sync health and training data."><Section>Wearables</Section><Row title="Apple Watch" subtitle="Not connected"/><Row title="Garmin" subtitle="Not connected"/><Row title="Fitbit" subtitle="Not connected"/><Text style={s.note}>Connected device data can be used for heart-rate and training insights when supported by the integration.</Text></Page>}
export function ConnectedAccountsScreen({navigation}){return <Page navigation={navigation} title="Connected Accounts" subtitle="Manage social accounts used for sharing."><Row title="Instagram" subtitle="Not connected"/><Row title="Facebook" subtitle="Not connected"/><Row title="Strava" subtitle="Not connected"/><Text style={s.note}>The wireframe includes account connection screens. Native sharing can still be used when OAuth is unavailable.</Text></Page>}
export function AppearanceScreen({navigation}){const {isDark,setMode}=useAppTheme();const lightMode=!isDark;return <Page navigation={navigation} title="Appearance" subtitle="Run League starts in dark mode. Turn on Light Mode here if you prefer it."><View style={s.toggleRow}><View style={{flex:1}}><Text style={s.rowTitle}>Light Mode</Text><Text style={s.rowSub}>{lightMode?'Light theme is active':'Dark theme is active'}</Text></View><Switch value={lightMode} onValueChange={(value)=>setMode(value?'light':'dark')} trackColor={{false:colors.border,true:colors.primary}} thumbColor={colors.ink}/></View></Page>}
export function InstructorProfileScreen({navigation}){return <Page navigation={navigation} title="Instructor Profile" subtitle="Professional details and verified credentials."><View style={s.profileHero}><View style={s.avatar}><Text style={s.avatarText}>I</Text></View><Text style={s.hero}>Fitness Instructor</Text><Text style={s.sub}>Verified Run League instructor</Text></View><Section>Professional details</Section><Row title="Qualifications" subtitle="View verified qualifications"/><Row title="Credentials" subtitle="Verification status and documents"/><Button style={{marginTop:26}} onPress={()=>navigation.navigate('Profile')}>Edit Profile</Button></Page>}
export function HelpTopicScreen({navigation,route}){const title=route.params?.title||'Help';return <Page navigation={navigation} title={title} subtitle="Run League help and troubleshooting."><Section>Common questions</Section><Row title="How does this feature work?" subtitle="View setup and usage guidance"/><Row title="Troubleshooting" subtitle="Steps for common problems"/><Row title="Still need help?" subtitle="Contact support" onPress={()=>navigation.navigate('Feedback')}/></Page>}

const s=StyleSheet.create({page:{paddingHorizontal:20,paddingBottom:60},sub:{fontSize:13,lineHeight:18,color:colors.inkMuted,marginTop:4,marginBottom:24},kicker:{fontSize:10,fontWeight:'700',color:colors.primary,marginTop:18},hero:{fontSize:26,fontWeight:'700',color:colors.ink,marginTop:10,marginBottom:22},section:{fontSize:18,fontWeight:'700',color:colors.ink,marginTop:18,marginBottom:12},row:{minHeight:74,borderWidth:1,borderColor:colors.border,borderRadius:16,backgroundColor:colors.surface,marginBottom:12,padding:15,flexDirection:'row',alignItems:'center'},rowStatic:{opacity:0.72},rowTitle:{fontSize:15,fontWeight:'600',color:colors.ink},rowSub:{fontSize:11,lineHeight:15,color:colors.inkMuted,marginTop:5,paddingRight:18},chev:{fontSize:22,color:colors.inkMuted},link:{fontSize:12,fontWeight:'600',color:colors.primary,marginTop:18,textAlign:'center'},successCircle:{width:82,height:82,borderRadius:41,backgroundColor:'#102619',borderWidth:1,borderColor:'#5BCB8A',alignItems:'center',justifyContent:'center',alignSelf:'center',marginTop:70},successTick:{fontSize:36,color:'#5BCB8A'},note:{fontSize:11,lineHeight:16,color:colors.inkMuted,marginTop:10},toggleRow:{minHeight:74,borderWidth:1,borderColor:colors.border,borderRadius:16,backgroundColor:colors.surface,marginBottom:12,padding:15,flexDirection:'row',alignItems:'center',justifyContent:'space-between'},managerPanel:{borderWidth:1,borderColor:colors.border,borderRadius:16,backgroundColor:colors.surface,padding:14,marginTop:-4,marginBottom:14},managerHint:{fontSize:11,lineHeight:16,color:colors.inkMuted,marginBottom:12},profileHero:{alignItems:'center',marginTop:20},avatar:{width:96,height:96,borderRadius:48,backgroundColor:'#323E48',alignItems:'center',justifyContent:'center'},avatarText:{fontSize:36,fontWeight:'700',color:colors.primary}});
