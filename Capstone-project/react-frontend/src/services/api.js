import axios from 'axios';
import { toast } from '../components/Toast';

const API = axios.create({
  baseURL: '/api',
  timeout: 120000,
});

// ── Retry config ──────────────────────────────────────────────────────────────
const RETRY_COUNT   = 2;          // retry up to 2 times (3 total attempts)
const RETRY_DELAY   = 1000;       // 1s base delay, doubles each attempt
const NO_RETRY_CODES = [400, 401, 403, 404, 422]; // don't retry client errors

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// ── Auth token storage ───────────────────────────────────────────────────────
let clerkToken = null;

export const setAuthToken = (token) => {
  clerkToken = token;
  if (token) {
    API.defaults.headers.common['Authorization'] = `Bearer ${token}`;
  } else {
    delete API.defaults.headers.common['Authorization'];
  }
};

function shouldRetry(error) {
  if (!error.response) return true; // network error — always retry
  if (NO_RETRY_CODES.includes(error.response.status)) return false;
  // Never retry health checks — they flood the console when backend is down
  if (error.config?.url?.includes('/health')) return false;
  return true;
}

function friendlyMessage(error) {
  if (!error.response) return 'Network error — check your connection';
  const status = error.response.status;
  const detail = error.response?.data?.detail;
  if (typeof detail === 'string' && detail.trim()) {
    return detail;
  }
  if (status === 503 || status === 502) return 'Server busy, please try again';
  if (status === 504) return 'Request timed out — server is slow';
  if (status === 500) return 'Server error — try again in a moment';
  if (status === 401) return 'Session expired — please log in again';
  if (status === 429) return 'Too many requests — slow down a bit';
  return detail || error.message || 'Something went wrong';
}

// ── Request interceptor: attach auth token ───────────────────────────────────
API.interceptors.request.use((config) => {
  if (clerkToken) {
    config.headers.Authorization = `Bearer ${clerkToken}`;
  }
  // Track retry count on config
  config._retryCount = config._retryCount ?? 0;
  return config;
});

// ── Response interceptor: retry + toast errors ───────────────────────────────
API.interceptors.response.use(
  (response) => response,
  async (error) => {
    const config = error.config;
    if (!config) {
      toast.error('Network error — check your connection');
      return Promise.reject(error);
    }

    // Retry logic
    if (shouldRetry(error) && config._retryCount < RETRY_COUNT) {
      config._retryCount += 1;
      const delay = RETRY_DELAY * config._retryCount;
      await sleep(delay);
      return API(config);
    }

    // All retries exhausted — show toast
    const msg = friendlyMessage(error);
    // Don't toast auth errors (handled by AuthPage itself)
    const isAuthEndpoint = config.url?.includes('/auth/');
    if (!isAuthEndpoint) {
      toast.error(msg);
    }

    return Promise.reject(error);
  }
);

// ── Clerk auth endpoints ──────────────────────────────────────────────────────
export const syncUser = async ({ id, email, first_name, last_name, avatar_url, consent_given = false }) => {
  const { data } = await API.post('/auth/sync-user', {
    id,
    email,
    first_name,
    last_name,
    avatar_url,
    consent_given,
  });
  return data;
};

export const updateConsent = async (consentGiven) => {
  const { data } = await API.patch('/auth/consent', { consent_given: consentGiven });
  return data;
};

export const getMe = async () => {
  const { data } = await API.get('/auth/me');
  return data; // { id, email, first_name, last_name, avatar_url, created_at }
};

export const checkUserExists = async (email) => {
  const { data } = await API.get('/auth/check-user', { params: { email } });
  return data; // { exists: boolean, message: string }
};

