import { createContext, useContext, useReducer, useCallback } from 'react';

const AppContext = createContext();

const RECORDING_MODES = {
  PUSH_TO_TALK: 'pushToTalk',
  CONTINUOUS: 'continuous',
  FILE_UPLOAD: 'fileUpload',
};

const TARGET_LANGUAGES = {
  Hindi: 'hi-IN',
  Bengali: 'bn-IN',
  Tamil: 'ta-IN',
  Telugu: 'te-IN',
  Malayalam: 'ml-IN',
  Marathi: 'mr-IN',
  Gujarati: 'gu-IN',
  Kannada: 'kn-IN',
  Punjabi: 'pa-IN',
  Odia: 'or-IN',
};

const TONES = ['Email Formal', 'Email Casual', 'Slack', 'LinkedIn', 'WhatsApp Business', 'User Override'];

// Load persisted channel credentials from localStorage
function loadCredentials() {
  try { return JSON.parse(localStorage.getItem('channelCredentials') || '{}'); }
  catch { return {}; }
}

// Widget always starts disabled — user must re-enable each session
localStorage.removeItem('widgetEnabled');

// Load transcript history from localStorage
function loadHistory() {
  try { return JSON.parse(localStorage.getItem('transcriptHistory') || '[]'); }
  catch { return []; }
}

// Load custom dictionary from localStorage
function loadDictionary() {
  try { return JSON.parse(localStorage.getItem('customDictionary') || '[]'); }
  catch { return []; }
}

const initialState = {
  authUser: null, // Managed by Clerk, not persisted to localStorage
    n2eSessionId: null,
  recordingMode: null,
  isRecording: false,
  isPushToTalkPressed: false,
  isSpeechDetected: false,
  currentAmplitude: 0,
  englishText: '',
  nativeTranscript: '',
  rewrittenText: '',
  nativeTranslation: '',
  confidenceScore: null,       // 0-1 float from Sarvam
  selectedTone: 'Email Formal',
  customTone: '',
  selectedLanguage: localStorage.getItem('defaultLanguage') || 'hi-IN',
  selectedVoice: null,
  selectedSarvamVoice: localStorage.getItem('selectedSarvamVoice') || 'meera',
  isSpeaking: false,
  isPlayingEnglish: false,
  isPlayingRewritten: false,
  isPlayingNative: false,
  loading: null,
  error: null,
  success: null,
  channelCredentials: loadCredentials(),
  transcriptHistory: loadHistory(),   // [{ id, text, lang, timestamp, confidence }]
  customDictionary: loadDictionary(), // [{ native, english }]
  savedTemplates: JSON.parse(localStorage.getItem('savedTemplates') || '[]'),
  usageStats: JSON.parse(localStorage.getItem('usageStats') || '{"sarvamCalls":0,"geminiCalls":0,"cacheHits":0}'),
  darkMode: localStorage.getItem('darkMode') === 'true',
  uiLanguage: localStorage.getItem('uiLanguage') || 'en',
  onboardingDone: localStorage.getItem('onboardingDone') === 'true',
  widgetSetupDone: localStorage.getItem('widgetSetupDone') === 'true',
  widgetEnabled: false, // always starts disabled — user must enable each session
  widgetLanguages: JSON.parse(localStorage.getItem('widgetLanguages') || '[]'),
  widgetMode: localStorage.getItem('widgetMode') || 'englishToNative',
  starredIds: JSON.parse(localStorage.getItem('starredIds') || '[]'),
  pinnedTemplateIds: JSON.parse(localStorage.getItem('pinnedTemplateIds') || '[]'),
  historyTags: JSON.parse(localStorage.getItem('historyTags') || '{}'), // { entryId: ['tag1','tag2'] }
  notificationLog: JSON.parse(localStorage.getItem('notificationLog') || '[]'), // [{ id, msg, type, ts }]
  focusMode: false,
  isOnline: true,
};

