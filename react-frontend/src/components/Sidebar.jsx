import { useNavigate, useLocation } from 'react-router-dom';
import { Globe, User, LogOut, Mic2, Clock, Moon, Sun, ScanText, Ear, Settings, X, Menu, Film } from 'lucide-react';
import { useClerk } from '@clerk/clerk-react';
import { useApp } from '../context/AppContext';
import { getLabels } from '../services/uiLabels';
import { useContinuousSession } from '../hooks/useContinuousSession';

const SectionLabel = ({ label }) => <span className="section-label">{label}</span>;

const NavBtn = ({ icon: Icon, label, badge, active, onClick }) => (
  <button onClick={onClick} className={`nav-item${active ? ' active' : ''}`}>
    <Icon className="w-4 h-4 shrink-0" strokeWidth={1.8} />
    <span style={{ flex: 1 }}>{label}</span>
    {badge && <span style={{ fontSize: 9, fontWeight: 700, background: active ? 'rgba(255,255,255,0.25)' : 'var(--saffron-light)', color: active ? '#fff' : 'var(--saffron)', padding: '2px 7px', borderRadius: 999 }}>{badge}</span>}
  </button>
);

const BottomNavBtn = ({ icon: Icon, label, active, onClick }) => (
  <button onClick={onClick} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2, flex: 1, padding: '4px 0', color: active ? 'var(--saffron)' : 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer' }}>
    <Icon className="w-5 h-5" strokeWidth={active ? 2.2 : 1.6} />
    <span style={{ fontSize: 9, fontWeight: 600 }}>{label}</span>
  </button>
);

export default function Sidebar({ isOpen, onClose, onOpen, topOffset = 0 }) {
  const { state, clearAll, toggleDark, logout } = useApp();
  const { signOut } = useClerk();
  const navigate = useNavigate();
  const location = useLocation();
  const L = getLabels(state.uiLanguage);
  const is = (p) => location.pathname === p;
  const nav = (p) => () => { clearAll(); navigate(p); onClose?.(); };
  const handleLogout = async () => {
    try { await signOut(); } catch {}
    logout(); navigate('/auth');
  };
  const session = useContinuousSession();
  const isLive = session.state === 'listening' || session.state === 'paused';

  return (
    <>
      <aside
        className={`sidebar${isOpen ? ' open' : ''}`}
        style={{ top: topOffset, height: `calc(100vh - ${topOffset}px)` }}
      >
        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, padding: '0 4px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <img
              src="/seedlinglabs-logo.png"
              alt="SeedlingSpeaks"
              style={{
                width: 32,
                height: 32,
                borderRadius: 12,
                objectFit: 'cover',
                flexShrink: 0,
                boxShadow: '0 4px 14px rgba(60,40,20,0.12)',
                border: '1px solid rgba(90,70,50,0.08)',
                background: '#fff',
              }}
            />
            <span style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: '1.05rem', color: 'var(--text-ink)', letterSpacing: '-0.02em' }}>SeedlingSpeaks</span>
          </div>
          <button onClick={onClose} className="md:hidden" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-faded)', padding: 4 }}><X className="w-4 h-4" /></button>
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, overflowY: 'auto' }}>
          <NavBtn icon={Mic2} label={L.home} active={is('/app')} onClick={nav('/app')} />
          <SectionLabel label={L.translation} />
          <NavBtn icon={Mic2}     label={L.nativeToEnglish}     active={is('/app/native-to-english')} onClick={nav('/app/native-to-english')} />
          <NavBtn icon={Ear}      label={L.continuousListening} active={is('/app/continuous')}        onClick={nav('/app/continuous')} badge={isLive ? (session.state === 'listening' ? '● LIVE' : '⏸') : null} />
          <NavBtn icon={Globe}    label={L.englishToNative}     active={is('/app/english-to-native')} onClick={nav('/app/english-to-native')} />
          <NavBtn icon={ScanText} label={L.visionTranslate}     active={is('/app/vision')}            onClick={nav('/app/vision')} />
          <NavBtn icon={Film}     label="Video Subtitles"        active={is('/app/video')}             onClick={nav('/app/video')} />
          <SectionLabel label={L.library} />
          <NavBtn icon={Clock}        label={L.history}    active={is('/app/history')}    onClick={nav('/app/history')} />
        </nav>

        {/* Bottom */}
        <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12, marginTop: 12 }}>
          <button onClick={toggleDark} style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', borderRadius: 'var(--r-md)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '0.82rem', fontWeight: 500 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              {state.darkMode ? <Sun className="w-4 h-4" style={{ color: 'var(--saffron)' }} /> : <Moon className="w-4 h-4" />}
              <span>{state.darkMode ? L.lightMode : L.darkMode}</span>
            </div>
            <div className={state.darkMode ? 'toggle-on' : 'toggle-off'} style={{ width: 34, height: 20, borderRadius: 999, display: 'flex', alignItems: 'center', padding: '0 2px', transition: 'all 0.2s' }}>
              <div style={{ width: 16, height: 16, borderRadius: '50%', background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.2)', transform: state.darkMode ? 'translateX(14px)' : 'translateX(0)', transition: 'transform 0.2s' }} />
            </div>
          </button>
          <NavBtn icon={User}     label={L.profile}  active={is('/app/profile')}  onClick={() => { navigate('/app/profile'); onClose?.(); }} />
          <NavBtn icon={Settings} label={L.settings} active={is('/app/settings')} onClick={() => { navigate('/app/settings'); onClose?.(); }} />
          <button onClick={handleLogout} className="nav-item" style={{ color: 'var(--text-muted)' }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(28,25,23,0.08)'; e.currentTarget.style.color = '#9B1C2E'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = 'var(--text-muted)'; }}>
            <LogOut className="w-4 h-4 shrink-0" strokeWidth={1.8} /><span>{L.logout}</span>
          </button>
        </div>
      </aside>

      {isOpen && <div className="sidebar-backdrop" onClick={onClose} />}

      <nav className="mobile-nav">
        <button onClick={onOpen} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2, flex: 1, padding: '4px 0', color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer' }}>
          <Menu className="w-5 h-5" strokeWidth={1.6} /><span style={{ fontSize: 9, fontWeight: 600 }}>Menu</span>
        </button>
        <BottomNavBtn icon={Mic2}      label="Translate" active={is('/app/native-to-english') || is('/app')} onClick={nav('/app/native-to-english')} />
        <BottomNavBtn icon={Ear}       label="Listen"    active={is('/app/continuous')}          onClick={nav('/app/continuous')} />
        <BottomNavBtn icon={Globe}     label="Native"    active={is('/app/english-to-native')}   onClick={nav('/app/english-to-native')} />
        <BottomNavBtn icon={Clock}     label="History"   active={is('/app/history')}             onClick={nav('/app/history')} />
      </nav>
    </>
  );
}
