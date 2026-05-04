import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { Clock, Trash2, RotateCcw, X, Search, Download, Star, Tag, Plus } from 'lucide-react';
import * as api from '../services/api';
import { getLabels } from '../services/uiLabels';

const LANG_NAMES = {
  'hi-IN': 'Hindi', 'bn-IN': 'Bengali', 'ta-IN': 'Tamil', 'te-IN': 'Telugu',
  'ml-IN': 'Malayalam', 'mr-IN': 'Marathi', 'gu-IN': 'Gujarati',
  'kn-IN': 'Kannada', 'pa-IN': 'Punjabi', 'or-IN': 'Odia',
};

function ConfidencePill({ score }) {
  if (score == null) return null;
  const pct = Math.round(score * 100);
  const cls = pct >= 85 ? 'bg-green-50 text-green-600 border-green-100'
            : pct >= 60 ? 'bg-amber-50 text-amber-600 border-amber-100'
            :             'bg-red-50 text-red-500 border-red-100';
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[11px] font-semibold ${cls}`}>
      <span className="w-1.5 h-1.5 rounded-full bg-current opacity-70" />
      {pct}%
    </span>
  );
}

export default function History() {
  const { state, setField, setFields, deleteHistory, clearHistory, toggleStar, setHistoryTags } = useApp();
  const navigate = useNavigate();
  const L = getLabels(state.uiLanguage);
  const [search, setSearch] = useState('');
  const [confirmClear, setConfirmClear] = useState(false);
  const [showStarred, setShowStarred] = useState(false);
  const [filterTag, setFilterTag] = useState('');
  const [editingTagsFor, setEditingTagsFor] = useState(null);
  const [tagInput, setTagInput] = useState('');

  const PRESET_TAGS = ['meeting', 'call', 'note', 'important', 'follow-up'];

  const allItems = state.transcriptHistory || [];
  const allTags = [...new Set(Object.values(state.historyTags || {}).flat())];

  const items = allItems.filter(h => {
    const matchSearch = !search.trim() || h.text.toLowerCase().includes(search.toLowerCase());
    const matchStar = !showStarred || (state.starredIds || []).includes(h.id);
    const entryTags = (state.historyTags || {})[h.id] || [];
    const matchTag = !filterTag || entryTags.includes(filterTag);
    return matchSearch && matchStar && matchTag;
  });

  const getEntryTags = (id) => (state.historyTags || {})[id] || [];

  const addTag = (entryId, tag) => {
    const current = getEntryTags(entryId);
    if (!tag.trim() || current.includes(tag.trim())) return;
    setHistoryTags(entryId, [...current, tag.trim()]);
  };

  const removeTag = (entryId, tag) => {
    setHistoryTags(entryId, getEntryTags(entryId).filter(t => t !== tag));
  };

  const handleRestore = (entry) => {
    setFields({ englishText: entry.text, selectedLanguage: entry.lang || 'hi-IN' });
    navigate('/app/native-to-english');
  };

  const handleExport = async (format) => {
    try { await api.exportHistory(state.transcriptHistory || [], format); }
    catch { /* silent */ }
  };

  const fmt = (iso) => {
    const d = new Date(iso);
    return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
      + ' · ' + d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', padding: '24px', maxWidth: 760, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--text-ink)', margin: 0 }}>{L.transcriptHistory}</h1>
          <p style={{ fontSize: '0.875rem', color: 'var(--text-faded)', margin: '4px 0 0' }}>{state.transcriptHistory?.length || 0} saved · last 50 kept</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <button onClick={() => setShowStarred(v => !v)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-[12px] font-medium transition-all ${
              showStarred ? 'bg-amber-50 border-amber-200 text-amber-600' : 'border-gray-200 text-gray-500 hover:bg-gray-50'
            }`}>
            <Star className={`w-3.5 h-3.5 ${showStarred ? 'fill-amber-400 text-amber-400' : ''}`} />
            {L.starred}
          </button>
          {(state.transcriptHistory?.length > 0) && (
            <>
              <button onClick={() => handleExport('csv')}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 text-[12px] font-medium transition-all">
                <Download className="w-3.5 h-3.5" />CSV
              </button>
              <button onClick={() => handleExport('txt')}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 text-[12px] font-medium transition-all">
                <Download className="w-3.5 h-3.5" />TXT
              </button>
            </>
          )}
          {(state.transcriptHistory?.length > 0) && (
            confirmClear ? (
              <div className="flex items-center gap-2">
                <span className="text-[13px] text-gray-500">Clear all?</span>
                <button onClick={() => { clearHistory(); setConfirmClear(false); }}
                  className="px-3 py-1.5 rounded-lg bg-red-500 text-white text-[13px] font-semibold hover:bg-red-600 transition-all">
                  Yes, clear
                </button>
                <button onClick={() => setConfirmClear(false)}
                  className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 transition-all">
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <button onClick={() => setConfirmClear(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] font-medium text-gray-400 hover:text-red-500 hover:bg-red-50 border border-gray-200 hover:border-red-100 transition-all">
                <Trash2 className="w-3.5 h-3.5" />Clear all
              </button>
            )
          )}
        </div>
      </div>

      {/* Search */}
      {(state.transcriptHistory?.length > 0) && (
        <div style={{ position: 'relative', marginBottom: 12 }}>
          <Search style={{ position: 'absolute', left: 16, top: '50%', transform: 'translateY(-50%)', width: 16, height: 16, color: 'var(--text-faded)' }} />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search transcripts..."
            style={{ width: '100%', paddingLeft: 44, paddingRight: 16, paddingTop: 12, paddingBottom: 12, borderRadius: 'var(--r-pill)', border: '1px solid rgba(0,0,0,0.07)', background: 'var(--surface)', fontSize: '0.9rem', color: 'var(--text-ink)', outline: 'none', boxShadow: 'var(--shadow-sm)', fontFamily: 'var(--font)', boxSizing: 'border-box' }}
            onFocus={e => { e.target.style.borderColor = 'var(--saffron)'; e.target.style.boxShadow = '0 0 0 3px rgba(232,130,12,0.15)'; }}
            onBlur={e => { e.target.style.borderColor = 'rgba(0,0,0,0.07)'; e.target.style.boxShadow = 'var(--shadow-sm)'; }}
          />
        </div>
      )}

      {/* Tag filter */}
      {allTags.length > 0 && (
        <div className="flex items-center gap-2 mb-5 flex-wrap">
          <Tag className="w-3.5 h-3.5 text-gray-300 shrink-0" />
          <button onClick={() => setFilterTag('')}
            className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-all ${!filterTag ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-500 border-gray-200 hover:border-gray-400'}`}>
            All
          </button>
          {allTags.map(tag => (
            <button key={tag} onClick={() => setFilterTag(filterTag === tag ? '' : tag)}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-all ${filterTag === tag ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-500 border-gray-200 hover:border-gray-400'}`}>
              #{tag}
            </button>
          ))}
        </div>
      )}

      {/* List */}
      {items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 gap-3">
          <div className="w-12 h-12 rounded-2xl bg-white border border-gray-100 shadow-sm flex items-center justify-center">
            <Clock className="w-5 h-5 text-gray-300" />
          </div>
          <p className="text-[14px] text-gray-300 font-medium">
            {search ? L.noResults : L.noHistory}
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {items.map((entry) => (
            <div key={entry.id}
              style={{ background: 'var(--surface)', borderRadius: 'var(--r-xl)', boxShadow: 'var(--shadow-sm)', padding: '20px 24px', border: '1px solid rgba(0,0,0,0.05)', transition: 'transform 0.15s ease, box-shadow 0.15s ease', cursor: 'default' }}
              onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = 'var(--shadow-hover)'; }}
              onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = 'var(--shadow-sm)'; }}
              className="group">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
                    {(() => {
                      const langColors = {
                        'kn-IN': { bg: '#D4EDE7', color: '#0F6E56' },
                        'gu-IN': { bg: '#FEF0E6', color: '#9A3412' },
                        'hi-IN': { bg: '#EEE8F8', color: '#5B21B6' },
                        'ta-IN': { bg: '#D6E8F7', color: '#1E40AF' },
                        'te-IN': { bg: '#DFF0C0', color: '#166534' },
                        'ml-IN': { bg: '#FAE5D3', color: '#9A3412' },
                        'bn-IN': { bg: '#EEE8F8', color: '#6D28D9' },
                        'mr-IN': { bg: '#D6E8F7', color: '#1D4ED8' },
                        'pa-IN': { bg: '#DFF0C0', color: '#15803D' },
                        'or-IN': { bg: '#FAE5D3', color: '#C2410C' },
                      };
                      const lc = langColors[entry.lang] || { bg: '#F0F4F8', color: '#5A6478' };
                      return (
                        <span style={{ borderRadius: 'var(--r-pill)', padding: '4px 12px', fontSize: 12, fontWeight: 700, background: lc.bg, color: lc.color }}>
                          {LANG_NAMES[entry.lang] || entry.lang || 'Unknown'}
                        </span>
                      );
                    })()}
                    <ConfidencePill score={entry.confidence} />
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-faded)' }}>{fmt(entry.timestamp)}</span>
                  </div>
                  <p style={{ fontSize: '0.95rem', color: 'var(--text-ink)', lineHeight: 1.6, display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                    {entry.text}
                  </p>
                  {/* Tags */}
                  <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                    {getEntryTags(entry.id).map(tag => (
                      <span key={tag} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 text-[11px] font-semibold border border-gray-200">
                        #{tag}
                        <button onClick={() => removeTag(entry.id, tag)} className="hover:text-red-400 transition-colors ml-0.5">
                          <X className="w-2.5 h-2.5" />
                        </button>
                      </span>
                    ))}
                    {editingTagsFor === entry.id ? (
                      <div className="flex items-center gap-1">
                        <div className="flex gap-1 flex-wrap">
                          {PRESET_TAGS.filter(t => !getEntryTags(entry.id).includes(t)).map(t => (
                            <button key={t} onClick={() => { addTag(entry.id, t); }}
                              className="px-2 py-0.5 rounded-full bg-blue-50 text-blue-500 text-[11px] font-semibold border border-blue-100 hover:bg-blue-100 transition-all">
                              +{t}
                            </button>
                          ))}
                        </div>
                        <input value={tagInput} onChange={e => setTagInput(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter') { addTag(entry.id, tagInput); setTagInput(''); } if (e.key === 'Escape') setEditingTagsFor(null); }}
                          placeholder="custom tag"
                          className="px-2 py-0.5 rounded-lg border border-gray-200 text-[11px] w-24 focus:outline-none focus:border-gray-400" autoFocus />
                        <button onClick={() => setEditingTagsFor(null)} className="text-gray-300 hover:text-gray-600 transition-colors"><X className="w-3 h-3" /></button>
                      </div>
                    ) : (
                      <button onClick={() => { setEditingTagsFor(entry.id); setTagInput(''); }}
                        className="flex items-center gap-0.5 px-2 py-0.5 rounded-full border border-dashed border-gray-200 text-gray-300 hover:text-gray-500 hover:border-gray-400 text-[11px] transition-all">
                        <Plus className="w-2.5 h-2.5" />tag
                      </button>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button onClick={() => toggleStar(entry.id)}
                    title={state.starredIds?.includes(entry.id) ? 'Unstar' : 'Star'}
                    className={`p-2 rounded-lg transition-all ${
                      state.starredIds?.includes(entry.id)
                        ? 'text-amber-400 hover:bg-amber-50'
                        : 'text-gray-300 hover:text-amber-400 hover:bg-amber-50'
                    }`}>
                    <Star className={`w-3.5 h-3.5 ${state.starredIds?.includes(entry.id) ? 'fill-amber-400' : ''}`} />
                  </button>
                  <button onClick={() => handleRestore(entry)}
                    title="Restore to editor"
                    className="p-2 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-all">
                    <RotateCcw className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => deleteHistory(entry.id)}
                    title="Delete"
                    className="p-2 rounded-lg hover:bg-red-50 text-gray-300 hover:text-red-400 transition-all">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
