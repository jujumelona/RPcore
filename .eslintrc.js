module.exports = {
  env: {
    es2021: true,
    node: true,
    browser: true,
  },
  globals: {
    __DEV__: 'readonly',
    RequestInit: 'readonly',
    RequestInfo: 'readonly',
    React: 'readonly',
    Typo: 'readonly',
    Language: 'readonly',
    UserSetting: 'readonly',
    LEGACY_DRAFT_PREFIX: 'readonly',
    LEGACY_DRAFT_PREFIXES: 'readonly',
    DRAFT_KEY_PREFIX: 'readonly',
    LoadRequest: 'readonly',
    LoadResult: 'readonly',
    ErrorUtils: 'readonly',
    URLSearchParams: 'readonly',
    ChatSession: 'writable',
    jest: 'readonly',
    beforeAll: 'readonly',
    afterAll: 'readonly',
  },
  extends: [
    'eslint:recommended',
  ],
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2021,
    sourceType: 'module',
    ecmaFeatures: {
      jsx: true,
    },
  },
  plugins: ['@typescript-eslint'],
  rules: {
    'no-empty': 'warn',
    'no-irregular-whitespace': 'warn',
    'no-constant-condition': 'warn',
    'no-prototype-builtins': 'warn',
    'no-useless-escape': 'warn',
    'no-redeclare': 'warn',
    'no-useless-catch': 'warn',
    // 규칙 정의 오류 무시
    'react-hooks/exhaustive-deps': 'off',
    'react-hooks/rules-of-hooks': 'off',
    'react/no-unstable-nested-components': 'off',
    'react-native/no-inline-styles': 'off',
    // ⛔ useChat은 AI 추론이 없는 deprecated 스텁입니다.
    //    useChatLogic 또는 useInference를 사용하세요.
    'no-restricted-imports': [
      'error',
      {
        paths: [
          {
            name: '../hooks/useChat',
            message: '[useChat] DEPRECATED: useChatLogic 또는 useInference를 사용하세요.',
          },
          {
            name: './hooks/useChat',
            message: '[useChat] DEPRECATED: useChatLogic 또는 useInference를 사용하세요.',
          },
          {
            name: 'src/hooks/useChat',
            message: '[useChat] DEPRECATED: useChatLogic 또는 useInference를 사용하세요.',
          },
        ],
      },
    ],
    'no-unused-vars': 'off',
    '@typescript-eslint/no-unused-vars': 'off',
    'no-console': 'off',
  },
};
