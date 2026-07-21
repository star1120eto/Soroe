module.exports = {
  preset: 'jest-expo',
  moduleNameMapper: {
    '^react-native-worklets$': require.resolve('react-native-worklets/lib/module/mock'),
    '\\.css$': '<rootDir>/jest/css-mock.js',
  },
};
