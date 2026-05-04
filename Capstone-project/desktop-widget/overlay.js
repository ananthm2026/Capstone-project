const { ipcRenderer } = require('electron');

const API_BASE = 'https://seedlingspeaks-backend-0vkj.onrender.com/api';

const ALL_LANGUAGES = {
  'hi-IN':'Hindi','bn-IN':'Bengali','ta-IN':'Tamil','te-IN':'Telugu',
  'ml-IN':'Malayalam','mr-IN':'Marathi','gu-IN':'Gujarati',
  'kn-IN':'Kannada','pa-IN':'Punjabi','or-IN':'Odia',
};
const TONES = ['Plain Text', 'Email Formal', 'Email Casual', 'Slack', 'LinkedIn', 'WhatsApp', 'Custom'];
const TONE_SEND = {
  'Email Formal':'Send','Email Casual':'Send',
  'Slack':'Send to Slack','LinkedIn':'Send to LinkedIn',
  'WhatsApp':'Send to WhatsApp','Custom':'Send',
};

// ── State ─────────────────────────────────────────────────────────────────────
let selectedLang    = '';
let selectedTone    = 'Plain Text';
let customTone      = '';
let configuredLangs = Object.keys(ALL_LANGUAGES);
let rawText         = '';
let displayText     = '';
let toneText        = '';
let isRewriting     = false;
let detectedDomain  = null;
let typewriterInt   = null;

// Recording state
let isRecording     = false;
let recSec          = 0;
let recTimerInt     = null;
let waveInt         = null;
let liveTranscript  = '';

const root = document.getElementById('card');

