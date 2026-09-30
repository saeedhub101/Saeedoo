import tsParser from '@typescript-eslint/parser';

export default [
  {
    ignores: ['node_modules/**', 'out/**', 'dist/**', 'coverage/**', 'resources/**']
  },
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module'
      }
    }
  }
];
