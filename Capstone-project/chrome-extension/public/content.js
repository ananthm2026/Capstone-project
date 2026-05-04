// Content script for Voice Translation Extension
// All chrome.* calls are guarded against context invalidation.

// ========== CONTEXT GUARD ==========
function isContextValid() {
  try { return !!chrome.runtime?.id; } catch { return false; }
}
function safeStorage(data) {
  if (isContextValid()) try { chrome.storage.local.set(data); } catch {}
}
function sendMsg(msg) {
  return new Promise((resolve, reject) => {
    if (!isContextValid()) { reject(new Error('Extension context invalidated')); return; }
    try {
      chrome.runtime.sendMessage(msg, (res) => {
        if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
        else resolve(res);
      });
    } catch (e) { reject(e); }
  });
}

// ========== STATE ==========
let isActive = false;
let selectionPopup = null;
let floatingIcon = null;
let popupPanel = null;
let targetLanguage = 'kn-IN';
let selectedTone = 'Email Formal';
let customTone = '';
let panelActiveTab = 'page';
let expandedSections = { record: true, tone: false, translate: false };
let smartSelectActive = false;
let highlightedEl = null;
let stopTranslationFlag = false;
let mediaRecorder = null;
let audioChunks = [];
let audioStream = null;
let isRecording = false;
let recordingMode = 'pushToTalk';
let isPTTPressed = false;
let englishText = '';
let rewrittenText = '';
let nativeText = '';
let inputText = '';
let currentAudio = null;
let playingType = null;
let loadingMessage = null;
let _lastRange = null;

const TONES = ['Email Formal', 'Email Casual', 'Slack', 'LinkedIn', 'WhatsApp Business', 'User Override'];
const TARGET_LANGUAGES = {
  Hindi: 'hi-IN', Bengali: 'bn-IN', Tamil: 'ta-IN', Telugu: 'te-IN',
  Malayalam: 'ml-IN', Marathi: 'mr-IN', Gujarati: 'gu-IN',
  Kannada: 'kn-IN', Punjabi: 'pa-IN', Odia: 'or-IN',
};

// ========== INIT (guarded) ==========
if (isContextValid()) {
  createFloatingIcon();

  chrome.storage.local.get(['vtActive', 'vtLanguage', 'vtDefaultLanguage', 'vtTone', 'vtIconPos', 'vtLanguages'], (result) => {
    if (!isContextValid()) return;
    targetLanguage = result.vtLanguage || result.vtDefaultLanguage || 'kn-IN';
    selectedTone = result.vtTone || 'Email Formal';
    if (result.vtIconPos && floatingIcon) {
      floatingIcon.style.left = result.vtIconPos.x + 'px';
      floatingIcon.style.top = result.vtIconPos.y + 'px';
      floatingIcon.style.right = 'auto';
      floatingIcon.style.bottom = 'auto';
    }
    if (result.vtActive) activateMode();
  });

  // Live-sync language when changed from the web app Profile page
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (changes.vtDefaultLanguage || changes.vtLanguage) {
      const newLang = (changes.vtLanguage || changes.vtDefaultLanguage)?.newValue;
      if (newLang) {
        targetLanguage = newLang;
        // Update all language dropdowns in the panel if open
        ['vt-mic-lang', 'vt-trans-lang', 'vt-chat-lang-sel'].forEach(id => {
          const el = document.getElementById(id);
          if (el) el.value = newLang;
        });
      }
    }
  });

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'GET_SELECTION') { sendResponse({ text: getSmartSelection() }); return false; }
    if (message.type === 'SHOW_NOTIFICATION') { showToast(message.message); return false; }
    if (message.type === 'INSERT_TEXT') { sendResponse(insertTextIntoActive(message.text)); return false; }
    if (message.type === 'TOGGLE_ACTIVE') {
      if (message.active) activateMode(); else deactivateMode();
      sendResponse({ active: isActive }); return false;
    }
    if (message.type === 'UPDATE_SETTINGS') {
      if (message.language) targetLanguage = message.language;
      if (message.tone) selectedTone = message.tone; return false;
    }
    if (message.type === 'TRANSLATE_ALL_PAGE') {
      translateAllVisibleText();
      sendResponse({ started: true });
      return false;
    }
    if (message.type === 'TRANSLATE_SELECTION_FROM_POPUP') {
      const text = getSmartSelection();
      if (text) { try { translateAndShowInline(text, window.getSelection().getRangeAt(0)); } catch { translateAndShowInline(text, null); } }
      else showToast('No text selected.');
      sendResponse({ started: true }); return false;
    }
    if (message.type === 'STOP_TRANSLATION') {
      stopTranslationFlag = true; removeAllTranslationOverlays(); sendResponse({ done: true }); return false;
    }
    return false;
  });
} // end init guard

// ========== WIDGET POLLING — talks to desktop widget at 127.0.0.1:27182 ==========
// Polling only starts after widget confirms it's alive via chrome.storage
(function startWidgetPolling() {
  const WIDGET_URL = 'http://127.0.0.1:27182/pending-action';
  let clickModeActive = false;
  let clickHoverFn = null;
  let clickFn = null;
  let clickHighlightEl = null;
  let polling = false;

  function stopClickMode() {
    clickModeActive = false;
    document.body.style.cursor = '';
    if (clickHoverFn) { document.removeEventListener('mouseover', clickHoverFn); clickHoverFn = null; }
    if (clickFn) { document.removeEventListener('click', clickFn, true); clickFn = null; }
    if (clickHighlightEl) { clickHighlightEl.style.outline = ''; clickHighlightEl = null; }
    const banner = document.getElementById('vt-widget-click-banner');
    if (banner) banner.remove();
  }

  async function pollWithBackoff() {
    if (!polling) return;
    try {
      const res = await fetch(WIDGET_URL, { method: 'GET', signal: AbortSignal.timeout(400) });
      if (res.ok) {
        const action = await res.json();
        if (action) await handleAction(action);
        setTimeout(pollWithBackoff, 500);
      } else {
        setTimeout(pollWithBackoff, 1000);
      }
    } catch {
      // Widget stopped — stop polling silently
      polling = false;
      chrome.storage.local.remove('widgetAlive');
    }
  }

  function startPolling() {
    if (polling) return;
    polling = true;
    pollWithBackoff();
  }

  // Check storage on load — if widget was alive in this session, start polling
  chrome.storage.local.get('widgetAlive', (r) => {
    if (r.widgetAlive) startPolling();
  });

  // Listen for widget activation message
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === 'WIDGET_ACTIVE') startPolling();
    if (msg.type === 'WIDGET_INACTIVE') { polling = false; }
  });

  // Extract action handling into its own function
  async function handleAction(action) {
    const lang = action.lang || targetLanguage || 'hi-IN';

    if (action.type === 'TRANSLATE_ALL_PAGE') {
      const prevLang = targetLanguage;
      targetLanguage = lang;
      translateAllVisibleText();
      targetLanguage = prevLang;

    } else if (action.type === 'TRANSLATE_SELECTION') {
      const sel = window.getSelection();
      const text = sel?.toString().trim();
      if (text) {
        try { translateAndShowInline(text, sel.getRangeAt(0)); }
        catch { translateAndShowInline(text, null); }
      } else {
        showToast('Select some text first, then click Selection.');
      }

    } else if (action.type === 'TOGGLE_CLICK_MODE') {
      if (clickModeActive) {
        stopClickMode();
      } else {
        clickModeActive = true;
        document.body.style.cursor = 'crosshair';
        let banner = document.getElementById('vt-widget-click-banner');
        if (!banner) {
          banner = document.createElement('div');
          banner.id = 'vt-widget-click-banner';
          banner.style.cssText = [
            'position:fixed', 'bottom:80px', 'left:50%', 'transform:translateX(-50%)',
            'background:rgba(10,12,20,0.9)', 'backdrop-filter:blur(12px)',
            'border:1px solid rgba(99,102,241,0.5)', 'border-radius:12px',
            'padding:8px 16px', 'font-size:12px', 'font-weight:600',
            'color:rgba(255,255,255,0.9)', 'z-index:2147483647',
            'display:flex', 'align-items:center', 'gap:8px',
            'box-shadow:0 8px 24px rgba(0,0,0,0.4)',
            'font-family:-apple-system,BlinkMacSystemFont,sans-serif',
          ].join(';');
          banner.innerHTML = `
            <span style="width:7px;height:7px;border-radius:50%;background:#818cf8;box-shadow:0 0 6px #818cf8;flex-shrink:0;animation:vtPulse 1s ease-in-out infinite;"></span>
            Click any text to translate
            <button id="vt-widget-click-off" style="margin-left:6px;background:rgba(239,68,68,0.15);border:1px solid rgba(239,68,68,0.3);border-radius:6px;color:#f87171;font-size:10px;font-weight:700;padding:2px 8px;cursor:pointer;">✕ Stop</button>
          `;
          if (!document.getElementById('vt-widget-style')) {
            const style = document.createElement('style');
            style.id = 'vt-widget-style';
            style.textContent = '@keyframes vtPulse{0%,100%{opacity:1}50%{opacity:0.3}}';
            document.head.appendChild(style);
          }
          document.body.appendChild(banner);
          document.getElementById('vt-widget-click-off').addEventListener('click', stopClickMode);
        }

        clickHoverFn = (e) => {
          const el = e.target;
          if (el.closest('#vt-widget-click-banner') || el.closest('#vt-popup-panel') || el.closest('#vt-floating-icon')) return;
          if (clickHighlightEl && clickHighlightEl !== el) clickHighlightEl.style.outline = '';
          clickHighlightEl = el;
          el.style.outline = '2px solid rgba(99,102,241,0.8)';
        };

        clickFn = async (e) => {
          const el = e.target;
          if (el.closest('#vt-widget-click-banner') || el.closest('#vt-popup-panel') || el.closest('#vt-floating-icon')) return;
          if (el.classList.contains('vt-undo-btn')) return;
          e.preventDefault(); e.stopPropagation();
          if (clickHighlightEl) { clickHighlightEl.style.outline = ''; clickHighlightEl = null; }
          const text = (el.innerText || el.textContent || '').replace(/↩/g, '').trim();
          if (!text || text.length < 2) return;
          el.style.opacity = '0.5';
          try {
            const prevLang = targetLanguage;
            targetLanguage = lang;
            const res = await sendMsg({ type: 'API_TRANSLATE_TEXT', text, targetLanguage: lang });
            targetLanguage = prevLang;
            el.style.opacity = '';
            if (res?.success) {
              const translated = res.data.translated_text || text;
              const orig = el.innerHTML;
              el.setAttribute('data-vt-original', orig);
              el.textContent = translated;
              const btn = document.createElement('button');
              btn.className = 'vt-undo-btn';
              btn.textContent = '↩';
              btn.title = 'Restore original';
              btn.onclick = (ev) => { ev.stopPropagation(); el.innerHTML = orig; el.removeAttribute('data-vt-original'); };
              el.appendChild(btn);
            }
          } catch { el.style.opacity = ''; }
        };

        document.addEventListener('mouseover', clickHoverFn);
        document.addEventListener('click', clickFn, true);
      }

    } else if (action.type === 'STOP_TRANSLATION') {
      stopTranslationFlag = true;
      stopClickMode();
      removeAllTranslationOverlays();
      showToast('Page restored.');
    }
  }

  // Polling starts only when WIDGET_ACTIVE message is received from background.js
  // No auto-start — prevents 404 spam when widget isn't running
})();

// ========== FLOATING ICON ==========
function createFloatingIcon() {
  if (floatingIcon) return;
  if (!isContextValid()) return;
  if (!document.body) { document.addEventListener('DOMContentLoaded', createFloatingIcon); return; }
  const iconURL = chrome.runtime.getURL('icons/icon48.png');
  floatingIcon = document.createElement('div');
  floatingIcon.id = 'vt-floating-icon';
  floatingIcon.innerHTML = `<img src="${iconURL}" width="28" height="28" style="border-radius:6px;pointer-events:none;" />`;
  document.body.appendChild(floatingIcon);

  let isDragging = false, hasMoved = false, dragStartX, dragStartY, iconStartX, iconStartY;
  floatingIcon.addEventListener('mousedown', (e) => {
    isDragging = true; hasMoved = false; dragStartX = e.clientX; dragStartY = e.clientY;
    const rect = floatingIcon.getBoundingClientRect(); iconStartX = rect.left; iconStartY = rect.top;
    floatingIcon.style.transition = 'none'; e.preventDefault();
  });
  document.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    const dx = e.clientX - dragStartX, dy = e.clientY - dragStartY;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) hasMoved = true;
    floatingIcon.style.left = Math.max(0, Math.min(window.innerWidth - 48, iconStartX + dx)) + 'px';
    floatingIcon.style.top = Math.max(0, Math.min(window.innerHeight - 48, iconStartY + dy)) + 'px';
    floatingIcon.style.right = 'auto'; floatingIcon.style.bottom = 'auto';
  });
  document.addEventListener('mouseup', () => {
    if (!isDragging) return; isDragging = false; floatingIcon.style.transition = '';
    const rect = floatingIcon.getBoundingClientRect();
    safeStorage({ vtIconPos: { x: rect.left, y: rect.top } });
  });
  floatingIcon.addEventListener('click', () => { if (!hasMoved) togglePopupPanel(); });
  updateIconState();
}
function updateIconState() {
  if (!floatingIcon) return;
  floatingIcon.title = 'Click to open Voice Translation';
  floatingIcon.classList.toggle('vt-icon-active', isActive);
}

