import { useState, useRef, useCallback, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import * as api from '../services/api';
import {
  useContinuousSession,
  sessionStart, sessionResume, sessionPause, sessionEnd,
  sessionClear, sessionSetLang,
} from '../hooks/useContinuousSession';
import {
  Mic, Square, Loader2, Pause, Play, Volume2, ChevronDown, StopCircle
} from 'lucide-react';

const CHUNK_MS = 5000;
const LANGS = [['Hindi','hi-IN'],['Kannada','kn-IN'],['Tamil','ta-IN'],['Telugu','te-IN'],['Malayalam','ml-IN'],['Bengali','bn-IN'],['English','en-IN']];
const MALE_VOICES = ['abhilash','karun','arvind','amol'];

export default function ContinuousListening() {
  const { state, showError, incrementUsage } = useApp();

  const session = useContinuousSession();
  const { state: sessionState, lines, amplitude, targetLang } = session;

  useEffect(() => {
    if (sessionState === 'idle') sessionSetLang(state.selectedLanguage);
  }, [state.selectedLanguage]);

  const [isSynthesizing, setIsSynthesizing] = useState(false);
  const [synthLines,     setSynthLines]     = useState([]);
  const [playingIdx,     setPlayingIdx]     = useState(null);
  const [speakingLineId, setSpeakingLineId] = useState(null);
  const audioRef  = useRef(null);
  const boxEndRef = useRef(null);

  const isActive = sessionState === 'listening';
  const isPaused = sessionState === 'paused';
  const isEnded  = sessionState === 'ended';
  const isIdle   = sessionState === 'idle';

  const canGenerate = isEnded && lines.filter(l => !l.processing && l.text).length > 0;

  useEffect(() => { boxEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [lines]);

  const handleStart = useCallback(async () => {
    try { await sessionStart(incrementUsage); }
    catch { showError('Microphone access denied'); }
  }, [incrementUsage, showError]);

  const handlePause  = useCallback(() => sessionPause(), []);

  const handleResume = useCallback(async () => {
    try { await sessionResume(incrementUsage); }
    catch { showError('Microphone access denied'); }
  }, [incrementUsage, showError]);

  const handleEnd    = useCallback(() => sessionEnd(), []);

  const handleClear  = useCallback(() => {
    sessionClear();
    setSynthLines([]);
    setPlayingIdx(null);
  }, []);

  const handleLangChange = useCallback((lang) => sessionSetLang(lang), []);

  const lineAudioRef = useRef(null);

  const handleSpeakLine = useCallback(async (item) => {
    if (speakingLineId === item.id) {
      lineAudioRef.current?.pause();
      lineAudioRef.current = null;
      setSpeakingLineId(null);
      return;
    }
    lineAudioRef.current?.pause();
    lineAudioRef.current = null;
    setSpeakingLineId(item.id);
    try {
      const voice = state.selectedSarvamVoice || 'anushka';
      const blob = await api.textToSpeech(item.text, 'en-IN', voice, true);
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      lineAudioRef.current = audio;
      audio.onended = () => { setSpeakingLineId(null); URL.revokeObjectURL(url); };
      audio.onerror = () => { setSpeakingLineId(null); URL.revokeObjectURL(url); };
      audio.play();
    } catch { setSpeakingLineId(null); }
  }, [speakingLineId]);

  const handleSynthesize = async () => {
    const src = lines.filter(l => !l.processing && l.text);
    if (!src.length) return;
    setIsSynthesizing(true); setSynthLines([]);
    try {
      const voice  = state.selectedSarvamVoice || 'anushka';
      const gender = MALE_VOICES.includes(voice) ? 'male' : 'female';
      const mapped = src.map(l => ({
        speaker:         'Person 1',
        text:            l.text,
        translated_text: l.text,
        emotion:         'neutral',
        voice:           { sarvam: voice, gtts_gender: gender },
      }));
      const result = await api.synthesizeConversation({ segments: mapped, target_language: 'en-IN' });
      setSynthLines(result.segments || []);
    } catch (e) { showError(e.response?.data?.detail || 'Synthesis failed'); }
    finally { setIsSynthesizing(false); }
  };

  const playSegment = (idx) => {
    const seg = synthLines[idx];
    if (!seg?.audio) return;
    audioRef.current?.pause();
    const audio = new Audio(`data:audio/wav;base64,${seg.audio}`);
    audioRef.current = audio;
    setPlayingIdx(idx);
    audio.onended = () => { setPlayingIdx(null); if (idx + 1 < synthLines.length) playSegment(idx + 1); };
    audio.play();
  };
  const stopPlayback = () => { audioRef.current?.pause(); audioRef.current = null; setPlayingIdx(null); };

  const bars = Array.from({ length: 32 }, (_, i) =>
    isActive ? Math.max(3, Math.min(28, amplitude * (0.35 + Math.sin(i * 0.9) * 0.35))) : 3
  );

  const voiceName = state.selectedSarvamVoice || 'meera';

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: 'var(--bg)' }}>

      {/* ── Top bar ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 20px', background: 'var(--surface)', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 44, height: 44, borderRadius: '50%', background: isActive ? '#EF4444' : 'var(--surface-ink)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: isActive ? '0 4px 12px rgba(239,68,68,0.3)' : 'none', transition: 'all 0.2s' }}>
            <Mic style={{ width: 20, height: 20, color: '#fff' }} />
          </div>
          <div>
            <p style={{ fontFamily: 'var(--font-display)', fontSize: '1.15rem', fontWeight: 500, color: 'var(--text-ink)', margin: 0, letterSpacing: '-0.02em' }}>Live Conversation</p>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-faded)', margin: 0 }}>
              {isActive ? 'Listening & translating…' : isPaused ? 'Paused' : isEnded ? 'Session ended' : 'Ready to start'}
            </p>
          </div>
          {isActive && <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#EF4444', animation: 'pulse-dot 1.4s ease-in-out infinite' }} />}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {/* Language */}
          <div style={{ position: 'relative' }}>
            <select value={targetLang} onChange={e => handleLangChange(e.target.value)} disabled={isActive}
              style={{ appearance: 'none', background: 'var(--surface)', border: '1px solid var(--border-warm)', borderRadius: 'var(--r-pill)', padding: '8px 32px 8px 16px', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-ink)', cursor: 'pointer', boxShadow: 'var(--shadow-sm)', opacity: isActive ? 0.5 : 1 }}>
              {LANGS.map(([n,c]) => <option key={c} value={c}>{n}</option>)}
            </select>
            <ChevronDown style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', width: 12, height: 12, color: 'var(--text-faded)', pointerEvents: 'none' }} />
          </div>

          {/* Active voice badge */}
          <span style={{ fontSize: '0.75rem', color: 'var(--text-faded)', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 'var(--r-pill)', padding: '6px 12px', fontWeight: 600 }}>
            {voiceName}
          </span>

          {canGenerate && (
            <>
              <button onClick={handleSynthesize} disabled={isSynthesizing}
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', background: 'var(--surface-ink)', color: '#fff', borderRadius: 'var(--r-pill)', fontSize: '0.8rem', fontWeight: 600, border: 'none', cursor: 'pointer', opacity: isSynthesizing ? 0.5 : 1 }}>
                {isSynthesizing
                  ? <><Loader2 style={{ width: 12, height: 12, animation: 'spin 1s linear infinite' }} />Generating…</>
                  : <><Volume2 style={{ width: 12, height: 12 }} />Generate voices</>}
              </button>
              {synthLines.length > 0 && (
                <button onClick={() => playingIdx !== null ? stopPlayback() : playSegment(0)}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', background: playingIdx !== null ? '#EF4444' : '#16A34A', color: '#fff', borderRadius: 'var(--r-pill)', fontSize: '0.8rem', fontWeight: 600, border: 'none', cursor: 'pointer' }}>
                  {playingIdx !== null ? <><Square style={{ width: 12, height: 12 }} />Stop</> : <><Play style={{ width: 12, height: 12 }} />Play all</>}
                </button>
              )}
            </>
          )}
          {(isEnded || isPaused) && lines.length > 0 && (
            <button onClick={handleClear} style={{ padding: '8px 14px', borderRadius: 'var(--r-pill)', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-faded)', background: 'none', border: 'none', cursor: 'pointer' }}>Clear</button>
          )}
        </div>
      </div>

      {/* ── Conversation area ── */}
      <div style={{ flex: 1, padding: '16px', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        <div style={{ flex: 1, overflowY: 'auto', background: 'var(--surface)', borderRadius: 'var(--r-xl)', boxShadow: 'var(--shadow-sm)', padding: 16, display: 'flex', flexDirection: 'column', gap: 12, minHeight: 0 }}>

          {lines.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full gap-4 text-center py-20">
              <div className="w-16 h-16 rounded-2xl bg-white border border-gray-100 shadow-sm flex items-center justify-center">
                <Mic className="w-7 h-7 text-gray-300" />
              </div>
              <p className="text-[15px] text-gray-400 font-medium">
                {isIdle ? 'Press Start to begin' : 'Listening…'}
              </p>
            </div>
          )}

          {lines.map((item, i) => {
            if (item.processing) {
              return (
                <div key={item.id} className="flex gap-2.5 items-end">
                  <div className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center shrink-0">
                    <Loader2 className="w-3 h-3 text-gray-400 animate-spin" />
                  </div>
                  <div className="bg-white border border-gray-100 rounded-2xl rounded-bl-sm px-4 py-2.5 shadow-sm">
                    <div className="flex gap-1 items-center h-4">
                      {[0,1,2].map(d => <div key={d} className="w-1.5 h-1.5 rounded-full bg-gray-300 animate-bounce" style={{ animationDelay: `${d*0.15}s` }} />)}
                    </div>
                  </div>
                </div>
              );
            }

            const synthSeg = synthLines[i];
            const isPlay   = playingIdx === i;

            return (
              <div key={item.id || i} className="flex gap-2.5 items-end">
                <div className="w-7 h-7 rounded-full bg-gray-200 flex items-center justify-center shrink-0">
                  <Mic className="w-3 h-3 text-gray-500" />
                </div>
                <div className="max-w-[72%] flex flex-col gap-1 items-start">
                  <div className="bg-white border border-gray-100 text-gray-800 rounded-2xl rounded-bl-sm px-4 py-2.5 shadow-sm">
                    <p className="text-[14px] leading-relaxed">{item.text}</p>
                    {item.translation && item.translation !== item.text && (
                      <p className="text-[12px] mt-1 italic border-t pt-1 text-gray-400 border-gray-100">
                        {item.translation}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button onClick={() => handleSpeakLine(item)}
                      className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold transition-all ${
                        speakingLineId === item.id ? 'bg-red-100 text-red-500' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
                      {speakingLineId === item.id
                        ? <><Square className="w-2.5 h-2.5 fill-red-500" />Stop</>
                        : <><Volume2 className="w-2.5 h-2.5" />Speak</>}
                    </button>
                    {synthSeg?.audio && (
                      <button onClick={() => isPlay ? stopPlayback() : playSegment(i)}
                        className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold transition-all ${
                          isPlay ? 'bg-red-100 text-red-500' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
                        {isPlay ? <><Square className="w-2.5 h-2.5 fill-red-500" />Stop</> : <><Play className="w-2.5 h-2.5 fill-gray-500" />Play</>}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}

          <div ref={boxEndRef} />
        </div>
      </div>

      {/* ── Bottom controls ── */}
      <div style={{ padding: '16px 20px', flexShrink: 0, background: 'transparent' }}>
        {isActive && (
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'center', gap: 2, height: 28, marginBottom: 16 }}>
            {bars.map((h, idx) => (
              <div key={idx} style={{ width: 3, borderRadius: 999, background: 'var(--surface-ink)', height: `${h}px`, transition: 'height 75ms' }} />
            ))}
          </div>
        )}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
          {isIdle && (
            <button onClick={handleStart}
              style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'var(--surface-ink)', color: '#fff', padding: '14px 40px', borderRadius: 'var(--r-pill)', fontSize: '0.95rem', fontWeight: 500, border: 'none', cursor: 'pointer', boxShadow: '0 4px 20px rgba(28,25,23,0.35)', transition: 'all 0.15s' }}
              onMouseEnter={e => { e.currentTarget.style.background = '#2C2520'; e.currentTarget.style.transform = 'translateY(-2px)'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'var(--surface-ink)'; e.currentTarget.style.transform = 'none'; }}>
              <Mic style={{ width: 20, height: 20, color: 'var(--saffron)' }} />Start Listening
            </button>
          )}
          {isActive && (
            <>
              <button onClick={handlePause} style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#F59E0B', color: '#fff', padding: '12px 24px', borderRadius: 'var(--r-pill)', fontSize: '0.9rem', fontWeight: 700, border: 'none', cursor: 'pointer' }}>
                <Pause style={{ width: 16, height: 16 }} />Pause
              </button>
              <button onClick={handleEnd} style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#EF4444', color: '#fff', padding: '12px 24px', borderRadius: 'var(--r-pill)', fontSize: '0.9rem', fontWeight: 700, border: 'none', cursor: 'pointer' }}>
                <StopCircle style={{ width: 16, height: 16 }} />End
              </button>
            </>
          )}
          {isPaused && (
            <>
              <button onClick={handleResume} style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#16A34A', color: '#fff', padding: '12px 24px', borderRadius: 'var(--r-pill)', fontSize: '0.9rem', fontWeight: 700, border: 'none', cursor: 'pointer' }}>
                <Mic style={{ width: 16, height: 16 }} />Resume
              </button>
              <button onClick={handleEnd} style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#EF4444', color: '#fff', padding: '12px 24px', borderRadius: 'var(--r-pill)', fontSize: '0.9rem', fontWeight: 700, border: 'none', cursor: 'pointer' }}>
                <StopCircle style={{ width: 16, height: 16 }} />End
              </button>
            </>
          )}
          {isEnded && (
            <button onClick={handleClear} style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'var(--surface-ink)', color: '#fff', padding: '14px 40px', borderRadius: 'var(--r-pill)', fontSize: '0.95rem', fontWeight: 500, border: 'none', cursor: 'pointer', boxShadow: '0 4px 20px rgba(28,25,23,0.35)', transition: 'all 0.15s' }}>
              <Mic style={{ width: 20, height: 20, color: 'var(--saffron)' }} />New Session
            </button>
          )}
        </div>
        {isActive && <p style={{ textAlign: 'center', fontSize: '0.75rem', color: 'var(--text-faded)', marginTop: 8 }}>Translating every {CHUNK_MS/1000}s · keeps running while you navigate</p>}
      </div>
    </div>
  );
}
