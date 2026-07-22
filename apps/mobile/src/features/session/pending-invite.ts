import AsyncStorage from '@react-native-async-storage/async-storage';

// Holds an invite token across the auth gate: a user who opens
// /invite/[token] while signed out is redirected to (auth), and this token
// is read back once useSession().status becomes 'authenticated' so the
// invite route can be resumed. AsyncStorage (not memory) so it survives the
// app being backgrounded during sign-in.
const PENDING_INVITE_KEY = 'soroe.pendingInviteToken';

export async function savePendingInviteToken(token: string) {
  await AsyncStorage.setItem(PENDING_INVITE_KEY, token);
}

export async function readPendingInviteToken(): Promise<string | null> {
  return AsyncStorage.getItem(PENDING_INVITE_KEY);
}

export async function clearPendingInviteToken() {
  await AsyncStorage.removeItem(PENDING_INVITE_KEY);
}