// ========== PANEL ==========
function togglePopupPanel() {
  if (popupPanel) { closeSidebar(); return; }
  buildPanel();
}

function closeSidebar() {
  if (!popupPanel) return;
  popupPanel.style.transform = 'translateX(100%)';
  // Remove the injected style tag to restore page layout
  const styleTag = document.getElementById('vt-sidebar-style');
  if (styleTag) {
    styleTag.textContent = `
      html { width: 100vw !important; max-width: 100vw !important; }
    `;
    setTimeout(() => styleTag.remove(), 310);
  }
  const overlay = document.getElementById('vt-sidebar-overlay');
  if (overlay) { overlay.style.opacity = '0'; setTimeout(() => overlay.remove(), 300); }
  setTimeout(() => {
    if (popupPanel) { popupPanel.remove(); popupPanel = null; }
    if (floatingIcon) floatingIcon.style.display = '';
  }, 300);
}

function buildPanel() {
  const PANEL_WIDTH = 360;

  // Inject a style tag that forces the page to shrink
  let styleTag = document.getElementById('vt-sidebar-style');
  if (!styleTag) {
    styleTag = document.createElement('style');
    styleTag.id = 'vt-sidebar-style';
    document.head.appendChild(styleTag);
  }
  styleTag.textContent = `
    /* Shrink the entire page to make room for the sidebar */
    html {
      width: calc(100vw - ${PANEL_WIDTH}px) !important;
      max-width: calc(100vw - ${PANEL_WIDTH}px) !important;
      overflow-x: hidden !important;
      position: relative !important;
    }
    body {
      width: 100% !important;
      max-width: 100% !important;
      overflow-x: hidden !important;
    }
    /* For apps that use position:fixed full-width containers (Gmail, WhatsApp, etc.) */
    body > * {
      max-width: 100% !important;
    }
  `;

  popupPanel = document.createElement('div');
  popupPanel.id = 'vt-popup-panel';
  popupPanel.style.cssText = 'transform:translateX(100%);';

  renderPanel();
  document.body.appendChild(popupPanel);
  if (floatingIcon) floatingIcon.style.display = 'none';
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      popupPanel.style.transform = 'translateX(0)';
    });
  });
}

function getIconURL() {
  if (!isContextValid()) return '';
  try { return chrome.runtime.getURL('icons/icon48.png'); } catch { return ''; }
}