function reducer(state, action) {
  switch (action.type) {
    case 'LOGIN':
      // Store auth user in state (from Clerk)
      // Clerk JWT is handled automatically via @clerk/clerk-react
      return { ...state, authUser: action.user };
    case 'LOGOUT':
      return { ...state, authUser: null };
    case 'SET_FIELD':
      if (action.field === 'selectedLanguage') {
        localStorage.setItem('defaultLanguage', action.value);
      }
      if (action.field === 'selectedSarvamVoice') {
        localStorage.setItem('selectedSarvamVoice', action.value);
      }
      return { ...state, [action.field]: action.value };
    case 'SET_FIELDS':
      if (action.fields.selectedLanguage) {
        localStorage.setItem('defaultLanguage', action.fields.selectedLanguage);
      }
      return { ...state, ...action.fields };
    case 'CLEAR_ALL':
      return {
        ...state,
        englishText: '',
        nativeTranscript: '',
        rewrittenText: '',
        nativeTranslation: '',
        confidenceScore: null,
        isPlayingEnglish: false,
        isPlayingRewritten: false,
        isPlayingNative: false,
      };
    case 'SAVE_CREDENTIALS':
      localStorage.setItem('channelCredentials', JSON.stringify(action.credentials));
      return { ...state, channelCredentials: action.credentials };
    case 'ADD_HISTORY': {
      const entry = { id: Date.now(), ...action.entry };
      const updated = [entry, ...state.transcriptHistory].slice(0, 50); // keep last 50
      localStorage.setItem('transcriptHistory', JSON.stringify(updated));
      return { ...state, transcriptHistory: updated };
    }
    case 'DELETE_HISTORY': {
      const updated = state.transcriptHistory.filter(h => h.id !== action.id);
      localStorage.setItem('transcriptHistory', JSON.stringify(updated));
      return { ...state, transcriptHistory: updated };
    }
    case 'CLEAR_HISTORY':
      localStorage.removeItem('transcriptHistory');
      return { ...state, transcriptHistory: [] };
    case 'SAVE_DICTIONARY':
      localStorage.setItem('customDictionary', JSON.stringify(action.dictionary));
      return { ...state, customDictionary: action.dictionary };
    case 'SAVE_TEMPLATES':
      localStorage.setItem('savedTemplates', JSON.stringify(action.templates));
      return { ...state, savedTemplates: action.templates };
    case 'INCREMENT_USAGE': {
      const updated = { ...state.usageStats, [action.key]: (state.usageStats[action.key] || 0) + 1 };
      localStorage.setItem('usageStats', JSON.stringify(updated));
      return { ...state, usageStats: updated };
    }
    case 'TOGGLE_DARK': {
      const next = !state.darkMode;
      localStorage.setItem('darkMode', String(next));
      return { ...state, darkMode: next };
    }
    case 'SET_UI_LANGUAGE':
      localStorage.setItem('uiLanguage', action.value);
      return { ...state, uiLanguage: action.value };
    case 'SET_ONBOARDING_DONE':
      localStorage.setItem('onboardingDone', 'true');
      return { ...state, onboardingDone: true };
    case 'SET_WIDGET_SETUP_DONE':
      localStorage.setItem('widgetSetupDone', 'true');
      return { ...state, widgetSetupDone: true };
    case 'SET_WIDGET_ENABLED':
      localStorage.setItem('widgetEnabled', String(action.value));
      return { ...state, widgetEnabled: action.value };
    case 'SET_WIDGET_LANGUAGES':
      localStorage.setItem('widgetLanguages', JSON.stringify(action.value));
      return { ...state, widgetLanguages: action.value };
    case 'SET_WIDGET_MODE':
      localStorage.setItem('widgetMode', action.value);
      return { ...state, widgetMode: action.value };
    case 'TOGGLE_STAR': {
      const starred = state.starredIds.includes(action.id)
        ? state.starredIds.filter(i => i !== action.id)
        : [...state.starredIds, action.id];
      localStorage.setItem('starredIds', JSON.stringify(starred));
      return { ...state, starredIds: starred };
    }
    case 'TOGGLE_PIN_TEMPLATE': {
      const pinned = state.pinnedTemplateIds.includes(action.id)
        ? state.pinnedTemplateIds.filter(i => i !== action.id)
        : [...state.pinnedTemplateIds, action.id].slice(0, 3); // max 3 pinned
      localStorage.setItem('pinnedTemplateIds', JSON.stringify(pinned));
      return { ...state, pinnedTemplateIds: pinned };
    }
    case 'SET_HISTORY_TAGS': {
      const updated = { ...state.historyTags, [action.entryId]: action.tags };
      localStorage.setItem('historyTags', JSON.stringify(updated));
      return { ...state, historyTags: updated };
    }
    case 'ADD_NOTIFICATION_LOG': {
      const entry = { id: Date.now(), msg: action.msg, type: action.notifType || 'info', ts: new Date().toISOString() };
      const updated = [entry, ...state.notificationLog].slice(0, 50);
      localStorage.setItem('notificationLog', JSON.stringify(updated));
      return { ...state, notificationLog: updated };
    }
    case 'CLEAR_NOTIFICATION_LOG':
      localStorage.removeItem('notificationLog');
      return { ...state, notificationLog: [] };
    case 'TOGGLE_FOCUS_MODE':
      return { ...state, focusMode: !state.focusMode };
    case 'SET_ONLINE':
      return { ...state, isOnline: action.value };
    case 'CLEAR_NOTIFICATION':
      return { ...state, error: null, success: null };
    default:
      return state;
  }
}

