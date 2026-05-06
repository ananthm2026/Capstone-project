import { useState, useRef, useEffect } from 'react';
import { Upload, Languages, Loader2, Download, X, Film, CheckCircle, AlertCircle, ChevronDown, Subtitles, FileText } from 'lucide-react';
import * as api from '../services/api';
import { useApp } from '../context/AppContext';

const LANGUAGES = {
  'Hindi': 'hi-IN', 'English': 'en-IN', 'Kannada': 'kn-IN',
  'Tamil': 'ta-IN', 'Telugu': 'te-IN', 'Malayalam': 'ml-IN',
  'Bengali': 'bn-IN', 'Marathi': 'mr-IN', 'Gujarati': 'gu-IN', 'Punjabi': 'pa-IN',
};

function getLangName(code) {
  return Object.entries(LANGUAGES).find(([, v]) => v === code)?.[0] || code;
}

const STEPS = ['Upload', 'Configure', 'Processing', 'Done'];

export default function VideoTranslate() {
  const { state } = useApp();
  const [step, setStep] = useState(0);
  const [videoFile, setVideoFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [videoId, setVideoId] = useState(null);
  const [targetLang, setTargetLang] = useState(state.selectedLanguage || 'hi-IN');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [progress, setProgress] = useState('Uploading video…');
  const fileInputRef = useRef(null);
  const pollRef = useRef(null);

  useEffect(() => () => clearInterval(pollRef.current), []);

  const SUPPORTED_TYPES = ['video/mp4', 'video/quicktime', 'video/x-msvideo', 'video/webm', 'video/x-matroska'];

  const loadFile = (file) => {
    if (!file) return;
    const validType = SUPPORTED_TYPES.includes(file.type) || /\.(mp4|mov|avi|mkv|webm)$/i.test(file.name);
    if (!validType) { setError('Unsupported format. Use MP4, MOV, AVI, MKV, or WEBM.'); return; }
    if (file.size > 200 * 1024 * 1024) { setError('File too large. Maximum 200MB.'); return; }
    setError('');
    setVideoFile(file);
    setPreviewUrl(URL.createObjectURL(file));
    setStep(1);
  };

  const startPolling = (vid) => {
    clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      try {
        const status = await api.getVideoStatus(vid);
        if (status.status === 'done') {
          clearInterval(pollRef.current);
          setResult(status);
          setStep(3);
        } else if (status.status === 'error') {
          clearInterval(pollRef.current);
          setError(status.error || 'Processing failed.');
          setStep(1);
        } else {
          setProgress('Generating subtitles… this may take a few minutes');
        }
      } catch {
        clearInterval(pollRef.current);
        setError('Lost connection while processing.');
        setStep(1);
      }
    }, 4000);
  };

  const handleGenerate = async () => {
    if (!videoFile) return;
    setError('');
    setUploading(true);
    setProgress('Uploading video…');
    try {
      const upload = await api.uploadVideo(videoFile);
      const vid = upload.video_id;
      setVideoId(vid);
      setProgress('Starting subtitle generation…');
      await api.generateSubtitles({ video_id: vid, target_language: targetLang });
      setStep(2);
      setUploading(false);
      setProgress('Transcribing audio in chunks…');
      startPolling(vid);
    } catch (e) {
      setUploading(false);
      setError(e.response?.data?.detail || e.message || 'Failed to start processing.');
    }
  };

  const reset = () => {
    clearInterval(pollRef.current);
    setStep(0); setVideoFile(null); setPreviewUrl(null);
    setVideoId(null); setResult(null); setError(''); setUploading(false);
  };

  const [vttBlobUrl, setVttBlobUrl] = useState(null);
  const BASE = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000';

  // Fetch VTT as blob URL when result is ready (solves CORS for <track>)
  useEffect(() => {
    if (step !== 3 || !videoId) return;
    fetch(`${BASE}/api/video/vtt/${videoId}`)
      .then(r => r.text())
      .then(text => {
        const blob = new Blob([text], { type: 'text/vtt' });
        setVttBlobUrl(URL.createObjectURL(blob));
      })
      .catch(() => {});
    return () => { if (vttBlobUrl) URL.revokeObjectURL(vttBlobUrl); };
  }, [step, videoId]);

  const langName = getLangName(targetLang);
  const downloadUrl = `${BASE}/api/video/download/${videoId}`;
  const srtUrl = `${BASE}/api/video/srt/${videoId}`;

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg)' }}>
      {/* Header */}
      <div style={{ background: 'var(--surface)', borderBottom: '1px solid rgba(0,0,0,0.06)', padding: '14px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h2 style={{ fontSize: '1.3rem', fontWeight: 700, color: 'var(--text-ink)', margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Film style={{ width: 20, height: 20, color: 'var(--text-faded)' }} />
            Video Subtitles
          </h2>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-faded)', margin: '2px 0 0' }}>
            Upload a video — get subtitles burned in your language
          </p>
        </div>
        {step > 0 && (
          <button onClick={reset} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', background: 'var(--surface)', border: '1px solid rgba(0,0,0,0.08)', borderRadius: 'var(--r-pill)', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-faded)', cursor: 'pointer' }}>
            <X style={{ width: 14, height: 14 }} />New video
          </button>
        )}
      </div>

      {/* Step indicator */}
      <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid rgba(0,0,0,0.06)', background: 'var(--surface)', padding: '0 24px' }}>
        {STEPS.map((s, i) => (
          <div key={s} style={{ padding: '10px 16px', fontSize: '0.75rem', fontWeight: 600, color: i === step ? 'var(--saffron)' : i < step ? 'var(--text-faded)' : 'var(--text-faded)', borderBottom: i === step ? '2px solid var(--saffron)' : '2px solid transparent', opacity: i > step ? 0.4 : 1 }}>
            {i < step ? '✓ ' : ''}{s}
          </div>
        ))}
      </div>

      <div style={{ maxWidth: 760, margin: '0 auto', padding: '24px 16px' }}>
        {error && (
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '12px 16px', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 12, color: '#DC2626', fontSize: '0.82rem', marginBottom: 16 }}>
            <AlertCircle style={{ width: 16, height: 16, flexShrink: 0, marginTop: 1 }} />
            {error}
          </div>
        )}

        {/* Step 0 — Upload */}
        {step === 0 && (
          <div
            onDragOver={e => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={e => { e.preventDefault(); setDragging(false); loadFile(e.dataTransfer.files[0]); }}
            onClick={() => fileInputRef.current?.click()}
            style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              gap: 20, padding: '80px 40px', borderRadius: 20,
              border: `2px dashed ${dragging ? 'var(--saffron)' : 'rgba(232,130,12,0.3)'}`,
              background: dragging ? 'rgba(232,130,12,0.04)' : 'var(--surface)',
              cursor: 'pointer', transition: 'all 0.2s',
            }}
          >
            <input ref={fileInputRef} type="file" accept="video/mp4,video/quicktime,video/x-msvideo,video/webm,.mp4,.mov,.avi,.mkv,.webm" style={{ display: 'none' }} onChange={e => loadFile(e.target.files[0])} />
            <div style={{ width: 72, height: 72, borderRadius: 20, background: 'rgba(232,130,12,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Upload style={{ width: 28, height: 28, color: 'var(--saffron)' }} />
            </div>
            <div style={{ textAlign: 'center' }}>
              <p style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-ink)', margin: '0 0 6px' }}>Drop your video here</p>
              <p style={{ fontSize: '0.82rem', color: 'var(--text-faded)', margin: 0 }}>MP4, MOV, AVI, MKV, WEBM · up to 200MB</p>
            </div>
            <button
              style={{ background: 'var(--saffron)', color: '#fff', borderRadius: 'var(--r-pill)', padding: '10px 28px', fontWeight: 600, fontSize: '0.85rem', border: 'none', cursor: 'pointer', boxShadow: '0 4px 14px rgba(232,130,12,0.35)' }}
              onClick={e => { e.stopPropagation(); fileInputRef.current?.click(); }}
            >
              Browse files
            </button>
          </div>
        )}

        {/* Step 1 — Configure */}
        {step === 1 && previewUrl && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Video preview */}
            <div style={{ background: '#000', borderRadius: 16, overflow: 'hidden' }}>
              <video src={previewUrl} controls style={{ width: '100%', maxHeight: 260, objectFit: 'contain', display: 'block' }} />
              <div style={{ padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 8 }}>
                <Film style={{ width: 14, height: 14, color: '#9CA3AF', flexShrink: 0 }} />
                <span style={{ fontSize: '0.75rem', color: '#D1D5DB', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{videoFile?.name}</span>
                <span style={{ fontSize: '0.7rem', color: '#6B7280', flexShrink: 0 }}>{(videoFile?.size / (1024 * 1024)).toFixed(1)} MB</span>
              </div>
            </div>

            {/* Language picker */}
            <div style={{ background: 'var(--surface)', borderRadius: 16, border: '1px solid rgba(0,0,0,0.06)', padding: 20 }}>
              <label style={{ display: 'block', fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-faded)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>
                Subtitle language
              </label>
              <div style={{ position: 'relative' }}>
                <select
                  value={targetLang}
                  onChange={e => setTargetLang(e.target.value)}
                  style={{ width: '100%', appearance: 'none', background: 'rgba(0,0,0,0.03)', border: '1px solid rgba(0,0,0,0.1)', borderRadius: 12, padding: '12px 40px 12px 16px', fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-ink)', cursor: 'pointer', outline: 'none' }}
                >
                  {Object.entries(LANGUAGES).map(([name, code]) => (
                    <option key={code} value={code}>{name}</option>
                  ))}
                </select>
                <ChevronDown style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', width: 16, height: 16, color: 'var(--text-faded)', pointerEvents: 'none' }} />
              </div>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-faded)', marginTop: 8 }}>
                Audio will be transcribed and subtitles burned into the video
              </p>
            </div>

            <button
              onClick={handleGenerate}
              disabled={uploading}
              style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, background: uploading ? '#6B7280' : 'var(--saffron)', color: '#fff', border: 'none', borderRadius: 16, padding: '16px 0', fontSize: '0.95rem', fontWeight: 700, cursor: uploading ? 'not-allowed' : 'pointer', boxShadow: uploading ? 'none' : '0 4px 20px rgba(232,130,12,0.4)', transition: 'all 0.2s' }}
            >
              {uploading
                ? <><Loader2 style={{ width: 18, height: 18, animation: 'spin 1s linear infinite' }} />Uploading…</>
                : <><Languages style={{ width: 18, height: 18 }} />Generate {langName} Subtitles</>
              }
            </button>
          </div>
        )}

        {/* Step 2 — Processing */}
        {step === 2 && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '80px 20px', gap: 28, textAlign: 'center' }}>
            <div style={{ width: 72, height: 72, borderRadius: '50%', background: 'rgba(232,130,12,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Loader2 style={{ width: 32, height: 32, color: 'var(--saffron)', animation: 'spin 1s linear infinite' }} />
            </div>
            <div>
              <p style={{ fontSize: '1.3rem', fontWeight: 700, color: 'var(--text-ink)', margin: '0 0 8px' }}>Generating subtitles</p>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-faded)', margin: 0 }}>{progress}</p>
            </div>
            <div style={{ background: 'var(--surface)', borderRadius: 14, border: '1px solid rgba(0,0,0,0.06)', padding: '16px 24px', maxWidth: 400 }}>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-faded)', margin: 0, lineHeight: 1.6 }}>
                🎙 Transcribing audio in chunks<br />
                🌐 Translating to <strong>{langName}</strong><br />
                🎬 Burning subtitles into video
              </p>
            </div>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-faded)' }}>This takes 1–3 minutes depending on video length</p>
          </div>
        )}

        {/* Step 3 — Done */}
        {step === 3 && result && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Success banner */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: 12 }}>
              <CheckCircle style={{ width: 16, height: 16, color: '#16A34A', flexShrink: 0 }} />
              <p style={{ fontSize: '0.85rem', color: '#15803D', fontWeight: 600, margin: 0 }}>
                Subtitles generated — {result.segment_count} subtitle segments in {langName}
              </p>
            </div>

            {/* Video player */}
            <div style={{ background: '#000', borderRadius: 16, overflow: 'hidden' }}>
              <video
                src={downloadUrl}
                controls
                crossOrigin="anonymous"
                style={{ width: '100%', maxHeight: 380, objectFit: 'contain', display: 'block' }}
              >
                {vttBlobUrl && (
                  <track kind="subtitles" src={vttBlobUrl} srcLang={targetLang.split('-')[0]} label={langName} default />
                )}
              </video>
              <div style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <span style={{ fontSize: '0.75rem', color: '#9CA3AF', fontWeight: 500 }}>
                  Subtitles burned in · {langName}
                </span>
                <div style={{ display: 'flex', gap: 8 }}>
                  <a
                    href={srtUrl}
                    download={`subtitles_${videoId}.srt`}
                    style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', background: 'rgba(255,255,255,0.1)', color: '#fff', borderRadius: 8, fontSize: '0.75rem', fontWeight: 600, textDecoration: 'none' }}
                  >
                    <FileText style={{ width: 13, height: 13 }} />SRT
                  </a>
                  <a
                    href={downloadUrl}
                    download={`subtitled_${videoId}.mp4`}
                    style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', background: 'var(--saffron)', color: '#fff', borderRadius: 8, fontSize: '0.75rem', fontWeight: 600, textDecoration: 'none' }}
                  >
                    <Download style={{ width: 13, height: 13 }} />Download
                  </a>
                </div>
              </div>
            </div>

            {/* Transcript */}
            {(result.transcript || result.translated_text) && (
              <div style={{ background: 'var(--surface)', borderRadius: 16, border: '1px solid rgba(0,0,0,0.06)', overflow: 'hidden' }}>
                {result.transcript && (
                  <div style={{ padding: '14px 16px', borderBottom: '1px solid rgba(0,0,0,0.05)' }}>
                    <p style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-faded)', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 6px' }}>Original transcript</p>
                    <p style={{ fontSize: '0.82rem', color: 'var(--text-warm)', lineHeight: 1.6, margin: 0 }}>{result.transcript}</p>
                  </div>
                )}
                {result.translated_text && (
                  <div style={{ padding: '14px 16px' }}>
                    <p style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--saffron)', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 6px' }}>{langName} subtitles</p>
                    <p style={{ fontSize: '0.82rem', color: 'var(--text-ink)', lineHeight: 1.6, margin: 0 }}>{result.translated_text}</p>
                  </div>
                )}
              </div>
            )}

            <button
              onClick={reset}
              style={{ width: '100%', padding: '14px 0', borderRadius: 14, border: '1px solid rgba(0,0,0,0.08)', background: 'var(--surface)', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-faded)', cursor: 'pointer' }}
            >
              Translate another video
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
