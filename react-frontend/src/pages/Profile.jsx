import { useState, useEffect } from 'react';
import { useUser } from '@clerk/clerk-react';
import { useApp } from '../context/AppContext';
import {
  Mail, Check, Eye, EyeOff, ChevronDown,
  ChevronRight, ArrowLeft, Pencil, Globe, X, Save,
} from 'lucide-react';
import { getLabels } from '../services/uiLabels';
import { loadUserProfile, mergeAuthProfile, saveUserProfile, getProfileInitials, normalizeProfile } from '../services/userProfile';
import { syncWidgetConfig } from '../services/widgetService';

const LANG_LABELS = {
  'hi-IN': 'Hindi', 'bn-IN': 'Bengali', 'ta-IN': 'Tamil', 'te-IN': 'Telugu',
  'ml-IN': 'Malayalam', 'mr-IN': 'Marathi', 'gu-IN': 'Gujarati',
  'kn-IN': 'Kannada', 'pa-IN': 'Punjabi', 'or-IN': 'Odia',
};
const CHANNEL_SECTIONS = [
  {
    id: 'email', label: 'Email', color: 'text-blue-600', bg: 'bg-blue-50', border: 'border-blue-100',
    desc: 'Send transcripts via email (mailto)',
    fields: [
      { key: 'email',        label: 'Your email address', placeholder: 'you@example.com',              type: 'email' },
      { key: 'emailSubject', label: 'Default subject',    placeholder: 'Message from SeedlingSpeaks',  type: 'text'  },
    ],
  },
  {
    id: 'slack', label: 'Slack', color: 'text-purple-600', bg: 'bg-purple-50', border: 'border-purple-100',
    desc: 'Post to a Slack channel via incoming webhook',
    fields: [{ key: 'slackWebhook', label: 'Webhook URL', placeholder: 'https://hooks.slack.com/services/...', type: 'text', secret: true }],
  },
  {
    id: 'linkedin', label: 'LinkedIn', color: 'text-sky-600', bg: 'bg-sky-50', border: 'border-sky-100',
    desc: 'Share posts to LinkedIn',
    fields: [{ key: 'linkedinToken', label: 'Access token (optional)', placeholder: 'LinkedIn OAuth token', type: 'text', secret: true }],
  },
  {
    id: 'whatsapp', label: 'WhatsApp', color: 'text-green-600', bg: 'bg-green-50', border: 'border-green-100',
    desc: 'Open WhatsApp Web with message pre-filled',
    fields: [{ key: 'whatsappPhone', label: 'Phone number', placeholder: '919876543210 (with country code)', type: 'tel' }],
  },
];
const CHANNEL_META = [
  { id: 'email',    label: 'Email',    credKey: 'email'         },
  { id: 'slack',    label: 'Slack',    credKey: 'slackWebhook'  },
  { id: 'linkedin', label: 'LinkedIn', credKey: 'linkedinToken' },
  { id: 'whatsapp', label: 'WhatsApp', credKey: 'whatsappPhone' },
];

function SecretInput({ value, onChange, placeholder }) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <input type={show ? 'text' : 'password'} value={value} onChange={onChange} placeholder={placeholder}
        className="w-full px-4 py-2.5 pr-10 rounded-xl border border-gray-200 text-[14px] focus:outline-none focus:border-gray-400 transition-all" />
      <button type="button" onClick={() => setShow(s => !s)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
        {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
      </button>
    </div>
  );
}

