/**
 * Toast.jsx — lightweight toast notification system.
 * Usage:
 *   import { toast } from './Toast';
 *   toast.error('Something went wrong');
 *   toast.success('Done!');
 *   toast.warn('Server busy, retrying…');
 *   toast.info('Translating…');
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { CheckCircle, XCircle, AlertTriangle, Info, X } from 'lucide-react';

// ── Singleton event bus ───────────────────────────────────────────────────────
const listeners = new Set();

export const toast = {
  _emit(type, message, duration = 4000) {
    const id = Date.now() + Math.random();
    listeners.forEach(fn => fn({ id, type, message, duration }));
    return id;
  },
  success: (msg, dur) => toast._emit('success', msg, dur),
  error:   (msg, dur) => toast._emit('error',   msg, dur ?? 5000),
  warn:    (msg, dur) => toast._emit('warn',     msg, dur),
  info:    (msg, dur) => toast._emit('info',     msg, dur),
};

// ── Individual toast item ─────────────────────────────────────────────────────
const STYLES = {
  success: { bg: 'bg-green-50 border-green-200',  text: 'text-green-800', icon: CheckCircle,    iconCls: 'text-green-500' },
  error:   { bg: 'bg-red-50 border-red-200',      text: 'text-red-800',   icon: XCircle,        iconCls: 'text-red-500'   },
  warn:    { bg: 'bg-amber-50 border-amber-200',  text: 'text-amber-800', icon: AlertTriangle,  iconCls: 'text-amber-500' },
  info:    { bg: 'bg-blue-50 border-blue-200',    text: 'text-blue-800',  icon: Info,           iconCls: 'text-blue-500'  },
};

function ToastItem({ id, type, message, onRemove }) {
  const [visible, setVisible] = useState(false);
  const s = STYLES[type] || STYLES.info;
  const Icon = s.icon;

  useEffect(() => {
    // Animate in
    const t = setTimeout(() => setVisible(true), 10);
    return () => clearTimeout(t);
  }, []);

  const dismiss = useCallback(() => {
    setVisible(false);
    setTimeout(() => onRemove(id), 300);
  }, [id, onRemove]);

  return (
    <div className={`flex items-start gap-3 px-4 py-3 rounded-xl border shadow-lg max-w-sm w-full
      transition-all duration-300 ${s.bg}
      ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'}`}>
      <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${s.iconCls}`} />
      <p className={`text-[13px] font-medium flex-1 leading-snug ${s.text}`}>{message}</p>
      <button onClick={dismiss} className={`shrink-0 hover:opacity-60 transition-opacity ${s.text}`}>
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

// ── Toast container (mount once in App.jsx) ───────────────────────────────────
export default function ToastContainer() {
  const [toasts, setToasts] = useState([]);
  const timers = useRef({});

  useEffect(() => {
    const handler = (t) => {
      setToasts(prev => [...prev.slice(-4), t]); // max 5 visible
      if (t.duration > 0) {
        timers.current[t.id] = setTimeout(() => remove(t.id), t.duration);
      }
    };
    listeners.add(handler);
    return () => {
      listeners.delete(handler);
      Object.values(timers.current).forEach(clearTimeout);
    };
  }, []);

  const remove = useCallback((id) => {
    clearTimeout(timers.current[id]);
    delete timers.current[id];
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  return (
    <div className="fixed bottom-20 md:bottom-6 right-4 z-[9998] flex flex-col gap-2 items-end pointer-events-none">
      {toasts.map(t => (
        <div key={t.id} className="pointer-events-auto">
          <ToastItem {...t} onRemove={remove} />
        </div>
      ))}
    </div>
  );
}
