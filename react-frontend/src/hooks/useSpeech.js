import { useCallback, useRef } from 'react';
import { useApp } from '../context/AppContext';
import * as api from '../services/api';

export function useSpeech() {
  const { state, setField } = useApp();
  const audioRef = useRef(null);
  const isPlaying = state.isSpeaking ?? false;

  const speak = useCallback(async (text, langOverride) => {
    if (!text?.trim()) return;

    // Toggle off if already playing
    if (isPlaying) {
      audioRef.current?.pause();
      audioRef.current = null;
      setField('isSpeaking', false);
      return;
    }

    const lang    = langOverride || state.selectedLanguage || 'hi-IN';
    const speaker = state.selectedSarvamVoice || 'meera';

    setField('isSpeaking', true);
    try {
      const blob  = await api.textToSpeech(text, lang, speaker);
      const url   = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.onended = () => { setField('isSpeaking', false); URL.revokeObjectURL(url); };
      audio.onerror = () => { setField('isSpeaking', false); URL.revokeObjectURL(url); };
      audio.play();
    } catch {
      setField('isSpeaking', false);
    }
  }, [isPlaying, state.selectedLanguage, state.selectedSarvamVoice, setField]);

  const stop = useCallback(() => {
    audioRef.current?.pause();
    audioRef.current = null;
    setField('isSpeaking', false);
  }, [setField]);

  return { isPlaying, speak, stop };
}
