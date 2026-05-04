import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { enableWidgetWithConfig } from '../services/widgetService';

const LANGUAGES = [
  { code: 'en-IN', name: 'English',   native: 'English',    flag: '🇬🇧' },
  { code: 'hi-IN', name: 'Hindi',     native: 'हिन्दी',    flag: '🇮🇳' },
  { code: 'bn-IN', name: 'Bengali',   native: 'বাংলা',     flag: '🇮🇳' },
  { code: 'ta-IN', name: 'Tamil',     native: 'தமிழ்',     flag: '🇮🇳' },
  { code: 'te-IN', name: 'Telugu',    native: 'తెలుగు',    flag: '🇮🇳' },
  { code: 'ml-IN', name: 'Malayalam', native: 'മലയാളം',    flag: '🇮🇳' },
  { code: 'mr-IN', name: 'Marathi',   native: 'मराठी',     flag: '🇮🇳' },
  { code: 'gu-IN', name: 'Gujarati',  native: 'ગુજરાતી',   flag: '🇮🇳' },
  { code: 'kn-IN', name: 'Kannada',   native: 'ಕನ್ನಡ',     flag: '🇮🇳' },
  { code: 'pa-IN', name: 'Punjabi',   native: 'ਪੰਜਾਬੀ',    flag: '🇮🇳' },
  { code: 'or-IN', name: 'Odia',      native: 'ଓଡ଼ିଆ',     flag: '🇮🇳' },
];

