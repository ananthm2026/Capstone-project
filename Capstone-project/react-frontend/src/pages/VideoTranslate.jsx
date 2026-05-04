import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Upload, Languages, Loader2, Download, X, Film, CheckCircle, AlertCircle, Copy, Check, ChevronDown, Clock } from 'lucide-react';
import * as api from '../services/api';
import { useApp } from '../context/AppContext';

const TARGET_LANGUAGES = {
  'Hindi': 'hi-IN', 'English': 'en-IN', 'Kannada': 'kn-IN',
  'Tamil': 'ta-IN', 'Telugu': 'te-IN', 'Malayalam': 'ml-IN',
  'Bengali': 'bn-IN', 'Marathi': 'mr-IN', 'Gujarati': 'gu-IN', 'Punjabi': 'pa-IN',
};

const STORAGE_KEY = 'vt_video_job';
const HISTORY_KEY = 'vt_video_history';

function loadSavedJob() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null'); } catch { return null; }
}
function saveJob(data) { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); } catch {} }
function clearJob() { try { localStorage.removeItem(STORAGE_KEY); } catch {} }

function loadHistory() {
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]'); } catch { return []; }
}
function saveHistory(h) { try { localStorage.setItem(HISTORY_KEY, JSON.stringify(h)); } catch {} }

function getLangName(code) {
  return Object.entries(TARGET_LANGUAGES).find(([, v]) => v === code)?.[0] || code;
}

function CopyButton({ text }) {
  const [copied, setCopied] = useState(false);
  return (
    <button onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
      className="flex items-center gap-1 px-2 py-1 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-500 text-[11px] font-medium transition-all">
      {copied ? <><Check className="w-3 h-3 text-green-500" />Copied</> : <><Copy className="w-3 h-3" />Copy</>}
    </button>
  );
}

