import js from '@eslint/js'
import globals from 'globals'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.ts'],
    ignores: ['**/*.test.ts'],
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
        /*
         * The vault key travels between the popup, the worker and the offscreen document
         * over BroadcastChannel, which clones a non-extractable CryptoKey intact.
         * `sendMessage` serialises to JSON, where a CryptoKey is `{}`, so using it for the
         * key would mean taking the key out raw first (ADR-023 §4). The extension has one
         * messaging mechanism, and this keeps it that way.
         */
        {
          selector: "MemberExpression[property.name='sendMessage']",
          message:
            'La extensión se comunica por BroadcastChannel: sendMessage serializa a JSON y no puede llevar la clave (ADR-023 §4).',
        },
      ],
    },
  },
  /*
   * The tests, without the two restrictions above. They are not shipped, and they need
   * WebCrypto to make the keys the shipped code is tested with — the same line
   * oneImplementation.test.ts draws when it searches only the files that are not tests.
   */
  {
    files: ['**/*.test.ts'],
    extends: [js.configs.recommended, tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: 2022,
      globals: { ...globals.browser, ...globals.node },
    },
  },
])