export const translateAudio = async (file) => {
  const formData = new FormData();
  formData.append('file', file);
  const { data } = await API.post('/translate-audio', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return data.transcript;
};

export const translateAudioFromBlob = async (blob, filename = 'recording.webm') => {
  const formData = new FormData();
  formData.append('file', blob, filename);
  const { data } = await API.post('/translate-audio', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  // Returns { transcript, confidence } — confidence may be null
  return data;
};

export const rewriteTone = async (text, tone, userOverride = null, customVocabulary = null) => {
  const { data } = await API.post('/rewrite-tone', {
    text,
    tone,
    user_override: userOverride,
    custom_vocabulary: customVocabulary,
  });
  return data.rewritten_text;
};

export const translateText = async (text, targetLanguage, userId = null) => {
  const { data } = await API.post('/translate-text', {
    text,
    target_language: targetLanguage,
    user_id: userId,
  });
  return data.translated_text;
};

// Advanced Gemini translation — returns full analysis object
export const advancedTranslate = async (text, targetLanguage, glossary = null) => {
  const { data } = await API.post('/advanced-translate', {
    text,
    target_language: targetLanguage,
    glossary,
  });
  return data; // { detected_language, domain, tone, has_slang, jargon_terms, final_translation, confidence_score }
};

export const textToSpeech = async (text, language, speaker = 'meera') => {
  const { data } = await API.post(
    '/text-to-speech',
    { text, language, use_sarvam: true, speaker },
    { responseType: 'blob' }
  );
  return data;
};

export const sendEmail = async ({ text, toEmail, subject, tone, language, smtpUsername, smtpPassword }) => {
  const { data } = await API.post('/send/email', {
    text,
    to_email: toEmail,
    subject,
    tone,
    language,
    use_sendgrid: false,
    smtp_username: smtpUsername || undefined,
    smtp_password: smtpPassword || undefined,
  });
  return data;
};

export const sendToSlack = async ({ text, webhookUrl, tone, language }) => {
  const { data } = await API.post('/send/slack', {
    text,
    webhook_url: webhookUrl || null,
    tone,
    language,
    use_api: false,
  });
  return data;
};

export const shareToLinkedIn = async ({ text, tone, language, addHashtags = true }) => {
  const { data } = await API.post('/send/linkedin', {
    text,
    tone,
    language,
    add_hashtags: addHashtags,
    use_mock: true,
  });
  return data;
};

export const getCacheStats = async () => {
  const { data } = await API.get('/cache/stats');
  return data;
};

export const clearCache = async (lang = null) => {
  const params = lang ? `?lang=${lang}` : '';
  const { data } = await API.delete(`/cache/clear${params}`);
  return data;
};

export const analyzeSentiment = async (text) => {
  const { data } = await API.post('/analyze-sentiment', { text });
  return data; // { sentiment, score, summary }
};

export const suggestTone = async (text) => {
  const { data } = await API.post('/suggest-tone', { text });
  return data.suggested_tone;
};

export const exportHistory = async (entries, format = 'csv') => {
  const response = await API.post('/export', { entries, format }, { responseType: 'blob' });
  const url = URL.createObjectURL(response.data);
  const a = document.createElement('a');
  a.href = url;
  a.download = format === 'csv' ? 'transcripts.csv' : 'transcripts.txt';
  a.click();
  URL.revokeObjectURL(url);
};

export const summarizeTranscript = async (text) => {
  const { data } = await API.post('/summarize', { text });
  return data.summary;
};

export const getMeetingNotes = async (text) => {
  const { data } = await API.post('/meeting-notes', { text });
  return data; // { summary, action_items, decisions, attendees, follow_ups }
};

export const askQuestion = async (transcript, question) => {
  const { data } = await API.post('/qa', { transcript, question });
  return data.answer;
};

export const createShareLink = async (text, title = '') => {
  const { data } = await API.post('/share/create', { text, title });
  return data; // { link_id, url }
};

export const pushToTalkTranslate = async (audioBlob, sourceLanguage = 'en-IN', targetLanguage = 'en') => {
  const formData = new FormData();
  formData.append('audio', audioBlob, 'push2talk.webm');
  const { data } = await API.post('/slack/n2e/voice', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    params: {
      source_language: sourceLanguage,
      target_language: targetLanguage,
    },
  });
  return data; // { translation, transcript }
};

export const getShareLink = async (linkId) => {
  const { data } = await API.get(`/share/${linkId}`);
  return data;
};

export const backTranslate = async (text, sourceLang) => {
  const { data } = await API.post('/back-translate', { text, source_lang: sourceLang });
  return data; // { back_translation, accuracy_score, notes }
};

export const getReadability = async (text) => {
  const { data } = await API.post('/readability', { text });
  return data; // { score, grade, label }
};

export const getToneConfidence = async (text, tone) => {
  const { data } = await API.post('/tone-confidence', { text, tone });
  return data; // { score, feedback }
};

export const multiTranslate = async (text, languages) => {
  const { data } = await API.post('/multi-translate', { text, languages });
  return data.translations; // { 'hi-IN': '...', 'ta-IN': '...' }
};

// Health check — resolves true if backend is reachable
export const checkHealth = async () => {
  try {
    await API.get('/health', { timeout: 5000 });
    return true;
  } catch {
    return false;
  }
};

export const visionTranslate = async (imageFile, targetLanguage) => {
  const formData = new FormData();
  formData.append('file', imageFile);
  formData.append('target_language', targetLanguage);
  const { data } = await API.post('/vision-translate', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 60000,
  });
  return data; // { regions: [{original, translated, x, y, w, h, font_size, bg_color, text_color}], count }
};

