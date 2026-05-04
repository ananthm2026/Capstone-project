import { createContext, useContext, useReducer, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const AppContext = createContext(null);

const initialState = {
  // Recording
  isRecording: false,
  recordingTime: 0,

  // Transcription / Translation
  englishText: '',
  nativeTranscript: '',
  rewrittenText: '',
  nativeTranslation: '',
  confidenceScore: null,

  // Tone / Language
  selectedTone: '',
  customTone: '',
  selectedLanguage: 'hi-IN',
  selectedLanguageName: 'Hindi',

  // Continuous
  continuousLines: [],
  continuousState: 'idle', // idle | listening | paused | ended

  // History
  transcriptHistory: [],
  starredIds: [],

  // Usage
  usageStats: { sarvamCalls: 0, geminiCalls: 0, cacheHits: 0 },

  // UI
  loading: false,
  error: null,
  success: null,
  floatingAssistantEnabled: false,
  integrationSettings: {
    slack: { enabled: true, webhook: '' },
    whatsapp: { enabled: true, phone: '' },
    linkedin: { enabled: true },
    email: { enabled: true, recipient: '' },
  },
};

function reducer(state, action) {
  switch (action.type) {
    case 'SET_FIELD':
      return { ...state, [action.key]: action.value };
    case 'SET_FIELDS':
      return { ...state, ...action.fields };
    case 'CLEAR_ALL':
      return {
        ...state,
        englishText: '',
        nativeTranscript: '',
        rewrittenText: '',
        nativeTranslation: '',
        confidenceScore: null,
        selectedTone: '',
        customTone: '',
        isRecording: false,
        recordingTime: 0,
      };
    case 'ADD_HISTORY': {
      const hist = [action.entry, ...state.transcriptHistory].slice(0, 50);
      return { ...state, transcriptHistory: hist };
    }
    case 'DELETE_HISTORY':
      return {
        ...state,
        transcriptHistory: state.transcriptHistory.filter((_, i) => i !== action.index),
      };
    case 'CLEAR_HISTORY':
      return { ...state, transcriptHistory: [] };
    case 'TOGGLE_STAR': {
      const ids = state.starredIds.includes(action.id)
        ? state.starredIds.filter((x) => x !== action.id)
        : [...state.starredIds, action.id];
      return { ...state, starredIds: ids };
    }
    case 'INCREMENT_USAGE':
      return {
        ...state,
        usageStats: {
          ...state.usageStats,
          [action.key]: (state.usageStats[action.key] || 0) + 1,
        },
      };
    case 'SET_LOADING':
      return { ...state, loading: action.value };
    case 'SET_ERROR':
      return { ...state, error: action.value, loading: false };
    case 'SET_SUCCESS':
      return { ...state, success: action.value };
    case 'CLEAR_NOTIFICATION':
      return { ...state, error: null, success: null };
    default:
      return state;
  }
}

export function AppProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, initialState);

  const setField = useCallback((key, value) => dispatch({ type: 'SET_FIELD', key, value }), []);
  const setFields = useCallback((fields) => dispatch({ type: 'SET_FIELDS', fields }), []);
  const clearAll = useCallback(() => dispatch({ type: 'CLEAR_ALL' }), []);
  const setLoading = useCallback((value) => dispatch({ type: 'SET_LOADING', value }), []);
  const showError = useCallback((msg) => dispatch({ type: 'SET_ERROR', value: msg }), []);
  const showSuccess = useCallback((msg) => dispatch({ type: 'SET_SUCCESS', value: msg }), []);
  const clearNotification = useCallback(() => dispatch({ type: 'CLEAR_NOTIFICATION' }), []);
  const addHistory = useCallback((entry) => dispatch({ type: 'ADD_HISTORY', entry }), []);
  const deleteHistory = useCallback((index) => dispatch({ type: 'DELETE_HISTORY', index }), []);
  const clearHistory = useCallback(() => dispatch({ type: 'CLEAR_HISTORY' }), []);
  const toggleStar = useCallback((id) => dispatch({ type: 'TOGGLE_STAR', id }), []);
  const incrementUsage = useCallback((key) => dispatch({ type: 'INCREMENT_USAGE', key }), []);

  return (
    <AppContext.Provider
      value={{
        state,
        dispatch,
        setField,
        setFields,
        clearAll,
        setLoading,
        showError,
        showSuccess,
        clearNotification,
        addHistory,
        deleteHistory,
        clearHistory,
        toggleStar,
        incrementUsage,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}
