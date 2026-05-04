import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Film, Download, Trash2, Play, ArrowLeft, Clock } from 'lucide-react';

const HISTORY_KEY = 'vt_video_history';

function loadHistory() {
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]'); } catch { return []; }
}
function saveHistory(h) { try { localStorage.setItem(HISTORY_KEY, JSON.stringify(h)); } catch {} }

const LANG_NAMES = {
  'hi-IN': 'Hindi', 'en-IN': 'English', 'kn-IN': 'Kannada',
  'ta-IN': 'Tamil', 'te-IN': 'Telugu', 'ml-IN': 'Malayalam',
  'bn-IN': 'Bengali', 'mr-IN': 'Marathi', 'gu-IN': 'Gujarati', 'pa-IN': 'Punjabi',
};

export default function VideoHistory() {
  const navigate = useNavigate();
  const [history, setHistory] = useState(loadHistory);
  const [playing, setPlaying] = useState(null);

  const deleteItem = (id) => {
    const updated = history.filter(h => h.id !== id);
    setHistory(updated);
    saveHistory(updated);
    if (playing === id) setPlaying(null);
  };

  const fmt = (iso) => new Date(iso).toLocaleDateString('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });

  return (
    <div className="min-h-screen bg-[var(--bg)]">
      {/* Header */}
      <div style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)', padding: '12px 32px', display: 'flex', alignItems: 'center', gap: 16 }}>
        <button onClick={() => navigate('/app/video')}
          style={{ width: 34, height: 34, borderRadius: '50%', background: 'var(--surface)', border: '1px solid var(--border-warm)', color: 'var(--text-faded)', boxShadow: 'var(--shadow-sm)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.15s ease' }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--saffron)'; e.currentTarget.style.color = 'var(--saffron)'; }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-warm)'; e.currentTarget.style.color = 'var(--text-faded)'; }}>
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.5rem', fontWeight: 600, color: 'var(--text-ink)', letterSpacing: '-0.03em', margin: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
            <Clock className="w-5 h-5" style={{ color: 'var(--saffron)' }} />
            Video History
          </h2>
          <p style={{ fontSize: '0.82rem', color: 'var(--text-faded)', marginTop: 2, margin: 0 }}>{history.length} translated video{history.length !== 1 ? 's' : ''}</p>
        </div>
      </div>

      <div className="px-4 md:px-8 py-6 max-w-5xl mx-auto">
        {history.length === 0 ? (
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--r-xl)', padding: '80px 40px', textAlign: 'center', boxShadow: 'var(--shadow-sm)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ width: 72, height: 72, borderRadius: 'var(--r-lg)', background: 'var(--surface-tinted)', marginBottom: 20, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Film className="w-7 h-7" style={{ color: 'var(--text-faded)' }} />
            </div>
            <p style={{ fontFamily: 'var(--font-display)', fontSize: '1.1rem', fontWeight: 500, color: 'var(--text-ink)', margin: '0 0 6px' }}>No translated videos yet</p>
            <p style={{ color: 'var(--text-faded)', fontSize: '0.85rem', margin: 0, marginBottom: 16 }}>Translate a video and it will appear here</p>
            <button onClick={() => navigate('/app/video')}
              style={{ marginTop: 12, paddingLeft: 20, paddingRight: 20, paddingTop: 12, paddingBottom: 12, background: 'var(--surface-ink)', color: 'white', borderRadius: 'var(--r-lg)', fontSize: '0.88rem', fontWeight: 600, border: 'none', boxShadow: '0 4px 12px rgba(28,25,23,0.25)', cursor: 'pointer', transition: 'all 0.15s ease' }}
              onMouseEnter={e => { e.currentTarget.style.background = '#2C2520'; e.currentTarget.style.transform = 'translateY(-2px)'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'var(--surface-ink)'; e.currentTarget.style.transform = 'none'; }}>
              Translate a video
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {history.map((item, idx) => (
              <div key={item.id} className="stagger-child" style={{ background: 'var(--surface)', border: '1px solid var(--border-warm)', borderRadius: 'var(--r-xl)', overflow: 'hidden', boxShadow: 'var(--shadow-sm)', transition: 'transform 0.2s ease, box-shadow 0.2s ease', cursor: 'pointer', animationDelay: `${0.05 + idx * 0.05}s` }}
                onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-3px)'; e.currentTarget.style.boxShadow = 'var(--shadow-md)'; }}
                onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = 'var(--shadow-sm)'; }}>
                {/* Video player */}
                <div style={{ background: 'var(--surface-ink)', position: 'relative', aspectRatio: '16/9', overflow: 'hidden' }}>
                  {playing === item.id ? (
                    <video
                      src={`/api/video/download/${item.videoId}`}
                      controls
                      autoPlay
                      className="w-full object-contain"
                      style={{ maxHeight: '220px' }}
                    />
                  ) : (
                    <div
                      style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', height: '100%' }}
                      onClick={() => setPlaying(item.id)}
                    >
                      <div style={{ width: 52, height: 52, borderRadius: '50%', background: 'rgba(253,250,244,0.15)', border: '2px solid rgba(253,250,244,0.30)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.15s ease', cursor: 'pointer' }}
                        onMouseEnter={e => { e.currentTarget.style.background = 'rgba(232,130,12,0.30)'; e.currentTarget.style.borderColor = 'rgba(232,130,12,0.6)'; e.currentTarget.style.transform = 'scale(1.05)'; }}
                        onMouseLeave={e => { e.currentTarget.style.background = 'rgba(253,250,244,0.15)'; e.currentTarget.style.borderColor = 'rgba(253,250,244,0.30)'; e.currentTarget.style.transform = 'scale(1)'; }}>
                        <Play className="w-5 h-5 text-white fill-white ml-0.5" />
                      </div>
                    </div>
                  )}
                </div>

                {/* Info */}
                <div style={{ padding: '16px 18px' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: '0.88rem', fontWeight: 600, color: 'var(--text-ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', margin: 0 }}>
                        {item.filename || `Video · ${LANG_NAMES[item.targetLang] || item.targetLang}`}
                      </p>
                      <p style={{ fontSize: '11px', color: 'var(--text-faded)', marginTop: 6, display: 'flex', alignItems: 'center', gap: 8, margin: '6px 0 0' }}>
                        <span style={{ background: '#EAF4ED', color: '#1A5C35', borderRadius: 'var(--r-pill)', padding: '3px 10px', fontSize: '11px', fontWeight: 700 }}>
                          {LANG_NAMES[item.targetLang] || item.targetLang}
                        </span>
                        · {fmt(item.timestamp)}
                      </p>
                    </div>
                    <button onClick={() => deleteItem(item.id)}
                      style={{ padding: 6, borderRadius: 'var(--r-md)', background: 'none', border: 'none', color: 'var(--text-faded)', cursor: 'pointer', transition: 'color 0.15s ease', flexShrink: 0 }}
                      onMouseEnter={e => { e.currentTarget.style.color = '#9B1C2E'; }}
                      onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-faded)'; }}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {item.translated_text && (
                    <p style={{ color: 'var(--text-warm)', fontSize: '0.82rem', lineHeight: 1.55, marginTop: 10, marginBottom: 14, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                      {item.translated_text}
                    </p>
                  )}

                  <a
                    href={`/api/video/download/${item.videoId}`}
                    download={`translated_${item.videoId}.mp4`}
                    style={{ margin: '14px 0 0 0', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, width: '100%', paddingTop: 12, paddingBottom: 12, background: 'var(--surface-ink)', color: 'white', borderRadius: 'var(--r-pill)', fontSize: '0.88rem', fontWeight: 500, border: 'none', boxShadow: '0 3px 12px rgba(28,25,23,0.25)', transition: 'all 0.15s ease', cursor: 'pointer' }}
                    onMouseEnter={e => { e.currentTarget.style.background = '#2C2520'; e.currentTarget.style.transform = 'translateY(-1px)'; }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'var(--surface-ink)'; e.currentTarget.style.transform = 'none'; }}>
                    <Download className="w-3.5 h-3.5" style={{ color: 'var(--saffron)' }} />Download
                  </a>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
