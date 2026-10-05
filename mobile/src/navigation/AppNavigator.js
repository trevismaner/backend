import { NavigationContainer, DarkTheme, DefaultTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { ActivityIndicator, View, StyleSheet } from 'react-native';
import { useAuth } from '../context/AuthContext.js';
import { colors } from '../theme/colors.js';
import { useAppTheme } from '../context/ThemeContext.js';

import LandingScreen from '../boundary/LandingScreen.js';
import ChooseAccountTypeScreen from '../boundary/ChooseAccountTypeScreen.js';
import RegisterScreen from '../boundary/RegisterScreen.js';
import CreateInstructorAccountScreen from '../boundary/CreateInstructorAccountScreen.js';
import RunnerAccountInfoScreen from '../boundary/RunnerAccountInfoScreen.js';
import InstructorAccountInfoScreen from '../boundary/InstructorAccountInfoScreen.js';
import InstructorCredentialsScreen from '../boundary/InstructorCredentialsScreen.js';
import CreatePasswordScreen from '../boundary/CreatePasswordScreen.js';
import TermsConditionsScreen from '../boundary/TermsConditionsScreen.js';
import SignInScreen from '../boundary/SignInScreen.js';
import ForgotPasswordScreen from '../boundary/ForgotPasswordScreen.js';
import DashboardScreen from '../boundary/DashboardScreen.js';
import RunDashboardScreen from '../boundary/RunDashboardScreen.js';
import RunInsightsScreen from '../boundary/RunInsightsScreen.js';
import LogRunScreen from '../boundary/LogRunScreen.js';
import LogPastRunScreen from '../boundary/LogPastRunScreen.js';
import RunHistoryScreen from '../boundary/RunHistoryScreen.js';
import RunDetailsScreen from '../boundary/RunDetailsScreen.js';
import ProfileScreen from '../boundary/ProfileScreen.js';
import ProfileSettingsScreen from '../boundary/ProfileSettingsScreen.js';
import GroupsHubScreen from '../boundary/GroupsHubScreen.js';
import GroupsListScreen from '../boundary/GroupsListScreen.js';
import CreateGroupScreen from '../boundary/CreateGroupScreen.js';
import GroupDetailsScreen from '../boundary/GroupDetailsScreen.js';
import ManageGroupScreen from '../boundary/ManageGroupScreen.js';
import ManageGroupSectionScreen from '../boundary/ManageGroupSectionScreen.js';
import CreateTournamentScreen from '../boundary/CreateTournamentScreen.js';
import TournamentDetailsScreen from '../boundary/TournamentDetailsScreen.js';
import TournamentResultsScreen from '../boundary/TournamentResultsScreen.js';
import TournamentPreviewScreen from '../boundary/TournamentPreviewScreen.js';
import TournamentHubScreen from '../boundary/TournamentHubScreen.js';
import RewardsScreen from '../boundary/RewardsScreen.js';
import LeaderboardScreen from '../boundary/LeaderboardScreen.js';
import GroupLeaderboardScreen from '../boundary/GroupLeaderboardScreen.js';
import NotificationsScreen from '../boundary/NotificationsScreen.js';
import NotificationPreferencesScreen from '../boundary/NotificationPreferencesScreen.js';
import FitnessPlanScreen from '../boundary/FitnessPlanScreen.js';
import InstructorBoardScreen from '../boundary/InstructorBoardScreen.js';
import RiskAssessmentScreen from '../boundary/RiskAssessmentScreen.js';
import SupportScreen from '../boundary/SupportScreen.js';
import FeedbackScreen from '../boundary/FeedbackScreen.js';
import InstructorDashboardScreen from '../boundary/InstructorDashboardScreen.js';
import InstructorPostsScreen from '../boundary/InstructorPostsScreen.js';
import InstructorCreatePostScreen from '../boundary/InstructorCreatePostScreen.js';
import InstructorEditPostScreen from '../boundary/InstructorEditPostScreen.js';
import AdminDashboardScreen from '../boundary/AdminDashboardScreen.js';
import AdminUsersScreen from '../boundary/AdminUsersScreen.js';
import AdminUserDetailsScreen from '../boundary/AdminUserDetailsScreen.js';
import AdminCreateUserScreen from '../boundary/AdminCreateUserScreen.js';
import AdminEditUserScreen from '../boundary/AdminEditUserScreen.js';
import AdminEditGroupScreen from '../boundary/AdminEditGroupScreen.js';
import AdminGroupsScreen from '../boundary/AdminGroupsScreen.js';
import AdminContentScreen from '../boundary/AdminContentScreen.js';
import AdminRunsScreen from '../boundary/AdminRunsScreen.js';
import AdminAnnouncementScreen from '../boundary/AdminAnnouncementScreen.js';
import AdminAuditLogScreen from '../boundary/AdminAuditLogScreen.js';
import AdminPublicEventsScreen from '../boundary/AdminPublicEventsScreen.js';
import PublicEventsScreen from '../boundary/PublicEventsScreen.js';
import PublicEventDetailsScreen from '../boundary/PublicEventDetailsScreen.js';
import InstructorProfileScreen from '../boundary/InstructorProfileScreen.js';
import MyCredentialsScreen from '../boundary/MyCredentialsScreen.js';
import InstructorPostDetailsScreen from '../boundary/InstructorPostDetailsScreen.js';
import ConnectionsScreen from '../boundary/ConnectionsScreen.js';
import { EmailVerificationScreen, AccountCreatedScreen, GroupInvitesScreen, GroupManagementScreen, TournamentManagementScreen, AppearanceScreen, HelpTopicScreen } from '../boundary/WireframeExtras.js';

const Stack=createNativeStackNavigator();
const hidden={headerShown:false};

function SharedRunnerScreens(){return <>
  <Stack.Screen name="Dashboard" component={DashboardScreen}/>
  <Stack.Screen name="RunDashboard" component={RunDashboardScreen}/><Stack.Screen name="RunInsights" component={RunInsightsScreen}/><Stack.Screen name="LogRun" component={LogRunScreen}/><Stack.Screen name="LogPastRun" component={LogPastRunScreen}/><Stack.Screen name="RunHistory" component={RunHistoryScreen}/><Stack.Screen name="RunDetails" component={RunDetailsScreen}/>
  <Stack.Screen name="Profile" component={ProfileScreen}/><Stack.Screen name="ProfileSettings" component={ProfileSettingsScreen}/>
  <Stack.Screen name="GroupsHub" component={GroupsHubScreen}/><Stack.Screen name="GroupsList" component={GroupsListScreen}/><Stack.Screen name="CreateGroup" component={CreateGroupScreen}/><Stack.Screen name="GroupDetails" component={GroupDetailsScreen}/><Stack.Screen name="ManageGroup" component={ManageGroupScreen}/><Stack.Screen name="ManageGroupSection" component={ManageGroupSectionScreen}/><Stack.Screen name="GroupInvites" component={GroupInvitesScreen}/><Stack.Screen name="GroupManagement" component={GroupManagementScreen}/>
  <Stack.Screen name="CreateTournament" component={CreateTournamentScreen}/><Stack.Screen name="TournamentDetails" component={TournamentDetailsScreen}/><Stack.Screen name="TournamentResults" component={TournamentResultsScreen}/><Stack.Screen name="TournamentPreview" component={TournamentPreviewScreen}/><Stack.Screen name="TournamentHub" component={TournamentHubScreen}/><Stack.Screen name="PublicEvents" component={PublicEventsScreen}/><Stack.Screen name="PublicEventDetails" component={PublicEventDetailsScreen}/><Stack.Screen name="TournamentManagement" component={TournamentManagementScreen}/>
  <Stack.Screen name="Rewards" component={RewardsScreen}/><Stack.Screen name="Leaderboard" component={LeaderboardScreen}/><Stack.Screen name="GroupLeaderboard" component={GroupLeaderboardScreen}/>
  <Stack.Screen name="Notifications" component={NotificationsScreen}/><Stack.Screen name="NotificationPreferences" component={NotificationPreferencesScreen}/>
  <Stack.Screen name="FitnessPlan" component={FitnessPlanScreen}/><Stack.Screen name="InstructorBoard" component={InstructorBoardScreen}/><Stack.Screen name="InstructorPostDetails" component={InstructorPostDetailsScreen}/><Stack.Screen name="RiskAssessment" component={RiskAssessmentScreen}/>
  <Stack.Screen name="Wearable" component={ConnectionsScreen} initialParams={{kind:'wearable'}}/><Stack.Screen name="ConnectedAccounts" component={ConnectionsScreen} initialParams={{kind:'social'}}/><Stack.Screen name="Appearance" component={AppearanceScreen}/>
  <Stack.Screen name="Support" component={SupportScreen}/><Stack.Screen name="Feedback" component={FeedbackScreen}/><Stack.Screen name="HelpTopic" component={HelpTopicScreen}/>
</>}
function InstructorScreens(){return <>
  <Stack.Screen name="InstructorDashboard" component={InstructorDashboardScreen}/><Stack.Screen name="InstructorPosts" component={InstructorPostsScreen}/>
  <Stack.Screen name="InstructorBoard" component={InstructorBoardScreen}/><Stack.Screen name="InstructorPostDetails" component={InstructorPostDetailsScreen}/>
  <Stack.Screen name="InstructorCreatePost" component={InstructorCreatePostScreen}/><Stack.Screen name="InstructorEditPost" component={InstructorEditPostScreen}/>
  <Stack.Screen name="InstructorProfile" component={InstructorProfileScreen}/><Stack.Screen name="MyCredentials" component={MyCredentialsScreen}/>
  <Stack.Screen name="Notifications" component={NotificationsScreen}/><Stack.Screen name="NotificationPreferences" component={NotificationPreferencesScreen}/><Stack.Screen name="Appearance" component={AppearanceScreen}/><Stack.Screen name="Support" component={SupportScreen}/><Stack.Screen name="HelpTopic" component={HelpTopicScreen}/><Stack.Screen name="Feedback" component={FeedbackScreen}/>
</>}
function AdminScreens(){return <>
  <Stack.Screen name="AdminDashboard" component={AdminDashboardScreen}/>
  <Stack.Screen name="AdminUsers" component={AdminUsersScreen}/><Stack.Screen name="AdminUserDetails" component={AdminUserDetailsScreen}/><Stack.Screen name="AdminCreateUser" component={AdminCreateUserScreen}/><Stack.Screen name="AdminEditUser" component={AdminEditUserScreen}/>
  <Stack.Screen name="AdminGroups" component={AdminGroupsScreen}/><Stack.Screen name="AdminEditGroup" component={AdminEditGroupScreen}/><Stack.Screen name="AdminContent" component={AdminContentScreen}/><Stack.Screen name="AdminRuns" component={AdminRunsScreen}/>
  <Stack.Screen name="AdminPublicEvents" component={AdminPublicEventsScreen}/><Stack.Screen name="PublicEventDetails" component={PublicEventDetailsScreen}/><Stack.Screen name="AdminAnnouncement" component={AdminAnnouncementScreen}/><Stack.Screen name="AdminAuditLog" component={AdminAuditLogScreen}/>
  <Stack.Screen name="Notifications" component={NotificationsScreen}/><Stack.Screen name="NotificationPreferences" component={NotificationPreferencesScreen}/><Stack.Screen name="Appearance" component={AppearanceScreen}/><Stack.Screen name="Support" component={SupportScreen}/><Stack.Screen name="HelpTopic" component={HelpTopicScreen}/><Stack.Screen name="Feedback" component={FeedbackScreen}/><Stack.Screen name="Rewards" component={RewardsScreen}/><Stack.Screen name="FitnessPlan" component={FitnessPlanScreen}/><Stack.Screen name="Wearable" component={ConnectionsScreen} initialParams={{kind:'wearable'}}/><Stack.Screen name="ConnectedAccounts" component={ConnectionsScreen} initialParams={{kind:'social'}}/><Stack.Screen name="Profile" component={ProfileScreen}/><Stack.Screen name="ProfileSettings" component={ProfileSettingsScreen}/>
</>}
export default function AppNavigator(){
  const {user,isLoading}=useAuth();
  const {isDark,palette}=useAppTheme();
  const baseTheme=isDark?DarkTheme:DefaultTheme;
  const navTheme={...baseTheme,colors:{...baseTheme.colors,background:palette.background,card:palette.background,text:palette.ink,border:palette.border,primary:palette.primary}};
  if(isLoading)return <View style={[styles.loading,{backgroundColor:palette.background}]}><ActivityIndicator size="large" color={colors.primary}/></View>;
  const role=user&&(user.role||user.accountType||user.account_type);
  const isInstructor=role==='instructor';
  const isSystemAdmin=role==='system_admin';
  return <NavigationContainer theme={navTheme}><Stack.Navigator screenOptions={{...hidden,contentStyle:{backgroundColor:palette.background}}}>
    {user?(isSystemAdmin?AdminScreens():isInstructor?InstructorScreens():SharedRunnerScreens()):<>
      <Stack.Screen name="Landing" component={LandingScreen}/><Stack.Screen name="SignIn" component={SignInScreen}/><Stack.Screen name="ChooseAccountType" component={ChooseAccountTypeScreen}/><Stack.Screen name="Register" component={RegisterScreen}/><Stack.Screen name="CreateInstructorAccount" component={CreateInstructorAccountScreen}/><Stack.Screen name="RunnerAccountInfo" component={RunnerAccountInfoScreen}/><Stack.Screen name="InstructorAccountInfo" component={InstructorAccountInfoScreen}/><Stack.Screen name="EmailVerification" component={EmailVerificationScreen}/><Stack.Screen name="InstructorCredentials" component={InstructorCredentialsScreen}/><Stack.Screen name="CreatePassword" component={CreatePasswordScreen}/><Stack.Screen name="TermsConditions" component={TermsConditionsScreen}/><Stack.Screen name="AccountCreated" component={AccountCreatedScreen}/><Stack.Screen name="ForgotPassword" component={ForgotPasswordScreen}/>
    </>}
  </Stack.Navigator></NavigationContainer>;
}
const styles=StyleSheet.create({loading:{flex:1,justifyContent:'center',alignItems:'center',backgroundColor:colors.background}});
