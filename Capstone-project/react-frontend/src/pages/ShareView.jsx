import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Copy, Check, ArrowLeft, Loader2, Link } from 'lucide-react';
import * as api from '../services/api';

export default function ShareView() {
  const navigate = useNavigate();
  const [linkId, setLinkId] = useState('');
  const [content, setContent] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  const handleFetch = async () => {
    if (!linkId.trim()) return;
    setLoading(true); setError(''); setContent(null);
    try {
      const data = await api.getShareLink(linkId.trim());
      setContent(data);
    } catch {
      setError('Link not found or expired.');
    } finally {
      setLoading(false);
    }
  };

  const copyText = () => {
    if (!content?.text) return;
    navigator.clipboard.writeText(content.text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="min-h-screen bg-[var(--bg)]">
      <div className="bg-white border-b border-gray-100 px-8 py-4 flex items-center gap-3">
        <button onClick={() => navigate('/app/native-to-english')}
          className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 transition-all">
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div>
          <h2 className="text-[20px] font-extrabold text-gray-900 tracking-tight">Shared Link</h2>
          <p className="text-[13px] text-gray-400 mt-0.5">View a shared transcript or message</p>
        </div>
      </div>

      <div className="px-8 py-8 max-w-2xl space-y-4">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <p className="text-[13px] font-semibold text-gray-700 mb-3">Enter share link ID</p>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Link className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input value={linkId} onChange={e => setLinkId(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleFetch()}
                placeholder="e.g. a1b2c3d4"
                className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-gray-200 text-[14px] focus:outline-none focus:border-gray-400 transition-all" />
            </div>
            <button onClick={handleFetch} disabled={!linkId.trim() || loading}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gray-900 text-white text-[13px] font-semibold hover:bg-gray-700 disabled:opacity-40 transition-all">
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'View'}
            </button>
          </div>
          {error && <p className="mt-2 text-[13px] text-red-500">{error}</p>}
        </div>

        {content && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 animate-fade-in-blur">
            <div className="flex items-center justify-between mb-3">
              <p className="text-[13px] font-semibold text-gray-700">{content.title || 'Shared content'}</p>
              <button onClick={copyText}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-500 text-[12px] font-medium transition-all">
                {copied ? <><Check className="w-3 h-3 text-green-500" />Copied</> : <><Copy className="w-3 h-3" />Copy</>}
              </button>
            </div>
            <p className="text-[15px] text-gray-800 leading-relaxed whitespace-pre-wrap">{content.text}</p>
          </div>
        )}
      </div>
    </div>
  );
}
