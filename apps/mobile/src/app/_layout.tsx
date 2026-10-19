import { useEffect } from 'react';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';

import { useAppFonts } from '@/design-system';
import { SessionProvider, useSession } from '@/features/session/SessionProvider';
import { connectEmulators } from '@/lib/firebase/connectEmulators';
import { initializeWebFirebase } from '@/lib/firebase/initializeWebFirebase';
import { installWebAlert } from '@/lib/webAlert';

SplashScreen.preventAutoHideAsync();
initializeWebFirebase();
installWebAlert();
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
    // 戻るボタンは矢印のみにする。既定では前の画面のタイトルが付き、タイトルを持たない
    // ルートグループ(app)が「(app)」と表示されてしまうため。
    <Stack screenOptions={{ headerShown: false, headerBackButtonDisplayMode: 'minimal' }}>
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
      {/* titleはlist/[listId].tsx側でStack.Screenを再宣言しリスト名に差し替える */}
      <Stack.Screen name="list/[listId]" options={{ headerShown: true, title: 'リスト' }} />
      <Stack.Screen name="item-edit" options={{ presentation: 'modal', headerShown: true, title: '項目を編集' }} />
      <Stack.Screen name="archived-lists" options={{ headerShown: true, title: 'アーカイブ・削除済み' }} />
      <Stack.Screen name="list-share" options={{ headerShown: true, title: '共有・メンバー' }} />
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
