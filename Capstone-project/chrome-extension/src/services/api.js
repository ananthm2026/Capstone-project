import axios from 'axios';

const API = axios.create({
  baseURL: (typeof process !== 'undefined' && process.env?.VITE_API_URL)
    ? process.env.VITE_API_URL + '/api'
    : 'https://saaras-backend.onrender.com/api',
  timeout: 120000,
});

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
  return data.transcript;
};

export const rewriteTone = async (text, tone, userOverride = null) => {
  const { data } = await API.post('/rewrite-tone', {
    text,
    tone,
    user_override: userOverride,
  });
  return data.rewritten_text;
};

export const translateText = async (text, targetLanguage) => {
  const { data } = await API.post('/translate-text', {
    text,
    target_language: targetLanguage,
  });
  return data.translated_text;
};

export const textToSpeech = async (text, language, useSarvam = false) => {
  const { data } = await API.post(
    '/text-to-speech',
    { text, language, use_sarvam: useSarvam },
    { responseType: 'blob' }
  );
  return data;
};

export const sendEmail = async ({ text, toEmail, subject, tone, language }) => {
  const { data } = await API.post('/send/email', {
    text,
    to_email: toEmail,
    subject,
    tone,
    language,
    use_sendgrid: false,
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
