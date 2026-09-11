import js from '@eslint/js'
import globals from 'globals'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.ts'],
    extends: [js.configs.recommended, tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
    },
    rules: {
      /*
       * ONE CRYPTOGRAPHIC IMPLEMENTATION, and this rule is what keeps it that way.
       * ADR-023 §2.8: the extension imports web/src/lib/vault and does not copy it,
       * because two copies of crypto.ts diverge and the one left behind encrypts wrong
       * with authority. Any `.subtle` written here is a second implementation starting.
       *
       * A selector and not `no-restricted-properties`, because that one only matches the
       * object by name: `crypto.subtle` would be caught and `window.crypto.subtle` or
       * `globalThis.crypto.subtle` would not. And the selector names both shapes of the
       * property, because `window.crypto['subtle']` is a literal and not a name — it got
       * past the first version of this rule when that was tried on purpose.
       */
      'no-restricted-syntax': [
        'error',
        {
          selector: "MemberExpression[property.name='subtle'], MemberExpression[property.value='subtle']",
          message:
            'La extensión no llama a crypto.subtle: importa la criptografía de web/src/lib/vault (ADR-023 §2.8).',
        },
      ],
    },
  },
])
