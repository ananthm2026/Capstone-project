import { useState, useRef, useEffect } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Audio } from 'expo-av';
import * as Haptics from 'expo-haptics';
import { COLORS } from '../../src/constants/colors';
import { TARGET_LANGUAGES } from '../../src/constants/languages';
import { useApp } from '../../src/context/AppContext';
import api from '../../src/services/api';
import { useNavigation } from '@react-navigation/native';
import { useDrawer } from '../../src/context/DrawerContext';

const LANG_ENTRIES = Object.entries(TARGET_LANGUAGES);
const CHUNK_MS = 5000;

const SPEAKER_COLORS = ['#7C3AED', '#0EA5E9', '#10B981', '#F59E0B', '#F43F5E'];

export default function ContinuousScreen() {
  const insets = useSafeAreaInsets();
  const { state, setField, addHistory, showError, incrementUsage } = useApp();
  const navigation = useNavigation();
  const { openDrawer } = useDrawer();

  const [sessionState, setSessionState] = useState('idle'); // idle | listening | paused | ended
  const [lines, setLines] = useState([]);
  const [selectedLang, setSelectedLang] = useState('hi-IN');
  const [selectedLangName, setSelectedLangName] = useState('Hindi');
  const [showLangPicker, setShowLangPicker] = useState(false);
  const [timer, setTimer] = useState(0);

  const recordingRef = useRef(null);
  const timerRef = useRef(null);
  const chunkRef = useRef(null);
  const scrollRef = useRef(null);

  useEffect(() => {
    return () => {
      clearInterval(timerRef.current);
      clearInterval(chunkRef.current);
    };
  }, []);

  async function startSession() {
    try {
      const perm = await Audio.requestPermissionsAsync();
      if (!perm.granted) return;
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
      setSessionState('listening');
      setLines([]);
      setTimer(0);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      timerRef.current = setInterval(() => setTimer((t) => t + 1), 1000);
      recordChunk();
      chunkRef.current = setInterval(recordChunk, CHUNK_MS);
    } catch (e) {
      showError('Failed to start session: ' + e.message);
    }
  }

  async function recordChunk() {
    try {
      if (recordingRef.current) {
        await recordingRef.current.stopAndUnloadAsync();
        const uri = recordingRef.current.getURI();
        recordingRef.current = null;
        processChunk(uri);
      }
      const { recording } = await Audio.Recording.createAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
      recordingRef.current = recording;
    } catch (e) {
      // chunk error - continue
    }
  }

  async function processChunk(uri) {
    const lineId = Date.now().toString();
    setLines((prev) => [...prev, { id: lineId, text: '', processing: true, speaker: Math.ceil(Math.random() * 3) }]);
    try {
      const result = await api.translateAudioFromBlob({ uri, name: 'chunk.m4a', type: 'audio/m4a' }, selectedLang);
      incrementUsage('sarvamCalls');
      if (result.transcript && result.transcript.trim()) {
        setLines((prev) => prev.map((l) => l.id === lineId ? { ...l, text: result.transcript, native: result.native_transcript, processing: false } : l));
      } else {
        setLines((prev) => prev.filter((l) => l.id !== lineId));
      }
    } catch {
      setLines((prev) => prev.filter((l) => l.id !== lineId));
    }
  }

  async function pauseSession() {
    clearInterval(chunkRef.current);
    if (recordingRef.current) {
      await recordingRef.current.stopAndUnloadAsync();
      const uri = recordingRef.current.getURI();
      recordingRef.current = null;
      processChunk(uri);
    }
    clearInterval(timerRef.current);
    setSessionState('paused');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }

  function resumeSession() {
    setSessionState('listening');
    timerRef.current = setInterval(() => setTimer((t) => t + 1), 1000);
    recordChunk();
    chunkRef.current = setInterval(recordChunk, CHUNK_MS);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  }

  async function endSession() {
    clearInterval(chunkRef.current);
    clearInterval(timerRef.current);
    if (recordingRef.current) {
      await recordingRef.current.stopAndUnloadAsync();
      const uri = recordingRef.current.getURI();
      recordingRef.current = null;
      processChunk(uri);
    }
    setSessionState('ended');

    if (lines.length > 0) {
      const fullTranscript = lines.map(l => `Speaker ${l.speaker}: ${l.text}`).join('\n');
      const fullNative = lines.map(l => l.native).filter(Boolean).join('\n');
      addHistory({
        id: Date.now().toString(),
        text: fullTranscript,
        native: fullNative,
        language: selectedLangName,
        type: 'continuous',
        timestamp: new Date().toISOString(),
      });
    }

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }

  function clearSession() {
    setSessionState('idle');
    setLines([]);
    setTimer(0);
  }

  const fmtTime = `${String(Math.floor(timer / 60)).padStart(2, '0')}:${String(timer % 60).padStart(2, '0')}`;

  return (
    <View style={[st.root, { paddingTop: insets.top }]}>
      <View style={st.header}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <TouchableOpacity onPress={openDrawer} style={st.hamburger}>
            <Text style={st.hamburgerText}>☰</Text>
          </TouchableOpacity>
          <View>
            <Text style={st.headerTitle}>Continuous Listening</Text>
            <Text style={st.headerSub}>
              {sessionState === 'idle' ? 'Ready to start' : sessionState === 'listening' ? 'Listening...' : sessionState === 'paused' ? 'Paused' : 'Session ended'}
            </Text>
          </View>
        </View>
        <View style={[st.statusDot, { backgroundColor: sessionState === 'listening' ? '#10B981' : sessionState === 'paused' ? '#F59E0B' : COLORS.faded }]} />
      </View>

      {/* Language Picker */}
      <View style={{ paddingHorizontal: 20, paddingTop: 12 }}>
        <TouchableOpacity style={st.langBtn} onPress={() => setShowLangPicker(!showLangPicker)}>
          <Text style={st.langBtnText}>{selectedLangName}</Text>
          <Text>{showLangPicker ? '▲' : '▼'}</Text>
        </TouchableOpacity>
        {showLangPicker && (
          <View style={st.pickerDrop}>
            {LANG_ENTRIES.map(([name, code]) => (
              <TouchableOpacity key={code} style={[st.pickerItem, code === selectedLang && { backgroundColor: COLORS.saffronLight }]} onPress={() => { setSelectedLang(code); setSelectedLangName(name); setShowLangPicker(false); }}>
                <Text style={[st.pickerText, code === selectedLang && { color: COLORS.saffron, fontWeight: '700' }]}>{name}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>

      {/* Conversation */}
      <ScrollView ref={scrollRef} style={{ flex: 1 }} contentContainerStyle={[st.conversation, { paddingBottom: insets.bottom + 20 }]} onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}>
        {sessionState === 'idle' ? (
          <View style={st.emptyState}>
            <Text style={{ fontSize: 48, marginBottom: 16 }}>👂</Text>
            <Text style={st.emptyTitle}>Hands-free listening</Text>
            <Text style={st.emptySubtext}>Start a session and speak naturally. Audio is captured in 5-second chunks and transcribed in real time.</Text>
          </View>
        ) : lines.length === 0 && sessionState === 'listening' ? (
          <View style={st.emptyState}>
            <ActivityIndicator size="large" color={COLORS.saffron} />
            <Text style={st.emptySubtext}>Listening for speech...</Text>
          </View>
        ) : (
          lines.map((line, i) => {
            const isRight = line.speaker % 2 === 0;
            const color = SPEAKER_COLORS[(line.speaker - 1) % SPEAKER_COLORS.length];
            return (
              <View key={line.id} style={[st.bubble, isRight ? st.bubbleRight : st.bubbleLeft]}>
                <View style={[st.speakerBadge, { backgroundColor: color + '20' }]}>
                  <Text style={[st.speakerText, { color }]}>Speaker {line.speaker}</Text>
                </View>
                {line.processing ? (
                  <ActivityIndicator size="small" color={COLORS.saffron} style={{ marginTop: 8 }} />
                ) : (
                  <>
                    <Text style={st.bubbleText}>{line.text}</Text>
                    {line.native && <Text style={st.bubbleNative}>{line.native}</Text>}
                  </>
                )}
              </View>
            );
          })
        )}
      </ScrollView>

      {/* Controls */}
      <View style={[st.controlBar, { paddingBottom: insets.bottom + 20 }]}>
        {sessionState === 'listening' && <Text style={st.timerText}>{fmtTime}</Text>}
        <View style={st.controlRow}>
          {sessionState === 'idle' && (
            <TouchableOpacity style={st.primaryBtn} onPress={startSession}>
              <Text style={st.primaryBtnText}>▶ Start Listening</Text>
            </TouchableOpacity>
          )}
          {sessionState === 'listening' && (
            <>
              <TouchableOpacity style={[st.secondaryBtn, { flex: 1 }]} onPress={pauseSession}>
                <Text style={st.secondaryBtnText}>⏸ Pause</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[st.dangerBtn, { flex: 1 }]} onPress={endSession}>
                <Text style={st.dangerBtnText}>⏹ End</Text>
              </TouchableOpacity>
            </>
          )}
          {sessionState === 'paused' && (
            <>
              <TouchableOpacity style={[st.primaryBtn, { flex: 1 }]} onPress={resumeSession}>
                <Text style={st.primaryBtnText}>▶ Resume</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[st.dangerBtn, { flex: 1 }]} onPress={endSession}>
                <Text style={st.dangerBtnText}>⏹ End</Text>
              </TouchableOpacity>
            </>
          )}
          {sessionState === 'ended' && (
            <TouchableOpacity style={st.primaryBtn} onPress={clearSession}>
              <Text style={st.primaryBtnText}>🔄 New Session</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bg },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  headerTitle: { fontSize: 18, fontWeight: '700', color: COLORS.ink },
  headerSub: { fontSize: 13, color: COLORS.muted, marginTop: 2 },
  statusDot: { width: 10, height: 10, borderRadius: 5 },
  hamburger: { paddingRight: 12, paddingVertical: 4 },
  hamburgerText: { fontSize: 24, color: COLORS.ink },
  langBtn: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: COLORS.surface, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: COLORS.border, marginBottom: 8 },
  langBtnText: { fontSize: 15, fontWeight: '600', color: COLORS.ink },
  pickerDrop: { backgroundColor: COLORS.surface, borderRadius: 12, borderWidth: 1, borderColor: COLORS.border, marginBottom: 8, overflow: 'hidden' },
  pickerItem: { padding: 14, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  pickerText: { fontSize: 14, color: COLORS.warm },
  conversation: { paddingHorizontal: 20, paddingTop: 16 },
  emptyState: { alignItems: 'center', justifyContent: 'center', paddingVertical: 60 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: COLORS.ink, marginBottom: 8 },
  emptySubtext: { fontSize: 14, color: COLORS.muted, textAlign: 'center', lineHeight: 20, paddingHorizontal: 20 },
  bubble: { maxWidth: '80%', borderRadius: 16, padding: 12, marginBottom: 12 },
  bubbleLeft: { alignSelf: 'flex-start', backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border },
  bubbleRight: { alignSelf: 'flex-end', backgroundColor: COLORS.ink },
  speakerBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6, alignSelf: 'flex-start', marginBottom: 6 },
  speakerText: { fontSize: 11, fontWeight: '700' },
  bubbleText: { fontSize: 14, color: COLORS.ink, lineHeight: 20 },
  bubbleNative: { fontSize: 12, color: COLORS.muted, marginTop: 4, fontStyle: 'italic' },
  controlBar: { position: 'absolute', bottom: 0, left: 0, right: 0, paddingHorizontal: 20, paddingTop: 12, backgroundColor: COLORS.bg, borderTopWidth: 1, borderTopColor: COLORS.border },
  timerText: { fontSize: 14, fontWeight: '700', color: COLORS.saffron, textAlign: 'center', marginBottom: 8, fontVariant: ['tabular-nums'] },
  controlRow: { flexDirection: 'row', gap: 12 },
  primaryBtn: { flex: 1, backgroundColor: COLORS.ink, borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
  primaryBtnText: { fontSize: 15, fontWeight: '700', color: '#FFF' },
  secondaryBtn: { backgroundColor: COLORS.surface, borderRadius: 14, paddingVertical: 14, alignItems: 'center', borderWidth: 1, borderColor: COLORS.border },
  secondaryBtnText: { fontSize: 15, fontWeight: '700', color: COLORS.ink },
  dangerBtn: { backgroundColor: '#E53E3E', borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
  dangerBtnText: { fontSize: 15, fontWeight: '700', color: '#FFF' },
});
