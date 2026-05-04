import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Slot, useRouter, useSegments } from 'expo-router';
import { ClerkProvider, ClerkLoaded, useAuth } from '@clerk/clerk-expo';
import { tokenCache } from '../src/auth/tokenCache';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AppProvider } from '../src/context/AppContext';
import api from '../src/services/api';

const clerkPublishableKey = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY;

// Wake the Render backend on app launch so it's warm by the time the user needs it
api.health().then(() => console.log('[app] Backend warm')).catch(() => {});

function AuthGate() {
  const { isSignedIn, isLoaded } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (!isLoaded) return;

    const inAuthGroup = segments[0] === 'sign-in';

    if (!isSignedIn && !inAuthGroup) {
      router.replace('/sign-in');
    } else if (isSignedIn && inAuthGroup) {
      router.replace('/(drawer)');
    }
  }, [isSignedIn, isLoaded, segments]);

  if (!isLoaded) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F5F0E8' }}>
        <ActivityIndicator size="large" color="#E8820C" />
      </View>
    );
  }

  return <Slot />;
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ClerkProvider publishableKey={clerkPublishableKey} tokenCache={tokenCache}>
          <ClerkLoaded>
            <AppProvider>
              <StatusBar style="dark" backgroundColor="#F5F0E8" />
              <AuthGate />
            </AppProvider>
          </ClerkLoaded>
        </ClerkProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
