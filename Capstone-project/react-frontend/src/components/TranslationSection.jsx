import { Languages, ChevronDown } from 'lucide-react';
import { useCallback } from 'react';
import { useApp } from '../context/AppContext';
import * as api from '../services/api';

export default function TranslationSection() {
  const { state, setField, setFields, setLoading, showError, TARGET_LANGUAGES } = useApp();

  const handleTranslate = useCallback(async () => {
    const text = state.englishText;
    if (!text?.trim()) return;
    try {
      setLoading('Translating...');
      const translated = await api.translateText(text, state.selectedLanguage);
      setFields({ nativeTranslation: translated });
      setLoading(null);
    } catch (err) {
      setLoading(null);
      showError(err.response?.data?.detail || 'Translation error');
    }
  }, [state.englishText, state.selectedLanguage, setFields, setLoading, showError]);

  return (
    <div className="space-y-4">
      {/* Language selector */}
      <div>
        <label className="block text-[13px] font-medium text-gray-500 mb-1.5">Target language</label>
        <div className="relative">
          <select
            value={state.selectedLanguage}
            onChange={(e) => setField('selectedLanguage', e.target.value)}
            className="w-full appearance-none bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 text-[14px] text-gray-800 focus:outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100 transition-all pr-8"
          >
            {Object.entries(TARGET_LANGUAGES).map(([name, code]) => (
              <option key={code} value={code}>{name}</option>
            ))}
          </select>
          <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
        </div>
      </div>

      {/* Text input */}
      <div>
        <label className="block text-[13px] font-medium text-gray-500 mb-1.5">English text</label>
        <textarea
          value={state.englishText}
          onChange={(e) => setField('englishText', e.target.value)}
          placeholder="Type or paste English text here..."
          rows={4}
          className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 text-[14px] text-gray-800 placeholder-gray-300 focus:outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100 transition-all resize-none"
        />
      </div>

      <button
        onClick={handleTranslate}
        disabled={!state.englishText?.trim()}
        className="flex items-center gap-2 bg-gray-900 text-white rounded-xl px-5 py-2.5 text-[14px] font-semibold hover:bg-gray-700 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
      >
        <Languages className="w-4 h-4" />
        Translate
      </button>
    </div>
  );
}
