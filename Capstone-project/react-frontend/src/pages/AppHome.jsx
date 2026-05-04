import { useState, useEffect } from 'react';
import { Mic2, Ear, Globe, ScanText, Sparkles, ArrowRight, Radio, Bell, Search, Video } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { getLabels } from '../services/uiLabels';
import { loadUserProfile, subscribeToUserProfile, getProfileFirstName } from '../services/userProfile';
import { getWidgetStatus, toggleWidgetPower } from '../services/widgetService';

const CARD_COLORS = {
  '/app/native-to-english': '#FAF0E4',   /* warm peach-cream */
  '/app/continuous':        '#E8EEF8',   /* soft periwinkle */
  '/app/english-to-native': '#E8F4ED',   /* soft sage */
  '/app/vision':            '#F5EEF8',   /* soft lavender */
  '/app/video':             '#FDF4E3',   /* soft turmeric */
};

const CARD_BORDERS = {
  '/app/native-to-english': 'rgba(232,130,12,0.15)',
  '/app/continuous':        'rgba(61,79,138,0.15)',
  '/app/english-to-native': 'rgba(45,106,79,0.15)',
  '/app/vision':            'rgba(107,70,150,0.15)',
  '/app/video':             'rgba(212,160,23,0.20)',
};

const SUPPORTED_LANGUAGES = ['Hindi', 'Bengali', 'Tamil', 'Telugu', 'Malayalam', 'Marathi', 'Gujarati', 'Kannada', 'Punjabi', 'Odia'];

