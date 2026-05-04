const WIDGET_URL = 'http://127.0.0.1:27182';
const FAILURE_COOLDOWN_MS = 60000;

let widgetCooldownUntil = 0;

function shouldSkipProbe(force = false) {
  return !force && Date.now() < widgetCooldownUntil;
}

function noteFailure() {
  widgetCooldownUntil = Date.now() + FAILURE_COOLDOWN_MS;
}

export async function getWidgetStatus({ force = false, timeoutMs = 800 } = {}) {
  if (shouldSkipProbe(force)) return null;
  try {
    const res = await fetch(`${WIDGET_URL}/status`, { signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) throw new Error(`Widget status failed: ${res.status}`);
    return await res.json();
  } catch {
    noteFailure();
    return null;
  }
}

export async function toggleWidgetEnabled({ enabled, timeoutMs = 1500 } = {}) {
  try {
    const res = await fetch(`${WIDGET_URL}${enabled ? '/enable' : '/disable'}`, {
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) throw new Error(`Widget toggle failed: ${res.status}`);
    widgetCooldownUntil = 0;
    return await res.json();
  } catch (error) {
    noteFailure();
    throw error;
  }
}

export async function toggleWidgetPower({ timeoutMs = 1500 } = {}) {
  try {
    const res = await fetch(`${WIDGET_URL}/toggle`, { signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) throw new Error(`Widget toggle failed: ${res.status}`);
    widgetCooldownUntil = 0;
    return await res.json();
  } catch (error) {
    noteFailure();
    throw error;
  }
}

export async function syncWidgetConfig(payload, { force = true, timeoutMs = 1000 } = {}) {
  if (shouldSkipProbe(force)) return null;
  try {
    const res = await fetch(`${WIDGET_URL}/config`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) throw new Error(`Widget config failed: ${res.status}`);
    widgetCooldownUntil = 0;
    return await res.json().catch(() => null);
  } catch (error) {
    noteFailure();
    throw error;
  }
}

export async function enableWidgetWithConfig(payload, { timeoutMs = 1000 } = {}) {
  try {
    await syncWidgetConfig(payload, { force: true, timeoutMs });
  } catch {}
  return toggleWidgetEnabled({ enabled: true, timeoutMs });
}
