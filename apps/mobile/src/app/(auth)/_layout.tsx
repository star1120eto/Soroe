import { Stack } from 'expo-router';

import { useSession } from '@/features/session/SessionProvider';

export default function AuthLayout() {
  const { status } = useSession();

  return (
    <Stack screenOptions={{ headerShown: false }}>
      {/* サインイン方式の選択とメールOTP経路。プロフィール未作成状態では
          戻れないようにし、profile-setupだけを見せる(AUTH-03)。 */}
      <Stack.Protected guard={status === 'unauthenticated'}>
        <Stack.Screen name="login" />
        <Stack.Screen name="email" />
        <Stack.Screen name="otp" />
      </Stack.Protected>
      <Stack.Protected guard={status === 'needsProfile'}>
        <Stack.Screen name="profile-setup" />
      </Stack.Protected>
    </Stack>
  );
}
