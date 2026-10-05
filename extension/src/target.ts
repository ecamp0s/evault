/**
 * The browser this build is for, from `EVAULT_EXTENSION_BROWSER` (ADR-025 §2.8).
 *
 * WITHOUT IT, CHROME, so the build that is already installed against kastor does not
 * change by somebody forgetting a variable.
 */

export const DEFAULT_BROWSER = 'chrome'

/** The browsers this build can produce. */
export const BROWSERS = ['chrome', 'firefox'] as const
export type Browser = (typeof BROWSERS)[number]

/** Why a configured browser was refused, in the words the build prints. */
export class InvalidTarget extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'InvalidTarget'
  }
}

export function parseBrowser(raw: string | undefined): Browser {
  const name = (raw ?? DEFAULT_BROWSER).trim().toLowerCase() || DEFAULT_BROWSER

  if ((BROWSERS as readonly string[]).includes(name)) return name as Browser

  throw new InvalidTarget(`«${raw}» no es un navegador para el que se construya: ${BROWSERS.join(', ')}`)
}
