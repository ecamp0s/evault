/**
 * Clears out the storage keys this application no longer uses.
 *
 * WHY IT EXISTS AT ALL, since renaming a key already makes the old one unreachable: an
 * unreachable key is not a gone key. It stays in the browser for as long as the browser
 * does, holding a name and an email nobody will read again — and «nobody will read it
 * again» is exactly the argument that leaves data lying around for years.
 *
 * IT DOES NOT MIGRATE, AND THAT IS THE DECISION OF #476. Reading the old key to copy its
 * value into the new one would drag along the very names the rename retired, and would
 * have to be kept forever to be worth anything. The cost of not migrating is one login:
 * the unlock screen stops remembering the email, and the generator and sort preferences
 * go back to their defaults. No secret is lost, because none was ever stored here —
 * neither the token nor the vault key is persisted. See ADR-007.
 *
 * IT RUNS ONCE PER LOAD AND COSTS NOTHING once the keys are gone: `removeItem` on a key
 * that does not exist is not an error in any browser.
 *
 * THIS LIST ONLY GROWS WHEN A KEY IS RETIRED, never when one is added. If it is ever
 * empty again, delete the module rather than leaving an empty ritual behind.
 */

/** Retired in #476, when the persisted keys were settled in English. */
const RETIRED = ['evault.sesion', 'evault.generador', 'evault.orden', 'evault.sinred']

export function clearRetiredStorage(): void {
  for (const key of RETIRED) {
    try {
      localStorage.removeItem(key)
    } catch {
      /*
       * A browser with storage blocked throws on the access itself. Tidying up is the
       * least important thing this application does, so it must never be the reason it
       * fails to start.
       */
    }
  }
}
