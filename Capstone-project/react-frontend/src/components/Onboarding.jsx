import { useState } from 'react';
import { useApp } from '../context/AppContext';
import { Mic, Globe, Languages, ChevronRight, Sparkles, Check } from 'lucide-react';

const STEPS = [
  {
    icon: Sparkles,
    title: 'Welcome to SeedlingSpeaks',
    desc: 'Your multilingual AI workspace for speech, image, and video translation across Indian languages.',
    cta: 'Get started',
  },
  {
    icon: Mic,
    title: 'Capture in the way you work',
    desc: 'Use Push-to-Talk for quick speech, Continuous Listening for hands-free mode, or upload audio files in seconds.',
    cta: 'Next',
  },
  {
    icon: Globe,
    title: 'Translate beyond voice',
    desc: 'Move between English and 10 Indian languages, scan text from images, and translate uploaded videos too.',
    cta: 'Next',
  },
  {
    icon: Languages,
    title: 'Work faster across every channel',
    desc: 'Refine transcripts with AI tone rewriting, reuse saved content, and keep your multilingual workflow organized in one place.',
    cta: 'Start translating →',
  },
];

export default function Onboarding() {
  const { setOnboardingDone } = useApp();
  const [step, setStep] = useState(0);

  const current = STEPS[step];
  const isLast = step === STEPS.length - 1;

  const handleNext = () => {
    if (isLast) {
      setOnboardingDone();
    } else {
      setStep(s => s + 1);
    }
  };

  return (
    <div className="fixed inset-0 z-[9998] flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-3xl shadow-2xl border border-gray-100 w-full max-w-md mx-4 p-8 text-center">
        {/* Step dots */}
        <div className="flex items-center justify-center gap-1.5 mb-8">
          {STEPS.map((_, i) => (
            <div key={i} className={`rounded-full transition-all ${i === step ? 'w-6 h-2 bg-gray-900' : 'w-2 h-2 bg-gray-200'}`} />
          ))}
        </div>

        {/* Icon */}
        <div className="w-16 h-16 rounded-2xl bg-gray-900 flex items-center justify-center mx-auto mb-6 shadow-lg">
          <current.icon className="w-7 h-7 text-white" />
        </div>

        <h2 className="text-[22px] font-extrabold text-gray-900 tracking-tight mb-3">{current.title}</h2>
        <p className="text-[15px] text-gray-500 leading-relaxed mb-8">{current.desc}</p>

        {/* Features list on last step */}
        {isLast && (
          <div className="text-left space-y-2 mb-6 bg-gray-50 rounded-2xl p-4">
            {['Push-to-Talk + Continuous Listening', 'Vision + Video Translate', 'AI tone rewrite for Email, Slack, and LinkedIn', 'History and quick sharing', 'Desktop widget for quick access'].map(f => (
              <div key={f} className="flex items-center gap-2 text-[13px] text-gray-600">
                <Check className="w-3.5 h-3.5 text-green-500 shrink-0" />{f}
              </div>
            ))}
          </div>
        )}

        <button onClick={handleNext}
          className="w-full flex items-center justify-center gap-2 bg-gray-900 text-white rounded-2xl py-3.5 text-[15px] font-semibold hover:bg-gray-700 transition-all active:scale-[0.98]">
          {current.cta}
          {!isLast && <ChevronRight className="w-4 h-4" />}
        </button>

        <button onClick={setOnboardingDone} className="mt-3 text-[13px] text-gray-400 hover:text-gray-600 transition-colors">
          Skip
        </button>
      </div>
    </div>
  );
}
