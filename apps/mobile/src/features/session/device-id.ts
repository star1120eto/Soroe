import AsyncStorage from '@react-native-async-storage/async-storage';
import { randomUUID } from 'expo-crypto';

// requestEmailOtp(AUTH-004)の端末レート制限キー。端末固有IDではなく初回生成の
// ランダム値を使う: 追跡目的の識別子を持たずに「同じ端末からの連続要求」だけを
// 判定できればよいため。
const DEVICE_ID_KEY = 'soroe.deviceId';

export async function getOrCreateDeviceId(): Promise<string> {
  const existing = await AsyncStorage.getItem(DEVICE_ID_KEY);
  if (existing) {
    return existing;
  }

  const deviceId = randomUUID();
  await AsyncStorage.setItem(DEVICE_ID_KEY, deviceId);
  return deviceId;
}
