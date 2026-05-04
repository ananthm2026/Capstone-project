import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useUser } from '@clerk/clerk-react';
import {
  ArrowRightLeft,
  BarChart3,
  Check,
  Copy,
  Download,
  Globe,
  Layers3,
  Loader2,
  Mic,
  Send,
  Sparkles,
  Volume2,
  Wand2,
  X,
} from 'lucide-react';
import RecordingControls from '../components/RecordingControls';
import { useApp } from '../context/AppContext';
import { useSpeech } from '../hooks/useSpeech';
import { getLabels } from '../services/uiLabels';
import * as api from '../services/api';

const TONE_OPTIONS = ['Email Formal', 'Email Casual', 'Slack', 'LinkedIn', 'WhatsApp Business', 'Custom'];

const CHANNEL_BY_TONE = {
  'Email Formal': 'email',
  'Email Casual': 'email',
  Slack: 'slack',
  LinkedIn: 'linkedin',
  'WhatsApp Business': 'whatsapp',
  Custom: 'generic',
};

function StatChip({ icon: Icon, label, value }) {
  return (
    <div className="flex items-center gap-2 rounded-full border border-[var(--border-warm)] bg-[var(--surface)] px-3 py-1.5 text-[12px]">
      <Icon className="h-3.5 w-3.5 text-[var(--saffron)]" />
      <span className="text-[var(--text-muted)]">{label}</span>
      <span className="font-semibold text-[var(--text-ink)]">{value}</span>
    </div>
  );
}

