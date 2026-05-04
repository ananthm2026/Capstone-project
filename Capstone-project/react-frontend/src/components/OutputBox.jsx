import { Volume2, StopCircle, Copy, Check, Trash2 } from 'lucide-react';
import { useRef, useCallback, useState } from 'react';
import { useApp } from '../context/AppContext';
import * as api from '../services/api';

export default function OutputBox({ label, content, language, type }) {
  const { state, setField, setLoading, showError } = useApp();
  const [copied, setCopied] = useState(false);
  const audioRef = useRef(null);

  const playingKey = { english: 'isPlayingEnglish', rewritten: 'isPlayingRewritten', native: 'isPlayingNative' }[type];
  const isPlaying = state[playingKey];

  const handlePlay = useCallback(async () => {
    try {
      if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
      setField(playingKey, true);
      setLoading('Generating speech...');
      const blob = await api.textToSpeech(content, language);
      setLoading(null);
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.onended = () => { setField(playingKey, false); URL.revokeObjectURL(url); };
      audio.play();
    } catch (err) {
      setField(playingKey, false);
      setLoading(null);
      showError(err.response?.data?.detail || 'TTS Error');
    }
  }, [content, language, playingKey, setField, setLoading, showError]);

  const handleStop = useCallback(() => {
    if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
    setField(playingKey, false);
  }, [playingKey, setField]);

  const handleClear = useCallback(() => {
    const key = { english: 'englishText', native: 'nativeTranslation' }[type];
    if (key) setField(key, '');
  }, [type, setField]);

  const copyToClipboard = useCallback(() => {
    navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [content]);

  if (!content) return null;

  return (
    <div>
      {/* Action row */}
      <div className="flex items-center justify-between mb-3">
        {label ? (
          <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest">{label}</span>
        ) : <span />}
        <div className="flex items-center gap-0.5">
          <button onClick={copyToClipboard} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-300 hover:text-gray-600 transition-all" title="Copy">
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
          </button>
          {language && (
            <button onClick={isPlaying ? handleStop : handlePlay} className={`p-1.5 rounded-lg transition-all ${isPlaying ? 'text-red-400 hover:bg-red-50' : 'text-gray-300 hover:text-gray-600 hover:bg-gray-100'}`} title={isPlaying ? 'Stop' : 'Listen'}>
              {isPlaying ? <StopCircle className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
            </button>
          )}
          <button onClick={handleClear} className="p-1.5 rounded-lg hover:bg-red-50 text-gray-300 hover:text-red-400 transition-all" title="Clear">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Text */}
      <p className="text-[15px] text-gray-800 leading-relaxed whitespace-pre-wrap">{content}</p>
    </div>
  );
}
