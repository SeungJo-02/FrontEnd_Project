// For more info, see https://github.com/storybookjs/eslint-plugin-storybook#configuration-flat-config-format
import storybook from 'eslint-plugin-storybook'

import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import eslintConfigPrettier from 'eslint-config-prettier'

export default tseslint.config(
  { ignores: ['dist'] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      // 프로덕션 코드에서 Storybook 전용 mock 데이터 import 방지
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@/mocks', '@/mocks/**'],
              message: 'mock 데이터는 프로덕션 코드에서 import하지 마세요 (Storybook/테스트 전용).',
            },
          ],
        },
      ],
    },
  },
  // 스토리·테스트 파일, 그리고 mock 모듈끼리는 mock import 허용
  // (금지 대상은 프로덕션 코드가 mock을 끌어다 쓰는 경우다)
  {
    files: ['**/*.stories.tsx', '**/*.test.ts', '**/*.test.tsx', 'src/mocks/**'],
    rules: {
      'no-restricted-imports': 'off',
    },
  },
  eslintConfigPrettier,
  storybook.configs['flat/recommended']
)
