import { CheckCircle, AlertCircle, X } from 'lucide-react';
import { useApp } from '../context/AppContext';

export default function Notifications() {
  const { state, setField } = useApp();

  const notification = state.error || state.success;
  if (!notification) return null;

  const isError = !!state.error;

  return (
    <div className="fixed bottom-6 right-6 z-[70] max-w-sm w-full px-4 animate-fade-in-top">
      <div
        className={`flex items-center gap-3 px-4 py-3 rounded-2xl border shadow-lg ${
          isError
            ? 'bg-red-50 border-red-100 text-red-600'
            : 'bg-green-50 border-green-100 text-green-600'
        }`}
      >
        {isError ? (
          <AlertCircle className="w-5 h-5 shrink-0" />
        ) : (
          <CheckCircle className="w-5 h-5 shrink-0" />
        )}
        <p className="text-sm font-bold flex-1">{notification}</p>
        <button
          onClick={() => setField(isError ? 'error' : 'success', null)}
          className="p-1 rounded-lg hover:bg-black/5 shrink-0 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