export default function AppHome() {
  const { state, clearAll } = useApp();
  const navigate = useNavigate();
  const L = getLabels(state.uiLanguage);
  const [widgetOn, setWidgetOn] = useState(false);
  const [widgetLoading, setWidgetLoading] = useState(false);
  const [profile, setProfile] = useState(() => loadUserProfile());

  useEffect(() => {
    getWidgetStatus().then((data) => {
      if (data) setWidgetOn(Boolean(data.enabled));
    });
  }, []);

  useEffect(() => subscribeToUserProfile(setProfile), []);

  const toggleWidget = async () => {
    setWidgetLoading(true);
    try {
      const d = await toggleWidgetPower();
      setWidgetOn(d.enabled);
    } catch {}
    setWidgetLoading(false);
  };

  const FEATURES = [
    { icon: Mic2,     title: L.nativeToEnglish,     desc: L.nativeToEnglishDesc,     path: '/app/native-to-english' },
    { icon: Ear,      title: L.continuousListening, desc: L.continuousListeningDesc, path: '/app/continuous' },
    { icon: Globe,    title: L.englishToNative,     desc: L.englishToNativeDesc,     path: '/app/english-to-native' },
    { icon: ScanText, title: L.visionTranslate,     desc: L.visionTranslateDesc,     path: '/app/vision' },
    { icon: Video,    title: 'Video Translate',     desc: 'Upload a video and get translated speech back.', path: '/app/video' },
  ];

  const go = (path) => { clearAll(); navigate(path); };
  const hour = new Date().getHours();
  const greeting = hour >= 5 && hour < 12 ? 'Good morning' : hour >= 12 && hour < 17 ? 'Good afternoon' : hour >= 17 && hour < 21 ? 'Good evening' : 'Good night';
  const subGreeting = hour >= 5 && hour < 12
    ? 'Ready to break some language barriers today?'
    : hour >= 12 && hour < 17
      ? 'Hope your translations are going well.'
      : hour >= 17 && hour < 21
        ? 'Wrapping up for the day?'
        : 'Burning the midnight oil?';
  const firstName = getProfileFirstName(profile);

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      {/* Header */}
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div>
            <h1
              className="page-header-title"
              style={{ fontSize: 'clamp(1.1rem, 2vw, 1.4rem)', letterSpacing: '-0.02em', marginBottom: 4 }}
            >
              {firstName ? `${greeting}, ${firstName}` : greeting}{' '}
              <span style={{ display: 'inline-block', animation: 'waveHand 1.5s ease-in-out 1', transformOrigin: '70% 70%' }}>👋</span>
            </h1>
            {firstName ? (
              <p style={{ fontSize: '0.82rem', color: 'var(--text-faded)', margin: 0 }}>
                {subGreeting}
              </p>
            ) : null}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'var(--surface)', borderRadius: 'var(--r-pill)', boxShadow: 'var(--shadow-sm)', padding: '9px 18px', width: 220 }} className="hidden md:flex">
            <Search className="w-4 h-4" style={{ color: 'var(--text-faded)', flexShrink: 0 }} />
            <input placeholder="Search features…" style={{ border: 'none', background: 'transparent', outline: 'none', fontSize: '0.85rem', color: 'var(--text-ink)', width: '100%', boxShadow: 'none' }} />
          </div>
          <button style={{ width: 40, height: 40, borderRadius: '50%', background: 'var(--surface)', boxShadow: 'var(--shadow-sm)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-faded)' }}>
            <Bell className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div style={{ maxWidth: 980, margin: '0 auto', padding: '32px 24px 80px' }} className="page-content">
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.15fr) minmax(280px, 0.85fr)', gap: 20, alignItems: 'stretch', marginBottom: 28 }}>
          <div style={{ paddingTop: 18 }}>
            <div className="accent-badge" style={{ marginBottom: 14 }}>
              <Sparkles className="w-3 h-3" />
              Powered by Team ARTiculate
            </div>
            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(2.1rem, 4vw, 3.4rem)', fontWeight: 600, color: 'var(--text-ink)', lineHeight: 1.08, margin: '0 0 14px', letterSpacing: '-0.04em' }}>
              Break language <em style={{ fontStyle: 'italic' }}>barriers</em><br />with AI-powered <em style={{ fontStyle: 'italic' }}>translation</em>.
            </h2>
            <p style={{ fontSize: '1rem', color: 'var(--text-warm)', lineHeight: 1.72, maxWidth: 560, margin: 0 }}>
              Speak, type, or scan. Choose the mode you need and move from capture to translation in a clean, focused workspace.
            </p>
          </div>

          <div className="surface-card" style={{ padding: 24, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', minHeight: 240 }}>
            <div>
              <p style={{ fontSize: 9, fontWeight: 600, letterSpacing: '0.18em', color: 'var(--text-faded)', textTransform: 'uppercase', margin: '0 0 12px' }}>Quick overview</p>
              <p style={{ fontFamily: 'var(--font-display)', fontSize: '1.3rem', fontWeight: 600, margin: '0 0 10px', color: 'var(--text-ink)' }}>
                One place for multilingual work.
              </p>
              <p style={{ fontSize: '0.84rem', lineHeight: 1.6, margin: 0, color: 'var(--text-warm)' }}>
                Start with voice, text, image, or video and switch between workflows without leaving the dashboard.
              </p>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12, marginTop: 18 }}>
              <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 'var(--r-lg)', padding: '14px 16px' }}>
                <p style={{ fontSize: '0.72rem', letterSpacing: '0.08em', textTransform: 'uppercase', margin: '0 0 6px', color: 'var(--text-faded)', fontWeight: 600 }}>Languages</p>
                <p style={{ fontFamily: 'var(--font-display)', fontSize: '1.25rem', margin: 0, color: 'var(--text-ink)' }}>{SUPPORTED_LANGUAGES.length}</p>
              </div>
              <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 'var(--r-lg)', padding: '14px 16px' }}>
                <p style={{ fontSize: '0.72rem', letterSpacing: '0.08em', textTransform: 'uppercase', margin: '0 0 6px', color: 'var(--text-faded)', fontWeight: 600 }}>History</p>
                <p style={{ fontFamily: 'var(--font-display)', fontSize: '1.25rem', margin: 0, color: 'var(--text-ink)' }}>{state.transcriptHistory.length}</p>
              </div>
            </div>
          </div>
        </div>

        <p style={{ fontSize: 9, fontWeight: 600, letterSpacing: '0.18em', color: 'var(--text-faded)', textTransform: 'uppercase', marginBottom: 16 }}>{L.chooseMode}</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16, marginBottom: 28 }}>
          {FEATURES.map(({ icon: Icon, title, desc, path }) => (
            <button key={path} className="feature-card stagger-child" onClick={() => go(path)} style={{ background: CARD_COLORS[path], border: `1px solid ${CARD_BORDERS[path]}` }}>
              <div className="card-deco" />
              <div className="card-icon"><Icon className="w-5 h-5" strokeWidth={2} /></div>
              <ArrowRight className="card-arrow" />
              <p style={{ fontFamily: 'var(--font-display)', fontSize: '1.05rem', fontWeight: 500, color: 'var(--text-ink)', margin: '0 0 4px', letterSpacing: '-0.01em' }}>{title}</p>
              <p style={{ fontSize: '0.82rem', color: 'var(--text-warm)', lineHeight: 1.6, margin: 0 }}>{desc}</p>
            </button>
          ))}
        </div>

        {/* Desktop Widget */}
        <div style={{ background: 'var(--surface)', borderRadius: 'var(--r-lg)', boxShadow: 'var(--shadow-sm)', border: '1px solid var(--border-warm)', padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ width: 44, height: 44, borderRadius: 'var(--r-md)', background: 'var(--saffron-light)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Radio className="w-5 h-5" style={{ color: 'var(--saffron)' }} strokeWidth={1.8} />
            </div>
            <div>
              <p style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-ink)', margin: 0 }}>Desktop Widget</p>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-faded)', margin: 0 }}>{widgetOn ? 'Active — floating bubble is visible' : 'Disabled — toggle to enable'}</p>
            </div>
          </div>
          <button onClick={toggleWidget} disabled={widgetLoading}
            className={widgetOn ? 'toggle-on' : 'toggle-off'}
            style={{ width: 46, height: 26, borderRadius: 999, border: 'none', cursor: 'pointer', padding: '0 3px', display: 'flex', alignItems: 'center', transition: 'all 0.2s', opacity: widgetLoading ? 0.5 : 1 }}>
            <div style={{ width: 20, height: 20, borderRadius: '50%', background: '#fff', boxShadow: '0 1px 4px rgba(0,0,0,0.2)', transform: widgetOn ? 'translateX(20px)' : 'translateX(0)', transition: 'transform 0.2s' }} />
          </button>
        </div>

        <div className="surface-card" style={{ padding: 24 }}>
          <p style={{ fontSize: 9, fontWeight: 600, letterSpacing: '0.18em', color: 'var(--text-faded)', textTransform: 'uppercase', marginBottom: 14 }}>{L.supportedLanguages}</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            {SUPPORTED_LANGUAGES.map(lang => (
              <span key={lang} className="lang-pill">{lang}</span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
