/**
 * The instance this build of the extension talks to. See ADR-023 §2.5.
 *
 * IT IS FIXED AT BUILD TIME, the opposite of what the web did in #296, and the two do
 * not contradict each other: the web's `dist/` is served by the instance to whoever
 * arrives, so it cannot know a name; the extension is built by whoever installs it, for
 * their own instance. Asking for the origin at run time would mean declaring every
 * `https://*` host as optional — an alarming permission even if never granted — and #665
 * did not measure that WebAuthn accepts a host granted that way.
 *
 * THE NAMES DO NOT LIVE IN THE REPOSITORY. This project's instance answers to a tailnet
 * name that must not name the project (ADR-015), so they arrive through an environment
 * variable at build time, and the default is the development instance.
 */

export const DEFAULT_ORIGINS = 'http://app.evault.localhost'

/** Why a configured origin was refused, in the words the build prints. */
export class InvalidInstance extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'InvalidInstance'
  }
}

/**
 * Parses `EVAULT_EXTENSION_ORIGINS`: one origin or several, separated by commas.
 *
 * SEVERAL, because the instance answers to two names (ADR-015) and a passkey only exists
 * under the one it was registered through (#578). The first is the one the extension
 * talks to; all of them go into `host_permissions`.
 *
 * WHAT IS REFUSED, and each refusal is a way the build would otherwise produce an
 * extension that installs fine and cannot work:
 *
 * - Plain http outside `localhost`. The Web Crypto API does not exist in an insecure
 *   context (ADR-012 §4), so the vault could not even be opened. It is worded without
 *   naming the property on purpose: oneImplementation.test.ts refuses the word anywhere
 *   in the extension's code, comments included.
 * - Anything that is not a bare origin. A path or a query would be silently dropped by
 *   `new URL().origin`, and the person who wrote it would believe it was being used.
 */
export function parseOrigins(raw: string | undefined): string[] {
  const entries = (raw ?? DEFAULT_ORIGINS)
    .split(',')
    .map((entry) => entry.trim().replace(/\/+$/, ''))
    .filter(Boolean)

  if (entries.length === 0) {
    throw new InvalidInstance('EVAULT_EXTENSION_ORIGINS está vacía: hace falta al menos un origen')
  }

  const origins = entries.map((entry) => {
    let url: URL
    try {
      url = new URL(entry)
    } catch {
      throw new InvalidInstance(`«${entry}» no es una dirección`)
    }

    if (url.origin !== entry) {
      throw new InvalidInstance(`«${entry}» tiene que ser un origen sin ruta, como ${url.origin}`)
    }

    const local = url.hostname === 'localhost' || url.hostname.endsWith('.localhost')
    if (url.protocol !== 'https:' && !(url.protocol === 'http:' && local)) {
      throw new InvalidInstance(
        `«${entry}» no es https: fuera de localhost el navegador no deja cifrar y la vault no se podría abrir`,
      )
    }

    return url.origin
  })

  return [...new Set(origins)]
}
