module.exports = {
  testEnvironment: 'node',
  setupFiles: ['<rootDir>/__tests__/setup/jest.setup.ts'],
  testMatch: ['**/__tests__/**/*.test.ts', '**/__tests__/**/*.test.tsx'],
  moduleNameMapper: {
    'react-native-mmkv':           '<rootDir>/__tests__/mocks/mmkv.mock.ts',
    'expo-file-system':            '<rootDir>/__tests__/mocks/expo-fs.mock.ts',
    'expo-file-system/legacy':     '<rootDir>/__tests__/mocks/expo-fs.mock.ts',
    'expo-secure-store':           '<rootDir>/__tests__/mocks/rn-config.mock.ts',
    'expo-crypto':                 '<rootDir>/__tests__/mocks/rn-config.mock.ts',
    '^@op-engineering/op-sqlite$':  '<rootDir>/__tests__/mocks/sqlite.mock.ts',
    '^@kesha-antonov/react-native-background-downloader$': '<rootDir>/__tests__/mocks/blank.mock.ts',
    '^react-native-device-info$':   '<rootDir>/__tests__/mocks/blank.mock.ts',
    '^react-native-blob-util$':     '<rootDir>/__tests__/mocks/blank.mock.ts',
    '^@react-native-community/netinfo$': '<rootDir>/__tests__/mocks/blank.mock.ts',
    '^expo-constants$':            '<rootDir>/__tests__/mocks/blank.mock.ts',
    '^expo-modules-core$':         '<rootDir>/__tests__/mocks/blank.mock.ts',
    '^@react-native-google-signin/google-signin$': '<rootDir>/__tests__/mocks/blank.mock.ts',
    '@react-native-firebase/(.*)': '<rootDir>/__tests__/mocks/firebase.mock.ts',
    'react-native-config':         '<rootDir>/__tests__/mocks/rn-config.mock.ts',
    '^react-native$':              '<rootDir>/__tests__/mocks/react-native.mock.ts',
  },
  transformIgnorePatterns: [
    'node_modules/(?!(jest-)?react-native|@react-native|expo|@expo|@unimodules|react-clone-referenced-element|@react-navigation)',
  ],
  transform: {
    '^.+\\.(ts|tsx)$': ['ts-jest', { tsconfig: { jsx: 'react' } }],
  },
  collectCoverageFrom: [
    'src/core/llama/KVCacheManager.ts',
    'src/store/chatStore.ts',
  ],
  coverageThreshold: { global: { lines: 70, functions: 70 } },
};
