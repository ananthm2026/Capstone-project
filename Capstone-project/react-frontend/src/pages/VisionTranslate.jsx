import { useState, useRef, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import {
  Upload, Loader2, ChevronDown, Languages, ImageIcon, RefreshCw, Copy, Check, Download
} from 'lucide-react';
import * as api from '../services/api';
import { getLabels } from '../services/uiLabels';

const LANG_LABELS = {
  'hi-IN': 'Hindi', 'bn-IN': 'Bengali', 'ta-IN': 'Tamil', 'te-IN': 'Telugu',
  'ml-IN': 'Malayalam', 'mr-IN': 'Marathi', 'gu-IN': 'Gujarati',
  'kn-IN': 'Kannada', 'pa-IN': 'Punjabi', 'or-IN': 'Odia',
};

export default function VisionTranslate() {
  const { state } = useApp();
  const L = getLabels(state.uiLanguage);
  const [targetLang, setTargetLang] = useState(state.selectedLanguage || 'hi-IN');

  // Keep in sync when default language changes in Profile
  useEffect(() => {
    setTargetLang(state.selectedLanguage);
  }, [state.selectedLanguage]);
  const [imageFile, setImageFile] = useState(null);
  const [imageUrl, setImageUrl] = useState(null);
  const [regions, setRegions] = useState([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState('');
  const [dragging, setDragging] = useState(false);
  const [showOriginal, setShowOriginal] = useState(false);
  const [imgSize, setImgSize] = useState({ w: 0, h: 0 });
  const [copied, setCopied] = useState(false);
  const inputRef = useRef(null);
  const imgRef = useRef(null);
  const containerRef = useRef(null);

  // Track rendered image size for overlay positioning
  useEffect(() => {
    if (!imageUrl) return;
    const update = () => {
      if (imgRef.current) {
        setImgSize({ w: imgRef.current.offsetWidth, h: imgRef.current.offsetHeight });
      }
    };
    const obs = new ResizeObserver(update);
    if (imgRef.current) obs.observe(imgRef.current);
    return () => obs.disconnect();
  }, [imageUrl, regions]);

  const loadImage = (file) => {
    if (!file) return;
    const allowed = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];
    if (!allowed.includes(file.type)) { setError('Only PNG, JPG, and WEBP images are supported.'); return; }
    setImageFile(file);
    setRegions([]);
    setError('');
    setShowOriginal(false);
    setImageUrl(URL.createObjectURL(file));
  };

  const handleTranslate = async () => {
    if (!imageFile) return;
    setIsProcessing(true);
    setError('');
    setRegions([]);
    setShowOriginal(false);
    try {
      const result = await api.visionTranslate(imageFile, targetLang);
      const r = result.regions || [];
      setRegions(r);
      if (!r.length) setError('No text detected in this image.');
    } catch (e) {
      const raw = e.response?.data?.detail || e.message || '';
      if (raw.includes('quota') || raw.includes('429') || raw.includes('rate')) {
        setError('Gemini API quota exceeded. Please wait a moment and try again.');
      } else if (raw.includes('API key') || raw.includes('401') || raw.includes('403')) {
        setError('Invalid or missing Gemini API key. Check your .env configuration.');
      } else {
        setError('Translation failed. Please try again.');
      }
    } finally {
      setIsProcessing(false);
    }
  };

  const handleReset = () => {
    setImageFile(null);
    setImageUrl(null);
    setRegions([]);
    setError('');
    setShowOriginal(false);
  };

  const copyAll = () => {
    const text = regions.map(r => r.translated).join('\n\n');
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const downloadText = () => {
    const text = regions.map((r, i) =>
      `[${i + 1}] Original: ${r.original}\n    ${LANG_LABELS[targetLang]}: ${r.translated}`
    ).join('\n\n');
    const blob = new Blob([text], { type: 'text/plain' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `translated_${imageFile?.name?.replace(/\.[^.]+$/, '') || 'image'}.txt`;
    a.click();
  };

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      {/* Header */}
      <div style={{ background: 'var(--surface)', borderBottom: '1px solid rgba(0,0,0,0.06)', padding: '14px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h2 style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--text-ink)', margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
            <ImageIcon style={{ width: 20, height: 20, color: 'var(--text-faded)' }} />
            {L.visionTranslateTitle}
          </h2>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-faded)', margin: '2px 0 0' }}>Upload an image — translated text appears directly on the image</p>
        </div>
        <div style={{ position: 'relative' }}>
          <select value={targetLang} onChange={e => setTargetLang(e.target.value)}
            style={{ appearance: 'none', background: 'var(--surface)', border: '1px solid rgba(0,0,0,0.08)', borderRadius: 'var(--r-pill)', padding: '8px 32px 8px 16px', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-ink)', cursor: 'pointer', boxShadow: 'var(--shadow-sm)' }}>
            {Object.entries(LANG_LABELS).map(([code, name]) => (
              <option key={code} value={code}>{name}</option>
            ))}
          </select>
          <ChevronDown style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', width: 14, height: 14, color: 'var(--text-faded)', pointerEvents: 'none' }} />
        </div>
      </div>

      <div style={{ padding: '24px', maxWidth: 1100, margin: '0 auto' }}>
        {/* Upload zone */}
        {!imageUrl && (
          <div
            onDragOver={e => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={e => { e.preventDefault(); setDragging(false); loadImage(e.dataTransfer.files[0]); }}
            onClick={() => inputRef.current?.click()}
            style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, borderRadius: 'var(--r-xl)', border: `2px dashed ${dragging ? 'var(--saffron)' : 'rgba(232,130,12,0.35)'}`, cursor: 'pointer', padding: '80px 40px', background: dragging ? 'var(--saffron-light)' : 'var(--surface)', boxShadow: 'var(--shadow-sm)', transition: 'all 0.2s' }}>
            <input ref={inputRef} type="file" accept="image/png,image/jpeg,image/jpg,image/webp" style={{ display: 'none' }} onChange={e => loadImage(e.target.files[0])} />
            <div style={{ width: 64, height: 64, borderRadius: 18, background: 'var(--saffron-light)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Upload style={{ width: 24, height: 24, color: 'var(--saffron)' }} />
            </div>
            <div style={{ textAlign: 'center' }}>
              <p style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-ink)', margin: '0 0 6px' }}>{L.dropImageHere}</p>
              <p style={{ fontSize: '0.82rem', color: 'var(--text-faded)', margin: 0 }}>PNG, JPG, WEBP · up to 10MB</p>
            </div>
            <button style={{ background: 'var(--saffron)', color: '#fff', borderRadius: 'var(--r-pill)', padding: '10px 24px', fontWeight: 600, fontSize: '0.85rem', border: 'none', boxShadow: 'var(--shadow-saffron)', cursor: 'pointer' }}
              onClick={e => { e.stopPropagation(); inputRef.current?.click(); }}>
              or browse files
            </button>
          </div>
        )}

        {/* Image loaded */}
        {imageUrl && (
          <div className="space-y-4">
            {/* Toolbar */}
            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={handleTranslate}
                disabled={isProcessing}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gray-900 text-white text-[13px] font-semibold hover:bg-gray-700 disabled:opacity-40 transition-all active:scale-95"
              >
                {isProcessing
                  ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />Translating…</>
                  : <><Languages className="w-3.5 h-3.5" />{L.translate} to {LANG_LABELS[targetLang]}</>}
              </button>

              {regions.length > 0 && (
                <>
                  {/* Show original toggle — Google Translate style */}
                  <div className="flex items-center gap-2 px-3 py-2 bg-white border border-gray-200 rounded-xl">
                    <span className="text-[12px] font-medium text-gray-500">Show original</span>
                    <button
                      onClick={() => setShowOriginal(v => !v)}
                      className={`relative w-9 h-5 rounded-full transition-colors ${showOriginal ? 'bg-blue-500' : 'bg-gray-200'}`}
                    >
                      <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${showOriginal ? 'left-4' : 'left-0.5'}`} />
                    </button>
                  </div>

                  <button onClick={copyAll} className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl border border-gray-200 text-gray-600 text-[13px] font-medium hover:bg-gray-50 transition-all">
                    {copied ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
                    {L.copyAll}
                  </button>
                  <button onClick={downloadText} className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl border border-gray-200 text-gray-600 text-[13px] font-medium hover:bg-gray-50 transition-all">
                    <Download className="w-3.5 h-3.5" />{L.download}
                  </button>
                  <span className="text-[12px] text-gray-400">{regions.length} text blocks</span>
                </>
              )}

              <button
                onClick={handleReset}
                className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl border border-gray-200 text-gray-400 hover:text-red-500 hover:border-red-100 hover:bg-red-50 text-[13px] font-medium transition-all ml-auto"
              >
                <RefreshCw className="w-3.5 h-3.5" />{L.newImage}
              </button>
            </div>

            {/* Error */}
            {error && (
              <div className="px-4 py-3 bg-red-50 border border-red-100 rounded-xl text-[13px] text-red-600">{error}</div>
            )}

            {/* Processing banner */}
            {isProcessing && (
              <div className="flex items-center gap-3 px-4 py-3 bg-amber-50 border border-amber-100 rounded-xl text-[13px] text-amber-700">
                <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                Processing please wait.....
              </div>
            )}

            {/* Image + translations side by side */}
            <div className={`flex flex-col md:flex-row gap-4 ${regions.length > 0 ? 'items-start' : ''}`}>
              {/* Image with numbered dot overlays */}
              <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden flex-1 min-w-0">
                <div ref={containerRef} className="relative flex justify-center bg-[#f0f0f0] p-4">
                  <div className="relative inline-block">
                    <img
                      ref={imgRef}
                      src={imageUrl}
                      alt="Uploaded"
                      onLoad={() => {
                        if (imgRef.current) setImgSize({ w: imgRef.current.offsetWidth, h: imgRef.current.offsetHeight });
                      }}
                      style={{ maxWidth: '100%', maxHeight: '70vh', objectFit: 'contain', display: 'block', borderRadius: 8 }}
                    />
                    {/* Numbered dot markers on image */}
                    {imgSize.w > 0 && regions.map((r, i) => {
                      const cx = (r.x + r.w / 2) * imgSize.w;
                      const cy = (r.y + r.h / 2) * imgSize.h;
                      return (
                        <div
                          key={i}
                          style={{
                            position: 'absolute',
                            left: cx - 10,
                            top: cy - 10,
                            width: 20,
                            height: 20,
                            borderRadius: '50%',
                            background: '#111827',
                            color: '#fff',
                            fontSize: 10,
                            fontWeight: 700,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            boxShadow: '0 1px 4px rgba(0,0,0,0.4)',
                            cursor: 'default',
                            userSelect: 'none',
                          }}
                          title={`${r.original} → ${r.translated}`}
                        >
                          {i + 1}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Translation list panel */}
              {regions.length > 0 && (
                <div className="w-full md:w-80 shrink-0 bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                  <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                    <p className="text-[12px] font-bold text-gray-400 uppercase tracking-widest">
                      {showOriginal ? 'Original text' : `${LANG_LABELS[targetLang]} translation`}
                    </p>
                    <span className="text-[11px] text-gray-300">{regions.length} blocks</span>
                  </div>
                  <div className="overflow-y-auto" style={{ maxHeight: '70vh' }}>
                    {regions.map((r, i) => (
                      <div key={i} className="flex gap-3 px-4 py-3 border-b border-gray-50 hover:bg-gray-50 transition-colors group">
                        <div className="w-5 h-5 rounded-full bg-gray-900 text-white text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">
                          {i + 1}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[13px] text-gray-800 leading-relaxed">
                            {showOriginal ? r.original : r.translated}
                          </p>
                          <p className="text-[11px] text-gray-400 mt-1 truncate">
                            {showOriginal ? r.translated : r.original}
                          </p>
                        </div>
                        <button
                          onClick={() => navigator.clipboard.writeText(showOriginal ? r.original : r.translated)}
                          className="opacity-0 group-hover:opacity-100 p-1 rounded text-gray-300 hover:text-gray-600 transition-all shrink-0"
                        >
                          <Copy className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
