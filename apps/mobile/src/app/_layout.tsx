import { useEffect } from 'react';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';

import { useAppFonts } from '@/design-system';
import { SessionProvider, useSession } from '@/features/session/SessionProvider';
import { connectEmulators } from '@/lib/firebase/connectEmulators';
import { initializeWebFirebase } from '@/lib/firebase/initializeWebFirebase';

SplashScreen.preventAutoHideAsync();
initializeWebFirebase();
connectEmulators();

function RootNavigator() {
  const { status } = useSession();
  const [fontsLoaded] = useAppFonts();

  const isReady = fontsLoaded && status !== 'loading';

  useEffect(() => {
    if (isReady) {
      SplashScreen.hideAsync();
    }
  }, [isReady]);

  if (!isReady) {
    return null;
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Protected guard={status === 'authenticated'}>
        <Stack.Screen name="(app)" />
      </Stack.Protected>
      <Stack.Protected guard={status === 'unauthenticated' || status === 'needsProfile'}>
        <Stack.Screen name="(auth)" />
      </Stack.Protected>
      <Stack.Screen name="invite/[token]" />
      <Stack.Screen name="new-list" options={{ presentation: 'modal', headerShown: true, title: '新しいリスト' }} />
      <Stack.Screen
        name="new-list-method"
        options={{ presentation: 'modal', headerShown: true, title: '作成方法を選ぶ' }}
      />
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <SessionProvider>
      <RootNavigator />
    </SessionProvider>
  );
}
