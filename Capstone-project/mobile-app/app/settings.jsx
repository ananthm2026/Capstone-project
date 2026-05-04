import { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Switch, StyleSheet, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { COLORS } from '../src/constants/colors';
import { TARGET_LANGUAGES } from '../src/constants/languages';
import { useApp } from '../src/context/AppContext';
import api from '../src/services/api';

const LANG_ENTRIES = Object.entries(TARGET_LANGUAGES);

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const { state, setFields } = useApp();

  const [cacheStats, setCacheStats] = useState({ entries: 0, hits: 0, hit_rate: '0%' });
  const [clearing, setClearing] = useState(false);
  const [showLangPicker, setShowLangPicker] = useState(false);

  useEffect(() => {
    api.getCacheStats().then(setCacheStats).catch(() => {});
  }, []);

  async function handleClearCache() {
    Alert.alert('Clear Cache', 'Clear all cached translations?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Clear', style: 'destructive', onPress: async () => {
          setClearing(true);
          try {
            await api.clearCache();
            setCacheStats({ entries: 0, hits: 0, hit_rate: '0%' });
          } catch { }
          setClearing(false);
        }
      },
    ]);
  }

  return (
    <View style={[st.root, { paddingTop: insets.top }]}>
      <View style={st.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={st.backBtn}>← Back</Text>
        </TouchableOpacity>
        <Text style={st.headerTitle}>Settings</Text>
        <View style={{ width: 50 }} />
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={[st.content, { paddingBottom: insets.bottom + 40 }]}>
        {/* Translation Cache */}
        <Text style={st.sectionTitle}>Translation Cache</Text>
        <View style={st.card}>
          <View style={st.cacheRow}>
            {[
              { label: 'Entries', val: cacheStats.entries, color: COLORS.indigo },
              { label: 'Hits', val: cacheStats.hits, color: COLORS.greenSoft },
              { label: 'Hit Rate', val: cacheStats.hit_rate, color: COLORS.saffron },
            ].map((c) => (
              <View key={c.label} style={st.cacheStat}>
                <Text style={[st.cacheVal, { color: c.color }]}>{c.val}</Text>
                <Text style={st.cacheLabel}>{c.label}</Text>
              </View>
            ))}
          </View>
          <TouchableOpacity style={st.clearBtn} onPress={handleClearCache} disabled={clearing}>
            <Text style={st.clearBtnText}>{clearing ? 'Clearing...' : '🗑 Clear Cache'}</Text>
          </TouchableOpacity>
        </View>

        {/* Default Language */}
        <Text style={st.sectionTitle}>Default Language</Text>
        <TouchableOpacity style={st.settingRow} onPress={() => setShowLangPicker(!showLangPicker)}>
          <Text style={st.settingText}>{state.selectedLanguageName}</Text>
          <Text>{showLangPicker ? '▲' : '▼'}</Text>
        </TouchableOpacity>
        {showLangPicker && (
          <View style={st.pickerDrop}>
            {LANG_ENTRIES.map(([name, code]) => (
              <TouchableOpacity key={code} style={[st.pickerItem, code === state.selectedLanguage && { backgroundColor: COLORS.saffronLight }]} onPress={() => { setFields({ selectedLanguage: code, selectedLanguageName: name }); setShowLangPicker(false); }}>
                <Text style={[st.pickerText, code === state.selectedLanguage && { color: COLORS.saffron, fontWeight: '700' }]}>{name}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* API Usage */}
        <Text style={st.sectionTitle}>API Usage</Text>
        <View style={st.card}>
          {[
            { label: 'Sarvam Calls', val: state.usageStats.sarvamCalls, icon: '🎤' },
            { label: 'Gemini Calls', val: state.usageStats.geminiCalls, icon: '✨' },
            { label: 'Cache Hits', val: state.usageStats.cacheHits, icon: '⚡' },
          ].map((item) => (
            <View key={item.label} style={st.usageRow}>
              <Text style={{ fontSize: 16 }}>{item.icon}</Text>
              <Text style={st.usageLabel}>{item.label}</Text>
              <Text style={st.usageVal}>{item.val}</Text>
            </View>
          ))}
        </View>

        {/* About */}
        <Text style={st.sectionTitle}>About</Text>
        <View style={st.card}>
          <View style={st.aboutRow}>
            <Text style={st.aboutLabel}>App</Text>
            <Text style={st.aboutVal}>SeedlingSpeaks</Text>
          </View>
          <View style={st.aboutRow}>
            <Text style={st.aboutLabel}>Version</Text>
            <Text style={st.aboutVal}>v2.5</Text>
          </View>
          <View style={[st.aboutRow, { borderBottomWidth: 0 }]}>
            <Text style={st.aboutLabel}>Built by</Text>
            <Text style={st.aboutVal}>Seedlinglabs</Text>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bg },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  backBtn: { fontSize: 15, fontWeight: '600', color: COLORS.saffron },
  headerTitle: { fontSize: 18, fontWeight: '700', color: COLORS.ink },
  content: { paddingHorizontal: 20, paddingTop: 16 },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: COLORS.ink, marginBottom: 10, marginTop: 8 },
  card: { backgroundColor: COLORS.surface, borderRadius: 16, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: COLORS.border },
  cacheRow: { flexDirection: 'row', marginBottom: 12 },
  cacheStat: { flex: 1, alignItems: 'center' },
  cacheVal: { fontSize: 20, fontWeight: '800' },
  cacheLabel: { fontSize: 11, color: COLORS.muted, marginTop: 2 },
  clearBtn: { backgroundColor: COLORS.bg, borderRadius: 10, paddingVertical: 10, alignItems: 'center', borderWidth: 1, borderColor: COLORS.border },
  clearBtnText: { fontSize: 13, fontWeight: '600', color: COLORS.redSoft },
  settingRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: COLORS.surface, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: COLORS.border, marginBottom: 12 },
  settingText: { fontSize: 15, fontWeight: '600', color: COLORS.ink },
  pickerDrop: { backgroundColor: COLORS.surface, borderRadius: 12, borderWidth: 1, borderColor: COLORS.border, marginBottom: 12, overflow: 'hidden' },
  pickerItem: { padding: 14, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  pickerText: { fontSize: 14, color: COLORS.warm },
  usageRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  usageLabel: { flex: 1, fontSize: 14, color: COLORS.warm },
  usageVal: { fontSize: 16, fontWeight: '700', color: COLORS.ink },
  aboutRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  aboutLabel: { fontSize: 14, color: COLORS.muted },
  aboutVal: { fontSize: 14, fontWeight: '600', color: COLORS.ink },
});
