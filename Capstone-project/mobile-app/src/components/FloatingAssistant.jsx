import React, { useRef, useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  PanResponder,
  Dimensions,
  Platform,
  Linking,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { Audio } from 'expo-av';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { useApp } from '../context/AppContext';
import { COLORS } from '../constants/colors';
import api from '../services/api';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const BUBBLE_SIZE = 64;
const MENU_WIDTH = 260;

const APP_CONTEXTS = [
  { id: 'whatsapp', label: 'WhatsApp', icon: '💬', color: '#25D366', tone: 'Casual', url: 'whatsapp://send?text=' },
  { id: 'slack', label: 'Slack', icon: '#️⃣', color: '#4A154B', tone: 'Professional', url: 'slack://open' },
  { id: 'linkedin', label: 'LinkedIn', icon: '💼', color: '#0077B5', tone: 'Formal', url: 'https://www.linkedin.com' },
  { id: 'gmail', label: 'Gmail', icon: '✉️', color: '#EA4335', tone: 'Professional', url: 'mailto:' },
];

export default function FloatingAssistant() {
  const router = useRouter();
  const { state, incrementUsage, addHistory } = useApp();
  const { floatingAssistantEnabled } = state;

  const pan = useRef(new Animated.ValueXY({ x: SCREEN_WIDTH - BUBBLE_SIZE - 20, y: SCREEN_HEIGHT - 150 })).current;
  const [isOpen, setIsOpen] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [selectedContext, setSelectedContext] = useState(APP_CONTEXTS[0]);
  const [recording, setRecording] = useState(null);
  
  const menuScale = useRef(new Animated.Value(0)).current;

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        pan.setOffset({ x: pan.x._value, y: pan.y._value });
      },
      onPanResponderMove: Animated.event([null, { dx: pan.x, dy: pan.y }], { useNativeDriver: false }),
      onPanResponderRelease: () => {
        pan.flattenOffset();
        const targetX = pan.x._value > SCREEN_WIDTH / 2 ? SCREEN_WIDTH - BUBBLE_SIZE - 10 : 10;
        Animated.spring(pan.x, { toValue: targetX, useNativeDriver: false }).start();
      },
    })
  ).current;

  if (!floatingAssistantEnabled) return null;

  async function startRecording() {
    try {
      const perm = await Audio.requestPermissionsAsync();
      if (!perm.granted) return;
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
      const { recording: rec } = await Audio.Recording.createAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
      setRecording(rec);
      setIsRecording(true);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch (e) {
      console.error(e);
    }
  }

  async function stopAndProcess() {
    if (!recording) return;
    setIsRecording(false);
    setIsProcessing(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    try {
      await recording.stopAndUnloadAsync();
      const uri = recording.getURI();
      
      // 1. Transcribe & Translate to English
      const transResult = await api.translateAudioFromBlob(uri, 'hi-IN'); // Default to auto/Hindi
      incrementUsage('sarvamCalls');

      if (transResult.transcript) {
        // 2. Auto-Retone based on Context
        const retoned = await api.rewriteTone(transResult.transcript, selectedContext.tone);
        incrementUsage('geminiCalls');

        // 3. Copy to Clipboard
        const finalText = retoned.rewritten_text;
        await Clipboard.setStringAsync(finalText);

        // 4. Save to History
        addHistory({
          id: Date.now().toString(),
          text: transResult.transcript,
          native: finalText,
          language: selectedContext.tone,
          type: 'widget',
          timestamp: new Date().toISOString(),
        });

        // 5. Success Feedback & Open App
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        
        if (selectedContext.url) {
          Linking.openURL(selectedContext.url).catch(() => {
            Alert.alert('App not found', `Check your clipboard, the ${selectedContext.tone} translation is copied!`);
          });
        }
      }
    } catch (e) {
      Alert.alert('Error', 'Assistant failed to process: ' + e.message);
    } finally {
      setIsProcessing(false);
      setRecording(null);
      setIsOpen(false);
    }
  }

  function toggleMenu() {
    if (isOpen) {
      Animated.timing(menuScale, { toValue: 0, duration: 200, useNativeDriver: true }).start(() => setIsOpen(false));
    } else {
      setIsOpen(true);
      Animated.spring(menuScale, { toValue: 1, friction: 8, useNativeDriver: true }).start();
    }
  }

  return (
    <View style={styles.container} pointerEvents="box-none">
      {isOpen && <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={toggleMenu} />}

      {isOpen && (
        <Animated.View 
          style={[
            styles.menu, 
            { 
              transform: [{ scale: menuScale }],
              bottom: SCREEN_HEIGHT - pan.y._value + 10,
              right: SCREEN_WIDTH - pan.x._value - BUBBLE_SIZE,
            }
          ]}
        >
          <Text style={styles.menuTitle}>Smart Assistant</Text>
          
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>SELECT TARGET APP</Text>
            <View style={styles.contextRow}>
              {APP_CONTEXTS.map((ctx) => (
                <TouchableOpacity 
                  key={ctx.id} 
                  style={[styles.contextIcon, selectedContext.id === ctx.id && { borderColor: ctx.color, borderWidth: 2 }]}
                  onPress={() => setSelectedContext(ctx)}
                >
                  <Text style={{ fontSize: 20 }}>{ctx.icon}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={styles.contextLabel}>Mode: <Text style={{fontWeight:'700', color: selectedContext.color}}>{selectedContext.tone}</Text></Text>
          </View>

          <TouchableOpacity 
            style={[styles.actionBtn, isRecording && { backgroundColor: '#E53E3E' }]} 
            onPress={isRecording ? stopAndProcess : startRecording}
            disabled={isProcessing}
          >
            {isProcessing ? (
              <ActivityIndicator color="#FFF" />
            ) : (
              <Text style={styles.actionBtnText}>{isRecording ? '⏹ Finish & Send' : '🎙 Speak & Auto-Retone'}</Text>
            )}
          </TouchableOpacity>
        </Animated.View>
      )}

      <Animated.View
        {...panResponder.panHandlers}
        style={[
          styles.bubble,
          { transform: [{ translateX: pan.x }, { translateY: pan.y }] },
          isRecording && { backgroundColor: '#E53E3E', transform: [{ translateX: pan.x }, { translateY: pan.y }, { scale: 1.1 }] }
        ]}
      >
        <TouchableOpacity style={styles.bubbleTouch} onPress={toggleMenu} onLongPress={startRecording}>
          {isProcessing ? (
            <ActivityIndicator color="#FFF" />
          ) : (
            <Text style={styles.bubbleText}>{isRecording ? '🛑' : '🌱'}</Text>
          )}
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { ...StyleSheet.absoluteFillObject, zIndex: 999 },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.1)' },
  bubble: {
    position: 'absolute',
    width: BUBBLE_SIZE,
    height: BUBBLE_SIZE,
    borderRadius: BUBBLE_SIZE / 2,
    backgroundColor: COLORS.ink,
    elevation: 10, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 6,
    justifyContent: 'center', alignItems: 'center',
  },
  bubbleTouch: { width: '100%', height: '100%', justifyContent: 'center', alignItems: 'center' },
  bubbleText: { fontSize: 28 },
  menu: {
    position: 'absolute',
    width: MENU_WIDTH,
    backgroundColor: '#FFF',
    borderRadius: 24,
    padding: 20,
    elevation: 15, shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.2, shadowRadius: 15,
  },
  menuTitle: { fontSize: 18, fontWeight: '800', color: COLORS.ink, marginBottom: 16, textAlign: 'center' },
  section: { marginBottom: 20 },
  sectionTitle: { fontSize: 10, fontWeight: '700', color: COLORS.faded, letterSpacing: 1, marginBottom: 12 },
  contextRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
  contextIcon: { width: 44, height: 44, borderRadius: 12, backgroundColor: COLORS.surface, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: COLORS.border },
  contextLabel: { fontSize: 12, color: COLORS.muted, textAlign: 'center' },
  actionBtn: { backgroundColor: COLORS.ink, borderRadius: 16, paddingVertical: 14, alignItems: 'center' },
  actionBtnText: { color: '#FFF', fontWeight: '700', fontSize: 14 },
});
