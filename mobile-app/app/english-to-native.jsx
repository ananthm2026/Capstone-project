import { useState } from 'react';
import { View, Text, TouchableOpacity, TextInput, ScrollView, StyleSheet, ActivityIndicator, Alert, TouchableWithoutFeedback, Keyboard } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { COLORS } from '../src/constants/colors';
import { TARGET_LANGUAGES } from '../src/constants/languages';
import { useApp } from '../src/context/AppContext';
import api from '../src/services/api';

const LANG_ENTRIES = Object.entries(TARGET_LANGUAGES);

export default function EnglishToNativeScreen() {
  const insets = useSafeAreaInsets();
  const { state, setFields, addHistory, incrementUsage, showError } = useApp();

  const [inputText, setInputText] = useState('');
  const [translatedText, setTranslatedText] = useState('');
  const [targetLang, setTargetLang] = useState('hi-IN');
  const [targetLangName, setTargetLangName] = useState('Hindi');
  const [isTranslating, setIsTranslating] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const [copied, setCopied] = useState(false);

  async function handleTranslate() {
    if (!inputText.trim()) return;
    setIsTranslating(true);
    try {
      console.log('[E2N] Translating:', { text: inputText.slice(0, 50), targetLang });
      const result = await api.translateText(inputText, targetLang);
      console.log('[E2N] Result:', JSON.stringify(result));
      incrementUsage('sarvamCalls');
      setTranslatedText(result.translated_text);
      
      addHistory({
        id: Date.now().toString(),
        text: inputText,
        native: result.translated_text,
        language: targetLangName,
        timestamp: new Date().toISOString(),
      });

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e) {
      console.error('[E2N] Translation error:', e.response?.data || e.message);
      const detail = e.response?.data?.detail || e.response?.data?.error || e.message;
      Alert.alert('Translation Failed', String(detail));
    } finally {
      setIsTranslating(false);
    }
  }

  async function handleCopy() {
    if (!translatedText) return;
    await Clipboard.setStringAsync(translatedText);
    setCopied(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
      <View style={[st.root, { paddingTop: insets.top }]}>
        <View style={st.header}>
          <TouchableOpacity onPress={() => router.back()}>
            <Text style={st.backBtn}>← Back</Text>
          </TouchableOpacity>
          <Text style={st.headerTitle}>Text Translate</Text>
          <View style={{ width: 50 }} />
        </View>

        <ScrollView style={{ flex: 1 }} contentContainerStyle={[st.content, { paddingBottom: insets.bottom + 40 }]} keyboardShouldPersistTaps="handled">
          {/* English Input */}
          <View style={st.card}>
            <View style={st.cardHeader}>
              <View style={[st.dot, { backgroundColor: COLORS.greenSoft }]} />
              <Text style={st.cardLabel}>English</Text>
            </View>
            <TextInput
              style={st.textarea}
              placeholder="Type or paste English text here..."
              placeholderTextColor={COLORS.faded}
              value={inputText}
              onChangeText={setInputText}
              multiline
              textAlignVertical="top"
            />
            <Text style={st.charCount}>{inputText.length} characters</Text>
          </View>

          {/* Translate Button */}
          <TouchableOpacity style={[st.translateBtn, !inputText.trim() && { opacity: 0.5 }]} onPress={handleTranslate} disabled={!inputText.trim() || isTranslating}>
            {isTranslating ? <ActivityIndicator color="#FFF" size="small" /> : <Text style={st.translateBtnText}>Translate to {targetLangName}</Text>}
          </TouchableOpacity>

          {/* Language Picker */}
          <TouchableOpacity style={st.langBtn} onPress={() => setShowPicker(!showPicker)}>
            <Text style={st.langBtnText}>{targetLangName}</Text>
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

          {/* Output */}
          {translatedText ? (
            <View style={st.card}>
              <View style={st.cardHeader}>
                <View style={[st.dot, { backgroundColor: COLORS.saffron }]} />
                <Text style={st.cardLabel}>{targetLangName}</Text>
                <TouchableOpacity style={{ marginLeft: 'auto' }} onPress={handleCopy}>
                  <Text style={st.copyBtn}>{copied ? '✓ Copied' : '📋 Copy'}</Text>
                </TouchableOpacity>
              </View>
              <Text style={st.outputText}>{translatedText}</Text>
            </View>
          ) : null}
        </ScrollView>
      </View>
    </TouchableWithoutFeedback>
  );
}


const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bg },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  backBtn: { fontSize: 15, fontWeight: '600', color: COLORS.saffron },
  headerTitle: { fontSize: 18, fontWeight: '700', color: COLORS.ink },
  content: { paddingHorizontal: 20, paddingTop: 16 },
  card: { backgroundColor: COLORS.surface, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: COLORS.border, marginBottom: 16 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  cardLabel: { fontSize: 14, fontWeight: '700', color: COLORS.ink },
  textarea: { fontSize: 15, color: COLORS.ink, lineHeight: 22, minHeight: 140, textAlignVertical: 'top' },
  charCount: { fontSize: 11, color: COLORS.faded, textAlign: 'right', marginTop: 8 },
  translateBtn: { backgroundColor: COLORS.ink, borderRadius: 14, paddingVertical: 14, alignItems: 'center', marginBottom: 16 },
  translateBtnText: { fontSize: 15, fontWeight: '700', color: '#FFF' },
  langBtn: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: COLORS.surface, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: COLORS.border, marginBottom: 12 },
  langBtnText: { fontSize: 15, fontWeight: '600', color: COLORS.ink },
  pickerDrop: { backgroundColor: COLORS.surface, borderRadius: 12, borderWidth: 1, borderColor: COLORS.border, marginBottom: 16, overflow: 'hidden' },
  pickerItem: { padding: 14, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  pickerText: { fontSize: 14, color: COLORS.warm },
  outputText: { fontSize: 16, color: COLORS.ink, lineHeight: 24 },
  copyBtn: { fontSize: 13, fontWeight: '600', color: COLORS.saffron },
});
