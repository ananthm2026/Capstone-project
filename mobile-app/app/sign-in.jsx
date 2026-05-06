import { useState, useCallback, useEffect, useRef } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet, ActivityIndicator, KeyboardAvoidingView, Platform, TouchableWithoutFeedback, Keyboard } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useOAuth, useSignIn, useSignUp, useAuth, useUser } from '@clerk/clerk-expo';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import { router } from 'expo-router';
import { COLORS } from '../src/constants/colors';
import api from '../src/services/api';

WebBrowser.maybeCompleteAuthSession();

export default function SignInScreen() {
  const insets = useSafeAreaInsets();

  const { startOAuthFlow: startGoogleOAuth } = useOAuth({ strategy: 'oauth_google' });
  const { signIn, setActive: setSignInActive, isLoaded: signInLoaded } = useSignIn();
  const { signUp, setActive: setSignUpActive, isLoaded: signUpLoaded } = useSignUp();
  const { isSignedIn, getToken } = useAuth();
  const { user: clerkUser } = useUser();

  const [showEmailForm, setShowEmailForm] = useState(false);
  const [mode, setMode] = useState('signin'); // signin | signup
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [loading, setLoading] = useState(false);
  const [oauthLoading, setOauthLoading] = useState(false);
  const [error, setError] = useState('');
  const syncedRef = useRef(false);

  // Sync user to backend after any successful auth
  useEffect(() => {
    if (isSignedIn && clerkUser && !syncedRef.current) {
      syncedRef.current = true;
      syncUserToBackend();
    }
  }, [isSignedIn, clerkUser]);

  async function syncUserToBackend() {
    try {
      const token = await getToken();
      if (token) {
        api.setAuthToken?.(token);
      }
      await api.syncUser({
        id: clerkUser.id,
        email: clerkUser.primaryEmailAddress?.emailAddress || clerkUser.emailAddresses?.[0]?.emailAddress,
        first_name: clerkUser.firstName,
        last_name: clerkUser.lastName,
        avatar_url: clerkUser.imageUrl,
        consent_given: true,
      });
    } catch {
      // Backend sync failed — still allow app access
    }
    router.replace('/(drawer)');
  }

  // OAuth: Google
  const handleGoogleOAuth = useCallback(async () => {
    setOauthLoading(true);
    setError('');
    try {
      const { createdSessionId, setActive } = await startGoogleOAuth({
        redirectUrl: Linking.createURL('/(drawer)'),
      });
      if (createdSessionId && setActive) {
        await setActive({ session: createdSessionId });
        // useEffect above will handle sync + redirect
      }
    } catch (e) {
      const msg = e.errors?.[0]?.longMessage || e.errors?.[0]?.message || 'Google sign-in failed. Please try again.';
      setError(msg);
    } finally {
      setOauthLoading(false);
    }
  }, [startGoogleOAuth]);

  // Email/Password Sign In
  const handleSignIn = useCallback(async () => {
    if (!signInLoaded || !email.trim() || !password.trim()) return;
    setLoading(true);
    setError('');
    try {
      const result = await signIn.create({ identifier: email.trim(), password });
      if (result.status === 'complete') {
        await setSignInActive({ session: result.createdSessionId });
      } else {
        setError('Sign in incomplete. Please try again.');
      }
    } catch (e) {
      const msg = e.errors?.[0]?.longMessage || e.errors?.[0]?.message || 'Sign in failed. Check your credentials.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [signIn, signInLoaded, email, password, setSignInActive]);

  // Email/Password Sign Up
  const handleSignUp = useCallback(async () => {
    if (!signUpLoaded || !email.trim() || !password.trim()) return;
    setLoading(true);
    setError('');
    try {
      const result = await signUp.create({
        emailAddress: email.trim(),
        password,
        firstName: firstName.trim() || undefined,
        lastName: lastName.trim() || undefined,
      });
      if (result.status === 'complete') {
        await setSignUpActive({ session: result.createdSessionId });
      } else {
        setError('Please check your email to verify your account.');
      }
    } catch (e) {
      const msg = e.errors?.[0]?.longMessage || e.errors?.[0]?.message || 'Sign up failed. Please try again.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [signUp, signUpLoaded, email, password, firstName, lastName, setSignUpActive]);

  const isSignUp = mode === 'signup';

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
        <View style={[st.root, { paddingTop: insets.top }]}>
          <ScrollView contentContainerStyle={[st.content, { paddingBottom: insets.bottom + 40 }]} keyboardShouldPersistTaps="handled">
            {/* Brand Header */}
            <View style={st.brand}>
              <Text style={st.logoEmoji}>🌱</Text>
              <Text style={st.appName}>SeedlingSpeaks</Text>
              <Text style={st.tagline}>Your voice, every language, every tone.</Text>
            </View>

            {/* Features */}
            <View style={st.features}>
              {[
                'Transcribe speech in 10 Indian languages',
                'Translate to any native language instantly',
                'Rewrite in Email, Slack, LinkedIn tones',
                'Vision translate from photos',
                'Continuous hands-free listening',
              ].map((f) => (
                <View key={f} style={st.featureRow}>
                  <Text style={st.checkmark}>✓</Text>
                  <Text style={st.featureText}>{f}</Text>
                </View>
              ))}
            </View>

            {/* Auth Card */}
            <View style={st.card}>
              <Text style={st.cardTitle}>{isSignUp ? 'Create your account' : 'Welcome back'}</Text>
              <Text style={st.cardSubtitle}>{isSignUp ? 'Sign up to get started' : 'Sign in to continue'}</Text>

              {error ? (
                <View style={st.errorBox}>
                  <Text style={st.errorText}>{error}</Text>
                </View>
              ) : null}

              {/* Google OAuth — Primary */}
              <TouchableOpacity style={st.googleBtn} onPress={handleGoogleOAuth} disabled={oauthLoading} activeOpacity={0.8}>
                {oauthLoading ? (
                  <ActivityIndicator color={COLORS.ink} size="small" />
                ) : (
                  <>
                    <Text style={st.googleIcon}>G</Text>
                    <Text style={st.googleBtnText}>Continue with Google</Text>
                  </>
                )}
              </TouchableOpacity>

              {/* Divider */}
              <View style={st.divider}>
                <View style={st.dividerLine} />
                <Text style={st.dividerText}>or</Text>
                <View style={st.dividerLine} />
              </View>

              {/* Email/Password Toggle */}
              {!showEmailForm ? (
                <TouchableOpacity style={st.emailToggle} onPress={() => setShowEmailForm(true)}>
                  <Text style={st.emailToggleText}>Continue with email</Text>
                </TouchableOpacity>
              ) : (
                <>
                  {isSignUp && (
                    <View style={st.nameRow}>
                      <TextInput style={[st.input, { flex: 1 }]} placeholder="First name" placeholderTextColor={COLORS.faded} value={firstName} onChangeText={setFirstName} autoCapitalize="words" />
                      <TextInput style={[st.input, { flex: 1 }]} placeholder="Last name" placeholderTextColor={COLORS.faded} value={lastName} onChangeText={setLastName} autoCapitalize="words" />
                    </View>
                  )}

                  <TextInput style={st.input} placeholder="Email address" placeholderTextColor={COLORS.faded} value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} />
                  <TextInput style={st.input} placeholder="Password" placeholderTextColor={COLORS.faded} value={password} onChangeText={setPassword} secureTextEntry />

                  <TouchableOpacity style={[st.submitBtn, loading && { opacity: 0.7 }]} onPress={isSignUp ? handleSignUp : handleSignIn} disabled={loading || !email.trim() || !password.trim()}>
                    {loading ? <ActivityIndicator color="#FFF" size="small" /> : <Text style={st.submitBtnText}>{isSignUp ? 'Create account' : 'Sign in'}</Text>}
                  </TouchableOpacity>
                </>
              )}

              {/* Switch mode */}
              <TouchableOpacity style={st.toggleBtn} onPress={() => { setMode(isSignUp ? 'signin' : 'signup'); setError(''); }}>
                <Text style={st.toggleText}>
                  {isSignUp ? 'Already have an account? ' : "Don't have an account? "}
                  <Text style={st.toggleLink}>{isSignUp ? 'Sign in' : 'Sign up'}</Text>
                </Text>
              </TouchableOpacity>
            </View>

            <Text style={st.footer}>Powered by Seedlinglabs · v2.5</Text>
          </ScrollView>
        </View>
      </TouchableWithoutFeedback>
    </KeyboardAvoidingView>
  );
}


const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#1a0f00' },
  content: { paddingHorizontal: 24, paddingTop: 40 },

  // Brand
  brand: { alignItems: 'center', marginBottom: 28 },
  logoEmoji: { fontSize: 48, marginBottom: 8 },
  appName: { fontSize: 28, fontWeight: '800', color: '#c9a84c', letterSpacing: -0.5 },
  tagline: { fontSize: 14, color: 'rgba(255,255,255,0.5)', marginTop: 4 },

  // Features
  features: { marginBottom: 28, paddingHorizontal: 8 },
  featureRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  checkmark: { fontSize: 14, color: '#c9a84c', fontWeight: '700' },
  featureText: { fontSize: 14, color: 'rgba(255,255,255,0.7)', lineHeight: 20 },

  // Card
  card: { backgroundColor: COLORS.surface, borderRadius: 24, padding: 24, marginBottom: 24 },
  cardTitle: { fontSize: 22, fontWeight: '800', color: COLORS.ink, marginBottom: 4 },
  cardSubtitle: { fontSize: 14, color: COLORS.muted, marginBottom: 20 },

  // Error
  errorBox: { backgroundColor: COLORS.redBg, borderRadius: 12, padding: 12, marginBottom: 16, borderWidth: 1, borderColor: COLORS.redSoft + '30' },
  errorText: { fontSize: 13, color: COLORS.redSoft, lineHeight: 18 },

  // Google OAuth
  googleBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: '#FFF', borderRadius: 14, paddingVertical: 14, borderWidth: 1.5, borderColor: COLORS.border, marginBottom: 16 },
  googleIcon: { fontSize: 18, fontWeight: '800', color: '#4285F4' },
  googleBtnText: { fontSize: 15, fontWeight: '700', color: COLORS.ink },

  // Divider
  divider: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  dividerLine: { flex: 1, height: 1, backgroundColor: COLORS.border },
  dividerText: { paddingHorizontal: 12, fontSize: 13, color: COLORS.faded },

  // Email toggle
  emailToggle: { borderRadius: 14, paddingVertical: 14, alignItems: 'center', borderWidth: 1.5, borderColor: COLORS.border, marginBottom: 16 },
  emailToggleText: { fontSize: 15, fontWeight: '600', color: COLORS.warm },

  // Form
  nameRow: { flexDirection: 'row', gap: 10, marginBottom: 0 },
  input: { backgroundColor: COLORS.bg, borderRadius: 14, padding: 14, fontSize: 15, color: COLORS.ink, borderWidth: 1, borderColor: COLORS.border, marginBottom: 12 },
  submitBtn: { backgroundColor: '#1a0f00', borderRadius: 14, paddingVertical: 16, alignItems: 'center', marginTop: 4, marginBottom: 16 },
  submitBtnText: { fontSize: 16, fontWeight: '700', color: '#FFF' },

  // Toggle
  toggleBtn: { alignItems: 'center' },
  toggleText: { fontSize: 14, color: COLORS.muted },
  toggleLink: { color: '#8a5c2e', fontWeight: '700' },

  // Footer
  footer: { textAlign: 'center', fontSize: 12, color: 'rgba(255,255,255,0.3)' },
});
