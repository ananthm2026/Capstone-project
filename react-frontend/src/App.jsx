import { ClerkProvider, useAuth } from '@clerk/clerk-react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { AppProvider } from './context/AppContext';
import AppShellLayout from './layout/AppShell';
import SplashScreen from './components/SplashScreen';
import AuthPage from './pages/AuthPage';
import DesktopAuth from './pages/DesktopAuth';
import LandingPage from './pages/LandingPage';
// Pages
import AppHome from './pages/AppHome';
import Home from './pages/Home';
import ContinuousListening from './pages/ContinuousListening';
import EnglishToNativeView from './pages/EnglishToNativeView';
import VisionTranslate from './pages/VisionTranslate';
import VideoTranslate from './pages/VideoTranslate';
import VideoHistory from './pages/VideoHistory';
import History from './pages/History';
import Settings from './pages/Settings';
import Profile from './pages/Profile';
import ShareView from './pages/ShareView';

/**
 * RequireAuth — Protects routes that need Clerk authentication.
 * Redirects to /auth if not signed in.
 */
function RequireAuth({ children }) {
  const { isSignedIn, isLoaded } = useAuth();
  if (!isLoaded) return <div className="flex items-center justify-center h-screen">Loading...</div>;
  if (!isSignedIn) return <Navigate to="/auth" replace />;
  return children;
}

/**
 * ProtectedAppShell — Wraps all authenticated /app routes with AppShell layout.
 */
function ProtectedAppShell({ children }) {
  return (
    <RequireAuth>
      <AppShellLayout>{children}</AppShellLayout>
    </RequireAuth>
  );
}

/**
 * AppRoutes — Nested routing with AppShell as parent layout.
 * - Public routes: /, /landing, /auth, /splash
 * - App routes: /app/* (auth required, wrapped by AppShell)
 */
function AppRoutes() {
  return (
    <Routes>
      {/* Public routes */}
      <Route path="/" element={<SplashScreen />} />
      <Route path="/landing" element={<LandingPage />} />
      <Route path="/auth" element={<AuthPage />} />
      <Route path="/desktop-auth" element={<DesktopAuth />} />
      <Route path="/splash" element={<SplashScreen />} />

      {/* App routes — auth required, with AppShell layout */}
      <Route
        path="/app"
        element={
          <ProtectedAppShell>
            <AppHome />
          </ProtectedAppShell>
        }
      />
      <Route
        path="/app/home"
        element={<Navigate to="/app/native-to-english" replace />}
      />
      <Route
        path="/app/native-to-english"
        element={
          <ProtectedAppShell>
            <Home />
          </ProtectedAppShell>
        }
      />
      <Route
        path="/app/continuous"
        element={
          <ProtectedAppShell>
            <ContinuousListening />
          </ProtectedAppShell>
        }
      />
      <Route
        path="/app/english-to-native"
        element={
          <ProtectedAppShell>
            <EnglishToNativeView />
          </ProtectedAppShell>
        }
      />
      <Route
        path="/app/vision"
        element={
          <ProtectedAppShell>
            <VisionTranslate />
          </ProtectedAppShell>
        }
      />
      <Route
        path="/app/video"
        element={
          <ProtectedAppShell>
            <VideoTranslate />
          </ProtectedAppShell>
        }
      />
      <Route
        path="/app/video-history"
        element={
          <ProtectedAppShell>
            <VideoHistory />
          </ProtectedAppShell>
        }
      />
      <Route
        path="/app/history"
        element={
          <ProtectedAppShell>
            <History />
          </ProtectedAppShell>
        }
      />
      <Route
        path="/app/settings"
        element={
          <ProtectedAppShell>
            <Settings />
          </ProtectedAppShell>
        }
      />
      <Route
        path="/app/profile"
        element={
          <ProtectedAppShell>
            <Profile />
          </ProtectedAppShell>
        }
      />
      <Route
        path="/app/share"
        element={
          <ProtectedAppShell>
            <ShareView />
          </ProtectedAppShell>
        }
      />

      {/* Fallback */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

/**
 * AppWithProviders — Wraps entire app with context providers.
 */
function AppWithProviders() {
  return (
    <AppProvider>
      <AppRoutes />
    </AppProvider>
  );
}

export default function App() {
  // Get Clerk publishable key from environment
  const clerkPubKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

  console.log('Clerk Key:', clerkPubKey ? '✓ Present' : '✗ Missing');
  console.log('Clerk Key Value:', clerkPubKey);

  if (!clerkPubKey) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-red-50 p-4">
        <div className="text-center max-w-md">
          <h1 className="text-2xl font-bold text-red-600 mb-4">Configuration Error</h1>
          <p className="text-gray-700 mb-4">
            Missing <code className="bg-red-100 px-2 py-1 rounded">VITE_CLERK_PUBLISHABLE_KEY</code> in <code className="bg-red-100 px-2 py-1 rounded">.env.local</code>
          </p>
          <p className="text-sm text-gray-600">
            1. Get your key from <a href="https://dashboard.clerk.com" target="_blank" rel="noopener noreferrer" className="text-blue-600 underline">Clerk Dashboard</a><br />
            2. Add it to <code className="bg-red-100 px-2 py-1 rounded">.env.local</code><br />
            3. Restart the dev server
          </p>
        </div>
      </div>
    );
  }

  return (
    <ClerkProvider publishableKey={clerkPubKey}>
      <AppWithProviders />
    </ClerkProvider>
  );
}
