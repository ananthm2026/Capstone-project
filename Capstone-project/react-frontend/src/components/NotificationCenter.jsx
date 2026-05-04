import { useState } from 'react';
import { useApp } from '../context/AppContext';
import { Bell, X, Check, AlertCircle, Info, Trash2 } from 'lucide-react';

const TYPE_META = {
  success: { icon: Check,        color: 'text-green-500',  bg: 'bg-green-50',  border: 'border-green-100' },
  error:   { icon: AlertCircle,  color: 'text-red-500',    bg: 'bg-red-50',    border: 'border-red-100'   },
  info:    { icon: Info,         color: 'text-blue-500',   bg: 'bg-blue-50',   border: 'border-blue-100'  },
};

function fmt(iso) {
  const d = new Date(iso);
  return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) +
    ' · ' + d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

export default function NotificationCenter() {
  const { state, clearNotificationLog } = useApp();
  const [open, setOpen] = useState(false);
  const log = state.notificationLog || [];
  const unread = log.length;

  return (
    <>
      {/* Bell button — fixed bottom-right */}
      <button
        onClick={() => setOpen(v => !v)}
        className="fixed bottom-6 right-6 z-50 w-11 h-11 rounded-full bg-white border border-gray-200 shadow-lg flex items-center justify-center hover:shadow-xl transition-all hover:scale-105 active:scale-95"
        title="Notification log"
      >
        <Bell className="w-4 h-4 text-gray-600" />
        {unread > 0 && (
          <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {/* Panel */}
      {open && (
        <div className="fixed bottom-20 right-6 z-50 w-80 bg-white rounded-2xl border border-gray-100 shadow-2xl overflow-hidden animate-fade-in-blur">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
            <p className="text-[14px] font-bold text-gray-900">Activity log</p>
            <div className="flex items-center gap-1.5">
              {log.length > 0 && (
                <button onClick={clearNotificationLog}
                  className="p-1.5 rounded-lg hover:bg-red-50 text-gray-300 hover:text-red-400 transition-all" title="Clear all">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
              <button onClick={() => setOpen(false)}
                className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 transition-all">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          <div className="max-h-80 overflow-y-auto">
            {log.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 gap-2">
                <Bell className="w-6 h-6 text-gray-200" />
                <p className="text-[13px] text-gray-300">No activity yet</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-50">
                {log.map((entry) => {
                  const meta = TYPE_META[entry.type] || TYPE_META.info;
                  const Icon = meta.icon;
                  return (
                    <div key={entry.id} className="flex items-start gap-3 px-4 py-3 hover:bg-gray-50 transition-colors">
                      <div className={`w-6 h-6 rounded-full ${meta.bg} ${meta.border} border flex items-center justify-center shrink-0 mt-0.5`}>
                        <Icon className={`w-3 h-3 ${meta.color}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] text-gray-700 leading-snug">{entry.msg}</p>
                        <p className="text-[11px] text-gray-400 mt-0.5">{fmt(entry.ts)}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
