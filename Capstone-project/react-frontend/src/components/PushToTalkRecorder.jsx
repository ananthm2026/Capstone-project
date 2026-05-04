import { useState, useRef, useCallback, useEffect } from 'react';
import { Mic, ChevronDown, AlertCircle } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { useUser } from '@clerk/clerk-react';
import * as api from '../services/api';

export default function PushToTalkRecorder() {
  const { user } = useUser();
  const { state, setField, setFields, setLoading, showError } = useApp();
  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);
  const streamRef = useRef(null);
  const [isHolding, setIsHolding] = useRef(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const recordingIntervalRef = useRef(null);

  const stopMediaStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (recordingIntervalRef.current) {
      clearInterval(recordingIntervalRef.current);
    }
  }, []);

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus' });
      mediaRecorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      recorder.start();
      isHolding.current = true;
      setRecordingTime(0);

      recordingIntervalRef.current = setInterval(() => {
        setRecordingTime((prev) => prev + 1);
      }, 100);
    } catch (err) {
      showError('Microphone permission denied. Please enable microphone access.');
      isHolding.current = false;
    }
  }, [showError]);

  const stopAndSend = useCallback(async () => {
    isHolding.current = false;
    clearInterval(recordingIntervalRef.current);

    return new Promise((resolve) => {
      const recorder = mediaRecorderRef.current;
      if (!recorder || recorder.state === 'inactive') {
        resolve();
        return;
      }

      recorder.onstop = async () => {
        setRecordingTime(0);
        stopMediaStream();

        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        if (blob.size === 0) {
          showError('No audio recorded. Try again.');
          resolve();
          return;
        }

        try {
          setLoading('Translating voice...');

          const result = await api.pushToTalkTranslate(
            blob,
            state.sourceLanguage || 'en-IN',
            state.targetLanguage || 'en'
          );

          setFields({
            englishText: result.transcript || '',
            translatedText: result.translation || '',
          });

          // Save the native-to-english session
          if (user?.id) {
            api.saveNativeToEnglishSession({
              userId: user.id,
              originalLanguage: state.sourceLanguage || 'en-IN',
              originalText: result.native_transcript || result.transcript || '', // Original native STT
              translatedText: result.transcript || ''
            }).then(data => {
              if (data?.session_id) {
                setField('n2eSessionId', data.session_id);
                // Also optionally save the immediate transcription
                api.saveNativeToEnglishTranscription({
                  sessionId: data.session_id,
                  originalTranscript: result.transcript || '',
                  toneApplied: null,
                  rewrittenText: null,
                  confidenceScore: null
                }).catch(console.error);
              }
            }).catch(console.error);
          }

          setLoading(null);
        } catch (err) {
          const errorMsg = err.response?.data?.detail || err.message || 'Translation failed';
          showError(errorMsg);
          setLoading(null);
        }

        resolve();
      };

      recorder.stop();
    });
  }, [state.sourceLanguage, state.targetLanguage, setField, setFields, setLoading, showError, stopMediaStream]);

  // Mouse/touch events for push-to-talk
  const handlePointerDown = useCallback(() => {
    if (!isHolding.current) {
      startRecording();
    }
  }, [startRecording]);

  const handlePointerUp = useCallback(async () => {
    if (isHolding.current) {
      await stopAndSend();
    }
  }, [stopAndSend]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (streamRef.current) {
        stopMediaStream();
      }
    };
  }, [stopMediaStream]);

  const formatTime = (ms) => {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return minutes > 0 ? `${minutes}:${seconds.toString().padStart(2, '0')}` : `${seconds}s`;
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Push-to-Talk Button */}
      <button
        onMouseDown={handlePointerDown}
        onMouseUp={handlePointerUp}
        onMouseLeave={handlePointerUp}
        onTouchStart={handlePointerDown}
        onTouchEnd={handlePointerUp}
        className={`
          relative w-full py-6 px-4 rounded-xl font-semibold text-white
          transition-all duration-75 active:scale-95 select-none
          flex items-center justify-center gap-3 group
          ${
            isHolding.current
              ? 'bg-red-500 shadow-lg shadow-red-500/50'
              : 'bg-gradient-to-r from-violet-500 to-purple-600 hover:shadow-lg hover:shadow-purple-500/30'
          }
        `}
      >
        <Mic size={24} className={isHolding.current ? 'animate-pulse' : ''} />
        <div className="flex flex-col items-center">
          <span className="text-sm sm:text-base">
            {isHolding.current ? 'RECORDING' : 'Press to Talk'}
          </span>
          {isHolding.current && (
            <span className="text-xs opacity-90">{formatTime(recordingTime)}</span>
          )}
        </div>
        {!isHolding.current && (
          <ChevronDown size={18} className="group-active:translate-y-1 transition-transform" />
        )}
      </button>

      {/* Info */}
      <div className="flex items-start gap-2 text-xs text-gray-600 dark:text-gray-400 px-2">
        <AlertCircle size={14} className="mt-0.5 flex-shrink-0" />
        <span>
          Hold down the button to record voice in your native language, then release to translate to{' '}
          <strong>{state.targetLanguage === 'en' ? 'English' : state.targetLanguage}</strong>
        </span>
      </div>

      {/* Language Display */}
      <div className="flex gap-2 justify-between text-xs text-gray-500 dark:text-gray-400">
        <div>
          <span className="font-semibold">From:</span> {state.sourceLanguage || 'en-IN'}
        </div>
        <div>
          <span className="font-semibold">To:</span> {state.targetLanguage || 'en'}
        </div>
      </div>
    </div>
  );
}