export function AppProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, initialState);

  const setField = useCallback((field, value) => {
    dispatch({ type: 'SET_FIELD', field, value });
  }, []);

  const setFields = useCallback((fields) => {
    dispatch({ type: 'SET_FIELDS', fields });
  }, []);

  const clearAll = useCallback(() => {
    dispatch({ type: 'CLEAR_ALL' });
  }, []);

  const showError = useCallback((msg) => {
    dispatch({ type: 'SET_FIELD', field: 'error', value: msg });
    setTimeout(() => dispatch({ type: 'CLEAR_NOTIFICATION' }), 5000);
  }, []);

  const showSuccess = useCallback((msg) => {
    dispatch({ type: 'SET_FIELD', field: 'success', value: msg });
    setTimeout(() => dispatch({ type: 'CLEAR_NOTIFICATION' }), 4000);
  }, []);

  const setLoading = useCallback((msg) => {
    dispatch({ type: 'SET_FIELD', field: 'loading', value: msg });
  }, []);

  const saveCredentials = useCallback((credentials) => {
    dispatch({ type: 'SAVE_CREDENTIALS', credentials });
  }, []);

  const addHistory = useCallback((entry) => {
    dispatch({ type: 'ADD_HISTORY', entry });
  }, []);

  const deleteHistory = useCallback((id) => {
    dispatch({ type: 'DELETE_HISTORY', id });
  }, []);

  const clearHistory = useCallback(() => {
    dispatch({ type: 'CLEAR_HISTORY' });
  }, []);

  const saveDictionary = useCallback((dictionary) => {
    dispatch({ type: 'SAVE_DICTIONARY', dictionary });
  }, []);

  const saveTemplates = useCallback((templates) => {
    dispatch({ type: 'SAVE_TEMPLATES', templates });
  }, []);

  const incrementUsage = useCallback((key) => {
    dispatch({ type: 'INCREMENT_USAGE', key });
  }, []);

  const toggleDark = useCallback(() => dispatch({ type: 'TOGGLE_DARK' }), []);
  const setUiLanguage = useCallback((value) => dispatch({ type: 'SET_UI_LANGUAGE', value }), []);
  const setOnboardingDone = useCallback(() => dispatch({ type: 'SET_ONBOARDING_DONE' }), []);
  const setWidgetSetupDone = useCallback(() => dispatch({ type: 'SET_WIDGET_SETUP_DONE' }), []);
  const setWidgetEnabled = useCallback((value) => dispatch({ type: 'SET_WIDGET_ENABLED', value }), []);
  const setWidgetLanguages = useCallback((value) => dispatch({ type: 'SET_WIDGET_LANGUAGES', value }), []);
  const setWidgetMode = useCallback((value) => dispatch({ type: 'SET_WIDGET_MODE', value }), []);
  const toggleStar = useCallback((id) => dispatch({ type: 'TOGGLE_STAR', id }), []);
  const togglePinTemplate = useCallback((id) => dispatch({ type: 'TOGGLE_PIN_TEMPLATE', id }), []);
  const setHistoryTags = useCallback((entryId, tags) => dispatch({ type: 'SET_HISTORY_TAGS', entryId, tags }), []);
  const addNotificationLog = useCallback((msg, notifType = 'info') => dispatch({ type: 'ADD_NOTIFICATION_LOG', msg, notifType }), []);
  const clearNotificationLog = useCallback(() => dispatch({ type: 'CLEAR_NOTIFICATION_LOG' }), []);
  const toggleFocusMode = useCallback(() => dispatch({ type: 'TOGGLE_FOCUS_MODE' }), []);
  const setOnline = useCallback((value) => dispatch({ type: 'SET_ONLINE', value }), []);
  const login = useCallback((user) => dispatch({ type: 'LOGIN', user }), []);
  const logout = useCallback(() => dispatch({ type: 'LOGOUT' }), []);

  return (
    <AppContext.Provider
      value={{
        state,
        setField,
        setFields,
        clearAll,
        showError,
        showSuccess,
        setLoading,
        saveCredentials,
        addHistory,
        deleteHistory,
        clearHistory,
        saveDictionary,
        saveTemplates,
        incrementUsage,
        toggleDark,
        setUiLanguage,
        setOnboardingDone,
        setWidgetSetupDone,
        setWidgetEnabled,
        setWidgetLanguages,
        setWidgetMode,
        toggleStar,
        togglePinTemplate,
        setHistoryTags,
        addNotificationLog,
        clearNotificationLog,
        toggleFocusMode,
        setOnline,
        login,
        logout,
        RECORDING_MODES,
        TARGET_LANGUAGES,
        TONES,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) throw new Error('useApp must be used within AppProvider');
  return context;
};