function ChannelsView({ onBack }) {
  const { state, saveCredentials, showSuccess } = useApp();
  const [form, setForm] = useState({ ...state.channelCredentials });
  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    saveCredentials(form);
    setSaved(true);
    showSuccess('Credentials saved');
    setTimeout(() => setSaved(false), 2500);
  };

  return (
    <div className="min-h-screen bg-[var(--bg)] px-4 md:px-10 pt-6 md:pt-10 pb-10 md:pb-16 max-w-3xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={onBack} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-all">
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div>
          <h1 className="text-[18px] md:text-[22px] font-extrabold text-gray-900 tracking-tight">Connected channels</h1>
          <p className="text-[13px] text-gray-400 mt-0.5">Set once, send anytime</p>
        </div>
      </div>

      <div className="space-y-3">
        {CHANNEL_SECTIONS.map((section) => (
          <div key={section.id} className="bg-white rounded-2xl border border-gray-100 px-5 py-4 shadow-sm hover:shadow-md transition-all">
            <div className="flex items-center gap-3 mb-4">
              <div className={`w-9 h-9 rounded-xl ${section.bg} ${section.border} border flex items-center justify-center shrink-0`}>
                <Mail className={`w-4 h-4 ${section.color}`} />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <p className="text-[14px] font-semibold text-gray-900">{section.label}</p>
                  {section.fields.some(f => form[f.key]?.trim()) && (
                    <span className="flex items-center gap-1 text-[11px] font-semibold text-green-600 bg-green-50 border border-green-100 px-2 py-0.5 rounded-full">
                      <Check className="w-3 h-3" />Connected
                    </span>
                  )}
                </div>
                <p className="text-[12px] text-gray-400 mt-0.5">{section.desc}</p>
              </div>
            </div>
            <div className="space-y-3">
              {section.fields.map((field) => (
                <div key={field.key}>
                  <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">{field.label}</label>
                  {field.secret ? (
                    <SecretInput value={form[field.key] || ''} onChange={e => setForm(f => ({ ...f, [field.key]: e.target.value }))} placeholder={field.placeholder} />
                  ) : (
                    <input type={field.type} value={form[field.key] || ''} onChange={e => setForm(f => ({ ...f, [field.key]: e.target.value }))}
                      placeholder={field.placeholder}
                      className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-[14px] focus:outline-none focus:border-gray-400 transition-all" />
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
        <button onClick={handleSave}
          className={`w-full py-3 rounded-2xl text-[14px] font-semibold transition-all ${saved ? 'bg-green-500 text-white' : 'bg-gray-900 text-white hover:bg-gray-700'}`}>
          {saved ? <span className="flex items-center justify-center gap-2"><Check className="w-4 h-4" />Saved</span> : 'Save credentials'}
        </button>
      </div>
    </div>
  );
}

function EditProfileModal({ profile, onSave, onClose }) {
  const [name, setName] = useState(profile.fullName || profile.name || '');
  const [email, setEmail] = useState(profile.email || '');
  const [role, setRole] = useState(profile.role || '');
  const initials = getProfileInitials({ fullName: name, email });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl border border-gray-100 w-full max-w-md mx-4 p-6" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <p className="text-[16px] font-bold text-gray-900">Edit profile</p>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400"><X className="w-4 h-4" /></button>
        </div>
        <div className="flex justify-center mb-5">
          <div className="w-16 h-16 rounded-2xl bg-gray-900 flex items-center justify-center text-white font-extrabold text-[20px]">{initials}</div>
        </div>
        <div className="space-y-3">
          {[
            { label: 'Full name', value: name, set: setName, placeholder: 'Your name', type: 'text' },
            { label: 'Email', value: email, set: setEmail, placeholder: 'you@example.com', type: 'email' },
            { label: 'Role / title', value: role, set: setRole, placeholder: 'e.g. Product Manager', type: 'text' },
          ].map(({ label, value, set, placeholder, type }) => (
            <div key={label}>
              <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">{label}</label>
              <input type={type} value={value} onChange={e => set(e.target.value)} placeholder={placeholder}
                className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-[14px] focus:outline-none focus:border-gray-400 transition-all" />
            </div>
          ))}
        </div>
        <div className="flex items-center justify-end gap-2 mt-5">
          <button onClick={onClose} className="px-4 py-2 rounded-xl text-[13px] font-medium text-gray-500 hover:bg-gray-100 transition-all">Cancel</button>
          <button onClick={() => { onSave({ fullName: name.trim(), name: name.trim(), email: email.trim(), role: role.trim() }); onClose(); }}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gray-900 text-white text-[13px] font-semibold hover:bg-gray-700 transition-all">
            <Save className="w-3.5 h-3.5" />Save
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Profile() {
  const { state, setField } = useApp();
  const { user: clerkUser } = useUser();
  const L = getLabels(state.uiLanguage);
  const [subView, setSubView] = useState(null);
  const [profile, setProfile] = useState(() => normalizeProfile(loadUserProfile()));
  const [editOpen, setEditOpen] = useState(false);
  const [showAvatarImage, setShowAvatarImage] = useState(true);

  useEffect(() => {
    if (!clerkUser) return;
    const merged = mergeAuthProfile({
      fullName: clerkUser.fullName || [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(' ').trim(),
      email: clerkUser.primaryEmailAddress?.emailAddress || clerkUser.emailAddresses?.[0]?.emailAddress || '',
      avatarUrl: clerkUser.imageUrl || '',
      uid: clerkUser.id,
    });
    setProfile(merged);
  }, [clerkUser]);

  const saveProfile = (updated) => {
    const next = saveUserProfile({ ...profile, ...updated });
    setProfile(next);
  };

  if (subView === 'channels') return <ChannelsView onBack={() => setSubView(null)} />;

  const initials = getProfileInitials(profile);

  return (
    <div className="min-h-screen bg-[var(--bg)] px-4 md:px-10 pt-6 md:pt-10 pb-10 md:pb-16 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-[18px] md:text-[22px] font-extrabold text-gray-900 tracking-tight">{L.profileTitle}</h1>
          <p className="text-[13px] text-gray-400 mt-0.5">{L.accountPreferences}</p>
        </div>
        <button onClick={() => setEditOpen(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 text-[12px] font-medium text-gray-500 hover:bg-gray-50 hover:border-gray-300 transition-all">
          <Pencil className="w-3.5 h-3.5" />Edit profile
        </button>
      </div>

      <div className="space-y-3">
        {/* Avatar + stats */}
        <div className="bg-white rounded-2xl border border-gray-100 px-5 py-4 shadow-sm hover:shadow-md transition-all">
          <div className="flex items-center gap-4 mb-4">
            {profile.avatarUrl && showAvatarImage ? (
              <img
                src={profile.avatarUrl}
                alt={profile.fullName || profile.email || 'Profile avatar'}
                className="w-14 h-14 rounded-2xl object-cover shrink-0"
                onError={(e) => {
                  e.currentTarget.style.display = 'none';
                  setShowAvatarImage(false);
                }}
              />
            ) : (
              <div className="w-14 h-14 rounded-2xl bg-gray-900 flex items-center justify-center text-white font-extrabold text-[20px] shrink-0">
                {initials}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="text-[17px] font-extrabold text-gray-900 truncate">{profile.fullName || profile.name || 'Your Name'}</p>
              <p className="text-[13px] text-gray-400 mt-0.5 truncate">{profile.email || 'Add your email'}</p>
              {profile.role && <p className="text-[12px] text-gray-300 mt-0.5 truncate">{profile.role}</p>}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 pt-4 border-t border-gray-100">
            {[
              { label: 'Transcripts', value: state.transcriptHistory?.length || 0 },
              { label: 'Templates',   value: state.savedTemplates?.length || 0 },
            ].map(({ label, value }) => (
              <div key={label} className="text-center bg-gray-50 rounded-xl py-3 border border-gray-100">
                <p className="text-[22px] font-extrabold text-gray-900">{value}</p>
                <p className="text-[11px] text-gray-400 mt-0.5 font-medium">{label}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Default language */}
        <div className="bg-white rounded-2xl border border-gray-100 px-5 py-4 shadow-sm hover:shadow-md transition-all">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-gray-100 flex items-center justify-center shrink-0">
                <Globe className="w-4 h-4 text-gray-600" />
              </div>
              <div>
                <p className="text-[14px] font-semibold text-gray-900">{L.defaultLanguage}</p>
                <p className="text-[12px] text-gray-400 mt-0.5">Translation output language</p>
              </div>
            </div>
            <div className="relative">
              <select value={state.selectedLanguage} onChange={e => {
                const lang = e.target.value;
                setField('selectedLanguage', lang);
                // Sync to desktop widget
                syncWidgetConfig({ languages: [lang] }).catch(() => {});
                // Sync to Chrome extension
                if (typeof chrome !== 'undefined' && chrome.storage) {
                  chrome.storage.local.set({ vtLanguage: lang, vtDefaultLanguage: lang });
                }
              }}
                className="appearance-none bg-gray-50 border border-gray-200 rounded-xl pl-3 pr-8 py-2 text-[13px] font-semibold text-gray-700 cursor-pointer focus:outline-none hover:border-gray-300 transition-all">
                {Object.entries(LANG_LABELS).map(([code, name]) => <option key={code} value={code}>{name}</option>)}
              </select>
              <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
            </div>
          </div>
        </div>

      </div>

      {editOpen && <EditProfileModal profile={profile} onSave={saveProfile} onClose={() => setEditOpen(false)} />}
    </div>
  );
}