function renderPanel() {
  if (!popupPanel) return;

  let micBar;
  if (extMicRecording) {
    const waveBars = Array(22).fill(0).map(function() { return '<div class="vt-wave-bar" style="width:2px;height:3px;border-radius:2px;background:#fca5a5;transition:height 0.07s;"></div>'; }).join('');
    micBar = '<div style="display:flex;align-items:center;gap:10px;background:#fef2f2;border:1px solid #fecaca;border-radius:10px;padding:10px 12px;">'
      + '<div style="width:7px;height:7px;border-radius:50%;background:#ef4444;flex-shrink:0;animation:vtRecPulse 1s ease-in-out infinite;"></div>'
      + '<span id="vt-rec-timer" style="font-size:12px;font-family:monospace;font-weight:700;color:#dc2626;flex-shrink:0;">' + fmtSec(extMicTimeSec) + '</span>'
      + '<div id="vt-wave-bars" style="display:flex;align-items:center;gap:2px;flex:1;height:18px;">' + waveBars + '</div>'
      + '<button id="vt-mic-stop" style="display:flex;align-items:center;gap:5px;background:#ef4444;border:none;border-radius:8px;color:#fff;font-size:11px;font-weight:700;padding:6px 12px;cursor:pointer;flex-shrink:0;"><svg width="9" height="9" viewBox="0 0 24 24" fill="white"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>Stop</button>'
      + '</div>';
  } else if (extMicLoading) {
    micBar = '<div style="display:flex;align-items:center;justify-content:center;gap:10px;padding:12px;background:#f8f8f8;border-radius:10px;border:1px solid #ececec;"><div class="vt-spinner"></div><span style="font-size:12px;font-weight:600;color:#9ca3af;">Transcribing...</span></div>';
  } else if (extRawText) {
    micBar = '<div style="display:flex;gap:8px;">'
      + '<button id="vt-ext-send-box" style="flex:1;display:flex;align-items:center;justify-content:center;gap:8px;padding:11px;background:#1a1a1a;border:none;border-radius:10px;color:#fff;font-size:12px;font-weight:700;cursor:pointer;letter-spacing:0.01em;"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round"><path d="M22 2L11 13"/><path d="M22 2L15 22 11 13 2 9l20-7z"/></svg>Send to Textbox</button>'
      + '<button id="vt-ext-copy-bar" style="flex:1;display:flex;align-items:center;justify-content:center;gap:8px;padding:11px;background:#fff;border:1px solid #ececec;border-radius:10px;color:#6b7280;font-size:12px;font-weight:600;cursor:pointer;"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" stroke-width="2.5" stroke-linecap="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>Copy</button>'
      + '</div>';
  } else {
    micBar = '<div style="display:flex;gap:8px;">'
      + '<button id="vt-mic-start" style="flex:1;display:flex;align-items:center;justify-content:center;gap:8px;padding:11px;background:#1a1a1a;border:none;border-radius:10px;color:#fff;font-size:12px;font-weight:700;cursor:pointer;letter-spacing:0.01em;"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>Start Speaking</button>'
      + '<label style="flex:1;display:flex;align-items:center;justify-content:center;gap:8px;padding:11px;background:#fff;border:1px solid #ececec;border-radius:10px;color:#6b7280;font-size:12px;font-weight:600;cursor:pointer;"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" stroke-width="2.5" stroke-linecap="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>Upload Audio<input id="vt-file-input" type="file" accept="audio/*" style="display:none;" /></label>'
      + '</div>';
  }

  popupPanel.innerHTML = `
    <style>
      @keyframes vtRecPulse{0%,100%{opacity:1}50%{opacity:0.3}}
      #vt-mic-start:hover{background:#333 !important;}
      #vt-mic-start:active{transform:scale(0.97);}
    </style>

    <!-- HEADER -->
    <div id="vt-panel-header">
      <div style="display:flex;align-items:center;gap:9px;">
        <div style="width:30px;height:30px;border-radius:9px;background:#1a1a1a;display:flex;align-items:center;justify-content:center;">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
        </div>
        <div>
          <div style="font-size:13px;font-weight:800;color:#1a1a1a;letter-spacing:-0.02em;">SeedlingSpeaks</div>
          <div style="font-size:10px;color:#9ca3af;font-weight:500;">AI Translation</div>
        </div>
      </div>
      <div style="display:flex;align-items:center;gap:8px;">
        <button id="vt-panel-toggle" style="width:40px;height:22px;border-radius:11px;border:none;cursor:pointer;background:${isActive ? '#1a1a1a' : '#e5e7eb'};position:relative;transition:background 0.2s;flex-shrink:0;">
          <span style="position:absolute;top:3px;left:${isActive ? '20px' : '3px'};width:16px;height:16px;border-radius:50%;background:#fff;transition:left 0.2s;box-shadow:0 1px 3px rgba(0,0,0,0.2);"></span>
        </button>
        <button id="vt-panel-close" style="width:26px;height:26px;background:#f3f4f6;border:none;border-radius:7px;cursor:pointer;display:flex;align-items:center;justify-content:center;color:#9ca3af;">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
    </div>

    <!-- 4 ACTION BUTTONS -->
    <div id="vt-action-bar">
      ${iconActionBtn('vt-btn-all',   'Translate',  `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>`)}
      ${iconActionBtn('vt-btn-sel',   'Selection',  `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>`)}
      ${iconActionBtn('vt-btn-click', smartSelectActive ? 'Click ✓' : 'Click', `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 15l-2 5L9 9l11 4-5 2z"/></svg>`, smartSelectActive)}
      ${iconActionBtn('vt-btn-chat',  window._vtLiveChatActive?.() ? 'Chat ✓' : 'Live Chat', `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>`, window._vtLiveChatActive?.())}
      ${iconActionBtn('vt-btn-stop',  'Restore',    `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>`)}
    </div>

    <!-- MAIN CONTENT -->
    <div id="vt-tab-content">
      ${window._vtLiveChatActive?.() ? (window._vtRenderChatPanel?.() || '') : renderMicOutput()}
    </div>

    <!-- TONE + ACTIONS BOTTOM SECTION -->
    <div id="vt-tone-bar">
      ${window._vtLiveChatActive?.() ? '' : renderToneBar()}
    </div>

    <!-- BOTTOM MIC BAR -->
    <div id="vt-mic-bar">
      ${window._vtLiveChatActive?.() ? '' : micBar}
    </div>`;

  popupPanel.querySelector('#vt-panel-close').onclick = () => closeSidebar();
  popupPanel.querySelector('#vt-panel-toggle').onclick = () => {
    if (isActive) deactivateMode(); else activateMode();
    renderPanel(); wireTabEvents();
  };
  wireTabEvents();
}

function iconActionBtn(id, label, svg, active = false) {
  const dimmed = !isActive && id !== 'vt-btn-stop';
  const isActive2 = active;
  const bg = isActive2 ? '#1a1a1a' : '#ffffff';
  const border = isActive2 ? '#1a1a1a' : '#ececec';
  const iconColor = isActive2 ? '#ffffff' : (dimmed ? '#d1d5db' : '#374151');
  const textColor = isActive2 ? '#ffffff' : (dimmed ? '#d1d5db' : '#6b7280');
  return `<button id="${id}" style="display:flex;flex-direction:column;align-items:center;gap:4px;padding:8px 4px 7px;background:${bg};border:1px solid ${border};border-radius:10px;cursor:pointer;transition:all 0.12s;opacity:${dimmed ? '0.5' : '1'};" title="${label}">
    <div style="width:28px;height:28px;border-radius:8px;background:${isActive2 ? 'rgba(255,255,255,0.12)' : '#f3f4f6'};display:flex;align-items:center;justify-content:center;color:${iconColor};">${svg}</div>
    <span style="font-size:9px;font-weight:700;color:${textColor};letter-spacing:0.02em;text-transform:uppercase;">${label}</span>
  </button>`;
}

function renderMicOutput() {
  const displayText = extToneText || extRawText;
  const toneLabel = extSelectedTone || 'Transcript';

  // Single language dropdown
  const langOpts = Object.entries(TARGET_LANGUAGES).map(([name, code]) =>
    `<option value="${code}" ${code === targetLanguage ? 'selected' : ''}>${name}</option>`
  ).join('');

  const langRow = `
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;">
      <span style="font-size:10px;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:0.06em;white-space:nowrap;flex-shrink:0;">Language</span>
      <div style="position:relative;flex:1;">
        <select id="vt-mic-lang" style="width:100%;padding:7px 28px 7px 10px;background:#fff;border:1px solid #e5e7eb;border-radius:10px;color:#111827;font-size:12px;font-weight:500;outline:none;cursor:pointer;appearance:none;font-family:inherit;">
          ${langOpts}
        </select>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" stroke-width="2" style="position:absolute;right:8px;top:50%;transform:translateY(-50%);pointer-events:none;"><polyline points="6 9 12 15 18 9"/></svg>
      </div>
    </div>`;

  if (!extRawText) {
    return `
      ${langRow}
      <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;padding:20px;text-align:center;gap:10px;">
        <div style="width:44px;height:44px;border-radius:12px;background:#f3f4f6;display:flex;align-items:center;justify-content:center;">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" stroke-width="2" stroke-linecap="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>
        </div>
        <div>
          <div style="font-size:13px;font-weight:700;color:#374151;margin-bottom:3px;">Speak in your language</div>
          <div style="font-size:11px;color:#9ca3af;line-height:1.6;">Tap Start Speaking below, say something in your native language, and get an English translation.</div>
        </div>
      </div>`;
  }

  return `
    ${langRow}
    <div style="display:flex;align-items:center;gap:6px;margin-bottom:6px;flex-shrink:0;">
      <div style="width:5px;height:5px;border-radius:50%;background:#22c55e;flex-shrink:0;"></div>
      <span style="font-size:10px;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:0.08em;">${toneLabel}</span>
      ${extToneLoading ? `<div class="vt-spinner" style="margin-left:auto;border-top-color:#1a1a1a;border-color:rgba(26,26,26,0.1);"></div>` : ''}
    </div>
    ${extToneLoading
      ? `<div style="flex:1;background:#fff;border:1px solid #ececec;border-radius:10px;display:flex;align-items:center;justify-content:center;gap:8px;color:#9ca3af;font-size:12px;"><div class="vt-spinner"></div>Rewriting…</div>`
      : `<div style="position:relative;flex:1;display:flex;flex-direction:column;">
          <textarea id="vt-ext-output" style="flex:1;width:100%;padding:10px 12px;padding-right:60px;background:#fff;border:1px solid #ececec;border-radius:10px;color:#1a1a1a;font-size:13px;font-weight:400;line-height:1.8;outline:none;resize:none;box-shadow:none;" onfocus="this.style.borderColor='#1a1a1a'" onblur="this.style.borderColor='#ececec'">${escapeHtml(displayText)}</textarea>
          <div style="position:absolute;top:6px;right:6px;display:flex;gap:3px;">
            <button id="vt-ext-copy-out" title="Copy" style="width:24px;height:24px;background:rgba(255,255,255,0.9);border:1px solid #e5e7eb;border-radius:6px;color:#9ca3af;cursor:pointer;display:flex;align-items:center;justify-content:center;padding:0;">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
            </button>
            <button id="vt-ext-clear-out" title="Clear" style="width:24px;height:24px;background:rgba(255,255,255,0.9);border:1px solid #e5e7eb;border-radius:6px;color:#9ca3af;cursor:pointer;display:flex;align-items:center;justify-content:center;padding:0;">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M9 6V4h6v2"/></svg>
            </button>
          </div>
        </div>`
    }`;
}

function renderToneBar() {
  if (!extRawText) return '';
  const displayText = extToneText || extRawText;
  const toneChips = EXT_TONES.map(function(t) {
    const active = extSelectedTone === t;
    const border = active ? '#1a1a1a' : '#e5e7eb';
    const bg = active ? '#1a1a1a' : '#fff';
    const color = active ? '#fff' : '#6b7280';
    return '<button class="vt-tone-chip" data-tone="' + t + '" style="padding:3px 9px;border-radius:20px;font-size:10px;font-weight:700;cursor:pointer;white-space:nowrap;border:1px solid ' + border + ';background:' + bg + ';color:' + color + ';transition:all 0.12s;">' + t + '</button>';
  }).join('');

  const customBlock = extSelectedTone === 'Custom'
    ? '<div style="display:flex;gap:6px;margin-top:7px;"><input id="vt-ext-custom-tone" type="text" placeholder="Describe your tone" value="' + esc(extCustomTone) + '" style="flex:1;padding:7px 10px;border:1px solid #ececec;border-radius:8px;font-size:11px;outline:none;color:#1a1a1a;background:#fff;" /><button id="vt-ext-apply-custom" style="padding:7px 12px;background:#1a1a1a;border:none;border-radius:8px;color:#fff;font-size:11px;font-weight:700;cursor:pointer;">Apply</button></div>'
    : '';

  const rerecordBlock = displayText
    ? '<div style="display:flex;gap:8px;margin-top:8px;"><button id="vt-tone-mic-start" style="flex:1;display:flex;align-items:center;justify-content:center;gap:8px;padding:10px;background:#1a1a1a;border:none;border-radius:10px;color:#fff;font-size:12px;font-weight:700;cursor:pointer;"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>Start Speaking</button><label style="flex:1;display:flex;align-items:center;justify-content:center;gap:8px;padding:10px;background:#fff;border:1px solid #ececec;border-radius:10px;color:#6b7280;font-size:12px;font-weight:600;cursor:pointer;"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" stroke-width="2.5" stroke-linecap="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>Upload Audio<input id="vt-tone-file-input" type="file" accept="audio/*" style="display:none;" /></label></div>'
    : '';

  return '<div style="margin-bottom:8px;"><div style="font-size:10px;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:5px;">Tone</div><div style="display:flex;flex-wrap:wrap;gap:4px;">' + toneChips + '</div>' + customBlock + '</div>' + rerecordBlock;
}



function sectionHeader(id, title, expanded) {
  return `<button class="vt-section-toggle" data-section="${id}" style="display:flex;align-items:center;justify-content:space-between;width:100%;padding:10px 12px;margin-top:8px;background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;color:#111827;font-size:12px;font-weight:600;cursor:pointer;text-align:left;box-shadow:0 1px 3px rgba(0,0,0,0.05);">
    <span>${title}</span>
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" stroke-width="2" style="transform:${expanded ? 'rotate(180deg)' : 'rotate(0deg)'};transition:transform 0.2s;flex-shrink:0;"><polyline points="6 9 12 15 18 9"/></svg>
  </button>`;
}

// ── Native→English mic state (extension) ─────────────────────────────────────
let extMicRecording = false;
let extMicChunks = [];
let extMicRecorder = null;
let extMicStream = null;
let extMicTimeSec = 0;
let extMicTimer = null;
let extMicWaveInterval = null;
let extMicLoading = false;
let extToneLoading = false;
let extRawText = '';      // transcript from /api/translate-audio
let extToneText = '';     // rewritten by tone chip
let extSelectedTone = null;
let extCustomTone = '';

const EXT_TONES = ['Email Formal', 'Email Casual', 'Slack', 'LinkedIn', 'WhatsApp Business', 'Custom'];

function fmtSec(s) { return `${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`; }

function renderRecordSection() {
  const displayText = extToneText || extRawText;
  const toneLabel = extSelectedTone && extSelectedTone !== 'Smart Suggest' ? extSelectedTone : 'English';

  let micUI = '';
  if (extMicRecording) {
    micUI = `
      <div style="display:flex;align-items:center;gap:10px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:14px;padding:10px 14px;width:100%;">
        <div style="width:8px;height:8px;border-radius:50%;background:#ef4444;box-shadow:0 0 6px rgba(239,68,68,0.7);flex-shrink:0;animation:vtRecPulse 1s ease-in-out infinite;"></div>
        <span id="vt-rec-timer" style="font-size:11px;font-family:monospace;font-weight:700;color:#6b7280;flex-shrink:0;">${fmtSec(extMicTimeSec)}</span>
        <div id="vt-wave-bars" style="display:flex;align-items:center;gap:2px;flex:1;height:24px;">
          ${Array(28).fill(0).map(() => `<div class="vt-wave-bar" style="width:2px;height:3px;border-radius:2px;background:#374151;transition:height 0.07s;"></div>`).join('')}
        </div>
        <button id="vt-mic-stop" style="display:flex;align-items:center;gap:5px;background:#ef4444;border:none;border-radius:8px;color:#fff;font-size:11px;font-weight:700;padding:6px 12px;cursor:pointer;flex-shrink:0;">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="white"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>Stop
        </button>
      </div>`;
  } else if (extMicLoading) {
    micUI = `<div style="display:flex;align-items:center;gap:8px;color:#9ca3af;font-size:12px;padding:12px 0;"><div class="vt-spinner"></div>Transcribing…</div>`;
  } else {
    micUI = `
      <div style="display:flex;gap:10px;width:100%;">
        <button id="vt-mic-start" style="flex:1;display:flex;align-items:center;justify-content:center;gap:8px;padding:12px 16px;background:#111827;border:none;border-radius:50px;color:#fff;font-size:13px;font-weight:600;cursor:pointer;transition:opacity 0.15s;">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>
          Start Speaking
        </button>
        <label style="flex:1;display:flex;align-items:center;justify-content:center;gap:8px;padding:12px 16px;background:#fff;border:1.5px solid #e5e7eb;border-radius:50px;color:#374151;font-size:13px;font-weight:600;cursor:pointer;transition:background 0.15s;">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#374151" stroke-width="2.5" stroke-linecap="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
          Upload Audio
          <input id="vt-file-input" type="file" accept="audio/*" style="display:none;" />
        </label>
      </div>`;
  }

  const toneChips = EXT_TONES.map(t => {
    const active = extSelectedTone === t;
    return `<button class="vt-tone-chip" data-tone="${t}" style="padding:5px 10px;border-radius:20px;font-size:10px;font-weight:600;cursor:pointer;border:1px solid ${active ? '#111827' : '#e5e7eb'};background:${active ? '#111827' : '#fff'};color:${active ? '#fff' : '#6b7280'};transition:all 0.15s;">${t === 'Custom' ? 'Custom' : t}</button>`;
  }).join('');

  return `
    <style>
      @keyframes vtRecPulse{0%,100%{opacity:1}50%{opacity:0.3}}
    </style>
    <div style="display:flex;flex-direction:column;gap:10px;padding:8px 0 4px;">
      ${micUI}
    </div>

    ${extRawText ? `
      <div style="margin-top:10px;">
        <div style="font-size:10px;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:0.6px;margin-bottom:5px;">${toneLabel}</div>
        ${extToneLoading
          ? `<div style="display:flex;align-items:center;gap:8px;color:#9ca3af;font-size:12px;padding:10px 0;"><div class="vt-spinner"></div>Rewriting…</div>`
          : `<textarea id="vt-ext-output" rows="4" style="width:100%;padding:9px 12px;background:#fff;border:1px solid #e5e7eb;border-radius:10px;color:#111827;font-size:12px;font-weight:500;outline:none;resize:none;box-shadow:0 1px 3px rgba(0,0,0,0.05);">${escapeHtml(displayText)}</textarea>`
        }
      </div>

      <div style="margin-top:8px;">
        <div style="font-size:10px;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:0.6px;margin-bottom:6px;">Tone</div>
        <div style="display:flex;flex-wrap:wrap;gap:5px;">${toneChips}</div>
        ${extSelectedTone === 'Custom' ? `
          <div style="display:flex;gap:6px;margin-top:8px;">
            <input id="vt-ext-custom-tone" type="text" placeholder="Describe your tone…" value="${esc(extCustomTone)}" style="flex:1;padding:7px 10px;border:1px solid #e5e7eb;border-radius:8px;font-size:11px;outline:none;" />
            <button id="vt-ext-apply-custom" style="padding:7px 12px;background:#111827;border:none;border-radius:8px;color:#fff;font-size:11px;font-weight:600;cursor:pointer;">Apply</button>
          </div>` : ''}
      </div>

      ${displayText ? `
        <div style="display:flex;gap:6px;margin-top:10px;">
          <button id="vt-mic-start" style="flex:1;display:flex;align-items:center;justify-content:center;gap:8px;padding:9px;background:#1a1a1a;border:none;border-radius:10px;color:#fff;font-size:11px;font-weight:700;cursor:pointer;">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>
            Start Speaking
          </button>
          <label style="flex:1;display:flex;align-items:center;justify-content:center;gap:8px;padding:9px;background:#fff;border:1px solid #e5e7eb;border-radius:10px;color:#374151;font-size:11px;font-weight:600;cursor:pointer;">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" stroke-width="2.5" stroke-linecap="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
            Upload Audio
            <input id="vt-file-input" type="file" accept="audio/*" style="display:none;" />
          </label>
        </div>` : ''}
    ` : ''}
  `;
}


function renderToneSection() {
  const s = 'width:100%;padding:9px 12px;background:#ffffff;border:1px solid #e5e7eb;border-radius:10px;color:#111827;font-size:12px;font-weight:500;outline:none;box-shadow:0 1px 3px rgba(0,0,0,0.05);';
  return `
    <div style="position:relative;margin-bottom:10px;">
      <select id="vt-tone-sel" style="${s}cursor:pointer;appearance:none;padding-right:36px;">
        ${TONES.map(t => `<option value="${t}" ${t === selectedTone ? 'selected' : ''}>${t}</option>`).join('')}
      </select>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" stroke-width="2" style="position:absolute;right:10px;top:50%;transform:translateY(-50%);pointer-events:none;"><polyline points="6 9 12 15 18 9"/></svg>
    </div>
    ${selectedTone === 'User Override' ? `<div style="margin-bottom:10px;display:flex;gap:6px;">
      <input type="text" id="vt-custom-tone" value="${esc(customTone)}" placeholder="e.g. Formal with bullet points" style="${s}flex:1;" />
      <button id="vt-apply-custom" style="padding:9px 14px;background:#111827;border:none;border-radius:10px;color:white;font-size:11px;font-weight:600;cursor:pointer;white-space:nowrap;">Apply</button>
    </div>` : ''}
    <textarea id="vt-tone-input" placeholder="Paste or type English text..." rows="3" style="${s}resize:none;margin-bottom:8px;">${escapeHtml(inputText)}</textarea>
    ${englishText && !rewrittenText ? `<button id="vt-apply-tone" style="width:100%;padding:10px;background:#111827;border:none;border-radius:10px;color:white;font-size:12px;font-weight:600;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:6px;margin-bottom:8px;">Apply Tone</button>` : ''}
    ${outputBox('Styled Text', rewrittenText, 'en', 'rewritten')}`;
}

function renderTranslateSection() {
  const s = 'width:100%;padding:9px 12px;background:#ffffff;border:1px solid #e5e7eb;border-radius:10px;color:#111827;font-size:12px;font-weight:500;outline:none;box-shadow:0 1px 3px rgba(0,0,0,0.05);';
  return `
    <div style="position:relative;margin-bottom:10px;">
      <select id="vt-trans-lang" style="${s}cursor:pointer;appearance:none;padding-right:36px;">
        ${Object.entries(TARGET_LANGUAGES).map(([n, c]) => `<option value="${c}" ${c === targetLanguage ? 'selected' : ''}>${n}</option>`).join('')}
      </select>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" stroke-width="2" style="position:absolute;right:10px;top:50%;transform:translateY(-50%);pointer-events:none;"><polyline points="6 9 12 15 18 9"/></svg>
    </div>
    <textarea id="vt-trans-input" placeholder="Type or paste English text..." rows="3" style="${s}resize:none;margin-bottom:8px;">${escapeHtml(inputText)}</textarea>
    <button id="vt-trans-btn" style="width:100%;padding:10px;background:#111827;border:none;border-radius:10px;color:white;font-size:12px;font-weight:600;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:6px;margin-bottom:8px;">Translate to Native</button>
    ${outputBox('Native Translation', nativeText, targetLanguage, 'native')}`;
}

function outputBox(label, content, lang, type) {
  if (!content) return '';
  const isP = playingType === type;
  const iconBtn = (a, t, title, svg) => `<button class="vt-act" data-a="${a}" data-t="${esc(t)}" ${a === 'tts' ? `data-l="${lang}" data-type="${type}"` : ''} style="width:26px;height:26px;background:none;border:none;color:#9ca3af;cursor:pointer;border-radius:6px;display:flex;align-items:center;justify-content:center;" title="${title}">${svg}</button>`;
  return `<div style="margin-bottom:10px;">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:5px;">
      <span style="font-size:10px;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:0.6px;">${label}</span>
      <div style="display:flex;align-items:center;gap:1px;">
        ${iconBtn('copy', content, 'Copy', `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`)}
        ${iconBtn('insert', content, 'Insert into page', `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14"/><path d="m19 12-7 7-7-7"/></svg>`)}
        ${lang ? iconBtn('tts', content, isP ? 'Stop' : 'Listen', isP
          ? `<svg width="12" height="12" viewBox="0 0 24 24" fill="#ef4444"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>`
          : `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>`) : ''}
      </div>
    </div>
    <div style="padding:10px 12px;border-radius:10px;background:#ffffff;border:1px solid #e5e7eb;box-shadow:0 1px 3px rgba(0,0,0,0.05);">
      <p style="font-size:12px;line-height:1.6;color:#374151;white-space:pre-wrap;margin:0;word-break:break-word;">${escapeHtml(content)}</p>
    </div>
  </div>`;
}

function shareButtons() {
  return `<div style="display:flex;gap:6px;justify-content:center;margin:4px 0 8px;">
    <button class="vt-share" data-s="email" style="display:flex;align-items:center;gap:4px;padding:5px 10px;border-radius:8px;background:#ffffff;border:1px solid #ececec;color:#374151;font-size:10px;font-weight:600;cursor:pointer;">📧 Email</button>
    <button class="vt-share" data-s="slack" style="display:flex;align-items:center;gap:4px;padding:5px 10px;border-radius:8px;background:#ffffff;border:1px solid #ececec;color:#374151;font-size:10px;font-weight:600;cursor:pointer;">💬 Slack</button>
    <button class="vt-share" data-s="linkedin" style="display:flex;align-items:center;gap:4px;padding:5px 10px;border-radius:8px;background:#ffffff;border:1px solid #ececec;color:#374151;font-size:10px;font-weight:600;cursor:pointer;">💼 LinkedIn</button>
  </div>`;
}

// ========== WIRE TAB EVENTS ==========
function wireTabEvents() {
  if (!popupPanel) return;

  // Toggle active
  const toggleBtn = popupPanel.querySelector('#vt-panel-toggle');
  if (toggleBtn) toggleBtn.onclick = () => {
    if (isActive) deactivateMode(); else activateMode();
    renderPanel(); wireTabEvents();
  };

  // Language selector
  const langSel = popupPanel.querySelector('#vt-panel-lang');
  if (langSel) langSel.onchange = () => {
    targetLanguage = langSel.value;
    safeStorage({ vtLanguage: targetLanguage });
  };

  // Bottom icon action buttons — only work when toggle is ON
  const btnAll = popupPanel.querySelector('#vt-btn-all');
  if (btnAll) btnAll.onclick = () => {
    if (!isActive) { showToast('Turn on the toggle first.'); return; }
    translateAllVisibleText();
  };

  const btnSel = popupPanel.querySelector('#vt-btn-sel');
  if (btnSel) btnSel.onclick = () => {
    if (!isActive) { showToast('Turn on the toggle first.'); return; }
    const text = getSmartSelection();
    if (!text) { showToast('Select some text first.'); return; }
    try { translateAndShowInline(text, window.getSelection().getRangeAt(0)); }
    catch { translateAndShowInline(text, null); }
  };

  const btnClick = popupPanel.querySelector('#vt-btn-click');
  if (btnClick) btnClick.onclick = () => {
    if (!isActive) { showToast('Turn on the toggle first.'); return; }
    toggleSmartSelect(); renderPanel(); wireTabEvents();
  };

  const btnStop = popupPanel.querySelector('#vt-btn-stop');
  if (btnStop) btnStop.onclick = () => { stopTranslationFlag = true; removeAllTranslationOverlays(); showToast('Translations removed.'); };

  // Live Chat button
  const btnChat = popupPanel.querySelector('#vt-btn-chat');
  if (btnChat) btnChat.onclick = () => {
    window._vtToggleLiveChat?.();
    // renderPanel + wireTabEvents already called inside _vtToggleLiveChat
  };

  // If live chat is active, wire its events now
  if (window._vtLiveChatActive?.()) {
    window._vtWireChatEvents?.();
  }

  // Section toggles (tools tab)
  popupPanel.querySelectorAll('.vt-section-toggle').forEach(btn => {
    btn.onclick = () => {
      const sec = btn.dataset.section;
      expandedSections[sec] = !expandedSections[sec];
      renderPanel(); wireTabEvents();
    };
  });

  // Recording mode buttons
  popupPanel.querySelectorAll('.vt-mode-btn').forEach(btn => {
    btn.onclick = () => { recordingMode = btn.dataset.mode; renderPanel(); wireTabEvents(); };
  });

  // PTT button
  const pttBtn = popupPanel.querySelector('#vt-ptt-btn');
  if (pttBtn) {
    pttBtn.addEventListener('mousedown', () => { isPTTPressed = true; startRecording(); renderPanel(); wireTabEvents(); });
    pttBtn.addEventListener('mouseup', () => { isPTTPressed = false; stopAndProcess(); renderPanel(); wireTabEvents(); });
    pttBtn.addEventListener('mouseleave', () => { if (isPTTPressed) { isPTTPressed = false; stopAndProcess(); renderPanel(); wireTabEvents(); } });
  }

  // Continuous record button
  const contBtn = popupPanel.querySelector('#vt-cont-btn');
  if (contBtn) contBtn.onclick = () => {
    if (isRecording) { stopAndProcess(); } else { startRecording(); }
    renderPanel(); wireTabEvents();
  };

  // ── New mic section wiring ────────────────────────────────────────────────
  const micStart = popupPanel.querySelector('#vt-mic-start');
  if (micStart) micStart.onclick = () => extStartMic();

  const toneMicStart = popupPanel.querySelector('#vt-tone-mic-start');
  if (toneMicStart) toneMicStart.onclick = () => extStartMic();

  const micStop = popupPanel.querySelector('#vt-mic-stop');
  if (micStop) micStop.onclick = () => extStopMic();

  // File upload (bottom bar or tone bar)
  popupPanel.querySelectorAll('#vt-file-input, #vt-tone-file-input').forEach(fi => {
    fi.onchange = (e) => { if (e.target.files[0]) handleFile(e.target.files[0]); };
  });

  popupPanel.querySelectorAll('.vt-tone-chip').forEach(btn => {
    btn.onclick = () => {
      extSelectedTone = btn.dataset.tone;
      if (extSelectedTone === 'Custom') {
        renderPanel(); wireTabEvents();
      } else {
        extApplyTone(extSelectedTone);
      }
    };
  });

  const customToneInp = popupPanel.querySelector('#vt-ext-custom-tone');
  if (customToneInp) customToneInp.oninput = e => { extCustomTone = e.target.value; };
  const applyCustomBtn = popupPanel.querySelector('#vt-ext-apply-custom');
  if (applyCustomBtn) applyCustomBtn.onclick = () => extApplyTone('Custom');

  const outTA = popupPanel.querySelector('#vt-ext-output');
  if (outTA) outTA.oninput = e => { if (extToneText) extToneText = e.target.value; else extRawText = e.target.value; };

  const sendBoxBtn = popupPanel.querySelector('#vt-ext-send-box');
  if (sendBoxBtn) sendBoxBtn.onclick = () => {
    const text = extToneText || extRawText;
    if (!text) return;
    const inserted = insertTextIntoActive(text);
    if (!inserted) {
      navigator.clipboard.writeText(text).then(() => showToast('✓ Copied! No text field found — press ⌘V to paste'));
    }
  };

  const copyBarBtn = popupPanel.querySelector('#vt-ext-copy-bar');
  if (copyBarBtn) copyBarBtn.onclick = () => {
    navigator.clipboard.writeText(extToneText || extRawText).then(() => showToast('✓ Copied!'));
  };

  const copyOutBtn = popupPanel.querySelector('#vt-ext-copy-out');
  if (copyOutBtn) copyOutBtn.onclick = () => {
    navigator.clipboard.writeText(extToneText || extRawText).then(() => showToast('✓ Copied!'));
  };

  // Language dropdown in mic section
  const micLang = popupPanel.querySelector('#vt-mic-lang');
  if (micLang) micLang.onchange = () => {
    targetLanguage = micLang.value;
    safeStorage({ vtLanguage: targetLanguage });
  };

  // Translate button in mic output section
  const micTranslateBtn = popupPanel.querySelector('#vt-mic-translate-btn');
  if (micTranslateBtn) micTranslateBtn.onclick = () => {
    const text = extToneText || extRawText;
    if (!text?.trim()) { showToast('No text to translate.'); return; }
    doTranslate(text);
  };

  const clearOutBtn = popupPanel.querySelector('#vt-ext-clear-out');
  if (clearOutBtn) clearOutBtn.onclick = () => {
    extRawText = '';
    extToneText = '';
    extSelectedTone = null;
    extCustomTone = '';
    renderPanel(); wireTabEvents();
  };

  const toneSel = popupPanel.querySelector('#vt-tone-sel');
  if (toneSel) toneSel.onchange = () => {
    selectedTone = toneSel.value;
    safeStorage({ vtTone: selectedTone });
    renderPanel(); wireTabEvents();
  };
  const customToneInput = popupPanel.querySelector('#vt-custom-tone');
  if (customToneInput) customToneInput.oninput = () => { customTone = customToneInput.value; };
  const applyCustom = popupPanel.querySelector('#vt-apply-custom');
  if (applyCustom) applyCustom.onclick = () => { customTone = customToneInput?.value || ''; };

  const toneInput = popupPanel.querySelector('#vt-tone-input');
  if (toneInput) toneInput.oninput = () => { inputText = toneInput.value; };

  const applyToneBtn = popupPanel.querySelector('#vt-apply-tone');
  if (applyToneBtn) applyToneBtn.onclick = () => {
    const txt = toneInput?.value || inputText;
    if (!txt.trim()) { showToast('Enter some text first.'); return; }
    inputText = txt;
    doTone(txt);
  };

  // Translate section — single language dropdown
  const transLang = popupPanel.querySelector('#vt-trans-lang');
  if (transLang) transLang.onchange = () => {
    targetLanguage = transLang.value;
    safeStorage({ vtLanguage: targetLanguage });
  };
  const transInput = popupPanel.querySelector('#vt-trans-input');
  if (transInput) transInput.oninput = () => { inputText = transInput.value; };
  const transBtn = popupPanel.querySelector('#vt-trans-btn');
  if (transBtn) transBtn.onclick = () => {
    const txt = transInput?.value || inputText;
    if (!txt.trim()) { showToast('Enter some text first.'); return; }
    inputText = txt;
    doTranslate(txt);
  };

  // Output action buttons (copy, insert, tts)
  popupPanel.querySelectorAll('.vt-act').forEach(btn => {
    btn.onclick = () => {
      const action = btn.dataset.a;
      const text = btn.dataset.t;
      if (action === 'copy') { navigator.clipboard.writeText(text).then(() => showToast('Copied!')); }
      else if (action === 'insert') { insertTextIntoActive(text); showToast('Inserted!'); }
      else if (action === 'tts') {
        const lang = btn.dataset.l;
        const type = btn.dataset.type;
        if (playingType === type) { stopTTS(); } else { playTTS(text, lang, type); }
      }
    };
  });

  // Share buttons
  popupPanel.querySelectorAll('.vt-share').forEach(btn => {
    btn.onclick = () => showShareModal(btn.dataset.s);
  });
}

// ========== RECORDING ==========
async function startRecording() {
  try {
    audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    audioChunks = [];
    mediaRecorder = new MediaRecorder(audioStream);
    mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) audioChunks.push(e.data); };
    mediaRecorder.start(250);
    isRecording = true;
  } catch (err) {
    showToast('Microphone access denied.');
    isRecording = false;
  }
}

async function stopAndProcess() {
  if (!mediaRecorder || mediaRecorder.state === 'inactive') return;
  return new Promise((resolve) => {
    mediaRecorder.onstop = async () => {
      isRecording = false;
      if (audioStream) { audioStream.getTracks().forEach(t => t.stop()); audioStream = null; }
      const blob = new Blob(audioChunks, { type: 'audio/webm' });
      const reader = new FileReader();
      reader.onloadend = async () => {
        const base64 = reader.result;
        loadingMessage = 'Transcribing audio…';
        renderPanel(); wireTabEvents();
        try {
          const res = await sendMsg({ type: 'API_TRANSLATE_AUDIO', audioData: base64, mimeType: 'audio/webm' });
          if (res?.success) {
            englishText = res.data.english_text || '';
            rewrittenText = res.data.rewritten_text || '';
            nativeText = res.data.native_text || '';
          } else { showToast('Audio processing failed.'); }
        } catch { showToast('Audio processing failed.'); }
        loadingMessage = null;
        renderPanel(); wireTabEvents();
        resolve();
      };
      reader.readAsDataURL(blob);
    };
    mediaRecorder.stop();
  });
}

// ── New Native→English mic functions ─────────────────────────────────────────
async function extStartMic() {
  try {
    extMicStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    extMicChunks = [];
    const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : 'audio/webm';
    extMicRecorder = new MediaRecorder(extMicStream, { mimeType });
    extMicRecorder.ondataavailable = e => { if (e.data.size > 0) extMicChunks.push(e.data); };
    extMicRecorder.start();
    extMicRecording = true;
    extMicTimeSec = 0;
    extMicTimer = setInterval(() => {
      extMicTimeSec++;
      const el = popupPanel && popupPanel.querySelector('#vt-rec-timer');
      if (el) el.textContent = fmtSec(extMicTimeSec);
    }, 1000);
    // Waveform animation
    try {
      const ctx = new AudioContext();
      const src = ctx.createMediaStreamSource(extMicStream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 64;
      src.connect(analyser);
      const data = new Uint8Array(analyser.frequencyBinCount);
      extMicWaveInterval = setInterval(() => {
        analyser.getByteFrequencyData(data);
        const bars = popupPanel && popupPanel.querySelectorAll('.vt-wave-bar');
        if (bars) bars.forEach((bar, i) => {
          const val = data[Math.floor(i / bars.length * data.length)] || 0;
          bar.style.height = Math.max(3, Math.round(val / 255 * 22)) + 'px';
        });
      }, 60);
    } catch {}
    renderPanel(); wireTabEvents();
  } catch {
    showToast('Microphone access denied.');
  }
}

async function extStopMic() {
  if (extMicTimer) { clearInterval(extMicTimer); extMicTimer = null; }
  if (extMicWaveInterval) { clearInterval(extMicWaveInterval); extMicWaveInterval = null; }
  if (!extMicRecorder || extMicRecorder.state === 'inactive') return;
  extMicRecording = false;
  extMicLoading = true;
  renderPanel(); wireTabEvents();

  await new Promise(resolve => {
    extMicRecorder.onstop = resolve;
    extMicRecorder.stop();
  });
  if (extMicStream) { extMicStream.getTracks().forEach(t => t.stop()); extMicStream = null; }

  const blob = new Blob(extMicChunks, { type: 'audio/webm' });
  if (blob.size < 500) { extMicLoading = false; renderPanel(); wireTabEvents(); return; }

  try {
    const formData = new FormData();
    formData.append('file', blob, 'recording.webm');
    const res = await fetch('http://127.0.0.1:8000/api/translate-audio', { method: 'POST', body: formData });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    extRawText = data.transcript || '';
    extToneText = '';
    extSelectedTone = null;
  } catch (e) {
    showToast('Transcription failed: ' + e.message);
    extRawText = '';
  }
  extMicLoading = false;
  renderPanel(); wireTabEvents();
}

async function extApplyTone(tone) {
  const text = extRawText.trim();
  if (!text) return;

  // Map display names to exact backend tone names
  const TONE_MAP = {
    'Email Formal':      'Email Formal',
    'Email Casual':      'Email Casual',
    'Slack':             'Slack',
    'LinkedIn':          'LinkedIn',
    'WhatsApp Business': 'WhatsApp Business',
    'Custom':            'Custom',
  };

  extToneLoading = true;
  extToneText = '';
  extSelectedTone = tone;
  renderPanel(); wireTabEvents();

  try {
    const backendTone = TONE_MAP[tone] || tone;
    const userOverride = tone === 'Custom' ? (extCustomTone.trim() || null) : null;

    if (tone === 'Custom' && !userOverride) {
      extToneLoading = false;
      showToast('Enter a custom tone description first.');
      renderPanel(); wireTabEvents();
      return;
    }

    const r = await fetch('http://127.0.0.1:8000/api/rewrite-tone', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, tone: backendTone, user_override: userOverride }),
    });

    if (!r.ok) {
      const err = await r.json().catch(() => ({}));
      throw new Error(err.detail || `HTTP ${r.status}`);
    }

    const d = await r.json();
    extToneText = d.rewritten_text || text;
  } catch (e) {
    showToast('Tone rewrite failed: ' + e.message);
    extToneText = '';
  }

  extToneLoading = false;
  renderPanel(); wireTabEvents();
}

async function handleFile(file) {
  const reader = new FileReader();
  reader.onloadend = async () => {
    const base64 = reader.result;
    loadingMessage = 'Processing audio file…';
    renderPanel(); wireTabEvents();
    try {
      const res = await sendMsg({ type: 'API_TRANSLATE_AUDIO', audioData: base64, mimeType: file.type });
      if (res?.success) {
        englishText = res.data.english_text || '';
        rewrittenText = res.data.rewritten_text || '';
        nativeText = res.data.native_text || '';
      } else { showToast('File processing failed.'); }
    } catch { showToast('File processing failed.'); }
    loadingMessage = null;
    renderPanel(); wireTabEvents();
  };
  reader.readAsDataURL(file);
}

// ========== TONE / TRANSLATE ==========
async function doTone(text) {
  loadingMessage = 'Rewriting tone…';
  renderPanel(); wireTabEvents();
  try {
    const res = await sendMsg({ type: 'API_REWRITE_TONE', text, tone: selectedTone, userOverride: customTone });
    if (res?.success) { rewrittenText = res.data.rewritten_text || ''; }
    else { showToast('Tone rewrite failed.'); }
  } catch { showToast('Tone rewrite failed.'); }
  loadingMessage = null;
  renderPanel(); wireTabEvents();
}

async function doTranslate(text) {
  loadingMessage = 'Translating…';
  renderPanel(); wireTabEvents();
  try {
    const res = await sendMsg({ type: 'API_TRANSLATE_TEXT', text, targetLanguage });
    if (res?.success) { nativeText = res.data.translated_text || ''; }
    else { showToast('Translation failed.'); }
  } catch { showToast('Translation failed.'); }
  loadingMessage = null;
  renderPanel(); wireTabEvents();
}

// ========== TTS ==========
async function playTTS(text, lang, type) {
  stopTTS();
  try {
    const res = await sendMsg({ type: 'API_TEXT_TO_SPEECH', text, language: lang });
    if (res?.success && res.dataUrl) {
      currentAudio = new Audio(res.dataUrl);
      playingType = type;
      renderPanel(); wireTabEvents();
      currentAudio.onended = () => { playingType = null; currentAudio = null; renderPanel(); wireTabEvents(); };
      currentAudio.play();
    } else { showToast('TTS failed.'); }
  } catch { showToast('TTS failed.'); }
}

function stopTTS() {
  if (currentAudio) { currentAudio.pause(); currentAudio = null; }
  playingType = null;
}

// ========== SHARE ==========
function showShareModal(service) {
  const text = rewrittenText || englishText;
  if (!text) { showToast('No text to share.'); return; }
  if (service === 'email') {
    sendMsg({ type: 'API_SEND_EMAIL', data: { subject: 'Shared via SeedlingSpeaks', body: text } })
      .then(r => showToast(r?.success ? 'Email sent!' : 'Email failed.'))
      .catch(() => showToast('Email failed.'));
  } else if (service === 'slack') {
    sendMsg({ type: 'API_SEND_SLACK', data: { message: text } })
      .then(r => showToast(r?.success ? 'Sent to Slack!' : 'Slack failed.'))
      .catch(() => showToast('Slack failed.'));
  } else if (service === 'linkedin') {
    sendMsg({ type: 'API_SHARE_LINKEDIN', data: { text } })
      .then(r => showToast(r?.success ? 'Shared on LinkedIn!' : 'LinkedIn failed.'))
      .catch(() => showToast('LinkedIn failed.'));
  }
}

// ========== ACTIVATE / DEACTIVATE ==========
function activateMode() {
  isActive = true;
  safeStorage({ vtActive: true });
  document.addEventListener('mouseup', onMouseUp);
  document.addEventListener('touchend', onTouchEnd);
  updateIconState();
  if (popupPanel) renderPanel();
}

function deactivateMode() {
  isActive = false;
  safeStorage({ vtActive: false });
  document.removeEventListener('mouseup', onMouseUp);
  document.removeEventListener('touchend', onTouchEnd);
  removeSelectionPopup();
  if (smartSelectActive) toggleSmartSelect();
  updateIconState();
  if (popupPanel) renderPanel();
  if (isContextValid()) {
    try { chrome.runtime.sendMessage({ type: 'DEACTIVATED_FROM_PAGE' }); } catch {}
  }
}

// ========== SMART SELECT ==========
function toggleSmartSelect() {
  smartSelectActive = !smartSelectActive;
  if (smartSelectActive) {
    document.addEventListener('mouseover', onSmartHover);
    document.addEventListener('click', onSmartClick, true);
    document.body.style.cursor = 'crosshair';
  } else {
    document.removeEventListener('mouseover', onSmartHover);
    document.removeEventListener('click', onSmartClick, true);
    document.body.style.cursor = '';
    if (highlightedEl) { highlightedEl.style.outline = ''; highlightedEl = null; }
  }
}

function onSmartHover(e) {
  if (!smartSelectActive) return;
  const el = e.target;
  if (el === floatingIcon || el === popupPanel || el?.closest?.('#vt-popup-panel') || el?.closest?.('#vt-floating-icon')) return;
  if (highlightedEl && highlightedEl !== el) highlightedEl.style.outline = '';
  highlightedEl = el;
  el.style.outline = '2px solid #6366f1';
}

function onSmartClick(e) {
  if (!smartSelectActive) return;
  const el = e.target;
  if (el === floatingIcon || el?.closest?.('#vt-popup-panel') || el?.closest?.('#vt-floating-icon')) return;
  e.preventDefault(); e.stopPropagation();
  const text = extractText(el);
  if (text) translateInPlace(el, text);
  if (highlightedEl) { highlightedEl.style.outline = ''; highlightedEl = null; }
}

async function translateInPlace(el, text) {
  el.classList.add('vt-translated-element');
  const original = el.innerHTML;
  el.dataset.vtOriginal = original;
  try {
    const res = await sendMsg({ type: 'API_TRANSLATE_TEXT', text, targetLanguage });
    if (res?.success) {
      const translated = res.data.translated_text || text;
      el.innerHTML = escapeHtml(translated);
      const undoBtn = document.createElement('button');
      undoBtn.className = 'vt-undo-btn';
      undoBtn.textContent = '↩';
      undoBtn.title = 'Undo translation';
      undoBtn.onclick = () => { el.innerHTML = original; el.classList.remove('vt-translated-element'); delete el.dataset.vtOriginal; };
      el.appendChild(undoBtn);
    }
  } catch { el.classList.remove('vt-translated-element'); }
}

// ========== SELECTION HELPERS ==========
function getSmartSelection() {
  const sel = window.getSelection();
  if (sel && sel.toString().trim()) return sel.toString().trim();
  return '';
}

function extractText(el) {
  return (el.innerText || el.textContent || '').trim();
}

// ========== TEXT SELECTION POPUP ==========
function handleTextSelection() {
  if (!isActive) return;
  const sel = window.getSelection();
  const text = sel?.toString().trim();
  if (!text || text.length < 2) { removeSelectionPopup(); return; }
  try {
    const range = sel.getRangeAt(0);
    _lastRange = range.cloneRange();
    showSelectionPopup(range, text);
  } catch { removeSelectionPopup(); }
}

function onMouseUp(e) {
  if (e.target?.closest?.('#vt-selection-popup') || e.target?.closest?.('#vt-popup-panel') || e.target?.closest?.('#vt-floating-icon')) return;
  setTimeout(handleTextSelection, 10);
}

function onTouchEnd(e) {
  if (e.target?.closest?.('#vt-selection-popup') || e.target?.closest?.('#vt-popup-panel') || e.target?.closest?.('#vt-floating-icon')) return;
  setTimeout(handleTextSelection, 100);
}

function showSelectionPopup(range, text) {
  removeSelectionPopup();
  const rect = range.getBoundingClientRect();
  selectionPopup = document.createElement('div');
  selectionPopup.id = 'vt-selection-popup';

  selectionPopup.innerHTML = `
    <button id="vt-sel-translate">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
      Translate
    </button>
    <button id="vt-sel-copy">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
      Copy
    </button>`;

  const top = rect.top + window.scrollY - 52;
  const left = rect.left + window.scrollX + rect.width / 2 - 80;
  selectionPopup.style.top = Math.max(4, top) + 'px';
  selectionPopup.style.left = Math.max(4, Math.min(window.innerWidth - 180, left)) + 'px';

  document.body.appendChild(selectionPopup);

  selectionPopup.querySelector('#vt-sel-translate').onclick = () => {
    const savedRange = _lastRange;
    removeSelectionPopup();
    if (savedRange) translateAndShowInline(text, savedRange);
  };
  selectionPopup.querySelector('#vt-sel-copy').onclick = () => {
    navigator.clipboard.writeText(text).then(() => showToast('Copied!'));
    removeSelectionPopup();
  };

  // Auto-dismiss on outside click
  setTimeout(() => {
    document.addEventListener('mousedown', dismissPopup, { once: true });
  }, 0);
}

function dismissPopup(e) {
  if (e?.target?.closest?.('#vt-selection-popup')) return;
  removeSelectionPopup();
}

function removeSelectionPopup() {
  if (selectionPopup) { selectionPopup.remove(); selectionPopup = null; }
}

// ========== INLINE TRANSLATION (replaces selected text in-place) ==========
async function translateAndShowInline(text, range) {
  if (!range) { showToast('Could not locate selection.'); return; }

  // Wrap selection in a pulsing mark while loading
  let mark;
  try {
    mark = document.createElement('mark');
    mark.className = 'vt-translating-mark';
    range.surroundContents(mark);
  } catch {
    // surroundContents fails on cross-element selections — fall back to toast
    showToast('Translating…');
    mark = null;
  }

  try {
    const res = await sendMsg({ type: 'API_TRANSLATE_TEXT', text, targetLanguage });
    if (!res?.success) throw new Error('API error');
    const translated = res.data.translated_text || text;
    replaceSelectionWithTranslation(mark, text, translated, range);
  } catch {
    if (mark) unwrapMark(mark);
    showToast('Translation failed.');
  }
}

function replaceSelectionWithTranslation(mark, originalText, translatedText, range) {
  // Build the inline span
  const span = document.createElement('span');
  span.className = 'vt-translated-inline';
  span.dataset.vtOriginal = originalText;
  span.textContent = translatedText;

  const undoBtn = document.createElement('button');
  undoBtn.className = 'vt-undo-btn';
  undoBtn.textContent = '↩';
  undoBtn.title = 'Undo — restore original text';
  undoBtn.onclick = () => {
    const textNode = document.createTextNode(originalText);
    span.replaceWith(textNode);
  };

  span.appendChild(undoBtn);

  if (mark) {
    mark.replaceWith(span);
  } else {
    // Fallback: delete range contents and insert span
    try {
      range.deleteContents();
      range.insertNode(span);
    } catch {
      showToast(translatedText);
    }
  }
}

function unwrapMark(mark) {
  if (!mark || !mark.parentNode) return;
  const parent = mark.parentNode;
  while (mark.firstChild) parent.insertBefore(mark.firstChild, mark);
  parent.removeChild(mark);
}

// ========== TRANSLATE ALL VISIBLE ==========
async function translateAllVisibleText() {
  stopTranslationFlag = false;
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const p = node.parentElement;
      if (!p) return NodeFilter.FILTER_REJECT;
      const tag = p.tagName?.toUpperCase();
      if (['SCRIPT','STYLE','NOSCRIPT','TEXTAREA','INPUT','CODE','PRE'].includes(tag)) return NodeFilter.FILTER_REJECT;
      if (p.closest('#vt-popup-panel, #vt-floating-icon, #vt-selection-popup')) return NodeFilter.FILTER_REJECT;
      if (p.classList?.contains('vt-translated-inline') || p.classList?.contains('vt-undo-btn')) return NodeFilter.FILTER_REJECT;
      const text = node.textContent.trim();
      if (text.length < 3) return NodeFilter.FILTER_REJECT;
      const rect = p.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    }
  });

  const nodes = [];
  let n;
  while ((n = walker.nextNode())) nodes.push(n);

  for (const node of nodes) {
    if (stopTranslationFlag) break;
    const text = node.textContent.trim();
    if (!text) continue;
    try {
      const res = await sendMsg({ type: 'API_TRANSLATE_TEXT', text, targetLanguage });
      if (res?.success && node.parentNode) {
        const span = document.createElement('span');
        span.className = 'vt-translated-inline';
        span.dataset.vtOriginal = text;
        span.textContent = res.data.translated_text || text;
        const undoBtn = document.createElement('button');
        undoBtn.className = 'vt-undo-btn';
        undoBtn.textContent = '↩';
        undoBtn.title = 'Undo';
        undoBtn.onclick = () => {
          const t = document.createTextNode(text);
          span.replaceWith(t);
        };
        span.appendChild(undoBtn);
        node.parentNode.replaceChild(span, node);
      }
    } catch { /* skip node */ }
  }
  showToast(stopTranslationFlag ? 'Translation stopped.' : 'Page translated.');
}

function removeAllTranslationOverlays() {
  document.querySelectorAll('.vt-translated-inline').forEach(span => {
    const original = span.dataset.vtOriginal || span.textContent.replace(/↩$/, '').trim();
    span.replaceWith(document.createTextNode(original));
  });
  document.querySelectorAll('.vt-translated-element').forEach(el => {
    if (el.dataset.vtOriginal) { el.innerHTML = el.dataset.vtOriginal; delete el.dataset.vtOriginal; }
    el.classList.remove('vt-translated-element');
  });
}

// ========== HELPERS ==========

// Inject text into a contenteditable element reliably
function _fillWhatsApp(el, text) {
  // WhatsApp Web uses Lexical editor.
  // Most reliable approach: write to clipboard then trigger Ctrl+V.
  el.focus();
  document.execCommand('selectAll', false, null);

  navigator.clipboard.writeText(text).then(() => {
    // Simulate Ctrl+V — Lexical handles real paste events from clipboard
    el.dispatchEvent(new KeyboardEvent('keydown', { key: 'v', code: 'KeyV', ctrlKey: true, bubbles: true, cancelable: true }));
    document.execCommand('paste');

    // Fallback after 80ms: if still empty, use insertText
    setTimeout(() => {
      const current = (el.innerText || el.textContent || '').trim();
      if (!current) {
        el.focus();
        document.execCommand('selectAll', false, null);
        document.execCommand('insertText', false, text);
        el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: text }));
      }
    }, 80);
  }).catch(() => {
    // clipboard API unavailable — fall back to execCommand directly
    el.focus();
    document.execCommand('selectAll', false, null);
    document.execCommand('insertText', false, text);
    el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: text }));
  });
}

function _injectIntoContentEditable(el, text) {
  el.focus();
  // Clear and insert via execCommand (works in Gmail, Slack, WhatsApp, LinkedIn)
  const sel = window.getSelection();
  if (sel && sel.rangeCount) {
    const range = sel.getRangeAt(0);
    range.deleteContents();
    range.insertNode(document.createTextNode(text));
    range.collapse(false);
    sel.removeAllRanges();
    sel.addRange(range);
  } else {
    document.execCommand('selectAll', false, null);
    document.execCommand('insertText', false, text);
  }
  el.dispatchEvent(new InputEvent('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
}

// Detect and fill the best compose field on the current page
function insertTextIntoActive(text) {
  const host = window.location.hostname;

  // ── Gmail ──────────────────────────────────────────────────────────────────
  if (host.includes('mail.google.com')) {
    // Find the compose body — try multiple selectors, pick the one inside the compose window
    const gmailBody =
      document.querySelector('div[aria-label="Message Body"][contenteditable="true"]') ||
      document.querySelector('div[g_editable="true"][contenteditable="true"]') ||
      document.querySelector('div.Am.Al.editable[contenteditable="true"]') ||
      document.querySelector('div.editable[contenteditable="true"]') ||
      [...document.querySelectorAll('div[contenteditable="true"]')]
        .find(el => !el.closest('#vt-popup-panel') && el.getBoundingClientRect().height > 80);

    if (gmailBody) {
      // Parse "Subject: ..." from the text
      let subject = '';
      let body = text;

      const subjectMatch = text.match(/^Subject:\s*(.+?)[\r\n]+/i);
      if (subjectMatch) {
        subject = subjectMatch[1].trim();
        body = text.slice(subjectMatch[0].length).trim();
      }

      // Fill subject field
      if (subject) {
        const subjectEl =
          document.querySelector('input[name="subjectbox"]') ||
          document.querySelector('input[placeholder="Subject"]') ||
          document.querySelector('input[data-hm="subject"]') ||
          document.querySelector('td.aoD.hl input') ||
          document.querySelector('.aoT');
        if (subjectEl) {
          subjectEl.focus();
          const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
          nativeSetter.call(subjectEl, subject);
          subjectEl.dispatchEvent(new Event('input', { bubbles: true }));
          subjectEl.dispatchEvent(new Event('change', { bubbles: true }));
        }
      }

      // Fill body after a short delay so subject fill settles
      setTimeout(() => {
        gmailBody.focus();
        document.execCommand('selectAll', false, null);
        document.execCommand('insertText', false, body);
        gmailBody.dispatchEvent(new InputEvent('input', { bubbles: true }));
      }, 80);

      showToast(subject ? '✓ Filled subject + body' : '✓ Filled Gmail compose');
      return true;
    }
  }

  // ── Slack Web ──────────────────────────────────────────────────────────────
  if (host.includes('slack.com') || host.includes('app.slack.com')) {
    const slackInput = document.querySelector(
      '[data-qa="message_input"] [contenteditable="true"], ' +
      '.ql-editor[contenteditable="true"], ' +
      'div[aria-label="Message"][contenteditable="true"], ' +
      'div[data-qa="message-input"][contenteditable="true"]'
    );
    if (slackInput) {
      _injectIntoContentEditable(slackInput, text);
      showToast('✓ Filled Slack message');
      return true;
    }
  }

  // ── WhatsApp Web ───────────────────────────────────────────────────────────
  if (host.includes('web.whatsapp.com') || host.includes('whatsapp.com')) {
    const waInput =
      document.querySelector('div[contenteditable="true"][data-tab="10"]') ||
      document.querySelector('div[contenteditable="true"][data-tab="1"]') ||
      document.querySelector('footer div[contenteditable="true"]') ||
      document.querySelector('div[role="textbox"][contenteditable="true"][spellcheck="true"]') ||
      document.querySelector('div[role="textbox"][contenteditable="true"]');

    if (waInput) {
      _fillWhatsApp(waInput, text);
      showToast('✓ Filled WhatsApp message');
      return true;
    }
  }

  // ── LinkedIn ───────────────────────────────────────────────────────────────
  if (host.includes('linkedin.com')) {
    // LinkedIn message compose or post box
    const liInput = document.querySelector(
      'div.msg-form__contenteditable[contenteditable="true"], ' +
      'div[data-placeholder][contenteditable="true"], ' +
      'div.ql-editor[contenteditable="true"], ' +
      'div[role="textbox"][contenteditable="true"], ' +
      'div.share-creation-state__text-editor [contenteditable="true"]'
    );
    if (liInput) {
      _injectIntoContentEditable(liInput, text);
      showToast('✓ Filled LinkedIn compose');
      return true;
    }
  }

  // ── Generic fallback: try document.activeElement ───────────────────────────
  const el = document.activeElement;
  if (el) {
    if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
      const start = el.selectionStart ?? el.value.length;
      const end = el.selectionEnd ?? el.value.length;
      el.value = el.value.slice(0, start) + text + el.value.slice(end);
      el.selectionStart = el.selectionEnd = start + text.length;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      showToast('✓ Text inserted');
      return true;
    }
    if (el.isContentEditable) {
      _injectIntoContentEditable(el, text);
      showToast('✓ Text inserted');
      return true;
    }
  }

  // ── Last resort: find any visible contenteditable on the page ─────────────
  const allEditable = [...document.querySelectorAll('[contenteditable="true"]')]
    .filter(el => {
      if (el.closest('#vt-popup-panel')) return false;
      const r = el.getBoundingClientRect();
      return r.width > 50 && r.height > 20;
    });
  if (allEditable.length) {
    _injectIntoContentEditable(allEditable[allEditable.length - 1], text);
    showToast('✓ Text inserted into field');
    return true;
  }

  return false;
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function esc(str) {
  if (!str) return '';
  return str.replace(/'/g, '&#39;').replace(/"/g, '&quot;');
}

function showToast(msg) {
  const existing = document.getElementById('vt-ext-toast');
  if (existing) existing.remove();
  const toast = document.createElement('div');
  toast.id = 'vt-ext-toast';
  toast.textContent = msg;
  document.body.appendChild(toast);
  setTimeout(() => { toast.style.opacity = '0'; toast.style.transform = 'translateY(8px)'; setTimeout(() => toast.remove(), 300); }, 2500);
}

// ========== WIDGET FILL BRIDGE ==========
const WIDGET_FILL_API = 'http://127.0.0.1:8000/api/widget-fill';
let _fillPollInterval = null;

function startWidgetFillPolling() {
  if (_fillPollInterval) return;
  // Only poll on Gmail and Slack
  const host = window.location.hostname;
  const isGmail = host.includes('mail.google.com');
  const isSlack = host.includes('slack.com');
  if (!isGmail && !isSlack) return;

  _fillPollInterval = setInterval(async () => {
    try {
      const res = await fetch(WIDGET_FILL_API, { method: 'GET' });
      if (!res.ok) return;
      const data = await res.json();
      if (!data.pending) return;

      if (isGmail) {
        fillGmailCompose(data.subject || '', data.body || '');
      } else if (isSlack) {
        fillSlackCompose(data.body || data.subject || '');
      }
    } catch {}
  }, 800);
}

function fillGmailCompose(subject, body) {
  // Gmail subject input — try multiple selectors
  const subjectEl = document.querySelector(
    'input[name="subjectbox"], ' +
    'input[placeholder="Subject"], ' +
    'input[data-hm="subject"], ' +
    'td.aoD.hl input, ' +
    '.aoT'
  );

  if (subjectEl && subject) {
    subjectEl.focus();
    // Native input value setter to bypass React's synthetic events
    const nativeInputSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    nativeInputSetter.call(subjectEl, subject);
    subjectEl.dispatchEvent(new Event('input', { bubbles: true }));
    subjectEl.dispatchEvent(new Event('change', { bubbles: true }));
  }

  // Gmail body — contenteditable div, wait a tick for compose to be ready
  setTimeout(() => {
    const bodyEl = document.querySelector(
      'div[aria-label="Message Body"], ' +
      'div[g_editable="true"], ' +
      'div.Am.Al.editable[contenteditable="true"], ' +
      'div[contenteditable="true"][role="textbox"]'
    );
    if (bodyEl && body) {
      bodyEl.focus();
      // Clear existing content and insert
      bodyEl.innerHTML = '';
      document.execCommand('insertText', false, body);
      bodyEl.dispatchEvent(new InputEvent('input', { bubbles: true }));
    }
    showToast('✓ Email filled from widget');
  }, 200);
}

function fillSlackCompose(text) {
  // Slack message input — contenteditable div
  const slackInput = document.querySelector(
    '[data-qa="message_input"] [contenteditable="true"], .ql-editor[contenteditable="true"], [aria-label="Message"] [contenteditable="true"]'
  );
  if (slackInput) {
    slackInput.focus();
    document.execCommand('selectAll', false, null);
    document.execCommand('insertText', false, text);
    slackInput.dispatchEvent(new InputEvent('input', { bubbles: true }));
    showToast('✓ Message filled from widget');
  } else {
    insertTextIntoActive(text);
    showToast('✓ Text inserted from widget');
  }
}

// Start polling when the page loads
if (isContextValid()) {
  startWidgetFillPolling();
}


// ========== LIVE CHAT TRANSLATION ==========
// Flow:
// - Incoming: new messages auto-translated and shown in the extension panel
// - Outgoing: speak in native → transcript shown → click Send → fills compose + sends
(function initLiveChat() {
  if (!isContextValid()) return;

  const CHAT_LANGUAGES = {
    'English':   'en-IN',
    'Hindi':     'hi-IN',
    'Kannada':   'kn-IN',
    'Tamil':     'ta-IN',
    'Telugu':    'te-IN',
    'Malayalam': 'ml-IN',
    'Bengali':   'bn-IN',
    'Marathi':   'mr-IN',
    'Gujarati':  'gu-IN',
    'Punjabi':   'pa-IN',
    'Odia':      'or-IN',
  };

  const SITES = {
    'web.whatsapp.com': {
      // Match the outermost copyable-text container only — avoids partial child matches
      msgSelector: 'div.message-in div.copyable-text',
      compose: () =>
        document.querySelector('div[contenteditable="true"][data-tab="10"]') ||
        document.querySelector('div[contenteditable="true"][data-lexical-editor="true"]') ||
        document.querySelector('footer div[contenteditable="true"]') ||
        document.querySelector('div[role="textbox"][contenteditable="true"]') ||
        document.querySelector('div[contenteditable="true"][spellcheck="true"]'),
      sendBtn: () =>
        document.querySelector('button[data-tab="11"]') ||
        document.querySelector('button[aria-label="Send"]') ||
        document.querySelector('span[data-icon="send"]')?.closest('button'),
      platform: 'WhatsApp',
    },
    'mail.google.com': {
      msgSelector: 'div.a3s.aiL, div[data-message-id] .ii.gt',
      compose: () =>
        document.querySelector('div[aria-label="Message Body"][contenteditable="true"]') ||
        document.querySelector('div.Am.Al.editable[contenteditable="true"]'),
      sendBtn: () => document.querySelector('div[data-tooltip="Send"] .T-I'),
      platform: 'Gmail',
    },
    'app.slack.com': {
      // Slack Web uses multiple possible selectors depending on version
      msgSelector: [
        'div.c-message_kit__blocks',
        'div.p-rich_text_block',
        'span.p-rich_text_section',
        'div.c-message__body',
        '[data-qa="message-text"]',
        'div.c-message_kit__text',
      ].join(', '),
      compose: () =>
        document.querySelector('div[data-qa="message_input"] [contenteditable="true"]') ||
        document.querySelector('.ql-editor[contenteditable="true"]') ||
        document.querySelector('div[aria-label][contenteditable="true"]') ||
        document.querySelector('div[contenteditable="true"][role="textbox"]'),
      sendBtn: () =>
        document.querySelector('button[data-qa="texty_send_button"]') ||
        document.querySelector('button[aria-label="Send message"]') ||
        document.querySelector('button[data-qa="message_input_send_button"]'),
      platform: 'Slack',
    },
    'linkedin.com': {
      msgSelector: 'div.msg-s-event__content, p.msg-s-event-listitem__body',
      compose: () => document.querySelector('div.msg-form__contenteditable[contenteditable="true"]'),
      sendBtn: () => document.querySelector('button.msg-form__send-button'),
      platform: 'LinkedIn',
    },
  };

  let liveChatActive = false;
  let chatObserver = null;
  let chatTargetLang = 'en-IN';
  let chatMessages = [];
  let chatSeenTexts = new Set(); // dedup by text content
  let chatSentByMe = new Set(); // texts we sent ourselves, to avoid re-capturing as incoming
  let chatMicRecording = false;
  let chatMicChunks = [];
  let chatMicRecorder = null;
  let chatMicStream = null;
  let chatMicTimeSec = 0;
  let chatMicTimer = null;
  let chatOutgoingText = '';
  let chatLoading = false;

  chrome.storage.local.get('vtChatLang', r => { if (r.vtChatLang) chatTargetLang = r.vtChatLang; });

  function getSite() {
    const host = window.location.hostname;
    for (const key of Object.keys(SITES)) {
      if (host.includes(key)) return SITES[key];
    }
    return null;
  }

  async function processMessage(el, sender) {
    if (el.hasAttribute('data-vt-chat-done')) return;
    // Skip if any ancestor is already processed (avoids parent+child double-processing)
    if (el.closest('[data-vt-chat-done]')) return;
    // Skip messages that are inside the compose/input area (outgoing, not yet sent)
    if (el.closest('[data-qa="message_input"], .ql-editor, [contenteditable="true"][role="textbox"]')) return;
    // Slack: skip messages that are in a "sending" state (optimistic UI before server confirms)
    if (el.closest('.c-message--sending, [data-qa="message-sending"]')) return;

    // For WhatsApp: get text from the inner span.selectable-text to avoid metadata
    let text = '';
    const innerSpan = el.querySelector('span.selectable-text span') || el.querySelector('span.selectable-text') || el;
    text = (innerSpan.innerText || innerSpan.textContent || '').trim();
    if (!text) text = (el.innerText || el.textContent || '').trim();

    if (!text || text.length < 2) return;
    if (/^\d{1,2}:\d{2}/.test(text)) return;
    // Skip UI chrome elements (buttons, labels, etc.)
    if (el.closest('button, [role="button"], [data-qa="reaction_button"]')) return;
    // Skip if this text was sent by us via the extension
    if (chatSentByMe.has(text)) { el.setAttribute('data-vt-chat-done', '1'); return; }

    // Mark element as processed — this is the primary dedup mechanism
    // (chatSeenTexts is only used to prevent the same element being processed via multiple code paths)
    el.setAttribute('data-vt-chat-done', '1');
    const msgId = 'vtmsg_' + Date.now() + '_' + Math.random().toString(36).slice(2);
    chatMessages.push({ id: msgId, sender, original: text, translated: null, time: new Date().toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}) });
    refreshChatPanel();

    try {
      const res = await sendMsg({ type: 'API_TRANSLATE_TEXT', text, targetLanguage: chatTargetLang });
      const msg = chatMessages.find(m => m.id === msgId);
      if (msg) { msg.translated = res?.success ? (res.data?.translated_text || text) : text; refreshChatPanel(); }
    } catch {
      const msg = chatMessages.find(m => m.id === msgId);
      if (msg) { msg.translated = text; refreshChatPanel(); }
    }
  }

  async function scanExisting() {
    const site = getSite();
    if (!site) return;
    const els = [...document.querySelectorAll(site.msgSelector)].slice(-10);
    for (const el of els) await processMessage(el, 'them');
  }

  function startObserver() {
    if (chatObserver) return;
    const site = getSite();
    if (!site) return;
    chatObserver = new MutationObserver((mutations) => {
      if (!liveChatActive) return;
      for (const m of mutations) {
        for (const node of m.addedNodes) {
          if (node.nodeType !== Node.ELEMENT_NODE) continue;
          // Check the node itself
          if (node.matches?.(site.msgSelector)) {
            processMessage(node, 'them');
          }
          // Check all descendants
          const descendants = node.querySelectorAll?.(site.msgSelector);
          if (descendants) descendants.forEach(el => processMessage(el, 'them'));
        }
      }
    });
    chatObserver.observe(document.body, { childList: true, subtree: true });
  }

  function stopObserver() {
    if (chatObserver) { chatObserver.disconnect(); chatObserver = null; }
  }

  async function startChatMic() {
    try {
      chatMicStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      chatMicChunks = [];
      chatMicRecorder = new MediaRecorder(chatMicStream, { mimeType: 'audio/webm' });
      chatMicRecorder.ondataavailable = e => { if (e.data.size > 0) chatMicChunks.push(e.data); };
      chatMicRecorder.onstop = async () => {
        chatLoading = true; refreshChatPanel();
        const blob = new Blob(chatMicChunks, { type: 'audio/webm' });
        try {
          const reader = new FileReader();
          const base64 = await new Promise(r => { reader.onloadend = () => r(reader.result); reader.readAsDataURL(blob); });
          const res = await sendMsg({ type: 'API_TRANSLATE_AUDIO', audioData: base64, mimeType: 'audio/webm' });
          chatOutgoingText = res?.success ? (res.data?.transcript || res.data?.english_text || '') : '';
          if (!chatOutgoingText) showToast('Could not transcribe. Try again.');
        } catch { showToast('Transcription failed.'); }
        chatLoading = false; chatMicRecording = false; refreshChatPanel();
      };
      chatMicRecorder.start();
      chatMicRecording = true;
      chatMicTimeSec = 0;
      chatMicTimer = setInterval(() => {
        chatMicTimeSec++;
        // Only update the timer text, don't re-render the whole panel
        const timerEl = document.getElementById('vt-chat-rec-timer');
        if (timerEl) {
          timerEl.textContent = fmtSec(chatMicTimeSec);
        }
      }, 1000);
      refreshChatPanel();
    } catch { showToast('Microphone access denied.'); }
  }

  function stopChatMic() {
    if (chatMicTimer) { clearInterval(chatMicTimer); chatMicTimer = null; }
    if (chatMicRecorder && chatMicRecording) {
      chatMicRecorder.stop();
      chatMicStream?.getTracks().forEach(t => t.stop());
    }
  }

  function sendOutgoing() {
    const text = chatOutgoingText.trim();
    if (!text) return;
    const site = getSite();
    if (!site) return;
    const compose = site.compose();
    if (!compose) { showToast('Could not find compose box.'); return; }

    // Fill the compose box then send
    fillCompose(compose, text, window.location.hostname, function() {
      setTimeout(function() {
        const btn = site.sendBtn?.();
        if (btn) {
          btn.click();
        } else {
          compose.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true }));
        }
        chatMessages.push({ id: 'vtmsg_out_' + Date.now(), sender: 'me', original: text, translated: null, time: new Date().toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}) });
        // Prevent the observer from re-capturing our own sent message as incoming
        chatSentByMe.add(text);
        chatOutgoingText = '';
        refreshChatPanel();
        showToast('✓ Sent');
      }, 400);
    });
  }

  // Fill a contenteditable compose box reliably across WhatsApp/Slack/Gmail
  function fillCompose(el, text, host, callback) {
    el.focus();

    // Method 1: DataTransfer paste event (works in WhatsApp Lexical, Slack)
    try {
      const dt = new DataTransfer();
      dt.setData('text/plain', text);
      const pasteEvent = new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true });
      el.dispatchEvent(pasteEvent);
      // Check if it worked after a tick
      setTimeout(function() {
        const val = (el.innerText || el.textContent || '').trim();
        if (val && val !== '\n') { callback(); return; }
        // Method 2: execCommand insertText
        el.focus();
        document.execCommand('selectAll', false, null);
        document.execCommand('insertText', false, text);
        el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: text }));
        setTimeout(function() {
          const val2 = (el.innerText || el.textContent || '').trim();
          if (val2 && val2 !== '\n') { callback(); return; }
          // Method 3: clipboard writeText + paste
          navigator.clipboard.writeText(text).then(function() {
            el.focus();
            document.execCommand('paste');
            setTimeout(callback, 200);
          }).catch(function() {
            // Method 4: manual DOM insertion
            el.focus();
            const sel = window.getSelection();
            if (sel && sel.rangeCount) {
              const range = sel.getRangeAt(0);
              range.selectNodeContents(el);
              range.deleteContents();
              range.insertNode(document.createTextNode(text));
              range.collapse(false);
              sel.removeAllRanges();
              sel.addRange(range);
            }
            el.dispatchEvent(new InputEvent('input', { bubbles: true }));
            callback();
          });
        }, 80);
      }, 80);
    } catch(e) {
      // Fallback
      el.focus();
      document.execCommand('selectAll', false, null);
      document.execCommand('insertText', false, text);
      callback();
    }
  }

  function renderChatPanel() {
    const site = getSite();
    const platform = site?.platform || 'Chat';
    const langOptions = Object.entries(CHAT_LANGUAGES).map(([name, code]) =>
      `<option value="${code}" ${chatTargetLang === code ? 'selected' : ''}>${name}</option>`
    ).join('');

    const messagesHtml = chatMessages.length === 0
      ? `<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;gap:8px;color:#9ca3af;text-align:center;">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#d1d5db" stroke-width="1.5"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
          <span style="font-size:11px;font-weight:600;">Waiting for messages…</span>
          <span style="font-size:10px;">New messages will appear here translated</span>
        </div>`
      : chatMessages.map(msg => {
          const isMe = msg.sender === 'me';
          const displayText = msg.translated !== null ? msg.translated : msg.original;
          const isLoading = msg.translated === null && msg.sender !== 'me';
          return `<div style="display:flex;flex-direction:column;align-items:${isMe ? 'flex-end' : 'flex-start'};margin-bottom:8px;">
            <div style="max-width:88%;background:${isMe ? '#1a1a1a' : '#f3f4f6'};color:${isMe ? '#fff' : '#1a1a1a'};border-radius:${isMe ? '12px 12px 2px 12px' : '12px 12px 12px 2px'};padding:8px 11px;font-size:12px;line-height:1.5;word-break:break-word;">
              ${isLoading ? `<span style="color:#9ca3af;font-style:italic;">Translating…</span>` : escapeHtml(displayText)}
              ${!isLoading && msg.translated && msg.translated !== msg.original && msg.sender !== 'me'
                ? `<div style="font-size:10px;margin-top:3px;opacity:0.5;font-style:italic;">${escapeHtml(msg.original)}</div>` : ''}
            </div>
            <span style="font-size:9px;color:#9ca3af;margin-top:2px;">${msg.time}</span>
          </div>`;
        }).join('');

    let outgoingHtml = '';
    if (chatMicRecording) {
      outgoingHtml = `<div style="display:flex;align-items:center;gap:8px;background:#fef2f2;border:1px solid #fecaca;border-radius:10px;padding:9px 12px;">
        <div style="width:7px;height:7px;border-radius:50%;background:#ef4444;flex-shrink:0;animation:vtRecPulse 1s ease-in-out infinite;"></div>
        <span id="vt-chat-rec-timer" style="font-size:11px;font-family:monospace;font-weight:700;color:#dc2626;">${fmtSec(chatMicTimeSec)}</span>
        <span style="font-size:11px;color:#dc2626;flex:1;">Recording…</span>
        <button id="vt-chat-stop-rec" style="padding:6px 12px;background:#ef4444;border:none;border-radius:8px;color:#fff;font-size:11px;font-weight:700;cursor:pointer;">Stop</button>
      </div>`;
    } else if (chatLoading) {
      outgoingHtml = `<div style="display:flex;align-items:center;gap:8px;padding:10px;background:#f9fafb;border-radius:10px;">
        <div class="vt-spinner"></div><span style="font-size:11px;color:#6b7280;">Transcribing…</span>
      </div>`;
    } else if (chatOutgoingText) {
      outgoingHtml = '<div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:9px 12px;">'
        + '<div style="font-size:10px;font-weight:700;color:#16a34a;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:4px;">Ready to send</div>'
        + '<div id="vt-chat-outgoing-text" contenteditable="true" style="font-size:12px;color:#1a1a1a;line-height:1.5;outline:none;min-height:20px;border:none;background:transparent;">' + escapeHtml(chatOutgoingText) + '</div>'
        + '<div style="display:flex;gap:6px;margin-top:8px;">'
        + '<button id="vt-chat-send-btn" style="flex:1;padding:8px;background:#16a34a;border:none;border-radius:8px;color:#fff;font-size:12px;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:6px;"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>Send</button>'
        + '<button id="vt-chat-discard-btn" style="padding:8px 12px;background:#fff;border:1px solid #e5e7eb;border-radius:8px;color:#6b7280;font-size:11px;font-weight:600;cursor:pointer;">Discard</button>'
        + '</div></div>';
    } else {
      outgoingHtml = '<div style="display:flex;gap:6px;align-items:center;">'
        + '<input id="vt-chat-text-input" type="text" placeholder="Type a message..." value="' + escapeHtml(chatOutgoingText) + '" style="flex:1;padding:10px 12px;border:1px solid #e5e7eb;border-radius:10px;font-size:12px;outline:none;color:#1a1a1a;background:#fff;" />'
        + '<button id="vt-chat-text-send-btn" style="padding:10px 14px;background:#1a1a1a;border:none;border-radius:10px;color:#fff;font-size:12px;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg></button>'
        + '<button id="vt-chat-mic-btn" title="Speak to send" style="padding:10px;background:#f3f4f6;border:1px solid #e5e7eb;border-radius:10px;color:#374151;cursor:pointer;display:flex;align-items:center;justify-content:center;"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg></button>'
        + '</div>';
    }

    return `
      <style>@keyframes vtRecPulse{0%,100%{opacity:1}50%{opacity:0.3}}</style>
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;flex-shrink:0;">
        <div style="display:flex;align-items:center;gap:6px;">
          <div style="width:7px;height:7px;border-radius:50%;background:#22c55e;flex-shrink:0;"></div>
          <span style="font-size:11px;font-weight:700;color:#374151;">Live Chat · ${platform}</span>
        </div>
        <div style="display:flex;align-items:center;gap:5px;">
          <span style="font-size:10px;color:#9ca3af;font-weight:600;">To</span>
          <select id="vt-chat-lang-sel" style="padding:4px 8px;border:1px solid #e5e7eb;border-radius:8px;font-size:11px;font-weight:600;color:#374151;background:#f9fafb;outline:none;cursor:pointer;">${langOptions}</select>
          <button id="vt-chat-clear-btn" title="Clear messages" style="padding:4px 7px;background:#f3f4f6;border:1px solid #e5e7eb;border-radius:8px;color:#9ca3af;font-size:10px;font-weight:700;cursor:pointer;display:flex;align-items:center;gap:3px;">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>
            Clear
          </button>
        </div>
      </div>
      <div id="vt-chat-messages" style="flex:1;overflow-y:auto;padding:2px 0;min-height:0;">${messagesHtml}</div>
      <div style="flex-shrink:0;margin-top:8px;">${outgoingHtml}</div>`;
  }

  function refreshChatPanel() {
    if (!popupPanel || !liveChatActive) return;
    const content = popupPanel.querySelector('#vt-tab-content');
    if (!content) return;
    // Preserve any typed text in the input before re-render
    const existingInput = content.querySelector('#vt-chat-text-input');
    if (existingInput && existingInput.value.trim()) {
      chatOutgoingText = existingInput.value;
    }
    content.innerHTML = renderChatPanel();
    wireChatEvents();
    const feed = content.querySelector('#vt-chat-messages');
    if (feed) feed.scrollTop = feed.scrollHeight;
  }

  function wireChatEvents() {
    if (!popupPanel) return;
    const content = popupPanel.querySelector('#vt-tab-content');
    if (!content) return;

    const langSel = content.querySelector('#vt-chat-lang-sel');
    if (langSel) langSel.onchange = (e) => {
      chatTargetLang = e.target.value;
      safeStorage({ vtChatLang: chatTargetLang });
      chatMessages.forEach(m => { if (m.sender !== 'me') m.translated = null; });
      refreshChatPanel();
      chatMessages.filter(m => m.sender !== 'me').forEach(async (m) => {
        try {
          const res = await sendMsg({ type: 'API_TRANSLATE_TEXT', text: m.original, targetLanguage: chatTargetLang });
          m.translated = res?.success ? (res.data?.translated_text || m.original) : m.original;
          refreshChatPanel();
        } catch { m.translated = m.original; refreshChatPanel(); }
      });
    };

    const micBtn = content.querySelector('#vt-chat-mic-btn');
    if (micBtn) micBtn.onclick = startChatMic;

    const stopRec = content.querySelector('#vt-chat-stop-rec');
    if (stopRec) stopRec.onclick = stopChatMic;

    // Text input — update chatOutgoingText on input
    const textInput = content.querySelector('#vt-chat-text-input');
    if (textInput) {
      textInput.oninput = (e) => { chatOutgoingText = e.target.value; };
      textInput.onkeydown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          chatOutgoingText = textInput.value.trim();
          if (chatOutgoingText) sendOutgoing();
        }
      };
    }

    // Text send button
    const textSendBtn = content.querySelector('#vt-chat-text-send-btn');
    if (textSendBtn) textSendBtn.onclick = () => {
      const inp = content.querySelector('#vt-chat-text-input');
      chatOutgoingText = (inp ? inp.value : chatOutgoingText).trim();
      if (chatOutgoingText) sendOutgoing();
    };

    const sendBtn = content.querySelector('#vt-chat-send-btn');
    if (sendBtn) sendBtn.onclick = () => {
      const editEl = content.querySelector('#vt-chat-outgoing-text');
      if (editEl) chatOutgoingText = (editEl.innerText || editEl.textContent || chatOutgoingText).trim();
      sendOutgoing();
    };

    const discardBtn = content.querySelector('#vt-chat-discard-btn');
    if (discardBtn) discardBtn.onclick = () => { chatOutgoingText = ''; refreshChatPanel(); };

    const clearBtn = content.querySelector('#vt-chat-clear-btn');
    if (clearBtn) clearBtn.onclick = () => {
      chatMessages = [];
      chatSeenTexts = new Set();
      chatSentByMe = new Set();
      // Also remove data-vt-chat-done attributes so messages can be re-scanned
      document.querySelectorAll('[data-vt-chat-done]').forEach(el => el.removeAttribute('data-vt-chat-done'));
      refreshChatPanel();
    };
  }

  window._vtToggleLiveChat = function() {
    const site = getSite();
    if (!site) {
      showToast('Live chat works on WhatsApp Web, Gmail, Slack, and LinkedIn.');
      return false;
    }
    if (liveChatActive) {
      liveChatActive = false;
      stopObserver();
      chatMessages = [];
      chatSeenTexts = new Set();
      chatSentByMe = new Set();
      chatOutgoingText = '';
      renderPanel(); wireTabEvents();
      showToast('Live chat stopped.');
    } else {
      liveChatActive = true;
      chatMessages = [];
      chatSeenTexts = new Set();
      chatSentByMe = new Set();
      chatOutgoingText = '';
      const site = getSite();
      if (site) {
        const allEls = [...document.querySelectorAll(site.msgSelector)];

        // Mark ALL existing elements as done — nothing gets auto-processed
        allEls.forEach(el => {
          el.setAttribute('data-vt-chat-done', '1');
        });

        // Pick the single last element with real text and translate it directly
        const lastEl = [...allEls].reverse().find(el => {
          const t = (el.innerText || el.textContent || '').trim();
          return t && t.length >= 2 && !/^\d{1,2}:\d{2}/.test(t);
        });

        if (lastEl) {
          // Get the innermost text — avoid picking up metadata/timestamps
          const innerSpan = lastEl.querySelector('span.selectable-text span')
            || lastEl.querySelector('span.selectable-text')
            || lastEl;
          let text = (innerSpan.innerText || innerSpan.textContent || '').trim();
          if (!text) text = (lastEl.innerText || lastEl.textContent || '').trim();

          if (text && text.length >= 2) {
            const msgId = 'vtmsg_init_' + Date.now();
            const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            chatMessages.push({ id: msgId, sender: 'them', original: text, translated: null, time });
            refreshChatPanel();
            sendMsg({ type: 'API_TRANSLATE_TEXT', text, targetLanguage: chatTargetLang })
              .then(res => {
                const msg = chatMessages.find(m => m.id === msgId);
                if (msg) { msg.translated = res?.success ? (res.data?.translated_text || text) : text; refreshChatPanel(); }
              })
              .catch(() => {
                const msg = chatMessages.find(m => m.id === msgId);
                if (msg) { msg.translated = text; refreshChatPanel(); }
              });
          }
        }
      }
      startObserver();
      renderPanel(); wireTabEvents();
      showToast(`Live chat active on ${site?.platform || 'page'} — loaded last message`);
    }
    return liveChatActive;
  };

  window._vtLiveChatActive = () => liveChatActive;
  window._vtRenderChatPanel = renderChatPanel;
  window._vtWireChatEvents = wireChatEvents;
})();
