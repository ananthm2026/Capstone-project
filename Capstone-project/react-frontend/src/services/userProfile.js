const STORAGE_KEY = 'userProfile';
const UPDATE_EVENT = 'user-profile-updated';

export function loadUserProfile() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
  } catch {
    return {};
  }
}

export function saveUserProfile(profile) {
  const normalized = normalizeProfile(profile);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
  window.dispatchEvent(new CustomEvent(UPDATE_EVENT, { detail: normalized }));
  return normalized;
}

export function normalizeProfile(profile = {}) {
  const fullName = profile.fullName || profile.name || '';
  return {
    ...profile,
    fullName,
    name: fullName,
    email: profile.email || '',
    avatarUrl: profile.avatarUrl || profile.avatar_url || '',
    uid: profile.uid || profile.id || '',
  };
}

export function mergeAuthProfile(authProfile = {}) {
  const current = normalizeProfile(loadUserProfile());
  const incoming = normalizeProfile(authProfile);
  const merged = {
    ...current,
    fullName: current.fullName || incoming.fullName,
    name: current.name || incoming.name,
    email: current.email || incoming.email,
    avatarUrl: current.avatarUrl || incoming.avatarUrl,
    uid: current.uid || incoming.uid,
  };
  return saveUserProfile(merged);
}

export function subscribeToUserProfile(callback) {
  const handleCustom = (event) => callback(normalizeProfile(event.detail || loadUserProfile()));
  const handleStorage = (event) => {
    if (event.key === STORAGE_KEY) callback(normalizeProfile(loadUserProfile()));
  };

  window.addEventListener(UPDATE_EVENT, handleCustom);
  window.addEventListener('storage', handleStorage);
  return () => {
    window.removeEventListener(UPDATE_EVENT, handleCustom);
    window.removeEventListener('storage', handleStorage);
  };
}

export function getProfileFirstName(profile = {}) {
  const normalized = normalizeProfile(profile);
  const source = normalized.fullName || normalized.email || '';
  if (!source) return '';
  const base = source.includes('@') ? source.split('@')[0] : source.split(' ')[0];
  if (!base) return '';
  return base.charAt(0).toUpperCase() + base.slice(1);
}

export function getProfileInitials(profile = {}) {
  const normalized = normalizeProfile(profile);
  const source = normalized.fullName || normalized.email || 'U';
  const safe = source.includes('@') ? source.split('@')[0] : source;
  const parts = safe.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'U';
  if (parts.length === 1) return parts[0].slice(0, 1).toUpperCase();
  return parts.slice(0, 2).map((part) => part[0].toUpperCase()).join('');
}
