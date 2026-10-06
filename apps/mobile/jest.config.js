module.exports = {
  preset: 'jest-expo',
  // 画面の描画テストはデザインシステム・SVG・ルーターなど重いモジュールを読み込む。CIのように
  // Babelの変換キャッシュが無い冷えた状態では、ファイル内の最初のテストだけで既定の5秒を
  // 超えることがあるため、余裕を持たせる(上限であり、通常のテストの所要時間は変わらない)。
  testTimeout: 30000,
  moduleNameMapper: {
    '^@/assets/(.*)$': '<rootDir>/assets/$1',
    '^@/(.*)$': '<rootDir>/src/$1',
    '^react-native-worklets$': require.resolve('react-native-worklets/lib/module/mock'),
    '\\.css$': '<rootDir>/jest/css-mock.js',
    '^@react-native-async-storage/async-storage$':
      '@react-native-async-storage/async-storage/jest/async-storage-mock',
  },
};
