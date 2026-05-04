// Background service worker for Voice Translation Extension

const API_BASE = 'http://127.0.0.1:8000/api';

// Clicking the toolbar icon opens/toggles the sidebar panel on the active tab
chrome.action.onClicked.addListener((tab) => {
  if (tab.id) {
    chrome.tabs.sendMessage(tab.id, { type: 'TOGGLE_SIDEBAR' }).catch(() => {});
  }
});

// Create context menu on install
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'translate-selection',
    title: 'Translate with Voice Translation',
    contexts: ['selection'],
  });

  chrome.contextMenus.create({
    id: 'rewrite-tone-selection',
    title: 'Rewrite Tone with Voice Translation',
    contexts: ['selection'],
  });
});

// Handle context menu clicks
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (!info.selectionText) return;

  if (info.menuItemId === 'translate-selection' || info.menuItemId === 'rewrite-tone-selection') {
    chrome.storage.local.set({
      pendingAction: {
        type: info.menuItemId === 'translate-selection' ? 'translate' : 'rewrite',
        text: info.selectionText,
        timestamp: Date.now(),
      },
    });

    chrome.tabs.sendMessage(tab.id, {
      type: 'SHOW_NOTIFICATION',
      message: 'Open the extension popup to complete the action.',
    });
  }
});

// ========== API PROXY FUNCTIONS ==========

async function apiTranslateText(text, targetLanguage) {
  const res = await fetch(`${API_BASE}/translate-text`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, target_language: targetLanguage }),
  });
  if (!res.ok) throw new Error(await res.text());
  return await res.json();
}

async function apiRewriteTone(text, tone, userOverride) {
  const res = await fetch(`${API_BASE}/rewrite-tone`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, tone, user_override: userOverride || null }),
  });
  if (!res.ok) throw new Error(await res.text());
  return await res.json();
}

async function apiTranslateAudio(base64Data, mimeType) {
  const byteString = atob(base64Data.split(',')[1]);
  const ab = new ArrayBuffer(byteString.length);
  const ia = new Uint8Array(ab);
  for (let i = 0; i < byteString.length; i++) ia[i] = byteString.charCodeAt(i);
  const blob = new Blob([ab], { type: mimeType || 'audio/webm' });
  const formData = new FormData();
  formData.append('file', blob, 'recording.webm');
  const res = await fetch(`${API_BASE}/translate-audio`, { method: 'POST', body: formData });
  if (!res.ok) throw new Error(await res.text());
  return await res.json();
}

async function apiTextToSpeech(text, language) {
  const res = await fetch(`${API_BASE}/text-to-speech`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, language }),
  });
  if (!res.ok) throw new Error(await res.text());
  const blob = await res.blob();
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.readAsDataURL(blob);
  });
}

async function apiSendEmail(data) {
  const res = await fetch(`${API_BASE}/send/email`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(await res.text());
  return await res.json();
}

async function apiSendSlack(data) {
  const res = await fetch(`${API_BASE}/send/slack`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(await res.text());
  return await res.json();
}

async function apiShareLinkedIn(data) {
  const res = await fetch(`${API_BASE}/send/linkedin`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(await res.text());
  return await res.json();
}

function sendToActiveTab(message, fallback, sendResponse) {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (!tabs[0]?.id) {
      sendResponse(fallback);
      return;
    }

    chrome.tabs.sendMessage(tabs[0].id, message, (response) => {
      if (chrome.runtime.lastError) {
        sendResponse({ ...fallback, error: chrome.runtime.lastError.message });
        return;
      }
      sendResponse(response || fallback);
    });
  });
}

// ========== MESSAGE HANDLER ==========

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'GET_PENDING_ACTION') {
    chrome.storage.local.get('pendingAction', (result) => {
      sendResponse(result.pendingAction || null);
      chrome.storage.local.remove('pendingAction');
    });
    return true;
  }

  if (message.type === 'GET_SELECTED_TEXT') {
    sendToActiveTab({ type: 'GET_SELECTION' }, { text: '' }, sendResponse);
    return true;
  }

  if (message.type === 'TOGGLE_ACTIVE') {
    sendToActiveTab({ type: 'TOGGLE_ACTIVE', active: message.active }, { active: message.active }, sendResponse);
    return true;
  }

  if (message.type === 'UPDATE_SETTINGS') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, { type: 'UPDATE_SETTINGS', language: message.language, tone: message.tone });
      }
    });
    return;
  }

  if (message.type === 'TRANSLATE_ALL_PAGE') {
    sendToActiveTab({ type: 'TRANSLATE_ALL_PAGE' }, { started: true }, sendResponse);
    return true;
  }

  if (message.type === 'STOP_TRANSLATION') {
    sendToActiveTab({ type: 'STOP_TRANSLATION' }, { done: true }, sendResponse);
    return true;
  }

  if (message.type === 'TRANSLATE_SELECTION_FROM_POPUP') {
    sendToActiveTab({ type: 'TRANSLATE_SELECTION_FROM_POPUP' }, { started: true }, sendResponse);
    return true;
  }

  // ===== API PROXY CALLS =====
  if (message.type === 'API_TRANSLATE_TEXT') {
    apiTranslateText(message.text, message.targetLanguage)
      .then((data) => sendResponse({ success: true, data }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }
  if (message.type === 'API_REWRITE_TONE') {
    apiRewriteTone(message.text, message.tone, message.userOverride)
      .then((data) => sendResponse({ success: true, data }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }
  if (message.type === 'API_TRANSLATE_AUDIO') {
    apiTranslateAudio(message.audioData, message.mimeType)
      .then((data) => sendResponse({ success: true, data }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }
  if (message.type === 'API_TEXT_TO_SPEECH') {
    apiTextToSpeech(message.text, message.language)
      .then((dataUrl) => sendResponse({ success: true, dataUrl }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }
  if (message.type === 'API_SEND_EMAIL') {
    apiSendEmail(message.data)
      .then((data) => sendResponse({ success: true, data }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }
  if (message.type === 'API_SEND_SLACK') {
    apiSendSlack(message.data)
      .then((data) => sendResponse({ success: true, data }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }
  if (message.type === 'API_SHARE_LINKEDIN') {
    apiShareLinkedIn(message.data)
      .then((data) => sendResponse({ success: true, data }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (message.type === 'DEACTIVATED_FROM_PAGE') { return; }

  // Desktop widget signals it's alive — store flag and notify all tabs
  if (message.type === 'WIDGET_ALIVE') {
    chrome.storage.local.set({ widgetAlive: true });
    chrome.tabs.query({}, (tabs) => {
      tabs.forEach(t => {
        try { chrome.tabs.sendMessage(t.id, { type: 'WIDGET_ACTIVE' }); } catch {}
      });
    });
    sendResponse({ ok: true });
    return true;
  }

  if (message.type === 'WIDGET_DEAD') {
    chrome.storage.local.remove('widgetAlive');
    chrome.tabs.query({}, (tabs) => {
      tabs.forEach(t => {
        try { chrome.tabs.sendMessage(t.id, { type: 'WIDGET_INACTIVE' }); } catch {}
      });
    });
    return;
  }
});
