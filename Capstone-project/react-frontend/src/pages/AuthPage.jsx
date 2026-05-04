import { useEffect, useRef, useState } from 'react';
import { SignIn, useAuth, useUser } from '@clerk/clerk-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import * as api from '../services/api';

export default function AuthPage() {
  const { isSignedIn, getToken, signOut } = useAuth();
  const { user: clerkUser } = useUser();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { login } = useApp();
  const syncedRef = useRef(false);
  const [consent, setConsent] = useState(false);
  const [showConsentError, setShowConsentError] = useState(false);
  const [accountExistsError, setAccountExistsError] = useState(false);
  const consentRef = useRef(false);
  
  const isSignup = searchParams.get('mode') === 'signup';

  useEffect(() => { consentRef.current = consent; }, [consent]);

  useEffect(() => {
    if (isSignedIn && clerkUser && !syncedRef.current) {
      // Block signup if consent not given
      if (isSignup && !consentRef.current) {
        syncedRef.current = false;
        setShowConsentError(true);
        signOut(); // kick them back out
        return;
      }
      
      // Check if user exists (for signup)
      if (isSignup) {
        checkUserExists();
      } else {
        syncedRef.current = true;
        syncUserToBackend();
      }
    }
  }, [isSignedIn, clerkUser, isSignup]);

  const checkUserExists = async () => {
    try {
      const email = clerkUser.primaryEmailAddress?.emailAddress || clerkUser.emailAddresses[0]?.emailAddress;
      const response = await api.checkUserExists(email);
      
      if (response.exists) {
        // User already exists
        setAccountExistsError(true);
        syncedRef.current = false;
        signOut();
        return;
      } else {
        // User doesn't exist, proceed with signup
        syncedRef.current = true;
        syncUserToBackend();
      }
    } catch (error) {
      // Treat errors as user not existing and proceed
      console.error('Error checking user:', error);
      syncedRef.current = true;
      syncUserToBackend();
    }
  };

  const syncUserToBackend = async () => {
    try {
      const token = await getToken();
      if (!token) throw new Error('Failed to get Clerk authentication token');
      api.setAuthToken(token);
      const response = await api.syncUser({
        id: clerkUser.id,
        email: clerkUser.primaryEmailAddress?.emailAddress || clerkUser.emailAddresses[0]?.emailAddress,
        first_name: clerkUser.firstName,
        last_name: clerkUser.lastName,
        avatar_url: clerkUser.imageUrl,
        consent_given: isSignup,
      });
      login({
        id: response.id,
        email: response.email,
        firstName: response.first_name,
        lastName: response.last_name,
        consentGiven: isSignup,
      });
      navigate('/app');
    } catch (error) {
      console.error('Failed to sync user:', error);
      login({
        id: clerkUser.id,
        email: clerkUser.primaryEmailAddress?.emailAddress || clerkUser.emailAddresses[0]?.emailAddress,
        firstName: clerkUser.firstName,
        lastName: clerkUser.lastName,
        consentGiven: isSignup,
      });
      navigate('/app');
    }
  };

  return (
    <div className="min-h-screen flex bg-[#faf8f4]">
      {/* Left panel */}
      <div className="hidden lg:flex flex-col justify-between w-[480px] bg-[#1a0f00] px-12 py-12 shrink-0">
        <div className="flex items-center gap-3">
          <img src="/seedlinglabs-logo.png" alt="Seedlinglabs" className="w-9 h-9 rounded-full object-cover" />
          <span className="text-white font-bold text-[16px] tracking-tight">SeedlingSpeaks</span>
        </div>
        <div>
          <p className="text-[13px] font-semibold text-[#c9a84c] uppercase tracking-widest mb-6">What you can do</p>
          {[
            'Transcribe speech in 10 Indian languages',
            'Translate to any native language instantly',
            'Rewrite in Email, Slack, LinkedIn tones',
            'Send directly to your channels',
            'Vision translate from photos',
            'Continuous hands-free listening',
          ].map(item => (
            <div key={item} className="flex items-start gap-3 mb-4">
              <div className="w-5 h-5 rounded-full bg-[#c9a84c]/20 flex items-center justify-center shrink-0 mt-0.5">
                <svg className="w-3 h-3 text-[#c9a84c]" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
              </div>
              <p className="text-[14px] text-white/60 leading-relaxed">{item}</p>
            </div>
          ))}
        </div>
        <p className="text-[12px] text-white/20">Powered by Seedlinglabs · v2.5</p>
      </div>

      {/* Right panel */}
      <div className="flex-1 flex items-center justify-center px-4 md:px-6 py-12">
        <div className="w-full max-w-[400px]">
          {/* Logo (mobile) */}
          <div className="flex items-center gap-2.5 mb-10 lg:hidden">
            <img src="/seedlinglabs-logo.png" alt="Seedlinglabs" className="w-8 h-8 rounded-full object-cover" />
            <span className="text-[15px] font-bold text-[#1a0f00]">SeedlingSpeaks</span>
          </div>

          {/* Account Exists Error */}
          {accountExistsError && (
            <div className="mb-6 p-4 rounded-2xl bg-red-50 border border-red-200">
              <p className="text-[14px] font-semibold text-red-700 mb-2">Account already exists</p>
              <p className="text-[13px] text-red-600">This email is already registered. Please sign in instead.</p>
              <button
                onClick={() => { setAccountExistsError(false); navigate('/auth'); }}
                className="mt-3 text-[13px] font-semibold text-red-700 hover:text-red-800 underline"
              >
                Go to sign in
              </button>
            </div>
          )}

          {/* Clerk Sign-In/Sign-Up */}
          <SignIn
            appearance={{
              elements: {
                rootBox: "w-full",
                card: "shadow-none border-none bg-transparent",
                headerTitle: "text-[20px] md:text-[26px] font-extrabold text-[#1a0f00]",
                headerSubtitle: "text-[14px] text-gray-400 mb-8",
                formButtonPrimary: "bg-[#1a0f00] hover:bg-[#2d1a00] text-white rounded-xl py-3 font-bold",
                formFieldInput: "rounded-xl border-gray-200 focus:border-[#c9a84c]",
                footerActionLink: "text-[#8a5c2e] hover:underline",
              },
              variables: {
                colorPrimary: "#1a0f00",
                colorInputBackground: "#ffffff",
              },
            }}
            forceRedirectUrl="/app"
            signUpUrl="/auth?mode=signup"
          />

          {/* GDPR Consent — only on signup */}
          {isSignup && (
            <div
              onClick={() => !consent && setShowConsentError(true)}
              className={`mt-4 p-4 rounded-2xl border transition-all cursor-pointer ${
                showConsentError
                  ? 'border-red-300 bg-red-50'
                  : consent
                  ? 'border-green-200 bg-green-50'
                  : 'border-gray-200 bg-white hover:border-gray-300'
              }`}
            >
              <div className="flex items-start gap-3">
                <input
                  id="gdpr-consent"
                  type="checkbox"
                  checked={consent}
                  onChange={e => { setConsent(e.target.checked); setShowConsentError(false); }}
                  onClick={e => e.stopPropagation()}
                  className="mt-0.5 w-4 h-4 rounded border-gray-300 accent-[#1a0f00] cursor-pointer shrink-0"
                />
                <label htmlFor="gdpr-consent" className="text-[12px] text-gray-700 leading-relaxed cursor-pointer">
                  I agree to the use of my data to improve translation quality and personalization. I can withdraw my consent at any time.{' '}
                  <a href="/privacy-policy" target="_blank" rel="noopener noreferrer"
                    onClick={e => e.stopPropagation()}
                    className="text-[#8a5c2e] underline underline-offset-2 hover:text-[#1a0f00] transition-colors">
                    Privacy Policy
                  </a>
                </label>
              </div>
              {showConsentError && (
                <p className="text-[12px] text-red-600 font-semibold mt-2 ml-7">
                  You must agree before continuing.
                </p>
              )}
              {!consent && !showConsentError && (
                <p className="text-[11px] text-gray-400 mt-2 ml-7">
                  Required to use SeedlingSpeaks
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