// ── Helpers ───────────────────────────────────────────────────────────────────
function escHtml(v) {
  return String(v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
function parseEmailParts(text) {
  const lines = text.trim().split('\n');
  let subject='', bodyLines=[], inBody=false;
  for (const line of lines) {
    if (!inBody && /^subject\s*:/i.test(line)) { subject=line.replace(/^subject\s*:\s*/i,'').trim(); }
    else if (subject && !inBody && line.trim()==='') { inBody=true; }
    else if (inBody||subject) { bodyLines.push(line); }
  }
  if (!subject) { subject=lines[0]||''; bodyLines=lines.slice(1); }
  return { subject:subject.trim(), body:bodyLines.join('\n').trim() };
}
function langOptions() {
  return `<option value="" disabled ${!selectedLang?'selected':''}>Languages</option>` +
    Object.keys(ALL_LANGUAGES).map(c =>
      `<option value="${c}" ${c===selectedLang?'selected':''}>${ALL_LANGUAGES[c]}</option>`
    ).join('');
}
function toneOptions() {
  return `<option value="Plain Text" ${selectedTone==='Plain Text'?'selected':''}>Retone</option>` +
    TONES.filter(t => t !== 'Plain Text').map(t =>
      `<option value="${t}" ${t===selectedTone?'selected':''}>${t}</option>`
    ).join('');
}
function getSendLabel() { return 'Send'; }
function getOutputText() { return toneText || displayText; }
function fmtTime(s) { return `${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`; }

// ── Resize window to fit content ──────────────────────────────────────────────
function fitWindow() {
  requestAnimationFrame(() => {
    const card = document.getElementById('card');
    if (!card) return;
    const h = card.getBoundingClientRect().height + 20; // 20 = body padding
    ipcRenderer.send('resize-overlay', { height: Math.max(120, Math.ceil(h)) });
  });
}

// ── Render ────────────────────────────────────────────────────────────────────
function render() {
  if (isRecording) {
    renderRecording();
  } else {
    renderResult();
  }
  fitWindow();
}

function renderRecording() {
  // Recording UI is now fully in the bubble — overlay stays hidden during recording
  root.innerHTML = '';
}

function renderResult() {
  const out = getOutputText();
  const hasOut = !!out;
  const isError = hasOut && /^⚠/.test(out);

  root.innerHTML = `
    <div class="topbar">
      <div class="brand">
        <img src="icon.png" width="22" height="22" style="border-radius:6px;flex-shrink:0;" alt="logo">
        <div>
          <div class="brand-name">SeedlingSpeaks</div>
        </div>
      </div>
      <div class="topbar-right">
        <button class="icon-btn" id="restartBtn" title="Record again">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
            <path d="M3 3v5h5"/>
          </svg>
        </button>
        <button class="icon-btn" id="quitBtn" title="Quit Application">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
          </svg>
        </button>
        <button class="icon-btn" id="closeBtn" title="Close Panel">
          <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
    </div>

    <div class="result-section">
      <div class="controls-row">
        <select id="langSel">${langOptions()}</select>
        <select id="toneSel">${toneOptions()}</select>
      </div>

      <div class="output-box ${isError ? 'is-error' : ''}">
        <div class="output-text" id="outputText">
          ${isRewriting
            ? `<div class="spinner"></div>`
            : hasOut
              ? escHtml(out)
              : `<span class="output-placeholder">Translation will appear here</span>`
          }
        </div>
      </div>

      ${selectedTone === 'Custom' ? `
        <div class="custom-row">
          <input id="customInput" placeholder="Describe your tone…" value="${escHtml(customTone)}">
          ${rawText ? `<button class="btn btn-solid" id="applyToneBtn" style="white-space:nowrap;padding:0 14px;">Apply</button>` : ''}
        </div>
      ` : ''}

      <div class="divider"></div>

      <div class="action-row">
        <button class="btn btn-outline" id="copyBtn" ${!hasOut?'disabled':''}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
          Copy
        </button>
        <button class="btn btn-solid" id="sendBtn" ${!hasOut?'disabled':''}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
          Send
        </button>
      </div>
    </div>
  `;

  bindResultEvents();
}

function bindResultEvents() {
  document.getElementById('quitBtn')?.addEventListener('click', () => ipcRenderer.send('quit-app'));
  document.getElementById('closeBtn')?.addEventListener('click', () => ipcRenderer.send('hide-overlay'));

  document.getElementById('restartBtn')?.addEventListener('click', () => {
    ipcRenderer.send('bubble-clicked'); // triggers toggleRecording in main
  });

  document.getElementById('langSel')?.addEventListener('change', e => {
    selectedLang = e.target.value;
    if (rawText) translateRaw();
  });

  document.getElementById('toneSel')?.addEventListener('change', e => {
    selectedTone = e.target.value;
    toneText = '';
    if (selectedTone === 'Plain Text') {
      render(); // just show raw displayText
    } else if (selectedTone !== 'Custom' && rawText) {
      applyTone(selectedTone);
    } else {
      render();
    }
  });

  document.getElementById('customInput')?.addEventListener('input', e => { customTone = e.target.value; });
  document.getElementById('applyToneBtn')?.addEventListener('click', () => applyTone('Custom'));

  document.getElementById('copyBtn')?.addEventListener('click', () => {
    const text = getOutputText();
    if (!text) return;
    navigator.clipboard.writeText(text).then(() => {
      const btn = document.getElementById('copyBtn');
      if (!btn) return;
      btn.textContent = '✓ Copied';
      setTimeout(() => {
        btn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg> Copy`;
      }, 1800);
    });
  });

  document.getElementById('sendBtn')?.addEventListener('click', handleSend);
}

// ── Waveform animation (unused — replaced by orb) ────────────────────────────
function startWaveAnim() { stopWaveAnim(); }
function stopWaveAnim() {
  if (waveInt) { clearInterval(waveInt); waveInt = null; }
}

// ── Recording timer ───────────────────────────────────────────────────────────
function startRecTimer() {
  recSec = 0;
  stopRecTimer();
  recTimerInt = setInterval(() => {
    recSec++;
    const el = document.getElementById('recTimer');
    if (el) el.textContent = fmtTime(recSec);
  }, 1000);
}
function stopRecTimer() {
  if (recTimerInt) { clearInterval(recTimerInt); recTimerInt = null; }
}

// ── Translate raw text ────────────────────────────────────────────────────────
async function translateRaw() {
  if (!rawText || !selectedLang) return;
  if (selectedLang === 'en-IN') {
    displayText = rawText; toneText = ''; render(); return;
  }
  try {
    const res = await fetch(`${API_BASE}/translate-text`, {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ text: rawText, source_language:'en-IN', target_language: selectedLang }),
    });
    const d = await res.json();
    displayText = d.translated_text || rawText;
  } catch { displayText = rawText; }
  toneText = '';
  render();
  fitWindow();
}

// ── Tone rewrite ──────────────────────────────────────────────────────────────
async function applyTone(tone) {
  const text = rawText;
  if (!text) return;
  isRewriting = true; toneText = ''; render();
  try {
    let resolvedTone = tone;
    if (tone === 'Smart Suggest') {
      const r = await fetch(`${API_BASE}/suggest-tone`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text})});
      resolvedTone = (await r.json()).suggested_tone || 'Email Formal';
      selectedTone = resolvedTone;
    }
    const r = await fetch(`${API_BASE}/rewrite-tone`,{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({text, tone:resolvedTone, user_override: tone==='Custom'?customTone:null}),
    });
    toneText = (await r.json()).rewritten_text || text;
  } catch (e) { toneText = `⚠ ${e.message}`; }
  isRewriting = false; render(); fitWindow();
}

// ── Typewriter ────────────────────────────────────────────────────────────────
function typewrite(text, elId = 'outputText') {
  if (typewriterInt) clearInterval(typewriterInt);
  let i = 0;
  typewriterInt = setInterval(() => {
    const el = document.getElementById(elId);
    if (el) el.textContent = text.slice(0, ++i);
    const cc = document.querySelector('.char-count');
    if (cc) cc.textContent = i + ' chars';
    if (i >= text.length) {
      clearInterval(typewriterInt); typewriterInt = null;
      fitWindow(); // resize after text fully renders
    }
  }, 16);
}

// ── Smart send ────────────────────────────────────────────────────────────────
function handleSend() {
  const text = getOutputText();
  if (!text) return;
  const { subject, body } = parseEmailParts(text);
  // Let main process detect the frontmost app/URL and route automatically
  ipcRenderer.send('smart-send', { text, subject, body });
}

// ── IPC from main ─────────────────────────────────────────────────────────────
ipcRenderer.on('start-recording', async () => {
  isRecording = true;
  liveTranscript = '';
  render();
  startRecTimer();

  try {
    _audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    _audioChunks = [];
    const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : 'audio/webm';
    _mediaRecorder = new MediaRecorder(_audioStream, { mimeType: mime });
    _mediaRecorder.ondataavailable = e => { if (e.data.size > 0) _audioChunks.push(e.data); };
    _mediaRecorder.onstop = async () => {
      _audioStream.getTracks().forEach(t => t.stop());
      _audioStream = null;
      const blob = new Blob(_audioChunks, { type: 'audio/webm' });
      if (blob.size < 500) {
        ipcRenderer.send('recording-result', { transcript: '⚠ No audio recorded.' });
        return;
      }
      try {
        const formData = new FormData();
        formData.append('file', blob, 'recording.webm');
        const res = await fetch(`${API_BASE}/translate-audio`, { method: 'POST', body: formData });
        if (!res.ok) { const e = await res.json().catch(()=>({})); throw new Error(e.detail||`HTTP ${res.status}`); }
        const data = await res.json();
        ipcRenderer.send('recording-result', { transcript: data.transcript || '⚠ Could not transcribe.' });
      } catch (e) {
        ipcRenderer.send('recording-result', { transcript: `⚠ ${e.message}` });
      }
    };
    _mediaRecorder.start(500);
  } catch (e) {
    ipcRenderer.send('recording-result', { transcript: '⚠ Microphone access denied.' });
  }
});

ipcRenderer.on('stop-recording', () => {
  stopRecTimer();
  stopWaveAnim();
  if (_mediaRecorder?.state !== 'inactive') _mediaRecorder.stop();
  else if (_audioStream) { _audioStream.getTracks().forEach(t => t.stop()); _audioStream = null; }
});

ipcRenderer.on('cancel-recording', () => {
  stopRecTimer();
  stopWaveAnim();
  isRecording = false;
  if (_mediaRecorder?.state !== 'inactive') {
    _mediaRecorder.onStop = null; // prevent result from firing
    _mediaRecorder.stop();
  }
  if (_audioStream) { _audioStream.getTracks().forEach(t => t.stop()); _audioStream = null; }
  ipcRenderer.send('hide-overlay');
});

ipcRenderer.on('show-result', (_, { transcript }) => {
  stopRecTimer();
  stopWaveAnim();
  isRecording = false;
  rawText = transcript;
  displayText = transcript;
  toneText = '';
  isRewriting = false;
  selectedTone = 'Plain Text';
  selectedLang = '';
  render();
  fitWindow();
  detectActiveDomain();
});

ipcRenderer.on('live-transcript', (_, text) => {
  liveTranscript = text;
  const el = document.getElementById('liveText');
  if (el && text?.trim()) el.textContent = text;
});

ipcRenderer.on('set-config', (_, cfg) => {
  if (cfg.languages?.length > 0) {
    configuredLangs = cfg.languages.filter(c => ALL_LANGUAGES[c]);
    if (configuredLangs.length > 0 && !configuredLangs.includes(selectedLang)) selectedLang = configuredLangs[0];
  }
  if (!isRecording) render();
});

// Domain detection
const DOMAIN_RULES = [
  { pattern:/mail\.google\.com/,                       label:'Gmail',    target:'gmail',    sendMode:'compose' },
  { pattern:/outlook\.live\.com|outlook\.office\.com/, label:'Outlook',  target:'outlook',  sendMode:'compose' },
  { pattern:/app\.slack\.com/,                         label:'Slack',    target:'slack',    sendMode:'compose' },
  { pattern:/web\.whatsapp\.com/,                      label:'WhatsApp', target:'whatsapp', sendMode:'textbox' },
  { pattern:/www\.linkedin\.com/,                      label:'LinkedIn', target:'linkedin', sendMode:'textbox' },
];
function detectActiveDomain() { ipcRenderer.send('get-active-url'); }
ipcRenderer.on('active-url', (_, url) => {
  detectedDomain = null;
  if (url) for (const r of DOMAIN_RULES) if (r.pattern.test(url)) { detectedDomain = r; break; }
  const btn = document.getElementById('sendBtn');
  if (btn && getOutputText()) btn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg> ${getSendLabel()}`;
});

// ── Media recorder state ──────────────────────────────────────────────────────
let _mediaRecorder = null;
let _audioChunks   = [];
let _audioStream   = null;

render();
