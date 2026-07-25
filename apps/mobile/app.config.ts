import type { ExpoConfig } from 'expo/config';

// Firebaseのクライアント設定ファイルはリポジトリに入れない(gitignore済み)。
// EAS Buildではfile型の環境変数として渡され、その値は展開後の実ファイルパス。
// ローカルでは開発者が手元に置いたファイルを直接使う。
const googleServicesJson = process.env.GOOGLE_SERVICES_JSON ?? './google-services.json';
const googleServicesPlist = process.env.GOOGLE_SERVICES_PLIST ?? './GoogleService-Info.plist';

const config: ExpoConfig = {
  name: 'Soroe',
  slug: 'soroe',
  version: '1.0.0',
  orientation: 'portrait',
  icon: './assets/images/icon.png',
  scheme: 'soroe',
  userInterfaceStyle: 'automatic',
  ios: {
    icon: './assets/expo.icon',
    bundleIdentifier: 'com.soroe.app',
    googleServicesFile: googleServicesPlist,
    usesAppleSignIn: true,
    // 招待URL(NAV-001)。soroe.appはドメイン確定までのプレースホルダ(#8)。
    associatedDomains: ['applinks:soroe.app'],
  },
  android: {
    package: 'com.soroe.app',
    googleServicesFile: googleServicesJson,
    adaptiveIcon: {
      backgroundColor: '#E6F4FE',
      foregroundImage: './assets/images/android-icon-foreground.png',
      backgroundImage: './assets/images/android-icon-background.png',
      monochromeImage: './assets/images/android-icon-monochrome.png',
    },
    predictiveBackGestureEnabled: false,
    intentFilters: [
      {
        action: 'VIEW',
        autoVerify: true,
        data: [{ scheme: 'https', host: 'soroe.app', pathPrefix: '/invite' }],
        category: ['BROWSABLE', 'DEFAULT'],
      },
    ],
  },
  web: {
    output: 'static',
    favicon: './assets/images/favicon.png',
  },
  plugins: [
    'expo-router',
    [
      'expo-splash-screen',
      {
        backgroundColor: '#208AEF',
        image: './assets/images/splash-icon.png',
        imageWidth: 76,
      },
    ],
    '@react-native-firebase/app',
    '@react-native-firebase/auth',
    '@react-native-firebase/crashlytics',
    '@react-native-firebase/analytics',
    'expo-font',
    '@react-native-google-signin/google-signin',
    'expo-web-browser',
  ],
  experiments: {
    typedRoutes: true,
    reactCompiler: true,
  },
  extra: {
    router: {},
    eas: {
      projectId: '55e76d83-ba15-45f4-bb98-ec1c43976874',
    },
  },
  owner: 'starfystarfys-team',
};

export default config;