export default function WidgetSetup() {
  const { setWidgetSetupDone, setWidgetEnabled, setWidgetLanguages, setWidgetMode } = useApp();
  const navigate = useNavigate();
  const [selected, setSelected] = useState([]);
  const [step, setStep] = useState(1); // 1 = language pick, 2 = widget enable
  const [enabling, setEnabling] = useState(false);
  const [localWidgetMode, setLocalWidgetMode] = useState('englishToNative');

  const toggle = (code) => {
    setSelected(prev =>
      prev.includes(code)
        ? prev.filter(c => c !== code)
        : prev.length < 10 ? [...prev, code] : prev
    );
  };

  const handleContinue = () => {
    setWidgetLanguages(selected);
    setStep(2);
  };

  const handleEnable = async () => {
    setEnabling(true);
    try {
      await enableWidgetWithConfig({ mode: localWidgetMode, languages: selected });
    } catch { /* widget may not be running yet — that's fine */ }
    setWidgetMode(localWidgetMode);
    setWidgetSetupDone();
    setWidgetEnabled(true);
    navigate('/app/native-to-english');
  };

  const handleSkip = () => {
    setWidgetSetupDone();
    setWidgetEnabled(false);
    navigate('/app/native-to-english');
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#f8f8f8]" style={{ fontFamily: 'system-ui, sans-serif' }}>
      <div className="w-full max-w-2xl px-6 py-10">

        {/* ── Step 1: Language selection ── */}
        {step === 1 && (
          <div style={{ animation: 'fadeIn 0.3s ease' }}>
            <div className="text-center mb-8">
              <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gray-900 mb-4">
                <span style={{ fontSize: 26 }}>🌐</span>
              </div>
              <h1 className="text-[20px] md:text-[28px] font-extrabold text-gray-900 tracking-tight">Choose your languages</h1>
              <p className="text-[15px] text-gray-400 mt-2">Select up to 10 languages for your desktop widget</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-8">
              {LANGUAGES.map(lang => {
                const isSelected = selected.includes(lang.code);
                return (
                  <button
                    key={lang.code}
                    onClick={() => toggle(lang.code)}
                    className={`relative flex items-center gap-4 px-5 py-4 rounded-2xl border-2 text-left transition-all duration-150 ${
                      isSelected
                        ? 'bg-gray-900 border-gray-900 text-white shadow-lg'
                        : 'bg-white border-gray-100 text-gray-800 hover:border-gray-300 hover:shadow-sm'
                    }`}
                  >
                    <span style={{ fontSize: 28 }}>{lang.flag}</span>
                    <div className="flex-1 min-w-0">
                      <p className={`text-[14px] font-bold ${isSelected ? 'text-white' : 'text-gray-900'}`}>{lang.name}</p>
                      <p className={`text-[16px] mt-0.5 ${isSelected ? 'text-white/70' : 'text-gray-400'}`}>{lang.native}</p>
                    </div>
                    {isSelected && (
                      <div className="w-6 h-6 rounded-full bg-white/20 flex items-center justify-center shrink-0">
                        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                          <path d="M2 6l3 3 5-5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      </div>
                    )}
                  </button>
                );
              })}
            </div>

            <div className="flex items-center justify-between">
              <p className="text-[13px] text-gray-400">
                {selected.length === 0 ? 'No languages selected' : `${selected.length} selected`}
              </p>
              <button
                onClick={handleContinue}
                disabled={selected.length === 0}
                className={`px-8 py-3 rounded-xl text-[15px] font-bold transition-all duration-150 ${
                  selected.length > 0
                    ? 'bg-gray-900 text-white hover:bg-gray-700 shadow-md hover:shadow-lg'
                    : 'bg-gray-100 text-gray-300 cursor-not-allowed'
                }`}
              >
                Continue →
              </button>
            </div>
          </div>
        )}

        {/* ── Step 2: Widget enable ── */}
        {step === 2 && (
          <div style={{ animation: 'fadeIn 0.3s ease' }} className="text-center">
            <div className="mb-8">
              <h1 className="text-[20px] md:text-[28px] font-extrabold text-gray-900 tracking-tight mb-2">Enable Desktop Widget</h1>
              <p className="text-[15px] text-gray-400">Choose what the floating bubble should do when you open it</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
              {[
                {
                  id: 'nativeToEnglish',
                  title: 'Native to English',
                  desc: 'Type in your native language and get English output in the widget.',
                  icon: '⇢',
                },
                {
                  id: 'englishToNative',
                  title: 'English to Native',
                  desc: 'Type in English and translate into one of your selected languages.',
                  icon: '⇠',
                },
              ].map((option) => {
                const isSelected = localWidgetMode === option.id;
                return (
                  <button
                    key={option.id}
                    onClick={() => setLocalWidgetMode(option.id)}                    className={`rounded-2xl border-2 px-5 py-5 text-left transition-all ${
                      isSelected
                        ? 'border-gray-900 bg-gray-900 text-white shadow-lg'
                        : 'border-gray-100 bg-white text-gray-900 hover:border-gray-300 hover:shadow-sm'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-4">
                      <div className={`w-11 h-11 rounded-2xl flex items-center justify-center text-[20px] ${isSelected ? 'bg-white/15' : 'bg-gray-100'}`}>
                        {option.icon}
                      </div>
                      {isSelected && (
                        <div className="w-6 h-6 rounded-full bg-white/20 flex items-center justify-center shrink-0">
                          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                            <path d="M2 6l3 3 5-5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        </div>
                      )}
                    </div>
                    <p className={`text-[16px] font-bold ${isSelected ? 'text-white' : 'text-gray-900'}`}>{option.title}</p>
                    <p className={`text-[13px] mt-2 leading-relaxed ${isSelected ? 'text-white/75' : 'text-gray-500'}`}>{option.desc}</p>
                  </button>
                );
              })}
            </div>

            <div className="flex flex-col items-center mb-8">
              <div className="relative mb-6">
                <div className="w-72 h-44 rounded-2xl bg-gradient-to-br from-gray-800 to-gray-900 flex items-end justify-end p-4 shadow-2xl">
                  <div className="w-12 h-12 rounded-full bg-[#111827] flex items-center justify-center shadow-xl border-2 border-white/10">
                    <span style={{ color: 'white', fontSize: 18, lineHeight: 1 }}>▶︎</span>
                  </div>
                </div>
                <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 bg-gray-900 text-white text-[11px] font-semibold px-3 py-1 rounded-full whitespace-nowrap">
                  Always on top
                </div>
              </div>

              <div className="max-w-sm space-y-3 mt-4">
                {localWidgetMode === 'nativeToEnglish'
                  ? [
                      { icon: '🌐', text: 'Pick your native language as the input language' },
                      { icon: '⌨️', text: 'Type in your native script inside the widget panel' },
                      { icon: 'A', text: 'Get clean English output instantly' },
                    ]
                  : [
                      { icon: '▶︎', text: 'Floating bubble stays on top of all windows' },
                      { icon: '⌨️', text: 'Click it to open the translation panel' },
                      { icon: '🔤', text: 'Type English and translate it to your selected language' },
                    ]
                .map(({ icon, text }) => (
                  <div key={text} className="flex items-center gap-3 text-left bg-white rounded-xl px-4 py-3 border border-gray-100 shadow-sm">
                    <span className="text-[18px] shrink-0">{icon}</span>
                    <p className="text-[13px] text-gray-600">{text}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-3 max-w-xs mx-auto">
              <button
                onClick={handleEnable}
                disabled={enabling}
                className="w-full py-3.5 rounded-xl bg-gray-900 text-white text-[15px] font-bold hover:bg-gray-700 transition-all shadow-md hover:shadow-lg disabled:opacity-50"
              >
                {enabling ? 'Enabling…' : 'Enable Desktop Widget'}
              </button>
              <button
                onClick={handleSkip}
                className="w-full py-3 rounded-xl text-[14px] text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-all"
              >
                Skip for now
              </button>
            </div>

            <button
              onClick={() => setStep(1)}
              className="mt-6 text-[13px] text-gray-300 hover:text-gray-500 transition-colors"
            >
              ← Back to language selection
            </button>
          </div>
        )}
      </div>

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(12px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
