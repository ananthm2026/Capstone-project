import { Sparkles } from 'lucide-react';
import { useCallback } from 'react';
import { useApp } from '../context/AppContext';
import * as api from '../services/api';

export default function ToneSection() {
  const { state, setField, setFields, setLoading, showError, TONES } = useApp();

  const handleToneChange = useCallback(async (tone) => {
    setField('selectedTone', tone);
    if (!state.englishText?.trim()) return;
    try {
      setLoading('Rewriting tone...');
      const rewritten = await api.rewriteTone(state.englishText, tone, tone === 'User Override' ? state.customTone : null);
      setFields({ rewrittenText: rewritten });
      setLoading(null);
    } catch (err) {
      setLoading(null);
      showError(err.response?.data?.detail || 'Tone rewrite error');
    }
  }, [state.englishText, state.customTone, setField, setFields, setLoading, showError]);

  const handleCustomApply = useCallback(async () => {
    if (!state.englishText?.trim()) return;
    try {
      setLoading('Rewriting tone...');
      const rewritten = await api.rewriteTone(state.englishText, 'User Override', state.customTone || null);
      setFields({ rewrittenText: rewritten });
      setLoading(null);
    } catch (err) {
      setLoading(null);
      showError(err.response?.data?.detail || 'Tone rewrite error');
    }
  }, [state.englishText, state.customTone, setFields, setLoading, showError]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {TONES.map((tone) => (
          <button
            key={tone}
            onClick={() => handleToneChange(tone)}
            className={`px-4 py-2 rounded-xl text-[13px] font-semibold transition-all border ${
              state.selectedTone === tone
                ? 'bg-gray-900 text-white border-gray-900 shadow-sm'
                : 'bg-gray-50 text-gray-500 border-gray-200 hover:border-gray-300 hover:text-gray-800 hover:bg-white'
            }`}
          >
            {tone}
          </button>
        ))}
      </div>

      {state.selectedTone === 'User Override' && (
        <div className="space-y-2 pt-1">
          <input
            type="text"
            value={state.customTone}
            onChange={(e) => setField('customTone', e.target.value)}
            placeholder="e.g. Formal but with bullet points"
            className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 text-[14px] text-gray-800 placeholder-gray-300 focus:outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100 transition-all"
          />
          <button
            onClick={handleCustomApply}
            className="flex items-center gap-2 bg-gray-900 text-white rounded-xl px-5 py-2.5 text-[14px] font-semibold hover:bg-gray-700 transition-colors"
          >
            <Sparkles className="w-4 h-4" />
            Apply
          </button>
        </div>
      )}
    </div>
  );
}
