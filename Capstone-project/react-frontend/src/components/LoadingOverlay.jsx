import { Loader2 } from 'lucide-react';
import { useApp } from '../context/AppContext';

export default function LoadingOverlay() {
  const { state } = useApp();

  if (!state.loading) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/20 backdrop-blur-[2px]">
      <div className="bg-white border border-slate-200 rounded-2xl px-8 py-6 flex items-center gap-4 shadow-xl animate-fade-in-top">
        <Loader2 className="w-5 h-5 text-blue-600 animate-spin" />
        <span className="text-slate-900 font-bold text-sm tracking-tight">{state.loading}</span>
      </div>
    </div>
  );
}
