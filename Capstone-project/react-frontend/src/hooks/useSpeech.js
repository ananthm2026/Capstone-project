import { useCallback } from 'react';
import { useApp } from '../context/AppContext';

export function useSpeech() {
  const { state, setField } = useApp();
  const isPlaying = state.isSpeaking ?? false;

  const speak = useCallback((text, langOverride) => {
    if (!text?.trim()) return;

    // If currently playing, stop it
    if (window.speechSynthesis.speaking) {
      window.speechSynthesis.cancel();
      setField('isSpeaking', false);
      return;
    }

    const lang = langOverride || state.selectedLanguage || 'en-IN';

    const doSpeak = (voices) => {
      const langPrefix = lang.split('-')[0];
      let voice = null;

      if (state.selectedVoice) {
        voice = voices.find(v => v.voiceURI === state.selectedVoice);
      }
      if (!voice) {
        voice = voices.find(v => v.lang === lang)
             || voices.find(v => v.lang.startsWith(langPrefix));
      }

      const utter = new SpeechSynthesisUtterance(text);
      if (voice) utter.voice = voice;
      utter.lang = lang;
      utter.rate = 0.95;
      utter.pitch = 1;

      utter.onstart = () => setField('isSpeaking', true);
      utter.onend   = () => setField('isSpeaking', false);
      utter.onerror = () => setField('isSpeaking', false);

      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(utter);
    };

    const voices = window.speechSynthesis.getVoices();
    if (voices.length > 0) {
      doSpeak(voices);
    } else {
      window.speechSynthesis.onvoiceschanged = () => {
        doSpeak(window.speechSynthesis.getVoices());
        window.speechSynthesis.onvoiceschanged = null;
      };
    }
  }, [state.selectedVoice, state.selectedLanguage, setField]);

  const stop = useCallback(() => {
    window.speechSynthesis.cancel();
    setField('isSpeaking', false);
  }, [setField]);

  return { isPlaying, speak, stop };
}
