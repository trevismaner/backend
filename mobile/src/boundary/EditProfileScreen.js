import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Alert } from 'react-native';
import { useAuth } from '../context/AuthContext.js';
import updateProfileController from '../control/UpdateProfileController.js';
import { Screen, Header, Field, Button } from '../components/AppUI.js';
import { colors } from '../theme/colors.js';

export default function EditProfileScreen({ navigation }) {
  const { user, setUser } = useAuth();
  const [name, setName] = useState(user?.name || '');
  const [bio, setBio] = useState(user?.bio || '');
  const [saving, setSaving] = useState(false);
  useEffect(() => { setName(user?.name || ''); setBio(user?.bio || ''); }, [user]);

  async function save() {
    setSaving(true);
    const r = await updateProfileController({ name: name.trim(), bio });
    setSaving(false);
    if (!r.success) return Alert.alert('Could not update profile', r.message);
    setUser(r.data.user || r.data);
    Alert.alert('Saved', 'Your profile has been updated.', [{ text: 'OK', onPress: () => navigation.goBack() }]);
  }

  return (
    <Screen>
      <Header title="Edit Profile" navigation={navigation} />
      <ScrollView contentContainerStyle={styles.page}>
        <View style={styles.avatar}><Text style={styles.initial}>{(name || 'R')[0]?.toUpperCase()}</Text></View>
        <Text style={styles.change}>Profile details</Text>
        <Text style={styles.section}>Personal Information</Text>
        <Field label="Name" value={name} onChangeText={setName} />
        <Field label="Email" value={user?.email || ''} editable={false} />
        <Field label="Bio" value={bio} onChangeText={setBio} multiline />
        <Button onPress={save} disabled={saving} style={styles.save}>{saving ? 'Saving…' : 'Save Changes'}</Button>
        <Button variant="secondary" onPress={() => navigation.goBack()} style={styles.cancel}>Cancel</Button>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  page:{paddingHorizontal:20,paddingBottom:40}, avatar:{width:80,height:80,borderRadius:40,backgroundColor:colors.surfaceRaised,borderWidth:1,borderColor:colors.border,alignSelf:'center',alignItems:'center',justifyContent:'center',marginTop:24},
  initial:{fontSize:32,fontWeight:'700',color:colors.primary}, change:{fontSize:12,color:colors.inkMuted,textAlign:'center',marginTop:10}, section:{fontSize:18,fontWeight:'700',color:colors.ink,marginTop:28,marginBottom:10}, save:{marginTop:18}, cancel:{marginTop:10}
});
