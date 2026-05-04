import { useState, useRef, useEffect, useCallback } from 'react';
import { Mic, MicOff, X, Send, Copy, Check, Loader2, Languages } from 'lucide-react';
import { useApp } from '../context/AppContext';
import * as api from '../services/api';

const LANG_LABELS = {
  'hi-IN': 'Hindi', 'bn-IN': 'Bengali', 'ta-IN': 'Tamil', 'te-IN': 'Telugu',
  'ml-IN': 'Malayalam', 'mr-IN': 'Marathi', 'gu-IN': 'Gujarati',
  'kn-IN': 'Kannada', 'pa-IN': 'Punjabi', 'or-IN': 'Odia',
};

export default function MobileWidget() {
  const { state } = useApp();
  const [open, setOpen] = useState(false);
  const [recording, setRecording] = useState(false);
  const [loading, setLoading] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [translated, setTranslated] = useState('');
  const [typedText, setTypedText] = useState('');
  const [copied, setCopied] = useState(false);
  const [lang, setLang] = useState(state.selectedLanguage || 'hi-IN');
  const [mode, setMode] = useState('speak'); // 'speak' | 'type'
  const [recSecs, setRecSecs] = useState(0);

  const mediaRef = useRef(null);
  const chunksRef = useRef([]);
  const streamRef = useRef(null);
  const timerRef = useRef(null);

  // Sync lang when profile default changes
  useEffect(() => { setLang(state.selectedLanguage); }, [state.selectedLanguage]);

  const startRec = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];
      const mr = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      mr.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      mr.onstop = async () => {
        setLoading(true);
        try {
          const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
          const res = await api.translateAudioFromBlob(blob, 'widget.webm');
          const text = res.transcript?.trim() || '';
          setTranscript(text);
          if (text) {
            const t = await api.translateText(text, lang);
            setTranslated(t);
          }
        } catch { setTranscript('Could not transcribe. Try again.'); }
        setLoading(false);
      };
      mr.start();
      mediaRef.current = mr;
      setRecording(true);
      setRecSecs(0);
      timerRef.current = setInterval(() => setRecSecs(s => s + 1), 1000);
    } catch { alert('Microphone access denied'); }
  }, [lang]);

  const stopRec = useCallback(() => {
    clearInterval(timerRef.current);
    mediaRef.current?.stop();
    streamRef.current?.getTracks().forEach(t => t.stop());
    setRecording(false);
  }, []);

  const handleTranslateText = useCallback(async () => {
    if (!typedText.trim()) return;
    setLoading(true);
    try {
      const t = await api.translateText(typedText.trim(), lang);
      setTranslated(t);
      setTranscript(typedText.trim());
    } catch {}
    setLoading(false);
  }, [typedText, lang]);

  const handleCopy = () => {
    navigator.clipboard.writeText(translated || transcript).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const handleShare = async () => {
    const text = translated || transcript;
    if (!text) return;
    if (navigator.share) {
      await navigator.share({ text }).catch(() => {});
    } else {
      handleCopy();
    }
  };

  const reset = () => {
    setTranscript(''); setTranslated(''); setTypedText('');
  };

  const fmt = s => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

  // Only show on mobile
  return (
    <>
      {/* FAB */}
      <button
        onClick={() => setOpen(true)}
        className="md:hidden fixed bottom-20 right-4 z-[60] w-14 h-14 rounded-full bg-gray-900 text-white shadow-xl flex items-center justify-center active:scale-95 transition-transform"
        aria-label="Open translation widget"
      >
        <Mic className="w-6 h-6" />
      </button>

      {/* Bottom sheet */}
      {open && (
        <div className="md:hidden fixed inset-0 z-[70] flex flex-col justify-end">
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setOpen(false)} />

          {/* Panel */}
          <div className="relative bg-white rounded-t-3xl shadow-2xl flex flex-col max-h-[85vh]" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
            {/* Handle */}
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-10 h-1 rounded-full bg-gray-200" />
            </div>

            {/* Header */}
            <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <Languages className="w-4 h-4 text-gray-500" />
                <span className="text-[14px] font-bold text-gray-900">Quick Translate</span>
              </div>
              <div className="flex items-center gap-2">
                {/* Language selector */}
                <select
                  value={lang}
                  onChange={e => setLang(e.target.value)}
                  className="text-[12px] font-semibold text-gray-600 bg-gray-50 border border-gray-200 rounded-lg px-2 py-1 focus:outline-none"
                >
                  {Object.entries(LANG_LABELS).map(([code, name]) => (
                    <option key={code} value={code}>{name}</option>
                  ))}
                </select>
                <button onClick={() => setOpen(false)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400">
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Mode tabs */}
            <div className="flex gap-1 px-5 pt-3">
              {['speak', 'type'].map(m => (
                <button key={m} onClick={() => { setMode(m); reset(); }}
                  className={`flex-1 py-2 rounded-xl text-[13px] font-semibold transition-all ${mode === m ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-500'}`}>
                  {m === 'speak' ? '🎙 Speak' : '⌨️ Type'}
                </button>
              ))}
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
              {mode === 'speak' ? (
                <>
                  {/* Record button */}
                  <div className="flex flex-col items-center gap-3 py-4">
                    <button
                      onTouchStart={startRec}
                      onTouchEnd={stopRec}
                      onMouseDown={startRec}
                      onMouseUp={stopRec}
                      disabled={loading}
                      className={`w-20 h-20 rounded-full flex items-center justify-center shadow-lg transition-all active:scale-95 ${
                        recording ? 'bg-red-500 animate-pulse' : 'bg-gray-900'
                      } disabled:opacity-40`}
                    >
                      {recording ? <MicOff className="w-8 h-8 text-white" /> : <Mic className="w-8 h-8 text-white" />}
                    </button>
                    <p className="text-[12px] text-gray-400 font-medium">
                      {recording ? `Recording… ${fmt(recSecs)}` : 'Hold to record, release to translate'}
                    </p>
                  </div>
                </>
              ) : (
                <div className="space-y-2">
                  <textarea
                    value={typedText}
                    onChange={e => setTypedText(e.target.value)}
                    placeholder="Type in English…"
                    rows={3}
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl text-[14px] resize-none focus:outline-none focus:border-gray-400"
                  />
                  <button
                    onClick={handleTranslateText}
                    disabled={!typedText.trim() || loading}
                    className="w-full py-3 bg-gray-900 text-white rounded-xl text-[14px] font-semibold disabled:opacity-40 flex items-center justify-center gap-2"
                  >
                    {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Languages className="w-4 h-4" />}
                    Translate to {LANG_LABELS[lang]}
                  </button>
                </div>
              )}

              {/* Loading */}
              {loading && (
                <div className="flex items-center gap-2 text-gray-400 text-[13px]">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Translating…
                </div>
              )}

              {/* Results */}
              {transcript && !loading && (
                <div className="space-y-3">
                  <div className="bg-gray-50 rounded-xl p-4 border border-gray-100">
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Original</p>
                    <p className="text-[14px] text-gray-700 leading-relaxed">{transcript}</p>
                  </div>
                  {translated && (
                    <div className="bg-amber-50 rounded-xl p-4 border border-amber-100">
                      <p className="text-[10px] font-bold text-amber-500 uppercase tracking-widest mb-1">{LANG_LABELS[lang]}</p>
                      <p className="text-[14px] text-gray-800 leading-relaxed">{translated}</p>
                    </div>
                  )}
                  {/* Actions */}
                  <div className="flex gap-2">
                    <button onClick={handleCopy}
                      className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-white border border-gray-200 rounded-xl text-[13px] font-semibold text-gray-600 active:bg-gray-50">
                      {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                      {copied ? 'Copied' : 'Copy'}
                    </button>
                    <button onClick={handleShare}
                      className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-gray-900 rounded-xl text-[13px] font-semibold text-white active:bg-gray-700">
                      <Send className="w-4 h-4" />
                      Share
                    </button>
                    <button onClick={reset}
                      className="px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-[13px] font-semibold text-gray-400 active:bg-gray-50">
                      Clear
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
