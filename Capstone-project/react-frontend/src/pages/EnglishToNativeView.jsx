import { useState, useCallback } from 'react';
import { useUser } from '@clerk/clerk-react';
import { useApp } from '../context/AppContext';
import {
  ChevronDown, Volume2, Square, Loader2, Languages
} from 'lucide-react';
import * as api from '../services/api';
import { getLabels } from '../services/uiLabels';
import { useSpeech } from '../hooks/useSpeech';

const LANG_LABELS = {
  'hi-IN': 'Hindi', 'bn-IN': 'Bengali', 'ta-IN': 'Tamil', 'te-IN': 'Telugu',
  'ml-IN': 'Malayalam', 'mr-IN': 'Marathi', 'gu-IN': 'Gujarati',
  'kn-IN': 'Kannada', 'pa-IN': 'Punjabi', 'or-IN': 'Odia',
};

const LANG_DOT_COLORS = {
  'hi-IN': '#f97316', 'bn-IN': '#8b5cf6', 'ta-IN': '#ec4899', 'te-IN': '#06b6d4',
  'ml-IN': '#10b981', 'mr-IN': '#f59e0b', 'gu-IN': '#3b82f6',
  'kn-IN': '#ef4444', 'pa-IN': '#84cc16', 'or-IN': '#6366f1',
};

export default function EnglishToNativeView() {
  const { user } = useUser();
  const { state, setField, setFields, showError, TARGET_LANGUAGES } = useApp();
  const L = getLabels(state.uiLanguage);
  const [isTranslating, setIsTranslating] = useState(false);
  const { isPlaying, speak } = useSpeech();
  const doTranslate = useCallback(async (text, lang) => {
    if (!text?.trim()) return;
    setIsTranslating(true);
    try {
      const translated = await api.translateText(text, lang, user?.id || null);
      setFields({ nativeTranslation: translated, rewrittenText: '' });
    } catch (err) {
      showError(err.response?.data?.detail || 'Translation error');
    } finally {
      setIsTranslating(false);
    }
  }, [setFields, showError, user?.id]);

  const handleTranslateClick = () => { doTranslate(state.englishText, state.selectedLanguage); };
  const handleLangChange = (lang) => {
    setField('selectedLanguage', lang);
    if (!state.englishText?.trim()) return;
    doTranslate(state.englishText, lang);
  };

  const handleSpeak = useCallback(() => {
    speak(state.nativeTranslation, state.selectedLanguage);
  }, [speak, state.nativeTranslation, state.selectedLanguage]);

  const langName = LANG_LABELS[state.selectedLanguage] || 'Hindi';
  const dotColor = LANG_DOT_COLORS[state.selectedLanguage] || '#f97316';

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', flexDirection: 'column' }}>
      <div style={{ background: 'var(--surface)', borderBottom: '1px solid rgba(0,0,0,0.06)', padding: '16px 24px' }}>
        <h2 style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--text-ink)', margin: 0 }}>{L.textTranslate}</h2>
        <p style={{ fontSize: '0.8rem', color: 'var(--text-faded)', margin: '2px 0 0' }}>{L.translationsNative}</p>
      </div>

      <div style={{ display: 'flex', flex: 1, padding: '24px', gap: 24, maxWidth: 1200, width: '100%', margin: '0 auto' }} className="flex-col md:flex-row">

        {/* LEFT — English input */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: 'var(--surface)', borderRadius: 'var(--r-xl)', boxShadow: 'var(--shadow-sm)', overflow: 'hidden', border: '2px solid transparent', transition: 'all 0.2s' }}
          onFocusCapture={e => { e.currentTarget.style.borderColor = 'var(--saffron)'; e.currentTarget.style.boxShadow = '0 0 0 4px rgba(232,130,12,0.15)'; }}
          onBlurCapture={e => { e.currentTarget.style.borderColor = 'transparent'; e.currentTarget.style.boxShadow = 'var(--shadow-sm)'; }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '14px 20px', borderBottom: '1px solid rgba(0,0,0,0.06)' }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#22C55E' }} />
            <span style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-ink)' }}>English</span>
          </div>
          <textarea
            value={state.englishText}
            onChange={(e) => setField('englishText', e.target.value)}
            placeholder={L.typeEnglishHere}
            style={{ flex: 1, width: '100%', padding: '20px', fontSize: '1rem', color: 'var(--text-ink)', background: 'transparent', border: 'none', outline: 'none', resize: 'none', lineHeight: 1.8, minHeight: 300, fontFamily: 'var(--font)' }}
          />
          <div style={{ padding: '16px 20px', borderTop: '1px solid rgba(0,0,0,0.06)' }}>
            <button onClick={handleTranslateClick} disabled={!state.englishText?.trim() || isTranslating}
              className="btn-primary" style={{ opacity: (!state.englishText?.trim() || isTranslating) ? 0.4 : 1, cursor: (!state.englishText?.trim() || isTranslating) ? 'not-allowed' : 'pointer' }}>
              {isTranslating ? <><Loader2 style={{ width: 16, height: 16, animation: 'spin 1s linear infinite' }} />{L.translating}</> : <><Languages style={{ width: 16, height: 16 }} />{L.translate}</>}
            </button>
          </div>
        </div>

        {/* RIGHT — Native output */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: 'var(--surface)', borderRadius: 'var(--r-xl)', boxShadow: 'var(--shadow-sm)', overflow: 'hidden', border: '2px solid transparent', transition: 'all 0.2s' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px', borderBottom: '1px solid rgba(0,0,0,0.06)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: dotColor }} />
              <span style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-ink)' }}>{langName}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button onClick={handleSpeak} disabled={!state.nativeTranslation || isTranslating}
                style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#fff', border: '1px solid var(--border-warm)', borderRadius: 'var(--r-pill)', padding: '6px 14px', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-ink)', cursor: 'pointer', boxShadow: 'var(--shadow-sm)', opacity: (!state.nativeTranslation || isTranslating) ? 0.4 : 1 }}>
                {isPlaying ? <><Square style={{ width: 12, height: 12 }} />Stop</> : <><Volume2 style={{ width: 12, height: 12 }} />Speak</>}
              </button>
              <div style={{ position: 'relative' }}>
                <select value={state.selectedLanguage} onChange={(e) => handleLangChange(e.target.value)}
                  style={{ appearance: 'none', background: '#fff', border: '1px solid var(--border-warm)', borderRadius: 'var(--r-pill)', padding: '6px 28px 6px 12px', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-ink)', cursor: 'pointer', boxShadow: 'var(--shadow-sm)' }}>
                  {Object.entries(TARGET_LANGUAGES).map(([name, code]) => (
                    <option key={code} value={code}>{name}</option>
                  ))}
                </select>
                <ChevronDown style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', width: 12, height: 12, color: 'var(--text-faded)', pointerEvents: 'none' }} />
              </div>
            </div>
          </div>

          <div style={{ flex: 1, padding: '20px', overflowY: 'auto', minHeight: 300 }}>
            {isTranslating ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-faded)' }}>
                <Loader2 style={{ width: 16, height: 16, animation: 'spin 1s linear infinite' }} />
                <span style={{ fontSize: '0.9rem' }}>Translating...</span>
              </div>
            ) : state.nativeTranslation ? (
              <p style={{ fontSize: '1rem', color: 'var(--text-ink)', lineHeight: 1.8, whiteSpace: 'pre-wrap', margin: 0 }} className="animate-fade-in-blur">{state.nativeTranslation}</p>
            ) : (
              <p style={{ fontSize: '1rem', color: 'var(--text-faded)', margin: 0 }}>{L.translationAppears}</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
