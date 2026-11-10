import { View, Text, StyleSheet } from 'react-native';
import { Screen, Brand, Button, Card } from '../components/AppUI.js';
import { colors } from '../theme/colors.js';

export default function LandingScreen({ navigation }) {
  const bars=[54,76,46,92,66,120,84];
  return (
    <Screen>
      <View style={s.page}>
        <Brand />
        <View style={s.hero}>
          <Text style={s.title}>Run smarter.{`\n`}Compete together.</Text>
          <Text style={s.copy}>Track runs, build fitness plans, join groups and tournaments, and stay connected to your progress.</Text>
        </View>
        <Card style={s.chartCard}>
          <Text style={s.distance}>24.8 km</Text>
          <Text style={s.week}>THIS WEEK</Text>
          <View style={s.chart}>{bars.map((h,i)=><View key={i} style={[s.bar,{height:h},i===5&&s.accent]}/>)}</View>
        </Card>
        <Button onPress={()=>navigation.navigate('ChooseAccountType')} style={s.primary}>Create Account</Button>
        <Button variant="secondary" onPress={()=>navigation.navigate('SignIn')} style={s.login}>Log In</Button>
      </View>
    </Screen>
  );
}

const s=StyleSheet.create({
  page:{flex:1,paddingHorizontal:24,paddingTop:18},
  hero:{marginTop:72},
  title:{fontSize:38,lineHeight:45,fontWeight:'700',letterSpacing:-0.7,color:colors.ink},
  copy:{fontSize:15,lineHeight:20,color:colors.inkMuted,marginTop:20,maxWidth:342},
  chartCard:{height:244,marginTop:37,paddingHorizontal:23,paddingTop:24,backgroundColor:colors.surfaceRaised,borderRadius:24},
  distance:{fontSize:34,lineHeight:41,fontWeight:'700',color:colors.ink},
  week:{fontSize:11,fontWeight:'700',color:colors.inkMuted,marginTop:1},
  chart:{height:128,flexDirection:'row',alignItems:'flex-end',justifyContent:'space-between',marginTop:11},
  bar:{width:26,borderRadius:6,backgroundColor:'#323E48'},
  accent:{backgroundColor:colors.primary},
  primary:{height:50,marginTop:46,borderRadius:14},
  login:{height:48,marginTop:20,borderRadius:14},
});
