import { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { RefreshCw, Database, Trash2, Zap, BarChart2, Moon, Sun, Globe, X, ShieldCheck } from 'lucide-react';
import * as api from '../services/api';
import { getLabels } from '../services/uiLabels';


const UI_LANGUAGES = [
  { code: 'en',    name: 'English'   },
  { code: 'hi-IN', name: 'Hindi'     },
  { code: 'bn-IN', name: 'Bengali'   },
  { code: 'ta-IN', name: 'Tamil'     },
  { code: 'te-IN', name: 'Telugu'    },
  { code: 'ml-IN', name: 'Malayalam' },
  { code: 'mr-IN', name: 'Marathi'   },
  { code: 'gu-IN', name: 'Gujarati'  },
  { code: 'kn-IN', name: 'Kannada'   },
  { code: 'pa-IN', name: 'Punjabi'   },
  { code: 'or-IN', name: 'Odia'      },
];

const LANG_NAMES = {
  'hi-IN': 'Hindi', 'bn-IN': 'Bengali', 'ta-IN': 'Tamil', 'te-IN': 'Telugu',
  'ml-IN': 'Malayalam', 'mr-IN': 'Marathi', 'gu-IN': 'Gujarati',
  'kn-IN': 'Kannada', 'pa-IN': 'Punjabi', 'or-IN': 'Odia',
};

function Toggle({ on, onToggle, disabled }) {
  return (
    <button onClick={onToggle} disabled={disabled}
      className={`relative w-11 h-6 rounded-full transition-colors duration-200 focus:outline-none disabled:opacity-40 ${on ? 'bg-gray-900' : 'bg-gray-200'}`}>
      <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform duration-200 ${on ? 'translate-x-5' : 'translate-x-0'}`} />
    </button>
  );
}

export default function Settings() {
  const { state, toggleDark, setUiLanguage } = useApp();
  const L = getLabels(state.uiLanguage);

  const [cacheStats, setCacheStats] = useState(null);
  const [clearing, setClearing] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [consentGiven, setConsentGiven] = useState(state.authUser?.consentGiven ?? false);
  const [consentSaving, setConsentSaving] = useState(false);

  const loadCache = async () => { try { setCacheStats(await api.getCacheStats()); } catch {} };
  useEffect(() => { loadCache(); }, []);



  const handleClearCache = async () => {
    setClearing(true);
    try { await api.clearCache(); await loadCache(); setConfirmClear(false); }
    finally { setClearing(false); }
  };

  const handleConsentToggle = async () => {
    const newVal = !consentGiven;
    setConsentSaving(true);
    try {
      await api.updateConsent(newVal);
      setConsentGiven(newVal);
    } catch {
      // silent — toggle back if failed
    } finally {
      setConsentSaving(false);
    }
  };



  const hitRate = cacheStats && cacheStats.total_entries > 0
    ? Math.round((cacheStats.total_hits / (cacheStats.total_hits + cacheStats.total_entries)) * 100) : 0;

  return (
    <div className="min-h-screen bg-[var(--bg)] px-4 md:px-10 pt-6 md:pt-10 pb-10 md:pb-16 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-[18px] md:text-[22px] font-extrabold text-gray-900 tracking-tight">{L.settingsTitle}</h1>
          <p className="text-[13px] text-gray-400 mt-0.5">{L.managePreferences}</p>
        </div>
      </div>

      <div className="space-y-3">

        {/* Translation Cache */}
        <div className="bg-white rounded-2xl border border-gray-100 px-5 py-4 shadow-sm hover:shadow-md transition-all">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-gray-100 flex items-center justify-center shrink-0">
                <Database className="w-4 h-4 text-gray-600" />
              </div>
              <div>
                <p className="text-[14px] font-semibold text-gray-900">Translation Cache</p>
                <p className="text-[12px] text-gray-400 mt-0.5">Semantic cache — skips Sarvam API on repeated phrases</p>
              </div>
            </div>
            <button onClick={loadCache} className="p-2 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-all">
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </div>
          {cacheStats == null ? (
            <p className="text-[13px] text-gray-300 py-2">Loading stats…</p>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
                {[
                  { label: 'Cached entries', value: cacheStats.total_entries },
                  { label: 'Total hits',     value: cacheStats.total_hits    },
                  { label: 'Hit rate',       value: `${hitRate}%`            },
                ].map(({ label, value }) => (
                  <div key={label} className="bg-gray-50 rounded-xl px-4 py-3 border border-gray-100 text-center">
                    <p className="text-[18px] font-extrabold text-gray-900">{value}</p>
                    <p className="text-[11px] text-gray-400 mt-0.5 font-medium">{label}</p>
                  </div>
                ))}
              </div>
              {Object.keys(cacheStats.by_language || {}).length > 0 && (
                <div className="space-y-1.5 mb-4">
                  <p className="text-[11px] font-bold text-gray-300 uppercase tracking-widest mb-2">By language</p>
                  {Object.entries(cacheStats.by_language).map(([lang, d]) => (
                    <div key={lang} className="flex items-center justify-between px-3 py-2 bg-gray-50 rounded-xl border border-gray-100">
                      <div className="flex items-center gap-2">
                        <Zap className="w-3 h-3 text-amber-400" />
                        <span className="text-[13px] font-medium text-gray-700">{LANG_NAMES[lang] || lang}</span>
                      </div>
                      <div className="flex items-center gap-3 text-[12px] text-gray-400">
                        <span>{d.entries} entries</span>
                        <span className="text-green-500 font-semibold">{d.hits} hits</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {confirmClear ? (
                <div className="flex items-center gap-2">
                  <span className="text-[13px] text-gray-500 flex-1">Clear all cached translations?</span>
                  <button onClick={handleClearCache} disabled={clearing}
                    className="px-3 py-1.5 rounded-lg bg-red-500 text-white text-[12px] font-semibold hover:bg-red-600 disabled:opacity-40 transition-all">
                    {clearing ? 'Clearing…' : 'Yes, clear'}
                  </button>
                  <button onClick={() => setConfirmClear(false)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 transition-all">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <button onClick={() => setConfirmClear(true)}
                  className="flex items-center gap-1.5 text-[12px] text-gray-400 hover:text-red-500 hover:bg-red-50 px-3 py-1.5 rounded-lg border border-gray-200 hover:border-red-100 transition-all">
                  <Trash2 className="w-3.5 h-3.5" />Clear cache
                </button>
              )}
            </>
          )}
        </div>

        {/* App Language */}
        <div className="bg-white rounded-2xl border border-gray-100 px-5 py-4 shadow-sm hover:shadow-md transition-all">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-9 h-9 rounded-xl bg-gray-100 flex items-center justify-center shrink-0">
              <Globe className="w-4 h-4 text-gray-600" />
            </div>
            <div>
              <p className="text-[14px] font-semibold text-gray-900">App Language</p>
              <p className="text-[12px] text-gray-400 mt-0.5">Language used for UI labels and navigation</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {UI_LANGUAGES.map(({ code, name }) => (
              <button key={code} onClick={() => setUiLanguage(code)}
                className={`px-3 py-1.5 rounded-lg text-[13px] font-semibold border transition-all ${
                  state.uiLanguage === code ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-500 border-gray-200 hover:border-gray-400 hover:text-gray-800'
                }`}>
                {name}
              </button>
            ))}
          </div>
        </div>

        {/* Dark Mode */}
        <div className="bg-white rounded-2xl border border-gray-100 px-5 py-4 shadow-sm hover:shadow-md transition-all">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-gray-100 flex items-center justify-center shrink-0">
                {state.darkMode ? <Sun className="w-4 h-4 text-gray-600" /> : <Moon className="w-4 h-4 text-gray-600" />}
              </div>
              <div>
                <p className="text-[14px] font-semibold text-gray-900">Dark mode</p>
                <p className="text-[12px] text-gray-400 mt-0.5">{state.darkMode ? 'Currently on' : 'Currently off'}</p>
              </div>
            </div>
            <Toggle on={state.darkMode} onToggle={toggleDark} />
          </div>
        </div>

        {/* API Usage */}
        <div className="bg-white rounded-2xl border border-gray-100 px-5 py-4 shadow-sm hover:shadow-md transition-all">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-9 h-9 rounded-xl bg-gray-100 flex items-center justify-center shrink-0">
              <BarChart2 className="w-4 h-4 text-gray-600" />
            </div>
            <div>
              <p className="text-[14px] font-semibold text-gray-900">API Usage</p>
              <p className="text-[12px] text-gray-400 mt-0.5">Calls made this session (stored locally)</p>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {[
              { label: 'Sarvam calls', value: state.usageStats?.sarvamCalls || 0, color: 'text-blue-600'  },
              { label: 'Gemini calls', value: state.usageStats?.geminiCalls || 0, color: 'text-amber-600' },
              { label: 'Cache hits',   value: state.usageStats?.cacheHits   || 0, color: 'text-green-600' },
            ].map(({ label, value, color }) => (
              <div key={label} className="bg-gray-50 rounded-xl px-4 py-3 border border-gray-100 text-center">
                <p className={`text-[20px] font-extrabold ${color}`}>{value}</p>
                <p className="text-[11px] text-gray-400 mt-0.5 font-medium">{label}</p>
              </div>
            ))}
          </div>
        </div>

        {/* GDPR Consent */}
        <div className="bg-white rounded-2xl border border-gray-100 px-5 py-4 shadow-sm hover:shadow-md transition-all">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-gray-100 flex items-center justify-center shrink-0">
                <ShieldCheck className="w-4 h-4 text-gray-600" />
              </div>
              <div>
                <p className="text-[14px] font-semibold text-gray-900">Data consent</p>
                <p className="text-[12px] text-gray-400 mt-0.5">
                  {consentGiven ? 'You have given consent' : 'No consent given'}
                  {' · '}
                  <a href="/privacy-policy" target="_blank" rel="noopener noreferrer"
                    className="text-blue-500 hover:underline">Privacy Policy</a>
                </p>
              </div>
            </div>
            <Toggle on={consentGiven} onToggle={handleConsentToggle} disabled={consentSaving} />
          </div>
          <p className="text-[11px] text-gray-400 mt-3 leading-relaxed">
            Allow use of your data to improve translation quality and personalization. You can withdraw at any time.
          </p>
        </div>

      </div>
    </div>
  );
}
