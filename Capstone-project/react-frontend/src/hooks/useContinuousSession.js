import { useRef, useState, useCallback, useEffect } from 'react';
import * as api from '../services/api';

const CHUNK_MS = 5000;

// ── Module-level singleton — survives component unmount/remount ───────────────
const _session = {
  state: 'idle',        // idle | listening | paused | ended
  lines: [],
  segments: [],
  targetLang: localStorage.getItem('defaultLanguage') || 'hi-IN',
  stream: null,
  audioCtx: null,
  mediaRecorder: null,
  chunkTimer: null,
  animFrame: null,
  chunks: [],
  amplitude: 0,
  listeners: new Set(),
};

function notify() {
  _session.listeners.forEach(fn => fn({ ..._session }));
}

function stopMicHard() {
  if (_session.mediaRecorder?.state === 'recording') {
    _session.mediaRecorder.onstop = null; // prevent stale chunk processing
    _session.mediaRecorder.stop();
  }
  _session.stream?.getTracks().forEach(t => t.stop());
  _session.stream = null;
  clearInterval(_session.chunkTimer);
  _session.chunkTimer = null;
  cancelAnimationFrame(_session.animFrame);
  _session.animFrame = null;
  _session.audioCtx?.close().catch(() => {});
  _session.audioCtx = null;
  _session.amplitude = 0;
}

async function processChunk(blob, incrementUsage) {
  if (blob.size < 800) return;
  const id = Date.now() + Math.random();
  _session.lines = [..._session.lines, { id, text: '', translation: '', processing: true }];
  notify();
  try {
    const stt = await api.translateAudioFromBlob(blob, 'chunk.webm');
    const text = stt.transcript?.trim();
    if (!text) {
      _session.lines = _session.lines.filter(l => l.id !== id);
      notify();
      return;
    }
    let translation = text;
    // Only translate if target lang is not English
    if (_session.targetLang && _session.targetLang !== 'en-IN' && _session.targetLang !== 'en') {
      try {
        translation = await api.translateText(text, _session.targetLang);
      } catch (e) {
        console.warn('[session] translation failed, showing original:', e?.response?.data?.detail || e.message);
        translation = text; // fallback to original
      }
    }
    _session.lines = _session.lines.map(l =>
      l.id === id ? { id, text, translation, processing: false } : l
    );
    incrementUsage?.('sarvamCalls');
  } catch (e) {
    console.error('[session] chunk processing failed:', e?.response?.data?.detail || e.message);
    _session.lines = _session.lines.filter(l => l.id !== id);
  }
  notify();
}

function startChunkRecorder(stream, incrementUsage) {
  _session.chunks = [];
  const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : 'audio/webm';
  const mr = new MediaRecorder(stream, { mimeType: mime });
  _session.mediaRecorder = mr;
  mr.ondataavailable = e => { if (e.data.size > 0) _session.chunks.push(e.data); };
  mr.onstop = () => processChunk(new Blob(_session.chunks, { type: 'audio/webm' }), incrementUsage);
  mr.start();
}

async function initMic(onAmplitude) {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  _session.stream = stream;
  const ctx = new AudioContext();
  _session.audioCtx = ctx;
  const src = ctx.createMediaStreamSource(stream);
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 256;
  src.connect(analyser);
  const data = new Uint8Array(analyser.frequencyBinCount);
  const tick = () => {
    analyser.getByteFrequencyData(data);
    _session.amplitude = data.reduce((a, b) => a + b, 0) / data.length;
    onAmplitude?.(_session.amplitude);
    _session.animFrame = requestAnimationFrame(tick);
  };
  _session.animFrame = requestAnimationFrame(tick);
  return stream;
}

function startChunking(stream, incrementUsage) {
  startChunkRecorder(stream, incrementUsage);
  _session.chunkTimer = setInterval(() => {
    if (_session.mediaRecorder?.state === 'recording') {
      _session.mediaRecorder.stop();
      setTimeout(() => {
        if (_session.stream) startChunkRecorder(_session.stream, incrementUsage);
      }, 150);
    }
  }, CHUNK_MS);
}

// ── Public API ────────────────────────────────────────────────────────────────
export async function sessionStart(incrementUsage) {
  if (_session.state === 'listening') return;
  const stream = await initMic((amp) => { _session.amplitude = amp; notify(); });
  startChunking(stream, incrementUsage);
  _session.state = 'listening';
  notify();
}

export async function sessionResume(incrementUsage) {
  if (_session.state === 'listening') return;
  const stream = await initMic((amp) => { _session.amplitude = amp; notify(); });
  startChunking(stream, incrementUsage);
  _session.state = 'listening';
  notify();
}

export function sessionPause() {
  if (_session.mediaRecorder?.state === 'recording') _session.mediaRecorder.stop();
  clearInterval(_session.chunkTimer);
  cancelAnimationFrame(_session.animFrame);
  _session.stream?.getTracks().forEach(t => t.stop());
  _session.stream = null;
  _session.amplitude = 0;
  _session.state = 'paused';
  notify();
}

export async function sessionEnd(showError) {
  stopMicHard();
  _session.state = 'ended';
  notify();
  const combinedTranscript = _session.lines
    .filter(l => !l.processing && l.text).map(l => l.text).join(' ');
  if (!combinedTranscript.trim()) return;
  try {
    const result = await api.diarizeAudio(null, 'session.webm', 0, combinedTranscript);
    _session.segments = result.segments || [];
    notify();
  } catch (e) {
    showError?.(e.response?.data?.detail || 'Speaker detection failed');
  }
}

export function sessionClear() {
  stopMicHard();
  _session.state = 'idle';
  _session.lines = [];
  _session.segments = [];
  _session.amplitude = 0;
  notify();
}

export function sessionSetLang(lang) {
  _session.targetLang = lang;
}

export function getSessionSnapshot() {
  return { ..._session };
}

// ── React hook — subscribes to singleton, survives navigation ─────────────────
export function useContinuousSession() {
  const [snap, setSnap] = useState(() => ({ ..._session }));
  const ampRef = useRef(0);

  useEffect(() => {
    const handler = (s) => setSnap({ ...s });
    _session.listeners.add(handler);
    // Sync immediately on mount (in case session is already running)
    setSnap({ ..._session });
    return () => {
      _session.listeners.delete(handler);
      // Do NOT stop the session on unmount — that's the whole point
    };
  }, []);

  return snap;
}
