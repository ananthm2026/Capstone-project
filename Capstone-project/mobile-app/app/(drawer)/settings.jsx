import { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Switch,
  StyleSheet,
  Alert,
  TextInput,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '../../src/context/AppContext';
import { useDrawer } from '../../src/context/DrawerContext';
import { COLORS } from '../../src/constants/colors';
import { TARGET_LANGUAGES } from '../../src/constants/languages';
import api from '../../src/services/api';

const LANG_ENTRIES = Object.entries(TARGET_LANGUAGES);

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const { openDrawer } = useDrawer();
  const { state, setField, setFields } = useApp();
  const { floatingAssistantEnabled, integrationSettings, selectedLanguage, selectedLanguageName, usageStats } = state;

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
        text: 'Clear',
        style: 'destructive',
        onPress: async () => {
          setClearing(true);
          try {
            await api.clearCache();
            setCacheStats({ entries: 0, hits: 0, hit_rate: '0%' });
          } catch {}
          setClearing(false);
        },
      },
    ]);
  }

  function toggleAssistant() {
    setField('floatingAssistantEnabled', !floatingAssistantEnabled);
  }

  function updateIntegration(app, key, value) {
    const updated = { ...integrationSettings };
    updated[app][key] = value;
    setField('integrationSettings', updated);
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={openDrawer} style={styles.hamburger}>
          <Text style={styles.hamburgerText}>☰</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Settings</Text>
      </View>

      <ScrollView
        style={styles.content}
        contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Widget Section */}
        <Text style={styles.sectionTitle}>Mobile Widget</Text>
        <View style={styles.settingCard}>
          <View style={styles.settingRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.settingLabel}>Floating Assistant</Text>
              <Text style={styles.settingSub}>Show a quick-access bubble on top of the app</Text>
            </View>
            <Switch
              value={floatingAssistantEnabled}
              onValueChange={toggleAssistant}
              trackColor={{ false: '#CBD5E0', true: COLORS.ink }}
            />
          </View>
        </View>

        {/* Integrations Section */}
        <Text style={styles.sectionTitle}>Integrations</Text>
        <View style={styles.section}>
          {/* Slack */}
          <View style={styles.integrationCard}>
            <View style={styles.intHeader}>
              <Text style={styles.intIcon}>#️⃣</Text>
              <Text style={styles.intTitle}>Slack</Text>
              <Switch
                value={integrationSettings.slack.enabled}
                onValueChange={(v) => updateIntegration('slack', 'enabled', v)}
              />
            </View>
            {integrationSettings.slack.enabled && (
              <TextInput
                style={styles.input}
                placeholder="Webhook URL"
                value={integrationSettings.slack.webhook}
                onChangeText={(v) => updateIntegration('slack', 'webhook', v)}
              />
            )}
          </View>

          {/* WhatsApp */}
          <View style={styles.integrationCard}>
            <View style={styles.intHeader}>
              <Text style={styles.intIcon}>💬</Text>
              <Text style={styles.intTitle}>WhatsApp</Text>
              <Switch
                value={integrationSettings.whatsapp.enabled}
                onValueChange={(v) => updateIntegration('whatsapp', 'enabled', v)}
              />
            </View>
            {integrationSettings.whatsapp.enabled && (
              <TextInput
                style={styles.input}
                placeholder="Default Phone (e.g. +91...)"
                keyboardType="phone-pad"
                value={integrationSettings.whatsapp.phone}
                onChangeText={(v) => updateIntegration('whatsapp', 'phone', v)}
              />
            )}
          </View>
        </View>

        {/* Translation Cache */}
        <Text style={styles.sectionTitle}>Translation Cache</Text>
        <View style={styles.card}>
          <View style={styles.cacheRow}>
            {[
              { label: 'Entries', val: cacheStats.entries, color: COLORS.indigo },
              { label: 'Hits', val: cacheStats.hits, color: COLORS.greenSoft },
              { label: 'Hit Rate', val: cacheStats.hit_rate, color: COLORS.saffron },
            ].map((c) => (
              <View key={c.label} style={styles.cacheStat}>
                <Text style={[styles.cacheVal, { color: c.color }]}>{c.val}</Text>
                <Text style={styles.cacheLabel}>{c.label}</Text>
              </View>
            ))}
          </View>
          <TouchableOpacity style={styles.clearBtn} onPress={handleClearCache} disabled={clearing}>
            <Text style={styles.clearBtnText}>{clearing ? 'Clearing...' : '🗑 Clear Cache'}</Text>
          </TouchableOpacity>
        </View>

        {/* Default Language */}
        <Text style={styles.sectionTitle}>Default Language</Text>
        <TouchableOpacity style={styles.pickerToggle} onPress={() => setShowLangPicker(!showLangPicker)}>
          <Text style={styles.settingText}>{selectedLanguageName}</Text>
          <Text>{showLangPicker ? '▲' : '▼'}</Text>
        </TouchableOpacity>
        {showLangPicker && (
          <View style={styles.pickerDrop}>
            {LANG_ENTRIES.map(([name, code]) => (
              <TouchableOpacity
                key={code}
                style={[styles.pickerItem, code === selectedLanguage && { backgroundColor: COLORS.saffronLight }]}
                onPress={() => {
                  setFields({ selectedLanguage: code, selectedLanguageName: name });
                  setShowLangPicker(false);
                }}
              >
                <Text style={[styles.pickerText, code === selectedLanguage && { color: COLORS.saffron, fontWeight: '700' }]}>
                  {name}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* API Usage */}
        <Text style={styles.sectionTitle}>API Usage</Text>
        <View style={styles.card}>
          {[
            { label: 'Sarvam Calls', val: usageStats.sarvamCalls, icon: '🎤' },
            { label: 'Gemini Calls', val: usageStats.geminiCalls, icon: '✨' },
            { label: 'Cache Hits', val: usageStats.cacheHits, icon: '⚡' },
          ].map((item) => (
            <View key={item.label} style={styles.usageRow}>
              <Text style={{ fontSize: 16 }}>{item.icon}</Text>
              <Text style={styles.usageLabel}>{item.label}</Text>
              <Text style={styles.usageVal}>{item.val}</Text>
            </View>
          ))}
        </View>

        {/* System Integrations Guide */}
        <Text style={styles.sectionTitle}>WhatsApp & System Integration</Text>
        <View style={styles.intGuide}>
          <View style={styles.guideStep}>
            <Text style={styles.stepIcon}>📤</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.stepTitle}>Use the Share Sheet</Text>
              <Text style={styles.stepDesc}>Highlight text in WhatsApp, tap 'Share', and choose SeedlingSpeaks to translate instantly.</Text>
            </View>
          </View>
          <View style={styles.guideStep}>
            <Text style={styles.stepIcon}>⌨️</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.stepTitle}>Custom Keyboard (Beta)</Text>
              <Text style={styles.stepDesc}>Coming soon: A dedicated translation keyboard for typing directly in any app.</Text>
            </View>
          </View>
          <View style={styles.guideStep}>
            <Text style={styles.stepIcon}>📱</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.stepTitle}>Back Tap Shortcut</Text>
              <Text style={styles.stepDesc}>Go to iPhone Settings → Accessibility → Touch → Back Tap. Set 'Double Tap' to open SeedlingSpeaks.</Text>
            </View>
          </View>
        </View>

        {/* Testing Guide */}
        <View style={styles.guideCard}>
          <Text style={styles.guideTitle}>Testing on iPhone</Text>
          <Text style={styles.guideText}>
            Native iOS Widgets and Share Extensions require a production build. 
            {"\n\n"}
            To test the <Text style={{ fontWeight: '700' }}>Floating Assistant</Text> in Expo Go:
            {"\n"}1. Enable the toggle above.
            {"\n"}2. Drag the bubble to your preferred spot.
            {"\n"}3. Tap it to access quick translation tools.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  hamburger: { paddingRight: 12, paddingVertical: 4 },
  hamburgerText: { fontSize: 24, color: COLORS.ink },
  headerTitle: { fontSize: 18, fontWeight: '700', color: COLORS.ink },
  content: { flex: 1, paddingHorizontal: 20 },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: COLORS.ink, marginBottom: 12, marginTop: 24 },
  settingCard: {
    backgroundColor: '#FFF',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  settingLabel: { fontSize: 15, fontWeight: '600', color: COLORS.ink },
  settingSub: { fontSize: 12, color: COLORS.muted, marginTop: 2 },
  integrationCard: {
    backgroundColor: '#FFF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  intHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  intIcon: { fontSize: 20 },
  intTitle: { flex: 1, fontSize: 15, fontWeight: '600', color: COLORS.warm },
  input: {
    marginTop: 12,
    backgroundColor: COLORS.surface,
    borderRadius: 10,
    padding: 12,
    fontSize: 14,
    color: COLORS.ink,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  card: { backgroundColor: COLORS.surface, borderRadius: 16, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: COLORS.border },
  cacheRow: { flexDirection: 'row', marginBottom: 12 },
  cacheStat: { flex: 1, alignItems: 'center' },
  cacheVal: { fontSize: 20, fontWeight: '800' },
  cacheLabel: { fontSize: 11, color: COLORS.muted, marginTop: 2 },
  clearBtn: { backgroundColor: COLORS.bg, borderRadius: 10, paddingVertical: 10, alignItems: 'center', borderWidth: 1, borderColor: COLORS.border },
  clearBtnText: { fontSize: 13, fontWeight: '600', color: COLORS.redSoft },
  pickerToggle: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: COLORS.surface, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: COLORS.border, marginBottom: 12 },
  settingText: { fontSize: 15, fontWeight: '600', color: COLORS.ink },
  pickerDrop: { backgroundColor: COLORS.surface, borderRadius: 12, borderWidth: 1, borderColor: COLORS.border, marginBottom: 12, overflow: 'hidden' },
  pickerItem: { padding: 14, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  pickerText: { fontSize: 14, color: COLORS.warm },
  usageRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  usageLabel: { flex: 1, fontSize: 14, color: COLORS.warm },
  usageVal: { fontSize: 16, fontWeight: '700', color: COLORS.ink },
  intGuide: {
    backgroundColor: '#FFF',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: 20,
  },
  guideStep: {
    flexDirection: 'row',
    gap: 14,
    marginBottom: 16,
  },
  stepIcon: { fontSize: 22 },
  stepTitle: { fontSize: 14, fontWeight: '700', color: COLORS.ink },
  stepDesc: { fontSize: 12, color: COLORS.muted, marginTop: 2, lineHeight: 18 },
  guideCard: {
    backgroundColor: COLORS.ink,
    borderRadius: 20,
    padding: 24,
    marginTop: 10,
    marginBottom: 20,
  },
  guideTitle: { fontSize: 18, fontWeight: '700', color: '#FFF', marginBottom: 12 },
  guideText: { fontSize: 14, color: 'rgba(255,255,255,0.7)', lineHeight: 22 },
});