function ActionButton({ onClick, disabled, children, tone = 'default' }) {
  const toneClass =
    tone === 'primary'
      ? 'bg-[var(--surface-ink)] text-white hover:opacity-90'
      : tone === 'accent'
        ? 'bg-[var(--saffron)] text-white hover:bg-[var(--saffron-hover)]'
        : 'bg-[var(--surface)] text-[var(--text-warm)] border border-[var(--border-warm)] hover:bg-[var(--bg)]';

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center justify-center gap-2 rounded-xl px-3 py-2 text-[13px] font-semibold transition-all disabled:cursor-not-allowed disabled:opacity-40 ${toneClass}`}
    >
      {children}
    </button>
  );
}

export default function Home() {
  const { user } = useUser();
  const {
    state,
    setField,
    setFields,
    showError,
    showSuccess,
    addHistory,
    incrementUsage,
    TARGET_LANGUAGES,
  } = useApp();
  const { isPlaying, speak, stop } = useSpeech();
  const labels = getLabels(state.uiLanguage);

  const [editableTranscript, setEditableTranscript] = useState('');
  const [rewrittenText, setRewrittenText] = useState('');
  const [translatedText, setTranslatedText] = useState('');
  const [selectedTone, setSelectedTone] = useState('Email Formal');
  const [customTone, setCustomTone] = useState('');
  const [viewMode, setViewMode] = useState('transcript');
  const [isTranslating, setIsTranslating] = useState(false);
  const [isRewriting, setIsRewriting] = useState(false);
  const [sentiment, setSentiment] = useState(null);

  const previousEnglishRef = useRef('');

  useEffect(() => {
    setEditableTranscript(state.englishText || '');
  }, [state.englishText]);

  useEffect(() => {
    if (!state.englishText?.trim() || state.englishText === previousEnglishRef.current) {
      return;
    }

    previousEnglishRef.current = state.englishText;
    addHistory({
      text: state.englishText,
      lang: state.selectedLanguage,
      timestamp: new Date().toISOString(),
      confidence: state.confidenceScore,
    });

    api.analyzeSentiment(state.englishText).then(setSentiment).catch(() => {
      setSentiment(null);
    });

    if (user?.id && !state.n2eSessionId) {
      api
        .saveNativeToEnglishSession({
          userId: user.id,
          originalLanguage: state.selectedLanguage || 'hi-IN',
          originalText: state.nativeTranscript || state.englishText || '',
          translatedText: state.englishText || '',
        })
        .then((result) => {
          if (result?.session_id) {
            setField('n2eSessionId', result.session_id);
          }
        })
        .catch(() => {});
    }
  }, [
    addHistory,
    setField,
    state.confidenceScore,
    state.englishText,
    state.n2eSessionId,
    state.nativeTranscript,
    state.selectedLanguage,
    user?.id,
  ]);

  const transcriptWords = useMemo(() => {
    return editableTranscript?.trim() ? editableTranscript.trim().split(/\s+/).length : 0;
  }, [editableTranscript]);

  const activeContent = useMemo(() => {
    if (viewMode === 'translated') return translatedText;
    if (viewMode === 'rewritten') return rewrittenText;
    return editableTranscript;
  }, [editableTranscript, rewrittenText, translatedText, viewMode]);

  const activeWordCount = useMemo(() => {
    return activeContent?.trim() ? activeContent.trim().split(/\s+/).length : 0;
  }, [activeContent]);

  const confidencePercent = useMemo(() => {
    if (state.confidenceScore == null) return null;
    return Math.max(0, Math.min(100, Math.round(state.confidenceScore * 100)));
  }, [state.confidenceScore]);

  const handleLanguageChange = useCallback(
    (lang) => {
      setFields({ selectedLanguage: lang });
      setTranslatedText('');
      if (viewMode === 'translated') setViewMode('transcript');
    },
    [setFields, viewMode]
  );

  const handleTranslate = useCallback(async () => {
    const source = viewMode === 'rewritten' ? rewrittenText : editableTranscript;
    if (!source?.trim()) return;

    setIsTranslating(true);
    try {
      const translated = await api.translateText(source, state.selectedLanguage, user?.id || null);
      setTranslatedText(translated || '');
      setViewMode('translated');
      incrementUsage('sarvamCalls');
    } catch (error) {
      showError(error?.response?.data?.detail || 'Translation failed');
    } finally {
      setIsTranslating(false);
    }
  }, [editableTranscript, incrementUsage, rewrittenText, showError, state.selectedLanguage, user?.id, viewMode]);

  const handleRewrite = useCallback(async () => {
    const source = editableTranscript;
    if (!source?.trim()) return;

    const tone = selectedTone === 'Custom' ? 'User Override' : selectedTone;
    const override = selectedTone === 'Custom' ? customTone.trim() : null;

    if (selectedTone === 'Custom' && !override) {
      showError('Add a custom tone description first.');
      return;
    }

    setIsRewriting(true);
    try {
      const rewritten = await api.rewriteTone(source, tone, override);
      setRewrittenText(rewritten || '');
      setViewMode('rewritten');
      incrementUsage('geminiCalls');

      if (state.n2eSessionId) {
        api
          .saveNativeToEnglishTranscription({
            sessionId: state.n2eSessionId,
            originalTranscript: source,
            toneApplied: selectedTone,
            rewrittenText: rewritten,
            customToneDesc: override,
            confidenceScore: state.confidenceScore || null,
          })
          .catch(() => {});
      }
    } catch (error) {
      showError(error?.response?.data?.detail || 'Tone rewrite failed');
    } finally {
      setIsRewriting(false);
    }
  }, [
    customTone,
    editableTranscript,
    incrementUsage,
    selectedTone,
    showError,
    state.confidenceScore,
    state.n2eSessionId,
  ]);

  const handleCopy = useCallback(() => {
    if (!activeContent?.trim()) return;
    navigator.clipboard.writeText(activeContent).then(() => {
      showSuccess('Copied to clipboard');
    });
  }, [activeContent, showSuccess]);

  const handleSend = useCallback(() => {
    const content = activeContent?.trim();
    if (!content) return;

    const inferredChannel = CHANNEL_BY_TONE[selectedTone] || 'generic';

    if (inferredChannel === 'email') {
      let subject = 'Message from SeedlingSpeaks';
      let body = content;
      const subjectMatch = content.match(/^Subject:\s*(.+?)[\r\n]/i);
      if (subjectMatch) {
        subject = subjectMatch[1].trim();
        body = content.replace(/^Subject:\s*.+?[\r\n]+/i, '').trim();
      }
      window.open(
        `https://mail.google.com/mail/?view=cm&fs=1&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`,
        '_blank'
      );
      return;
    }

    if (inferredChannel === 'whatsapp') {
      window.open(`https://wa.me/?text=${encodeURIComponent(content)}`, '_blank');
      return;
    }

    if (inferredChannel === 'linkedin') {
      navigator.clipboard.writeText(content).catch(() => {});
      window.open('https://www.linkedin.com/feed/', '_blank');
      showSuccess('Copied. Paste into LinkedIn.');
      return;
    }

    if (inferredChannel === 'slack') {
      navigator.clipboard.writeText(content).catch(() => {});
      window.open('https://app.slack.com/client', '_blank');
      showSuccess('Copied. Paste into Slack.');
      return;
    }

    navigator.clipboard.writeText(content).then(() => showSuccess('Copied to clipboard'));
  }, [activeContent, selectedTone, showSuccess]);

  const handleDownload = useCallback(() => {
    if (!activeContent?.trim()) return;
    const blob = new Blob([activeContent], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `seedlingspeaks-${viewMode}.txt`;
    link.click();
    URL.revokeObjectURL(url);
  }, [activeContent, viewMode]);

  const handleClear = useCallback(() => {
    setFields({
      englishText: '',
      nativeTranscript: '',
      nativeTranslation: '',
      confidenceScore: null,
    });
    setEditableTranscript('');
    setRewrittenText('');
    setTranslatedText('');
    setSentiment(null);
    setViewMode('transcript');
    stop();
  }, [setFields, stop]);

  const topTitle = labels.speechToText || 'Speech Workspace';
  const hasTranscript = !!editableTranscript?.trim();

  return (
    <div className="min-h-screen bg-[var(--bg)] px-5 py-6 lg:px-8">
      <section className="mx-auto mb-6 max-w-[1200px] overflow-hidden rounded-[28px] border border-[var(--border-warm)] bg-[var(--surface)] shadow-[var(--shadow-md)]">
        <div className="relative px-6 py-7 lg:px-8 lg:py-8">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute right-0 top-0 h-40 w-56 rounded-bl-[80px] bg-gradient-to-b from-[var(--saffron-light)] to-transparent"
          />
          <div className="relative flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="mb-2 inline-flex items-center gap-2 rounded-full border border-[var(--border-accent)] bg-[var(--saffron-light)] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--saffron)]">
                <Sparkles className="h-3 w-3" />
                Live Language Studio
              </p>
              <h1 className="text-[30px] font-semibold leading-tight text-[var(--text-ink)] lg:text-[38px]">{topTitle}</h1>
              <p className="mt-2 max-w-[720px] text-[15px] leading-relaxed text-[var(--text-warm)]">
                Capture speech, shape tone, and ship polished messages in a single workspace.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <StatChip icon={Layers3} label="Words" value={transcriptWords} />
              {confidencePercent != null && <StatChip icon={BarChart3} label="Confidence" value={`${confidencePercent}%`} />}
              <StatChip
                icon={Globe}
                label="Target"
                value={Object.keys(TARGET_LANGUAGES).find((k) => TARGET_LANGUAGES[k] === state.selectedLanguage) || 'Language'}
              />
            </div>
          </div>
        </div>
      </section>

      {!hasTranscript && (
        <section className="mx-auto grid max-w-[1200px] gap-6 lg:grid-cols-[1.3fr_1fr]">
          <div className="rounded-[28px] border border-[var(--border-warm)] bg-[var(--surface)] p-7 shadow-[var(--shadow-sm)]">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--text-faded)]">Ready State</p>
            <h2 className="mt-3 text-[28px] font-semibold text-[var(--text-ink)]">Start speaking to populate your canvas</h2>
            <p className="mt-3 max-w-[520px] text-[15px] leading-relaxed text-[var(--text-warm)]">
              Hold Start Speaking to record in real-time. The transcript will appear here with confidence and sentiment context.
            </p>
            <div className="mt-6 flex justify-center lg:justify-start">
              <RecordingControls />
            </div>
          </div>

          <div className="rounded-[28px] border border-[var(--border-warm)] bg-[var(--surface)] p-7 shadow-[var(--shadow-sm)]">
            <h3 className="text-[18px] font-semibold text-[var(--text-ink)]">What is new on this page</h3>
            <ul className="mt-4 space-y-3 text-[14px] leading-relaxed text-[var(--text-warm)]">
              <li>One canvas for transcript, retoned draft, and translation.</li>
              <li>A dedicated right rail for language and tone controls.</li>
              <li>Faster send flow based on tone context.</li>
            </ul>
          </div>
        </section>
      )}

      {hasTranscript && (
        <section className="mx-auto grid max-w-[1200px] gap-6 lg:grid-cols-[1.8fr_1fr]">
          <div className="overflow-hidden rounded-[28px] border border-[var(--border-warm)] bg-[var(--surface)] shadow-[var(--shadow-sm)]">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border)] px-5 py-3">
              <div className="inline-flex rounded-xl border border-[var(--border-warm)] bg-[var(--bg)] p-1">
                <button
                  onClick={() => setViewMode('transcript')}
                  className={`rounded-lg px-3 py-1.5 text-[12px] font-semibold ${viewMode === 'transcript' ? 'bg-[var(--surface-ink)] text-white' : 'text-[var(--text-warm)]'}`}
                >
                  Transcript
                </button>
                <button
                  onClick={() => rewrittenText && setViewMode('rewritten')}
                  className={`rounded-lg px-3 py-1.5 text-[12px] font-semibold ${viewMode === 'rewritten' ? 'bg-[var(--surface-ink)] text-white' : 'text-[var(--text-warm)]'} ${!rewrittenText ? 'opacity-40' : ''}`}
                >
                  Retoned
                </button>
                <button
                  onClick={() => translatedText && setViewMode('translated')}
                  className={`rounded-lg px-3 py-1.5 text-[12px] font-semibold ${viewMode === 'translated' ? 'bg-[var(--surface-ink)] text-white' : 'text-[var(--text-warm)]'} ${!translatedText ? 'opacity-40' : ''}`}
                >
                  Translation
                </button>
              </div>

              <div className="text-[12px] text-[var(--text-faded)]">{activeWordCount} words</div>
            </div>

            <textarea
              value={activeContent}
              onChange={(event) => {
                if (viewMode === 'transcript') setEditableTranscript(event.target.value);
                if (viewMode === 'rewritten') setRewrittenText(event.target.value);
              }}
              readOnly={viewMode === 'translated'}
              className="h-[430px] w-full resize-none border-none bg-transparent px-6 py-5 text-[16px] leading-8 text-[var(--text-ink)] outline-none"
            />

            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--border)] px-5 py-3">
              <div className="text-[12px] text-[var(--text-faded)]">
                {activeContent?.length || 0} chars
                {sentiment?.sentiment ? ` · sentiment ${sentiment.sentiment}` : ''}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <ActionButton onClick={handleCopy} disabled={!activeContent?.trim()}>
                  <Copy className="h-3.5 w-3.5" />
                  Copy
                </ActionButton>
                <ActionButton onClick={() => speak(activeContent, viewMode === 'translated' ? state.selectedLanguage : 'en-IN')} disabled={!activeContent?.trim()}>
                  {isPlaying ? <X className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
                  {isPlaying ? 'Stop' : 'Speak'}
                </ActionButton>
                <ActionButton onClick={handleClear}>
                  <X className="h-3.5 w-3.5" />
                  Clear
                </ActionButton>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div className="rounded-[24px] border border-[var(--border-warm)] bg-[var(--surface)] p-5 shadow-[var(--shadow-sm)]">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--text-faded)]">Language</p>
              <select
                value={state.selectedLanguage}
                onChange={(event) => handleLanguageChange(event.target.value)}
                className="w-full rounded-xl border border-[var(--border-warm)] bg-[var(--surface)] px-3 py-2.5 text-[14px] font-medium text-[var(--text-ink)] outline-none"
              >
                {Object.entries(TARGET_LANGUAGES).map(([name, code]) => (
                  <option key={code} value={code}>
                    {name}
                  </option>
                ))}
              </select>

              <div className="mt-3">
                <ActionButton onClick={handleTranslate} disabled={!editableTranscript?.trim() || isTranslating} tone="accent">
                  {isTranslating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ArrowRightLeft className="h-3.5 w-3.5" />}
                  Translate
                </ActionButton>
              </div>
            </div>

            <div className="rounded-[24px] border border-[var(--border-warm)] bg-[var(--surface)] p-5 shadow-[var(--shadow-sm)]">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--text-faded)]">Retone</p>
              <select
                value={selectedTone}
                onChange={(event) => setSelectedTone(event.target.value)}
                className="w-full rounded-xl border border-[var(--border-warm)] bg-[var(--surface)] px-3 py-2.5 text-[14px] font-medium text-[var(--text-ink)] outline-none"
              >
                {TONE_OPTIONS.map((tone) => (
                  <option key={tone} value={tone}>
                    {tone}
                  </option>
                ))}
              </select>
              {selectedTone === 'Custom' && (
                <input
                  value={customTone}
                  onChange={(event) => setCustomTone(event.target.value)}
                  placeholder="Describe your custom tone"
                  className="mt-2 w-full rounded-xl border border-[var(--border-warm)] bg-[var(--surface)] px-3 py-2.5 text-[14px] outline-none"
                />
              )}
              <div className="mt-3">
                <ActionButton onClick={handleRewrite} disabled={!editableTranscript?.trim() || isRewriting} tone="primary">
                  {isRewriting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wand2 className="h-3.5 w-3.5" />}
                  Apply tone
                </ActionButton>
              </div>
            </div>

            <div className="rounded-[24px] border border-[var(--border-warm)] bg-[var(--surface)] p-5 shadow-[var(--shadow-sm)]">
              <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--text-faded)]">Actions</p>
              <div className="grid grid-cols-2 gap-2">
                <ActionButton onClick={handleSend} disabled={!activeContent?.trim()} tone="accent">
                  <Send className="h-3.5 w-3.5" />
                  Send
                </ActionButton>
                <ActionButton onClick={handleDownload} disabled={!activeContent?.trim()}>
                  <Download className="h-3.5 w-3.5" />
                  Export
                </ActionButton>
                <ActionButton onClick={handleCopy} disabled={!activeContent?.trim()}>
                  <Check className="h-3.5 w-3.5" />
                  Copy
                </ActionButton>
                <ActionButton onClick={handleClear}>
                  <X className="h-3.5 w-3.5" />
                  Reset
                </ActionButton>
              </div>
            </div>

            <div className="rounded-[24px] border border-[var(--border-warm)] bg-[var(--surface)] p-5 shadow-[var(--shadow-sm)]">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--text-faded)]">Record again</p>
              <RecordingControls />
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
