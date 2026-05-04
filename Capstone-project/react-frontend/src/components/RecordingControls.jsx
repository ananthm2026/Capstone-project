import { useState, useRef, useCallback, useEffect } from 'react';
import { Mic, ChevronLeft, Square, Upload as UploadIcon } from 'lucide-react';
import { useApp } from '../context/AppContext';
import * as api from '../services/api';

export default function RecordingControls() {
  const { state, setField, setFields, setLoading, showError, clearAll } = useApp();
  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);
  const streamRef = useRef(null);
  const fileInputRef = useRef(null);
  const animFrameRef = useRef(null);
  const analyserRef = useRef(null);
  const [recordingTime, setRecordingTime] = useState(0);
  const [bars, setBars] = useState(Array(36).fill(3));

  const stopMediaStream = useCallback(() => {
    if (streamRef.current) { streamRef.current.getTracks().forEach((t) => t.stop()); streamRef.current = null; }
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
  }, []);

  useEffect(() => {
    let interval;
    if (state.isRecording) {
      setRecordingTime(0);
      interval = setInterval(() => setRecordingTime((p) => p + 1), 1000);
    } else {
      setBars(Array(36).fill(3));
    }
    return () => clearInterval(interval);
  }, [state.isRecording]);

  const startWaveform = useCallback((stream) => {
    const ctx = new AudioContext();
    const src = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 128;
    src.connect(analyser);
    analyserRef.current = analyser;
    const data = new Uint8Array(analyser.frequencyBinCount);
    const tick = () => {
      analyser.getByteFrequencyData(data);
      const newBars = Array.from({ length: 36 }, (_, i) => {
        const val = data[Math.floor((i / 36) * data.length)] || 0;
        return Math.max(3, Math.round((val / 255) * 28));
      });
      setBars(newBars);
      animFrameRef.current = requestAnimationFrame(tick);
    };
    tick();
  }, []);

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      startWaveform(stream);
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm')
        ? 'audio/webm'
        : '';
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : {});
      mediaRecorderRef.current = recorder;
      chunksRef.current = [];
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      recorder.start();
      setField('isRecording', true);
    } catch {
      showError('Microphone permission denied.');
    }
  }, [setField, showError, startWaveform]);

  const stopRecordingAndProcess = useCallback(async () => {
    return new Promise((resolve) => {
      const recorder = mediaRecorderRef.current;
      if (!recorder || recorder.state === 'inactive') { resolve(); return; }
      recorder.onstop = async () => {
        setField('isRecording', false);
        stopMediaStream();
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        if (blob.size === 0) { resolve(); return; }
        try {
          setLoading('Transcribing...');
          const result = await api.translateAudioFromBlob(blob);
          setFields({ englishText: result.transcript, nativeTranscript: result.native_transcript || '', confidenceScore: result.confidence ?? null });
          setLoading(null);
        } catch (err) {
          showError(err.response?.data?.detail || err.message);
          setLoading(null);
        }
        resolve();
      };
      recorder.stop();
    });
  }, [setField, setFields, setLoading, showError, stopMediaStream]);

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    e.target.value = '';
    try {
      clearAll();
      setLoading('Transcribing audio file...');
      const result = await api.translateAudioFromBlob(file);
      setFields({ englishText: result.transcript, confidenceScore: result.confidence ?? null });
      setLoading(null);
    } catch (err) {
      showError(err.response?.data?.detail || err.message);
      setLoading(null);
    }
  };

  const handleMainAction = useCallback(async () => {
    if (state.isRecording) {
      await stopRecordingAndProcess();
    } else {
      clearAll();
      await startRecording();
    }
  }, [state.isRecording, startRecording, stopRecordingAndProcess, clearAll]);

  const fmt = (s) => `${Math.floor(s / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`;

  return (
    <>
      <input type="file" ref={fileInputRef} onChange={handleFileUpload} className="hidden" accept="audio/*" />

      {state.isRecording ? (
        /* ── Recording bar ── */
        <div className="flex items-center gap-4 bg-white rounded-2xl px-5 py-3.5 shadow-lg border border-gray-100 w-full max-w-lg">
          {/* Pulse dot */}
          <div className="w-2.5 h-2.5 rounded-full bg-red-500 pulse-recording shrink-0" />
          <span className="text-[13px] font-mono font-semibold text-gray-500 tabular-nums shrink-0">{fmt(recordingTime)}</span>

          {/* Live waveform */}
          <div className="flex items-center gap-[2.5px] flex-1 h-7">
            {bars.map((h, i) => (
              <div
                key={i}
                className="w-[2px] rounded-full bg-gray-800 transition-all duration-75"
                style={{ height: `${h}px` }}
              />
            ))}
          </div>

          {/* Stop */}
          <button
            onClick={handleMainAction}
            className="flex items-center gap-2 bg-red-500 hover:bg-red-600 text-white rounded-xl px-4 py-2 text-[13px] font-semibold transition-colors shrink-0"
          >
            <Square className="w-3 h-3 fill-white" />
            Stop
          </button>
        </div>
      ) : (
        /* ── Default toolbar ── */
        <div className="flex items-center gap-3">
          <div style={{ 
            display: 'flex', 
            alignItems: 'center', 
            gap: '4px', 
            background: 'var(--surface-ink)', 
            borderRadius: 'var(--r-pill)', 
            padding: '8px', 
            boxShadow: '0 10px 30px rgba(28,25,23,0.3)',
            border: '1px solid rgba(255,255,255,0.05)'
          }}>
            {/* Upload Audio */}
            <button
              onClick={() => fileInputRef.current?.click()}
              style={{
                width: '40px',
                height: '40px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'rgba(255,255,255,0.5)',
                background: 'rgba(255,255,255,0.05)',
                border: 'none',
                borderRadius: '50%',
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
              onMouseEnter={e => { e.currentTarget.style.color = '#fff'; e.currentTarget.style.background = 'rgba(255,255,255,0.1)'; }}
              onMouseLeave={e => { e.currentTarget.style.color = 'rgba(255,255,255,0.5)'; e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; }}
              title="Upload Audio"
            >
              <UploadIcon className="w-4 h-4" />
            </button>

            {/* Vertical Divider */}
            <div style={{ width: '1px', height: '24px', background: 'rgba(255,255,255,0.1)', margin: '0 4px' }} />

            {/* Primary action: Start Speaking */}
            <button
              onClick={handleMainAction}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                background: 'transparent',
                color: '#fff',
                padding: '0 24px 0 12px',
                height: '40px',
                borderRadius: 'var(--r-pill)',
                fontSize: '0.95rem',
                fontWeight: 600,
                border: 'none',
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
              onMouseEnter={e => e.currentTarget.style.opacity = '0.8'}
              onMouseLeave={e => e.currentTarget.style.opacity = '1'}
            >
              <Mic style={{ width: '18px', height: '18px', color: 'var(--saffron)' }} />
              Start Speaking
            </button>
          </div>
        </div>
      )}
    </>
  );
}
