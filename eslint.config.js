//  @ts-check

import { tanstackConfig } from '@tanstack/eslint-config'

export default [
  ...tanstackConfig,
  {
    rules: {
      'import/no-cycle': 'off',
      'import/order': 'off',
      'sort-imports': 'off',
      '@typescript-eslint/array-type': 'off',
      '@typescript-eslint/require-await': 'off',
      'pnpm/json-enforce-catalog': 'off',
    },
  },
  {
    // ARCHITECTURE.md section 3, the one boundary that matters.
    //
    //   src/console/ must never know that this application is about money.
    //
    // Two reasons, and the second is the real one. CARTRIDGE_02 reuses the
    // whole shell for free, AND it forces the metaphor to be honest: because
    // the console does not know about pools, it is genuinely a console and the
    // game is genuinely a cartridge. The architecture and the pitch agree.
    files: ['apps/web/src/console/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                '**/lib/**',
                '**/chain/**',
                '**/server/**',
                '**/game/**',
                '**/types/**',
                '../lib/*',
                '../chain/*',
                '../server/*',
                '../game/*',
                '../types/*',
                '#/lib/*',
                '#/chain/*',
                '#/server/*',
                '#/game/*',
                '#/types/*',
              ],
              message:
                'src/console/ must never know this app is about money. See ARCHITECTURE.md section 3.',
            },
          ],
        },
      ],
    },
  },
  {
    ignores: [
      'eslint.config.js',
      'prettier.config.js',
      // Agent tooling, sprite scripts, and design exploration are not app
      // source and are not covered by tsconfig, so the typed parser cannot
      // read them.
      '.claude/**',
      'graphify-out/**',
      'mockups/**',
      'tools/**',
      'contracts/**',
      'dist/**',
      'apps/*/dist/**',
      'apps/web/src/routeTree.gen.ts',
    ],
  },
]
