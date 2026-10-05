/**
 * Firefox's extension namespace, typed with Chrome's declarations.
 *
 * The part the extension uses —`tabs`, `scripting`, `storage.local`— has the same shape
 * in both, and Firefox's `browser` returns promises where Chrome's types say they do.
 * platformBoundary.test.ts keeps it inside src/platform/firefox/ all the same.
 */
declare const browser: typeof chrome
