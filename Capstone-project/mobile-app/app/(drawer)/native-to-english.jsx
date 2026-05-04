import { useState, useRef, useEffect } from 'react';
import { View, Text, TouchableOpacity, TextInput, ScrollView, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Audio } from 'expo-av';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { COLORS, CONFIDENCE_COLOR } from '../../src/constants/colors';
import { TARGET_LANGUAGES, TONES } from '../../src/constants/languages';
import { useApp } from '../../src/context/AppContext';
import api from '../../src/services/api';
import { useNavigation } from '@react-navigation/native';
import { useDrawer } from '../../src/context/DrawerContext';



export default function NativeToEnglishScreen() {
  const insets = useSafeAreaInsets();
  const { state, setField, setFields, addHistory, incrementUsage, showError } = useApp();
  const navigation = useNavigation();
  const { openDrawer } = useDrawer();

  const [recording, setRecording] = useState(null);
  const [isRecording, setIsRecording] = useState(false);
  const [timer, setTimer] = useState(0);
  const [transcribing, setTranscribing] = useState(false);
  const [retoning, setRetoning] = useState(false);
  const [translating, setTranslating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [mode, setMode] = useState('transcript'); // transcript | retoned | translation
  const [showTonePicker, setShowTonePicker] = useState(false);

  const timerRef = useRef(null);

  const { englishText, nativeTranscript, rewrittenText, nativeTranslation, confidenceScore, selectedLanguage, selectedLanguageName, selectedTone } = state;

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  async function startRecording() {
    try {
      const perm = await Audio.requestPermissionsAsync();
      if (!perm.granted) { Alert.alert('Permission needed', 'Microphone access is required.'); return; }
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
      const { recording: rec } = await Audio.Recording.createAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
      setRecording(rec);
      setIsRecording(true);
      setTimer(0);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      timerRef.current = setInterval(() => setTimer((t) => t + 1), 1000);
    } catch (e) {
      showError('Failed to start recording: ' + e.message);
    }
  }

  async function stopRecording() {
    if (!recording) return;
    clearInterval(timerRef.current);
    setIsRecording(false);
    setTranscribing(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      await recording.stopAndUnloadAsync();
      const uri = recording.getURI();
      setRecording(null);
      console.log('[N2E] Recording URI:', uri);
      console.log('[N2E] Sending to API with language:', selectedLanguage);
      const result = await api.translateAudioFromBlob(uri, selectedLanguage);
      console.log('[N2E] API result:', JSON.stringify(result));
      incrementUsage('sarvamCalls');
      setFields({
        englishText: result.transcript || '',
        nativeTranscript: result.native_transcript || '',
        confidenceScore: result.confidence ? Math.round(result.confidence * 100) : null,
      });
      if (result.transcript) {
        addHistory({
          id: Date.now().toString(),
          text: result.transcript || '',
          native: result.native_transcript || '',
          language: selectedLanguageName,
          confidence: result.confidence ? Math.round(result.confidence * 100) : null,
          timestamp: new Date().toISOString(),
        });
      }
    } catch (e) {
      console.error('[N2E] Transcription error:', e.response?.data || e.message);
      const detail = e.response?.data?.detail || e.response?.data?.error || e.message;
      Alert.alert('Transcription Failed', String(detail));
    } finally {
      setTranscribing(false);
    }
  }

  async function handleRetone(tone) {
    if (!englishText) return;
    setShowTonePicker(false);
    setField('selectedTone', tone);
    setRetoning(true);
    try {
      const result = await api.rewriteTone(englishText, tone);
      incrementUsage('geminiCalls');
      setField('rewrittenText', result.rewritten_text);
      setMode('retoned');
    } catch (e) {
      showError('Retoning failed: ' + e.message);
    } finally {
      setRetoning(false);
    }
  }

  async function handleTranslate() {
    const text = rewrittenText || englishText;
    if (!text) return;
    setTranslating(true);
    try {
      const result = await api.translateText(text, selectedLanguage);
      incrementUsage('sarvamCalls');
      setField('nativeTranslation', result.translated_text);
      setMode('translation');
    } catch (e) {
      showError('Translation failed: ' + e.message);
    } finally {
      setTranslating(false);
    }
  }

  async function handleCopy() {
    const text = mode === 'translation' ? nativeTranslation : mode === 'retoned' ? rewrittenText : englishText;
    if (!text) return;
    await Clipboard.setStringAsync(text);
    setCopied(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setTimeout(() => setCopied(false), 2000);
  }

  function handleClear() {
    setFields({ englishText: '', nativeTranscript: '', rewrittenText: '', nativeTranslation: '', confidenceScore: null, selectedTone: '' });
    setMode('transcript');
  }

  const activeText = mode === 'translation' ? nativeTranslation : mode === 'retoned' ? rewrittenText : englishText;
  const wordCount = activeText ? activeText.trim().split(/\s+/).length : 0;
  const charCount = activeText ? activeText.length : 0;
  const fmtTime = `${String(Math.floor(timer / 60)).padStart(2, '0')}:${String(timer % 60).padStart(2, '0')}`;

  return (
    <View style={[st.root, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={st.header}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <TouchableOpacity onPress={openDrawer} style={st.hamburger}>
            <Text style={st.hamburgerText}>☰</Text>
          </TouchableOpacity>
          <View>
            <Text style={st.headerTitle}>Speech to Text</Text>
            <Text style={st.headerSub}>{englishText ? 'Transcript ready to edit' : 'Ready to start'}</Text>
          </View>
        </View>
        <Text style={st.versionBadge}>v2.5</Text>
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={[st.content, { paddingBottom: insets.bottom + 20 }]} showsVerticalScrollIndicator={false}>


        {/* Toolbar */}
        {englishText ? (
          <View style={st.toolbar}>
            <TouchableOpacity style={st.toolBtn} onPress={handleTranslate} disabled={translating}>
              <Text style={st.toolBtnText}>{translating ? 'Translating...' : 'Translate'}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[st.toolBtn, { backgroundColor: COLORS.surface }]} onPress={() => setShowTonePicker(!showTonePicker)}>
              <Text style={[st.toolBtnText, { color: COLORS.ink }]}>{selectedTone || 'Retone'}</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {showTonePicker && (
          <View style={st.pickerDrop}>
            {TONES.map((t) => (
              <TouchableOpacity key={t} style={st.pickerItem} onPress={() => handleRetone(t)}>
                <Text style={st.pickerText}>{t}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Mode tabs */}
        {englishText ? (
          <View style={st.modeTabs}>
            {['transcript', 'retoned', 'translation'].map((m) => (
              <TouchableOpacity key={m} style={[st.modeTab, mode === m && st.modeTabActive]} onPress={() => setMode(m)} disabled={m === 'retoned' && !rewrittenText || m === 'translation' && !nativeTranslation}>
                <Text style={[st.modeTabText, mode === m && st.modeTabTextActive]}>{m.charAt(0).toUpperCase() + m.slice(1)}</Text>
              </TouchableOpacity>
            ))}
          </View>
        ) : null}

        {/* Output */}
        {transcribing ? (
          <View style={st.emptyState}>
            <ActivityIndicator size="large" color={COLORS.saffron} />
            <Text style={st.emptyText}>Transcribing audio...</Text>
          </View>
        ) : retoning ? (
          <View style={st.emptyState}>
            <ActivityIndicator size="large" color={COLORS.saffron} />
            <Text style={st.emptyText}>Shaping your message...</Text>
          </View>
        ) : activeText ? (
          <View style={st.outputCard}>
            <View style={st.outputHeader}>
              <Text style={st.outputLabel}>{mode === 'translation' ? 'Translation' : mode === 'retoned' ? 'Retoned' : 'Transcript'}</Text>
              {confidenceScore != null && mode === 'transcript' && (
                <View style={[st.badge, { backgroundColor: CONFIDENCE_COLOR(confidenceScore) + '20' }]}>
                  <Text style={[st.badgeText, { color: CONFIDENCE_COLOR(confidenceScore) }]}>{confidenceScore}%</Text>
                </View>
              )}
            </View>
            <TextInput style={st.outputText} value={activeText} onChangeText={(t) => { if (mode === 'transcript') setField('englishText', t); }} multiline editable={mode === 'transcript'} />
            <View style={st.outputFooter}>
              <Text style={st.countText}>{wordCount} words · {charCount} chars</Text>
              <View style={{ flexDirection: 'row', gap: 12 }}>
                <TouchableOpacity onPress={handleCopy}>
                  <Text style={st.actionBtn}>{copied ? '✓ Copied' : '📋 Copy'}</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={handleClear}>
                  <Text style={[st.actionBtn, { color: COLORS.redSoft }]}>🗑 Clear</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        ) : (
          <View style={st.emptyState}>
            <View style={st.micCircle}>
              <Text style={{ fontSize: 36 }}>🎙️</Text>
            </View>
            <Text style={st.emptyText}>Press Start Speaking to begin</Text>
            <Text style={st.emptySubtext}>Record audio to get English transcript instantly</Text>
          </View>
        )}
      </ScrollView>

      {/* Recording Controls */}
      <View style={[st.recordBar, { paddingBottom: insets.bottom + 20 }]}>
        {isRecording ? (
          <View style={st.recordingRow}>
            <View style={st.timerBox}>
              <View style={st.redDot} />
              <Text style={st.timerText}>{fmtTime}</Text>
            </View>
            <TouchableOpacity style={st.stopBtn} onPress={stopRecording}>
              <Text style={st.stopBtnText}>⏹ Stop</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity style={st.startBtn} onPress={startRecording} disabled={transcribing}>
            <Text style={st.startBtnText}>🎙 Start Speaking</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bg },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  headerTitle: { fontSize: 18, fontWeight: '700', color: COLORS.ink },
  headerSub: { fontSize: 13, color: COLORS.muted, marginTop: 2 },
  versionBadge: { fontSize: 11, color: COLORS.faded, backgroundColor: COLORS.surface, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, borderWidth: 1, borderColor: COLORS.border },
  hamburger: { paddingRight: 12, paddingVertical: 4 },
  hamburgerText: { fontSize: 24, color: COLORS.ink },
  content: { paddingHorizontal: 20, paddingTop: 16 },
  pickerDrop: { backgroundColor: COLORS.surface, borderRadius: 12, borderWidth: 1, borderColor: COLORS.border, marginBottom: 12, overflow: 'hidden' },
  pickerItem: { padding: 14, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  pickerItemActive: { backgroundColor: COLORS.saffronLight },
  pickerText: { fontSize: 14, color: COLORS.warm },
  toolbar: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  toolBtn: { flex: 1, backgroundColor: COLORS.ink, borderRadius: 12, padding: 12, alignItems: 'center' },
  toolBtnText: { fontSize: 14, fontWeight: '700', color: '#FFF' },
  modeTabs: { flexDirection: 'row', backgroundColor: COLORS.surface, borderRadius: 12, padding: 4, marginBottom: 16, borderWidth: 1, borderColor: COLORS.border },
  modeTab: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 10 },
  modeTabActive: { backgroundColor: COLORS.ink },
  modeTabText: { fontSize: 13, fontWeight: '600', color: COLORS.muted },
  modeTabTextActive: { color: '#FFF' },
  outputCard: { backgroundColor: COLORS.surface, borderRadius: 20, borderWidth: 1, borderColor: COLORS.border, padding: 16, marginBottom: 16 },
  outputHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  outputLabel: { fontSize: 14, fontWeight: '700', color: COLORS.ink },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  badgeText: { fontSize: 12, fontWeight: '700' },
  outputText: { fontSize: 15, color: COLORS.ink, lineHeight: 22, minHeight: 120, textAlignVertical: 'top' },
  outputFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: COLORS.border },
  countText: { fontSize: 12, color: COLORS.faded },
  actionBtn: { fontSize: 13, fontWeight: '600', color: COLORS.saffron },
  emptyState: { alignItems: 'center', justifyContent: 'center', paddingVertical: 60 },
  micCircle: { width: 80, height: 80, borderRadius: 40, backgroundColor: COLORS.saffronLight, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  emptyText: { fontSize: 16, fontWeight: '600', color: COLORS.warm, marginTop: 8 },
  emptySubtext: { fontSize: 13, color: COLORS.muted, marginTop: 4, textAlign: 'center' },
  recordBar: { position: 'absolute', bottom: 0, left: 0, right: 0, paddingHorizontal: 20, paddingTop: 12, backgroundColor: COLORS.bg, borderTopWidth: 1, borderTopColor: COLORS.border },
  recordingRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  timerBox: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
  redDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#E53E3E' },
  timerText: { fontSize: 18, fontWeight: '700', color: COLORS.ink, fontVariant: ['tabular-nums'] },
  stopBtn: { backgroundColor: '#E53E3E', borderRadius: 14, paddingHorizontal: 24, paddingVertical: 12 },
  stopBtnText: { fontSize: 15, fontWeight: '700', color: '#FFF' },
  startBtn: { backgroundColor: COLORS.ink, borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
  startBtnText: { fontSize: 16, fontWeight: '700', color: '#FFF' },
});
