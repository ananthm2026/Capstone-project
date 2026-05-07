import { useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Image, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { COLORS } from '../src/constants/colors';
import { TARGET_LANGUAGES } from '../src/constants/languages';
import { useApp } from '../src/context/AppContext';
import api from '../src/services/api';

const LANG_ENTRIES = Object.entries(TARGET_LANGUAGES);

export default function VisionScreen() {
  const insets = useSafeAreaInsets();
  const { addHistory, incrementUsage, showError } = useApp();

  const [imageUri, setImageUri] = useState(null);
  const [regions, setRegions] = useState([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [targetLang, setTargetLang] = useState(null);
  const [targetLangName, setTargetLangName] = useState(null);
  const [showPicker, setShowPicker] = useState(false);

  async function pickImage(useCamera) {
    if (useCamera) {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Required', 'Please enable camera access in your settings to use this feature.');
        return;
      }
    } else {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Required', 'Please enable gallery access in your settings to use this feature.');
        return;
      }
    }

    const method = useCamera ? ImagePicker.launchCameraAsync : ImagePicker.launchImageLibraryAsync;
    const result = await method({ mediaTypes: ['images'], quality: 0.8 });
    if (!result.canceled && result.assets[0]) {
      setImageUri(result.assets[0].uri);
      setRegions([]);
    }
  }

  async function handleTranslate() {
    if (!imageUri) return;
    if (!targetLang) {
      Alert.alert('Language Required', 'Please select a target language before translating.');
      return;
    }
    setIsProcessing(true);
    try {
      const result = await api.visionTranslate(imageUri, targetLang);
      incrementUsage('geminiCalls');
      setRegions(result.regions || []);
      
      if (result.regions && result.regions.length > 0) {
        const fullOriginal = result.regions.map(r => r.original).join('\n');
        const fullTranslation = result.regions.map(r => r.translated).join('\n');
        addHistory({
          id: Date.now().toString(),
          text: fullOriginal,
          native: fullTranslation,
          language: targetLangName,
          type: 'vision',
          timestamp: new Date().toISOString(),
        });
      }

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e) {
      showError('Vision translate failed: ' + e.message);
    } finally {
      setIsProcessing(false);
    }
  }

  function handleReset() {
    setImageUri(null);
    setRegions([]);
  }

  return (
    <View style={[st.root, { paddingTop: insets.top }]}>
      <View style={st.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={st.backBtn}>← Back</Text>
        </TouchableOpacity>
        <Text style={st.headerTitle}>Vision Translate</Text>
        <View style={{ width: 50 }} />
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={[st.content, { paddingBottom: insets.bottom + 40 }]}>
        {/* Language Picker */}
        <TouchableOpacity style={st.langBtn} onPress={() => setShowPicker(!showPicker)}>
          <Text style={[st.langBtnText, !targetLangName && { color: COLORS.faded }]}>
            {targetLangName ? `Translate to: ${targetLangName}` : 'Select language'}
          </Text>
          <Text>{showPicker ? '▲' : '▼'}</Text>
        </TouchableOpacity>
        {showPicker && (
          <View style={st.pickerDrop}>
            {LANG_ENTRIES.map(([name, code]) => (
              <TouchableOpacity key={code} style={[st.pickerItem, code === targetLang && { backgroundColor: COLORS.saffronLight }]} onPress={() => { setTargetLang(code); setTargetLangName(name); setShowPicker(false); }}>
                <Text style={[st.pickerText, code === targetLang && { color: COLORS.saffron, fontWeight: '700' }]}>{name}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Upload Zone */}
        {!imageUri ? (
          <View style={st.uploadZone}>
            <Text style={{ fontSize: 48, marginBottom: 12 }}>📷</Text>
            <Text style={st.uploadTitle}>Take a photo or choose from gallery</Text>
            <Text style={st.uploadSubtext}>Point at signs, menus, documents — get them translated</Text>
            <View style={st.uploadBtns}>
              <TouchableOpacity style={st.uploadBtn} onPress={() => pickImage(true)}>
                <Text style={st.uploadBtnText}>📸 Camera</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[st.uploadBtn, { backgroundColor: COLORS.surface }]} onPress={() => pickImage(false)}>
                <Text style={[st.uploadBtnText, { color: COLORS.ink }]}>🖼 Gallery</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <>
            {/* Image Preview */}
            <View style={st.imageContainer}>
              <Image source={{ uri: imageUri }} style={st.image} resizeMode="contain" />
            </View>

            {/* Actions */}
            <View style={st.actionsRow}>
              <TouchableOpacity style={st.translateBtn} onPress={handleTranslate} disabled={isProcessing}>
                {isProcessing ? <ActivityIndicator color="#FFF" size="small" /> : <Text style={st.translateBtnText}>🔍 Translate</Text>}
              </TouchableOpacity>
              <TouchableOpacity style={st.resetBtn} onPress={handleReset}>
                <Text style={st.resetBtnText}>🔄 Reset</Text>
              </TouchableOpacity>
            </View>

            {/* Results */}
            {regions.length > 0 && (
              <>
                <Text style={st.sectionTitle}>Detected Text ({regions.length} regions)</Text>
                {regions.map((r, i) => (
                  <View key={i} style={st.regionCard}>
                    <View style={st.regionHeader}>
                      <View style={st.regionBadge}>
                        <Text style={st.regionBadgeText}>{i + 1}</Text>
                      </View>
                      <TouchableOpacity onPress={() => Clipboard.setStringAsync(r.translated || r.original)}>
                        <Text style={st.copyBtn}>📋</Text>
                      </TouchableOpacity>
                    </View>
                    <Text style={st.originalText}>{r.original}</Text>
                    {r.translated && <Text style={st.translatedText}>{r.translated}</Text>}
                  </View>
                ))}
              </>
            )}

          </>
        )}
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
  langBtn: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: COLORS.surface, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: COLORS.border, marginBottom: 16 },
  langBtnText: { fontSize: 15, fontWeight: '600', color: COLORS.ink },
  pickerDrop: { backgroundColor: COLORS.surface, borderRadius: 12, borderWidth: 1, borderColor: COLORS.border, marginBottom: 16, overflow: 'hidden' },
  pickerItem: { padding: 14, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  pickerText: { fontSize: 14, color: COLORS.warm },
  uploadZone: { alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.surface, borderRadius: 20, padding: 40, borderWidth: 2, borderColor: COLORS.border, borderStyle: 'dashed' },
  uploadTitle: { fontSize: 16, fontWeight: '600', color: COLORS.ink, marginBottom: 4 },
  uploadSubtext: { fontSize: 13, color: COLORS.muted, marginBottom: 20, textAlign: 'center' },
  uploadBtns: { flexDirection: 'row', gap: 12 },
  uploadBtn: { backgroundColor: COLORS.ink, borderRadius: 12, paddingHorizontal: 20, paddingVertical: 12, borderWidth: 1, borderColor: COLORS.border },
  uploadBtnText: { fontSize: 14, fontWeight: '700', color: '#FFF' },
  imageContainer: { backgroundColor: COLORS.surface, borderRadius: 16, overflow: 'hidden', marginBottom: 16, borderWidth: 1, borderColor: COLORS.border },
  image: { width: '100%', height: 250 },
  actionsRow: { flexDirection: 'row', gap: 12, marginBottom: 20 },
  translateBtn: { flex: 1, backgroundColor: COLORS.ink, borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
  translateBtnText: { fontSize: 15, fontWeight: '700', color: '#FFF' },
  resetBtn: { backgroundColor: COLORS.surface, borderRadius: 14, paddingVertical: 14, paddingHorizontal: 20, borderWidth: 1, borderColor: COLORS.border },
  resetBtnText: { fontSize: 15, fontWeight: '700', color: COLORS.warm },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: COLORS.ink, marginBottom: 12 },
  regionCard: { backgroundColor: COLORS.surface, borderRadius: 14, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: COLORS.border },
  regionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  regionBadge: { width: 24, height: 24, borderRadius: 12, backgroundColor: COLORS.ink, alignItems: 'center', justifyContent: 'center' },
  regionBadgeText: { fontSize: 12, fontWeight: '700', color: '#FFF' },
  copyBtn: { fontSize: 16 },
  originalText: { fontSize: 14, color: COLORS.muted, marginBottom: 4 },
  translatedText: { fontSize: 15, fontWeight: '600', color: COLORS.ink, lineHeight: 22 },
});
