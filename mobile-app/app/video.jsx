import { useState, useRef, useEffect } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, ActivityIndicator, Image, Alert, Linking } from 'react-native';
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
  const [targetLang, setTargetLang] = useState(null);
  const [targetLangName, setTargetLangName] = useState(null);
  const [showPicker, setShowPicker] = useState(false);
  const [result, setResult] = useState(null);
  const [subtitles, setSubtitles] = useState([]);
  const [currentSubtitle, setCurrentSubtitle] = useState('');
  const pollRef = useRef(null);
  const [isPlaying, setIsPlaying] = useState(false);

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
    if (!targetLang) {
      alert('Language Required', 'Please select a target language before translating.');
      return;
    }
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
    setSubtitles([]);
    setCurrentSubtitle('');
    setIsPlaying(false);
  }

  const playbackUrl = videoId ? `${BASE_URL}/api/video/download/${videoId}` : null;
  const thumbUrl = (videoId && result?.thumbnail_url) ? `${BASE_URL}${result.thumbnail_url}` : null;

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
    // Regex to match VTT blocks: timestamp line followed by one or more text lines
    const regex = /(\d{2}:\d{2}:\d{2}\.\d{3}|\d{2}:\d{2}\.\d{3}) --> (\d{2}:\d{2}:\d{2}\.\d{3}|\d{2}:\d{2}\.\d{3})\s+([\s\S]+?)(?=\n\n|\n\d+\n|$)/g;
    const parsed = [];
    let match;

    while ((match = regex.exec(data)) !== null) {
      parsed.push({
        start: parseVTTTime(match[1]),
        end: parseVTTTime(match[2]),
        text: match[3].trim().replace(/\n/g, ' ')
      });
    }
    setSubtitles(parsed);
  }

  function parseVTTTime(str) {
    const parts = str.split(':');
    let h = 0, m = 0, s = 0, ms = 0;

    if (parts.length === 3) {
      h = parseInt(parts[0], 10);
      m = parseInt(parts[1], 10);
      const last = parts[2].split('.');
      s = parseInt(last[0], 10);
      ms = parseInt(last[1], 10);
    } else {
      m = parseInt(parts[0], 10);
      const last = parts[1].split('.');
      s = parseInt(last[0], 10);
      ms = parseInt(last[1], 10);
    }
    return (h * 3600 + m * 60 + s) * 1000 + ms;
  }

  return (
    <View style={[st.root, { paddingTop: insets.top }]}>
      <View style={st.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={st.backBtn}>← Back</Text>
        </TouchableOpacity>
        <Text style={st.headerTitle}>Video Subtitles</Text>
        <View style={{ width: 50 }} />
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={[st.content, { paddingBottom: insets.bottom + 40 }]}>
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
              <Video 
                source={{ uri: videoUri }} 
                style={st.miniPreview} 
                resizeMode="cover" 
                isMuted 
                shouldPlay 
                isLooping 
              />
              <View style={st.previewInfo}>
                <Text style={st.fileName}>{videoName}</Text>
              </View>
            </View>

            <TouchableOpacity style={st.translateBtn} onPress={handleUploadAndTranslate}>
              <Text style={st.translateBtnText}>🚀 Generate {targetLangName || ''} Subtitles</Text>
            </TouchableOpacity>
            <TouchableOpacity style={st.secondaryBtn} onPress={handleReset}>
              <Text style={st.secondaryBtnText}>← Choose different video</Text>
            </TouchableOpacity>
          </>
        )}

        {step === 2 && (
          <View style={st.processingState}>
            <View style={st.loaderContainer}>
              <ActivityIndicator size="large" color={COLORS.saffron} />
            </View>
            <Text style={st.processingTitle}>Generating subtitles</Text>
            <Text style={st.processingSubtext}>This takes 1–2 minutes depending on video length</Text>
            <View style={st.statusCard}>
              <Text style={st.statusItem}>🎙 Transcribing audio in chunks</Text>
              <Text style={st.statusItem}>🌐 Translating to {targetLangName}</Text>
              <Text style={st.statusItem}>🎬 Preparing side-loaded captions</Text>
            </View>
          </View>
        )}

        {step === 3 && result && (
          <>
            <View style={st.successBanner}>
              <Text style={{ fontSize: 24 }}>✅</Text>
              <Text style={st.successText}>Subtitles generated!</Text>
            </View>

            {playbackUrl && (
              <View style={st.videoPlayerCard}>
                <View style={st.videoContainer}>
                  {!isPlaying ? (
                    <TouchableOpacity style={st.thumbnailContainer} activeOpacity={0.9} onPress={() => setIsPlaying(true)}>
                      <Image source={{ uri: thumbUrl }} style={st.thumbnail} />
                      <View style={st.playOverlay}>
                        <View style={st.playCircle}>
                          <Text style={st.playIcon}>▶</Text>
                        </View>
                      </View>
                      <View style={st.ccBadge}>
                        <Text style={st.ccText}>CC Subtitles</Text>
                      </View>
                    </TouchableOpacity>
                  ) : (
                    <Video
                      source={{ uri: playbackUrl }}
                      rate={1.0}
                      volume={1.0}
                      isMuted={false}
                      resizeMode="contain"
                      shouldPlay
                      useNativeControls
                      style={st.video}
                      progressUpdateIntervalMillis={100}
                      onPlaybackStatusUpdate={(status) => {
                        if (status.isLoaded && subtitles.length > 0) {
                          const timeMs = status.positionMillis;
                          const active = subtitles.find(s => timeMs >= s.start && timeMs <= s.end);
                          setCurrentSubtitle(active ? active.text : '');
                        }
                      }}
                    />
                  )}
                  {isPlaying && currentSubtitle ? (
                    <View style={st.subtitleOverlay} pointerEvents="none">
                      <Text style={st.subtitleText}>{currentSubtitle}</Text>
                    </View>
                  ) : null}
                </View>
                
                <View style={st.videoFooter}>
                  <Text style={st.videoFooterStatus}>Subtitles ready · {targetLangName}</Text>
                  <View style={st.videoActions}>
                    <TouchableOpacity 
                      style={st.miniActionBtn} 
                      onPress={() => Linking.openURL(`${BASE_URL}/api/video/srt/${videoId}`)}
                    >
                      <Text style={st.miniActionText}>📄 SRT</Text>
                    </TouchableOpacity>
                    <TouchableOpacity 
                      style={[st.miniActionBtn, { backgroundColor: COLORS.saffron }]} 
                      onPress={() => Linking.openURL(playbackUrl)}
                    >
                      <Text style={[st.miniActionText, { color: '#FFF' }]}>⬇️ Download</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            )}

            <Text style={st.sectionTitle}>Original Transcript</Text>
            <View style={st.textCard}>
              <Text style={st.cardText}>{result.transcript || 'No transcript available'}</Text>
            </View>

            <Text style={st.sectionTitle}>{targetLangName} Subtitles</Text>
            <View style={[st.textCard, { borderColor: COLORS.borderAccent }]}>
              <Text style={[st.cardText, { fontWeight: '600' }]}>{result.translated_text || 'No translation available'}</Text>
            </View>

            <TouchableOpacity style={st.translateBtn} onPress={handleReset}>
              <Text style={st.translateBtnText}>🔄 Generate Another Subtitle</Text>
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
  previewCard: { backgroundColor: COLORS.surface, borderRadius: 16, overflow: 'hidden', marginBottom: 16, borderWidth: 1, borderColor: COLORS.border },
  miniPreview: { width: '100%', height: 180, backgroundColor: '#000' },
  previewInfo: { padding: 12, borderTopWidth: 1, borderTopColor: COLORS.border },
  fileName: { fontSize: 13, fontWeight: '600', color: COLORS.ink },
  langBtn: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: COLORS.surface, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: COLORS.border, marginBottom: 12 },
  langBtnText: { fontSize: 15, fontWeight: '600', color: COLORS.ink },
  pickerDrop: { backgroundColor: COLORS.surface, borderRadius: 12, borderWidth: 1, borderColor: COLORS.border, marginBottom: 16, overflow: 'hidden' },
  pickerItem: { padding: 14, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  pickerText: { fontSize: 14, color: COLORS.warm },
  translateBtn: { backgroundColor: COLORS.ink, borderRadius: 14, paddingVertical: 14, alignItems: 'center', marginBottom: 12 },
  translateBtnText: { fontSize: 15, fontWeight: '700', color: '#FFF' },
  secondaryBtn: { alignItems: 'center', paddingVertical: 12 },
  secondaryBtnText: { fontSize: 14, fontWeight: '600', color: COLORS.muted },
  processingState: { alignItems: 'center', paddingVertical: 40 },
  loaderContainer: { width: 64, height: 64, borderRadius: 32, backgroundColor: 'rgba(232,130,12,0.1)', justifyContent: 'center', alignItems: 'center', marginBottom: 20 },
  processingTitle: { fontSize: 18, fontWeight: '700', color: COLORS.ink, marginBottom: 8 },
  processingSubtext: { fontSize: 13, color: COLORS.muted, marginBottom: 24, textAlign: 'center' },
  statusCard: { backgroundColor: COLORS.surface, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: COLORS.border, width: '100%' },
  statusItem: { fontSize: 13, color: COLORS.muted, marginBottom: 10, lineHeight: 20 },
  successBanner: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: COLORS.greenBg, borderRadius: 14, padding: 16, marginBottom: 20, borderWidth: 1, borderColor: COLORS.greenSoft + '30' },
  successText: { fontSize: 15, fontWeight: '700', color: COLORS.greenSoft },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: COLORS.ink, marginBottom: 8 },
  textCard: { backgroundColor: COLORS.surface, borderRadius: 14, padding: 16, marginBottom: 20, borderWidth: 1, borderColor: COLORS.border },
  cardText: { fontSize: 14, color: COLORS.ink, lineHeight: 22 },
  videoPlayerCard: { backgroundColor: COLORS.surface, borderRadius: 16, overflow: 'hidden', marginBottom: 20, borderWidth: 1, borderColor: COLORS.border },
  videoContainer: { backgroundColor: '#000', height: 250 },
  video: { width: '100%', height: '100%' },
  videoFooter: { padding: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: COLORS.surface },
  videoFooterStatus: { fontSize: 12, color: COLORS.muted, fontWeight: '500' },
  videoActions: { flexDirection: 'row', gap: 8 },
  miniActionBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, backgroundColor: 'rgba(0,0,0,0.05)', borderWidth: 1, borderColor: 'rgba(0,0,0,0.05)' },
  miniActionText: { fontSize: 12, fontWeight: '700', color: COLORS.warm },
  thumbnailContainer: { width: '100%', height: '100%', position: 'relative' },
  thumbnail: { width: '100%', height: '100%', opacity: 0.8 },
  playOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'center', alignItems: 'center' },
  playCircle: { width: 60, height: 60, borderRadius: 30, backgroundColor: 'rgba(232,130,12,0.9)', justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: '#FFF' },
  playIcon: { color: '#FFF', fontSize: 24, marginLeft: 4 },
  ccBadge: { position: 'absolute', top: 12, right: 12, backgroundColor: COLORS.ink, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6, borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)' },
  ccText: { color: COLORS.saffron, fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },
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
