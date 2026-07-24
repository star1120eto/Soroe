import auth from "@react-native-firebase/auth";
import firestore from "@react-native-firebase/firestore";
import functions from "@react-native-firebase/functions";

import { env } from "@/config/env";

// EXPO_PUBLIC_FIREBASE_EMULATOR_HOSTが設定されているときだけEmulatorへ向ける。
// Cloud FunctionsのデプロイにはBlazeプランが必要なため、Sparkプランのままでも
// requestEmailOtp/verifyEmailOtp(AUTH-004)をローカル検証できるようにしている。
// portはfirebase.jsonのemulators設定と揃えること。
const AUTH_PORT = 9099;
const FIRESTORE_PORT = 8080;
const FUNCTIONS_PORT = 5001;

export function connectEmulators() {
  const host = env.EXPO_PUBLIC_FIREBASE_EMULATOR_HOST;
  if (!host) {
    return;
  }

  auth().useEmulator(`http://${host}:${AUTH_PORT}`);
  firestore().useEmulator(host, FIRESTORE_PORT);
  functions().useEmulator(host, FUNCTIONS_PORT);
}