function HistoryPanel({ onClose, onReuse }) {
  const [history, setHistory] = useState(loadHistory);

  const deleteItem = (id) => {
    const updated = history.filter(h => h.id !== id);
    setHistory(updated);
    saveHistory(updated);
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/20 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-sm bg-white h-full shadow-2xl flex flex-col animate-fade-in-top">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-gray-400" />
            <span className="text-[14px] font-bold text-gray-900">Video History</span>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400"><X className="w-4 h-4" /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {history.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
              <Film className="w-8 h-8 text-gray-200" />
              <p className="text-[13px] text-gray-400">No translated videos yet</p>
            </div>
          ) : history.map(item => (
            <div key={item.id} className="bg-gray-50 rounded-xl border border-gray-100 p-3 group">
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="flex-1 min-w-0">
                  <p className="text-[12px] font-semibold text-gray-700 truncate">{item.filename || 'Video'}</p>
                  <p className="text-[11px] text-gray-400 mt-0.5">
                    {getLangName(item.targetLang)} · {new Date(item.timestamp).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
                <button onClick={() => deleteItem(item.id)} className="p-1.5 rounded-lg hover:bg-red-50 text-gray-300 hover:text-red-400 transition-all shrink-0">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
              {item.transcript && (
                <p className="text-[11px] text-gray-500 line-clamp-2 mb-2">{item.transcript}</p>
              )}
              <div className="flex gap-2">
                <a href={`/api/video/download/${item.videoId}`} download={`translated_${item.videoId}.mp4`}
                  className="flex items-center gap-1 px-2.5 py-1.5 bg-gray-900 text-white rounded-lg text-[11px] font-semibold hover:bg-gray-700 transition-all">
                  <Download className="w-3 h-3" />Download
                </a>
                <button onClick={() => { onReuse(item); onClose(); }}
                  className="flex items-center gap-1 px-2.5 py-1.5 bg-white border border-gray-200 text-gray-600 rounded-lg text-[11px] font-semibold hover:bg-gray-50 transition-all">
                  View
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function VideoTranslate() {
  const navigate = useNavigate();
  const { state } = useApp();
  const saved = loadSavedJob();
  const [step, setStep] = useState(saved?.step ?? 0);
  const [videoFile, setVideoFile] = useState(null);
  const [videoPreviewUrl, setVideoPreviewUrl] = useState(null);
  const [videoId, setVideoId] = useState(saved?.videoId ?? null);
  const [targetLang, setTargetLang] = useState(saved?.targetLang ?? state.selectedLanguage ?? 'hi-IN');
  const [result, setResult] = useState(saved?.result ?? null);
  const [error, setError] = useState('');
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [historyCount, setHistoryCount] = useState(() => loadHistory().length);
  const fileInputRef = useRef(null);

  // Sync when default language changes in Profile (only if no job in progress)
  useEffect(() => {
    if (!saved?.targetLang && step === 0) setTargetLang(state.selectedLanguage);
  }, [state.selectedLanguage]);
  const pollRef = useRef(null);
  const currentFilename = useRef('');

  useEffect(() => {
    if (step === 0) return;
    saveJob({ step, videoId, targetLang, result });
  }, [step, videoId, result]);

  useEffect(() => {
    if (step === 2 && videoId) startPolling(videoId);
    return () => clearInterval(pollRef.current);
  }, []);

  // Save to history when done
  useEffect(() => {
    if (step === 3 && result && videoId) {
      const history = loadHistory();
      const exists = history.find(h => h.videoId === videoId);
      if (!exists) {
        const newEntry = {
          id: Date.now(),
          videoId,
          targetLang,
          filename: currentFilename.current,
          transcript: result.transcript,
          translated_text: result.translated_text,
          timestamp: new Date().toISOString(),
        };
        const updated = [newEntry, ...history].slice(0, 20); // keep last 20
        saveHistory(updated);
        setHistoryCount(updated.length);
      }
    }
  }, [step, result]);

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
        }
      } catch {
        clearInterval(pollRef.current);
        setError('Lost connection while processing.');
        setStep(1);
      }
    }, 3000);
  };

  const SUPPORTED = ['video/mp4', 'video/quicktime', 'video/x-msvideo', 'video/webm', 'video/x-matroska'];

  const loadFile = (file) => {
    if (!file) return;
    if (!SUPPORTED.includes(file.type) && !file.name.match(/\.(mp4|mov|avi|mkv|webm)$/i)) {
      setError('Unsupported format. Use MP4, MOV, AVI, MKV, or WEBM.'); return;
    }
    if (file.size > 200 * 1024 * 1024) { setError('File too large. Maximum 200MB.'); return; }
    setError('');
    currentFilename.current = file.name;
    setVideoFile(file);
    setVideoPreviewUrl(URL.createObjectURL(file));
    setStep(1);
  };

  const handleTranslate = async () => {
    if (!videoFile) return;
    setError('');
    setUploading(true);
    try {
      const uploadRes = await api.uploadVideo(videoFile);
      const vid = uploadRes.video_id;
      setVideoId(vid);
      await api.translateVideo({ video_id: vid, target_language: targetLang, voice_type: 'auto', tone: 'formal' });
      setStep(2);
      setUploading(false);
      startPolling(vid);
    } catch (e) {
      setUploading(false);
      setError(e.response?.data?.detail || e.message || 'Upload failed.');
    }
  };

  const reset = () => {
    clearInterval(pollRef.current);
    clearJob();
    setStep(0); setVideoFile(null); setVideoPreviewUrl(null);
    setVideoId(null); setResult(null); setError('');
    setUploading(false);
  };

  const handleReuse = (item) => {
    setVideoId(item.videoId);
    setTargetLang(item.targetLang);
    setResult({ transcript: item.transcript, translated_text: item.translated_text });
    setStep(3);
  };

  const langName = getLangName(targetLang);

  return (
    <div className="min-h-screen bg-[var(--bg)]">
      {/* Header */}
      <div style={{ background: 'var(--surface)', borderBottom: '1px solid rgba(0,0,0,0.06)', padding: '14px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h2 style={{ fontSize: '1.3rem', fontWeight: 700, color: 'var(--text-ink)', margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Film style={{ width: 20, height: 20, color: 'var(--text-faded)' }} />
            Video Translation
          </h2>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-faded)', margin: '2px 0 0' }}>Upload a video — get it back with translated voice</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button onClick={() => navigate('/app/video-history')}
            style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', background: 'var(--surface)', border: '1px solid rgba(0,0,0,0.08)', borderRadius: 'var(--r-pill)', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-warm)', cursor: 'pointer', boxShadow: 'var(--shadow-sm)' }}>
            <Clock style={{ width: 14, height: 14 }} />
            History
            {historyCount > 0 && (
              <span style={{ position: 'absolute', top: -6, right: -6, width: 18, height: 18, background: 'var(--saffron)', color: '#fff', fontSize: 11, fontWeight: 700, borderRadius: '50%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                {historyCount > 9 ? '9+' : historyCount}
              </span>
            )}
          </button>
          {step > 0 && (
            <button onClick={reset} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', background: 'var(--surface)', border: '1px solid rgba(0,0,0,0.08)', borderRadius: 'var(--r-pill)', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-faded)', cursor: 'pointer' }}>
              <X style={{ width: 14, height: 14 }} />New video
            </button>
          )}
        </div>
      </div>

      <div className="px-4 md:px-8 py-6 max-w-5xl mx-auto">
        {error && (
          <div className="flex items-start gap-3 px-4 py-3 bg-red-50 border border-red-100 rounded-xl text-[13px] text-red-600 mb-4">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />{error}
          </div>
        )}

        {/* Step 0 — Upload */}
        {step === 0 && (
          <div
            onDragOver={e => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={e => { e.preventDefault(); setDragging(false); loadFile(e.dataTransfer.files[0]); }}
            onClick={() => fileInputRef.current?.click()}
            style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, borderRadius: 'var(--r-xl)', border: `2px dashed ${dragging ? '#7C3AED' : 'rgba(99,102,241,0.3)'}`, cursor: 'pointer', padding: '80px 40px', background: dragging ? '#F5F3FF' : 'var(--surface)', boxShadow: 'var(--shadow-sm)', transition: 'all 0.2s' }}>
            <input ref={fileInputRef} type="file" accept="video/mp4,video/quicktime,video/x-msvideo,video/webm,.mp4,.mov,.avi,.mkv,.webm" style={{ display: 'none' }} onChange={e => loadFile(e.target.files[0])} />
            <div style={{ width: 64, height: 64, borderRadius: 18, background: '#EEE8F8', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Upload style={{ width: 24, height: 24, color: '#7C3AED' }} />
            </div>
            <div style={{ textAlign: 'center' }}>
              <p style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-ink)', margin: '0 0 6px' }}>Drop your video here</p>
              <p style={{ fontSize: '0.82rem', color: 'var(--text-faded)', margin: 0 }}>MP4, MOV, AVI, MKV, WEBM · up to 200MB</p>
            </div>
            <button style={{ background: 'var(--saffron)', color: '#fff', borderRadius: 'var(--r-pill)', padding: '10px 24px', fontWeight: 600, fontSize: '0.85rem', border: 'none', boxShadow: 'var(--shadow-saffron)', cursor: 'pointer' }}
              onClick={e => { e.stopPropagation(); fileInputRef.current?.click(); }}>
              or browse files
            </button>
          </div>
        )}

        {/* Step 1 — Configure */}
        {step === 1 && videoPreviewUrl && (
          <div className="space-y-4">
            <div className="bg-black rounded-2xl overflow-hidden shadow-sm">
              <video src={videoPreviewUrl} controls className="w-full max-h-56 object-contain" />
              <div className="px-4 py-2.5 flex items-center gap-2 bg-gray-900">
                <Film className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                <span className="text-[12px] text-gray-300 truncate flex-1">{videoFile?.name}</span>
                <span className="text-[11px] text-gray-500 shrink-0">{(videoFile?.size / (1024*1024)).toFixed(1)} MB</span>
              </div>
            </div>
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-3">Translate to</label>
              <div className="relative">
                <select value={targetLang} onChange={e => setTargetLang(e.target.value)}
                  className="w-full appearance-none bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-[14px] font-semibold text-gray-800 cursor-pointer focus:outline-none focus:border-gray-400 transition-all pr-10">
                  {Object.entries(TARGET_LANGUAGES).map(([name, code]) => (
                    <option key={code} value={code}>{name}</option>
                  ))}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
              </div>
              <p className="text-[11px] text-gray-400 mt-2">Voice gender is auto-detected from the video</p>
            </div>
            <button onClick={handleTranslate} disabled={uploading}
              className="w-full flex items-center justify-center gap-2 bg-gray-900 text-white rounded-2xl py-4 text-[15px] font-bold hover:bg-gray-700 disabled:opacity-40 transition-all active:scale-[0.98]">
              {uploading ? <><Loader2 className="w-4 h-4 animate-spin" />Uploading…</> : <><Languages className="w-5 h-5" />Translate to {langName}</>}
            </button>
          </div>
        )}

        {/* Step 2 — Processing */}
        {step === 2 && (
          <div className="flex flex-col items-center justify-center py-32 gap-6 text-center">
            <div className="flex items-center gap-2">
              {[0, 0.2, 0.4].map(delay => (
                <div key={delay} className="w-2.5 h-2.5 rounded-full bg-gray-900"
                  style={{ animation: `pulse-dot 1.4s ease-in-out ${delay}s infinite` }} />
              ))}
            </div>
            <div>
              <p className="text-[22px] font-bold text-gray-900 tracking-tight">Translating your video</p>
              <p className="text-[13px] text-gray-400 mt-1">You can navigate away — we'll keep processing</p>
            </div>
          </div>
        )}

        {/* Step 3 — Done */}
        {step === 3 && result && (
          <div className="space-y-4">
            <div className="flex items-center gap-2.5 px-4 py-3 bg-green-50 border border-green-100 rounded-xl">
              <CheckCircle className="w-4 h-4 text-green-500 shrink-0" />
              <p className="text-[13px] text-green-700 font-semibold">Translation complete — your video is ready</p>
            </div>

            <div className="flex flex-col lg:flex-row gap-4 items-stretch">
              {/* Left — video */}
              <div className="lg:w-1/2 bg-black rounded-2xl overflow-hidden shadow-lg flex flex-col">
                <video src={`/api/video/download/${videoId}`} controls
                  className="w-full flex-1 object-contain" style={{ minHeight: '240px', maxHeight: '360px' }} />
                <div className="flex items-center justify-between px-4 py-3 bg-gray-900 shrink-0">
                  <span className="text-[12px] text-gray-400 font-medium">Translated · {langName}</span>
                  <a href={`/api/video/download/${videoId}`} download={`translated_${videoId}.mp4`}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white rounded-lg text-[12px] font-semibold transition-all">
                    <Download className="w-3.5 h-3.5" />Download
                  </a>
                </div>
              </div>

              {/* Right — transcripts */}
              {(result.transcript || result.translated_text) && (
                <div className="lg:w-1/2 bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden flex flex-col">
                  {result.transcript && (
                    <div className="p-4 border-b border-gray-100 flex-1 overflow-y-auto">
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Original</p>
                        <CopyButton text={result.transcript} />
                      </div>
                      <p className="text-[13px] text-gray-600 leading-relaxed">{result.transcript}</p>
                    </div>
                  )}
                  {result.translated_text && (
                    <div className="p-4 bg-blue-50/40 flex-1 overflow-y-auto">
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-[10px] font-bold text-blue-400 uppercase tracking-widest">Translated · {langName}</p>
                        <CopyButton text={result.translated_text} />
                      </div>
                      <p className="text-[13px] text-gray-700 leading-relaxed">{result.translated_text}</p>
                    </div>
                  )}
                </div>
              )}
            </div>

            <button onClick={reset} className="w-full py-3 rounded-2xl border border-gray-200 text-[13px] font-semibold text-gray-500 hover:bg-gray-50 transition-all">
              Translate another video
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
