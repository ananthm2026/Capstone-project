import { useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, TextInput, StyleSheet, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useAuth, useUser } from '@clerk/clerk-expo';
import { COLORS } from '../../src/constants/colors';
import { TARGET_LANGUAGES } from '../../src/constants/languages';
import { useApp } from '../../src/context/AppContext';
import { useNavigation } from '@react-navigation/native';
import { useDrawer } from '../../src/context/DrawerContext';

const LANG_ENTRIES = Object.entries(TARGET_LANGUAGES);

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const { state, setFields } = useApp();
  const { signOut } = useAuth();
  const { user } = useUser();
  const navigation = useNavigation();
  const { openDrawer } = useDrawer();
  const [showLangPicker, setShowLangPicker] = useState(false);

  const { selectedLanguageName, selectedLanguage, transcriptHistory } = state;

  const displayName = user ? [user.firstName, user.lastName].filter(Boolean).join(' ') || 'User' : 'User';
  const displayEmail = user?.primaryEmailAddress?.emailAddress || '';
  const initials = displayName.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2);

  function handleSignOut() {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: () => signOut() },
    ]);
  }

  return (
    <View style={[st.root, { paddingTop: insets.top }]}>
      <View style={st.header}>
        <TouchableOpacity onPress={openDrawer} style={st.hamburger}>
          <Text style={st.hamburgerText}>☰</Text>
        </TouchableOpacity>
        <Text style={st.headerTitle}>Profile</Text>
      </View>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={[st.content, { paddingBottom: insets.bottom + 20 }]}>
        {/* Avatar */}
        <View style={st.avatarSection}>
          <View style={st.avatar}>
            <Text style={st.avatarText}>{initials}</Text>
          </View>
          <Text style={st.userName}>{displayName}</Text>
          <Text style={st.userEmail}>{displayEmail}</Text>
        </View>

        {/* Stats */}
        <View style={st.statsRow}>
          <View style={st.statCard}>
            <Text style={st.statVal}>{transcriptHistory.length}</Text>
            <Text style={st.statLabel}>Transcripts</Text>
          </View>
          <View style={st.statCard}>
            <Text style={st.statVal}>{selectedLanguageName}</Text>
            <Text style={st.statLabel}>Language</Text>
          </View>
        </View>

        {/* Default Language */}
        <Text style={st.sectionTitle}>Default Language</Text>
        <TouchableOpacity style={st.settingRow} onPress={() => setShowLangPicker(!showLangPicker)}>
          <Text style={st.settingText}>{selectedLanguageName}</Text>
          <Text>{showLangPicker ? '▲' : '▼'}</Text>
        </TouchableOpacity>
        {showLangPicker && (
          <View style={st.pickerDrop}>
            {LANG_ENTRIES.map(([name, code]) => (
              <TouchableOpacity key={code} style={[st.pickerItem, code === selectedLanguage && { backgroundColor: COLORS.saffronLight }]} onPress={() => { setFields({ selectedLanguage: code, selectedLanguageName: name }); setShowLangPicker(false); }}>
                <Text style={[st.pickerText, code === selectedLanguage && { color: COLORS.saffron, fontWeight: '700' }]}>{name}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Quick Links */}
        <Text style={st.sectionTitle}>Quick Links</Text>
        {[
          { title: 'Settings', icon: '⚙️', route: '/settings' },
        ].map((item) => (
          <TouchableOpacity key={item.title} style={st.linkRow} onPress={() => router.push(item.route)}>
            <Text style={{ fontSize: 18 }}>{item.icon}</Text>
            <Text style={st.linkText}>{item.title}</Text>
            <Text style={st.linkArrow}>→</Text>
          </TouchableOpacity>
        ))}

        {/* Sign Out */}
        <TouchableOpacity style={st.signOutBtn} onPress={handleSignOut}>
          <Text style={st.signOutText}>Sign Out</Text>
        </TouchableOpacity>

        <Text style={st.versionText}>SeedlingSpeaks v2.5 · Built by Seedlinglabs</Text>
      </ScrollView>
    </View>
  );
}

const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bg },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  headerTitle: { fontSize: 18, fontWeight: '700', color: COLORS.ink },
  hamburger: { paddingRight: 12, paddingVertical: 4 },
  hamburgerText: { fontSize: 24, color: COLORS.ink },
  content: { paddingHorizontal: 20, paddingTop: 24 },
  avatarSection: { alignItems: 'center', marginBottom: 28 },
  avatar: { width: 72, height: 72, borderRadius: 36, backgroundColor: COLORS.saffronLight, alignItems: 'center', justifyContent: 'center', marginBottom: 12, borderWidth: 2, borderColor: COLORS.saffron },
  avatarText: { fontSize: 28, fontWeight: '700', color: COLORS.saffron },
  userName: { fontSize: 20, fontWeight: '700', color: COLORS.ink },
  userEmail: { fontSize: 13, color: COLORS.muted, marginTop: 2 },
  statsRow: { flexDirection: 'row', gap: 12, marginBottom: 28 },
  statCard: { flex: 1, backgroundColor: COLORS.surface, borderRadius: 16, padding: 16, alignItems: 'center', borderWidth: 1, borderColor: COLORS.border },
  statVal: { fontSize: 24, fontWeight: '800', color: COLORS.saffron },
  statLabel: { fontSize: 12, color: COLORS.muted, marginTop: 4 },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: COLORS.ink, marginBottom: 10, marginTop: 4 },
  settingRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: COLORS.surface, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: COLORS.border, marginBottom: 12 },
  settingText: { fontSize: 15, fontWeight: '600', color: COLORS.ink },
  pickerDrop: { backgroundColor: COLORS.surface, borderRadius: 12, borderWidth: 1, borderColor: COLORS.border, marginBottom: 12, overflow: 'hidden' },
  pickerItem: { padding: 14, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  pickerText: { fontSize: 14, color: COLORS.warm },
  linkRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.surface, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: COLORS.border, marginBottom: 8, gap: 12 },
  linkText: { flex: 1, fontSize: 15, fontWeight: '600', color: COLORS.ink },
  linkArrow: { fontSize: 16, color: COLORS.saffron, fontWeight: '700' },
  signOutBtn: { backgroundColor: COLORS.redBg, borderRadius: 14, paddingVertical: 14, alignItems: 'center', marginTop: 24, borderWidth: 1, borderColor: COLORS.redSoft + '30' },
  signOutText: { fontSize: 15, fontWeight: '700', color: COLORS.redSoft },
  versionText: { textAlign: 'center', fontSize: 12, color: COLORS.faded, marginTop: 32 },
});