// --- Native to English Sessions ---

export const saveNativeToEnglishSession = async (sessionData) => {
  const { data } = await API.post('/native-to-english/session', {
    user_id: sessionData.userId,
    original_language: sessionData.originalLanguage,
    original_text: sessionData.originalText,
    translated_text: sessionData.translatedText,
  });
  return data;
};

export const saveNativeToEnglishTranscription = async (transcriptionData) => {
  const { data } = await API.post('/native-to-english/transcription', {
    session_id: transcriptionData.sessionId,
    original_transcript: transcriptionData.originalTranscript,
    tone_applied: transcriptionData.toneApplied,
    rewritten_text: transcriptionData.rewrittenText,
    custom_tone_desc: transcriptionData.customToneDesc,
    confidence_score: transcriptionData.confidenceScore,
  });
  return data;
};

export const getNativeToEnglishSessions = async (userId) => {
  const { data } = await API.get(`/native-to-english/sessions/${userId}`);
  return data;
};

// --- English to Native Sessions ---

export const saveEnglishToNativeSession = async ({ userId, targetLanguage, originalLanguage = 'en-IN' }) => {
  const { data } = await API.post('/english-to-native/session', {
    user_id: userId,
    target_language: targetLanguage,
    original_language: originalLanguage,
  });
  return data; // { status, session_id }
};

export const saveEnglishToNativeTranslation = async ({ sessionId, inputText, translatedText, toneApplied = null, tonedText = null }) => {
  const { data } = await API.post('/english-to-native/translation', {
    session_id: sessionId,
    input_text: inputText,
    translated_text: translatedText,
    tone_applied: toneApplied,
    toned_text: tonedText,
  });
  return data; // { status, translation_id }
};

export const getEnglishToNativeSessions = async (userId) => {
  const { data } = await API.get(`/english-to-native/sessions/${userId}`);
  return data;
};

// ── Video translation ─────────────────────────────────────────────────────────
export const uploadVideo = async (file) => {
  const formData = new FormData();
  formData.append('file', file);
  const { data } = await API.post('/video/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 120000,
  });
  return data; // { video_id, filename, size_kb }
};

export const translateVideo = async ({ video_id, target_language, voice_type, tone }) => {
  const { data } = await API.post('/video/translate', { video_id, target_language, voice_type, tone });
  return data;
};

export const getVideoStatus = async (videoId) => {
  const { data } = await API.get(`/video/status/${videoId}`);
  return data;
};

// ── Diarization ───────────────────────────────────────────────────────────────
export const diarizeAudio = async (blob, filename = 'recording.webm', speakerCount = 0, transcript = '') => {
  const formData = new FormData();
  if (blob) formData.append('file', blob, filename);
  formData.append('speaker_count', String(speakerCount));
  if (transcript) formData.append('transcript', transcript);
  const { data } = await API.post('/diarize-audio', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 120000,
  });
  return data;
};

export const synthesizeConversation = async ({ segments, target_language }) => {
  const { data } = await API.post('/synthesize-conversation', { segments, target_language }, {
    timeout: 180000,
  });
  return data; // { segments: [{speaker, audio (base64), emotion}] }
};
