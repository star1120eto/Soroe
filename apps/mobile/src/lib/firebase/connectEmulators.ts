import auth from "@react-native-firebase/auth";
import firestore from "@react-native-firebase/firestore";
import functions from "@react-native-firebase/functions";

import { Platform } from "react-native";

import { env } from "@/config/env";

// EXPO_PUBLIC_FIREBASE_EMULATOR_HOSTが設定されているときだけEmulatorへ向ける。
// Cloud FunctionsのデプロイにはBlazeプランが必要なため、Sparkプランのままでも
// requestEmailOtp/verifyEmailOtp(AUTH-004)をローカル検証できるようにしている。
// portはfirebase.jsonのemulators設定と揃えること。
const AUTH_PORT = 9099;
const FIRESTORE_PORT = 8080;
const FUNCTIONS_PORT = 5001;

// Firebase SDK(Web)はAuth Emulatorへ接続すると「Running in emulator mode」の帯を画面下に
// 固定表示する。画面下のタブバーや入力欄に被って操作できなくなるため、Webでは隠す
// (Emulator接続であることは、このファイルの接続先設定とEMULATOR_HOST環境変数で分かる)。
function hideWebEmulatorBanner() {
  if (Platform.OS !== "web" || typeof document === "undefined") {
    return;
  }
  const style = document.createElement("style");
  style.textContent = ".firebase-emulator-warning { display: none !important; }";
  document.head.appendChild(style);
}

export function connectEmulators() {
  const host = env.EXPO_PUBLIC_FIREBASE_EMULATOR_HOST;
  if (!host) {
    return;
  }

  hideWebEmulatorBanner();
  auth().useEmulator(`http://${host}:${AUTH_PORT}`);
  firestore().useEmulator(host, FIRESTORE_PORT);
  functions().useEmulator(host, FUNCTIONS_PORT);
}
