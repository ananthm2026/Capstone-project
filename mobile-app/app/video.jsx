import { useState, useRef, useEffect } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import * as Haptics from 'expo-haptics';
import { Video } from 'expo-av';
import { COLORS } from '../src/constants/colors';
import { TARGET_LANGUAGES } from '../src/constants/languages';
import { useApp } from '../src/context/AppContext';
import api, { BASE_URL } from '../src/services/api';

const LANG_ENTRIES = Object.entries(TARGET_LANGUAGES);

export default function VideoScreen() {
  const insets = useSafeAreaInsets();
  const { addHistory, incrementUsage, showError } = useApp();

  const [step, setStep] = useState(0); // 0=upload, 1=configure, 2=processing, 3=results
  const [videoUri, setVideoUri] = useState(null);
  const [videoName, setVideoName] = useState('');
  const [videoId, setVideoId] = useState(null);
  const [targetLang, setTargetLang] = useState('hi-IN');
  const [targetLangName, setTargetLangName] = useState('Hindi');
  const [showPicker, setShowPicker] = useState(false);
  const [result, setResult] = useState(null);
  const [subtitles, setSubtitles] = useState([]);
  const [currentSubtitle, setCurrentSubtitle] = useState('');
  const pollRef = useRef(null);

  useEffect(() => {
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  async function pickVideo() {
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['videos'] });
    if (!res.canceled && res.assets[0]) {
      setVideoUri(res.assets[0].uri);
      setVideoName(res.assets[0].fileName || 'video.mp4');
      setStep(1);
    }
  }

  async function handleUploadAndTranslate() {
    setStep(2);
    try {
      const uploadRes = await api.uploadVideo(videoUri, videoName);
      setVideoId(uploadRes.video_id);
      await api.translateVideo(uploadRes.video_id, targetLang);
      incrementUsage('geminiCalls');

      pollRef.current = setInterval(async () => {
        try {
          const status = await api.getVideoStatus(uploadRes.video_id);
          if (status.status === 'done') {
            clearInterval(pollRef.current);
            setResult(status);
            setStep(3);
            
            // Fetch and parse VTT
            fetchVTT(uploadRes.video_id);
            
            addHistory({
              id: Date.now().toString(),
              text: status.transcript || '',
              native: status.translated_text || '',
              language: targetLangName,
              type: 'video',
              timestamp: new Date().toISOString(),
            });

            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          } else if (status.status === 'error') {
            clearInterval(pollRef.current);
            showError(status.error || 'Video translation failed');
            setStep(1);
          }
        } catch { /* continue polling */ }
      }, 3000);
    } catch (e) {
      showError('Upload failed: ' + e.message);
      setStep(1);
    }
  }

  function handleReset() {
    if (pollRef.current) clearInterval(pollRef.current);
    setStep(0);
    setVideoUri(null);
    setVideoName('');
    setVideoId(null);
    setResult(null);
  }

  const playbackUrl = videoId ? `${BASE_URL}/api/video/download/${videoId}` : null;

  async function fetchVTT(vid) {
    try {
      const response = await fetch(`${BASE_URL}/api/video/vtt/${vid}`);
      const text = await response.text();
      parseVTT(text);
    } catch (e) {
      console.error('VTT fetch failed', e);
    }
  }

  function parseVTT(data) {
    const lines = data.split('\n');
    const parsed = [];
    let current = null;

    for (let line of lines) {
      line = line.trim();
      if (line.includes('-->')) {
        const [startStr, endStr] = line.split(' --> ');
        current = {
          start: parseVTTTime(startStr),
          end: parseVTTTime(endStr),
          text: ''
        };
      } else if (current && line && !line.startsWith('WEBVTT')) {
        current.text = line;
        parsed.push(current);
        current = null;
      }
    }
    setSubtitles(parsed);
  }

  function parseVTTTime(str) {
    const [hms, ms] = str.split('.');
    const parts = hms.split(':').map(Number);
    let sec = 0;
    if (parts.length === 3) {
      sec = parts[0] * 3600 + parts[1] * 60 + parts[2];
    } else {
      sec = parts[0] * 60 + parts[1];
    }
    return sec * 1000 + Number(ms);
  }

  return (
    <View style={[st.root, { paddingTop: insets.top }]}>
      <View style={st.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={st.backBtn}>← Back</Text>
        </TouchableOpacity>
        <Text style={st.headerTitle}>Video Translate</Text>
        <View style={{ width: 50 }} />
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={[st.content, { paddingBottom: insets.bottom + 40 }]}>
        {step === 0 && (
          <View style={st.uploadZone}>
            <Text style={{ fontSize: 48, marginBottom: 12 }}>🎬</Text>
            <Text style={st.uploadTitle}>Upload a video</Text>
            <Text style={st.uploadSubtext}>MP4, MOV, AVI, WEBM up to 200MB</Text>
            <TouchableOpacity style={st.uploadBtn} onPress={pickVideo}>
              <Text style={st.uploadBtnText}>📁 Choose Video</Text>
            </TouchableOpacity>
          </View>
        )}

        {step === 1 && (
          <>
            <View style={st.previewCard}>
              <Text style={{ fontSize: 32, marginBottom: 8 }}>🎬</Text>
              <Text style={st.fileName}>{videoName}</Text>
            </View>

            <TouchableOpacity style={st.langBtn} onPress={() => setShowPicker(!showPicker)}>
              <Text style={st.langBtnText}>Translate to: {targetLangName}</Text>
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

            <TouchableOpacity style={st.translateBtn} onPress={handleUploadAndTranslate}>
              <Text style={st.translateBtnText}>🚀 Upload & Translate</Text>
            </TouchableOpacity>
            <TouchableOpacity style={st.secondaryBtn} onPress={handleReset}>
              <Text style={st.secondaryBtnText}>← Choose different video</Text>
            </TouchableOpacity>
          </>
        )}

        {step === 2 && (
          <View style={st.processingState}>
            <ActivityIndicator size="large" color={COLORS.saffron} />
            <Text style={st.processingTitle}>Processing video...</Text>
            <Text style={st.processingSubtext}>This may take a few minutes depending on video length</Text>
          </View>
        )}

        {step === 3 && result && (
          <>
            <View style={st.successBanner}>
              <Text style={{ fontSize: 24 }}>✅</Text>
              <Text style={st.successText}>Translation complete!</Text>
            </View>

            {playbackUrl && (
              <View style={st.videoContainer}>
                <Video
                  source={{ uri: playbackUrl }}
                  rate={1.0}
                  volume={1.0}
                  isMuted={false}
                  resizeMode="contain"
                  shouldPlay
                  useNativeControls
                  style={st.video}
                  onPlaybackStatusUpdate={(status) => {
                    if (status.isLoaded && subtitles.length > 0) {
                      const timeMs = status.positionMillis;
                      const active = subtitles.find(s => timeMs >= s.start && timeMs <= s.end);
                      setCurrentSubtitle(active ? active.text : '');
                    }
                  }}
                />
                {currentSubtitle ? (
                  <View style={st.subtitleOverlay} pointerEvents="none">
                    <Text style={st.subtitleText}>{currentSubtitle}</Text>
                  </View>
                ) : null}
              </View>
            )}

            <Text style={st.sectionTitle}>Original Transcript</Text>
            <View style={st.textCard}>
              <Text style={st.cardText}>{result.transcript || 'No transcript available'}</Text>
            </View>

            <Text style={st.sectionTitle}>Translated Text</Text>
            <View style={[st.textCard, { borderColor: COLORS.borderAccent }]}>
              <Text style={[st.cardText, { fontWeight: '600' }]}>{result.translated_text || 'No translation available'}</Text>
            </View>

            <TouchableOpacity style={st.translateBtn} onPress={handleReset}>
              <Text style={st.translateBtnText}>🔄 Translate Another Video</Text>
            </TouchableOpacity>
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
  uploadZone: { alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.surface, borderRadius: 20, padding: 40, borderWidth: 2, borderColor: COLORS.border, borderStyle: 'dashed' },
  uploadTitle: { fontSize: 16, fontWeight: '600', color: COLORS.ink, marginBottom: 4 },
  uploadSubtext: { fontSize: 13, color: COLORS.muted, marginBottom: 20 },
  uploadBtn: { backgroundColor: COLORS.ink, borderRadius: 12, paddingHorizontal: 24, paddingVertical: 12 },
  uploadBtnText: { fontSize: 14, fontWeight: '700', color: '#FFF' },
  previewCard: { backgroundColor: COLORS.surface, borderRadius: 16, padding: 24, alignItems: 'center', marginBottom: 16, borderWidth: 1, borderColor: COLORS.border },
  fileName: { fontSize: 14, fontWeight: '600', color: COLORS.ink },
  langBtn: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: COLORS.surface, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: COLORS.border, marginBottom: 12 },
  langBtnText: { fontSize: 15, fontWeight: '600', color: COLORS.ink },
  pickerDrop: { backgroundColor: COLORS.surface, borderRadius: 12, borderWidth: 1, borderColor: COLORS.border, marginBottom: 16, overflow: 'hidden' },
  pickerItem: { padding: 14, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  pickerText: { fontSize: 14, color: COLORS.warm },
  translateBtn: { backgroundColor: COLORS.ink, borderRadius: 14, paddingVertical: 14, alignItems: 'center', marginBottom: 12 },
  translateBtnText: { fontSize: 15, fontWeight: '700', color: '#FFF' },
  secondaryBtn: { alignItems: 'center', paddingVertical: 12 },
  secondaryBtnText: { fontSize: 14, fontWeight: '600', color: COLORS.muted },
  processingState: { alignItems: 'center', paddingVertical: 60 },
  processingTitle: { fontSize: 18, fontWeight: '700', color: COLORS.ink, marginTop: 16 },
  processingSubtext: { fontSize: 13, color: COLORS.muted, marginTop: 4, textAlign: 'center' },
  successBanner: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: COLORS.greenBg, borderRadius: 14, padding: 16, marginBottom: 20, borderWidth: 1, borderColor: COLORS.greenSoft + '30' },
  successText: { fontSize: 15, fontWeight: '700', color: COLORS.greenSoft },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: COLORS.ink, marginBottom: 8 },
  textCard: { backgroundColor: COLORS.surface, borderRadius: 14, padding: 16, marginBottom: 20, borderWidth: 1, borderColor: COLORS.border },
  cardText: { fontSize: 14, color: COLORS.ink, lineHeight: 22 },
  videoContainer: { backgroundColor: '#000', borderRadius: 16, overflow: 'hidden', marginBottom: 20, height: 250 },
  video: { width: '100%', height: '100%' },
  subtitleOverlay: {
    position: 'absolute',
    bottom: 40,
    left: 20,
    right: 20,
    backgroundColor: 'rgba(0,0,0,0.6)',
    padding: 8,
    borderRadius: 8,
    alignItems: 'center',
  },
  subtitleText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
  },
});
