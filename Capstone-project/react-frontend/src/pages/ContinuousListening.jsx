import { useState, useRef, useCallback, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import * as api from '../services/api';
import {
  useContinuousSession,
  sessionStart, sessionResume, sessionPause, sessionEnd,
  sessionClear, sessionSetLang,
} from '../hooks/useContinuousSession';
import {
  Mic, Square, Loader2, Pause, Play,
  Volume2, ChevronDown, StopCircle
} from 'lucide-react';

const CHUNK_MS = 5000;

const SPEAKER_COLORS = [
  { bg: 'bg-violet-500',  light: 'bg-violet-50 text-violet-900',  text: 'text-violet-500'  },
  { bg: 'bg-sky-500',     light: 'bg-sky-50 text-sky-900',        text: 'text-sky-500'     },
  { bg: 'bg-emerald-500', light: 'bg-emerald-50 text-emerald-900',text: 'text-emerald-500' },
  { bg: 'bg-amber-500',   light: 'bg-amber-50 text-amber-900',    text: 'text-amber-500'   },
  { bg: 'bg-rose-500',    light: 'bg-rose-50 text-rose-900',      text: 'text-rose-500'    },
];

const LANGS = [['Hindi','hi-IN'],['Kannada','kn-IN'],['Tamil','ta-IN'],['Telugu','te-IN'],['Malayalam','ml-IN'],['Bengali','bn-IN'],['English','en-IN']];

export default function ContinuousListening() {
  const { state, showError, incrementUsage } = useApp();

  // Singleton session state — persists across navigation
  const session = useContinuousSession();
  const { state: sessionState, lines, segments, amplitude, targetLang } = session;

  // Sync default language into the session when it changes in Profile
  useEffect(() => {
    if (sessionState === 'idle') sessionSetLang(state.selectedLanguage);
  }, [state.selectedLanguage]);

  const [isDiarizing,    setIsDiarizing]    = useState(false);
  const [isSynthesizing, setIsSynthesizing] = useState(false);
  const [synthSegments,  setSynthSegments]  = useState([]);
  const [playingIdx,     setPlayingIdx]     = useState(null);
  const audioRef  = useRef(null);
  const boxEndRef = useRef(null);

  useEffect(() => { boxEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [lines, segments]);

  const handleStart = useCallback(async () => {
    try { await sessionStart(incrementUsage); }
    catch { showError('Microphone access denied'); }
  }, [incrementUsage, showError]);

  const handlePause = useCallback(() => sessionPause(), []);

  const handleResume = useCallback(async () => {
    try { await sessionResume(incrementUsage); }
    catch { showError('Microphone access denied'); }
  }, [incrementUsage, showError]);

  const handleEnd = useCallback(async () => {
    setIsDiarizing(true);
    await sessionEnd(showError);
    setIsDiarizing(false);
  }, [showError]);

  const handleClear = useCallback(() => {
    sessionClear();
    setSynthSegments([]);
    setPlayingIdx(null);
  }, []);

  const handleLangChange = useCallback((lang) => {
    sessionSetLang(lang);
  }, []);

  const handleSynthesize = async () => {
    const src = segments.length > 0 ? segments : lines.filter(l => !l.processing && l.text);
    if (!src.length) return;
    setIsSynthesizing(true); setSynthSegments([]);
    try {
      const mapped = src.map(s => ({
        speaker: s.speaker || 'Person 1', text: s.text,
        translated_text: s.translation || s.text, emotion: s.emotion || 'neutral',
        voice: s.voice || { sarvam: s.gender === 'female' ? 'anushka' : 'abhilash', gtts_gender: s.gender || 'male' },
      }));
      const result = await api.synthesizeConversation({ segments: mapped, target_language: targetLang });
      setSynthSegments(result.segments || []);
    } catch (e) { showError(e.response?.data?.detail || 'Synthesis failed'); }
    finally { setIsSynthesizing(false); }
  };

  const playSegment = (idx) => {
    const seg = synthSegments[idx];
    if (!seg?.audio) return;
    audioRef.current?.pause();
    const audio = new Audio(`data:audio/wav;base64,${seg.audio}`);
    audioRef.current = audio;
    setPlayingIdx(idx);
    audio.onended = () => { setPlayingIdx(null); if (idx + 1 < synthSegments.length) playSegment(idx + 1); };
    audio.play();
  };
  const stopPlayback = () => { audioRef.current?.pause(); audioRef.current = null; setPlayingIdx(null); };

  const isActive = sessionState === 'listening';
  const isPaused = sessionState === 'paused';
  const isEnded  = sessionState === 'ended';
  const isIdle   = sessionState === 'idle';

  const displayItems   = isEnded && segments.length > 0 ? segments : lines;
  const uniqueSpeakers = [...new Set((isEnded && segments.length > 0 ? segments : []).map(s => s.speaker).filter(Boolean))];

  const bars = Array.from({ length: 32 }, (_, i) =>
    isActive ? Math.max(3, Math.min(28, amplitude * (0.35 + Math.sin(i * 0.9) * 0.35))) : 3
  );

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: 'var(--bg)' }}>

      {/* ── Top bar ── */}
      <div style={{ display: 'flex', alignItems:'center', justifyContent: 'space-between', padding: '12px 20px', background: 'var(--surface)', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
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
          <div style={{ position: 'relative' }}>
            <select value={targetLang} onChange={e => handleLangChange(e.target.value)} disabled={isActive}
              style={{ appearance: 'none', background: 'var(--surface)', border: '1px solid var(--border-warm)', borderRadius: 'var(--r-pill)', padding: '8px 32px 8px 16px', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-ink)', cursor: 'pointer', boxShadow: 'var(--shadow-sm)', opacity: isActive ? 0.5 : 1 }}>
              {LANGS.map(([n,c]) => <option key={c} value={c}>{n}</option>)}
            </select>
            <ChevronDown style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', width: 12, height: 12, color: 'var(--text-faded)', pointerEvents: 'none' }} />
          </div>
          {isEnded && displayItems.filter(d => !d.processing).length > 0 && (
            <>
              <button onClick={handleSynthesize} disabled={isSynthesizing}
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', background: 'var(--surface-ink)', color: '#fff', borderRadius: 'var(--r-pill)', fontSize: '0.8rem', fontWeight: 600, border: 'none', cursor: 'pointer', opacity: isSynthesizing ? 0.5 : 1 }}>
                {isSynthesizing ? <><Loader2 style={{ width: 12, height: 12, animation: 'spin 1s linear infinite' }} />Generating…</> : <><Volume2 style={{ width: 12, height: 12 }} />Generate voices</>}
              </button>
              {synthSegments.length > 0 && (
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

      {/* ── Speaker legend ── */}
      {uniqueSpeakers.length > 0 && (
        <div className="flex flex-wrap gap-2 px-5 py-2.5 bg-white border-b border-gray-100 shrink-0">
          {uniqueSpeakers.map((spk, idx) => {
            const c = SPEAKER_COLORS[idx % SPEAKER_COLORS.length];
            const seg = segments.find(s => s.speaker === spk);
            return (
              <span key={spk} className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold border ${c.light}`}>
                <span className={`w-3.5 h-3.5 rounded-full ${c.bg} flex items-center justify-center text-[8px] font-bold text-white`}>{idx+1}</span>
                {spk}{seg?.gender && <span className="opacity-50">{seg.gender === 'female' ? '♀' : '♂'}</span>}
              </span>
            );
          })}
        </div>
      )}

      {/* ── Conversation area ── */}
      <div style={{ flex: 1, padding: '16px', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        <div style={{ flex: 1, overflowY: 'auto', background: 'var(--surface)', borderRadius: 'var(--r-xl)', boxShadow: 'var(--shadow-sm)', padding: 16, display: 'flex', flexDirection: 'column', gap: 12, minHeight: 0 }}>

        {displayItems.length === 0 && !isDiarizing && (
          <div className="flex flex-col items-center justify-center h-full gap-4 text-center py-20">
            <div className="w-16 h-16 rounded-2xl bg-white border border-gray-100 shadow-sm flex items-center justify-center">
              <Mic className="w-7 h-7 text-gray-300" />
            </div>
            <p className="text-[15px] text-gray-400 font-medium">
              {isIdle ? 'Press Start to begin' : 'Listening…'}
            </p>

          </div>
        )}

        {isDiarizing && (
          <div className="flex items-center justify-center h-32 gap-2 text-[13px] text-gray-400">
            <Loader2 className="w-4 h-4 animate-spin" />Detecting speakers…
          </div>
        )}

        {!isDiarizing && displayItems.map((item, i) => {
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

          const spkLabel = item.speaker || null;
          const spkIdx   = spkLabel ? uniqueSpeakers.indexOf(spkLabel) : -1;
          const color    = SPEAKER_COLORS[Math.max(0, spkIdx) % SPEAKER_COLORS.length];
          const isRight  = spkIdx > 0 && spkIdx % 2 !== 0;
          const synthSeg = synthSegments[i];
          const isPlay   = playingIdx === i;

          return (
            <div key={item.id || i} className={`flex gap-2.5 items-end ${isRight ? 'flex-row-reverse' : 'flex-row'}`}>
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 ${spkLabel ? `${color.bg} text-white` : 'bg-gray-200 text-gray-500'}`}>
                {spkLabel ? (Math.max(0, spkIdx) + 1) : <Mic className="w-3 h-3" />}
              </div>
              <div className={`max-w-[72%] flex flex-col gap-1 ${isRight ? 'items-end' : 'items-start'}`}>
                {spkLabel && (
                  <span className={`text-[10px] font-semibold px-1 ${color.text}`}>
                    {spkLabel}{item.gender && <span className="ml-1 opacity-50">{item.gender === 'female' ? '♀' : '♂'}</span>}
                  </span>
                )}
                <div className={`rounded-2xl px-4 py-2.5 shadow-sm ${
                  isRight ? 'bg-gray-900 text-white rounded-br-sm' : 'bg-white border border-gray-100 text-gray-800 rounded-bl-sm'
                }`}>
                  <p className="text-[14px] leading-relaxed">{item.text}</p>
                  {item.translation && item.translation !== item.text && (
                    <p className={`text-[12px] mt-1 italic border-t pt-1 ${isRight ? 'text-white/50 border-white/10' : 'text-gray-400 border-gray-100'}`}>
                      {item.translation}
                    </p>
                  )}
                </div>
                {synthSeg?.audio && (
                  <button onClick={() => isPlay ? stopPlayback() : playSegment(i)}
                    className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold transition-all ${
                      isPlay ? 'bg-red-100 text-red-500' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
                    {isPlay ? <><Square className="w-2.5 h-2.5 fill-red-500" />Stop</> : <><Play className="w-2.5 h-2.5 fill-gray-500" />Play</>}
                  </button>
                )}
              </div>
            </div>
          );
        })}

        <div ref={boxEndRef} />
        </div>{/* end scrollable box */}
      </div>{/* end conversation area */}

      {/* ── Bottom controls ── */}
      <div style={{ padding: '16px 20px', flexShrink: 0, background: 'transparent' }}>
        {isActive && (
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'center', gap: 2, height: 28, marginBottom: 16 }}>
            {bars.map((h, i) => (
              <div key={i} style={{ width: 3, borderRadius: 999, background: 'var(--surface-ink)', height: `${h}px`, transition: 'height 75ms' }} />
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
