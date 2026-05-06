import axios from 'axios';
import { Platform } from 'react-native';
import Constants from 'expo-constants';

// Derive the backend URL from the Expo dev server's host IP
// so the phone talks to the Mac, not to itself (localhost won't work on a real device)
function getBaseUrl() {
  // If an explicit env var is set, use it
  const envUrl = process.env.EXPO_PUBLIC_API_URL;
  if (envUrl) return envUrl;

  // On Android emulator, 10.0.2.2 maps to the host machine's localhost
  if (Platform.OS === 'android') return 'http://10.0.2.2:8000';

  // On a real device, grab the dev server host IP from Expo
  const debuggerHost =
    Constants.expoConfig?.hostUri ||           // SDK 54
    Constants.manifest2?.extra?.expoGo?.debuggerHost ||
    Constants.manifest?.debuggerHost;

  if (debuggerHost) {
    const ip = debuggerHost.split(':')[0]; // strip the port
    return `http://${ip}:8000`;
  }

  // Fallback
  return 'http://localhost:8000';
}

export const BASE_URL = getBaseUrl();
console.log('[api] BASE_URL =', BASE_URL);

const client = axios.create({
  baseURL: BASE_URL,
  timeout: 60000,
  headers: { 'Content-Type': 'application/json' },
});

export function setApiBaseUrl(url) {
  client.defaults.baseURL = url;
}

const api = {
  setAuthToken(token) {
    if (token) {
      client.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    } else {
      delete client.defaults.headers.common['Authorization'];
    }
  },

  // Audio
  async translateAudioFromBlob(uri, language = 'hi-IN') {
    const fileUri = typeof uri === 'string' ? uri : uri.uri || uri;
    // Determine extension and MIME from the URI
    const ext = fileUri.split('.').pop()?.toLowerCase() || 'm4a';
    const mimeMap = { caf: 'audio/x-caf', m4a: 'audio/mp4', wav: 'audio/wav', mp3: 'audio/mpeg', webm: 'audio/webm', ogg: 'audio/ogg' };
    const mime = mimeMap[ext] || 'audio/mp4';
    const fileName = `recording.${ext}`;

    console.log('[api] translateAudio:', { fileUri, ext, mime, language });

    const form = new FormData();
    form.append('file', { uri: fileUri, name: fileName, type: mime });
    const { data } = await client.post('/api/translate-audio', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 120000,
    });
    return data;
  },

  async textToSpeech(text, language = 'en-IN') {
    const { data } = await client.post('/api/text-to-speech', { text, language }, { responseType: 'arraybuffer' });
    return data;
  },

  // Translation
  async translateText(text, targetLanguage, sourceLanguage = 'en-IN') {
    const { data } = await client.post('/api/translate-text', {
      text,
      source_language: sourceLanguage,
      target_language: targetLanguage,
    });
    return data;
  },

  async multiTranslate(text, languages) {
    const { data } = await client.post('/api/multi-translate', { text, languages });
    return data;
  },

  // Tone
  async rewriteTone(text, tone, userOverride = '') {
    const { data } = await client.post('/api/rewrite-tone', {
      text,
      tone,
      user_override: userOverride,
    });
    return data;
  },

  // Vision
  async visionTranslate(imageUri, targetLanguage = 'en-IN') {
    const form = new FormData();
    form.append('file', {
      uri: imageUri,
      name: 'photo.jpg',
      type: 'image/jpeg',
    });
    form.append('target_language', targetLanguage);
    const { data } = await client.post('/api/vision-translate', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return data;
  },

  // Video
  async uploadVideo(videoUri, filename) {
    const form = new FormData();
    form.append('file', {
      uri: videoUri,
      name: filename || 'video.mp4',
      type: 'video/mp4',
    });
    const { data } = await client.post('/api/video/upload', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return data;
  },

  async translateVideo(videoId, targetLanguage) {
    const { data } = await client.post('/api/video/translate', {
      video_id: videoId,
      target_language: targetLanguage,
    });
    return data;
  },

  async getVideoStatus(videoId) {
    const { data } = await client.get(`/api/video/status/${videoId}`);
    return data;
  },

  // Analysis
  async analyzeSentiment(text) {
    const { data } = await client.post('/api/analyze-sentiment', { text });
    return data;
  },

  async suggestTone(text) {
    const { data } = await client.post('/api/suggest-tone', { text });
    return data;
  },

  async summarizeTranscript(text) {
    const { data } = await client.post('/api/summarize', { text });
    return data;
  },

  async getReadability(text) {
    const { data } = await client.post('/api/readability', { text });
    return data;
  },

  // Sharing
  async createShareLink(text, title) {
    const { data } = await client.post('/api/share/create', { text, title });
    return data;
  },

  async getShareLink(linkId) {
    const { data } = await client.get(`/api/share/${linkId}`);
    return data;
  },

  async exportHistory(entries, format = 'csv') {
    const { data } = await client.post('/api/export', { entries, format });
    return data;
  },

  // Sessions
  async saveNativeToEnglishSession(payload) {
    const { data } = await client.post('/api/native-to-english/session', payload);
    return data;
  },

  async saveNativeToEnglishTranscription(payload) {
    const { data } = await client.post('/api/native-to-english/transcription', payload);
    return data;
  },

  // Auth
  async syncUser(userData) {
    const { data } = await client.post('/api/auth/sync-user', userData);
    return data;
  },

  // Cache
  async getCacheStats() {
    const { data } = await client.get('/api/cache/stats');
    return data;
  },

  async clearCache() {
    const { data } = await client.delete('/api/cache/clear');
    return data;
  },

  // Health
  async health() {
    const { data } = await client.get('/api/health');
    return data;
  },
};

export default api;
